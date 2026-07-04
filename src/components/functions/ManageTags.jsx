import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconTagMultiple from '@icons/tag-multiple.svg?react';

export function ManageTags({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onCollapseActions,
            onStatusUpdate,
            type: 'manageTags'
          })
        }
      >
        <IconTagMultiple />
        Manage Tags
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Add or remove tags on this dataflow and its output datasets
      </Tooltip.Content>
    </Tooltip>
  );
}
