import { useCallback, useRef } from 'react';

import { getValidTabForInstance } from '@/utils';

/**
 * Hook that provides a resilient tab ID resolver.
 * Validates the stored tabId still exists, falling back to
 * finding another open tab on the same Domo instance.
 *
 * @param {number|null} tabId - The initial tab ID
 * @param {string|null} instance - The Domo instance subdomain
 * @returns {() => Promise<number|null>} resolveTabId callback
 */
export function useResolveTabId(tabId, instance) {
  const tabIdRef = useRef(tabId);
  tabIdRef.current = tabId;
  const instanceRef = useRef(instance);
  instanceRef.current = instance;

  return useCallback(async () => {
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
