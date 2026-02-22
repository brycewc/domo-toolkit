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
    <Tooltip delay={400} closeDelay={0}>
      <Button
        variant='tertiary'
        fullWidth
        onPress={handleDataRepair}
        isDisabled={isDisabled}
        isIconOnly
        className='min-w-36 flex-1 whitespace-normal'
      >
        <IconBandage stroke={1.5} />
        Data Repair
      </Button>
      <Tooltip.Content>Enable data repair page</Tooltip.Content>
    </Tooltip>
  );
}
