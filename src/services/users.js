/**
 * Domo API service for user-related operations
 */

import { executeInPage } from '@/utils';

/**
 * Get the current user with ID and metadata
 * @param {number|null} tabId - The tab ID to execute in (optional)
 * @returns {Promise<{id: number, metadata: Object}>} The current user object
 * @throws {Error} If unable to fetch user from any source
 */
export async function getCurrentUser(tabId = null) {
  const result = await executeInPage(
    async () => {
      for (let i = 0; i < 3; i++) {
        if (window.bootstrap?.currentUser?.USER_ID) {
          // eslint-disable-next-line no-unused-vars
          const { USER_ID, USER_RIGHTS, ...metadata } = window.bootstrap.currentUser;
          metadata.USER_RIGHTS = window.bootstrap?.data?.authorities || [];
          return { id: USER_ID, metadata };
        }
        if (i < 2) {
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      throw new Error('window.bootstrap not available after 3 attempts');
    },
    [],
    tabId
  );
  if (result !== undefined) {
    return result;
  }
}

/**
 * Get the current user's ID
 * @param {number|null} tabId - The tab ID to execute in (optional)
 * @returns {Promise<number>} The current user ID
 * @throws {Error} If unable to fetch user ID
 */
export async function getCurrentUserId(tabId = null) {
  const user = await getCurrentUser(tabId);
  return user?.id;
}

const USERS_PAGE_SIZE = 50;

/**
 * Bulk-update user profile fields via the v2 users/bulk endpoint.
 * Each entry in `users` must include `id` (as a string) plus any fields to set.
 * @param {Array<Object>} users
 * @param {number|null} tabId
 * @returns {Promise<boolean>} true on success
 */
export async function bulkUpdateUsers(users, tabId = null) {
  const transactionId = crypto.randomUUID();
  return executeInPage(
    async (users, transactionId) => {
      const response = await fetch('/api/content/v2/users/bulk', {
        body: JSON.stringify({ transactionId, users }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      return response.ok;
    },
    [users, transactionId],
    tabId
  );
}

/**
 * Create a new Domo user. Returns the created user with its ID.
 * @param {Object} params
 * @param {string} params.displayName - Full name for the new user
 * @param {number} params.roleId - Role ID to assign
 * @param {string} params.email - Email address for the new user
 * @param {boolean} [params.sendInvite=true] - Whether to send an invite email
 * @param {number|null} [tabId]
 * @returns {Promise<{id: number, displayName: string, email: string}|null>}
 */
export async function createUser(
  { displayName, email, roleId, sendInvite = true },
  tabId = null
) {
  return executeInPage(
    async (displayName, email, roleId, sendInvite) => {
      const response = await fetch(
        `/api/content/v3/users?sendInvite=${sendInvite}`,
        {
          body: JSON.stringify({
            detail: { email },
            displayName,
            roleId
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      if (!response.ok) return null;
      const data = await response.json();
      const id = data?.id ?? data?.userId ?? null;
      if (!id) return null;
      return { displayName, email, id };
    },
    [displayName, email, roleId, sendInvite],
    tabId
  );
}

/**
 * Delete a user by their ID.
 * @param {number} userId - The Domo user ID to delete
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<void>}
 */
export async function deleteUser(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(`/api/identity/v1/users/${userId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(`Failed to delete user. HTTP status: ${response.status}`);
      }
    },
    [userId],
    tabId
  );
}

export async function fetchUserDisplayNames(userIds, tabId = null) {
  return executeInPage(
    async (ids) => {
      const response = await fetch(
        `/api/content/v3/users?id=${ids.join(',')}`
      );
      if (!response.ok) return {};
      const users = await response.json();
      const map = {};
      for (const user of users) {
        if (user.id != null && user.displayName) {
          map[user.id] = user.displayName;
        }
      }
      return map;
    },
    [userIds],
    tabId
  );
}

/**
 * Returns user IDs from the given list that have a custom (non-default) avatar.
 * Compares each avatar's blob size against the default avatar fetched for
 * a non-existent user (ID 0). The default size is cached on window for the
 * lifetime of the page so only one extra fetch is needed per session.
 */
export async function getCustomAvatarUserIds(userIds, tabId = null) {
  return executeInPage(
    async (userIds) => {
      if (!window.__domoDefaultAvatarSize) {
        try {
          const res = await fetch(
            '/api/content/v1/avatar/USER/0?size=100'
          );
          const blob = await res.blob();
          window.__domoDefaultAvatarSize = blob.size;
        } catch {
          return userIds;
        }
      }

      const defaultSize = window.__domoDefaultAvatarSize;
      const results = await Promise.all(
        userIds.map((id) =>
          fetch(`/api/content/v1/avatar/USER/${id}?size=100`)
            .then((res) => res.blob())
            .then((blob) => (blob.size !== defaultSize ? id : null))
            .catch(() => id)
        )
      );

      return results.filter(Boolean);
    },
    [userIds],
    tabId
  );
}

/**
 * Fetch a user with the full DETAILED parts payload, including role and
 * profile fields needed for duplication.
 * @param {number|string} userId
 * @param {number|null} tabId
 * @returns {Promise<Object|null>} User object with roleId, title, department, etc.
 */
export async function getFullUserDetails(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(
        `/api/identity/v1/users/${userId}?parts=DETAILED`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data?.users?.[0] ?? data ?? null;
    },
    [userId],
    tabId
  );
}

/**
 * Get basic details for a user by ID.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{id: number, displayName: string, active: boolean}|null>}
 */
export async function getUserDetails(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(`/api/content/v3/users/${userId}?includeDetails=true`);
      if (!response.ok) return null;
      const user = await response.json();
      return {
        active: user?.detail?.active,
        displayName: user?.displayName || null,
        id: user?.id || userId
      };
    },
    [userId],
    tabId
  );
}

/**
 * Get the group IDs the given user belongs to.
 * @param {number|string} userId - The user ID
 * @param {number|null} tabId - The tab ID to execute in (optional)
 * @returns {Promise<string[]>} Array of group ID strings
 */
export async function getUserGroups(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(
        `/api/content/v2/groups/grouplist?ascending=true&limit=10000&members=${userId}&offset=0&sort=name`
      );
      if (!response.ok) return [];
      const data = await response.json();
      return (data || []).map((g) => String(g.groupId));
    },
    [userId],
    tabId
  );
}

/**
 * Get a user's display name by ID.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<string|null>} The user's display name or null
 */
export async function getUserName(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(`/api/content/v3/users/${userId}`);
      if (!response.ok) return null;
      const user = await response.json();
      return user.displayName || null;
    },
    [userId],
    tabId
  );
}

/**
 * Get the user ID of a user's manager (reportsTo).
 * @param {number|string} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<number|null>} The manager's user ID, or null
 */
export async function getUserReportsTo(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(
        `/api/content/v2/users/${userId}/teams`
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data.reportsTo?.[0]?.userId ?? null;
    },
    [userId],
    tabId
  );
}

export async function searchUsers(text, tabId = null, offset = 0) {
  const result = await executeInPage(
    async (text, offset, limit) => {
      const url = '/api/identity/v1/users/search?explain=false';
      const body = {
        attributes: ['department', 'title', 'avatarKey', 'created'],
        cacheBuster: Date.now(),
        filters: [{ filterType: 'text', text }],
        includeDeleted: false,
        includeSupport: false,
        limit,
        offset,
        onlyDeleted: false,
        parts: ['MINIMAL'],
        showCount: true,
        sort: { field: 'displayName', order: 'ASC' }
      };
      const response = await fetch(url, {
        body: JSON.stringify(body),
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Failed to search users. Status: ${response.status}`);
      }

      const data = await response.json();
      return {
        totalCount: data.count ?? null,
        users: data.users || []
      };
    },
    [text, offset, USERS_PAGE_SIZE],
    tabId
  );

  return result;
}

/**
 * Patch attributes on a user (e.g., locale).
 * @param {number|string} userId
 * @param {Array<{key: string, values: string[]}>} attributes
 * @param {number|null} tabId
 * @returns {Promise<boolean>} true on success
 */
export async function setUserAttributes(userId, attributes, tabId = null) {
  return executeInPage(
    async (userId, attributes) => {
      const response = await fetch(`/api/identity/v1/users/${userId}`, {
        body: JSON.stringify({ attributes }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      return response.ok;
    },
    [userId, attributes],
    tabId
  );
}
