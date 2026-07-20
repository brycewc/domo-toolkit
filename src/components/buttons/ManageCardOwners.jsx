import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconPersonCard from '@icons/person-card.svg?react';

export function ManageCardOwners({ currentContext, isDisabled, onStatusUpdate }) {
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
            type: 'manageCardOwners'
          })
        }
      >
        <IconPersonCard />
        Manage Card Owners
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Add or remove users and groups as owners across all cards on this object
      </Tooltip.Content>
    </Tooltip>
  );
}
