import { executeInPage } from '@/utils/executeInPage';

/**
 * Extract the objects referenced by an App Studio page's layout. A FORM or
 * BUTTON element carries its object's own ID inline; a WORKFLOW or QUEUE
 * carries a widget ID that has to be resolved against the API first. Every ref
 * keeps the layout element type it came from as `contentType`, which the
 * resolvers pass through so a row can say whether it is a tile or a button.
 * @param {Object} details - The metadata.details object from the stacks API
 * @returns {{ formRefs: Array<{contentType: string, id: string}>, queueWidgetRefs: Array<{contentType: string, id: string}>, workflowModelRefs: Array<{contentType: string, id: string, version: string|null}>, workflowWidgetRefs: Array<{contentType: string, id: string}> }}
 */
export function extractPageContentIds(details) {
  const content = details?.pageLayoutV4?.content;
  const formRefs = [];
  const queueWidgetRefs = [];
  const workflowModelRefs = [];
  const workflowWidgetRefs = [];
  if (!Array.isArray(content)) return { formRefs, queueWidgetRefs, workflowModelRefs, workflowWidgetRefs };

  function walk(items) {
    for (const item of items) {
      if (item.type === 'FORM' && item.formInstanceId) {
        formRefs.push({ contentType: item.type, id: item.formInstanceId });
      } else if (item.type === 'QUEUE' && item.queueWidgetId) {
        queueWidgetRefs.push({ contentType: item.type, id: item.queueWidgetId });
      } else if (item.type === 'WORKFLOW' && item.workflowId) {
        workflowWidgetRefs.push({ contentType: item.type, id: item.workflowId });
      } else if (item.type === 'BUTTON') {
        const config = item.interaction?.config;
        if (item.interaction?.type === 'FORM_MODAL' && config?.formInstanceId) {
          formRefs.push({ contentType: item.type, id: config.formInstanceId });
        } else if (item.interaction?.type === 'WORKFLOW_START' && config?.modelId) {
          workflowModelRefs.push({ contentType: item.type, id: config.modelId, version: config.modelVersion || null });
        }
      }
      if (item.children) walk(item.children);
      if (item.columns) walk(item.columns);
      if (item.rows) walk(item.rows);
    }
  }

  walk(content);
  return { formRefs, queueWidgetRefs, workflowModelRefs, workflowWidgetRefs };
}

/**
 * Fetch names for the forms placed on an App Studio page. A layout carries each
 * form's own ID, so one request per form is the whole resolution.
 * @param {Object} params
 * @param {Array<{contentType: string, id: string}>} params.formRefs - Form refs from pageLayoutV4.content
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @returns {Promise<Array<{ contentType: string, id: string, title: string|null }>>}
 */
export async function getFormsForPage({ formRefs, tabId = null }) {
  return executeInPage(
    async (formRefs) => {
      const results = await Promise.all(
        formRefs.map(async (ref) => {
          try {
            const response = await fetch(`/api/forms/v2/${ref.id}?parts=all`);
            if (!response.ok) return null;
            const form = await response.json();
            return { contentType: ref.contentType, id: ref.id, title: form.name || null };
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    },
    [formRefs],
    tabId
  );
}

/**
 * Get all App Studio apps owned directly by a user or group.
 *
 * Uses the search endpoint rather than `/dataapps/adminsummary`: that endpoint's
 * `ownerIds` filter resolves group membership, so asking for a user also returns
 * apps a group they belong to owns, and it has no group-owner filter at all.
 *
 * Note: the search index's `data_app` entity is a superset that includes
 * worksheets, so we fetch the worksheet entity in parallel and subtract to
 * produce an apps-only list.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAppStudioApps(ownerId, tabId = null, ownerType = 'USER') {
  const [allDataApps, worksheets] = await Promise.all([
    searchOwnedDataApps(ownerId, 'data_app', tabId, ownerType),
    searchOwnedDataApps(ownerId, 'worksheet', tabId, ownerType)
  ]);
  const worksheetIds = new Set(worksheets.map((w) => w.id));
  return allDataApps.filter((a) => !worksheetIds.has(a.id));
}

/**
 * Get all Worksheets owned directly by a user or group. Counterpart to
 * getOwnedAppStudioApps for the worksheet subtype, and on the search endpoint
 * for the same reason.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedWorksheets(ownerId, tabId = null, ownerType = 'USER') {
  return searchOwnedDataApps(ownerId, 'worksheet', tabId, ownerType);
}

/**
 * Fetch details for the queues placed on an App Studio page. Resolves each
 * widget to its queue ID, then names them all in one search query.
 * @param {Object} params
 * @param {Array<{contentType: string, id: string}>} params.queueWidgetRefs - Queue widget refs from pageLayoutV4.content
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @returns {Promise<Array<{ contentType: string, id: string, name: string|null, queueWidgetId: string }>>}
 */
export async function getQueuesForPage({ queueWidgetRefs, tabId = null }) {
  return executeInPage(
    async (queueWidgetRefs) => {
      const refs = await Promise.all(
        queueWidgetRefs.map(async (ref) => {
          try {
            const response = await fetch(`/api/queues/v1/widget/${ref.id}`);
            if (!response.ok) return null;
            const widget = await response.json();
            return widget.queueId
              ? { contentType: ref.contentType, id: widget.queueId, queueWidgetId: ref.id }
              : null;
          } catch {
            return null;
          }
        })
      );
      const found = refs.filter(Boolean);
      if (found.length === 0) return [];

      // A queue's own endpoint 403s unless the caller is shared on that queue,
      // which drops queues off pages an admin can otherwise read in full. The
      // search index answers for them, so names come from there instead.
      const uuids = [...new Set(found.map((queue) => queue.id))];
      const names = new Map();
      try {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            combineResults: false,
            count: uuids.length,
            entityList: [['queue']],
            facetValuesToInclude: [],
            filters: [{ field: 'uuid', filterType: 'term', not: false, values: uuids }],
            hideSearchObjects: true,
            offset: 0,
            query: '**',
            queryProfile: 'GLOBAL'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (response.ok) {
          const data = await response.json();
          for (const hit of data.searchResultsMap?.queue || []) {
            if (hit.uuid) names.set(hit.uuid, hit.name || null);
          }
        }
      } catch {
        // A failed lookup leaves every queue unnamed rather than dropping them.
      }

      return found.map((queue) => ({
        contentType: queue.contentType,
        id: queue.id,
        name: names.get(queue.id) ?? null,
        queueWidgetId: queue.queueWidgetId
      }));
    },
    [queueWidgetRefs],
    tabId
  );
}

/**
 * Fetch details for the workflows placed on an App Studio page. A WORKFLOW
 * element resolves through its widget; a WORKFLOW_START button carries the
 * model ID already. One row per placement, but each model is named once.
 * @param {Object} params
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @param {Array<{contentType: string, id: string, version: string|null}>} params.workflowModelRefs - Direct model refs
 * @param {Array<{contentType: string, id: string}>} params.workflowWidgetRefs - Workflow widget refs
 * @returns {Promise<Array<{ contentType: string, id: string, name: string|null, version: string|null, workflowWidgetId: string|null }>>}
 */
export async function getWorkflowsForPage({ tabId = null, workflowModelRefs, workflowWidgetRefs }) {
  return executeInPage(
    async (workflowWidgetRefs, workflowModelRefs) => {
      const fromWidgets = await Promise.all(
        workflowWidgetRefs.map(async (ref) => {
          try {
            const response = await fetch(`/api/workflow/v1/models/widget/${ref.id}`);
            if (!response.ok) return null;
            const widget = await response.json();
            if (!widget.modelId) return null;
            return {
              contentType: ref.contentType,
              id: widget.modelId,
              version: widget.modelVersion || null,
              workflowWidgetId: ref.id
            };
          } catch {
            return null;
          }
        })
      );

      const refs = [
        ...fromWidgets.filter(Boolean),
        ...workflowModelRefs.map((model) => ({
          contentType: model.contentType,
          id: model.id,
          version: model.version,
          workflowWidgetId: null
        }))
      ];
      if (refs.length === 0) return [];

      const names = new Map();
      await Promise.all(
        [...new Set(refs.map((ref) => ref.id))].map(async (modelId) => {
          try {
            const response = await fetch(`/api/workflow/v1/models/${modelId}`);
            if (!response.ok) return;
            const model = await response.json();
            names.set(modelId, model.name || null);
          } catch {
            // Leave the workflow unnamed rather than dropping the row.
          }
        })
      );

      return refs.map((ref) => ({
        contentType: ref.contentType,
        id: ref.id,
        name: names.get(ref.id) ?? null,
        version: ref.version,
        workflowWidgetId: ref.workflowWidgetId
      }));
    },
    [workflowWidgetRefs, workflowModelRefs],
    tabId
  );
}

/**
 * Share App Studio apps or Worksheets with a user. Callers pass app IDs for
 * `DATA_APP`/`WORKSHEET`, or parent app IDs for their views. A failed request
 * fails every app in the batch.
 * @param {Object} params
 * @param {Array<string|number>} params.appIds - The app IDs to share
 * @param {number} params.userId - The user ID to share with
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{failures: Array<{error: string, id: string|number}>}>}
 */
export async function shareStudioApps({ appIds, tabId = null, userId }) {
  if (!appIds.length) return { failures: [] };
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed share report success. See executeInPage.
  const result = await executeInPage(
    async (appIds, userId) => {
      const response = await fetch('/api/content/v1/dataapps/share?sendEmail=false', {
        body: JSON.stringify({
          dataAppIds: appIds,
          message: 'I thought you might find this interesting.',
          recipients: [{ id: userId, type: 'user' }]
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [appIds, userId],
    tabId
  );
  if (!result?.ok) {
    const error = result?.error || 'Failed to share app';
    return { failures: appIds.map((id) => ({ error, id })) };
  }
  return { failures: [] };
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
 * Shared pagination loop for the search-endpoint dataapps query. The Domo
 * search index treats 'data_app' (app studio apps) and 'worksheet' as
 * distinct entity types despite both being DATA_APP on the backend, so the
 * entityList value is what routes the query. Matches direct ownership only:
 * the `owned_by_id` facet stores each owner as its own `id:TYPE` pair, so a
 * user filter never expands to the groups that user belongs to.
 * @param {number} ownerId - The Domo user or group ID
 * @param {'data_app'|'worksheet'} entity - Search entity type
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
function searchOwnedDataApps(ownerId, entity, tabId, ownerType = 'USER') {
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
