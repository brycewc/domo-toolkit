import { Button, Tooltip } from '@heroui/react';
import { IconUserUp } from '@tabler/icons-react';

import { useLaunchView } from '@/hooks';

export function TransferOwnership({ currentContext, onCollapseActions, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            autoOpenTransferModal: true,
            currentContext,
            onCollapseActions,
            onStatusUpdate,
            type: 'ownership'
          })
        }
      >
        <IconUserUp stroke={1.5} />
        Transfer Ownership
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        Transfer objects owned by this user to another user
      </Tooltip.Content>
    </Tooltip>
  );
}
