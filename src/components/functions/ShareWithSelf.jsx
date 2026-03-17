import { Button, Tooltip } from '@heroui/react';
import { IconUserPlus } from '@tabler/icons-react';
import { useState } from 'react';

import { useStatusBar } from '@/hooks';
import { shareWithSelf } from '@/services';
import { isSidepanel } from '@/utils';

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

    if (!isSupportedForShare(currentContext.domoObject)) {
      onStatusUpdate?.(
        'Unsupported Object Type',
        `Share with Self is not supported for ${currentContext.domoObject.typeName}. Supported types: DataSet, Page, Studio App, App Studio Page, Custom App Design, DomoApp Card.`,
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

    const label = `${currentContext.domoObject?.typeName === 'DATA_SOURCE' ? 'Account' : currentContext.domoObject?.typeName} ${currentContext.domoObject?.id}`;

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
      loading: `Sharing **${label}** with yourself…`,
      success: () => `**${label}** shared successfully`
    });

    promise.finally(() => setIsSharing(false));
  };

  const isSupportedType = isSupportedForShare(currentContext?.domoObject);
  const contentAdminTypes = [
    'CARD',
    'DATA_APP',
    'DATA_APP_VIEW',
    'PAGE',
    'WORKSHEET_VIEW'
  ];
  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const needsContentAdmin =
    contentAdminTypes.includes(currentContext?.domoObject?.typeId) &&
    !userRights.includes('content.admin');
  const needsAccountAdmin =
    currentContext?.domoObject?.typeId === 'DATA_SOURCE' &&
    !userRights.includes('account.admin');
  const needsAppAdmin =
    currentContext?.domoObject?.typeId === 'APP' &&
    !userRights.includes('app.admin');
  const buttonDisabled =
    isDisabled ||
    isSharing ||
    !currentContext?.domoObject ||
    !isSupportedType ||
    needsContentAdmin ||
    needsAccountAdmin ||
    needsAppAdmin;

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

function isSupportedForShare(domoObject) {
  const SUPPORTED_TYPES = [
    'APP',
    'CARD',
    'DATA_APP',
    'DATA_APP_VIEW',
    'DATA_SOURCE',
    'PAGE',
    'WORKSHEET_VIEW'
  ];
  if (!domoObject?.typeId) return false;
  if (!SUPPORTED_TYPES.includes(domoObject.typeId)) return false;
  if (domoObject.typeId === 'CARD') {
    return domoObject.metadata?.details?.type === 'domoapp';
  }
  if (domoObject.typeId === 'DATA_SOURCE') {
    return !!domoObject.metadata?.details?.accountId;
  }
  return true;
}
