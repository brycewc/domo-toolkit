import { useEffect, useState } from 'react';
import {
  Button,
  ButtonGroup,
  Card,
  CloseButton,
  Separator,
  Spinner,
  Tooltip
} from '@heroui/react';
import {
  IconClipboard,
  IconFolders,
  IconRefresh,
  IconUsersPlus,
  IconX
} from '@tabler/icons-react';
import { DataList } from '@/components';
import { getChildPages, sharePagesWithSelf } from '@/services';
import { DomoContext } from '@/models';

export function GetPagesView({
  lockedTabId = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [pageData, setPageData] = useState(null); // Store metadata for rebuilding
  const [tabId, setTabId] = useState(lockedTabId);
  const [viewType, setViewType] = useState('getPages'); // 'getPages' or 'childPagesWarning'

  // Load data on mount
  useEffect(() => {
    loadPagesData();
  }, []);

  const loadPagesData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Get the stored page data from local storage
      const result = await chrome.storage.local.get(['sidepanelDataList']);
      const data = result.sidepanelDataList;

      if (
        !data ||
        (data.type !== 'getPages' && data.type !== 'childPagesWarning')
      ) {
        setError('No page data found. Please try again from a page URL.');
        setIsLoading(false);
        return;
      }

      // Set the view type based on the data type
      setViewType(data.type);

      const { pageId, appId, pageType, pageName, currentContext, childPages } =
        data;
      const context = DomoContext.fromJSON(currentContext);
      if (context.tabId) {
        setTabId(context.tabId);
      }
      const origin = `https://${context.instance}.domo.com`;
      const finalPageName =
        pageName || context.domoObject?.metadata?.name || `Page ${pageId}`;

      if (!childPages || !childPages.length) {
        setError(
          pageType === 'DATA_APP_VIEW'
            ? `No views (pages) found for app studio app ${appId}`
            : `No child pages found for page ${pageId}`
        );
        setIsLoading(false);
        return;
      }

      // Store metadata for rebuilding items later
      setPageData({ pageId, appId, pageType, pageName: finalPageName, origin });

      // Separate children and grandchildren based on parentPageId
      const children = childPages.filter((page) =>
        pageType === 'DATA_APP_VIEW' ? true : page.parentPageId === pageId
      );

      // Build items structure with all pages at once
      buildItemsFromPages(children, childPages, appId, pageType, origin);

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
      setIsLoading(false);
    }
  };

  const buildItemsFromPages = (pages, childPages, appId, pageType, origin) => {
    // Sort pages by title
    const sortedPages = (pages || []).sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    // Build items array - just the child pages
    const childItems = sortedPages?.map((page) => {
      const pageUrl =
        pageType === 'DATA_APP_VIEW'
          ? `${origin}/app-studio/${appId}/pages/${page.pageId}`
          : `${origin}/page/${page.pageId}`;

      // Filter child pages by parentPageId
      const childPagesForPage = childPages.filter(
        (childPage) => childPage.parentPageId === page.pageId
      );

      return {
        id: page.pageId,
        label: page.pageTitle,
        url: pageUrl,
        count: childPagesForPage.length,
        metadata: `ID: ${page.pageId}`,
        children:
          childPagesForPage.length > 0
            ? childPagesForPage
                .sort((a, b) => a.pageTitle.localeCompare(b.pageTitle))
                .map((childPage) => ({
                  id: childPage.pageId,
                  label: childPage.pageTitle,
                  url:
                    pageType === 'DATA_APP_VIEW'
                      ? `${origin}/app-studio/${appId}/pages/${childPage.pageId}`
                      : `${origin}/page/${childPage.pageId}`,
                  metadata: `ID: ${childPage.pageId}`
                }))
            : undefined
      };
    });

    setItems(childItems);
  };

  const handleItemAction = async (action, item) => {
    switch (action) {
      case 'open':
        if (item.children) {
          item.children.forEach(async (child) => {
            if (child.url) {
              await chrome.tabs.create({ url: child.url });
            }
          });
        }
        break;
      case 'copy':
        if (item.id) {
          await navigator.clipboard.writeText(item.id.toString());
        }
        break;
      case 'share':
        sharePagesWithSelf({ pageIds: [item.id], tabId: tabId });
        break;
      default:
        break;
    }
  };

  if (isLoading) {
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

  return (
    <DataList
      items={items}
      header={
        <div className='flex flex-col gap-1'>
          <Card.Title className='flex items-start justify-between'>
            <div className='flex min-h-8 flex-wrap items-center justify-start gap-x-1'>
              <span className='font-bold'>{pageData.pageName}</span> Child Pages
            </div>
            <ButtonGroup hideSeparator>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  onPress={() =>
                    items.forEach((item) => window.open(item.url, '_blank'))
                  }
                  aria-label='Open All'
                >
                  <IconFolders size={4} />
                </Button>
                <Tooltip.Content className='text-xs'>
                  Open all pages in new tabs
                </Tooltip.Content>
              </Tooltip>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  onPress={async () =>
                    await navigator.clipboard.writeText(
                      pageData.pageId.toString()
                    )
                  }
                  aria-label='Copy'
                >
                  <IconClipboard size={4} />
                </Button>
                <Tooltip.Content className='text-xs'>Copy ID</Tooltip.Content>
              </Tooltip>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  onPress={async () =>
                    sharePagesWithSelf(
                      items.map((item) => item.pageId),
                      tabId
                    )
                  }
                  aria-label='Share'
                >
                  <IconUsersPlus size={4} />
                </Button>
                <Tooltip.Content className='text-xs'>
                  Share all pages with yourself
                </Tooltip.Content>
              </Tooltip>
              <Tooltip delay={400} closeDelay={0}>
                <Button
                  variant='ghost'
                  size='sm'
                  isIconOnly
                  onPress={loadPagesData}
                >
                  <IconRefresh size={4} />
                </Button>
                <Tooltip.Content className='text-xs'>Refresh</Tooltip.Content>
              </Tooltip>
              {onBackToDefault && (
                <Tooltip delay={400} closeDelay={0}>
                  <Button
                    variant='ghost'
                    size='sm'
                    isIconOnly
                    onPress={onBackToDefault}
                  >
                    <IconX size={4} />
                  </Button>
                  <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
                </Tooltip>
              )}
            </ButtonGroup>
          </Card.Title>
          <Card.Description>
            {items.length !== undefined &&
              (() => {
                const grandchildCount = items.reduce(
                  (total, item) => total + (item.children?.length || 0),
                  0
                );
                return (
                  <div className='flex flex-row items-center gap-1'>
                    <span className='text-sm text-muted'>
                      {items.length} child{' '}
                      {items.length === 1 ? 'page' : 'pages'}
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
                );
              })()}
          </Card.Description>
        </div>
      }
      onItemAction={handleItemAction}
      showActions={true}
      showCounts={true}
    />
  );
}
