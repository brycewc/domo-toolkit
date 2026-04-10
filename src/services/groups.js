import { executeInPage } from '@/utils';

export async function fetchGroupDisplayNames(groupIds, tabId = null) {
  return executeInPage(
    async (ids) => {
      const response = await fetch(
        '/api/content/v2/groups/get?includeActive=true&includeUsers=false',
        {
          body: JSON.stringify(ids.map(String)),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      if (!response.ok) return {};
      const groups = await response.json();
      const map = {};
      for (const group of groups) {
        if (group.id != null && group.name) {
          map[group.id] = group.name;
        }
      }
      return map;
    },
    [groupIds],
    tabId
  );
}

/**
 * Get all groups owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedGroups(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allGroups = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/content/v2/groups/grouplist?limit=${limit}&offset=${offset}&owner=${userId}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allGroups.push(
            ...data
              .filter((g) => g.owners?.some((o) => o.id === userId))
              .map((g) => ({ id: g.id, name: g.name || g.id.toString() }))
          );
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allGroups;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer group ownership to a new user.
 * @param {number[]} groupIds - Array of group IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferGroups(
  groupIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (groupIds, fromUserId, toUserId) => {
      try {
        const body = groupIds.map((id) => ({
          addOwners: [{ id: toUserId, type: 'USER' }],
          groupId: id,
          removeOwners: [{ id: fromUserId, type: 'USER' }]
        }));

        const response = await fetch('/api/content/v2/groups/access', {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { errors: [], failed: 0, succeeded: groupIds.length };
      } catch (error) {
        return {
          errors: groupIds.map((id) => ({ error: error.message, id })),
          failed: groupIds.length,
          succeeded: 0
        };
      }
    },
    [groupIds, fromUserId, toUserId],
    tabId
  );
}
