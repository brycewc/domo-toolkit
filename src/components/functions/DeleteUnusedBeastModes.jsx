import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconBeastMode from '@icons/beast-mode.svg?react';

export function DeleteUnusedBeastModes({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        isPending={isPending}
        variant='tertiary'
        onPress={() => launch({ currentContext, onCollapseActions, onStatusUpdate, type: 'deleteUnusedBeastModes' })}
      >
        <IconBeastMode />
        Delete Unused Beast Modes
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Find Beast Modes and Variables with no active usage and delete them in bulk
      </Tooltip.Content>
    </Tooltip>
  );
}
