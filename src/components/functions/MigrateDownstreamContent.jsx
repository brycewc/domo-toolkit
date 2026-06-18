import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconArrowsHorizontalBox from '@icons/arrows-horizontal-box.svg?react';

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
        <IconArrowsHorizontalBox />
        Migrate DataSet Content
      </Button>
      <Tooltip.Content className='max-w-60'>
        Migrate cards, dataset views, and dataflows that use this dataset to a new dataset
      </Tooltip.Content>
    </Tooltip>
  );
}
