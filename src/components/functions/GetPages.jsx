import { useState } from 'react';
import { Button } from '@heroui/react';

export function GetPages({
  currentObject,
  currentInstance,
  onStatusUpdate,
  isDisabled
}) {
  const [isLoading, setIsLoading] = useState(false);

  const handleGetPages = async () => {
    setIsLoading(true);

    try {
      // Validate we have a current object and it's a page type
      if (!currentObject) {
        onStatusUpdate?.(
          'No Page Detected',
          'Please navigate to a Domo page and try again',
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Check if the current object is a page type
      const pageType = currentObject.typeId;
      if (pageType !== 'PAGE' && pageType !== 'DATA_APP_VIEW') {
        onStatusUpdate?.(
          'Invalid Object Type',
          `This function only works on pages. Current object is: ${currentObject.typeName}`,
          'danger'
        );
        setIsLoading(false);
        return;
      }

      // Get the current active tab for the window ID and origin
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab || !tab.url) {
        onStatusUpdate?.('Error', 'Could not get active tab', 'danger');
        setIsLoading(false);
        return;
      }

      const pageId = parseInt(currentObject.id);
      const pageName = currentObject.metadata?.name || 'Unknown Page';

      // Get appId from metadata for app studio pages
      const appId =
        pageType === 'DATA_APP_VIEW' && currentObject.metadata?.parent?.id
          ? parseInt(currentObject.metadata.parent.id)
          : null;

      // Store the page information for the sidepanel to use
      await chrome.storage.local.set({
        sidepanelDataList: {
          type: 'getPages',
          pageId,
          appId,
          pageType,
          pageName,
          currentInstance,
          timestamp: Date.now()
        }
      });

      // Open the sidepanel
      await chrome.sidePanel.open({
        windowId: tab.windowId
      });

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
      fullWidth
      onPress={handleGetPages}
      isDisabled={isDisabled}
      isLoading={isLoading}
    >
      Get Child Pages
    </Button>
  );
}
