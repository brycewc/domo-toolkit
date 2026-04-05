import { Button, Dropdown, Kbd, Label, Tooltip } from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
import { useState } from 'react';

import { AnimatedCheck } from '@/components';
import { useLongPress } from '@/hooks';

export function Copy({ currentContext, isDisabled, onStatusUpdate }) {
  const [isCopied, setIsCopied] = useState(false);
  const { LongPressOverlay, pressProps } = useLongPress();

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
    switch (key) {
      case 'account': {
        const accountId =
          currentContext?.domoObject?.metadata?.details?.accountId;
        navigator.clipboard.writeText(accountId);
        onStatusUpdate?.(
          'Success',
          `Copied Account ID **${accountId}** to clipboard`,
          'success',
          2000
        );
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
        break;
      }
      case 'dataflow': {
        const dataflowId = currentContext?.domoObject?.parentId;
        navigator.clipboard.writeText(dataflowId);
        onStatusUpdate?.(
          'Success',
          `Copied Dataflow ID **${dataflowId}** to clipboard`,
          'success',
          2000
        );
        break;
      }
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
          {...(longPressDisabled ? {} : pressProps)}
          {...(longPressDisabled ? {} : pressProps)}
        >
          {isCopied ? (
            <AnimatedCheck stroke={1.5} />
          ) : (
            <IconClipboard stroke={1.5} />
          )}
          <LongPressOverlay />
          <LongPressOverlay />
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
              <IconClipboard className='size-5 shrink-0' stroke={1.5} />
              <IconClipboard className='size-5 shrink-0' stroke={1.5} />
              <Label>{item.label}</Label>
            </Dropdown.Item>
          ))}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}
