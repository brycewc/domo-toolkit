import { Button, Chip, Tooltip } from '@heroui/react';
import { IconTrash } from '@tabler/icons-react';

export function DeleteCurrentObject({
  currentContext,
  onStatusUpdate,
  isDisabled
}) {
  return (
    <Tooltip delay={400} closeDelay={0}>
      <Button
        fullWidth
        variant='danger'
        onPress={() => {
          onStatusUpdate?.(
            'Not Implemented',
            'Delete functionality is not implemented yet. Please check back in a future release.',
            'warning'
          );
        }}
        isDisabled={isDisabled || !currentContext?.domoObject}
        isIconOnly
      >
        <IconTrash className='h-4 w-4' />
      </Button>
      <Tooltip.Content>
        <span>Delete {currentContext?.domoObject?.metadata?.name || ''}</span>
        <Chip size='sm' variant='soft' color='accent'>
          {currentContext?.domoObject?.metadata?.parent
            ? `${currentContext.domoObject.metadata.parent.typeName} > ${currentContext.domoObject.typeName}`
            : `${currentContext?.domoObject?.typeName} (${currentContext?.domoObject?.typeId})`}
        </Chip>
      </Tooltip.Content>
    </Tooltip>
  );
}
