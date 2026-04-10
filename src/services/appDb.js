import { executeInPage } from '@/utils';

/**
 * Get all AppDB collections owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAppDbCollections(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allCollections = [];
      let moreData = true;
      let pageNumber = 1;
      const pageSize = 100;

      while (moreData) {
        const response = await fetch('/api/datastores/v1/collections/query', {
          body: JSON.stringify({
            collectionFilteringList: [
              {
                comparingCriteria: 'equals',
                filterType: 'ownedby',
                typedValue: userId
              }
            ],
            pageNumber,
            pageSize
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.collections && data.collections.length > 0) {
          allCollections.push(
            ...data.collections.map((c) => ({
              id: c.id,
              name: c.name || c.id
            }))
          );
          pageNumber++;
          if (data.collections.length < pageSize) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allCollections;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer AppDB collection ownership to a new user.
 * @param {string[]} collectionIds - Array of collection IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAppDbCollections(
  collectionIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (collectionIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of collectionIds) {
        try {
          const response = await fetch(
            `/api/datastores/v1/collections/${id}`,
            {
              body: JSON.stringify({ id, owner: toUserId }),
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
    [collectionIds, fromUserId, toUserId],
    tabId
  );
}
