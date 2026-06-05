import { Button, Tooltip } from '@heroui/react';

import IconArrowRightCircle from '@icons/arrow-right-circle.svg?react';
export function DirectSignOn({ currentContext, isDisabled }) {
  const handleDirectSignOn = () => {
    const url = new URL(currentContext.url);
    url.searchParams.append('domoManualLogin', 'true');

    chrome.tabs.update(currentContext.tabId, { url: url.toString() });
  };

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleDirectSignOn}
      >
        <IconArrowRightCircle />
        Direct Sign-On
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Navigate to the direct sign-on page
      </Tooltip.Content>
    </Tooltip>
  );
}
