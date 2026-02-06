import { useEffect, useState } from 'react';
import { Button, Separator, Spinner } from '@heroui/react';
import { DataList } from '@/components';
import {
  getCardsForObject,
  getChildPages,
  getPagesForCards,
  sharePagesWithSelf
} from '@/services';
import { DataListItem, DomoContext } from '@/models';
import { getValidTabForInstance } from '@/utils';

/**
 * Transform grouped pages data into hierarchical structure
 * For CARD and DATA_SOURCE types, childPages is a flat array with pageType property
 * We group by pageType and create virtual parent items
 * For App Studio pages, we create a nested hierarchy: App Studio Apps > App > Pages
 */
function transformGroupedPagesData(childPages, origin) {
  if (!childPages || !childPages.length) return [];

  // Group pages by pageType
  const pagesByType = {
    PAGE: [],
    DATA_APP_VIEW: [],
    REPORT_BUILDER_VIEW: []
  };

  childPages.forEach((page) => {
    const type = page.pageType;
    if (pagesByType[type]) {
      pagesByType[type].push(page);
    }
  });

  const items = [];

  // Handle regular Pages/Dashboards
  if (pagesByType.PAGE.length > 0) {
    const sortedPages = pagesByType.PAGE.sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    const children = sortedPages.map(
      (page) =>
        new DataListItem({
          id: page.pageId,
          label: page.pageTitle,
          url: `${origin}/page/${page.pageId}`,
          typeId: 'PAGE',
          metadata: `ID: ${page.pageId}`
        })
    );

    items.push(
      DataListItem.createGroup({
        id: 'PAGE_group',
        label: 'Pages/Dashboards',
        children,
        metadata: `${children.length} page${children.length !== 1 ? 's' : ''}`
      })
    );
  }

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

        const pageChildren = sortedPages.map(
          (page) =>
            new DataListItem({
              id: page.pageId,
              label: page.pageTitle,
              url: `${origin}/app-studio/${appId}/pages/${page.pageId}`,
              typeId: 'DATA_APP_VIEW',
              metadata: `ID: ${page.pageId}`
            })
        );

        return new DataListItem({
          id: appId,
          label: appName,
          url: `${origin}/app-studio/${appId}`,
          typeId: 'DATA_APP',
          count: pageChildren.length,
          children: pageChildren
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

  // Handle Report Builder pages
  if (pagesByType.REPORT_BUILDER_VIEW.length > 0) {
    const sortedPages = pagesByType.REPORT_BUILDER_VIEW.sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    const children = sortedPages.map(
      (page) =>
        new DataListItem({
          id: page.pageId,
          label: page.pageTitle,
          url: '',
          typeId: 'REPORT_BUILDER_VIEW',
          metadata: `ID: ${page.pageId}`
        })
    );

    items.push(
      DataListItem.createGroup({
        id: 'REPORT_BUILDER_VIEW_group',
        label: 'Report Builder Pages',
        children,
        metadata: `${children.length} page${children.length !== 1 ? 's' : ''}`
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
        (data.type !== 'getPages' && data.type !== 'childPagesWarning')
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
        `${objectType} ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      // Get appId for DATA_APP_VIEW types (stored as parentId in domoObject)
      const appId =
        objectType === 'DATA_APP_VIEW'
          ? domoObject.parentId ||
            domoObject?.metadata?.parent?.id ||
            domoObject.id
          : null;

      // Either use cached childPages or fetch fresh data
      let childPages = data.childPages;

      if (forceRefresh) {
        console.log('[GetPagesView] Refreshing data for', objectType, objectId);
        childPages = await fetchFreshChildPages({
          objectId,
          objectType,
          appId,
          instance
        });
      }

      if (!childPages || !childPages.length) {
        setError(
          objectType === 'DATA_APP_VIEW'
            ? `No views (pages) found for app studio app ${objectId}`
            : objectType === 'CARD'
              ? `No pages found for card ${objectId}`
              : `No child pages found for page ${objectId}`
        );
        setIsLoading(false);
        return;
      }

      const pageTypeLabel =
        objectType === 'CARD' || objectType === 'DATA_SOURCE'
          ? 'Pages'
          : objectType === 'DATA_APP_VIEW'
            ? 'App Pages'
            : 'Child Pages';

      // Store metadata for rebuilding items later (including instance for refresh)
      setPageData({
        objectId,
        objectType,
        objectName,
        origin,
        appId,
        instance,
        pageTypeLabel,
        userId: context.user?.id
      });

      if (objectType === 'CARD' || objectType === 'DATA_SOURCE') {
        const transformedItems = transformGroupedPagesData(childPages, origin);
        // This is CARD or DATA_SOURCE data - use the transformed structure
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
    instance
  }) => {
    // Find a valid tab on the same Domo instance for API calls
    const tabId = await getValidTabForInstance(instance);

    if (objectType === 'PAGE') {
      // Fetch child pages for regular PAGE
      const pages = await getChildPages({
        pageId: objectId,
        pageType: 'PAGE',
        includeGrandchildren: true,
        tabId
      });
      return pages;
    } else if (objectType === 'DATA_APP_VIEW') {
      // Fetch all views for the app studio app
      const pages = await getChildPages({
        pageId: objectId,
        pageType: 'DATA_APP_VIEW',
        appId,
        tabId
      });
      return pages;
    } else if (objectType === 'DATA_SOURCE') {
      // For CARD/DATA_SOURCE: get cards then get pages for those cards
      const cards = await getCardsForObject({
        objectId,
        objectType,
        tabId
      });

      if (!cards || !cards.length) {
        return [];
      }

      const pages = await getPagesForCards(
        cards.map((card) => card.id),
        tabId
      );

      // Transform to match expected format with pageType
      return pages.map((page) => ({
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type,
        appId: page.appId || null,
        appName: page.appName || null
      }));
    } else if (objectType === 'CARD') {
      const pages = await getPagesForCards([objectId], tabId);

      // Transform to match expected format with pageType
      return pages.map((page) => ({
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type,
        appId: page.appId || null,
        appName: page.appName || null
      }));
    }

    return [];
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

    // Build items array - just the child pages
    const childItems = sortedPages?.map((page) => {
      const pageUrl =
        objectType === 'DATA_APP_VIEW'
          ? `${origin}/app-studio/${objectId}/pages/${page.pageId}`
          : `${origin}/page/${page.pageId}`;

      // Filter child pages by parentPageId
      const childPagesForPage = childPages.filter(
        (childPage) => childPage.parentPageId === page.pageId
      );

      const nestedChildren =
        childPagesForPage.length > 0
          ? childPagesForPage
              .sort((a, b) => a.pageTitle.localeCompare(b.pageTitle))
              .map(
                (childPage) =>
                  new DataListItem({
                    id: childPage.pageId,
                    label: childPage.pageTitle,
                    url:
                      objectType === 'DATA_APP_VIEW'
                        ? `${origin}/app-studio/${objectId}/pages/${childPage.pageId}`
                        : `${origin}/page/${childPage.pageId}`,
                    typeId: pageTypeId,
                    metadata: `ID: ${childPage.pageId}`
                  })
              )
          : undefined;

      return new DataListItem({
        id: page.pageId,
        label: page.pageTitle,
        url: pageUrl,
        typeId: pageTypeId,
        count: childPagesForPage.length,
        metadata: `ID: ${page.pageId}`,
        children: nestedChildren
      });
    });

    setItems(childItems);
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
        const count = items.length;
        await sharePagesWithSelf({
          pageIds: items.map((item) => item.id),
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

  if (isLoading && showSpinner) {
    return (
      <div className='flex items-center justify-center'>
        <div className='flex flex-col items-center gap-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading child pages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center p-4'>
        <div className='flex flex-col items-center gap-2 text-center'>
          <p className='text-danger'>{error}</p>
          <Button onPress={loadPagesData}>Retry</Button>
        </div>
      </div>
    );
  }

  // Build the title section with name, label, and stats
  const renderTitle = () => {
    const grandchildCount = items.reduce(
      (total, item) => total + (item.children?.length || 0),
      0
    );

    return (
      <div className='flex flex-col gap-1'>
        <div className='flex flex-wrap items-center justify-start gap-x-1'>
          <span className='font-bold'>{pageData?.objectName}</span>
          {pageData?.pageTypeLabel}
        </div>
        {items.length !== undefined &&
          pageData?.objectType !== 'CARD' &&
          pageData?.objectType !== 'DATA_SOURCE' && (
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
      closeLabel={`Close ${pageData?.pageTypeLabel} View`}
      isRefreshing={isRefreshing}
      onItemShare={handleItemShare}
      onItemShareAll={handleItemShareAll}
      showActions={true}
      showCounts={true}
      itemLabel='page'
    />
  );
}
