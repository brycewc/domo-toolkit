import { executeInPage } from '@/utils';

export async function deleteFunction(functionId) {
  await fetch(`/api/query/v1/functions/template/${functionId}`, {
    method: 'DELETE'
  });
}

/**
 * Get all beast mode formulas and variables owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{global: boolean, id: string, name: string}>>}
 */
export async function getOwnedFunctions(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allFunctions = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/query/v1/functions/search', {
          body: JSON.stringify({
            filters: [{ field: 'owner', idList: [userId] }],
            limit,
            offset,
            sort: { ascending: true, field: 'name' }
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
          allFunctions.push(
            ...data.results.map((f) => ({
              global: f.global,
              id: f.id,
              name: f.name || f.id
            }))
          );
          offset += limit;
          moreData = data.hasMore;
        } else {
          moreData = false;
        }
      }

      return allFunctions;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer function (beast mode/variable) ownership to a new user.
 * Handles link sanitization for functions with dead references.
 * @param {string[]} functionIds - Array of function IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferFunctions(
  functionIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (functionIds, fromUserId, toUserId) => {
      const errors = [];
      const updates = [];
      const chunkSize = 100;
      let succeeded = 0;

      for (const id of functionIds) {
        try {
          const response = await fetch(
            `/api/query/v1/functions/template/${id}?hidden=true`
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const func = await response.json();

          updates.push({
            id,
            links: func.links || [],
            owner: toUserId
          });
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      // Transfer in batches
      const bulkUrl = '/api/query/v1/functions/bulk/template';
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        try {
          const response = await fetch(bulkUrl, {
            body: JSON.stringify({ update: chunk }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded += chunk.length;
        } catch (error) {
          chunk.forEach((f) =>
            errors.push({ error: error.message, id: f.id })
          );
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [functionIds, fromUserId, toUserId],
    tabId
  );
}
