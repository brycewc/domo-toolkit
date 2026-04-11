import { Button } from '@heroui/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { launchView } from '@/utils';

export function ApiErrors({
  currentContext,
  isDisabled,
  onCollapseActions,
  onStatusUpdate
}) {
  const [errorCount, setErrorCount] = useState(0);

  useEffect(() => {
    const tabId = currentContext?.tabId;
    if (!tabId) return;

    // Fetch initial error count
    chrome.runtime
      .sendMessage({ tabId, type: 'GET_API_ERRORS' })
      .then((response) => {
        if (response?.success) {
          setErrorCount(response.errors?.length || 0);
        }
      })
      .catch(() => {});

    // Listen for live updates
    const handleMessage = (message) => {
      if (message.type === 'API_ERRORS_UPDATED' && message.tabId === tabId) {
        setErrorCount(message.errorCount || 0);
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [currentContext?.tabId]);

  if (errorCount === 0) return null;

  return (
    <Button
      fullWidth
      className='min-w-36 flex-1 whitespace-normal'
      color='danger'
      isDisabled={isDisabled}
      variant='tertiary'
      onPress={() =>
        launchView({
          currentContext,
          onCollapseActions,
          onStatusUpdate,
          type: 'apiErrors'
        })
      }
    >
      <IconAlertTriangle stroke={1.5} /> View Errors ({errorCount})
    </Button>
  );
}
