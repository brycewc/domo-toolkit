import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconListBulleted from '@icons/list-bulleted.svg?react';

export function GetOwnedObjects({ currentContext, onCollapseActions, onStatusUpdate }) {
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
            type: 'ownership'
          })
        }
      >
        <IconListBulleted />
        Get Owned Objects
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        List all objects of all types owned by this user
      </Tooltip.Content>
    </Tooltip>
  );
}
