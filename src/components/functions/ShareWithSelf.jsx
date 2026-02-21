import { useState } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { IconUserPlus } from '@tabler/icons-react';
import { shareWithSelf } from '@/services';
import { useStatusBar } from '@/hooks';
import { isSidepanel } from '@/utils';

const SUPPORTED_TYPES = [
  'DATA_SOURCE',
  'PAGE',
  'DATA_APP',
  'DATA_APP_VIEW',
  'APP'
];

export function ShareWithSelf({ currentContext, onStatusUpdate, isDisabled }) {
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
      userId: currentContext.user?.id,
      tabId: currentContext.tabId
    }).then((result) => {
      const tabId = currentContext?.tabId;
      chrome.tabs.reload(tabId);

      if (tabId) {
        const listener = (updatedTabId, changeInfo) => {
          if (updatedTabId === tabId && changeInfo.status === 'complete') {
            chrome.tabs.onUpdated.removeListener(listener);
            chrome.runtime.sendMessage({ type: 'DETECT_CONTEXT', tabId });
          }
        };
        chrome.tabs.onUpdated.addListener(listener);
      }

      const inSidepanel = isSidepanel();
      if (!inSidepanel) window.close();

      return result;
    });

    showPromiseStatus(promise, {
      loading: `Sharing **${objectName}** with yourself…`,
      success: () => `**${objectName}** shared successfully`,
      error: (err) => err.message
    });

    promise.finally(() => setIsSharing(false));
  };

  const isSupportedType =
    currentContext?.domoObject?.typeId &&
    SUPPORTED_TYPES.includes(currentContext.domoObject.typeId);
  const buttonDisabled =
    isDisabled || isSharing || !currentContext?.domoObject || !isSupportedType;

  return (
    <Tooltip delay={400} closeDelay={0} disabled={!buttonDisabled}>
      <Button
        variant='tertiary'
        fullWidth
        isIconOnly
        onPress={handleShare}
        isDisabled={buttonDisabled}
      >
        <IconUserPlus stroke={1.5} />
      </Button>
      <Tooltip.Content>
        {currentContext?.domoObject?.typeId === 'DATA_SOURCE' ? (
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
