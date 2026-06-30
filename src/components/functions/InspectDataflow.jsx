import { Button, Spinner, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconEye from '@icons/eye.svg?react';

export function InspectDataflow({ currentContext, isDisabled, onCollapseActions, onStatusUpdate }) {
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
            type: 'inspectDataflow'
          })
        }
      >
        {({ isPending: pending }) =>
          pending ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            <>
              <IconEye /> Inspect Dataflow
            </>
          )
        }
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        View and search every transform in this dataflow, with SQL formatted like Domo's editor
      </Tooltip.Content>
    </Tooltip>
  );
}
