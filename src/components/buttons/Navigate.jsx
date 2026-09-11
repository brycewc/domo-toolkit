import { Button, Tooltip } from '@heroui/react';

import { isSidepanel } from '@/utils/sidepanel';
import IconAiBook from '@icons/ai-book.svg?react';
import IconArrowRightCircle from '@icons/arrow-right-circle.svg?react';
import IconShield from '@icons/shield.svg?react';
import IconWrench from '@icons/wrench.svg?react';

export function Navigate({ availableActions, currentContext, isDisabled }) {
  const entry = Object.entries(NAVIGATE_DESCRIPTORS).find(([key]) => availableActions?.has(key));
  if (!entry) return null;

  const [, descriptor] = entry;
  const Icon = descriptor.icon;

  const handlePress = async () => {
    const url = descriptor.resolveUrl(currentContext);
    if (!url) return;

    if (!descriptor.newTab) {
      chrome.tabs.update(currentContext.tabId, { url });
      return;
    }

    // Same window so incognito context carries over, right after the launching tab.
    const tab = await chrome.tabs.get(currentContext.tabId);
    await chrome.tabs.create({ index: tab.index + 1, openerTabId: tab.id, url, windowId: tab.windowId });
    if (!isSidepanel()) {
      window.close();
    }
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
        <Icon />
        {descriptor.label}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {descriptor.tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}

// At most one of these is ever available at a time, which is why a single button
// slot covers them all: three mutually exclusive object types plus a login page
// that has no detected object. A new entry that can coexist with another breaks
// that, and the button would silently render only the first match.
const NAVIGATE_DESCRIPTORS = {
  dataRepair: {
    icon: IconWrench,
    label: 'Data Repair',
    newTab: false,
    resolveUrl: (currentContext) =>
      `${currentContext.origin}/datasources/${currentContext.domoObject?.id ?? ''}/details/data-repair?_f=dataRepair`,
    tooltip: 'Enable and navigate to the data repair tab'
  },
  directSignOn: {
    icon: IconArrowRightCircle,
    label: 'Direct Sign-On',
    newTab: false,
    resolveUrl: (currentContext) => {
      const url = new URL(currentContext.url);
      url.searchParams.append('domoManualLogin', 'true');
      return url.toString();
    },
    tooltip: 'Navigate to the direct sign-on page'
  },
  openInCodeEngine: {
    icon: IconAiBook,
    label: 'Open in Code Engine',
    newTab: true,
    // A version has no page of its own, so both cases land on the package's page.
    resolveUrl: (currentContext) => {
      const domoObject = currentContext.domoObject;
      const packageId = domoObject?.typeId === 'CODEENGINE_PACKAGE_VERSION' ? domoObject.parentId : domoObject?.id;
      return packageId ? `${currentContext.origin}/codeengine/${packageId}` : null;
    },
    tooltip: "Open this Code Engine package's page in a new tab"
  },
  viewInAdmin: {
    icon: IconShield,
    label: 'View in Admin',
    newTab: false,
    // The USER type's urlPath is the admin path, so domoObject.url is already
    // the /admin/people/{id} destination even when detected on the /up/ profile.
    resolveUrl: (currentContext) => currentContext.domoObject?.url,
    tooltip: "Open this person's admin settings page"
  }
};
