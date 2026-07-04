import { Button, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconWorkspace from '@icons/workspace.svg?react';

export function GetWorkspaces({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
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
            onCollapseActions,
            onStatusUpdate,
            type: 'getWorkspaces'
          })
        }
      >
        {({ isPending: pending }) =>
          pending ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconWorkspace />
              Get Workspaces
            </>
          )
        }
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        List the workspaces this object has been added to
      </Tooltip.Content>
    </Tooltip>
  );
}
