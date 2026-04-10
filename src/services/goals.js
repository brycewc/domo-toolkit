import { executeInPage } from '@/utils';

/**
 * Get all goals owned by a user in the current period.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedGoals(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      // First get the current period
      const periodsResponse = await fetch(
        '/api/social/v1/objectives/periods?all=true'
      );
      if (!periodsResponse.ok)
        throw new Error(`HTTP ${periodsResponse.status}`);
      const periods = await periodsResponse.json();
      const currentPeriod = periods.find((p) => p.current);
      if (!currentPeriod) return [];

      const response = await fetch(
        `/api/social/v2/objectives/profile?filterKeyResults=false&includeSampleGoal=false&ownerId=${userId}&periodId=${currentPeriod.id}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const goals = await response.json();

      if (!goals || goals.length === 0) return [];
      return goals.map((g) => ({ id: g.id, name: g.name || g.id.toString() }));
    },
    [userId],
    tabId
  );
}

/**
 * Transfer goal ownership to a new user.
 * @param {number[]} goalIds - Array of goal IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferGoals(
  goalIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (goalIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of goalIds) {
        try {
          // Fetch the full goal object
          const getResponse = await fetch(
            `/api/social/v1/objectives/${id}`
          );
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const goal = await getResponse.json();

          goal.ownerId = toUserId;
          goal.owners = [
            { ownerId: toUserId, ownerType: 'USER', primary: false }
          ];

          const response = await fetch(`/api/social/v1/objectives/${id}`, {
            body: JSON.stringify(goal),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [goalIds, fromUserId, toUserId],
    tabId
  );
}
