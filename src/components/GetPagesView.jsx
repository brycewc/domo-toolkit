import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  CloseButton,
  Separator,
  Spinner
} from '@heroui/react';
import { DataList } from './DataList';
import { DataListItem, DomoContext, DomoObject } from '@/models';
import {
  getCardsForObject,
  getChildPages,
  getPagesForCards,
  sharePagesWithSelf,
  removeCardFromPage
} from '@/services';
import {
  getValidTabForInstance,
  waitForCards,
  waitForChildPages
} from '@/utils';

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
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((card) => {
      const domoObject = new DomoObject('CARD', card.id, origin, {
        name: card.name
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
    PAGE: [],
    DATA_APP_VIEW: [],
    WORKSHEET_VIEW: [],
    REPORT_BUILDER_VIEW: []
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
        const sortedPages = pages.sort((a, b) =>
          a.pageTitle.localeCompare(b.pageTitle)
        );

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
        id: 'DATA_APP_VIEW_group',
        label: 'App Studio Apps',
        children: appChildren,
        metadata: `${pagesByApp.size} app${pagesByApp.size !== 1 ? 's' : ''}, ${pagesByType.DATA_APP_VIEW.length} page${pagesByType.DATA_APP_VIEW.length !== 1 ? 's' : ''}`
      })
    );
  }

  // Handle regular Pages/Dashboards
  if (pagesByType.PAGE.length > 0) {
    const sortedPages = pagesByType.PAGE.sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    const children = sortedPages.map((page) => {
      const cardChildren = buildCardChildren(
        page.pageId,
        cardsByPage,
        origin,
        'PAGE'
      );
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
        id: 'PAGE_group',
        label: 'Pages/Dashboards',
        children,
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
      const domoObject = new DomoObject(
        'REPORT_BUILDER_VIEW',
        page.pageId,
        origin,
        { name: page.pageTitle }
      );
      return DataListItem.fromDomoObject(domoObject, {
        children: cardChildren,
        count: cardChildren?.length,
        countLabel: cardChildren ? 'cards' : null
      });
    });

    items.push(
      DataListItem.createGroup({
        id: 'REPORT_BUILDER_VIEW_group',
        label: 'Report Builder Pages',
        children,
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
        const sortedPages = pages.sort((a, b) =>
          a.pageTitle.localeCompare(b.pageTitle)
        );

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
        id: 'WORKSHEET_VIEW_group',
        label: 'Worksheet Views',
        children: appChildren,
        metadata: `${pagesByApp.size} app${pagesByApp.size !== 1 ? 's' : ''}, ${pagesByType.WORKSHEET_VIEW.length} view${pagesByType.WORKSHEET_VIEW.length !== 1 ? 's' : ''}`
      })
    );
  }

  return items;
}

export function GetPagesView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [pageData, setPageData] = useState(null); // Store metadata for rebuilding
  const [pageTypeLabel, setPageTypeLabel] = useState('pages');

  // Load data on mount
  useEffect(() => {
    loadPagesData();
  }, []);

  const loadPagesData = async (forceRefresh = false) => {
    if (!forceRefresh) {
      setIsLoading(true);
      setShowSpinner(false);
    }
    setError(null);

    // Delay showing spinner to avoid flash on quick loads
    const spinnerTimer = !forceRefresh
      ? setTimeout(() => {
          setShowSpinner(true);
        }, 200)
      : null;

    try {
      // Get the stored page data from local storage
      const result = await chrome.storage.session.get(['sidepanelDataList']);
      const data = result.sidepanelDataList;
      console.log('Loaded sidepanel data:', data);
      if (
        !data ||
        (data.type !== 'getPages' &&
          data.type !== 'getOtherPages' &&
          data.type !== 'childPagesWarning')
      ) {
        setError('No page data found. Please try again from a page URL.');
        setIsLoading(false);
        return;
      }

      // Derive all values from currentContext - no duplication needed
      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const objectId = parseInt(domoObject.parentId || domoObject.id);
      const objectName =
        domoObject.metadata?.parent?.name ||
        domoObject.metadata?.name ||
        `${domoObject.typeName} ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      // Get appId for DATA_APP_VIEW types (stored as parentId in domoObject)
      const appId =
        objectType === 'DATA_APP_VIEW'
          ? domoObject.parentId ||
            domoObject?.metadata?.parent?.id ||
            domoObject.id
          : null;

      const sidepanelType = data.type;

      // Set label early so the loading spinner shows the right text
      setPageTypeLabel(
        sidepanelType === 'getOtherPages'
          ? 'Other Pages for Cards on'
          : objectType === 'CARD' || objectType === 'DATA_SOURCE'
            ? 'Pages'
            : objectType === 'DATA_APP_VIEW'
              ? 'App Pages'
              : 'Child Pages'
      );

      // Either use cached childPages or fetch fresh data
      let childPages = data.childPages;
      let cardsByPage = data.cardsByPage;

      if (!childPages && !forceRefresh) {
        // No pre-fetched data (popup handoff)
        if (sidepanelType === 'getOtherPages') {
          // Get cards from background cache, then find pages for those cards
          const waitResult = await waitForCards(context);
          if (waitResult.success && waitResult.cards?.length) {
            const tabId = await getValidTabForInstance(instance);
            const result = await getPagesForCards(
              waitResult.cards.map((card) => card.id),
              tabId
            );
            const stringId = String(objectId);
            childPages = result.pages
              .filter((page) => String(page.id) !== stringId)
              .map((page) => ({
                pageId: page.id,
                pageTitle: page.name,
                pageType: page.type,
                appId: page.appId || null,
                appName: page.appName || null
              }));
            cardsByPage = result.cardsByPage;
          }
        } else if (
          objectType === 'PAGE' ||
          objectType === 'DATA_APP_VIEW' ||
          objectType === 'CARD'
        ) {
          // These types have background-cached child pages -- try that first
          const waitResult = await waitForChildPages(context);
          if (waitResult.success) {
            childPages = waitResult.childPages;
            if (objectType === 'CARD') {
              // Transform to match grouped pages format
              childPages = childPages.map((page) => ({
                pageId: page.id,
                pageTitle: page.name,
                pageType: page.type,
                appId: page.appId || null,
                appName: page.appName || null
              }));
            }
          }
        }
        // If still no data (or type doesn't use cache), fetch fresh
        if (!childPages) {
          const freshData = await fetchFreshChildPages({
            objectId,
            objectType,
            appId,
            instance,
            sidepanelType
          });
          childPages = freshData.childPages;
          cardsByPage = freshData.cardsByPage;
        }
      }

      if (forceRefresh) {
        const freshData = await fetchFreshChildPages({
          objectId,
          objectType,
          appId,
          instance,
          sidepanelType
        });
        childPages = freshData.childPages;
        cardsByPage = freshData.cardsByPage;
      }

      if (!childPages || !childPages.length) {
        const message =
          sidepanelType === 'getOtherPages'
            ? 'Cards on this page are not used on any other pages'
            : objectType === 'DATA_APP_VIEW'
              ? `No views (pages) found for app studio app ${objectId}`
              : objectType === 'CARD'
                ? `No pages found for card ${objectId}`
                : `No child pages found for page ${objectId}`;
        onStatusUpdate?.('No Pages Found', message, 'warning');
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      // Store metadata for rebuilding items later (including instance for refresh)
      setPageData({
        objectId,
        objectType,
        objectName,
        origin,
        appId,
        instance,
        sidepanelType,
        userId: context.user?.id
      });

      if (
        objectType === 'CARD' ||
        objectType === 'DATA_SOURCE' ||
        sidepanelType === 'getOtherPages'
      ) {
        const transformedItems = transformGroupedPagesData(
          childPages,
          origin,
          cardsByPage
        );
        setItems(transformedItems);
      } else {
        // Normal PAGE or DATA_APP_VIEW data - use existing logic
        // Separate children and grandchildren based on parentPageId
        const children = childPages.filter((page) =>
          objectType === 'DATA_APP_VIEW' ? true : page.parentPageId === objectId
        );

        // Build items structure with all pages at once
        buildItemsFromPages({
          pages: children,
          childPages,
          objectId,
          objectName,
          objectType,
          origin
        });
      }

      // If this is a childPagesWarning, show the warning status only if not already shown
      if (
        data.type === 'childPagesWarning' &&
        onStatusUpdate &&
        !data.statusShown
      ) {
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

  /**
   * Fetch fresh child pages data from API based on object type.
   * Dynamically finds a valid tab on the same Domo instance for API calls.
   */
  const fetchFreshChildPages = async ({
    objectId,
    objectType,
    appId,
    instance,
    sidepanelType
  }) => {
    // Find a valid tab on the same Domo instance for API calls
    const tabId = await getValidTabForInstance(instance);

    // Get Other Pages: get cards on the page, then find all other pages for those cards
    if (sidepanelType === 'getOtherPages') {
      const cards = await getCardsForObject({
        objectId,
        objectType,
        tabId
      });

      if (!cards || !cards.length) return { childPages: [], cardsByPage: {} };

      const { pages, cardsByPage } = await getPagesForCards(
        cards.map((card) => card.id),
        tabId
      );

      // Filter out the current page
      const stringId = String(objectId);
      const childPages = pages
        .filter((page) => String(page.id) !== stringId)
        .map((page) => ({
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type,
          appId: page.appId || null,
          appName: page.appName || null
        }));

      return { childPages, cardsByPage };
    }

    if (objectType === 'PAGE') {
      // Fetch child pages for regular PAGE
      const childPages = await getChildPages({
        pageId: objectId,
        pageType: 'PAGE',
        includeGrandchildren: true,
        tabId
      });
      return { childPages };
    } else if (objectType === 'DATA_APP_VIEW') {
      // Fetch all views for the app studio app
      const childPages = await getChildPages({
        pageId: objectId,
        pageType: 'DATA_APP_VIEW',
        appId,
        tabId
      });
      return { childPages };
    } else if (objectType === 'DATA_SOURCE') {
      // For DATA_SOURCE: get cards then get pages for those cards
      const cards = await getCardsForObject({
        objectId,
        objectType,
        tabId
      });

      if (!cards || !cards.length) {
        return { childPages: [] };
      }

      const { pages } = await getPagesForCards(
        cards.map((card) => card.id),
        tabId
      );

      // Transform to match expected format with pageType
      const childPages = pages.map((page) => ({
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type,
        appId: page.appId || null,
        appName: page.appName || null
      }));
      return { childPages };
    } else if (objectType === 'CARD') {
      const { pages } = await getPagesForCards([objectId], tabId);

      // Transform to match expected format with pageType
      const childPages = pages.map((page) => ({
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type,
        appId: page.appId || null,
        appName: page.appName || null
      }));
      return { childPages };
    }

    return { childPages: [] };
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadPagesData(true); // Force fresh API call
      onStatusUpdate?.(
        'Refreshed',
        'Page data updated successfully',
        'success',
        2000
      );
    } catch (err) {
      onStatusUpdate?.(
        'Refresh Failed',
        err.message || 'Failed to refresh data',
        'danger',
        3000
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const buildItemsFromPages = ({
    pages,
    childPages,
    objectId,
    objectName,
    objectType,
    origin
  }) => {
    // Sort pages by title
    const sortedPages = (pages || []).sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    // Determine the typeId for pages based on the parent object type
    const pageTypeId =
      objectType === 'DATA_APP_VIEW' ? 'DATA_APP_VIEW' : 'PAGE';
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
        pageId: item.id,
        cardId: pageData?.objectId,
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
      onStatusUpdate?.(
        'Error',
        err.message || 'Failed to remove',
        'danger',
        3000
      );
    }
  };

  /**
   * Handle share item action (custom - page specific)
   */
  const handleItemShare = async (actionType, item) => {
    try {
      if (pageData?.instance) {
        const tabId = await getValidTabForInstance(pageData.instance);
        await sharePagesWithSelf({
          pageIds: [item.id],
          userId: pageData.userId,
          tabId
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
      onStatusUpdate?.(
        'Error',
        err.message || 'Failed to share',
        'danger',
        3000
      );
    }
  };

  /**
   * Handle shareAll item action (custom - page specific)
   */
  const handleItemShareAll = async (actionType, item) => {
    try {
      if (pageData?.instance && item.children) {
        const tabId = await getValidTabForInstance(pageData.instance);
        const count = item.children.length;
        await sharePagesWithSelf({
          pageIds: item.children.map((child) => child.id),
          userId: pageData.userId,
          tabId
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
      onStatusUpdate?.(
        'Error',
        err.message || 'Failed to share',
        'danger',
        3000
      );
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
            if (
              !item.isVirtualParent &&
              item.typeId !== 'CARD' &&
              Number(item.id) >= 0
            ) {
              ids.push(item.id);
            }
            if (item.children) {
              ids.push(...collectPageIds(item.children));
            }
          }
          return ids;
        };

        const pageIds = collectPageIds(items);
        const count = pageIds.length;

        await sharePagesWithSelf({
          pageIds,
          userId: pageData.userId,
          tabId
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
      onStatusUpdate?.(
        'Error',
        err.message || 'Failed to share',
        'danger',
        3000
      );
    }
  };

  // Build the title section with name, label, and stats
  const renderTitle = () => {
    const grandchildCount = items.reduce(
      (total, item) => total + (item.children?.length || 0),
      0
    );

    return (
      <div className='flex w-full flex-col gap-1'>
        <div className='line-clamp-2 min-w-0'>
          <span>{pageTypeLabel}{pageTypeLabel.endsWith('on') ? '' : ' for'}</span>{' '}
          <span className='font-bold'>{pageData?.objectName}</span>
        </div>
        {items.length !== undefined &&
          pageData?.objectType !== 'CARD' &&
          pageData?.objectType !== 'DATA_SOURCE' &&
          pageData?.sidepanelType !== 'getOtherPages' && (
            <div className='flex flex-row items-center gap-1'>
              <span className='text-sm text-muted'>
                {items.length}{' '}
                {pageData?.objectType === 'PAGE' ? 'child page' : 'page'}
                {items.length === 1 ? '' : 's'}
              </span>
              {grandchildCount > 0 && (
                <div className='flex flex-row items-end gap-1'>
                  <Separator
                    orientation='vertical'
                    className='mx-1 h-4'
                    size='sm'
                  />
                  <span className='text-sm text-muted'>
                    {grandchildCount} grandchild{' '}
                    {grandchildCount === 1 ? 'page' : 'pages'}
                  </span>
                </div>
              )}
            </div>
          )}
      </div>
    );
  };
  if (isLoading && showSpinner) {
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading {pageTypeLabel}...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button onPress={loadPagesData}>Retry</Button>
          </div>
        </Alert.Content>
        <CloseButton
          variant='ghost'
          className='rounded-full'
          onPress={() => onBackToDefault?.()}
        />
      </Alert>
    );
  }

  return (
    <DataList
      items={items}
      objectType={pageData?.objectType}
      onStatusUpdate={onStatusUpdate}
      title={renderTitle()}
      headerActions={
        pageData?.objectType === 'DATA_APP_VIEW'
          ? ['openAll', 'copy', 'refresh']
          : ['openAll', 'copy', 'shareAll', 'refresh']
      }
      objectId={pageData?.objectId}
      onRefresh={handleRefresh}
      onShareAll={handleShareAll}
      onClose={onBackToDefault}
      closeLabel={`Close ${pageTypeLabel} View`}
      isRefreshing={isRefreshing}
      itemActions={
        pageData?.sidepanelType === 'getOtherPages'
          ? ['openAll', 'copy', 'share']
          : undefined
      }
      onItemRemove={handleItemRemove}
      onItemShare={handleItemShare}
      onItemShareAll={handleItemShareAll}
      showActions={true}
      showCounts={true}
      itemLabel='page'
    />
  );
}
