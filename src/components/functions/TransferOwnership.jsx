import { Button, Tooltip } from '@heroui/react';
import { IconUserUp } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function TransferOwnership({ currentContext, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip closeDelay={0} delay={400}>
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
            type: 'transferOwnership'
          })
        }
      >
        <IconUserUp stroke={1.5} />
        Transfer Ownership
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        Transfer objects owned by this user to another user
      </Tooltip.Content>
    </Tooltip>
  );
}
