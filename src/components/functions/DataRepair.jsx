import { Button, Tooltip } from '@heroui/react';

import IconWrench from '@icons/wrench.svg?react';
export function DataRepair({ currentContext, isDisabled }) {
  const handleDataRepair = () => {
    const origin = new URL(currentContext.url).origin;
    const datasetId = currentContext.domoObject?.id ?? '';
    const url = `${origin}/datasources/${datasetId}/details/data-repair?_f=dataRepair`;
    chrome.tabs.update(currentContext.tabId, { url });
  };

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleDataRepair}
      >
        <IconWrench />
        Data Repair
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Enable and navigate to the data repair tab
      </Tooltip.Content>
    </Tooltip>
  );
}
