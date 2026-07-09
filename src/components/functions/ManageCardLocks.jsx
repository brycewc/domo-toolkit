import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconLockClosed from '@icons/lock-closed.svg?react';

export function ManageCardLocks({ currentContext, isDisabled, onStatusUpdate }) {
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
            onStatusUpdate,
            type: 'manageCardLocks'
          })
        }
      >
        <IconLockClosed />
        Manage Card Locks
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Lock or unlock cards on this object
      </Tooltip.Content>
    </Tooltip>
  );
}
