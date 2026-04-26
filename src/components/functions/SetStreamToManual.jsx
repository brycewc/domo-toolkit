import { Button, Tooltip } from '@heroui/react';
import { IconCalendarOff } from '@tabler/icons-react';

import { useStatusBar } from '@/hooks';
import { setStreamScheduleToManual } from '@/services';

export function SetStreamToManual({ currentContext, isDisabled }) {
  const { showPromiseStatus } = useStatusBar();

  const handlePress = () => {
    const streamId = currentContext?.domoObject?.metadata?.details?.streamId;
    if (!streamId) return;

    const datasetName =
      currentContext.domoObject.metadata?.name || `Dataset ${currentContext.domoObject.id}`;

    showPromiseStatus(
      setStreamScheduleToManual({
        streamId,
        tabId: currentContext.tabId
      }),
      {
        error: (err) => `Failed to set stream to manual – ${err.message}`,
        loading: `Setting stream schedule to manual for **${datasetName}**…`,
        success: () => `Stream schedule for **${datasetName}** set to manual`
      }
    );
  };

  return (
    <Tooltip closeDelay={100} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handlePress}
      >
        <IconCalendarOff stroke={1.5} />
        Set to Manual
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        Set dataset stream schedule to manual (not scheduled)
      </Tooltip.Content>
    </Tooltip>
  );
}
