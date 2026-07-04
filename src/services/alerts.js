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
 * alert bound to the target and deletes the original. Domo's create endpoint
 * accepts only a minimal rule body (it rejects inline actions/subscriptions), so
 * the recreate mirrors what Domo's own UI does: a base create, then per-followup
 * requests for the actions, the custom message template, and the subscribers,
 * then a patch to restore the original name and owner.
 *
 * Ordering and safety:
 *   0. Guards (before anything is created, so a failure leaves the original
 *      untouched): (a) verify every column the rule names (post-`columnMap`) exists
 *      on the target dataset; and (b) for each WORKFLOW action, verify the workflow
 *      model version it targets is currently enabled. Either would otherwise make
 *      Domo reject a request with an opaque HTTP 400, so each fails first with a
 *      legible reason. This step also caches the per-action detail for step 2.
 *   1. Base create on the target. If it fails, the original is left untouched.
 *   2. Recreate each notification action (these are critical: an alert that lost
 *      its action no longer does anything). If any action fails to recreate, the
 *      half-built copy is deleted and the original is kept, so the move rolls back
 *      cleanly with no orphan on the target.
 *   3. Copy the custom message template and the subscribers, and restore the name
 *      and owner. These are non-critical: a failure is recorded in `unhandled`
 *      (which the orchestrator surfaces as a manual-review flag) but does not roll
 *      back the move.
 *   4. Delete the original only once the new alert is fully in place.
 *
 * What carries over: rule type, configurations (with column references rewritten
 * through `columnMap`), filters, notification actions, custom message template,
 * subscribers, name, and owner. Columns named in `droppedColumns` are removed from
 * the rule instead of remapped: pruned out of the `ANY_ROW_PRIMARY_KEYS` /
 * `ANY_ROW_METADATA_COLUMNS` lists and any threshold filter that references them.
 * PDP policies are resolved through `pdpMap` (keyed by the origin `filterGroupId`):
 * a `'map'` resolution binds the group to the matched target policy's id; a
 * `'remove'` resolution drops it (widening the alert to all rows). Origin policy
 * ids are never sent to the target, since a filter group belongs to one dataset.
 *
 * @param {Object} params
 * @param {number|string} params.alertId - The origin alert ID
 * @param {Record<string, string>} [params.columnMap] - Origin → target column-name map
 * @param {string[]} [params.droppedColumns] - Origin column names to remove from the rule entirely (the "drop column" choice), rather than remap
 * @param {string} params.originId - The origin dataset ID
 * @param {Record<string, {action: 'map'|'remove', target?: Object}>} [params.pdpMap] - Per origin filterGroupId resolution; `target` is the target dataset's full filter-group object
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {string} params.targetId - The target dataset ID
 * @returns {Promise<{error?: string, newId?: any, success: boolean, unhandled?: string[]}>}
 */
export async function moveAlertToTarget({ alertId, columnMap, droppedColumns, originId, pdpMap, tabId = null, targetId }) {
  return executeInPage(
    async (alertId, originId, targetId, columnMap, pdpMap, droppedColumns) => {
      const map = columnMap || {};
      const hasColumnMap = Object.keys(map).some((k) => map[k] && map[k] !== k);
      const dropped = new Set(Array.isArray(droppedColumns) ? droppedColumns : []);
      const hasDrops = dropped.size > 0;
      const remapColumn = (name) => (typeof name === 'string' && map[name] ? map[name] : name);
      // A comma-joined column list: origin columns chosen for DROP are removed
      // entirely, the rest are column-remapped. Trims blanks so a trailing/leading
      // comma from a removed entry can't leave an empty column name behind.
      const remapColumnList = (csv) =>
        csv
          .split(',')
          .map((s) => s.trim())
          .filter((s) => s && !dropped.has(s))
          .map((s) => remapColumn(s))
          .join(',');

      const getRes = await fetch(`/api/social/v4/alerts/${alertId}?fields=all`);
      if (!getRes.ok) return { error: `Failed to load alert ${alertId}: HTTP ${getRes.status}`, success: false };
      const alert = await getRes.json();

      // Translate each PDP filter group to a target policy id via pdpMap. A filter
      // group belongs to one dataset, so the origin's group ids are meaningless on
      // the target; the create takes only `{filterGroupId}` pointing at a target
      // policy. A 'remove' resolution drops the group (the alert widens to all
      // rows); a group with no resolution is skipped rather than sent with an
      // origin id the target would reject.
      const srcGroups = Array.isArray(alert.filterGroups) ? alert.filterGroups : [];
      const filterGroups = [];
      for (const g of srcGroups) {
        const resolution = pdpMap ? pdpMap[g.filterGroupId] : null;
        if (!resolution || resolution.action === 'remove') continue;
        if (resolution.action === 'map' && resolution.target && resolution.target.filterGroupId != null) {
          filterGroups.push({ filterGroupId: resolution.target.filterGroupId });
        }
      }

      // Carry the rule configurations verbatim (Domo stores NOTIFY_* and OPERATION
      // as-is and fills missing defaults server-side), rewriting only the column
      // references: COLUMN_ID is a single column; ANY_ROW_PRIMARY_KEYS and
      // ANY_ROW_METADATA_COLUMNS are comma-joined column lists whose DROP-chosen
      // entries are removed. COLUMN_ID is the rule's metric column and can't be
      // dropped, so it is only ever remapped.
      const configurations = (Array.isArray(alert.configurations) ? alert.configurations : []).map((c) => {
        if ((!hasColumnMap && !hasDrops) || !c || typeof c.value !== 'string') return c;
        if (c.name === 'COLUMN_ID') return { ...c, value: remapColumn(c.value) };
        if (c.name === 'ANY_ROW_PRIMARY_KEYS' || c.name === 'ANY_ROW_METADATA_COLUMNS') {
          return { ...c, value: remapColumnList(c.value) };
        }
        return c;
      });

      const createBody = {
        configurations,
        filterGroups,
        resourceId: targetId,
        resourceType: alert.resourceType || 'DATASET',
        type: alert.type
      };
      // Threshold-style alerts carry a top-level `filters` array; ANY_ROW alerts
      // do not. Drop filters whose column was chosen for DROP, then repoint and
      // column-remap the rest; omit the key entirely when none remain.
      const srcFilters = (Array.isArray(alert.filters) ? alert.filters : [])
        .filter(Boolean)
        .filter((f) => !(typeof f.column === 'string' && dropped.has(f.column)))
        .map((f) => {
          const next = { ...f, dataSourceId: f.dataSourceId === originId ? targetId : f.dataSourceId };
          if (hasColumnMap && typeof f.column === 'string') next.column = remapColumn(f.column);
          return next;
        });
      if (srcFilters.length > 0) createBody.filters = srcFilters;

      // Guard: an "Any row" alert identifies rows by its primary-key columns, so
      // dropping every one leaves an invalid rule Domo would reject. Catch it here
      // with a clear message rather than letting the create fail opaquely.
      const primaryKeyConfig = configurations.find((c) => c && c.name === 'ANY_ROW_PRIMARY_KEYS');
      if (primaryKeyConfig && typeof primaryKeyConfig.value === 'string' && primaryKeyConfig.value.trim() === '') {
        return {
          error:
            'Every primary-key column was dropped, so the alert has no way to identify a row. Keep at least one primary-key column (mapped to the target) before migrating.',
          success: false
        };
      }

      // Guard: an alert's rule names its columns, and Domo's create endpoint
      // rejects the whole alert with an opaque HTTP 400 if any named column is
      // missing from the target dataset. Collect the rule's column references
      // (post-remap) and check them against the target schema so an unmappable
      // column fails with a legible message instead. COLUMN_ID is one column;
      // ANY_ROW_PRIMARY_KEYS / ANY_ROW_METADATA_COLUMNS are comma-joined lists;
      // threshold filters carry `column`.
      const ruleColumns = new Set();
      for (const c of configurations) {
        if (!c || typeof c.value !== 'string') continue;
        if (c.name === 'COLUMN_ID') {
          ruleColumns.add(c.value);
        } else if (c.name === 'ANY_ROW_PRIMARY_KEYS' || c.name === 'ANY_ROW_METADATA_COLUMNS') {
          for (const part of c.value.split(',')) {
            const name = part.trim();
            if (name) ruleColumns.add(name);
          }
        }
      }
      for (const f of createBody.filters || []) {
        if (f && typeof f.column === 'string' && f.column) ruleColumns.add(f.column);
      }
      if (ruleColumns.size > 0) {
        let targetColumns = null;
        try {
          const schemaRes = await fetch(`/api/data/v2/datasources/${targetId}/schemas/latest`, { credentials: 'include' });
          if (schemaRes.ok) {
            const schema = await schemaRes.json();
            targetColumns = new Set((schema?.schema?.columns || []).map((col) => col.name));
          }
        } catch {
          targetColumns = null;
        }
        // Only enforce when the target schema actually resolved; if the fetch
        // failed, fall through and let the create attempt surface any error.
        if (targetColumns) {
          const missing = [...ruleColumns].filter((name) => !targetColumns.has(name));
          if (missing.length > 0) {
            const plural = missing.length > 1;
            return {
              error: `Alert references column${plural ? 's' : ''} not on the target dataset: ${missing.join(', ')}. Map ${plural ? 'them' : 'it'} on the remap step, or remove the reference before migrating.`,
              success: false
            };
          }
        }
      }

      // Pre-flight: a WORKFLOW action targets one specific workflow model version,
      // and Domo rejects recreating the action (opaque HTTP 400) when that version
      // is not the workflow's currently-enabled one. Check each workflow action's
      // version up front so a disabled/undeployed version fails with a legible
      // reason and nothing is created, rather than creating the alert and rolling
      // it back on the eventual 400. Each action's detail is cached here so Step 2
      // reuses it instead of re-fetching. When the workflow lookup can't resolve
      // (fetch failed, unexpected shape), the check is skipped rather than blocking
      // a move that might otherwise succeed.
      const srcActions = Array.isArray(alert.actions) ? alert.actions : [];
      const actionDetails = new Map();
      for (const a of srcActions) {
        if (!a || a.id == null) continue;
        let detail;
        try {
          const detRes = await fetch(`/api/social/v4/alerts/${alertId}/actions/${a.id}`);
          if (!detRes.ok) continue;
          detail = await detRes.json();
        } catch {
          continue;
        }
        actionDetails.set(a.id, detail);
        const meta = detail?.metadata || {};
        if (a.type !== 'WORKFLOW' || !meta.modelId || !meta.modelVersion) continue;
        let versionEnabled = null;
        try {
          const modelRes = await fetch(`/api/workflow/v1/models/${meta.modelId}`);
          if (modelRes.ok) {
            const model = await modelRes.json();
            const versions = Array.isArray(model?.versions) ? model.versions : [];
            const match = versions.find((v) => v && v.version === meta.modelVersion);
            versionEnabled = match ? match.active === true : false;
          }
        } catch {
          versionEnabled = null;
        }
        if (versionEnabled === false) {
          return {
            error: `The alert's Workflow action uses workflow version ${meta.modelVersion}, which is not currently enabled (it may be disabled, undeployed, or removed). Enable that version in the workflow, then retry. Nothing was migrated.`,
            success: false
          };
        }
      }

      // Step 1: base create. On failure the original is untouched.
      const createRes = await fetch('/api/social/v4/alerts', {
        body: JSON.stringify(createBody),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!createRes.ok) {
        const text = await createRes.text().catch(() => '');
        return { error: `Create failed: HTTP ${createRes.status}${text ? ` ${text}` : ''}`, success: false };
      }
      const created = await createRes.json().catch(() => null);
      const newId = created?.id ?? null;
      if (newId == null) return { error: 'Alert create returned no id; original left intact', success: false };

      // Step 2: recreate each notification action, reusing the detail already
      // fetched in the pre-flight (the list/GET return actions with empty metadata;
      // the real metadata only comes from the per-action detail). Post
      // `{type, ...metadata}` minus `triggerId` so Domo provisions a fresh trigger
      // bound to the new alert. Actions are critical, so a failure rolls the whole
      // move back (delete the new alert, keep the original).
      for (const a of srcActions) {
        if (!a || a.id == null) continue;
        let failed = false;
        try {
          let detail = actionDetails.get(a.id);
          if (!detail) {
            const detRes = await fetch(`/api/social/v4/alerts/${alertId}/actions/${a.id}`);
            if (detRes.ok) detail = await detRes.json();
          }
          if (!detail) {
            failed = true;
          } else {
            const meta = { ...(detail.metadata || {}) };
            delete meta.triggerId;
            const actRes = await fetch(`/api/social/v4/alerts/${newId}/actions`, {
              body: JSON.stringify({ type: a.type, ...meta }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            });
            if (!actRes.ok) failed = true;
          }
        } catch {
          failed = true;
        }
        if (failed) {
          await fetch(`/api/social/v4/alerts/${newId}`, { method: 'DELETE' }).catch(() => {});
          const hint =
            a.type === 'WORKFLOW' ? ' (its workflow version may be disabled or undeployed; enable it and retry)' : '';
          return {
            error: `Could not recreate the ${a.type ? `${a.type} ` : ''}action on the new alert${hint}; move rolled back and original ${alertId} kept`,
            success: false
          };
        }
      }

      const unhandled = [];

      // Step 3a: copy the custom message template, if the original has one. The GET
      // returns an empty body when there is no custom template.
      try {
        const mtRes = await fetch(`/api/social/v4/alerts/${alertId}/message-template`);
        if (mtRes.ok) {
          const mt = await mtRes.json().catch(() => null);
          if (mt && (mt.body || mt.header || mt.footer)) {
            const putRes = await fetch(`/api/social/v4/alerts/${newId}/message-template`, {
              body: JSON.stringify({
                body: mt.body || '',
                footer: mt.footer || '',
                formulas: mt.formulas || {},
                header: mt.header || ''
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            });
            if (!putRes.ok) unhandled.push('message template not copied');
          }
        }
      } catch {
        unhandled.push('message template not copied');
      }

      // Step 3b: copy subscribers. The creator is auto-subscribed on create; POST
      // adds each additional origin subscriber (PUT only edits the caller's own
      // subscription, so it can't add others).
      try {
        const existingRes = await fetch(`/api/social/v4/alerts/${newId}/subscriptions`);
        const existing = existingRes.ok ? await existingRes.json().catch(() => []) : [];
        const existingIds = new Set((Array.isArray(existing) ? existing : []).map((s) => String(s.subscriberId)));
        const srcSubs = Array.isArray(alert.subscriptions) ? alert.subscriptions : [];
        for (const s of srcSubs) {
          if (!s || s.subscriberId == null || existingIds.has(String(s.subscriberId))) continue;
          const subRes = await fetch(`/api/social/v4/alerts/${newId}/subscriptions`, {
            body: JSON.stringify({ subscribedBy: s.subscribedBy, subscriberId: String(s.subscriberId), type: s.type || 'USER' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!subRes.ok) unhandled.push(`subscriber ${s.subscriberId} not copied`);
        }
      } catch {
        unhandled.push('subscribers not copied');
      }

      // Step 3c: restore name and owner (the create defaults the name to the rule's
      // auto-name and sets owner to the caller).
      try {
        const patchBody = { id: newId };
        if (alert.name) patchBody.name = alert.name;
        if (alert.owner != null) patchBody.owner = alert.owner;
        if (patchBody.name != null || patchBody.owner != null) {
          const patchRes = await fetch(`/api/social/v4/alerts/${newId}`, {
            body: JSON.stringify(patchBody),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH'
          });
          if (!patchRes.ok) unhandled.push('name/owner not restored');
        }
      } catch {
        unhandled.push('name/owner not restored');
      }

      // Step 4: delete the original now that the new alert is fully in place.
      const delRes = await fetch(`/api/social/v4/alerts/${alertId}`, { method: 'DELETE' });
      if (!delRes.ok) {
        return {
          error: `New alert ${newId} created, but deleting original ${alertId} failed: HTTP ${delRes.status}`,
          newId,
          success: false
        };
      }
      return unhandled.length > 0 ? { newId, success: true, unhandled } : { newId, success: true };
    },
    [alertId, originId, targetId, columnMap, pdpMap, droppedColumns],
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

/**
 * Repoint a set of alert triggers at a new workflow version. For each trigger
 * this fetches the live alert action, rewrites only `metadata.modelVersion` to
 * `targetVersion` (every other field, including `paramMapping`, `constMapping`,
 * and `triggerId`, is preserved), and PUTs it back. Runs one GET + one PUT per
 * trigger inside a single page-context loop, mirroring `transferWorkflows`.
 * @param {Object} params
 * @param {string} params.targetVersion - The workflow version to point triggers at (e.g. `'1.0.4'`)
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {Array<{actionId: string, alertId: string}>} params.triggers - Triggers to update
 * @returns {Promise<{errors: Array<{error: string, name: string}>, failed: number, succeeded: number}>}
 */
export async function updateAlertTriggerVersions({ tabId = null, targetVersion, triggers }) {
  return executeInPage(
    async (targetVersion, triggers) => {
      const errors = [];
      let succeeded = 0;

      for (const trigger of triggers) {
        try {
          const getResponse = await fetch(`/api/social/v4/alerts/${trigger.alertId}/actions/${trigger.actionId}`);
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const action = await getResponse.json();

          action.metadata = { ...action.metadata, modelVersion: targetVersion };

          const putResponse = await fetch(`/api/social/v4/alerts/${trigger.alertId}/actions/${trigger.actionId}`, {
            body: JSON.stringify(action),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!putResponse.ok) throw new Error(`HTTP ${putResponse.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, name: trigger.name });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [targetVersion, triggers],
    tabId
  );
}
