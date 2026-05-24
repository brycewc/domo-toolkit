/**
 * Derive the set of cards, pages, and custom apps that have been shared
 * directly with a user as an individual, excluding access they have through
 * group membership or Workspace membership.
 *
 * Used by the Duplicate User flow to compute exactly which resources should
 * be re-shared with the new user, so the new user does not inherit a sprawl
 * of redundant direct grants on top of their group memberships.
 *
 * Algorithm:
 *   1. GET /api/content/v1/access/users/{userId} for the combined access list.
 *   2. Keep accessRecords where groupId is null and userId matches the target.
 *   3. For each surviving candidate, look up containing Workspaces. If the
 *      user or any of their groups is a member of any containing Workspace,
 *      drop the candidate (it is Workspace-derived access, not an individual
 *      share). For pageId records, try entity/page first and fall back to
 *      entity/dataApp using the parent app ID for data app views.
 *   4. Hydrate names from the access response and return grouped by type.
 *
 * Fail-open on Workspaces lookup failures: if a workspace check errors, the
 * candidate survives so the operator can still review and deselect via the
 * preview checkboxes. Better than silently dropping legitimate shares.
 */

import { executeInPage } from '@/utils/executeInPage';

import { getUserGroups } from './users';

/**
 * @typedef {Object} IndividualShareSet
 * @property {Array<{id: number, name: string, permissionMask: number}>} cards
 * @property {Array<{id: number, title: string, permissionMask: number}>} pages
 * @property {Array<{id: number, name: string, permissionMask: number}>} customApps
 */

/**
 * @param {number|string} userId - Source user ID
 * @param {number|null} [tabId]
 * @returns {Promise<IndividualShareSet>}
 */
export async function getIndividualSharesForUser(userId, tabId = null) {
  const numericUserId = Number(userId);

  const [accessInfo, userGroupsRich] = await Promise.all([
    fetchUserAccess(numericUserId, tabId),
    getUserGroups(numericUserId, tabId)
  ]);

  // All group types contribute to Workspace-derived access (system/dynamic
  // groups can be Workspace members too), so we deliberately do NOT filter
  // by groupType here — only the "add to groups" step filters.
  const userGroupIds = new Set(
    (userGroupsRich || []).map((g) => Number(g.groupId))
  );

  const candidates = (accessInfo?.accessRecords || []).filter((r) => {
    const noGroup = r.groupId == null || r.groupId === 0;
    const userMatches = Number(r.userId) === numericUserId;
    return noGroup && userMatches;
  });

  const workspacesCache = new Map();
  const membersCache = new Map();

  const survivorsByKey = new Map();
  await Promise.all(
    candidates.map(async (record) => {
      try {
        const key = recordKey(record);
        if (!key || survivorsByKey.has(key)) return;
        const isWorkspaceDerived = await isCandidateWorkspaceDerived({
          membersCache,
          record,
          tabId,
          userGroupIds,
          userId: numericUserId,
          workspacesCache
        });
        if (!isWorkspaceDerived) survivorsByKey.set(key, record);
      } catch (err) {
        // Fail-open per candidate: keep the record so the operator can review
        // and deselect it manually, rather than dropping it silently.
        console.warn(
          '[userIndividualShares] Per-record processing failed, keeping candidate',
          record,
          err
        );
        const key = recordKey(record);
        if (key && !survivorsByKey.has(key)) survivorsByKey.set(key, record);
      }
    })
  );

  return hydrateSurvivors(Array.from(survivorsByKey.values()), accessInfo);
}

async function cachedWorkspacesByEntity(entityType, entityId, tabId, cache) {
  const key = `${entityType}:${entityId}`;
  if (!cache.has(key)) {
    const promise = fetchWorkspacesByEntity(entityType, entityId, tabId).catch(
      (err) => {
        console.warn(
          `[userIndividualShares] workspacesByEntity failed for ${entityType}:${entityId}`,
          err
        );
        return [];
      }
    );
    cache.set(key, promise);
  }
  const result = await cache.get(key);
  return Array.isArray(result) ? result : [];
}

async function fetchPageParentAppId(pageId, tabId) {
  return executeInPage(
    async (pageId) => {
      try {
        const response = await fetch(
          '/api/content/v1/pages/summary?limit=1&skip=0',
          {
            body: JSON.stringify({ pageId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!response.ok) return null;
        const data = await response.json();
        const appId = data?.pages?.[0]?.dataAppId;
        return appId != null ? Number(appId) : null;
      } catch {
        return null;
      }
    },
    [pageId],
    tabId
  );
}

async function fetchUserAccess(userId, tabId) {
  return executeInPage(
    async (userId) => {
      const response = await fetch(`/api/content/v1/access/users/${userId}`);
      if (!response.ok) {
        throw new Error(
          `Failed to fetch access info for user ${userId} (HTTP ${response.status})`
        );
      }
      return response.json();
    },
    [userId],
    tabId
  );
}

async function fetchWorkspaceMembers(guid, tabId) {
  return executeInPage(
    async (guid) => {
      const response = await fetch(`/api/nav/v1/workspaces/${guid}/members`);
      if (!response.ok) {
        throw new Error(
          `getWorkspaceMembers ${guid} returned HTTP ${response.status}`
        );
      }
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    [guid],
    tabId
  );
}

async function fetchWorkspacesByEntity(entityType, entityId, tabId) {
  return executeInPage(
    async (entityType, entityId) => {
      const response = await fetch(
        `/api/nav/v1/workspaces/entity/${entityType}/${encodeURIComponent(entityId)}?limit=100&offset=0`
      );
      if (response.status === 404) return [];
      if (!response.ok) {
        throw new Error(
          `workspacesByEntity ${entityType}/${entityId} returned HTTP ${response.status}`
        );
      }
      const data = await response.json();
      return Array.isArray(data?.results) ? data.results : [];
    },
    [entityType, entityId],
    tabId
  );
}

async function getContainingWorkspaces(record, tabId, cache) {
  if (record.cardId != null) {
    return cachedWorkspacesByEntity('card', record.cardId, tabId, cache);
  }
  if (record.pageId != null) {
    const asPage = await cachedWorkspacesByEntity('page', record.pageId, tabId, cache);
    if (asPage.length > 0) return asPage;
    // Empty result: could be a true free-standing page (correct), or a data
    // app view whose Workspace membership lives on its parent app. Try to
    // resolve the parent and retry as a dataApp entity.
    const parentAppId = await fetchPageParentAppId(record.pageId, tabId);
    if (parentAppId != null) {
      return cachedWorkspacesByEntity('dataApp', parentAppId, tabId, cache);
    }
    return [];
  }
  if (record.domoappId != null) {
    // Custom (pro-code) apps. Workspaces does not surface these consistently
    // by a known entity type, so we skip the check and let the candidate
    // survive. The preview checkboxes are the safety net.
    return [];
  }
  return [];
}

async function getWorkspaceMembersCached(workspace, tabId, cache) {
  const key = workspace.guid;
  if (!cache.has(key)) {
    // The workspacesByEntity response already embeds a `members` array. Use
    // it when present. Fall back to a dedicated fetch only if the embedded
    // array is missing or empty (can happen for paginated/partial responses).
    if (Array.isArray(workspace.members) && workspace.members.length > 0) {
      cache.set(key, Promise.resolve(workspace.members));
    } else {
      const promise = fetchWorkspaceMembers(workspace.guid, tabId).catch(
        (err) => {
          console.warn(
            `[userIndividualShares] getWorkspaceMembers failed for ${workspace.guid}`,
            err
          );
          return [];
        }
      );
      cache.set(key, promise);
    }
  }
  const result = await cache.get(key);
  return Array.isArray(result) ? result : [];
}

function hydrateSurvivors(survivors, accessInfo) {
  const cardsById = new Map(
    (accessInfo?.cards || []).map((c) => [Number(c.id), c])
  );
  const pagesMap = accessInfo?.pages || {};

  const cards = [];
  const pages = [];
  const customApps = [];

  for (const r of survivors) {
    const mask = r.permission?.mask ?? 0;
    if (r.cardId != null) {
      const card = cardsById.get(Number(r.cardId));
      cards.push({
        id: Number(r.cardId),
        name: card?.title || card?.name || `Card ${r.cardId}`,
        permissionMask: mask
      });
    } else if (r.pageId != null) {
      const page = pagesMap[r.pageId] || pagesMap[String(r.pageId)];
      pages.push({
        id: Number(r.pageId),
        permissionMask: mask,
        title: page?.title || page?.name || `Page ${r.pageId}`
      });
    } else if (r.domoappId != null) {
      customApps.push({
        id: Number(r.domoappId),
        name: `Custom App ${r.domoappId}`,
        permissionMask: mask
      });
    }
  }

  const byNameAsc = (a, b) =>
    (a.name || a.title || '').localeCompare(b.name || b.title || '', undefined, {
      sensitivity: 'base'
    });
  cards.sort(byNameAsc);
  pages.sort(byNameAsc);
  customApps.sort(byNameAsc);

  return { cards, customApps, pages };
}

async function isCandidateWorkspaceDerived({
  membersCache,
  record,
  tabId,
  userGroupIds,
  userId,
  workspacesCache
}) {
  let workspaces;
  try {
    workspaces = await getContainingWorkspaces(record, tabId, workspacesCache);
  } catch (err) {
    console.warn(
      '[userIndividualShares] getContainingWorkspaces threw, keeping candidate',
      record,
      err
    );
    return false;
  }
  if (!Array.isArray(workspaces) || workspaces.length === 0) return false;
  for (const ws of workspaces) {
    if (!ws?.guid) continue;
    let members;
    try {
      members = await getWorkspaceMembersCached(ws, tabId, membersCache);
    } catch (err) {
      console.warn(
        `[userIndividualShares] Member lookup failed for ${ws.guid}`,
        err
      );
      continue;
    }
    if (memberMatches(members, userId, userGroupIds)) return true;
  }
  return false;
}

function memberMatches(members, userId, userGroupIds) {
  for (const m of members) {
    if (m.memberType === 'USER' && Number(m.memberId) === userId) return true;
    if (m.memberType === 'GROUP' && userGroupIds.has(Number(m.memberId))) return true;
  }
  return false;
}

function recordKey(record) {
  if (record.cardId != null) return `card:${record.cardId}`;
  if (record.pageId != null) return `page:${record.pageId}`;
  if (record.domoappId != null) return `customApp:${record.domoappId}`;
  return null;
}
