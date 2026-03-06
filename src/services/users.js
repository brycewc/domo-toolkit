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
      // Try to get from bootstrap
      if (window.bootstrap?.currentUser?.USER_ID) {
        const { USER_ID, ...metadata } = window.bootstrap.currentUser;
        return { id: USER_ID, metadata };
      }

      // Fallback to first API endpoint
      try {
        const response = await fetch('/api/identity/v1/authentication/session');
        if (response.ok) {
          const user = await response.json();
          if (user.userId) {
            const { userId, ...metadata } = user;
            return { id: userId, metadata };
          }
        }
      } catch (e) {
        // Continue to next fallback
      }

      // Fallback to second API endpoint
      try {
        const response = await fetch('/api/content/v2/authentication/session');
        if (response.ok) {
          const user = await response.json();
          if (user.userId) {
            const { userId, ...metadata } = user;
            return { id: userId, metadata };
          }
        }
      } catch (e) {
        // Continue to error
      }

      throw new Error('Unable to fetch current user from any source');
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

export async function fetchUserDisplayNames(userIds, tabId = null) {
  return executeInPage(
    async (ids) => {
      const response = await fetch(
        `/api/content/v3/users?id=${ids.join(',')}`,
        { credentials: 'include' }
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
            '/api/content/v1/avatar/USER/0?size=100',
            { credentials: 'include' }
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
          fetch(`/api/content/v1/avatar/USER/${id}?size=100`, {
            credentials: 'include'
          })
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
        credentials: 'include',
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
