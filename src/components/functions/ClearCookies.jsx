import { useState, useEffect } from 'react';
import { Button, Tooltip } from '@heroui/react';
import { IconCookieOff } from '@tabler/icons-react';
import { clearCookies, executeInPage } from '@/utils';
import { useStatusBar } from '@/hooks';

const EXCLUDED_HOSTNAMES = [
  'domo-support.domo.com',
  'developer.domo.com',
  'www.domo.com',
  'domo.com'
];

async function getDomainsToPreserve() {
  const allTabs = await chrome.tabs.query({ url: '*://*.domo.com/*' });
  const domoTabs = allTabs.filter((tab) => {
    try {
      const tabHostname = new URL(tab.url).hostname;
      return !EXCLUDED_HOSTNAMES.includes(tabHostname);
    } catch {
      return false;
    }
  });

  domoTabs.sort(
    (a, b) => (b.lastAccessed || b.id) - (a.lastAccessed || a.id)
  );

  const seenDomains = new Set();
  const recentDomoTabs = [];
  for (const tab of domoTabs) {
    const domain = new URL(tab.url).hostname;
    if (!seenDomains.has(domain)) {
      seenDomains.add(domain);
      recentDomoTabs.push({ tab, domain });
      if (recentDomoTabs.length >= 2) break;
    }
  }

  const daSidsToPreserve = [];
  for (const { tab } of recentDomoTabs) {
    try {
      const data = await executeInPage(
        async () => window.bootstrap?.data,
        [],
        tab.id
      );
      if (data?.environmentId && data?.analytics?.company) {
        daSidsToPreserve.push(
          `DA-SID-${data.environmentId}-${data.analytics.company}`
        );
      }
    } catch (e) {
      console.warn(
        `[ClearCookies] Could not get DA-SID for tab ${tab.id}:`,
        e
      );
    }
  }

  return {
    domains: recentDomoTabs.map((t) => t.domain),
    daSidsToPreserve
  };
}

export function ClearCookies({ currentContext, isDisabled }) {
  const [cookieClearingMode, setCookieClearingMode] = useState('auto');
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    chrome.storage.sync.get(['defaultClearCookiesHandling'], (result) => {
      setCookieClearingMode(result.defaultClearCookiesHandling || 'auto');
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync' && changes.defaultClearCookiesHandling) {
        setCookieClearingMode(
          changes.defaultClearCookiesHandling.newValue || 'auto'
        );
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  if (cookieClearingMode === 'auto') {
    return null;
  }

  const handleClearCookies = () => {
    const promise = (async () => {
      let result;

      if (cookieClearingMode === 'all') {
        result = await clearCookies({
          domains: null,
          excludeDomains: false,
          tabId: currentContext?.tabId
        });
      } else {
        const { domains, daSidsToPreserve } = await getDomainsToPreserve();

        if (domains.length === 0) {
          result = await clearCookies({
            domains: null,
            excludeDomains: false,
            tabId: currentContext?.tabId
          });
        } else {
          result = await clearCookies({
            domains,
            excludeDomains: true,
            daSidsToPreserve
          });
          if (currentContext?.tabId) {
            chrome.tabs.reload(currentContext.tabId);
          }
        }
      }

      return result;
    })();

    showPromiseStatus(promise, {
      loading: 'Clearing cookies…',
      success: (result) => result.description,
      error: (err) => err.message || 'Failed to clear cookies'
    });
  };

  const tooltipText =
    cookieClearingMode === 'all'
      ? 'Clear all Domo cookies'
      : 'Clear cookies (preserve last 2 instances)';

  return (
    <Tooltip delay={400} closeDelay={0}>
      <Button
        variant='tertiary'
        fullWidth
        isIconOnly
        onPress={handleClearCookies}
        isDisabled={isDisabled}
      >
        <IconCookieOff className='text-danger' />
      </Button>
      <Tooltip.Content>{tooltipText}</Tooltip.Content>
    </Tooltip>
  );
}
