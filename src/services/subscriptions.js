import { executeInPage } from '@/utils';

/**
 * Get all Domo Everywhere subscriptions owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedSubscriptions(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const ownedSubscriptions = [];

      // Get all subscription summaries
      const response = await fetch('api/publish/v2/subscriptions/summaries');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const summaries = await response.json();

      if (!summaries || summaries.length === 0) return [];

      // Check each subscription's owner
      for (const summary of summaries) {
        try {
          const shareResponse = await fetch(
            `api/publish/v2/subscriptions/${summary.subscriptionId}/share`
          );
          if (!shareResponse.ok) continue;
          const share = await shareResponse.json();

          if (share.userId == userId) {
            ownedSubscriptions.push({
              id: share.subscription.id,
              name:
                summary.subscriptionName ||
                share.subscription.id.toString()
            });
          }
        } catch {
          // Skip subscriptions that fail to load
        }
      }

      return ownedSubscriptions;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer subscription ownership to a new user.
 * @param {string[]} subscriptionIds - Array of subscription IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferSubscriptions(
  subscriptionIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (subscriptionIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of subscriptionIds) {
        try {
          // Fetch subscription details
          const shareResponse = await fetch(
            `api/publish/v2/subscriptions/${id}/share`
          );
          if (!shareResponse.ok)
            throw new Error(`HTTP ${shareResponse.status}`);
          const share = await shareResponse.json();

          const response = await fetch(
            `/api/publish/v2/subscriptions/${id}`,
            {
              body: JSON.stringify({
                customerId: share.subscription.customerId,
                domain: share.subscription.domain,
                groupIds: share.shareGroups,
                publicationId: share.subscription.publicationId,
                userId: toUserId,
                userIds: share.shareUsers
              }),
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
    [subscriptionIds, fromUserId, toUserId],
    tabId
  );
}
