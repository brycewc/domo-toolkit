import { executeInPage } from '@/utils';

/**
 * Get all Jupyter workspaces owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedJupyterWorkspaces(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allWorkspaces = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          '/api/datascience/v1/search/workspaces',
          {
            body: JSON.stringify({
              filters: [{ type: 'OWNER', values: [userId] }],
              limit,
              offset,
              searchFieldMap: {},
              sortFieldMap: { LAST_RUN: 'DESC' }
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.workspaces && data.workspaces.length > 0) {
          allWorkspaces.push(
            ...data.workspaces.map((w) => ({
              id: w.id,
              name: w.name || w.id
            }))
          );
          offset += limit;
          if (data.workspaces.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allWorkspaces;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer Jupyter workspace ownership to a new user.
 * @param {string[]} workspaceIds - Array of workspace IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferJupyterWorkspaces(
  workspaceIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (workspaceIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of workspaceIds) {
        try {
          const response = await fetch(
            `/api/datascience/v1/workspaces/${id}/ownership`,
            {
              body: JSON.stringify({ newOwnerId: toUserId }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
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
    [workspaceIds, fromUserId, toUserId],
    tabId
  );
}
