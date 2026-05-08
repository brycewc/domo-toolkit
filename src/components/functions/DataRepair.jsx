import { Button, Tooltip } from '@heroui/react';
import { IconBandage } from '@tabler/icons-react';

export function DataRepair({ currentContext, isDisabled }) {
  const handleDataRepair = () => {
    const origin = new URL(currentContext.url).origin;
    const datasetId = currentContext.domoObject?.id ?? '';
    const url = `${origin}/datasources/${datasetId}/details/data-repair?_f=dataRepair`;
    chrome.tabs.update(currentContext.tabId, { url });
  };

  return (
    <Tooltip closeDelay={100} delay={600}>
      <Button
        fullWidth
        className='h-auto min-h-9 min-w-36 flex-1 whitespace-normal py-1.5'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleDataRepair}
      >
        <IconBandage stroke={1.5} />
        Data Repair
      </Button>
      <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
        Enable and navigate to the data repair tab
      </Tooltip.Content>
    </Tooltip>
  );
}
