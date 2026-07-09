import { Button, Tooltip } from '@heroui/react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { cancelStreamExecution } from '@/services/datasets';
import IconStop from '@icons/stop.svg?react';

export function CancelStreamExecution({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();

  const handlePress = () => {
    const stream = currentContext?.domoObject?.metadata?.parent?.details;
    const streamId = stream?.id;
    if (!streamId) return;

    const datasetName = currentContext.domoObject.metadata?.name || `Dataset ${currentContext.domoObject.id}`;

    showPromiseStatus(
      cancelStreamExecution({
        streamId,
        tabId: currentContext.tabId
      }),
      {
        error: (err) => `Failed to cancel updates for **${datasetName}**: ${err.message}`,
        loading: `Cancelling running updates for **${datasetName}**…`,
        success: ({ cancelled }) => {
          if (cancelled === 0) return `No running updates to cancel for **${datasetName}**`;
          if (cancelled === 1) return `Cancelled the running update for **${datasetName}**`;
          return `Cancelled ${cancelled} running updates for **${datasetName}**`;
        }
      }
    );
  };

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconStop />
        Cancel Run
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Cancel every currently running update for this dataset's stream
      </Tooltip.Content>
    </Tooltip>
  );
}
