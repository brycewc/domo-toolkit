import { useEffect, useState } from 'react';

import { isSupportUser } from '@/utils/supportMode';

/**
 * Effective support-mode state: true when the signed-in Domo user is a Support
 * system user, or when the dev-menu override is on. The override is dev-only
 * (`import.meta.env.DEV`) and lives in `chrome.storage.local.supportModeOverride`;
 * subscribing to `onChanged` re-renders consumers when the Dev menu toggles it.
 * In production the effect is skipped and this is exactly `isSupportUser(context)`.
 */
export function useSupportMode(currentContext) {
  const [override, setOverride] = useState(false);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    chrome.storage.local.get(['supportModeOverride'], (result) => {
      setOverride(result.supportModeOverride ?? false);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.supportModeOverride !== undefined) {
        setOverride(changes.supportModeOverride.newValue ?? false);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  return isSupportUser(currentContext) || override;
}
