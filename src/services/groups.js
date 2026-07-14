import { executeInPage } from '@/utils/executeInPage';

/**
 * Add users to groups in a single call.
 * @param {Array<{groupId: number|string, addMembers: Array<{type: string, id: string}>}>} accessPayload
 * @param {number|null} tabId
 * @returns {Promise<boolean>} true on success
 */
export async function addUsersToGroups(accessPayload, tabId = null) {
  return executeInPage(
    async (payload) => {
      const response = await fetch('/api/content/v2/groups/access', {
        body: JSON.stringify(payload),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      return response.ok;
    },
    [accessPayload],
    tabId
  );
}

export async function fetchGroupDisplayNames(groupIds, tabId = null) {
  return executeInPage(
    async (ids) => {
      const response = await fetch('/api/content/v2/groups/get?includeActive=true&includeUsers=false', {
        body: JSON.stringify(ids.map(String)),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
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
 * Get all groups owned by a user or group.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedGroups(ownerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, ownerType) => {
      const allGroups = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/content/v2/groups/grouplist?limit=${limit}&offset=${offset}&owner=${ownerId}&ownerType=${ownerType}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allGroups.push(
            ...data
              .filter((g) => g.owners?.some((o) => o.type === ownerType && String(o.id) === String(ownerId)))
              .map((g) => ({
                id: g.groupId,
                name: g.name || g.groupId.toString()
              }))
          );
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allGroups;
    },
    [ownerId, ownerType],
    tabId
  );
}

/**
 * Free-text search for groups by name, paginated. Backs the group target
 * picker in the Transfer Ownership flow.
 * @param {string} text - Search term (empty string lists all groups)
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{groups: Array<{id: number, memberCount: number, name: string}>, hasMore: boolean}>}
 */
export async function searchGroups(text, tabId = null, offset = 0) {
  return executeInPage(
    async (text, offset, limit) => {
      const params = new URLSearchParams({
        ascending: 'true',
        limit: String(limit),
        offset: String(offset),
        search: text || '',
        sort: 'name'
      });
      const response = await fetch(`/api/content/v2/groups/grouplist?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed to search groups. Status: ${response.status}`);
      const data = await response.json();
      const groups = (Array.isArray(data) ? data : []).map((g) => ({
        id: g.groupId,
        memberCount: g.memberCount ?? null,
        name: g.name || String(g.groupId)
      }));
      return { groups, hasMore: groups.length === limit };
    },
    [text, offset, 50],
    tabId
  );
}

/**
 * Transfer group ownership to a new user or group.
 * @param {number[]} groupIds - Array of group IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferGroups(groupIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (groupIds, fromOwnerId, toOwnerId, ownerType) => {
      try {
        const body = groupIds.map((id) => ({
          addOwners: [{ id: toOwnerId, type: ownerType }],
          groupId: id,
          removeOwners: [{ id: fromOwnerId, type: ownerType }]
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
    [groupIds, fromOwnerId, toOwnerId, ownerType],
    tabId
  );
}
