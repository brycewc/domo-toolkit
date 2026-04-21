import { executeInPage } from '@/utils';

/**
 * Get all Workspaces owned by a user.
 * Uses the shared search/v1/query endpoint with entityType "workspace".
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedWorkspaces(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allWorkspaces = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            combineResults: false,
            count,
            entityList: [['workspace']],
            facetValuesToInclude: [],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                name: 'Owned by',
                not: false,
                value: userId
              }
            ],
            hideSearchObjects: true,
            offset,
            query: '**',
            queryProfile: 'GLOBAL'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const workspaces = data.searchResultsMap?.workspace || [];
        if (workspaces.length > 0) {
          allWorkspaces.push(
            ...workspaces.map((w) => ({
              id: (w.databaseId ?? w.id)?.toString(),
              name: w.title || w.name || (w.databaseId ?? w.id)?.toString()
            }))
          );
          offset += count;
          if (workspaces.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allWorkspaces;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer Workspace ownership to a new user. Per-workspace three-step flow:
 *   1. GET members of the workspace.
 *   2. If destination user is already a member → PUT their role to OWNER.
 *      Otherwise → POST to create them as an OWNER member.
 *      (A bare POST for an existing member returns 200 without promoting,
 *      so the membership branch must be deterministic.)
 *   3. If the source user is a direct member → DELETE that membership.
 *      If they aren't (e.g. owner-via-group), skip DELETE.
 *
 * A failure at step 2 aborts the workspace. A failure at step 3 surfaces a
 * "two-owners" error so the caller can manually clean up.
 *
 * @param {string[]} workspaceIds - Array of workspace IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferWorkspaces(
  workspaceIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (workspaceIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of workspaceIds) {
        try {
          // Step 1: list current members
          const listRes = await fetch(
            `/api/nav/v1/workspaces/${id}/members`,
            { method: 'GET' }
          );
          if (!listRes.ok) {
            throw new Error(`List members HTTP ${listRes.status}`);
          }
          const payload = await listRes.json();
          const members = Array.isArray(payload)
            ? payload
            : payload.members || [];

          const destMember = members.find(
            (m) => m.memberType === 'USER' && m.memberId === toUserId
          );
          const sourceMember = members.find(
            (m) => m.memberType === 'USER' && m.memberId === fromUserId
          );

          // Step 2: ensure destination is OWNER
          if (destMember) {
            const putRes = await fetch(
              `/api/nav/v1/workspaces/${id}/members/${destMember.id}`,
              {
                body: JSON.stringify({
                  ...destMember,
                  memberRole: 'OWNER'
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'PUT'
              }
            );
            if (!putRes.ok) {
              throw new Error(`Promote existing member HTTP ${putRes.status}`);
            }
          } else {
            const postRes = await fetch(
              `/api/nav/v1/workspaces/${id}/members/${toUserId}`,
              {
                body: JSON.stringify({
                  members: [
                    {
                      memberId: toUserId,
                      memberRole: 'OWNER',
                      memberType: 'USER'
                    }
                  ],
                  sendEmail: false
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST'
              }
            );
            if (!postRes.ok) {
              throw new Error(`Add OWNER HTTP ${postRes.status}`);
            }
          }

          // Step 3: remove the previous owner if they're a direct member
          if (sourceMember) {
            const delRes = await fetch(
              `/api/nav/v1/workspaces/${id}/members/${sourceMember.id}`,
              { method: 'DELETE' }
            );
            if (!delRes.ok) {
              throw new Error(
                `Promoted new OWNER but failed to remove previous owner: HTTP ${delRes.status}. Workspace may now have two owners.`
              );
            }
          }

          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [workspaceIds, fromUserId, toUserId],
    tabId
  );
}
