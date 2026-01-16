import { Button, Chip, Tooltip } from '@heroui/react';
import { IconTrash } from '@tabler/icons-react';

export function DeleteCurrentObject({
  currentObject,
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
        isDisabled={isDisabled || !currentObject}
        isIconOnly
      >
        <IconTrash className='h-4 w-4' />
      </Button>
      <Tooltip.Content>
        <span>Delete {currentObject?.metadata?.name || ''}</span>
        <Chip size='sm' variant='soft' color='accent'>
          {currentObject?.metadata?.parent
            ? `${currentObject?.metadata.parent.typeName} > ${currentObject?.typeName}`
            : `${currentObject?.typeName} (${currentObject?.typeId})`}
        </Chip>
      </Tooltip.Content>
    </Tooltip>
  );
}
