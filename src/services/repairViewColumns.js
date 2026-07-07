/**
 * Repair the OPEN dataset view's own broken input references.
 *
 * A view breaks when one of its SOURCE datasets renames or drops a column the
 * view's definition still reads. Domo's UI only surfaces `Invalid column(s)
 * referenced` and offers no fix, so the view errors on every query-preview.
 *
 * This is the counterpart to remapping content DOWNSTREAM of a dataset: here the
 * broken reference lives INSIDE the open view, pointing UP at a source. Detection
 * diffs the view's per-source references against each source's live schema; the
 * apply either remaps a broken reference to a valid source column (reusing the
 * proven downstream swap executors with origin === target === the source) or
 * drops the column from the view entirely.
 */

import { executeInPage } from '@/utils/executeInPage';

import {
  collectViewColumnRefsForSource,
  extractFusionViewColumnRefs,
  fetchDatasetSchemaColumns,
  fetchDatasetViewDefinition,
  isFusionView
} from './columnReferences';
import { dropDatasetViewColumns, dropFusionColumns, findOriginAliases } from './columnRewriter';
import { swapDatasetViewInput, swapFusionInput } from './migrateDownstreamContent';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Detect the open view's own broken input column references: columns its
 * definition reads from a source dataset that the source no longer has.
 *
 * This is a STRUCTURAL diff (referenced-from-a-source minus that source's live
 * columns), and it is deliberately the full set. Domo's own `ib:4100` surfaces
 * only the first missing column it happens to hit; fix that one and the view
 * still fails on the next. So every referenced-but-absent column is a real break
 * the user will eventually have to repair, and we list them all up front. The
 * captured `ib:4100` is layered on top only as corroboration of which one Domo
 * is currently erroring on.
 *
 * @param {Object} params
 * @param {string} params.viewId - The open view's datasource id.
 * @param {Object} [params.viewDefinition] - Pre-fetched `/schema/indexed` def (fetched if absent).
 * @param {number|null} [params.tabId]
 * @returns {Promise<{
 *   broken: Array<{candidates: Array<{name: string, type: string}>, column: string, outputColumns: string[], sourceId: string, sourceName: string}>,
 *   isFusion: boolean,
 *   sources: Array<{id: string, name: string}>,
 *   viewDefinition: Object
 * }>}
 */
export async function detectBrokenViewColumns({ tabId = null, viewDefinition = null, viewId }) {
  const def = viewDefinition || (await fetchDatasetViewDefinition(viewId, tabId));
  const fusion = isFusionView(def);
  // Enumerate the view's source datasets straight from its definition. A UNION
  // view nests each branch's table deep under the SUB_SELECT, so the shallow
  // top-level extraction can miss them; a full walk catches every input.
  const sourceIds = enumerateViewSourceIds(def, viewId);
  const names = await fetchDatasetNames(sourceIds, tabId).catch(() => new Map());
  const nameFor = (id) => names.get(id) || `Dataset ${id}`;
  const broken = [];

  await Promise.all(
    sourceIds.map(async (sourceId) => {
      let liveColumns;
      try {
        liveColumns = await fetchDatasetSchemaColumns(sourceId, tabId);
      } catch {
        // Without the source's live schema there's no baseline to tell a broken
        // reference from a valid one, so skip this source rather than guess.
        return;
      }
      const liveNames = new Set((liveColumns || []).map((c) => c.name));
      // Fusion refs come out already alias-scoped as a flat Set (no output-column
      // association); template views expose the output column each ref feeds.
      const refs = fusion
        ? new Map([...extractFusionViewColumnRefs(def, sourceId).refs].map((column) => [column, new Set()]))
        : collectViewColumnRefsForSource(def, findOriginAliases(def, sourceId), sourceId);
      for (const [column, outputs] of refs) {
        if (liveNames.has(column)) continue;
        broken.push({
          candidates: liveColumns || [],
          column,
          outputColumns: [...outputs],
          sourceId,
          sourceName: nameFor(sourceId)
        });
      }
    })
  );

  return { broken, isFusion: fusion, sources: sourceIds.map((id) => ({ id, name: nameFor(id) })), viewDefinition: def };
}

/**
 * Apply a view self-repair: drop the chosen columns, then remap the rest.
 *
 * Drops run first as a single write so the subsequent remaps re-read the already
 * dropped definition. Remaps are grouped by source (the rewrite is origin-scoped)
 * and run serially against the same view object, so each sees the prior write.
 *
 * @param {Object} params
 * @param {string} params.viewId - The open view's datasource id.
 * @param {Object} params.viewDefinition - The `/schema/indexed` def already fetched by detection.
 * @param {boolean} params.isFusion
 * @param {string[]} [params.drops] - Output column names (aliases) to remove from the view.
 * @param {Array<{column: string, replacement: string, sourceId: string}>} [params.remaps]
 * @param {Record<string, Record<string, string>>} [params.sourceTypes] - Per-source map of column name -> type, for type propagation.
 * @param {(update: {phase: string, result?: Object, status: string}) => void} [params.onProgress]
 * @param {number|null} [params.tabId]
 * @returns {Promise<{dropped: number, errors: Array<{error: string, scope: string}>, failed: number, remapped: number}>}
 */
export async function repairViewColumns({
  drops = [],
  isFusion = false,
  onProgress,
  remaps = [],
  sourceTypes = {},
  tabId = null,
  viewDefinition,
  viewId
}) {
  const errors = [];
  let dropped = 0;
  let remapped = 0;

  if (drops.length > 0) {
    onProgress?.({ phase: 'drop', status: 'transferring' });
    const result = isFusion
      ? await dropFusionViewColumns({ columnsToDrop: drops, tabId, viewId })
      : await dropTemplateViewColumns({ columnsToDrop: drops, tabId, viewDefinition, viewId });
    if (result?.success) dropped = drops.length;
    else errors.push({ error: result?.error || 'Failed to drop columns', scope: 'drop' });
    onProgress?.({ phase: 'drop', result, status: 'done' });
  }

  const bySource = new Map();
  for (const remap of remaps) {
    if (!remap?.sourceId || !remap.column || !remap.replacement) continue;
    if (!bySource.has(remap.sourceId)) bySource.set(remap.sourceId, {});
    bySource.get(remap.sourceId)[remap.column] = remap.replacement;
  }

  if (bySource.size > 0) {
    onProgress?.({ phase: 'remap', status: 'transferring' });
    // Only the first remap may reuse the definition detection already fetched,
    // and only if no drop rewrote the view first; every later call (and any call
    // after a drop) passes no cached definition so the swap re-reads the latest.
    let canReuseCached = drops.length === 0;
    for (const [sourceId, columnMap] of bySource) {
      const targetColumnTypes = sourceTypes[sourceId] || {};
      const result = isFusion
        ? await swapFusionInput({ columnMap, fusionId: viewId, originId: sourceId, tabId, targetColumnTypes, targetId: sourceId })
        : await swapDatasetViewInput({
            cachedDefinition: canReuseCached ? viewDefinition : undefined,
            columnMap,
            originId: sourceId,
            tabId,
            targetColumnTypes,
            targetId: sourceId,
            viewId
          });
      canReuseCached = false;
      if (result?.success) remapped += Object.keys(columnMap).length;
      else errors.push({ error: result?.error || 'Failed to remap columns', scope: sourceId });
    }
    onProgress?.({ phase: 'remap', status: 'done' });
  }

  return { dropped, errors, failed: errors.length, remapped };
}

async function dropFusionViewColumns({ columnsToDrop, tabId, viewId }) {
  try {
    const native = await fetchFusionDefinition(viewId, tabId);
    const dropped = dropFusionColumns(native, columnsToDrop);
    return await putFusionSchemaInPage({ fusionDefinition: dropped, fusionId: viewId, tabId });
  } catch (err) {
    return { error: err?.message || String(err), success: false };
  }
}

async function dropTemplateViewColumns({ columnsToDrop, tabId, viewDefinition, viewId }) {
  try {
    const def = viewDefinition || (await fetchDatasetViewDefinition(viewId, tabId));
    const dropped = dropDatasetViewColumns(def, columnsToDrop);
    return await putViewSchemaInPage({ tabId, viewDefinition: dropped, viewId });
  } catch (err) {
    return { error: err?.message || String(err), success: false };
  }
}

/**
 * Every source dataset the view reads, by walking the whole definition for input
 * references rather than only the top-level FROM/JOIN. Covers template views
 * (`TABLE` node names), UNION branches (tables nested inside the SUB_SELECT), and
 * fusions (`from` / `datasource` fields), keeping only dataset UUIDs and dropping
 * the view's own id.
 *
 * @param {Object} viewDefinition
 * @param {string} viewId
 * @returns {string[]}
 */
function enumerateViewSourceIds(viewDefinition, viewId) {
  const ids = new Set();
  const strip = (s) => (typeof s === 'string' ? s.replace(/`/g, '') : s);
  const add = (raw) => {
    const value = strip(raw);
    if (typeof value === 'string' && UUID_RE.test(value) && value !== viewId) ids.add(value);
  };
  const walk = (node) => {
    if (node == null || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node['@type'] === 'TABLE') add(node.name);
    // Fusion input references live on plain `from` / `datasource` string fields.
    if (typeof node.from === 'string') add(node.from);
    if (typeof node.datasource === 'string') add(node.datasource);
    for (const value of Object.values(node)) walk(value);
  };
  walk(viewDefinition);
  return [...ids];
}

/**
 * Look up display names for a set of dataset ids in one bulk call. Returns a Map
 * of id -> name; ids that fail to resolve are simply absent (callers fall back to
 * the id). Empty input resolves to an empty Map without a network call.
 *
 * @param {string[]} ids
 * @param {number|null} tabId
 * @returns {Promise<Map<string, string>>}
 */
async function fetchDatasetNames(ids, tabId) {
  if (!ids || ids.length === 0) return new Map();
  const rows = await executeInPage(
    async (ids) => {
      const response = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&part=core', {
        body: JSON.stringify(ids),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error(`bulk datasources HTTP ${response.status}`);
      const data = await response.json();
      return (data?.dataSources || []).map((d) => ({ id: d.id, name: d.name }));
    },
    [ids],
    tabId
  );
  return new Map((rows || []).filter((r) => r?.id).map((r) => [r.id, r.name || `Dataset ${r.id}`]));
}

async function fetchFusionDefinition(fusionId, tabId) {
  return executeInPage(
    async (fusionId) => {
      const response = await fetch(`/api/query/v1/fusions/${fusionId}`, { credentials: 'include' });
      if (!response.ok) throw new Error(`GET fusion HTTP ${response.status}`);
      return response.json();
    },
    [fusionId],
    tabId
  );
}

async function putFusionSchemaInPage({ fusionDefinition, fusionId, tabId }) {
  return executeInPage(
    async (fusionId, fusionDefinition) => {
      const body = JSON.parse(JSON.stringify(fusionDefinition));
      body.validate = false;
      if (!body.dataSourceType) body.dataSourceType = 'datafusion';
      const response = await fetch(`/api/query/v1/fusions/${fusionId}`, {
        body: JSON.stringify(body),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { error: `PUT fusion HTTP ${response.status}: ${text}`.trim(), success: false };
      }
      return { success: true };
    },
    [fusionId, fusionDefinition],
    tabId
  );
}

async function putViewSchemaInPage({ tabId, viewDefinition, viewId }) {
  return executeInPage(
    async (viewId, viewDefinition) => {
      const body = {
        dataProviderType: null,
        dataSourceName: viewDefinition?.name,
        schema: viewDefinition,
        trigger: {}
      };
      const response = await fetch(`/api/query/v1/views/${viewId}`, {
        body: JSON.stringify(body),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { error: `PUT view HTTP ${response.status}: ${text}`.trim(), success: false };
      }
      return { success: true };
    },
    [viewId, viewDefinition],
    tabId
  );
}
