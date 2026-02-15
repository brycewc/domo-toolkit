import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import {
  isSidepanel,
  waitForCards,
  storeSidepanelData,
  openSidepanel
} from '@/utils';
import { getPagesForCards } from '@/services';
import { IconCopy } from '@tabler/icons-react';

export function GetOtherPages({
  currentContext,
  onStatusUpdate,
  isDisabled,
  onCollapseActions
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetOtherPages = async () => {
    setIsLoading(true);

    try {
      if (!currentContext?.domoObject) {
        onStatusUpdate?.(
          'No Page Detected',
          'Please navigate to a Domo page and try again',
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Popup: hand off intent to sidepanel immediately, no API calls
      if (!isSidepanel()) {
        await storeSidepanelData({
          type: 'getOtherPages',
          currentContext
        });
        openSidepanel();
        return;
      }

      // Sidepanel: fetch data, then display
      const objectType = currentContext.domoObject.typeId;
      const objectId = String(currentContext.domoObject.id);

      const objectName =
        currentContext.domoObject.metadata?.parent?.name ||
        currentContext.domoObject.metadata?.name ||
        `Unknown ${objectType}`;

      const result = await waitForCards(currentContext);

      if (!result.success || !result.cards?.length) {
        onStatusUpdate?.(
          'No Cards Found',
          `No cards found on ${objectName}`,
          'warning'
        );
        setIsLoading(false);
        return;
      }

      const { pages, cardsByPage } = await getPagesForCards(
        result.cards.map((card) => card.id),
        currentContext?.tabId
      );

      if (!pages || pages.length === 0) {
        onStatusUpdate?.(
          'No Other Pages',
          `Cards on ${objectName} are not used on any other pages`,
          'warning'
        );
        setIsLoading(false);
        return;
      }

      const otherPages = pages.filter(
        (page) => String(page.id) !== objectId
      );

      if (otherPages.length === 0) {
        onStatusUpdate?.(
          'No Other Pages',
          `Cards on ${objectName} are not used on any other pages`,
          'warning'
        );
        setIsLoading(false);
        return;
      }

      const childPages = otherPages.map((page) => ({
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type,
        appId: page.appId || null,
        appName: page.appName || null
      }));

      if (onCollapseActions) {
        await storeSidepanelData({
          type: 'loading',
          message: 'Loading other pages...',
          timestamp: Date.now()
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        type: 'getOtherPages',
        currentContext,
        childPages,
        cardsByPage,
        statusShown: true
      });
    } catch (error) {
      console.error('[GetOtherPages] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to get other pages',
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
      onPress={handleGetOtherPages}
      isDisabled={isDisabled}
      isPending={isLoading}
      isIconOnly={isLoading}
      className='relative min-w-fit flex-1 basis-[48%] overflow-visible'
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconCopy stroke={1.5} /> Get Other Pages for Page Cards
          </>
        );
      }}
    </Button>
  );
}
