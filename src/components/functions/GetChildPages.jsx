import { Button, Spinner } from '@heroui/react';
import { IconCopy } from '@tabler/icons-react';
import { useState } from 'react';

import {
  isSidepanel,
  openSidepanel,
  storeSidepanelData,
  waitForChildPages
} from '@/utils';

export function GetChildPages({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetChildPages = async () => {
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

      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'getChildPages'
        });
        openSidepanel();
        return;
      }

      const result = await waitForChildPages(currentContext);

      if (!result.success) {
        onStatusUpdate?.('Error', result.error, 'danger', 3000);
        setIsLoading(false);
        return;
      }

      const childPages = result.childPages;

      if (!childPages || childPages.length === 0) {
        const typeId = currentContext.domoObject.typeId;
        const message =
          typeId === 'DATA_APP_VIEW'
            ? 'This app studio app has no pages.'
            : typeId === 'WORKSHEET_VIEW'
              ? 'This worksheet has no pages.'
              : 'This page has no child pages.';
        onStatusUpdate?.('No Pages', message, 'warning', 3000);
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading pages...',
          timestamp: Date.now(),
          type: 'loading'
        });

        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        childPages,
        currentContext,
        statusShown: true,
        type: 'getChildPages'
      });
    } catch (error) {
      console.error('[GetChildPages] Error:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to get child pages',
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
      isPending={isLoading}
      variant='tertiary'
      onPress={handleGetChildPages}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        const typeId = currentContext?.domoObject?.typeId;
        const label =
          typeId === 'DATA_APP_VIEW'
            ? 'Get App Pages'
            : typeId === 'WORKSHEET_VIEW'
              ? 'Get Worksheet Pages'
              : 'Get Child Pages';

        return (
          <>
            <IconCopy stroke={1.5} />
            {label}
          </>
        );
      }}
    </Button>
  );
}
