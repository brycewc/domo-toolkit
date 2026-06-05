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
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-balance break-normal'
        offset={4}
      >
        Clone this user's role, profile, groups, and individually-shared content
      </Tooltip.Content>
    </Tooltip>
  );
}
