import { executeInPage } from '@/utils';

export async function getCodeEngineCode({ packageId, tabId, version }) {
  return executeInPage(
    async (packageId, version) => {
      try {
        // If no version provided, read from the page's version selector
        // (works on the code engine page itself)
        if (!version) {
          const container = document.querySelector(
            'div[class*="module_packageControls"]'
          );
          const input = container?.querySelector(
            'input[class*="SelectListInputComponent"]'
          );
          if (input) {
            const versionMatch = input.value.match(
              /^Version\s+(\d+\.\d+\.\d+)$/
            );
            if (versionMatch) {
              version = versionMatch[1];
            }
          }
        }

        if (!version) {
          throw new Error('Could not determine package version');
        }

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
    [packageId, version],
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

/**
 * Get all Code Engine packages owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedCodeEnginePackages(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allPackages = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            count,
            entityList: [['package']],
            facetValuesToInclude: [],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                value: `${userId}:USER`
              }
            ],
            hideSearchObjects: true,
            offset,
            query: '**'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const packages = data.searchResultsMap?.package || [];
        if (packages.length > 0) {
          allPackages.push(
            ...packages.map((p) => ({ id: p.uuid, name: p.title || p.uuid }))
          );
          offset += count;
          if (packages.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allPackages;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer Code Engine package ownership to a new user.
 * @param {string[]} packageIds - Array of package IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferCodeEnginePackages(
  packageIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (packageIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of packageIds) {
        try {
          const response = await fetch(`/api/codeengine/v2/packages/${id}`, {
            body: JSON.stringify({ owner: parseInt(toUserId) }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [packageIds, fromUserId, toUserId],
    tabId
  );
}
