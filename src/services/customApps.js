import { executeInPage } from '@/utils';

/**
 * Get all custom apps (bricks and pro code apps) owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedCustomApps(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allApps = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/apps/v1/designs?checkAdminAuthority=true&deleted=false&limit=${limit}&offset=${offset}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          for (const app of data) {
            if (app.owner == userId) {
              allApps.push({
                id: app.id,
                name: app.name || app.id
              });
            }
          }
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allApps;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer custom app ownership to a new user.
 * @param {string[]} appIds - Array of custom app IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferCustomApps(
  appIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (appIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of appIds) {
        try {
          const response = await fetch(
            `/api/apps/v1/designs/${id}/permissions/ADMIN`,
            {
              body: JSON.stringify([toUserId]),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [appIds, fromUserId, toUserId],
    tabId
  );
}
