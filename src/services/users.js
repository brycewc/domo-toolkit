/**
 * Domo API service for user-related operations
 */

import { executeInPage } from '@/utils';

/**
 * Get the current user's ID
 * @returns {Promise<number>} The current user ID
 * @throws {Error} If unable to fetch user ID
 */
export async function getCurrentUserId() {
  const userId = await executeInPage(async () => {
    // Try to get from bootstrap
    if (window.bootstrap?.currentUser?.USER_ID) {
      return window.bootstrap.currentUser.USER_ID;
    }

    // Fallback to API
    const response = await fetch('/api/sessions/v1/me', {
      credentials: 'include'
    });

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
  }, []);

  if (!userId) {
    throw new Error('Could not determine current user ID');
  }

  return userId;
}
