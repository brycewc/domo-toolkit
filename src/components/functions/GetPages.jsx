import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import {
  waitForChildPages,
  isSidepanel,
  showStatus,
  storeSidepanelData,
  openSidepanel
} from '@/utils';
import { getCardsForObject, getPagesForCards } from '@/services';

export function GetPages({
  currentContext,
  onStatusUpdate,
  isDisabled,
  onCollapseActions
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetPages = async () => {
    setIsLoading(true);

    // Collapse action buttons if in sidepanel
    if (onCollapseActions) {
      // Store loading state immediately so sidepanel shows loading indicator
      await storeSidepanelData({
        type: 'loading',
        message: 'Loading pages...',
        timestamp: Date.now()
      });

      onCollapseActions();
      // Wait for collapse animation to complete before triggering view change
      await new Promise((resolve) => setTimeout(resolve, 175));
    }

    // Helper to clear loading state from sidepanel when we hit an error/early exit
    const clearLoadingState = () => {
      if (onCollapseActions) {
        chrome.storage.local.remove(['sidepanelDataList']);
      }
    };

    try {
      // Validate we have a current object and it's a page type
      if (!currentContext?.domoObject) {
        clearLoadingState();
        onStatusUpdate?.(
          'No Page Detected',
          'Please navigate to a Domo page and try again',
          'danger'
        );
        setIsLoading(false);
        return;
      }
      const objectType = currentContext.domoObject.typeId;

      // Check if the current object is a valid type
      if (
        objectType !== 'PAGE' &&
        objectType !== 'DATA_APP_VIEW' &&
        objectType !== 'CARD' &&
        objectType !== 'DATA_SOURCE'
      ) {
        clearLoadingState();
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages, cards, and datasets. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      const objectId = parseInt(
        currentContext.domoObject?.parentId || currentContext.domoObject.id
      );
      const objectName =
        currentContext.domoObject.metadata?.parent?.name ||
        currentContext.domoObject.metadata?.name ||
        `Unknown ${objectType}`;

      let childPages = [];

      // Handle DATA_SOURCE differently - get cards then pages for those cards
      if (objectType === 'DATA_SOURCE') {
        const cards = await getCardsForObject({
          objectId: currentContext.domoObject.id,
          objectType: currentContext.domoObject.typeId
        });

        if (!cards || cards.length === 0) {
          clearLoadingState();
          onStatusUpdate?.(
            'No Cards Found',
            `No cards found using ${objectName}`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        // Get all pages that those cards appear on
        const pages = await getPagesForCards(cards.map((card) => card.id));

        if (!pages || pages.length === 0) {
          clearLoadingState();
          onStatusUpdate?.(
            'No Pages Found',
            `Cards using ${objectName} are not used on any pages`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        // Transform to match CARD format (grouped by page type)
        childPages = pages.map((page) => ({
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type,
          appId: page.appId || null // Include appId for DATA_APP_VIEW URLs
        }));
      } else {
        // For PAGE, DATA_APP_VIEW, and CARD - use existing logic
        const result = await waitForChildPages(currentContext);

        if (!result.success) {
          clearLoadingState();
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          setIsLoading(false);
          return;
        }

        childPages = result.childPages;
      }

      // If no child pages, show message
      if (childPages.length > 0) {
        const inSidepanel = isSidepanel();

        if (!inSidepanel) {
          openSidepanel();
          // Show status message
          await showStatus({
            onStatusUpdate,
            title: 'Opening Sidepanel',
            description: 'Loading pages...',
            status: 'success',
            timeout: 2000,
            inSidepanel
          });
        }

        // Store the page information for the sidepanel to use
        await storeSidepanelData({
          type: 'getPages',
          objectId,
          objectName,
          objectType,
          currentContext,
          childPages,
          statusShown: true
        });
      } else {
        clearLoadingState();
        switch (currentContext.domoObject.typeId) {
          case 'PAGE':
            onStatusUpdate?.(
              'No Child Pages',
              `This page has no child pages.`,
              'warning',
              3000
            );
            break;
          case 'DATA_APP_VIEW':
            onStatusUpdate?.(
              'No Pages',
              `This app studio app has no pages.`,
              'warning',
              3000
            );
            break;
          case 'CARD':
            onStatusUpdate?.(
              'No Pages',
              `This card is not used in any pages, app studio pages, or report builder pages.`,
              'warning',
              3000
            );
            break;
          case 'DATA_SOURCE':
            onStatusUpdate?.(
              'No Cards Found',
              `No cards found using this dataset.`,
              'warning',
              3000
            );
            break;
          default:
            onStatusUpdate?.(
              'No Pages',
              `No pages found for this object.`,
              'warning',
              3000
            );
        }

        setIsLoading(false);
        return;
      }
    } catch (error) {
      clearLoadingState();
      console.error('[GetPages] Error opening sidepanel:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to open sidepanel',
        'danger'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant='tertiary'
      fullWidth
      onPress={handleGetPages}
      isDisabled={isDisabled}
      isPending={isLoading}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        const typeId = currentContext?.domoObject?.typeId;

        if (typeId === 'DATA_SOURCE') {
          return 'Get Pages for DataSet Cards';
        }

        let prefix = 'Child ';
        if (typeId === 'CARD') {
          prefix = '';
        } else if (typeId === 'DATA_APP_VIEW') {
          prefix = 'App ';
        }

        return `Get ${prefix}Pages`;
      }}
    </Button>
  );
}
