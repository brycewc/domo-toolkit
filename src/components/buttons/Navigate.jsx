import { Button, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { isFeatureSwitchOn } from '@/services/features';
import { setFeatureSwitch } from '@/utils/domoQueryParam';
import { isSidepanel } from '@/utils/sidepanel';
import IconAiBook from '@icons/ai-book.svg?react';
import IconArrowRightCircle from '@icons/arrow-right-circle.svg?react';
import IconFlag from '@icons/flag.svg?react';
import IconShield from '@icons/shield.svg?react';
import IconWrench from '@icons/wrench.svg?react';

export function Navigate({ availableActions, currentContext, isDisabled }) {
  const entry = Object.entries(NAVIGATE_DESCRIPTORS).find(([key]) => availableActions?.has(key));
  const descriptor = entry?.[1];
  const [state, setState] = useState();
  const [isStateLoading, setIsStateLoading] = useState(false);

  useEffect(() => {
    if (!descriptor?.loadState) return;
    let cancelled = false;
    setIsStateLoading(true);
    descriptor
      .loadState(currentContext)
      .catch(() => undefined)
      .then((value) => {
        if (cancelled) return;
        setState(value);
        setIsStateLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [descriptor, currentContext?.tabId, currentContext?.url]);

  if (!descriptor) return null;

  const Icon = descriptor.icon;
  const label = typeof descriptor.label === 'function' ? descriptor.label(state) : descriptor.label;
  const tooltip = typeof descriptor.tooltip === 'function' ? descriptor.tooltip(state) : descriptor.tooltip;

  const handlePress = async () => {
    const url = descriptor.resolveUrl(currentContext, state);
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
        isDisabled={isDisabled || isStateLoading}
        variant='tertiary'
        onPress={handlePress}
      >
        <Icon />
        {label}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {tooltip}
      </Tooltip.Content>
    </Tooltip>
  );
}

// At most one of these is ever available at a time, which is why a single button
// slot covers them all: four mutually exclusive object types plus a login page
// that has no detected object. A new entry that can coexist with another breaks
// that, and the button would silently render only the first match.
const NAVIGATE_DESCRIPTORS = {
  dataflowsDev: {
    icon: IconFlag,
    label: (isOn) => (isOn ? 'Disable DataFlows Dev' : 'Enable DataFlows Dev'),
    loadState: (currentContext) => isFeatureSwitchOn('dataflows-dev', currentContext.tabId),
    newTab: false,
    resolveUrl: (currentContext, isOn) => {
      const url = new URL(currentContext.url);
      setFeatureSwitch(url, 'dataflows-dev', !isOn);
      return url.toString();
    },
    tooltip: (isOn) => `Reload this dataflow with the dataflows-dev feature switch turned ${isOn ? 'off' : 'on'}`
  },
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
