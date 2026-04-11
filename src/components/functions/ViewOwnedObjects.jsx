import { Button, Tooltip } from '@heroui/react';
import { IconListDetails } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function ViewOwnedObjects({
  currentContext,
  onCollapseActions,
  onStatusUpdate
}) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip closeDelay={0} delay={400}>
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
            type: 'viewOwnedObjects'
          })
        }
      >
        <IconListDetails stroke={1.5} />
        View Owned Objects
      </Button>
      <Tooltip.Content>
        View all objects owned by this user
      </Tooltip.Content>
    </Tooltip>
  );
}
