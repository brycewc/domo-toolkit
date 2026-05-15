import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconArrowRight from '@icons/arrow-right.svg?react';

export function MigrateDownstreamContent({ currentContext, onCollapseActions, onStatusUpdate }) {
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
            type: 'migrateDownstream'
          })
        }
      >
        <IconArrowRight />
        Migrate Downstream Content
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        Migrate cards, dataset views, and dataflows that use this dataset to a new dataset
      </Tooltip.Content>
    </Tooltip>
  );
}
