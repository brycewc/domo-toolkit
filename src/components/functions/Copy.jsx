import { useState, useRef } from 'react';
import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconClipboard, IconJson } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import { AnimatedCheck } from '@/components';
import { JsonStringifyOrder } from '@/utils';

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

export function Copy({
  currentContext,
  onStatusUpdate,
  isDisabled,
  navigateToCopiedRef
}) {
  const [isCopied, setIsCopied] = useState(false);
  const [isHolding, setIsHolding] = useState(false);
  const holdTimeoutRef = useRef(null);

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
  const handleAction = (key) => {
    switch (key) {
      case 'stream': {
        const streamId =
          currentContext?.domoObject?.metadata?.details?.streamId;
        navigator.clipboard.writeText(streamId);
        onStatusUpdate?.(
          'Success',
          `Copied Stream ID **${streamId}** to clipboard`,
          'success',
          2000
        );
        notifyClipboardUpdate(streamId);
        navigateToCopiedRef.current?.triggerDetection(streamId);
        break;
      }
      case 'data-app': {
        const appId = currentContext?.domoObject?.parentId;
        navigator.clipboard.writeText(appId);
        onStatusUpdate?.(
          'Success',
          `Copied App Studio App ID **${appId}** to clipboard`,
          'success',
          2000
        );
        notifyClipboardUpdate(appId);
        navigateToCopiedRef.current?.triggerDetection(appId);
        break;
      }
      case 'worksheet': {
        const worksheetId = currentContext?.domoObject?.parentId;
        navigator.clipboard.writeText(worksheetId);
        onStatusUpdate?.(
          'Success',
          `Copied Worksheet ID **${worksheetId}** to clipboard`,
          'success',
          2000
        );
        notifyClipboardUpdate(worksheetId);
        navigateToCopiedRef.current?.triggerDetection(worksheetId);
        break;
      }
      default:
        break;
    }
  };
  return (
    <Tooltip delay={400} closeDelay={0}>
      <Dropdown
        trigger='longPress'
        isDisabled={
          isDisabled ||
          !['DATA_SOURCE', 'DATA_APP_VIEW', 'WORKSHEET_VIEW'].includes(
            currentContext?.domoObject?.typeId
          )
        }
      >
        <Button
          variant='tertiary'
          fullWidth
          isIconOnly
          onPress={handlePress}
          onPressStart={handlePressStart}
          onPressEnd={handlePressEnd}
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
              <motion.svg
                className='pointer-events-none absolute inset-x-0.5 -inset-y-0.5 size-full'
                viewBox='0 0 100 100'
                preserveAspectRatio='none'
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
              >
                <motion.rect
                  x='2'
                  y='2'
                  width='96'
                  height='96'
                  rx='6'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='3'
                  className='text-accent'
                  style={{ vectorEffect: 'non-scaling-stroke' }}
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: LONG_PRESS_SECONDS, ease: 'linear' }}
                />
              </motion.svg>
            )}
          </AnimatePresence>
        </Button>
        <Dropdown.Popover className='w-fit min-w-48' placement='bottom left'>
          <Dropdown.Menu onAction={handleAction}>
            {currentContext?.domoObject?.typeId === 'DATA_SOURCE' && (
              <Dropdown.Item id='stream' textValue='Copy Stream ID'>
                <IconClipboard className='size-4 shrink-0' />
                <Label>Copy Stream ID</Label>
              </Dropdown.Item>
            )}
            {currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' && (
              <Dropdown.Item id='data-app' textValue='Copy App ID'>
                <IconClipboard className='size-4 shrink-0' />
                <Label>Copy App ID</Label>
              </Dropdown.Item>
            )}
            {currentContext?.domoObject?.typeId === 'WORKSHEET_VIEW' && (
              <Dropdown.Item id='worksheet' textValue='Copy Worksheet ID'>
                <IconClipboard className='size-4 shrink-0' />
                <Label>Copy Worksheet ID</Label>
              </Dropdown.Item>
            )}
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Tooltip.Content className='flex flex-col items-center text-center'>
        <span>Copy ID</span>
        {[''].includes(currentContext?.domoObject?.typeId)}
        <span className='italic'>Hold for more options</span>
      </Tooltip.Content>
    </Tooltip>
  );
}
