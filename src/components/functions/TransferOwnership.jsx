import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconArrowsHorizontalBox from '@icons/arrows-horizontal-box.svg?react';

export function TransferOwnership({ currentContext, onCollapseActions, onStatusUpdate }) {
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
            autoEnableSelectionMode: true,
            currentContext,
            onCollapseActions,
            onStatusUpdate,
            type: 'ownership'
          })
        }
      >
        <IconArrowsHorizontalBox />
        Transfer Ownership
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Transfer objects owned by this user to another user
      </Tooltip.Content>
    </Tooltip>
  );
}
