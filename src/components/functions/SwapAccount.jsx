import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';

export function SwapAccount({ currentContext, onStatusUpdate }) {
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
            onStatusUpdate,
            type: 'swapAccount'
          })
        }
      >
        <IconSwapHorizontal />
        Swap Account
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Swap this dataset to any compatible account, no sharing required
      </Tooltip.Content>
    </Tooltip>
  );
}
