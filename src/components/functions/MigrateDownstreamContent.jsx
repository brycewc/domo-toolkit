import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';

export function MigrateDownstreamContent({ currentContext, onCollapseActions, onStatusUpdate }) {
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
            type: 'migrateDownstreamContent'
          })
        }
      >
        <IconSwapHorizontal />
        Migrate DataSet Content
      </Button>
      <Tooltip.Content className='max-w-60'>
        Migrate cards, dataset views, and dataflows that use this dataset to a new dataset
      </Tooltip.Content>
    </Tooltip>
  );
}
