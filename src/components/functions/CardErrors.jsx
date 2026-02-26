import { Button, Spinner } from '@heroui/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { isSidepanel, openSidepanel, storeSidepanelData } from '@/utils';

export function CardErrors({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [isLoading, setIsLoading] = useState(false);
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    const tabId = currentContext?.tabId;
    if (!tabId) return;

    // Fetch initial error count
    chrome.runtime
      .sendMessage({ tabId, type: 'GET_CARD_ERRORS' })
      .then((response) => {
        if (response?.success) {
          setErrorCount(response.errors?.length || 0);
        }
      })
      .catch(() => {});

    // Listen for live updates
    const handleMessage = (message) => {
      if (message.type === 'CARD_ERRORS_UPDATED' && message.tabId === tabId) {
        setErrorCount(message.errorCount || 0);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [currentContext?.tabId]);

  if (errorCount === 0) return null;

  const handleViewErrors = async () => {
    setIsLoading(true);

    try {
      if (!isSidepanel()) {
        await storeSidepanelData({
          currentContext,
          type: 'cardErrors'
        });
        openSidepanel();
        return;
      }

      const response = await chrome.runtime.sendMessage({
        tabId: currentContext.tabId,
        type: 'GET_CARD_ERRORS'
      });

      if (!response?.success || !response.errors?.length) {
        onStatusUpdate?.('No Errors', 'No card errors found.', 'success', 2000);
        setIsLoading(false);
        return;
      }

      if (onCollapseActions) {
        await storeSidepanelData({
          message: 'Loading errors...',
          timestamp: Date.now(),
          type: 'loading'
        });
        onCollapseActions();
        await new Promise((resolve) => setTimeout(resolve, 175));
      }

      await storeSidepanelData({
        currentContext,
        errors: response.errors,
        type: 'cardErrors'
      });
    } catch (error) {
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to load errors',
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
      color='danger'
      isDisabled={isDisabled}
      isPending={isLoading}
      variant='tertiary'
      onPress={handleViewErrors}
    >
      {({ isPending }) => {
        if (isPending) {
          return <Spinner color='currentColor' size='sm' />;
        }

        return (
          <>
            <IconAlertTriangle stroke={1.5} /> Card Errors ({errorCount})
          </>
        );
      }}
    </Button>
  );
}
