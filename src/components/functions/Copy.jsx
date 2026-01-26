import { Button, Dropdown, Label, Tooltip } from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
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
      'success'
    );
    // Trigger detection in NavigateToCopiedObject
    navigateToCopiedRef.current?.triggerDetection(
      currentContext?.domoObject?.id
    );
  };
  const handleAction = (key) => {
    if (key === 'stream') {
      navigator.clipboard.writeText(
        currentContext?.domoObject?.metadata?.details?.streamId
      );
      showStatus(
        'Success',
        `Copied Stream ID ${currentContext?.domoObject?.metadata?.details?.streamId} to clipboard`,
        'success'
      );
      // Trigger detection in NavigateToCopiedObject
      navigateToCopiedRef.current?.triggerDetection(
        currentContext?.domoObject?.metadata?.details?.streamId
      );
    }
  };
  return (
    <Tooltip delay={400} closeDelay={0}>
      <Dropdown
        trigger='longPress'
        isDisabled={
          isDisabled || !(currentContext?.domoObject?.typeId === 'DATA_SOURCE')
        }
      >
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
            {currentContext?.domoObject?.typeId === 'DATA_SOURCE' && (
              <Dropdown.Item id='stream' textValue='Copy Stream ID'>
                <IconClipboard size={4} />
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
