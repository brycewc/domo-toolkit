import { executeInPage } from '@/utils';

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
            const widgetResponse = await fetch(
              `/api/workflow/v1/models/widget/${widgetId}`
            );
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
 * Get all App Studio apps owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAppStudioApps(userId, tabId = null) {
  return fetchOwnedDataApps(userId, 'app', tabId);
}

/**
 * Get all Worksheets owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedWorksheets(userId, tabId = null) {
  return fetchOwnedDataApps(userId, 'worksheet', tabId);
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
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getUserOwnedAppStudioApps(userId, tabId = null) {
  return searchUserOwnedDataApps(userId, 'data_app', tabId);
}

/**
 * Get Worksheets owned by a user as an individual (not via group).
 * Counterpart to getUserOwnedAppStudioApps for the worksheet subtype.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getUserOwnedWorksheets(userId, tabId = null) {
  return searchUserOwnedDataApps(userId, 'worksheet', tabId);
}

/**
 * Transfer App Studio app ownership to a new user.
 * @param {string[]} appIds - Array of app IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAppStudioApps(
  appIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return transferDataApps(appIds, fromUserId, toUserId, tabId);
}

/**
 * Transfer Worksheet ownership to a new user.
 * @param {string[]} worksheetIds - Array of worksheet IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferWorksheets(
  worksheetIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return transferDataApps(worksheetIds, fromUserId, toUserId, tabId);
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
        const response = await fetch(
          `/api/content/v1/dataapps/adminsummary?limit=${limit}&skip=${skip}`,
          {
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
          }
        );
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
 * @param {number} userId - The Domo user ID
 * @param {'data_app'|'worksheet'} entity - Search entity type
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
function searchUserOwnedDataApps(userId, entity, tabId) {
  return executeInPage(
    async (userId, entity) => {
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

        const apps = data.searchResultsMap?.[entity] || [];
        if (apps.length > 0) {
          allApps.push(
            ...apps.map((a) => ({
              id: a.databaseId.toString(),
              name: a.title || a.databaseId.toString()
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
    [userId, entity],
    tabId
  );
}

/**
 * Transfer ownership of data apps (App Studio apps or Worksheets) to a new
 * user. Worksheet IDs are valid data-app IDs for the bulk-owners endpoints,
 * so this helper backs both transferAppStudioApps and transferWorksheets.
 * @param {string[]} ids - Array of data app IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
function transferDataApps(ids, fromUserId, toUserId, tabId) {
  return executeInPage(
    async (ids, fromUserId, toUserId) => {
      try {
        // Add new owner
        const addResponse = await fetch(
          '/api/content/v1/dataapps/bulk/owners',
          {
            body: JSON.stringify({
              entityIds: ids,
              note: '',
              owners: [{ id: parseInt(toUserId), type: 'USER' }],
              sendEmail: false
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          }
        );
        if (!addResponse.ok) throw new Error(`HTTP ${addResponse.status}`);

        // Remove old owner
        const removeResponse = await fetch(
          '/api/content/v1/dataapps/bulk/owners/remove',
          {
            body: JSON.stringify({
              entityIds: ids,
              owners: [{ id: fromUserId, type: 'USER' }]
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!removeResponse.ok)
          throw new Error(`HTTP ${removeResponse.status}`);

        return { errors: [], failed: 0, succeeded: ids.length };
      } catch (error) {
        return {
          errors: ids.map((id) => ({ error: error.message, id })),
          failed: ids.length,
          succeeded: 0
        };
      }
    },
    [ids, fromUserId, toUserId],
    tabId
  );
}
