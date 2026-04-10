import { executeInPage } from '@/utils';

/**
 * Get all metrics owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedMetrics(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allMetrics = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/content/v1/metrics/filter', {
          body: JSON.stringify({
            descendingOrderBy: false,
            filters: { OWNER: [userId] },
            followed: false,
            limit,
            nameContains: '',
            offset,
            orderBy: 'CREATED'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.metrics && data.metrics.length > 0) {
          allMetrics.push(
            ...data.metrics.map((m) => ({
              id: m.id,
              name: m.name || m.id.toString()
            }))
          );
          offset += limit;
          if (data.metrics.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allMetrics;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer metric ownership to a new user.
 * @param {number[]} metricIds - Array of metric IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferMetrics(
  metricIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (metricIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of metricIds) {
        try {
          const response = await fetch(
            `/api/content/v1/metrics/${id}/owner/${toUserId}`,
            { method: 'POST' }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [metricIds, fromUserId, toUserId],
    tabId
  );
}
