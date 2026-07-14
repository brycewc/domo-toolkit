import { executeInPage } from '@/utils/executeInPage';

/**
 * Get all Workspaces owned by a user or group.
 * Uses the shared search/v1/query endpoint with entityType "workspace".
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedWorkspaces(ownerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, ownerType) => {
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
                value: ownerType === 'GROUP' ? `${ownerId}:GROUP` : ownerId
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
              name: w.winnerText || (w.databaseId ?? w.id)?.toString()
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
    [ownerId, ownerType],
    tabId
  );
}

/**
 * Fetch every Workspace the given entity has been added to, following the
 * endpoint's limit/offset pagination until a short page is returned.
 *
 * @param {Object} params
 * @param {string|number} params.entityId - The object's id (or its parent app/worksheet id for view types)
 * @param {string} params.entityType - Workspaces API entityType (CARD, DATASET, DATAFLOW, DASHBOARD, DATA_APP, WORKFLOW_MODEL, WORKSHEET)
 * @param {number} [params.limit=100] - Page size
 * @param {number|null} [params.tabId] - Target tab
 * @returns {Promise<Array<{guid: string, name: string}>>} Raw workspace objects
 */
export async function getWorkspacesForEntity({ entityId, entityType, limit = 100, tabId = null }) {
  return executeInPage(
    async (entityId, entityType, limit) => {
      const workspaces = [];
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/nav/v1/workspaces/entity/${entityType}/${encodeURIComponent(entityId)}?limit=${limit}&offset=${offset}`
        );
        if (response.status === 404) break;
        if (!response.ok) {
          throw new Error(`Failed to fetch workspaces for ${entityType}/${entityId} (HTTP ${response.status})`);
        }

        const data = await response.json();
        const results = Array.isArray(data?.results) ? data.results : [];
        workspaces.push(...results);

        if (results.length < limit) {
          moreData = false;
        } else {
          offset += limit;
        }
      }

      return workspaces;
    },
    [entityId, entityType, limit],
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
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Member type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferWorkspaces(workspaceIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (workspaceIds, fromOwnerId, toOwnerId, ownerType) => {
      const errors = [];
      let succeeded = 0;

      for (const id of workspaceIds) {
        try {
          // Step 1: list current members
          const listRes = await fetch(`/api/nav/v1/workspaces/${id}/members`, { method: 'GET' });
          if (!listRes.ok) {
            throw new Error(`List members HTTP ${listRes.status}`);
          }
          const payload = await listRes.json();
          const members = Array.isArray(payload) ? payload : payload.members || [];

          // Compare ids as strings: the members API returns memberId as a
          // different type than the from/to ids in some cases, and a strict
          // === miss on the source member would silently skip the step-3
          // DELETE below, leaving the old owner on the workspace. Member type
          // must also match the owner type so a group source/destination is
          // found (and added) as a GROUP member rather than a USER.
          const destMember = members.find((m) => m.memberType === ownerType && String(m.memberId) === String(toOwnerId));
          const sourceMember = members.find((m) => m.memberType === ownerType && String(m.memberId) === String(fromOwnerId));

          // Step 2: ensure destination is OWNER
          if (destMember) {
            const putRes = await fetch(`/api/nav/v1/workspaces/${id}/members/${destMember.id}`, {
              body: JSON.stringify({
                ...destMember,
                memberRole: 'OWNER'
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            });
            if (!putRes.ok) {
              throw new Error(`Promote existing member HTTP ${putRes.status}`);
            }
          } else {
            const postRes = await fetch(`/api/nav/v1/workspaces/${id}/members`, {
              body: JSON.stringify({
                emailMessage: 'Bulk ownership transfer via Domo Toolkit',
                members: [
                  {
                    memberId: toOwnerId,
                    memberRole: 'OWNER',
                    memberType: ownerType
                  }
                ],
                sendEmail: false
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            });
            if (!postRes.ok) {
              throw new Error(`Add OWNER HTTP ${postRes.status}`);
            }
          }

          // Step 3: remove the previous owner if they're a direct member
          if (sourceMember) {
            const delRes = await fetch(`/api/nav/v1/workspaces/${id}/members/${sourceMember.id}`, {
              method: 'DELETE'
            });
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
    [workspaceIds, fromOwnerId, toOwnerId, ownerType],
    tabId
  );
}

/**
 * Translate a detected DomoObjectType id to the entityType value the Workspaces
 * API expects. App pages and worksheet views resolve to their container type
 * (DATA_APP / WORKSHEET); the caller supplies the container's id via parentId.
 *
 * @param {string} typeId - The current object's DomoObjectType id
 * @returns {string|null} The API entityType, or null if the type is unsupported
 */
export function workspaceEntityTypeFor(typeId) {
  return ENTITY_TYPE_BY_TYPE_ID[typeId] || null;
}

// Detected DomoObjectType id -> Workspaces API entityType. The *_VIEW variants
// (the page/view a user actually lands on) map to their container's type, since
// Workspace membership lives on the whole app/worksheet, not the individual page.
const ENTITY_TYPE_BY_TYPE_ID = {
  CARD: 'CARD',
  DATA_APP: 'DATA_APP',
  DATA_APP_VIEW: 'DATA_APP',
  DATA_SOURCE: 'DATASET',
  DATAFLOW_TYPE: 'DATAFLOW',
  PAGE: 'DASHBOARD',
  WORKFLOW_MODEL: 'WORKFLOW_MODEL',
  WORKSHEET: 'WORKSHEET',
  WORKSHEET_VIEW: 'WORKSHEET'
};
