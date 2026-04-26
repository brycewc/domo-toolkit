import { Button, Tooltip } from '@heroui/react';
import { IconUserPlus } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function Duplicate({ currentContext, onCollapseActions, onStatusUpdate }) {
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
            type: 'duplicate'
          })
        }
      >
        <IconUserPlus stroke={1.5} />
        Duplicate User
      </Button>
      <Tooltip.Content className='text-wrap break-normal'>
        Clone this user's role, profile, groups, and shared content
      </Tooltip.Content>
    </Tooltip>
  );
}
