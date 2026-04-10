import { executeInPage } from '@/utils';

/**
 * Get all AI projects owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAiProjects(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allProjects = [];
      const limit = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/datascience/ml/v1/search/projects', {
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

        if (data.projects && data.projects.length > 0) {
          allProjects.push(
            ...data.projects.map((p) => ({ id: p.id, name: p.name || p.id }))
          );
          offset += limit;
          if (data.projects.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allProjects;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer AI project ownership to a new user.
 * @param {string[]} projectIds - Array of AI project IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAiProjects(
  projectIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (projectIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of projectIds) {
        try {
          const response = await fetch(
            `/api/datascience/ml/v1/projects/${id}/ownership`,
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
    [projectIds, fromUserId, toUserId],
    tabId
  );
}
