import { Button, Tooltip } from '@heroui/react';
import { IconListDetails } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function GetOwnedObjects({ currentContext, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip closeDelay={100} delay={400}>
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
            type: 'getOwnedObjects'
          })
        }
      >
        <IconListDetails stroke={1.5} />
        Get Owned Objects
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        List all objects of all types owned by this user
      </Tooltip.Content>
    </Tooltip>
  );
}
