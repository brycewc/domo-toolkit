import { useState, useRef } from 'react';
import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconCheck, IconClipboard, IconJson } from '@tabler/icons-react';
import { motion, AnimatePresence } from 'motion/react';
import { JsonStringifyOrder } from '@/utils';

const LONG_PRESS_DURATION = 1000; // ms - matches HeroUI's default
const LONG_PRESS_SECONDS = LONG_PRESS_DURATION / 1000;

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
    try {
      navigator.clipboard.writeText(currentContext?.domoObject?.id);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
      onStatusUpdate?.(
        'Success',
        `Copied ${currentContext?.domoObject?.typeName} ID **${currentContext?.domoObject?.id}** to clipboard`,
        'success',
        2000
      );
      navigateToCopiedRef.current?.triggerDetection(
        currentContext?.domoObject?.id
      );
    } catch (error) {
      onStatusUpdate?.(
        'Error',
        `Failed to copy ${currentContext?.domoObject?.typeName.toLowerCase()} ID to clipboard`,
        'error',
        3000
      );
    }
  };
  const handleAction = (key) => {
    switch (key) {
      case 'context-json':
        const contextJson = JsonStringifyOrder(currentContext, 2);
        navigator.clipboard.writeText(contextJson);
        onStatusUpdate?.(
          'Success',
          `Copied Context JSON to clipboard`,
          'success',
          2000
        );
        break;
      case 'stream':
        navigator.clipboard.writeText(
          currentContext?.domoObject?.metadata?.details?.streamId
        );
        onStatusUpdate?.(
          'Success',
          `Copied Stream ID **${currentContext?.domoObject?.metadata?.details?.streamId}** to clipboard`,
          'success',
          2000
        );
        // Trigger detection in NavigateToCopiedObject
        navigateToCopiedRef.current?.triggerDetection(
          currentContext?.domoObject?.metadata?.details?.streamId
        );
        break;
      case 'data-app':
        navigator.clipboard.writeText(currentContext?.domoObject?.parentId);
        onStatusUpdate?.(
          'Success',
          `Copied App Studio App ID **${currentContext?.domoObject?.parentId}** to clipboard`,
          'success',
          2000
        );
        // Trigger detection in NavigateToCopiedObject
        navigateToCopiedRef.current?.triggerDetection(
          currentContext?.domoObject?.parentId
        );
        break;
      case 'worksheet':
        navigator.clipboard.writeText(currentContext?.domoObject?.parentId);
        onStatusUpdate?.(
          'Success',
          `Copied Worksheet ID **${currentContext?.domoObject?.parentId}** to clipboard`,
          'success',
          2000
        );
        // Trigger detection in NavigateToCopiedObject
        navigateToCopiedRef.current?.triggerDetection(
          currentContext?.domoObject?.parentId
        );
        break;
      default:
        break;
    }
  };
  return (
    <Tooltip delay={400} closeDelay={0}>
      <Dropdown trigger='longPress' isDisabled={isDisabled}>
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
          {isCopied ? <IconCheck size={4} /> : <IconClipboard size={4} />}
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
            <Dropdown.Item id='context-json' textValue='Copy Context JSON'>
              <IconJson size={4} className='size-4 shrink-0' />
              <Label>Copy Context JSON</Label>
            </Dropdown.Item>
            {currentContext?.domoObject?.typeId === 'DATA_SOURCE' && (
              <Dropdown.Item id='stream' textValue='Copy Stream ID'>
                <IconClipboard size={4} className='size-4 shrink-0' />
                <Label>Copy Stream ID</Label>
              </Dropdown.Item>
            )}
            {currentContext?.domoObject?.typeId === 'DATA_APP_VIEW' && (
              <Dropdown.Item id='data-app' textValue='Copy App ID'>
                <IconClipboard size={4} className='size-4 shrink-0' />
                <Label>Copy App ID</Label>
              </Dropdown.Item>
            )}
            {currentContext?.domoObject?.typeId === 'WORKSHEET_VIEW' && (
              <Dropdown.Item id='worksheet' textValue='Copy Worksheet ID'>
                <IconClipboard size={4} className='size-4 shrink-0' />
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
