import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import {
  getCardsForObject,
  getCardsForParent,
  removeCardFromPage
} from '@/services/cards';
import { getChildPages, getPagesForCards, sharePages } from '@/services/pages';
import { waitForCards } from '@/utils/cardHelpers';
import { getValidTabForInstance } from '@/utils/currentObject';
import { waitForChildPages } from '@/utils/pageHelpers';
import { getSidepanelData } from '@/utils/sidepanel';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { DataList } from './DataList';

export function GetPagesView({
  currentContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [pageData, setPageData] = useState(null); // Store metadata for rebuilding
  const [pageTypeLabel, setPageTypeLabel] = useState('pages');

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadPagesData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadPagesData = async (forceRefresh = false) => {
    if (!forceRefresh && !isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    // Delay showing spinner to avoid flash on quick loads
    const spinnerTimer = !forceRefresh
      ? setTimeout(() => {
          setShowSpinner(true);
        }, 200)
      : null;

    try {
      // Get the stored page data from local storage
      const data = await getSidepanelData();
      console.log('Loaded sidepanel data:', data);
      if (
        !data ||
        (data.type !== 'getChildPages' &&
          data.type !== 'getCardPages' &&
          data.type !== 'childPagesWarning')
      ) {
        setError('No page data found. Please try again from a page URL.');
        setIsLoading(false);
        return;
      }

      if (data.type === 'getCardPages' && data.scope === 'parent') {
        await loadParentScopeCardPages(data);
        return;
      }

      // Derive all values from currentContext - no duplication needed
      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const sidepanelType = data.type;

      // For card pages, always use the object's own ID (not parent).
      // parentId would be a dataflow/stream ID for DATA_SOURCE, which is wrong for card lookups.
      const objectId =
        sidepanelType === 'getCardPages' ? domoObject.id : domoObject.parentId || domoObject.id;
      const objectName =
        sidepanelType === 'getCardPages'
          ? domoObject.metadata?.name ||
            domoObject.metadata?.parent?.name ||
            `${domoObject.typeName} ${objectId}`
          : domoObject.metadata?.parent?.name ||
            domoObject.metadata?.name ||
            `${domoObject.typeName} ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      // Get appId for DATA_APP_VIEW types (stored as parentId in domoObject)
      const appId =
        objectType === 'DATA_APP_VIEW'
          ? domoObject.parentId || domoObject?.metadata?.parent?.id || domoObject.id
          : null;

      // Set label early so the loading spinner shows the right text
      setPageTypeLabel(
        sidepanelType === 'getCardPages'
          ? objectType === 'CARD' || objectType === 'DATA_SOURCE' || objectType === 'DATAFLOW_TYPE'
            ? 'Pages'
            : 'Card Pages'
          : objectType === 'DATA_APP_VIEW'
            ? 'App Pages'
            : 'Child Pages'
      );

      // Read initial data from the appropriate sidepanel data property
      let childPages = sidepanelType === 'getCardPages' ? data.cardPages : data.childPages;
      let cardsByPage = data.cardsByPage;

      if (!childPages && !forceRefresh) {
        // No pre-fetched data (popup handoff)
        if (sidepanelType === 'getCardPages') {
          if (
            objectType === 'PAGE' ||
            objectType === 'DATA_APP_VIEW' ||
            objectType === 'WORKSHEET_VIEW'
          ) {
            // Page-like types — get cards then find other pages they appear on
            const waitResult = await waitForCards(context);
            if (waitResult.success && waitResult.cards?.length) {
              const tabId = await getValidTabForInstance(instance);
              const result = (await getPagesForCards(
                waitResult.cards.map((card) => card.id),
                tabId
              )) ?? { cardsByPage: {}, pages: [] };
              const stringId = String(objectId);
              childPages = result.pages
                .filter((page) => String(page.id) !== stringId)
                .map((page) => ({
                  appId: page.appId || null,
                  appName: page.appName || null,
                  pageId: page.id,
                  pageTitle: page.name,
                  pageType: page.type
                }));
              cardsByPage = result.cardsByPage;
            }
          }
          // CARD, DATA_SOURCE, DATAFLOW_TYPE — fall through to fetchFreshPages
        } else {
          // getChildPages or childPagesWarning — background-cached hierarchical children
          const waitResult = await waitForChildPages(context);
          if (waitResult.success) {
            childPages = waitResult.childPages;
          }
        }
        // If still no data, fetch fresh
        if (!childPages) {
          const freshData = await fetchFreshPages({
            appId,
            instance,
            metadata: domoObject.metadata,
            objectId,
            objectType,
            sidepanelType
          });
          childPages = freshData.childPages;
          cardsByPage = freshData.cardsByPage;
        }
      }

      if (forceRefresh) {
        const freshData = await fetchFreshPages({
          appId,
          instance,
          metadata: domoObject.metadata,
          objectId,
          objectType,
          sidepanelType
        });
        childPages = freshData.childPages;
        cardsByPage = freshData.cardsByPage;
      }

      // Cache card pages on background context so activity log can reuse them
      if (sidepanelType === 'getCardPages' && childPages?.length > 0) {
        chrome.runtime
          .sendMessage({
            contextUpdates: {
              cardPages: childPages.map((p) => ({
                appId: p.appId,
                appName: p.appName,
                id: p.pageId,
                name: p.pageTitle,
                type: p.pageType
              }))
            },
            tabId: context.tabId,
            type: 'UPDATE_CONTEXT_METADATA'
          })
          .catch(() => {});
      }

      if (!childPages || !childPages.length) {
        if (!mountedRef.current) return;
        const message =
          sidepanelType === 'getCardPages'
            ? objectType === 'CARD'
              ? `No pages found for card ${objectId}`
              : objectType === 'DATA_SOURCE'
                ? `No pages found for cards using dataset **${objectName}**`
                : `Cards on ${objectName} are not used on any other pages`
            : objectType === 'DATA_APP_VIEW'
              ? `No views (pages) found for app studio app ${objectId}`
              : `No child pages found for page ${objectId}`;
        onStatusUpdate?.('No Pages Found', message, 'warning');
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      // Store metadata for rebuilding items later (including instance for refresh)
      setPageData({
        appId,
        instance,
        objectId,
        objectName,
        objectType,
        origin,
        sidepanelType,
        userId: context.user?.id
      });

      setError(null);

      if (sidepanelType === 'getCardPages') {
        const transformedItems = transformGroupedPagesData(childPages, origin, cardsByPage);
        setItems(transformedItems);
      } else {
        // Normal PAGE or DATA_APP_VIEW data - use existing logic
        // Separate children and grandchildren based on parentPageId
        const children = childPages.filter((page) =>
          objectType === 'DATA_APP_VIEW' ? true : String(page.parentPageId) === String(objectId)
        );

        // Build items structure with all pages at once
        buildItemsFromPages({
          childPages,
          objectId,
          objectName,
          objectType,
          origin,
          pages: children
        });
      }

      // If this is a childPagesWarning, show the warning status only if not already shown
      if (data.type === 'childPagesWarning' && onStatusUpdate && !data.statusShown) {
        onStatusUpdate(
          'Cannot Delete Page',
          `This page has **${childPages.length} child page${childPages.length !== 1 ? 's' : ''}**. Please delete or reassign the child pages first.`,
          'warning',
          0 // No timeout - user must dismiss manually
        );
      }
    } catch (err) {
      console.error('Error loading pages:', err);
      setError(err.message || 'Failed to load child pages');
    } finally {
      if (spinnerTimer) clearTimeout(spinnerTimer);
      if (!forceRefresh) {
        setIsLoading(false);
        setShowSpinner(false);
      }
    }
  };

  const loadParentScopeCardPages = async (data) => {
    const context = DomoContext.fromJSON(data.currentContext);
    const childTypeId = context.domoObject.typeId;
    const parentTypeId =
      childTypeId === 'WORKSHEET_VIEW' ? 'WORKSHEET' : 'DATA_APP';
    const parentId = data.parentId || context.domoObject.parentId;
    const instance = context.instance;
    const origin = `https://${instance}.domo.com`;
    const parentLabel = parentTypeId === 'WORKSHEET' ? 'worksheet' : 'app';

    if (!parentId) {
      setError('Could not determine parent ID.');
      return;
    }

    setPageTypeLabel('Card Pages');

    const tabId = await getValidTabForInstance(instance);
    const { parentName, viewGroups } = await getCardsForParent({
      parentId,
      tabId
    });

    // Aggregate and dedupe card IDs across all views.
    const cardIdSet = new Set();
    for (const vg of viewGroups) {
      for (const card of vg.cards) {
        if (card?.id != null) cardIdSet.add(card.id);
      }
    }
    const cardIds = [...cardIdSet];

    if (cardIds.length === 0) {
      onStatusUpdate?.(
        'No Cards Found',
        `No cards found across any view on this ${parentLabel}.`,
        'warning',
        3000
      );
      onBackToDefault?.();
      return;
    }

    const result = (await getPagesForCards(cardIds, tabId)) ?? {
      cardsByPage: {},
      pages: []
    };

    // Exclude views inside the parent app/worksheet -- the user wants OTHER
    // pages, not other views within the same app.
    const stringParentId = String(parentId);
    const childPages = result.pages
      .filter((page) => String(page.appId) !== stringParentId)
      .map((page) => ({
        appId: page.appId || null,
        appName: page.appName || null,
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type
      }));

    if (childPages.length === 0) {
      onStatusUpdate?.(
        'No Pages Found',
        `Cards on this ${parentLabel} are not used on any other pages.`,
        'warning'
      );
      onBackToDefault?.();
      return;
    }

    setPageData({
      appId: null,
      instance,
      objectId: parentId,
      objectName: parentName,
      objectType: parentTypeId,
      origin,
      sidepanelType: 'getCardPages',
      userId: context.user?.id
    });

    setError(null);
    setItems(
      transformGroupedPagesData(childPages, origin, result.cardsByPage)
    );
  };

  /**
   * Fetch fresh pages data from API based on sidepanel type and object type.
   * Dynamically finds a valid tab on the same Domo instance for API calls.
   */
  const fetchFreshPages = async ({
    appId,
    instance,
    metadata,
    objectId,
    objectType,
    sidepanelType
  }) => {
    const tabId = await getValidTabForInstance(instance);

    if (sidepanelType === 'getCardPages') {
      let cardIds;

      if (objectType === 'CARD') {
        cardIds = [objectId];
      } else {
        const cards = await getCardsForObject({
          metadata,
          objectId,
          objectType,
          tabId
        });

        if (!cards || !cards.length) return { cardsByPage: {}, childPages: [] };
        cardIds = cards.map((card) => card.id);
      }

      // Treat null result the same as empty — keeps the UI stable if the
      // executeInPage bridge nulls out (script timeout, OOM, transient errors).
      const result = (await getPagesForCards(cardIds, tabId)) ?? {
        cardsByPage: {},
        pages: []
      };
      const { cardsByPage, pages } = result;

      // For page-like types, filter out the current page
      const excludeSelf = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'].includes(objectType);
      const stringId = String(objectId);
      const childPages = pages
        .filter((page) => !excludeSelf || String(page.id) !== stringId)
        .map((page) => ({
          appId: page.appId || null,
          appName: page.appName || null,
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type
        }));

      return { cardsByPage, childPages };
    }

    // getChildPages / childPagesWarning — hierarchical children
    if (objectType === 'PAGE') {
      const childPages = await getChildPages({
        includeGrandchildren: true,
        pageId: objectId,
        pageType: 'PAGE',
        tabId
      });
      return { childPages };
    } else if (objectType === 'DATA_APP_VIEW' || objectType === 'WORKSHEET_VIEW') {
      const childPages = await getChildPages({
        appId,
        pageId: objectId,
        pageType: objectType,
        tabId
      });
      return { childPages };
    }

    return { childPages: [] };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadPagesData(true); // Force fresh API call
      onStatusUpdate?.('Refreshed', 'Page data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const buildItemsFromPages = ({
    childPages,
    objectId,
    objectName: _objectName,
    objectType,
    origin,
    pages
  }) => {
    // Sort pages by title
    const sortedPages = (pages || []).sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));

    // Determine the typeId for pages based on the parent object type
    const pageTypeId = objectType === 'DATA_APP_VIEW' ? 'DATA_APP_VIEW' : 'PAGE';
    const parentId = objectType === 'DATA_APP_VIEW' ? objectId : null;

    // Build items array - just the child pages
    const childItems = sortedPages?.map((page) => {
      // Filter child pages by parentPageId
      const childPagesForPage = childPages.filter(
        (childPage) => childPage.parentPageId === page.pageId
      );

      const nestedChildren =
        childPagesForPage.length > 0
          ? childPagesForPage
              .sort((a, b) => a.pageTitle.localeCompare(b.pageTitle))
              .map((childPage) => {
                const domoObject = new DomoObject(
                  pageTypeId,
                  childPage.pageId,
                  origin,
                  { name: childPage.pageTitle },
                  null,
                  parentId
                );
                return DataListItem.fromDomoObject(domoObject);
              })
          : undefined;

      const domoObject = new DomoObject(
        pageTypeId,
        page.pageId,
        origin,
        { name: page.pageTitle },
        null,
        parentId
      );
      return DataListItem.fromDomoObject(domoObject, {
        children: nestedChildren,
        count: childPagesForPage.length
      });
    });

    setItems(childItems);
  };

  const handleItemRemove = async (item) => {
    try {
      await removeCardFromPage({
        cardId: pageData?.objectId,
        pageId: item.id,
        tabId: await getValidTabForInstance(pageData.instance)
      });
      onStatusUpdate?.(
        'Removed',
        `Card removed from page **${item.label || item.id}**`,
        'success',
        2000
      );
      await loadPagesData(true); // Force fresh API call
    } catch (err) {
      console.error('[GetPagesView] Error in remove action:', err);
      onStatusUpdate?.('Error', err.message || 'Failed to remove', 'danger', 3000);
    }
  };

  /**
   * Handle share item action (custom - page specific)
   */
  const handleItemShare = async (actionType, item) => {
    try {
      if (pageData?.instance) {
        const tabId = await getValidTabForInstance(pageData.instance);
        await sharePages({
          pageIds: [item.id],
          tabId,
          userId: pageData.userId
        });
        onStatusUpdate?.(
          'Shared',
          `Page **${item.label || item.id}** shared with yourself`,
          'success',
          2000
        );
      }
    } catch (err) {
      console.error('[GetPagesView] Error in share action:', err);
      onStatusUpdate?.('Error', err.message || 'Failed to share', 'danger', 3000);
    }
  };

  /**
   * Handle shareAll item action (custom - page specific)
   */
  const handleItemShareAll = async (actionType, item) => {
    try {
      if (pageData?.instance && item.children) {
        const tabId = await getValidTabForInstance(pageData.instance);
        const pageIds = [item.id, ...item.children.map((child) => child.id)];
        const count = pageIds.length;
        await sharePages({
          pageIds,
          tabId,
          userId: pageData.userId
        });
        onStatusUpdate?.(
          'Shared',
          `**${count}** page${count !== 1 ? 's' : ''} shared with yourself`,
          'success',
          2000
        );
      }
    } catch (err) {
      console.error('[GetPagesView] Error in shareAll action:', err);
      onStatusUpdate?.('Error', err.message || 'Failed to share', 'danger', 3000);
    }
  };

  /**
   * Handle shareAll header action (custom - page specific)
   */
  const handleShareAll = async () => {
    try {
      if (pageData?.instance) {
        const tabId = await getValidTabForInstance(pageData.instance);

        // Collect all shareable page IDs, excluding cards, virtual parents, and negative IDs
        const collectPageIds = (itemList) => {
          const ids = [];
          for (const item of itemList) {
            if (!item.isVirtualParent && item.typeId !== 'CARD' && Number(item.id) >= 0) {
              ids.push(item.id);
            }
            if (item.children) {
              ids.push(...collectPageIds(item.children));
            }
          }
          return ids;
        };

        const pageIds = collectPageIds(items);

        if (pageData.objectType === 'PAGE') {
          pageIds.unshift(pageData.objectId);
        }

        const count = pageIds.length;

        await sharePages({
          pageIds,
          tabId,
          userId: pageData.userId
        });
        onStatusUpdate?.(
          'Shared',
          `**${count}** page${count !== 1 ? 's' : ''} shared with yourself`,
          'success',
          2000
        );
        chrome.tabs.reload(tabId);
      }
    } catch (err) {
      console.error('[GetPagesView] Error in shareAll header action:', err);
      onStatusUpdate?.('Error', err.message || 'Failed to share', 'danger', 3000);
    }
  };

  const renderTitle = () =>
    `${pageTypeLabel}${pageTypeLabel.endsWith('on') ? '' : ' for'} **${pageData?.objectName}**`;

  const renderSubtext = () => {
    if (items.length === undefined) return null;

    if (pageData?.sidepanelType === 'getCardPages') {
      const pageTypes = new Set([
        'DATA_APP_VIEW',
        'PAGE',
        'REPORT_BUILDER_VIEW',
        'WORKSHEET_VIEW'
      ]);
      const cardIds = new Set();
      const tally = (list) => {
        let pages = 0;
        for (const item of list || []) {
          if (item.typeId === 'CARD') cardIds.add(item.id);
          else if (pageTypes.has(item.typeId)) pages++;
          if (item.children?.length) {
            pages += tally(item.children);
          }
        }
        return pages;
      };
      const pages = tally(items);
      const cards = cardIds.size;
      if (!pages) return null;
      let text = `${pages} page${pages === 1 ? '' : 's'}`;
      if (cards > 0) {
        text += ` • ${cards} card${cards === 1 ? '' : 's'}`;
      }
      return text;
    }

    const grandchildCount = items.reduce(
      (total, item) => total + (item.children?.length || 0),
      0
    );
    const pageLabel = pageData?.objectType === 'PAGE' ? 'child page' : 'page';
    let text = `${items.length} ${pageLabel}${items.length === 1 ? '' : 's'}`;
    if (grandchildCount > 0) {
      text += ` • ${grandchildCount} grandchild ${grandchildCount === 1 ? 'page' : 'pages'}`;
    }
    return text;
  };
  if (isLoading) {
    if (!showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading {pageTypeLabel}...</p>
        </Card.Content>
      </Card>
    );
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadPagesData();
    setIsRetrying(false);
  };

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator>
          <IconExclamationTriangle data-slot='alert-default-icon' />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button isPending={isRetrying} size='sm' onPress={handleRetry}>
              {isRetrying ? (
                <Spinner color='currentColor' size='sm' />
              ) : (
                <IconSync />
              )}
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton className='rounded-full' variant='ghost' onPress={() => onBackToDefault?.()} />
      </Alert>
    );
  }

  return (
    <DataList
      closeLabel={`Close ${pageTypeLabel} View`}
      currentContext={currentContext}
      isRefreshing={isRefreshing}
      itemLabel='page'
      items={items}
      objectId={pageData?.objectId}
      objectType={pageData?.objectType}
      showActions={true}
      showCounts={true}
      subtext={renderSubtext()}
      title={renderTitle()}
      viewType={pageData?.sidepanelType}
      onClose={onBackToDefault}
      onItemRemove={handleItemRemove}
      onItemShare={handleItemShare}
      onItemShareAll={handleItemShareAll}
      onRefresh={handleRefresh}
      onShareAll={handleShareAll}
      onStatusUpdate={onStatusUpdate}
      headerActions={
        pageData?.objectType === 'DATA_APP_VIEW' && pageData?.sidepanelType !== 'getCardPages'
          ? ['openAll', 'copy', 'reload', 'refresh']
          : ['openAll', 'copy', 'shareAll', 'reload', 'refresh']
      }
      itemActions={
        pageData?.sidepanelType === 'getCardPages'
          ? ['openAll', 'copy', 'remove', 'share', 'shareAll']
          : undefined
      }
    />
  );
}

/**
 * Build card DataListItem children for a page from the cardsByPage mapping
 * @param {string|number} pageId - The page ID to look up
 * @param {Object} cardsByPage - Mapping of pageId -> [{ id, name }]
 * @param {string} origin - The base URL origin
 * @param {string} [pageType] - The page type (e.g., 'PAGE', 'DATA_APP_VIEW')
 * @param {string|number} [parentId] - The parent ID (e.g., appId for DATA_APP_VIEW)
 * @returns {DataListItem[]|undefined} Array of card items, or undefined if none
 */
function buildCardChildren(pageId, cardsByPage, origin, pageType, parentId) {
  const cards = cardsByPage?.[String(pageId)];
  if (!cards || !cards.length) return undefined;

  return cards
    .sort((a, b) => (a.name || '').trim().localeCompare((b.name || '').trim()))
    .map((card) => {
      const domoObject = new DomoObject('CARD', card.id, origin, {
        name: (card.name || '').trim()
      });
      // Override generic card URL with page-specific URL
      if (pageType === 'DATA_APP_VIEW' || pageType === 'WORKSHEET_VIEW') {
        domoObject.url = `${origin}/app-studio/${parentId}/pages/${pageId}/kpis/details/${card.id}`;
      } else if (pageType === 'PAGE') {
        domoObject.url = `${origin}/page/${pageId}/kpis/details/${card.id}`;
      }
      return DataListItem.fromDomoObject(domoObject);
    });
}

/**
 * Transform grouped pages data into hierarchical structure
 * For CARD and DATA_SOURCE types, childPages is a flat array with pageType property
 * We group by pageType and create virtual parent items
 * For App Studio pages, we create a nested hierarchy: App Studio Apps > App > Pages
 * @param {Array} childPages - Array of page objects
 * @param {string} origin - The base URL origin
 * @param {Object} [cardsByPage] - Optional mapping of pageId -> [{ id, name }] for card children
 */
function transformGroupedPagesData(childPages, origin, cardsByPage) {
  if (!childPages || !childPages.length) return [];

  // Group pages by pageType
  const pagesByType = {
    DATA_APP_VIEW: [],
    PAGE: [],
    REPORT_BUILDER_VIEW: [],
    WORKSHEET_VIEW: []
  };

  childPages.forEach((page) => {
    const type = page.pageType;
    if (pagesByType[type]) {
      pagesByType[type].push(page);
    }
  });

  const items = [];

  // Handle App Studio pages - group by app first
  if (pagesByType.DATA_APP_VIEW.length > 0) {
    // Group pages by appId
    const pagesByApp = new Map();
    pagesByType.DATA_APP_VIEW.forEach((page) => {
      const appId = page.appId;
      if (!pagesByApp.has(appId)) {
        pagesByApp.set(appId, {
          appName: page.appName || `App ${appId}`,
          pages: []
        });
      }
      pagesByApp.get(appId).pages.push(page);
    });

    // Create app children with their pages nested inside
    const appChildren = Array.from(pagesByApp.entries())
      .sort(([, a], [, b]) => a.appName.localeCompare(b.appName))
      .map(([appId, { appName, pages }]) => {
        const sortedPages = pages.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));

        const pageChildren = sortedPages.map((page) => {
          const cardChildren = buildCardChildren(
            page.pageId,
            cardsByPage,
            origin,
            'DATA_APP_VIEW',
            appId
          );
          const domoObject = new DomoObject(
            'DATA_APP_VIEW',
            page.pageId,
            origin,
            { name: page.pageTitle },
            null,
            appId
          );
          return DataListItem.fromDomoObject(domoObject, {
            children: cardChildren,
            count: cardChildren?.length,
            countLabel: cardChildren ? 'cards' : null
          });
        });

        const appDomoObject = new DomoObject('DATA_APP', appId, origin, {
          name: appName
        });
        return DataListItem.fromDomoObject(appDomoObject, {
          children: pageChildren,
          count: pageChildren.length
        });
      });

    items.push(
      DataListItem.createGroup({
        children: appChildren,
        id: 'DATA_APP_group',
        label: 'App Studio Apps',
        metadata: `${pagesByApp.size} app${pagesByApp.size !== 1 ? 's' : ''}, ${pagesByType.DATA_APP_VIEW.length} page${pagesByType.DATA_APP_VIEW.length !== 1 ? 's' : ''}`
      })
    );
  }

  // Handle dashboards (regular/old pages)
  if (pagesByType.PAGE.length > 0) {
    const sortedPages = pagesByType.PAGE.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));

    const children = sortedPages.map((page) => {
      const cardChildren = buildCardChildren(page.pageId, cardsByPage, origin, 'PAGE');
      const domoObject = new DomoObject('PAGE', page.pageId, origin, {
        name: page.pageTitle
      });
      return DataListItem.fromDomoObject(domoObject, {
        children: cardChildren,
        count: cardChildren?.length,
        countLabel: cardChildren ? 'cards' : null
      });
    });

    items.push(
      DataListItem.createGroup({
        children,
        id: 'PAGE_group',
        label: 'Dashboards',
        metadata: `${children.length} page${children.length !== 1 ? 's' : ''}`
      })
    );
  }

  // Handle Report Builder pages
  if (pagesByType.REPORT_BUILDER_VIEW.length > 0) {
    const sortedPages = pagesByType.REPORT_BUILDER_VIEW.sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    const children = sortedPages.map((page) => {
      const cardChildren = buildCardChildren(
        page.pageId,
        cardsByPage,
        origin,
        'REPORT_BUILDER_VIEW'
      );
      const domoObject = new DomoObject('REPORT_BUILDER_VIEW', page.pageId, origin, {
        name: page.pageTitle
      });
      return DataListItem.fromDomoObject(domoObject, {
        children: cardChildren,
        count: cardChildren?.length,
        countLabel: cardChildren ? 'cards' : null
      });
    });

    items.push(
      DataListItem.createGroup({
        children,
        id: 'REPORT_BUILDER_group',
        label: 'Report Builder Pages',
        metadata: `${children.length} page${children.length !== 1 ? 's' : ''}`
      })
    );
  }

  // Handle Worksheet views - group by app first (same structure as App Studio)
  if (pagesByType.WORKSHEET_VIEW.length > 0) {
    const pagesByApp = new Map();
    pagesByType.WORKSHEET_VIEW.forEach((page) => {
      const appId = page.appId;
      if (!pagesByApp.has(appId)) {
        pagesByApp.set(appId, {
          appName: page.appName || `App ${appId}`,
          pages: []
        });
      }
      pagesByApp.get(appId).pages.push(page);
    });

    const appChildren = Array.from(pagesByApp.entries())
      .sort(([, a], [, b]) => a.appName.localeCompare(b.appName))
      .map(([appId, { appName, pages }]) => {
        const sortedPages = pages.sort((a, b) => a.pageTitle.localeCompare(b.pageTitle));

        const pageChildren = sortedPages.map((page) => {
          const cardChildren = buildCardChildren(
            page.pageId,
            cardsByPage,
            origin,
            'WORKSHEET_VIEW',
            appId
          );
          const domoObject = new DomoObject(
            'WORKSHEET_VIEW',
            page.pageId,
            origin,
            { name: page.pageTitle },
            null,
            appId
          );
          return DataListItem.fromDomoObject(domoObject, {
            children: cardChildren,
            count: cardChildren?.length,
            countLabel: cardChildren ? 'cards' : null
          });
        });

        const worksheetDomoObject = new DomoObject('WORKSHEET', appId, origin, {
          name: appName
        });
        return DataListItem.fromDomoObject(worksheetDomoObject, {
          children: pageChildren,
          count: pageChildren.length
        });
      });

    items.push(
      DataListItem.createGroup({
        children: appChildren,
        id: 'WORKSHEET_group',
        label: 'Worksheet Views',
        metadata: `${pagesByApp.size} app${pagesByApp.size !== 1 ? 's' : ''}, ${pagesByType.WORKSHEET_VIEW.length} view${pagesByType.WORKSHEET_VIEW.length !== 1 ? 's' : ''}`
      })
    );
  }

  return items;
}
