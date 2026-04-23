import { executeInPage } from '@/utils';

/**
 * Get all sandbox repositories owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedRepositories(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allRepos = [];
      const limit = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/version/v1/repositories/search', {
          body: JSON.stringify({
            query: {
              dateFilters: {},
              fieldSearchMap: {},
              filters: { userId: [userId] },
              limit,
              offset,
              order: 'desc',
              sort: 'lastCommit'
            }
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.repositories && data.repositories.length > 0) {
          allRepos.push(
            ...data.repositories.map((r) => ({
              id: r.id,
              name: r.name || r.id
            }))
          );
          offset += limit;
          if (data.repositories.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allRepos;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer repository ownership to a new user.
 * @param {string[]} repoIds - Array of repository IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferRepositories(
  repoIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (repoIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of repoIds) {
        try {
          const response = await fetch(
            `/api/version/v1/repositories/${id}/permissions`,
            {
              body: JSON.stringify({
                repositoryPermissionUpdates: [
                  { permission: 'OWNER', userId: toUserId },
                  { permission: 'NONE', userId: fromUserId }
                ]
              }),
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
    [repoIds, fromUserId, toUserId],
    tabId
  );
}
