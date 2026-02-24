import { Button, Spinner } from '@heroui/react';
import { IconCopy } from '@tabler/icons-react';
import { useState } from 'react';

import { getPagesForCards } from '@/services';
import {
  isSidepanel,
  openSidepanel,
  storeSidepanelData,
  waitForCards
} from '@/utils';

export function GetOtherPages({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
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
          currentContext,
          type: 'getOtherPages'
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

      const { cardsByPage, pages } = await getPagesForCards(
        result.cards.map((card) => card.id),
        currentContext?.tabId
      );

      const otherPages = pages.filter((page) => String(page.id) !== objectId);

      if (!pages || pages.length === 0 || otherPages.length === 0) {
        onStatusUpdate?.(
          'No Other Pages',
          `Cards on ${objectName} are not used on any other pages`,
          'warning'
        );
        setIsLoading(false);
        return;
      }

      const childPages = otherPages.map((page) => ({
        appId: page.appId || null,
        appName: page.appName || null,
        pageId: page.id,
        pageTitle: page.name,
        pageType: page.type
      }));

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading other pages...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        cardsByPage,
        childPages,
        currentContext,
        statusShown: true,
        type: 'getOtherPages'
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
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      isDisabled={isDisabled}
      isIconOnly={isLoading}
      isPending={isLoading}
      variant='tertiary'
      onPress={handleGetOtherPages}
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
