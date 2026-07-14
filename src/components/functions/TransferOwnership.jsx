import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';

export function TransferOwnership({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const isGroup = currentContext?.domoObject?.typeId === 'GROUP';

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
            onStatusUpdate,
            type: 'ownership'
          })
        }
      >
        <IconSwapHorizontal />
        Transfer Ownership
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {isGroup
          ? 'Transfer objects owned by this group to another group'
          : 'Transfer objects owned by this user to another user'}
      </Tooltip.Content>
    </Tooltip>
  );
}
