import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import {
  waitForChildPages,
  isSidepanel,
  storeSidepanelData,
  openSidepanel
} from '@/utils';
import { getCardsForObject, getPagesForCards } from '@/services';
import { IconCopy } from '@tabler/icons-react';

export function GetPages({
  currentContext,
  onStatusUpdate,
  isDisabled,
  onCollapseActions
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetPages = async () => {
    setIsLoading(true);

    try {
      // Validate we have a current object and it's a page type
      if (!currentContext?.domoObject) {
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
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages, cards, and datasets. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Popup: hand off intent to sidepanel immediately, no API calls
      if (!isSidepanel()) {
        await storeSidepanelData({
          type: 'getPages',
          currentContext
        });
        openSidepanel();
        return;
      }

      // Sidepanel: fetch data, then display
      const objectName =
        currentContext.domoObject.metadata?.parent?.name ||
        currentContext.domoObject.metadata?.name ||
        `Unknown ${objectType}`;

      let childPages = [];

      if (objectType === 'DATA_SOURCE') {
        const cards = await getCardsForObject({
          objectId: currentContext.domoObject.id,
          objectType: currentContext.domoObject.typeId,
          tabId: currentContext?.tabId
        });

        if (!cards || cards.length === 0) {
          onStatusUpdate?.(
            'No Cards Found',
            `No cards found using ${objectName}`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        const { pages } = await getPagesForCards(
          cards.map((card) => card.id),
          currentContext?.tabId
        );

        if (!pages || pages.length === 0) {
          onStatusUpdate?.(
            'No Pages Found',
            `Cards using ${objectName} are not used on any pages`,
            'warning'
          );
          setIsLoading(false);
          return;
        }

        childPages = pages.map((page) => ({
          pageId: page.id,
          pageTitle: page.name,
          pageType: page.type,
          appId: page.appId || null,
          appName: page.appName || null
        }));
      } else {
        const result = await waitForChildPages(currentContext);

        if (!result.success) {
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          setIsLoading(false);
          return;
        }

        childPages = result.childPages;
        if (objectType === 'CARD') {
          childPages = childPages.map((page) => ({
            pageId: page.id,
            pageTitle: page.name,
            pageType: page.type,
            appId: page.appId || null,
            appName: page.appName || null
          }));
        }
      }

      if (childPages.length > 0) {
        if (onCollapseActions) {
          await storeSidepanelData({
            type: 'loading',
            message: 'Loading pages...',
            timestamp: Date.now()
          });

          onCollapseActions();
          await new Promise((resolve) => setTimeout(resolve, 175));
        }

        await storeSidepanelData({
          type: 'getPages',
          currentContext,
          childPages,
          statusShown: true
        });
      } else {
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
      isIconOnly={isLoading}
      className='relative min-w-fit flex-1 basis-[48%] overflow-visible'
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        const typeId = currentContext?.domoObject?.typeId;
        let message = 'Get Pages';
        switch (typeId) {
          case 'DATA_SOURCE':
            message = 'Get Pages for DataSet Cards';
            break;
          case 'CARD':
            message = 'Get Pages for Card';
            break;
          case 'DATA_APP_VIEW':
            message = 'Get App Pages';
            break;
          case 'PAGE':
            message = 'Get Child Pages';
            break;
          default:
            break;
        }

        return (
          <>
            <IconCopy stroke={1.5} /> {message}
          </>
        );
      }}
    </Button>
  );
}
