import { Button, Tooltip } from '@heroui/react';

import IconShield from '@icons/shield.svg?react';
export function ViewInAdmin({ currentContext, isDisabled }) {
  const handleViewInAdmin = () => {
    // The USER type's urlPath is the admin path, so domoObject.url is already
    // the /admin/people/{id} destination even when detected on the /up/ profile.
    chrome.tabs.update(currentContext.tabId, { url: currentContext.domoObject.url });
  };

  return (
    <Tooltip>
      <Button
        fullWidth
        className='min-w-36 flex-1 whitespace-normal'
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleViewInAdmin}
      >
        <IconShield />
        View in Admin
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        Open this person's admin settings page
      </Tooltip.Content>
    </Tooltip>
  );
}
