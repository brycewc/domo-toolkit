/**
 * Domo API service for user-related operations
 */

import { executeInPage } from '@/utils';

/**
 * Get the current user's ID
 * @returns {Promise<number>} The current user ID
 * @throws {Error} If unable to fetch user ID
 */
export async function getCurrentUserId(tabId = null) {
  const result = await executeInPage(
    async () => {
      // Try to get from bootstrap
      if (window.bootstrap?.currentUser?.USER_ID) {
        return window.bootstrap.currentUser.USER_ID;
      }
      // Fallback to API
      const response = await fetch('/api/sessions/v1/me');

      if (!response.ok) {
        throw new Error(
          `Failed to fetch current user. Status: ${response.status}`
        );
      }

      const user = await response.json();
      if (!user.userId) {
        throw new Error('User ID not found in session response');
      }

      return user.userId;
    },
    [],
    tabId
  );
  if (result !== undefined) {
    return result;
  }
}

const USERS_PAGE_SIZE = 50;

export async function searchUsers(text, tabId = null, offset = 0) {
  const result = await executeInPage(
    async (text, offset, limit) => {
      const url = '/api/identity/v1/users/search?explain=false';
      const body = {
        cacheBuster: Date.now(),
        filters: [{ filterType: 'text', text }],
        showCount: true,
        includeDeleted: false,
        onlyDeleted: false,
        includeSupport: false,
        limit,
        offset,
        sort: { field: 'displayName', order: 'ASC' },
        parts: ['MINIMAL'],
        attributes: ['department', 'title', 'avatarKey', 'created']
      };
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
        credentials: 'include'
      });

      if (!response.ok) {
        throw new Error(`Failed to search users. Status: ${response.status}`);
      }

      const data = await response.json();
      return {
        users: data.users || [],
        totalCount: data.count ?? null
      };
    },
    [text, offset, USERS_PAGE_SIZE],
    tabId
  );

  return result;
}
