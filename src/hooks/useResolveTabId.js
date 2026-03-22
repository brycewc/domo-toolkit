import { useCallback, useRef } from 'react';

import { getValidTabForInstance } from '@/utils';

/**
 * Hook that provides a resilient tab ID resolver.
 * Validates the stored tabId still exists, falling back to
 * finding another open tab on the same Domo instance.
 *
 * @param {number|null} tabId - The initial tab ID (synced to ref when non-null)
 * @param {string|null} instance - The Domo instance subdomain (synced to ref when non-null)
 * @returns {(overrideTabId?: number, overrideInstance?: string) => Promise<number|null>} resolveTabId callback
 */
export function useResolveTabId(tabId, instance) {
  const tabIdRef = useRef(tabId);
  const instanceRef = useRef(instance);

  // Sync from props only when non-null, so callers that pass null
  // (e.g. useLineageCache which seeds via overrides) don't clobber ref values.
  if (tabId != null) tabIdRef.current = tabId;
  if (instance != null) instanceRef.current = instance;

  return useCallback(async (overrideTabId, overrideInstance) => {
    // Overrides take precedence and also update refs for future calls
    if (overrideTabId != null) tabIdRef.current = overrideTabId;
    if (overrideInstance != null) instanceRef.current = overrideInstance;

    const currentTabId = tabIdRef.current;
    if (currentTabId) {
      try {
        await chrome.tabs.get(currentTabId);
        return currentTabId;
      } catch {
        // Tab was closed, fall back
      }
    }
    if (instanceRef.current) {
      const newTabId = await getValidTabForInstance(instanceRef.current);
      tabIdRef.current = newTabId;
      return newTabId;
    }
    return null;
  }, []);
}
