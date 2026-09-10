import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';

export function MigrateDownstreamContent({ currentContext, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();
  const isBeastMode = currentContext?.domoObject?.typeId === 'BEAST_MODE_FORMULA';

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
            onStatusUpdate,
            type: isBeastMode ? 'migrateBeastModeUsage' : 'migrateDownstreamContent'
          })
        }
      >
        <IconSwapHorizontal />
        Migrate Content
      </Button>
      <Tooltip.Content className='max-w-60'>
        {isBeastMode
          ? 'Repoint the cards, drills, and Beast Modes that use this Beast Mode to a different Beast Mode'
          : 'Migrate the cards, Beast Modes, dataset views, dataflows, alerts, pro-code apps, and Jupyter Workspaces that use this dataset to a new dataset'}
      </Tooltip.Content>
    </Tooltip>
  );
}
