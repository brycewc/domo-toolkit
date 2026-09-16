import { Button, Tooltip } from '@heroui/react';
import { useState } from 'react';

import { DisabledTooltip } from '@/components/DisabledTooltip';
import { useStatusBar } from '@/hooks/useStatusBar';
import { getAccountIdsForDomoObject } from '@/services/accounts';
import { shareWithSelf } from '@/services/share';
import { isDatasetTypeId } from '@/utils/datasetTypes';
import { isSidepanel } from '@/utils/sidepanel';
import IconPersonPlus from '@icons/person-plus.svg?react';

export function ShareWithSelf({ currentContext, isDisabled, onStatusUpdate }) {
  const [isSharing, setIsSharing] = useState(false);
  const { showPromiseStatus } = useStatusBar();

  const handleShare = () => {
    if (!currentContext?.domoObject || !currentContext.domoObject.id || !currentContext.domoObject.typeId) {
      onStatusUpdate?.('No Object Detected', 'Please navigate to a valid Domo object and try again', 'danger');
      return;
    }

    if (!isSupportedForShare(currentContext.domoObject)) {
      onStatusUpdate?.(
        'Unsupported Object Type',
        `Share with Self is not supported for ${currentContext.domoObject.typeName}. Supported types: DataSet, Page, Studio App, App Studio Page, Custom App Design, DomoApp Card, Task Center Queue, Task Center Task.`,
        'danger'
      );
      return;
    }

    if (isDatasetTypeId(currentContext.domoObject.typeId)) {
      if (getAccountIdsForDomoObject(currentContext.domoObject).length === 0) {
        onStatusUpdate?.(
          'Missing Account Information',
          'DataSet account information not found. Please refresh and try again.',
          'danger'
        );
        return;
      }
    }

    setIsSharing(true);

    let label;
    if (isDatasetTypeId(currentContext.domoObject?.typeId)) {
      const accountIds = getAccountIdsForDomoObject(currentContext.domoObject);
      label =
        accountIds.length > 1 ? `${accountIds.length} accounts (${accountIds.join(', ')})` : `Account ${accountIds[0]}`;
    } else if (queueIdForShare(currentContext.domoObject)) {
      label = `Queue ${queueIdForShare(currentContext.domoObject)}`;
    } else {
      label = `${currentContext.domoObject?.typeName} ${currentContext.domoObject?.id}`;
    }

    const promise = shareWithSelf({
      object: currentContext.domoObject,
      tabId: currentContext.tabId,
      userId: currentContext.user?.id
    }).then(async (result) => {
      const tabId = currentContext?.tabId;
      if (tabId) {
        // Wait for the reload to complete BEFORE closing the popup or sending
        // DETECT_CONTEXT. Closing the popup tears down its renderer, which
        // kills any pending tabs.onUpdated listener registered here and drops
        // any chrome.runtime messages still in flight from that context. The
        // background's own onUpdated listener also won't help — it only acts
        // on `changeInfo.url`, which a same-URL reload doesn't carry.
        await new Promise((resolve) => {
          const timeoutId = setTimeout(() => {
            chrome.tabs.onUpdated.removeListener(listener);
            resolve();
          }, 8000);
          const listener = (updatedTabId, changeInfo) => {
            if (updatedTabId === tabId && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timeoutId);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
          chrome.tabs.reload(tabId);
        });
        await chrome.runtime.sendMessage({ tabId, type: 'DETECT_CONTEXT' });
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
  const contentAdminTypes = ['CARD', 'DATA_APP', 'DATA_APP_VIEW', 'PAGE', 'WORKSHEET', 'WORKSHEET_VIEW'];
  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const needsContentAdmin =
    contentAdminTypes.includes(currentContext?.domoObject?.typeId) && !userRights.includes('content.admin');
  const needsAccountAdmin =
    isDatasetTypeId(currentContext?.domoObject?.typeId) && !userRights.includes('account.admin');
  const needsAppAdmin =
    ['APP', 'RYUU_APP'].includes(currentContext?.domoObject?.typeId) && !userRights.includes('app.admin');
  const taskCenterTypes = ['HOPPER_QUEUE', 'HOPPER_TASK'];
  const isTaskCenter = taskCenterTypes.includes(currentContext?.domoObject?.typeId);
  const needsTasksAdmin = isTaskCenter && !userRights.includes('tasks.admin');
  const isTaskWithoutQueue =
    currentContext?.domoObject?.typeId === 'HOPPER_TASK' && !queueIdForShare(currentContext.domoObject);
  const typeName = currentContext?.domoObject?.typeName;
  const isDataSource = isDatasetTypeId(currentContext?.domoObject?.typeId);
  const hasAccounts = isDataSource && getAccountIdsForDomoObject(currentContext.domoObject).length > 0;
  // Persistent reasons the action is unavailable (sharing-in-progress is
  // transient, the button disables itself while the share runs, so it is excluded).
  const disabledReason =
    isDisabled || !currentContext?.domoObject
      ? 'Navigate to a Domo object use share with self'
      : isDataSource && !hasAccounts
        ? 'This dataset has no connected account to share'
        : isTaskWithoutQueue
          ? "This task's queue could not be found, so there is nothing to share"
          : !isSupportedType
            ? `Share with self isn't supported for ${typeName?.toLowerCase()}s`
            : needsContentAdmin
              ? `You need the Content Admin permission to share this ${typeName?.toLowerCase()}`
              : needsAccountAdmin
                ? "You need the Account Admin permission to share this dataset's account(s)"
                : needsAppAdmin
                  ? 'You need the App Admin permission to share this app'
                  : needsTasksAdmin
                    ? 'You need the Task Center Admin permission to share this queue'
                    : null;

  if (disabledReason) {
    return (
      <DisabledTooltip content={disabledReason}>
        <Button fullWidth isIconOnly variant='tertiary'>
          <IconPersonPlus />
        </Button>
      </DisabledTooltip>
    );
  }

  return (
    <Tooltip delay={200}>
      <Button fullWidth isIconOnly isDisabled={isSharing} variant='tertiary' onPress={handleShare}>
        <IconPersonPlus />
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {isDataSource ? (
          <>Share dataset account(s) with yourself</>
        ) : currentContext?.domoObject?.typeId === 'HOPPER_TASK' ? (
          <>Share this task&rsquo;s queue with yourself</>
        ) : (
          <>Share {typeName?.toLowerCase()} with yourself</>
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
    'DATA_FUSION',
    'DATA_MODEL',
    'DATA_SOURCE',
    'HOPPER_QUEUE',
    'HOPPER_TASK',
    'PAGE',
    'RYUU_APP',
    'VIEW',
    'WORKSHEET',
    'WORKSHEET_VIEW'
  ];
  if (!domoObject?.typeId) return false;
  if (!SUPPORTED_TYPES.includes(domoObject.typeId)) return false;
  if (domoObject.typeId === 'CARD') {
    return domoObject.metadata?.details?.type === 'domoapp';
  }
  if (isDatasetTypeId(domoObject.typeId)) {
    return getAccountIdsForDomoObject(domoObject).length > 0;
  }
  if (domoObject.typeId === 'HOPPER_TASK') {
    return !!queueIdForShare(domoObject);
  }
  return true;
}

function queueIdForShare(domoObject) {
  if (domoObject?.typeId === 'HOPPER_QUEUE') return domoObject.id ?? null;
  if (domoObject?.typeId !== 'HOPPER_TASK') return null;
  return domoObject.parentId || domoObject.metadata?.details?.queueId || null;
}
