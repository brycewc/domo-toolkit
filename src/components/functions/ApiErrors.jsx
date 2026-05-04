import { Button, Chip, Tooltip } from '@heroui/react';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { launchView } from '@/utils';

export function ApiErrors({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
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
    <Tooltip closeDelay={100} delay={600}>
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
        <IconAlertTriangle stroke={1.5} /> View Errors
        <Chip
          className='h-5 w-5 items-center justify-center rounded-full'
          color='danger'
          size='sm'
          variant='soft'
        >
          {errorCount}
        </Chip>
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        List API errors captured on this page
      </Tooltip.Content>
    </Tooltip>
  );
}
