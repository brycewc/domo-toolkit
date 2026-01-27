import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconClipboard, IconJson } from '@tabler/icons-react';
import { JsonStringifyOrder } from '@/utils';
export function Copy({
  currentContext,
  showStatus,
  isDisabled,
  navigateToCopiedRef
}) {
  const handlePress = () => {
    navigator.clipboard.writeText(currentContext?.domoObject?.id);
    showStatus(
      'Success',
      `Copied ${currentContext?.domoObject?.typeName} ID ${currentContext?.domoObject?.id} to clipboard`,
      'success',
      2000
    );
    // Trigger detection in NavigateToCopiedObject
    navigateToCopiedRef.current?.triggerDetection(
      currentContext?.domoObject?.id
    );
  };
  const handleAction = (key) => {
    switch (key) {
      case 'context-json':
        const contextJson = JsonStringifyOrder(currentContext, 2);
        navigator.clipboard.writeText(contextJson);
        showStatus(
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
        showStatus(
          'Success',
          `Copied Stream ID ${currentContext?.domoObject?.metadata?.details?.streamId} to clipboard`,
          'success',
          2000
        );
        // Trigger detection in NavigateToCopiedObject
        navigateToCopiedRef.current?.triggerDetection(
          currentContext?.domoObject?.metadata?.details?.streamId
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
          isDisabled={isDisabled || !currentContext?.domoObject?.id}
        >
          <IconClipboard size={4} />
        </Button>
        <Dropdown.Popover
          className='w-full min-w-[12rem]'
          placement='bottom left'
        >
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
          </Dropdown.Menu>
        </Dropdown.Popover>
      </Dropdown>

      <Tooltip.Content>Copy ID</Tooltip.Content>
    </Tooltip>
  );
}
