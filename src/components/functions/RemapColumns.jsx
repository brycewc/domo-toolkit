import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconColumnEdit from '@icons/column-edit.svg?react';

export function RemapColumns({ currentContext, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onCollapseActions,
            onStatusUpdate,
            type: 'remapColumns'
          })
        }
      >
        <IconColumnEdit />
        Remap Columns
      </Button>
      <Tooltip.Content className='max-w-60'>
        Repair cards, Beast Modes, dataflows, and dataset views that reference a renamed or removed column
      </Tooltip.Content>
    </Tooltip>
  );
}
