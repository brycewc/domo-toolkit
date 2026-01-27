import { useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import {
  waitForChildPages,
  isSidepanel,
  showStatus,
  storeSidepanelData,
  openSidepanel
} from '@/utils';

export function GetPages({ currentContext, onStatusUpdate, isDisabled }) {
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

      // Check if the current object is a page type
      const pageType = currentContext.domoObject.typeId;
      if (pageType !== 'PAGE' && pageType !== 'DATA_APP_VIEW') {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      const pageId = parseInt(currentContext.domoObject.id);
      const pageName =
        currentContext.domoObject.metadata?.name || 'Unknown Page';

      // Get appId from metadata for app studio pages
      const appId =
        pageType === 'DATA_APP_VIEW' &&
        currentContext.domoObject.metadata?.parent?.id
          ? parseInt(currentContext.domoObject.metadata.parent.id)
          : null;

      // For regular pages, wait for child pages to be loaded first
      if (pageType === 'PAGE') {
        const result = await waitForChildPages(currentContext);

        if (!result.success) {
          onStatusUpdate?.('Error', result.error, 'danger', 3000);
          setIsLoading(false);
          return;
        }

        const childPages = result.childPages;

        // If no child pages, show message
        if (childPages.length > 0) {
          const inSidepanel = isSidepanel();

          if (!inSidepanel) openSidepanel();

          // Store the page information for the sidepanel to use
          await storeSidepanelData({
            type: 'getPages',
            pageId,
            appId,
            pageType,
            currentContext,
            childPages,
            statusShown: false
          });

          // Show status message
          await showStatus({
            onStatusUpdate,
            title: 'Opening Sidepanel',
            description: 'Loading child pages...',
            status: 'success',
            timeout: 2000,
            inSidepanel
          });
        } else {
          onStatusUpdate?.(
            'No Child Pages',
            'This page has no child pages.',
            'accent',
            3000
          );
          setIsLoading(false);
          return;
        }
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
    >
      {({ isPending }) =>
        isPending ? (
          <Spinner color='currentColor' size='sm' />
        ) : (
          'Get Child Pages'
        )
      }
    </Button>
  );
}
