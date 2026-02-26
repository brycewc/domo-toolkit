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
