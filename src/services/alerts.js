import { executeInPage } from '@/utils/executeInPage';

/**
 * Pull the distinct row PDP policies (filter groups) an alert references, from
 * its definition's `filterGroups`. Returns each group's `filterGroupId`, `name`,
 * and `type` (`'open'` is the universal "All Rows" group; `'user'` is a named
 * PDP policy). Used by the migration UI to decide which policies need remapping
 * onto the target dataset.
 * @param {Object} alertDefinition - An alert object (from the list or a GET)
 * @returns {Array<{filterGroupId: any, name: string, type: string}>}
 */
export function extractAlertPdpPolicies(alertDefinition) {
  const groups = Array.isArray(alertDefinition?.filterGroups) ? alertDefinition.filterGroups : [];
  const seen = new Set();
  const out = [];
  for (const g of groups) {
    if (!g || g.filterGroupId == null || seen.has(g.filterGroupId)) continue;
    seen.add(g.filterGroupId);
    out.push({ filterGroupId: g.filterGroupId, name: g.name || String(g.filterGroupId), type: g.type || 'user' });
  }
  return out;
}

/**
 * Resolve an alert's actions to their target objects.
 *
 * Each entry in an alert's `actions` array is shallow (id, type, ownerId, empty
 * metadata). For each one this fetches the full action body and replaces the
 * action's metadata with the fetched detail's metadata. Object-backed types
 * (WORKFLOW, REPORT, TASK) additionally get a `url` linking to that object and
 * the object itself nested under `workflow`, `report`, or `task`; custom actions
 * are enriched with their detail metadata only. An action whose detail fetch
 * fails passes through unchanged.
 * @param {Object} params
 * @param {Array<{id: number, type: string}>} params.actions - The alert's actions array
 * @param {number|string} params.alertId - The alert ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} One enriched item per action
 */
export async function getAlertActions({ actions, alertId, tabId = null }) {
  return executeInPage(
    async (actions, alertId) => {
      const ID_FIELDS = { REPORT: 'scheduledReportId', TASK: 'createdTaskId', WORKFLOW: 'modelId' };
      const OBJECT_ENDPOINTS = {
        REPORT: '/api/content/v1/reportschedules/',
        TASK: '/api/content/v1/tasks/',
        WORKFLOW: '/api/workflow/v1/models/'
      };
      const OBJECT_KEYS = { REPORT: 'report', TASK: 'task', WORKFLOW: 'workflow' };
      const URL_PATHS = { REPORT: '/scheduled-reports/history/', TASK: '/project?taskId=', WORKFLOW: '/workflows/models/' };

      const result = [];
      for (const action of actions) {
        let detail = null;
        try {
          const response = await fetch(`/api/social/v4/alerts/${alertId}/actions/${action.id}`);
          if (response.ok) detail = await response.json();
        } catch {
          detail = null;
        }

        // Detail fetch failed: leave the action untouched.
        if (!detail?.metadata) {
          result.push(action);
          continue;
        }

        // Enrich every action's metadata from the fetched detail. Object-backed
        // types (WORKFLOW, REPORT, TASK) also get a url to the tied object and
        // the object itself nested under workflow/report/task; custom types get
        // the detail metadata only.
        const metadata = { ...detail.metadata };
        const objectId = OBJECT_KEYS[action.type] ? detail.metadata[ID_FIELDS[action.type]] : undefined;
        if (objectId) {
          metadata.url = `${location.origin}${URL_PATHS[action.type]}${objectId}`;
          try {
            const objectResponse = await fetch(`${OBJECT_ENDPOINTS[action.type]}${objectId}`);
            if (objectResponse.ok) metadata[OBJECT_KEYS[action.type]] = await objectResponse.json();
          } catch {
            // Tied-object fetch failed: keep the url and metadata, skip nesting.
          }
        }
        result.push({ ...action, metadata });
      }

      return result;
    },
    [actions, alertId],
    tabId
  );
}

/**
 * Get the alerts that watch a given dataset (the dataset's downstream alerts).
 * Filters server-side by `dataSetId` so only alerts bound to this dataset come
 * back. Each item keeps its `filterGroups` so the migration UI can analyze
 * PDP-policy references without a second fetch.
 * @param {string} datasetId - The datasource ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{filterGroups: Array, id: number, name: string}>>}
 */
export async function getDownstreamAlerts(datasetId, tabId = null) {
  return executeInPage(
    async (datasetId) => {
      const all = [];
      const limit = 200;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/social/v4/alerts?dataSetId=${datasetId}&fields=all&limit=${limit}&offset=${offset}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (Array.isArray(data) && data.length > 0) {
          all.push(...data);
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return all.map((a) => ({
        filterGroups: Array.isArray(a.filterGroups) ? a.filterGroups : [],
        id: a.id,
        name: a.name || String(a.id)
      }));
    },
    [datasetId],
    tabId
  );
}

/**
 * Get all alerts owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedAlerts(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allAlerts = [];
      const limit = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(`/api/social/v4/alerts?limit=${limit}&offset=${offset}&ownerId=${userId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allAlerts.push(...data.map((a) => ({ id: a.id, name: a.name || a.id.toString() })));
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allAlerts;
    },
    [userId],
    tabId
  );
}

/**
 * Get a dataset's row PDP policies (filter groups), used to remap an alert's
 * policy references onto a target dataset. Returns each policy's full filter-group
 * object (with `filterGroupId`, `name`, `type`, and the policy's members and
 * parameters), so a mapped policy can be dropped into the recreated alert with the
 * target dataset's own definition rather than the origin's. The open "All Rows"
 * policy is included (`include_open_policy`).
 * @param {string} datasetId - The datasource ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} The dataset's filter-group objects
 */
export async function getRowPdpPolicies(datasetId, tabId = null) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(
        `/api/query/v1/data-control/${datasetId}/filter-groups?options=load_associations,include_open_policy,load_filters,sort`
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      // The endpoint may return a bare array or wrap the list; tolerate both.
      const groups = Array.isArray(data) ? data : data?.filterGroups || data?.groups || [];
      return groups.filter((g) => g && g.filterGroupId != null);
    },
    [datasetId],
    tabId
  );
}

/**
 * Move an alert from the origin dataset onto a target dataset. An alert's dataset
 * reference is fixed at create time and cannot be edited, so this recreates the
 * alert bound to the target and deletes the original. The original is deleted
 * ONLY after the new alert is confirmed created; if the create fails, the
 * original is left untouched.
 *
 * What carries over from the original: rule type, configurations, filters, name,
 * owner, subscriptions, and notification actions (message template). Every origin
 * dataset reference is repointed to the target (`resourceId`, and each
 * `filterGroups[].dataSourceId` / `filters[].dataSourceId`). Column references in
 * the configurations (`COLUMN_ID`, `ANY_ROW_PRIMARY_KEYS`) and filters are
 * rewritten through `columnMap`. PDP policies are resolved through `pdpMap`
 * (keyed by the origin `filterGroupId`): a `'map'` resolution rebinds the group
 * to the target policy; a `'remove'` resolution drops the group (widening the
 * alert to all rows). Server-assigned ids/state are stripped so the copy is fresh.
 *
 * @param {Object} params
 * @param {number|string} params.alertId - The origin alert ID
 * @param {Record<string, string>} [params.columnMap] - Origin → target column-name map
 * @param {string} params.originId - The origin dataset ID
 * @param {Record<string, {action: 'map'|'remove', target?: Object}>} [params.pdpMap] - Per origin filterGroupId resolution; `target` is the target dataset's full filter-group object
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {string} params.targetId - The target dataset ID
 * @returns {Promise<{error?: string, newId?: any, success: boolean}>}
 */
export async function moveAlertToTarget({ alertId, columnMap, originId, pdpMap, tabId = null, targetId }) {
  return executeInPage(
    async (alertId, originId, targetId, columnMap, pdpMap) => {
      const getRes = await fetch(`/api/social/v4/alerts/${alertId}`);
      if (!getRes.ok) return { error: `Failed to load alert ${alertId}: HTTP ${getRes.status}`, success: false };
      const alert = await getRes.json();

      const map = columnMap || {};
      const hasColumnMap = Object.keys(map).some((k) => map[k] && map[k] !== k);
      const remapColumn = (name) => (typeof name === 'string' && map[name] ? map[name] : name);

      // Resolve each PDP filter group via pdpMap. A 'remove' resolution drops the
      // group (the alert then watches all rows); a 'map' resolution rebinds it to
      // the target dataset's own policy, so the recreated alert carries the
      // target's members and parameters (the origin policy is meaningless on the
      // target). Every surviving group points at the target dataset.
      const srcGroups = Array.isArray(alert.filterGroups) ? alert.filterGroups : [];
      const filterGroups = [];
      for (const g of srcGroups) {
        const resolution = pdpMap ? pdpMap[g.filterGroupId] : null;
        if (resolution && resolution.action === 'remove') continue;
        if (resolution && resolution.action === 'map' && resolution.target) {
          filterGroups.push({ ...resolution.target, dataSourceId: targetId });
        } else {
          // No resolution (gated against in the UI) — repoint the dataset only.
          filterGroups.push({ ...g, dataSourceId: targetId });
        }
      }

      // Rewrite column-name references in the rule configurations.
      const configurations = (Array.isArray(alert.configurations) ? alert.configurations : []).map((c) => {
        if (!hasColumnMap || !c) return c;
        if (c.name === 'COLUMN_ID' && typeof c.value === 'string') return { ...c, value: remapColumn(c.value) };
        if (c.name === 'ANY_ROW_PRIMARY_KEYS' && typeof c.value === 'string') {
          return { ...c, value: c.value.split(',').map((s) => remapColumn(s.trim())).join(',') };
        }
        return c;
      });

      // Repoint and column-remap each filter.
      const filters = (Array.isArray(alert.filters) ? alert.filters : []).map((f) => {
        if (!f) return f;
        const next = { ...f, dataSourceId: f.dataSourceId === originId ? targetId : f.dataSourceId };
        if (hasColumnMap && typeof f.column === 'string') next.column = remapColumn(f.column);
        return next;
      });

      // Carry the notification actions (custom message template) but strip the
      // server-assigned ids so they're created fresh on the new alert.
      const actions = (Array.isArray(alert.actions) ? alert.actions : []).map((a) => {
        if (!a) return a;
        const { id: _id, messageId: _messageId, ...rest } = a;
        return rest;
      });

      const body = {
        actions,
        active: alert.active,
        category: alert.category,
        configurations,
        contextual: alert.contextual,
        enabled: alert.enabled,
        filterGroups,
        filters,
        name: alert.name,
        owner: alert.owner,
        resourceId: targetId,
        resourceName: alert.resourceName,
        resourceType: alert.resourceType,
        subscriptions: Array.isArray(alert.subscriptions) ? alert.subscriptions : [],
        triggerFrequency: alert.triggerFrequency,
        type: alert.type
      };

      const createRes = await fetch('/api/social/v4/alerts', {
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!createRes.ok) {
        const text = await createRes.text().catch(() => '');
        return { error: `Create failed: HTTP ${createRes.status}${text ? ` ${text}` : ''}`, success: false };
      }
      const created = await createRes.json().catch(() => null);
      const newId = created?.id ?? null;
      // No id back means we can't trust the create; never delete the original.
      if (newId == null) return { error: 'Alert create returned no id; original left intact', success: false };

      const delRes = await fetch(`/api/social/v4/alerts/${alertId}`, { method: 'DELETE' });
      if (!delRes.ok) {
        return {
          error: `New alert ${newId} created, but deleting original ${alertId} failed: HTTP ${delRes.status}`,
          newId,
          success: false
        };
      }
      return { newId, success: true };
    },
    [alertId, originId, targetId, columnMap, pdpMap],
    tabId
  );
}

/**
 * Transfer alert ownership to a new user.
 * @param {number[]} alertIds - Array of alert IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAlerts(alertIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (alertIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of alertIds) {
        try {
          const response = await fetch(`/api/social/v4/alerts/${id}`, {
            body: JSON.stringify({ id, owner: toUserId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [alertIds, fromUserId, toUserId],
    tabId
  );
}

/**
 * Update the owner of a single alert.
 * @param {Object} params
 * @param {number|string} params.alertId - The alert ID
 * @param {number|string} params.newOwnerId - The new owner's user ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function updateAlertOwner({ alertId, newOwnerId, tabId = null }) {
  return executeInPage(
    async (alertId, newOwnerId) => {
      const response = await fetch(`/api/social/v4/alerts/${alertId}`, {
        body: JSON.stringify({
          id: Number(alertId),
          owner: Number(newOwnerId)
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [alertId, newOwnerId],
    tabId
  );
}
