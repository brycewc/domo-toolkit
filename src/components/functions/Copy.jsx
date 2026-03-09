import { Button, Dropdown, Kbd, Label, Tooltip } from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
import { AnimatePresence, motion } from 'motion/react';
import { useRef, useState } from 'react';

import { AnimatedCheck } from '@/components';
import { DomoObject, getObjectType } from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import { executeInPage } from '@/utils';

const LONG_PRESS_DURATION = 1000; // ms - matches HeroUI's default
const LONG_PRESS_SECONDS = LONG_PRESS_DURATION / 1000;

/**
 * Notify background script about clipboard update so it can broadcast to all contexts
 * @param {string} value - The copied value (ID)
 * @param {Object} [domoObject] - Optional DomoObject with type and metadata info
 */
const notifyClipboardUpdate = (value, domoObject = null) => {
  if (!value) return;

  chrome.runtime
    .sendMessage({
      clipboardData: String(value),
      domoObject: domoObject?.toJSON?.() ?? domoObject,
      type: 'CLIPBOARD_COPIED'
    })
    .catch(() => {
      // Ignore errors (e.g., no listeners)
    });
};

export function Copy({
  currentContext,
  isDisabled,
  navigateToCopiedRef,
  onStatusUpdate
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);

  const typeId = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;

  let dropdownItems;
  switch (typeId) {
    case 'DATA_APP_VIEW':
      dropdownItems = [{ id: 'data-app', label: 'Copy App ID' }];
      break;
    case 'DATA_SOURCE':
      dropdownItems = [
        details?.streamId && { id: 'stream', label: 'Copy Stream ID' },
        details?.accountId && { id: 'account', label: 'Copy Account ID' },
        details?.type?.toLowerCase() === 'dataflow' && {
          id: 'dataflow',
          label: 'Copy Dataflow ID'
        }
      ].filter(Boolean);
      break;
    case 'WORKSHEET_VIEW':
      dropdownItems = [{ id: 'worksheet', label: 'Copy Worksheet ID' }];
      break;
    default:
      dropdownItems = [];
  }

  const longPressDisabled =
    isDisabled || !currentContext?.domoObject?.id || dropdownItems.length === 0;

  const handlePressStart = () => {
    setIsHolding(true);
    // Clear holding state after long press duration (dropdown will open)
    holdTimeoutRef.current = setTimeout(() => {
      setIsHolding(false);
    }, LONG_PRESS_DURATION);
  };

  const handlePressEnd = () => {
    setIsHolding(false);
    if (holdTimeoutRef.current) {
      clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }
  };

  const handlePress = () => {
    const domoObject = currentContext?.domoObject;
    const id = domoObject?.id;
    try {
      navigator.clipboard.writeText(id);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onStatusUpdate?.(
        'Success',
        `Copied ${domoObject?.typeName} ID **${id}** to clipboard`,
        'success',
        2000
      );
      notifyClipboardUpdate(id, domoObject);
      navigateToCopiedRef.current?.triggerDetection(id, domoObject);
    } catch (error) {
      onStatusUpdate?.(
        'Error',
        `Failed to copy ${domoObject?.typeName?.toLowerCase()} ID to clipboard`,
        'error',
        3000
      );
    }
  };
  const handleAction = async (key) => {
    const baseUrl = currentContext?.domoObject?.baseUrl;
    const tabId = currentContext?.tabId;

    switch (key) {
      case 'account': {
        const accountId =
          currentContext?.domoObject?.metadata?.details?.accountId;
        const accountObject = new DomoObject('ACCOUNT', accountId, baseUrl);
        navigator.clipboard.writeText(accountId);
        onStatusUpdate?.(
          'Success',
          `Copied Account ID **${accountId}** to clipboard`,
          'success',
          2000
        );
        await enrichDomoObject(accountObject, tabId);
        notifyClipboardUpdate(accountId, accountObject);
        navigateToCopiedRef.current?.triggerDetection(accountId, accountObject);
        break;
      }
      case 'data-app': {
        const appId = currentContext?.domoObject?.parentId;
        const appObject = new DomoObject('DATA_APP', appId, baseUrl);
        navigator.clipboard.writeText(appId);
        onStatusUpdate?.(
          'Success',
          `Copied App Studio App ID **${appId}** to clipboard`,
          'success',
          2000
        );
        await enrichDomoObject(appObject, tabId);
        notifyClipboardUpdate(appId, appObject);
        navigateToCopiedRef.current?.triggerDetection(appId, appObject);
        break;
      }
      case 'dataflow': {
        const dataflowId = currentContext?.domoObject?.parentId;
        const dataflowObject = new DomoObject(
          'DATAFLOW_TYPE',
          dataflowId,
          baseUrl
        );
        navigator.clipboard.writeText(dataflowId);
        onStatusUpdate?.(
          'Success',
          `Copied Dataflow ID **${dataflowId}** to clipboard`,
          'success',
          2000
        );
        await enrichDomoObject(dataflowObject, tabId);
        notifyClipboardUpdate(dataflowId, dataflowObject);
        navigateToCopiedRef.current?.triggerDetection(
          dataflowId,
          dataflowObject
        );
        break;
      }
      case 'stream': {
        const streamId =
          currentContext?.domoObject?.metadata?.details?.streamId;
        const streamObject = new DomoObject('STREAM', streamId, baseUrl);
        navigator.clipboard.writeText(streamId);
        onStatusUpdate?.(
          'Success',
          `Copied Stream ID **${streamId}** to clipboard`,
          'success',
          2000
        );
        await enrichDomoObject(streamObject, tabId);
        notifyClipboardUpdate(streamId, streamObject);
        navigateToCopiedRef.current?.triggerDetection(streamId, streamObject);
        break;
      }
      case 'worksheet': {
        const worksheetId = currentContext?.domoObject?.parentId;
        const worksheetObject = new DomoObject(
          'WORKSHEET',
          worksheetId,
          baseUrl
        );
        navigator.clipboard.writeText(worksheetId);
        onStatusUpdate?.(
          'Success',
          `Copied Worksheet ID **${worksheetId}** to clipboard`,
          'success',
          2000
        );
        await enrichDomoObject(worksheetObject, tabId);
        notifyClipboardUpdate(worksheetId, worksheetObject);
        navigateToCopiedRef.current?.triggerDetection(
          worksheetId,
          worksheetObject
        );
        break;
      }
      default:
        break;
    }
  };

  return (
    <Dropdown isDisabled={longPressDisabled} trigger='longPress'>
      <Tooltip closeDelay={0} delay={400}>
        <Button
          fullWidth
          isIconOnly
          className='relative overflow-visible'
          isDisabled={isDisabled || !currentContext?.domoObject?.id}
          variant='tertiary'
          onPress={handlePress}
          onPressEnd={longPressDisabled ? undefined : handlePressEnd}
          onPressStart={longPressDisabled ? undefined : handlePressStart}
        >
          {isCopied ? (
            <AnimatedCheck stroke={1.5} />
          ) : (
            <IconClipboard stroke={1.5} />
          )}
          <AnimatePresence>
            {isHolding && (
              <motion.div
                animate={{ opacity: 1 }}
                className='pointer-events-none absolute inset-0 overflow-hidden rounded-md'
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                initial={{ opacity: 0 }}
              >
                <motion.div
                  animate={{ scale: 1 }}
                  className='absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft-hover'
                  initial={{ scale: 0 }}
                  transition={{ duration: LONG_PRESS_SECONDS, ease: 'linear' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
        <Tooltip.Content className='flex flex-col items-center'>
          <div className='flex items-center gap-2'>
            <span>Copy ID</span>
            <Kbd className='text-xs'>
              <Kbd.Abbr
                keyValue={
                  (
                    navigator.userAgentData?.platform ?? navigator.platform
                  ).includes('Mac')
                    ? 'command'
                    : 'ctrl'
                }
              />
              <Kbd.Abbr keyValue='shift' />
              <Kbd.Content>1</Kbd.Content>
            </Kbd>
          </div>
          {!longPressDisabled && (
            <span className='italic'>Hold for more options</span>
          )}
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='w-fit min-w-48' placement='bottom left'>
        <Dropdown.Menu onAction={handleAction}>
          {dropdownItems.map((item) => (
            <Dropdown.Item id={item.id} key={item.id} textValue={item.label}>
              <IconClipboard className='size-4 shrink-0' />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

/**
 * Enrich a DomoObject with metadata from the API
 * @param {DomoObject} domoObject - The object to enrich
 * @param {number} tabId - The Chrome tab ID for page context execution
 * @returns {Promise<DomoObject>} The enriched object (mutated in place)
 */
async function enrichDomoObject(domoObject, tabId) {
  const typeModel = getObjectType(domoObject.typeId);
  if (!typeModel?.api) return domoObject;

  try {
    const params = {
      apiConfig: typeModel.api,
      baseUrl: domoObject.baseUrl,
      objectId: domoObject.id,
      parentId: domoObject.parentId || null,
      requiresParent: typeModel.requiresParentForApi(),
      throwOnError: false,
      typeId: typeModel.id
    };
    const metadata = await executeInPage(
      fetchObjectDetailsInPage,
      [params],
      tabId
    );
    if (metadata) {
      domoObject.metadata = metadata;
    }
  } catch (error) {
    console.warn('[Copy] Failed to enrich object:', error);
  }
  return domoObject;
}
