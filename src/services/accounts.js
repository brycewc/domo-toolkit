import { executeInPage } from '@/utils';

/**
 * Get all accounts owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedAccounts(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allAccounts = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            combineResults: false,
            count,
            entityList: [['account']],
            facetValuesToInclude: [],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                name: 'Owned by',
                not: false,
                value: userId
              }
            ],
            hideSearchObjects: true,
            offset,
            query: '**',
            queryProfile: 'GLOBAL'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const accounts = data.searchResultsMap?.account || [];
        if (accounts.length > 0) {
          allAccounts.push(
            ...accounts.map((a) => ({ id: a.databaseId, name: a.title || a.databaseId.toString() }))
          );
          offset += count;
          if (accounts.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allAccounts;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer account ownership to a new user.
 * @param {number[]} accountIds - Array of account IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAccounts(
  accountIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (accountIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of accountIds) {
        try {
          const response = await fetch(`/api/data/v2/accounts/share/${id}`, {
            body: JSON.stringify({
              accessLevel: 'OWNER',
              id: toUserId,
              type: 'USER'
            }),
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
    [accountIds, fromUserId, toUserId],
    tabId
  );
}
