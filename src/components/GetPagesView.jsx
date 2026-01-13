import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { DataList } from '@/components';
import { getChildPages, getPageCards } from '@/services';

export function GetPagesView() {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [pageData, setPageData] = useState(null); // Store metadata for rebuilding

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

      if (!data || data.type !== 'getPages') {
        setError('No page data found. Please try again from a page URL.');
        setIsLoading(false);
        return;
      }

      const { pageId, appId, pageType, currentInstance } = data;
      const origin = `https://${currentInstance}.domo.com`;

      console.log('Fetching child pages with:', { pageId, appId, pageType });

      // Fetch child pages using service
      const pages = await getChildPages({ pageId, appId, pageType });

      console.log('Received pages:', pages);

      if (!pages || !pages.length) {
        setError(
          pageType === 'DATA_APP_VIEW'
            ? `No views (pages) found for app studio app ${appId}`
            : `No child pages found for page ${pageId}`
        );
        setIsLoading(false);
        return;
      }

      // Store metadata for rebuilding items later
      setPageData({ pages, pageId, appId, pageType, origin });

      // Build initial items structure
      buildItemsFromPages(pages, pageId, appId, pageType, origin);

      // Fetch cards for each page (don't await, let them load in background)
      fetchAllPageCards(pages, pageId, appId, pageType, origin);
    } catch (err) {
      console.error('Error loading pages:', err);
      setError(err.message || 'Failed to load child pages');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAllPageCards = async (pages, pageId, appId, pageType, origin) => {
    // Fetch cards for each page
    const cardPromises = pages.map(async (page) => {
      const cards = await getPageCards(page.pageId);
      console.log(`Received cards for page ${page.pageId}:`, cards);
      return { pageId: page.pageId, cards };
    });

    const results = await Promise.all(cardPromises);
    console.log('Received cards for pages:', results);
    // Build map of cards by page ID
    const cardsByPageId = new Map(results.map((r) => [r.pageId, r.cards]));

    // Update pages with card data
    const updatedPages = pages.map((page) => ({
      ...page,
      cards: cardsByPageId.get(page.pageId) || []
    }));

    // Rebuild items with card data
    buildItemsFromPages(updatedPages, pageId, appId, pageType, origin);
  };

  const buildItemsFromPages = (pages, pageId, appId, pageType, origin) => {
    // Sort pages by title
    const sortedPages = (pages || []).sort((a, b) =>
      a.pageTitle.localeCompare(b.pageTitle)
    );

    // Get parent page info
    const firstPage = pages[0];
    const currentPageTitle =
      pageType === 'DATA_APP_VIEW'
        ? firstPage.dataAppTitle
        : firstPage.topPageTitle
          ? `${firstPage.topPageTitle} > ${firstPage.parentPageTitle}`
          : firstPage.parentPageTitle;

    // Build items array - parent page with children
    const parentItem = {
      id: `parent-${pageId}`,
      label: currentPageTitle,
      metadata: `ID: ${pageId}`,
      count: pages.length,
      children: sortedPages?.map((page) => {
        const pageUrl =
          pageType === 'DATA_APP_VIEW'
            ? `${origin}/app-studio/${appId}/pages/${page.pageId}`
            : `${origin}/page/${page.pageId}`;

        const cardCount = page.cards?.length ?? page.cardCount ?? 0;

        return {
          id: page.pageId,
          label: page.pageTitle,
          url: pageUrl,
          count: cardCount,
          metadata: `ID: ${page.pageId}`,
          children:
            page.cards && page.cards.length > 0
              ? page.cards?.map((card) => ({
                  id: card.id,
                  label: card.title || 'Untitled Card',
                  url:
                    pageType === 'DATA_APP_VIEW'
                      ? `${origin}/app-studio/${appId}/pages/${page.pageId}/kpis/details/${card.id}`
                      : `${origin}/page/${page.pageId}/kpis/details/${card.id}`,
                  metadata: `ID: ${card.id}`
                }))
              : undefined
        };
      })
    };

    setItems([parentItem]);
  };

  const handleItemAction = async (action, item) => {
    switch (action) {
      case 'open':
        if (item.url) {
          await chrome.tabs.create({ url: item.url });
        }
        break;
      case 'copy':
        if (item.id) {
          await navigator.clipboard.writeText(item.id.toString());
        }
        break;
      case 'share':
        // TODO: Implement share functionality
        console.log('Share:', item);
        break;
      default:
        break;
    }
  };

  const handleItemClick = async (item) => {
    if (item.url) {
      await chrome.tabs.create({ url: item.url });
    }
  };

  if (isLoading) {
    return (
      <div className='flex min-h-screen items-center justify-center'>
        <div className='flex flex-col items-center gap-4'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading child pages...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex min-h-screen items-center justify-center p-4'>
        <div className='flex flex-col items-center gap-4 text-center'>
          <p className='text-danger'>{error}</p>
          <Button onPress={loadPagesData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className='flex flex-col gap-4 p-4'>
      <div className='flex items-center justify-between'>
        <h1 className='text-2xl font-bold'>Child Pages</h1>
        <Button size='sm' variant='ghost' onPress={loadPagesData}>
          Refresh
        </Button>
      </div>
      <DataList
        items={items}
        onItemClick={handleItemClick}
        onItemAction={handleItemAction}
        showActions={true}
        showCounts={true}
      />
    </div>
  );
}
