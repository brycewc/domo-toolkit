import { useState } from 'react';
import { Button } from '@heroui/react';
import { openSidepanel } from '@/utils';

export function GetPages({ currentContext, onStatusUpdate, isDisabled }) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetPages = () => {
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

      // Then store the page information for the sidepanel to use
      chrome.storage.local.set({
        sidepanelDataList: {
          type: 'getPages',
          pageId,
          appId,
          pageType,
          pageName,
          currentContext: currentContext.toJSON(),
          tabId: currentContext?.tabId || null,
          timestamp: Date.now()
        }
      });

      // Open the sidepanel
      openSidepanel();

      window.close();

      onStatusUpdate?.(
        'Opening Sidepanel',
        'Loading child pages...',
        'success',
        2000
      );
    } catch (error) {
      console.error('Error opening sidepanel:', error);
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
      isLoading={isLoading}
    >
      Get Child Pages
    </Button>
  );
}
