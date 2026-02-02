import { useState, useEffect } from 'react';
import { Button, Spinner, Tooltip } from '@heroui/react';
import { IconCookieOff } from '@tabler/icons-react';
import { clearCookies, executeInPage } from '@/utils';

// Excluded hostnames that shouldn't be considered Domo instances
const EXCLUDED_HOSTNAMES = [
  'domo-support.domo.com',
  'developer.domo.com',
  'www.domo.com',
  'domo.com'
];

/**
 * Get domains and DA-SIDs to preserve (last 2 active instances)
 * Shared logic used by both auto-clear (background.js) and manual clear
 */
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

  // Sort by lastAccessed if available, otherwise by tab id (higher = more recent)
  domoTabs.sort((a, b) => (b.lastAccessed || b.id) - (a.lastAccessed || a.id));

  // Get up to 2 unique domains
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

  // Get DA-SID cookie names for each domain to preserve
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
      console.warn(`[ClearCookies] Could not get DA-SID for tab ${tab.id}:`, e);
    }
  }

  return {
    domains: recentDomoTabs.map((t) => t.domain),
    daSidsToPreserve
  };
}

export function ClearCookies({ currentContext, onStatusUpdate, isDisabled }) {
  const [cookieClearingMode, setCookieClearingMode] = useState('default');
  const [isClearingCookies, setIsClearingCookies] = useState(false);

  // Load cookie clearing mode setting
  useEffect(() => {
    chrome.storage.sync.get(['defaultClearCookiesHandling'], (result) => {
      setCookieClearingMode(result.defaultClearCookiesHandling || 'default');
    });

    // Listen for changes to the setting
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync' && changes.defaultClearCookiesHandling) {
        setCookieClearingMode(
          changes.defaultClearCookiesHandling.newValue || 'default'
        );
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Don't render the button when mode is 'auto' (auto-clear handles 431 errors)
  if (cookieClearingMode === 'auto') {
    return null;
  }

  const handleClearCookies = async () => {
    setIsClearingCookies(true);

    try {
      let result;

      if (cookieClearingMode === 'all') {
        // Clear ALL Domo cookies
        result = await clearCookies({
          domains: null,
          excludeDomains: false,
          tabId: currentContext?.tabId
        });
      } else {
        // 'default' mode: preserve last 2 instances
        const { domains, daSidsToPreserve } = await getDomainsToPreserve();

        if (domains.length === 0) {
          // No Domo tabs found, just clear all
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
          // Reload current tab after clearing in exclude mode
          if (currentContext?.tabId) {
            chrome.tabs.reload(currentContext.tabId);
          }
        }
      }

      onStatusUpdate(result.title, result.description, result.status);
    } catch (error) {
      onStatusUpdate(
        'Error',
        error.message || 'Failed to clear cookies',
        'danger'
      );
    } finally {
      setIsClearingCookies(false);
    }
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
        isPending={isClearingCookies}
        isDisabled={isDisabled}
      >
        {({ isPending }) => (
          <>
            {isPending ? (
              <Spinner color='currentColor' size='sm' />
            ) : (
              <IconCookieOff size={4} className='text-danger' />
            )}
          </>
        )}
      </Button>
      <Tooltip.Content>{tooltipText}</Tooltip.Content>
    </Tooltip>
  );
}
