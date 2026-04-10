import { executeInPage } from '@/utils';

/**
 * Get all AI models owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAiModels(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allModels = [];
      const limit = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/datascience/ml/v1/search/models', {
          body: JSON.stringify({
            dateFilters: {},
            filters: [{ type: 'OWNER', values: [userId] }],
            limit,
            metricFilters: {},
            offset,
            searchFieldMap: { NAME: '' },
            sortFieldMap: { CREATED: 'DESC' },
            sortMetricMap: {}
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.models && data.models.length > 0) {
          allModels.push(
            ...data.models.map((m) => ({ id: m.id, name: m.name || m.id }))
          );
          offset += limit;
          if (data.models.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allModels;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer AI model ownership to a new user.
 * @param {string[]} modelIds - Array of AI model IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAiModels(
  modelIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (modelIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of modelIds) {
        try {
          const response = await fetch(
            `/api/datascience/ml/v1/models/${id}/ownership`,
            {
              body: JSON.stringify({ userId: toUserId }),
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
    [modelIds, fromUserId, toUserId],
    tabId
  );
}
