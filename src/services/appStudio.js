import { executeInPage } from '@/utils/executeInPage';

/**
 * Extract form and queue widget IDs from page layout content.
 * The pageLayoutV4.content array contains all elements on an App Studio page,
 * including cards, forms (type: 'WORKFLOW'), and queues (type: 'QUEUE').
 * @param {Object} details - The metadata.details object from the stacks API
 * @returns {{ formWidgetIds: string[], queueWidgetIds: string[] }}
 */
export function extractPageContentIds(details) {
  const content = details?.pageLayoutV4?.content;
  if (!Array.isArray(content)) return { formWidgetIds: [], queueWidgetIds: [] };

  const formWidgetIds = [];
  const queueWidgetIds = [];

  function walk(items) {
    for (const item of items) {
      if (item.type === 'WORKFLOW' && item.workflowId) {
        formWidgetIds.push(item.workflowId);
      } else if (item.type === 'QUEUE' && item.queueWidgetId) {
        queueWidgetIds.push(item.queueWidgetId);
      }
      if (item.children) walk(item.children);
      if (item.columns) walk(item.columns);
      if (item.rows) walk(item.rows);
    }
  }

  walk(content);
  return { formWidgetIds, queueWidgetIds };
}

/**
 * Fetch enriched form details for forms on an App Studio page.
 * Each form on a page is referenced by a workflow widget ID. The enrichment
 * resolves widget → workflow model → form ID → form title.
 * @param {Object} params
 * @param {string[]} params.formWidgetIds - Workflow widget IDs from pageLayoutV4.content
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @returns {Promise<Array<{ id: string, modelVersion: string, title: string, workflowModelId: string, workflowWidgetId: string }>>}
 */
export async function getFormsForPage({ formWidgetIds, tabId = null }) {
  return executeInPage(
    async (formWidgetIds) => {
      const results = await Promise.all(
        formWidgetIds.map(async (widgetId) => {
          try {
            // Step 1: Resolve widget to workflow model and form ID
            const widgetResponse = await fetch(`/api/workflow/v1/models/widget/${widgetId}`);
            if (!widgetResponse.ok) return null;
            const widget = await widgetResponse.json();

            const formId = widget.startModel?.form?.id;
            const modelId = widget.modelId;
            const modelVersion = widget.modelVersion;
            if (!formId) return null;

            // Step 2: Fetch form details for the title
            const formResponse = await fetch(`/api/forms/v2/${formId}`);
            if (!formResponse.ok) return null;
            const form = await formResponse.json();

            return {
              id: formId,
              modelVersion: modelVersion || null,
              title: form.name || null,
              workflowModelId: modelId || null,
              workflowWidgetId: widgetId
            };
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    },
    [formWidgetIds],
    tabId
  );
}

/**
 * Get all App Studio apps owned by a user or group.
 * For a group, uses the search endpoint (direct ownership only); the
 * admin-summary endpoint has no group-owner filter and its user results
 * include group-inherited ownership, neither of which applies to a group
 * source.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAppStudioApps(ownerId, tabId = null, ownerType = 'USER') {
  if (ownerType === 'GROUP') {
    return getUserOwnedAppStudioApps(ownerId, tabId, 'GROUP');
  }
  return fetchOwnedDataApps(ownerId, 'app', tabId);
}

/**
 * Get all Worksheets owned by a user or group.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedWorksheets(ownerId, tabId = null, ownerType = 'USER') {
  if (ownerType === 'GROUP') {
    return getUserOwnedWorksheets(ownerId, tabId, 'GROUP');
  }
  return fetchOwnedDataApps(ownerId, 'worksheet', tabId);
}

/**
 * Fetch enriched queue details for queues on an App Studio page.
 * Each queue on a page is referenced by a queue widget ID. The enrichment
 * resolves widget → queue ID → queue name.
 * @param {Object} params
 * @param {string[]} params.queueWidgetIds - Queue widget IDs from pageLayoutV4.content
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @returns {Promise<Array<{ id: string, name: string, queueWidgetId: string }>>}
 */
export async function getQueuesForPage({ queueWidgetIds, tabId = null }) {
  return executeInPage(
    async (queueWidgetIds) => {
      const results = await Promise.all(
        queueWidgetIds.map(async (widgetId) => {
          try {
            // Step 1: Resolve widget to actual queue ID
            const widgetResponse = await fetch(`/api/queues/v1/widget/${widgetId}`);
            if (!widgetResponse.ok) return null;
            const widget = await widgetResponse.json();

            const queueId = widget.queueId;
            if (!queueId) return null;

            // Step 2: Fetch queue details for the name
            const queueResponse = await fetch(`/api/queues/v1/${queueId}`);
            if (!queueResponse.ok) return null;
            const queue = await queueResponse.json();

            return {
              id: queueId,
              name: queue.name || null,
              queueWidgetId: widgetId
            };
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    },
    [queueWidgetIds],
    tabId
  );
}

/**
 * Get App Studio apps owned by a user as an individual (not via group).
 * Uses the search endpoint which only returns direct ownership, unlike
 * getOwnedAppStudioApps which includes group-inherited ownership.
 * Used by the transfer flow — only individual ownership can be transferred.
 *
 * Note: the search index's `data_app` entity is a superset that includes
 * worksheets, so we fetch the worksheet entity in parallel and subtract
 * to produce an apps-only list.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getUserOwnedAppStudioApps(ownerId, tabId = null, ownerType = 'USER') {
  const [allDataApps, worksheets] = await Promise.all([
    searchUserOwnedDataApps(ownerId, 'data_app', tabId, ownerType),
    searchUserOwnedDataApps(ownerId, 'worksheet', tabId, ownerType)
  ]);
  const worksheetIds = new Set(worksheets.map((w) => w.id));
  return allDataApps.filter((a) => !worksheetIds.has(a.id));
}

/**
 * Get Worksheets owned by a user (or group) as a direct owner (not inherited).
 * Counterpart to getUserOwnedAppStudioApps for the worksheet subtype.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getUserOwnedWorksheets(ownerId, tabId = null, ownerType = 'USER') {
  return searchUserOwnedDataApps(ownerId, 'worksheet', tabId, ownerType);
}

/**
 * Share an App Studio app or Worksheet with a user. Both types share the same
 * `/api/content/v1/dataapps/share` endpoint — callers pass the app ID for
 * `DATA_APP` and `WORKSHEET`, or the parent app ID for `DATA_APP_VIEW` and
 * `WORKSHEET_VIEW`.
 * @param {Object} params
 * @param {string|number} params.appId - The app ID to share
 * @param {number} params.userId - The user ID to share with
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function shareStudioApp({ appId, tabId = null, userId }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed share report success. See executeInPage.
  const result = await executeInPage(
    async (appId, userId) => {
      const response = await fetch('/api/content/v1/dataapps/share?sendEmail=false', {
        body: JSON.stringify({
          dataAppIds: [appId],
          message: 'I thought you might find this interesting.',
          recipients: [{ id: userId, type: 'user' }]
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [appId, userId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to share app');
}

/**
 * Transfer App Studio app ownership to a new user or group.
 * @param {string[]} appIds - Array of app IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAppStudioApps(appIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return transferDataApps(appIds, fromOwnerId, toOwnerId, tabId, ownerType);
}

/**
 * Transfer Worksheet ownership to a new user or group.
 * @param {string[]} worksheetIds - Array of worksheet IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferWorksheets(worksheetIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return transferDataApps(worksheetIds, fromOwnerId, toOwnerId, tabId, ownerType);
}

/**
 * Shared pagination loop for the admin-summary dataapps endpoint. Both
 * apps and worksheets are stored as DATA_APP on the backend; the `type`
 * body field ('app' vs 'worksheet') is the server-side filter.
 * @param {number} userId - The Domo user ID
 * @param {'app'|'worksheet'} type - Subtype filter
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
function fetchOwnedDataApps(userId, type, tabId) {
  return executeInPage(
    async (userId, type) => {
      const allApps = [];
      const limit = 30;
      let skip = 0;
      let moreData = true;

      while (moreData) {
        const response = await fetch(`/api/content/v1/dataapps/adminsummary?limit=${limit}&skip=${skip}`, {
          body: JSON.stringify({
            ascending: true,
            includeOwnerClause: true,
            includeTitleClause: true,
            orderBy: 'title',
            ownerIds: [userId],
            titleSearchText: '',
            type
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const summaries = data.dataAppAdminSummaries;
        if (summaries && summaries.length > 0) {
          for (const app of summaries) {
            allApps.push({
              id: app.dataAppId.toString(),
              name: app.title || app.dataAppId.toString()
            });
          }
          skip += limit;
          if (summaries.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allApps;
    },
    [userId, type],
    tabId
  );
}

/**
 * Shared pagination loop for the search-endpoint dataapps query. The Domo
 * search index treats 'data_app' (app studio apps) and 'worksheet' as
 * distinct entity types despite both being DATA_APP on the backend, so the
 * entityList value is what routes the query.
 * @param {number} ownerId - The Domo user or group ID
 * @param {'data_app'|'worksheet'} entity - Search entity type
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
function searchUserOwnedDataApps(ownerId, entity, tabId, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, entity, ownerType) => {
      const allApps = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            combineResults: false,
            count,
            entityList: [[entity]],
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

        const apps = data.searchResultsMap?.[entity] || [];
        if (apps.length > 0) {
          allApps.push(
            ...apps.map((a) => ({
              id: a.databaseId.toString(),
              name: a.winnerText || a.databaseId.toString()
            }))
          );
          offset += count;
          if (apps.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allApps;
    },
    [ownerId, entity, ownerType],
    tabId
  );
}

/**
 * Transfer ownership of data apps (App Studio apps or Worksheets) to a new
 * user. Worksheet IDs are valid data-app IDs for the bulk-owners endpoints,
 * so this helper backs both transferAppStudioApps and transferWorksheets.
 * @param {string[]} ids - Array of data app IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
function transferDataApps(ids, fromOwnerId, toOwnerId, tabId, ownerType = 'USER') {
  return executeInPage(
    async (ids, fromOwnerId, toOwnerId, ownerType) => {
      try {
        // Add new owner
        const addResponse = await fetch('/api/content/v1/dataapps/bulk/owners', {
          body: JSON.stringify({
            entityIds: ids,
            note: '',
            owners: [{ id: parseInt(toOwnerId), type: ownerType }],
            sendEmail: false
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!addResponse.ok) throw new Error(`HTTP ${addResponse.status}`);

        // Remove old owner
        const removeResponse = await fetch('/api/content/v1/dataapps/bulk/owners/remove', {
          body: JSON.stringify({
            entityIds: ids,
            owners: [{ id: fromOwnerId, type: ownerType }]
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!removeResponse.ok) throw new Error(`HTTP ${removeResponse.status}`);

        return { errors: [], failed: 0, succeeded: ids.length };
      } catch (error) {
        return {
          errors: ids.map((id) => ({ error: error.message, id })),
          failed: ids.length,
          succeeded: 0
        };
      }
    },
    [ids, fromOwnerId, toOwnerId, ownerType],
    tabId
  );
}
