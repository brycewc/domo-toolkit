import { Button, Tooltip } from '@heroui/react';
import { IconUserPlus } from '@tabler/icons-react';
import { useState } from 'react';

import { useStatusBar } from '@/hooks';
import { shareWithSelf } from '@/services';
import { isSidepanel } from '@/utils';

const SUPPORTED_TYPES = [
  'DATA_SOURCE',
  'PAGE',
  'DATA_APP',
  'DATA_APP_VIEW',
  'APP'
];

export function ShareWithSelf({ currentContext, isDisabled, onStatusUpdate }) {
  const [isSharing, setIsSharing] = useState(false);
  const { showPromiseStatus } = useStatusBar();

  const handleShare = () => {
    if (
      !currentContext?.domoObject ||
      !currentContext.domoObject.id ||
      !currentContext.domoObject.typeId
    ) {
      onStatusUpdate?.(
        'No Object Detected',
        'Please navigate to a valid Domo object and try again',
        'danger'
      );
      return;
    }

    if (!SUPPORTED_TYPES.includes(currentContext.domoObject.typeId)) {
      onStatusUpdate?.(
        'Unsupported Object Type',
        `Share with Self is not supported for ${currentContext.domoObject.typeName}. Supported types: DataSet, Page, Studio App, App Studio Page, Custom App Design.`,
        'danger'
      );
      return;
    }

    if (currentContext.domoObject.typeId === 'DATA_SOURCE') {
      if (!currentContext.domoObject.metadata?.details?.accountId) {
        onStatusUpdate?.(
          'Missing Account Information',
          'DataSet account information not found. Please refresh and try again.',
          'danger'
        );
        return;
      }
    }

    setIsSharing(true);

    const objectName =
      currentContext.domoObject.metadata?.name ||
      currentContext.domoObject.typeName;

    const promise = shareWithSelf({
      object: currentContext.domoObject,
      tabId: currentContext.tabId,
      userId: currentContext.user?.id
    }).then((result) => {
      const tabId = currentContext?.tabId;
      chrome.tabs.reload(tabId);

      if (tabId) {
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.runtime.sendMessage({ tabId, type: 'DETECT_CONTEXT' });
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      }

      const inSidepanel = isSidepanel();
      if (!inSidepanel) window.close();

      return result;
    });

    showPromiseStatus(promise, {
      error: (err) => err.message,
      loading: `Sharing **${objectName}** with yourself…`,
      success: () => `**${objectName}** shared successfully`
    });

    promise.finally(() => setIsSharing(false));
  };

  const isSupportedType =
    currentContext?.domoObject?.typeId &&
    SUPPORTED_TYPES.includes(currentContext.domoObject.typeId);
  const buttonDisabled =
    isDisabled || isSharing || !currentContext?.domoObject || !isSupportedType;

  return (
    <Tooltip closeDelay={0} delay={400} disabled={!buttonDisabled}>
      <Button
        fullWidth
        isIconOnly
        isDisabled={buttonDisabled}
        variant='tertiary'
        onPress={handleShare}
      >
        <IconUserPlus stroke={1.5} />
      </Button>
      <Tooltip.Content>
        {currentContext?.domoObject?.typeId === 'DATA_SOURCE' &&
        currentContext?.domoObject?.metadata?.details?.accountId ? (
              <>
                Share <span className='font-semibold'>dataset account</span> with
                yourself
              </>
            ) : (
              <>
                Share{' '}
                <span className='font-semibold lowercase'>
                  {currentContext?.domoObject?.name}
                </span>{' '}
                with yourself
              </>
            )}
      </Tooltip.Content>
    </Tooltip>
  );
}
