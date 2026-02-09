import { useState, useRef } from 'react';
import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconClipboard, IconJson } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'motion/react';
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
      type: 'CLIPBOARD_COPIED',
      clipboardData: String(value),
      domoObject: domoObject?.toJSON?.() ?? domoObject
    })
    .catch(() => {
      // Ignore errors (e.g., no listeners)
    });
};

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
      typeId: typeModel.id,
      objectId: domoObject.id,
      baseUrl: domoObject.baseUrl,
      apiConfig: typeModel.api,
      requiresParent: typeModel.requiresParentForApi(),
      parentId: domoObject.parentId || null,
      throwOnError: false
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

export function Copy({
  currentContext,
  onStatusUpdate,
  isDisabled,
  navigateToCopiedRef
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);

  const typeId = currentContext?.domoObject?.typeId;
  const details = currentContext?.domoObject?.metadata?.details;

  const dropdownItems = [
    typeId === 'DATA_SOURCE' &&
      details?.streamId && {
        id: 'stream',
        label: 'Copy Stream ID'
      },
    typeId === 'DATA_SOURCE' &&
      details?.accountId && {
        id: 'account',
        label: 'Copy Account ID'
      },
    typeId === 'DATA_APP_VIEW' && {
      id: 'data-app',
      label: 'Copy App ID'
    },
    typeId === 'WORKSHEET_VIEW' && {
      id: 'worksheet',
      label: 'Copy Worksheet ID'
    }
  ].filter(Boolean);

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
    <Tooltip delay={400} closeDelay={0}>
      <Dropdown trigger='longPress' isDisabled={longPressDisabled}>
        <Button
          variant='tertiary'
          fullWidth
          isIconOnly
          onPress={handlePress}
          onPressStart={longPressDisabled ? undefined : handlePressStart}
          onPressEnd={longPressDisabled ? undefined : handlePressEnd}
          isDisabled={isDisabled || !currentContext?.domoObject?.id}
          className='relative overflow-visible'
        >
          {isCopied ? (
            <AnimatedCheck stroke={1.5} />
          ) : (
            <IconClipboard stroke={1.5} />
          )}
          <AnimatePresence>
            {isHolding && (
              <motion.div
                className='pointer-events-none absolute inset-0 overflow-hidden rounded-md'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                <motion.div
                  className='absolute top-1/2 left-1/2 aspect-square w-[200%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent-soft-hover'
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ duration: LONG_PRESS_SECONDS, ease: 'linear' }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </Button>
        <Dropdown.Popover className='w-fit min-w-48' placement='bottom left'>
          <Dropdown.Menu onAction={handleAction}>
            {dropdownItems.map((item) => (
              <Dropdown.Item key={item.id} id={item.id} textValue={item.label}>
                <IconClipboard className='size-4 shrink-0' />
                <Label>{item.label}</Label>
              </Dropdown.Item>
            ))}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Tooltip.Content className='flex flex-col items-center text-center'>
        <span>Copy ID</span>
        {!longPressDisabled && (
          <span className='italic'>Hold for more options</span>
        )}
      </Tooltip.Content>
    </Tooltip>
  );
}
