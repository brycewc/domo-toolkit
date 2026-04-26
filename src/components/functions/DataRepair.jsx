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
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleDataRepair}
      >
        <IconBandage stroke={1.5} />
        Data Repair
      </Button>
      <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
        Enable and navigate to the data repair tab
      </Tooltip.Content>
    </Tooltip>
  );
}
