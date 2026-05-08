import { Button, Tooltip } from '@heroui/react';
import { IconListDetails } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function GetOwnedObjects({ currentContext, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='h-auto min-h-9 min-w-36 flex-1 whitespace-normal py-1.5'
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
        <IconListDetails stroke={1.5} />
        Get Owned Objects
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        List all objects of all types owned by this user
      </Tooltip.Content>
    </Tooltip>
  );
}
