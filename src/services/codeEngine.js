import { executeInPage } from '@/utils';

export async function getCodeEngineCode({ packageId, tabId }) {
  return executeInPage(
    async (packageId) => {
      try {
        const container = document.querySelector(
          'div[class*="module_packageControls"]'
        );
        const input = container?.querySelector(
          'input[class*="SelectListInputComponent"]'
        );
        if (!input) {
          throw new Error('Could not find version selector on the page');
        }

        const versionMatch = input.value.match(/^Version\s+(\d+\.\d+\.\d+)$/);
        if (!versionMatch) {
          throw new Error(`Unexpected version format: "${input.value}"`);
        }
        const version = versionMatch[1];

        const response = await fetch(
          `/api/codeengine/v2/packages/${packageId}/versions/${version}?parts=code`
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch package code. HTTP status: ${response.status}`
          );
        }

        const data = await response.json();
        return { code: data.code, version };
      } catch (error) {
        console.error('Error fetching code engine code:', error);
        throw error;
      }
    },
    [packageId],
    tabId
  );
}

/**
 * Fetch the currently-viewed version's code for a Code Engine package.
 * Reads the version number from the page's version selector input,
 * then calls the Domo API to retrieve the source code.
 *
 * @param {Object} params
 * @param {string} params.packageId - Code Engine package UUID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{ code: string, version: string }>}
 */
export async function getCodeEnginePackageInfo(packageId, tabId = null) {
  return executeInPage(
    async (packageId) => {
      const response = await fetch(
        `/api/codeengine/v2/packages/${packageId}?parts=versions`
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    [packageId],
    tabId
  );
}
