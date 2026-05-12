import { Button, Tooltip } from '@heroui/react';
import { IconCookieOff } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { clearCookies } from '@/utils/clearCookies';
import { executeInPage } from '@/utils/executeInPage';

const EXCLUDED_HOSTNAMES = [
  'domo-support.domo.com',
  'developer.domo.com',
  'www.domo.com',
  'domo.com'
];

export function ClearCookies({ currentContext, isDisabled }) {
  const [showButton, setShowButton] = useState(true);
  const [behavior, setBehavior] = useState('preserve');
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    chrome.storage.sync.get(['showClearCookiesButton', 'clearCookiesButtonBehavior'], (result) => {
      setShowButton(result.showClearCookiesButton ?? true);
      setBehavior(result.clearCookiesButtonBehavior || 'preserve');
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'sync') return;
      if (changes.showClearCookiesButton) {
        setShowButton(changes.showClearCookiesButton.newValue ?? true);
      }
      if (changes.clearCookiesButtonBehavior) {
        setBehavior(changes.clearCookiesButtonBehavior.newValue || 'preserve');
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  if (!showButton) {
    return null;
  }

  const handleClearCookies = () => {
    const promise = (async () => {
      let result;

      if (behavior === 'all') {
        result = await clearCookies({
          domains: null,
          excludeDomains: false,
          tabId: currentContext?.tabId
        });
      } else {
        const { daSidsToPreserve, domains } = await getDomainsToPreserve();

        if (domains.length === 0) {
          result = await clearCookies({
            domains: null,
            excludeDomains: false,
            tabId: currentContext?.tabId
          });
        } else {
          result = await clearCookies({
            daSidsToPreserve,
            domains,
            excludeDomains: true
          });
          if (currentContext?.tabId) {
            chrome.tabs.reload(currentContext.tabId);
          }
        }
      }

      return result;
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'Failed to clear cookies',
      loading: 'Clearing cookies…',
      success: (result) => result.description
    });
  };

  const tooltipText =
    behavior === 'all'
      ? 'Clear all Domo cookies'
      : 'Clear Domo cookies and preserve last 2 instances';

  return (
    <Tooltip closeDelay={0} delay={400}>
      <Button
        fullWidth
        isIconOnly
        isDisabled={isDisabled}
        variant='tertiary'
        onPress={handleClearCookies}
      >
        <IconCookieOff className='text-danger' stroke={1.5} />
      </Button>
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        {tooltipText}
      </Tooltip.Content>
    </Tooltip>
  );
}

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

  domoTabs.sort((a, b) => (b.lastAccessed || b.id) - (a.lastAccessed || a.id));

  const seenDomains = new Set();
  const recentDomoTabs = [];
  for (const tab of domoTabs) {
    const domain = new URL(tab.url).hostname;
    if (!seenDomains.has(domain)) {
      seenDomains.add(domain);
      recentDomoTabs.push({ domain, tab });
      if (recentDomoTabs.length >= 2) break;
    }
  }

  const daSidsToPreserve = [];
  for (const { tab } of recentDomoTabs) {
    try {
      const data = await executeInPage(async () => window.bootstrap?.data, [], tab.id);
      if (data?.environmentId && data?.analytics?.company) {
        daSidsToPreserve.push(`DA-SID-${data.environmentId}-${data.analytics.company}`);
      }
    } catch (e) {
      console.warn(`[ClearCookies] Could not get DA-SID for tab ${tab.id}:`, e);
    }
  }

  return {
    daSidsToPreserve,
    domains: recentDomoTabs.map((t) => t.domain)
  };
}
