import { executeInPage } from '@/utils/executeInPage';

/**
 * Get all goals owned by a user or group in the current period.
 * A user reads the personal `profile` endpoint (assigned/company/contributing/
 * personal/team buckets); a group reads the `teams-profile` endpoint, which
 * returns the goals owned by that team.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedGoals(ownerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, ownerType) => {
      // First get the current period
      const periodsResponse = await fetch('/api/social/v1/objectives/periods?all=true');
      if (!periodsResponse.ok) throw new Error(`HTTP ${periodsResponse.status}`);
      const periods = await periodsResponse.json();
      const currentPeriod = periods.find((p) => p.current);
      if (!currentPeriod) return [];

      const seen = new Set();
      const allGoals = [];

      const addGoals = (arr) => {
        if (!Array.isArray(arr)) return;
        for (const g of arr) {
          if (g.id != null && !seen.has(g.id)) {
            seen.add(g.id);
            allGoals.push({ id: g.id, name: g.name || g.id.toString() });
          }
        }
      };

      if (ownerType === 'GROUP') {
        const response = await fetch(
          `/api/social/v2/objectives/teams-profile?filterKeyResults=false&ownerId=${ownerId}&periodId=${currentPeriod.id}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        addGoals(data?.objectives);
        return allGoals;
      }

      const response = await fetch(
        `/api/social/v2/objectives/profile?filterKeyResults=false&includeSampleGoal=false&ownerId=${ownerId}&periodId=${currentPeriod.id}`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      if (!data) return [];

      // Response is { assigned, company, contributing, personal, team }
      // where each is an array of goals, except team which is a map of groupId → goal[]
      addGoals(data.assigned);
      addGoals(data.company);
      addGoals(data.contributing);
      addGoals(data.personal);

      // team is a map: { [groupId]: goal[] }
      if (data.team && typeof data.team === 'object') {
        for (const goals of Object.values(data.team)) {
          addGoals(goals);
        }
      }

      return allGoals;
    },
    [ownerId, ownerType],
    tabId
  );
}

/**
 * Transfer goal ownership to a new user or group.
 * @param {number[]} goalIds - Array of goal IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferGoals(goalIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (goalIds, toOwnerId, ownerType) => {
      const errors = [];
      let succeeded = 0;

      for (const id of goalIds) {
        try {
          // Fetch the full goal object
          const getResponse = await fetch(`/api/social/v1/objectives/${id}`);
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const goal = await getResponse.json();

          goal.ownerId = toOwnerId;
          goal.owners = [{ ownerId: toOwnerId, ownerType, primary: false }];

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
    [goalIds, toOwnerId, ownerType],
    tabId
  );
}
