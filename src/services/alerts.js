import { executeInPage } from '@/utils';

/**
 * Get all alerts owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedAlerts(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allAlerts = [];
      const limit = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/social/v4/alerts?limit=${limit}&offset=${offset}&ownerId=${userId}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allAlerts.push(
            ...data.map((a) => ({ id: a.id, name: a.name || a.id.toString() }))
          );
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allAlerts;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer alert ownership to a new user.
 * @param {number[]} alertIds - Array of alert IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAlerts(
  alertIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (alertIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of alertIds) {
        try {
          const response = await fetch(`/api/social/v4/alerts/${id}`, {
            body: JSON.stringify({ id, owner: toUserId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [alertIds, fromUserId, toUserId],
    tabId
  );
}

/**
 * Update the owner of a single alert.
 * @param {Object} params
 * @param {number|string} params.alertId - The alert ID
 * @param {number|string} params.newOwnerId - The new owner's user ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function updateAlertOwner({
  alertId,
  newOwnerId,
  tabId = null
}) {
  return executeInPage(
    async (alertId, newOwnerId) => {
      const response = await fetch(`/api/social/v4/alerts/${alertId}`, {
        body: JSON.stringify({
          id: Number(alertId),
          owner: Number(newOwnerId)
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [alertId, newOwnerId],
    tabId
  );
}
