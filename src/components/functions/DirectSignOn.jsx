import { Button, Tooltip } from '@heroui/react';
import { IconLogin2 } from '@tabler/icons-react';

export function DirectSignOn({ currentContext, isDisabled }) {
  const handleDirectSignOn = () => {
    const url = new URL(currentContext.url);
    url.searchParams.append('domoManualLogin', 'true');

    chrome.tabs.update(currentContext.tabId, { url: url.toString() });
  };

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleDirectSignOn}
      >
        <IconLogin2 stroke={1.5} />
        Direct Sign-On
      </Button>
      <Tooltip.Content>Navigate to the direct sign-on page</Tooltip.Content>
    </Tooltip>
  );
}
