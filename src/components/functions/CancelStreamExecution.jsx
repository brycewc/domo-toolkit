import { Button, Tooltip } from '@heroui/react';
import IconStop from '@icons/stop.svg?react';
import { useStatusBar } from '@/hooks/useStatusBar';
import { cancelStreamExecution } from '@/services/datasets';

export function CancelStreamExecution({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();

  const handlePress = () => {
    const stream = currentContext?.domoObject?.metadata?.parent?.details;
    const streamId = stream?.id;
    const executionId = stream?.currentExecution?.executionId;
    if (!streamId || !executionId) return;

    const datasetName =
      currentContext.domoObject.metadata?.name || `Dataset ${currentContext.domoObject.id}`;

    showPromiseStatus(
      cancelStreamExecution({
        executionId,
        streamId,
        tabId: currentContext.tabId
      }),
      {
        error: (err) => `Failed to cancel update – ${err.message}`,
        loading: `Cancelling update for **${datasetName}**…`,
        success: () => `Update cancelled for **${datasetName}**`
      }
    );
  };

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconStop />
        Cancel Update
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        Cancel the currently running update for this dataset's stream
      </Tooltip.Content>
    </Tooltip>
  );
}
