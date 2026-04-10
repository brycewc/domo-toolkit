import { executeInPage } from '@/utils';

/**
 * Get all filesets owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedFilesets(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allFilesets = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/files/v1/filesets/search?limit=${limit}&offset=${offset}`,
          {
            body: JSON.stringify({
              dateFilters: [],
              fieldSort: [{ field: 'updated', order: 'DESC' }],
              filters: [
                {
                  field: 'owner',
                  not: false,
                  operator: 'EQUALS',
                  value: [userId]
                }
              ]
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.filesets && data.filesets.length > 0) {
          allFilesets.push(
            ...data.filesets.map((f) => ({
              id: f.id,
              name: f.name || f.id
            }))
          );
          offset += limit;
          if (data.filesets.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allFilesets;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer fileset ownership to a new user.
 * @param {string[]} filesetIds - Array of fileset IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferFilesets(
  filesetIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (filesetIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of filesetIds) {
        try {
          const response = await fetch(
            `/api/files/v1/filesets/${id}/ownership`,
            {
              body: JSON.stringify({ userId: parseInt(toUserId) }),
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
    [filesetIds, fromUserId, toUserId],
    tabId
  );
}
