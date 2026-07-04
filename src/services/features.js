/**
 * Domo API service for instance feature switches
 */

import { executeInPage } from '@/utils/executeInPage';

/**
 * Get the names of every feature switch enabled on the current instance.
 * Reads the page global `features.getConfig()`, polling briefly because the
 * config can hydrate after first paint (same approach as getCurrentUser's
 * window.bootstrap polling). A switch absent from the config is off, and
 * present entries always carry `enabled: true`, but both are checked so
 * membership in the returned array always means "present and enabled".
 * @param {number|null} tabId - The tab ID to execute in (optional)
 * @returns {Promise<string[]|null>} Enabled switch names, or null if the
 *   config never became readable (callers treat null as unknown and fail open)
 */
export async function getFeatureSwitches(tabId = null) {
  return executeInPage(
    async () => {
      for (let i = 0; i < 30; i++) {
        if (typeof window.features?.getConfig === 'function') {
          const config = window.features.getConfig();
          if (Array.isArray(config)) {
            return config.filter((f) => f && f.enabled === true).map((f) => f.name);
          }
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return null;
    },
    [],
    tabId
  );
}
