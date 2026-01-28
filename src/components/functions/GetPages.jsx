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
      const objectType = currentContext.domoObject.typeId;

      // Check if the current object is a valid type
      if (
        objectType !== 'PAGE' &&
        objectType !== 'DATA_APP_VIEW' &&
        objectType !== 'CARD'
      ) {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages. Current object is: ${currentContext.domoObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      const objectId = parseInt(currentContext.domoObject.id);
      const objectName =
        currentContext.domoObject.metadata?.name || `Unknown ${objectType}`;

      // Get appId from metadata for app studio pages
      const appId =
        objectType === 'DATA_APP_VIEW' &&
        currentContext.domoObject.metadata?.parent?.id
          ? parseInt(currentContext.domoObject.metadata.parent.id)
          : null;

      // For pages and cards, get child pages
      if (objectType === 'PAGE' || objectType === 'CARD') {
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
            objectId,
            objectName,
            objectType,
            appId,
            currentContext,
            childPages,
            statusShown: true
          });

          // Show status message
          await showStatus({
            onStatusUpdate,
            title: 'Opening Sidepanel',
            description: 'Loading pages...',
            status: 'success',
            timeout: 2000,
            inSidepanel
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
          `Get ${currentContext?.domoObject?.typeId === 'CARD' ? '' : 'Child '}Pages`
        )
      }
    </Button>
  );
}
