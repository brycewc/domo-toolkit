import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconPersonPlus from '@icons/person-plus.svg?react';

export function Duplicate({ currentContext, onCollapseActions, onStatusUpdate }) {
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
            type: 'duplicate'
          })
        }
      >
        <IconPersonPlus />
        Duplicate User
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Clone this user into a new user, or add their groups and individually-shared content to an existing user
      </Tooltip.Content>
    </Tooltip>
  );
}
