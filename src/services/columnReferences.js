/**
 * Column-reference scanner — extracts the set of column names referenced by
 * a card / dataset-view / dataflow definition. Used to surface the
 * "used AND unmapped" column set during cross-schema migration.
 *
 * Column references show up in three shapes across Domo content:
 *   1. **Backticked refs in expression strings** — formulas, formattedExpression,
 *      SQL clauses. Pattern: `` `Column Name` ``. We extract by regex.
 *   2. **Plain string values at known column-bearing fields** — `column`,
 *      `columnName`, `field`, `leftColumn`, `rightColumn`, `groupBy`, etc.
 *      We walk and read these values directly.
 *   3. **Object keys at known column-name-keyed paths** — e.g.
 *      `chartProperties.columnFormats[colName]`. We treat the keys as refs.
 *
 * The scanner is intentionally permissive — false positives (e.g. picking up
 * a value that *looks* like a column name but isn't) are fine because the
 * user can still leave them unmapped. False negatives (missing a real ref)
 * are the bigger risk; the rewriter mirrors this set so anything we don't
 * scan, we also don't rewrite.
 */

import { executeInPage } from '@/utils/executeInPage';

import { getCardDefinition } from './cards';
import {
  BACKTICK_REF_RE,
  COLUMN_KEYED_FIELDS,
  COLUMN_LIST_FIELDS,
  COLUMN_VALUE_FIELDS,
  EXPRESSION_FIELDS,
  isColumnListParent,
  stripBackticks
} from './columnFields';
import { getFunctionTemplate } from './functions';
import { findScriptColumnConflicts } from './scriptColumns';
import { extractDataflowSqlColumnRefs, getDataflowEngine } from './sqlColumns';

/**
 * Scan a Beast Mode (function) template for the column names it references.
 * Mirrors the rewriter (`rewriteBeastModeColumns`) field-for-field: the
 * template's `expression` (backticked refs) and `columnPositions[].columnName`.
 *
 * @param {Object} beastModeTemplate
 * @returns {Set<string>}
 */
export function extractBeastModeColumnRefs(beastModeTemplate) {
  const refs = new Set();
  walkForColumnRefs(beastModeTemplate, (name) => refs.add(name));
  return refs;
}

/**
 * Scans a card's column references from the kpi/definition response. We walk
 * only the inner `definition` object, NOT the full response: the response's
 * top-level `columns` array is the card's complete dataset schema (every
 * column the card could touch), so walking it would report every column as
 * "used". The genuine refs (beast-mode expressions, chart bindings, filters,
 * column formats) all live under `definition`. Falls back to the whole object
 * if `definition` is absent so a future shape change degrades to over-reporting
 * rather than missing everything.
 *
 * Dataset-persisted Beast Modes are excluded from the walk: `definition.formulas`
 * carries every Beast Mode on the dataset and card (used or not), but the
 * dataset-persisted ones (`persistedOnDataSource === true`) migrate as their own
 * Beast Mode type, not with the card, so their column refs belong to that scan,
 * not the card's. Only card-level formulas (`persistedOnDataSource === false`)
 * ride with the card.
 *
 * Unused columns in `subscriptions.main.columns[]` are also excluded: some
 * chart types list every column even when not used, and only those with a
 * `mapping` key are actually referenced by the chart.
 *
 * @param {Object} cardResponse - The full kpi/definition response.
 * @returns {Set<string>}
 */
export function extractCardColumnRefs(cardResponse) {
  const refs = new Set();
  const inner = cardResponse?.definition ?? cardResponse;

  let scanTarget = inner;

  const needsFormulaFilter = inner && Array.isArray(inner.formulas);
  const needsColumnFilter = inner?.subscriptions?.main?.columns && Array.isArray(inner.subscriptions.main.columns);

  if (needsFormulaFilter || needsColumnFilter) {
    scanTarget = { ...inner };

    if (needsFormulaFilter) {
      scanTarget.formulas = inner.formulas.filter((f) => f && f.persistedOnDataSource === false);
    }

    if (needsColumnFilter) {
      scanTarget.subscriptions = {
        ...inner.subscriptions,
        main: {
          ...inner.subscriptions.main,
          columns: inner.subscriptions.main.columns.filter(
            (col) => col && Object.prototype.hasOwnProperty.call(col, 'mapping')
          )
        }
      };
    }
  }

  walkForColumnRefs(scanTarget, (name) => refs.add(name));
  return refs;
}

/**
 * @param {Object} dataflowDefinition
 * @returns {Set<string>}
 */
export function extractDataflowColumnRefs(dataflowDefinition) {
  const refs = new Set();
  walkForColumnRefs(dataflowDefinition, (name) => refs.add(name));
  return refs;
}

// ---------------------------------------------------------------------------
// Generic walker — handles all three column-ref shapes uniformly. Pass in
// `onColumnRef(name)` to collect refs.
// ---------------------------------------------------------------------------

/**
 * Extract the column refs a view actually USES: the columns named in its query
 * (`select.selectBody` and `viewTemplate.select`) and output. Deliberately skips
 * `viewTemplate.fromItemInfo`, the available-input-column palette, which lists
 * every column each joined input exposes whether or not the view touches it.
 * Counting the palette flags columns for remap that never appear in the query or
 * output (see `walkDatasetViewForRefs`).
 *
 * This intentionally diverges from `rewriteDatasetViewColumns`, which still walks
 * the palette: the rewriter only changes a palette entry when its column is in
 * the user's columnMap, and a column can't get into that map unless it's surfaced
 * here, so palette-only columns are neither surfaced nor (effectively) rewritten.
 *
 * @param {Object} viewDefinition
 * @returns {Set<string>}
 */
export function extractDatasetViewColumnRefs(viewDefinition) {
  const refs = new Set();
  walkDatasetViewForRefs(viewDefinition, (name) => refs.add(name));
  return refs;
}

/**
 * Fusion views (`views[].mapping`) store column refs differently from template
 * views: each output column is `mapping[outName].expr`, an expr tree whose leaves
 * are `{exprType: 'COLUMN', column, table}`. Join keys live in
 * `columnFuses[].on`. The template-view walker never reads these, so without this
 * a fusion view's columns are invisible to the mismatch scan (and the swap then
 * blanket-repoints the input id while leaving column names untouched, silently
 * breaking the view if origin and target columns differ).
 *
 * Collects every origin-sourced column name (leaf `table` === originId). `unsafe`
 * is set when an origin column is referenced inside a COMPUTED mapping expr (an
 * expr whose top node isn't a plain COLUMN, e.g. a function or CASE): the leaf is
 * still rewritten, but the view is flagged for manual review since the surrounding
 * computation may need attention.
 *
 * @param {Object} viewDefinition
 * @param {string} originId - The migration origin dataset id.
 * @returns {{ refs: Set<string>, unsafe: boolean }}
 */
export function extractFusionViewColumnRefs(viewDefinition, originId) {
  const refs = new Set();
  let unsafe = false;
  const origin = stripBackticks(originId);
  const views = Array.isArray(viewDefinition?.views) ? viewDefinition.views : [];

  const collectOriginLeaves = (node, onLeaf) => {
    if (Array.isArray(node)) {
      for (const item of node) collectOriginLeaves(item, onLeaf);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.exprType === 'COLUMN' && stripBackticks(node.table) === origin && typeof node.column === 'string') {
      onLeaf(node.column);
      return;
    }
    for (const v of Object.values(node)) collectOriginLeaves(v, onLeaf);
  };

  for (const view of views) {
    const mapping = view?.mapping && typeof view.mapping === 'object' ? view.mapping : {};
    for (const info of Object.values(mapping)) {
      const expr = info?.expr;
      if (!expr || typeof expr !== 'object') continue;
      if (expr.exprType === 'COLUMN') {
        if (stripBackticks(expr.table) === origin && typeof expr.column === 'string') refs.add(expr.column);
      } else {
        // Computed expr: rewrite its origin leaves but flag the view for review.
        collectOriginLeaves(expr, (name) => {
          refs.add(name);
          unsafe = true;
        });
      }
    }
    // Join conditions are structured COLUMN leaves and rewrite cleanly.
    collectOriginLeaves(view?.columnFuses, (name) => refs.add(name));
  }
  return { refs, unsafe };
}

/**
 * True when a view definition is a fusion (`views[].mapping`) rather than the
 * template form (`viewTemplate.select.selectBody`). The two store column refs in
 * incompatible shapes, so scanning and rewriting branch on this.
 *
 * @param {Object} viewDefinition
 * @returns {boolean}
 */
export function isFusionView(viewDefinition) {
  return (
    Array.isArray(viewDefinition?.views) &&
    !!viewDefinition.views[0] &&
    typeof viewDefinition.views[0].mapping === 'object' &&
    viewDefinition.views[0].mapping !== null
  );
}

// ---------------------------------------------------------------------------
// Public extractors — one per content type. Each returns Set<string>.
// ---------------------------------------------------------------------------

export function makeItemKey(typeKey, itemId) {
  return `${typeKey}:${itemId}`;
}

/**
 * @param {Object} params
 * @param {{ cards: Array<{id: any, name?: string}>, datasets: Array<{id: string, name?: string}>, dataflows: Array<{id: any, name?: string}> }} params.selectedItems
 * @param {string} [params.originId] - The migration's origin dataset ID. Used to identify "other inputs" on dataflows for cross-input collision detection.
 * @param {number|null} [params.tabId]
 * @returns {Promise<{
 *   byColumn: Map<string, Array<{type: string, id: any, name: string}>>,
 *   byItem: Map<string, {definition: Object|null, usedColumns: Set<string>, error?: string}>,
 *   errors: Array<{type: string, id: any, error: string}>,
 *   dataflowCollisions: Map<string, Array<{dataflowId: any, dataflowName: string, otherInputId: string, otherInputName: string}>>,
 *   dataflowScriptWarnings: Array<{engine: string, id: any, name: string}>,
 *   dataflowSqlWarnings: Array<{engine: string, id: any, name: string}>,
 *   viewFusionWarnings: Array<{id: any, name: string}>
 * }>}
 */
export async function scanContentForColumns({ originId, selectedItems, tabId = null }) {
  const byColumn = new Map();
  const byItem = new Map();
  const dataflowScriptWarnings = [];
  const dataflowSqlWarnings = [];
  const viewFusionWarnings = [];
  const errors = [];

  const addRef = (typeKey, item, columnName) => {
    if (!columnName || typeof columnName !== 'string') return;
    if (!byColumn.has(columnName)) byColumn.set(columnName, []);
    byColumn.get(columnName).push({ id: item.id, name: item.name || String(item.id), type: typeKey });
  };

  const fetchAndScan = async (typeKey, item) => {
    try {
      let definition;
      let used;
      if (typeKey === 'cards') {
        // Drill cards are fetched via their `dr:<drillId>:<rootId>` URN, not
        // the bare numeric id — the kpi/definition endpoint sends `urn` as
        // the body key, and a drill's bare id returns an unrelated payload.
        definition = await getCardDefinition({ cardId: item.urn || item.id, tabId });
        used = extractCardColumnRefs(definition);
      } else if (typeKey === 'beastModes') {
        // The search list lacks the expression; hydrate the full template so
        // we can scan its refs (and the orchestrator reuses this cached
        // template to clone the Beast Mode onto the target).
        definition = await getFunctionTemplate(item.id, tabId);
        used = extractBeastModeColumnRefs(definition);
      } else if (typeKey === 'datasets') {
        definition = await fetchDatasetViewDefinition(item.id, tabId);
        // Fusion views (views[].mapping) and template views (viewTemplate) store
        // column refs in incompatible shapes; the template walker is blind to
        // fusion, so route by shape. Fusion computed exprs are flagged for review.
        if (isFusionView(definition)) {
          const fusionScan = extractFusionViewColumnRefs(definition, originId);
          used = fusionScan.refs;
          if (fusionScan.unsafe) {
            viewFusionWarnings.push({ id: item.id, name: item.name || String(item.id) });
          }
        } else {
          used = extractDatasetViewColumnRefs(definition);
        }
      } else if (typeKey === 'dataflows') {
        definition = await fetchDataflowDefinition(item.id, tabId);
        // Magic ETL keeps column refs in structured fields (existing walker).
        // Redshift/MySQL bury them in raw SQL, scanned dialect-aware and scoped
        // to the origin alias. Unknown non-Magic engines can't be analyzed at
        // all, so they get flagged for manual review rather than a false clear.
        const engine = getDataflowEngine(definition);
        if (engine === 'mysql' || engine === 'redshift') {
          const sqlScan = extractDataflowSqlColumnRefs(definition, originId);
          used = sqlScan.refs;
          if (sqlScan.unsafe) {
            dataflowSqlWarnings.push({ engine, id: item.id, name: item.name || String(item.id) });
          }
        } else if (engine === 'unknown') {
          used = new Set();
          dataflowSqlWarnings.push({ engine, id: item.id, name: item.name || String(item.id) });
        } else {
          used = extractDataflowColumnRefs(definition);
          // Magic ETL Python/R script tiles run freeform code we can't safely
          // rewrite. If a script references a column the user could remap, flag
          // the dataflow so it's reviewed by hand (the structured fields around
          // the tile still remap; only the script body is left alone).
          if (findScriptColumnConflicts(definition, used).length > 0) {
            dataflowScriptWarnings.push({ engine, id: item.id, name: item.name || String(item.id) });
          }
        }
      } else {
        return;
      }
      const itemKey = makeItemKey(typeKey, item.id);
      byItem.set(itemKey, { definition, usedColumns: used });
      for (const colName of used) addRef(typeKey, item, colName);
    } catch (error) {
      const itemKey = makeItemKey(typeKey, item.id);
      byItem.set(itemKey, {
        definition: null,
        error: error?.message || String(error),
        usedColumns: new Set()
      });
      errors.push({ error: error?.message || String(error), id: item.id, type: typeKey });
    }
  };

  const queue = [];
  for (const card of selectedItems?.cards || []) queue.push(['cards', card]);
  for (const bm of selectedItems?.beastModes || []) queue.push(['beastModes', bm]);
  for (const ds of selectedItems?.datasets || []) queue.push(['datasets', ds]);
  for (const df of selectedItems?.dataflows || []) queue.push(['dataflows', df]);

  // Bounded concurrency — each fetchAndScan goes through executeInPage
  // (chrome.scripting.executeScript). Letting 100 of those run at once
  // saturates the messaging bridge and stalls anything else also trying
  // to use it (e.g. the dataset-search typeahead in the same modal).
  const SCAN_CONCURRENCY = 5;
  const workers = Array.from({ length: SCAN_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      const [typeKey, item] = next;
      await fetchAndScan(typeKey, item);
    }
  });
  await Promise.allSettled(workers);

  // Cross-input collision detection — for each dataflow, find input datasets
  // that AREN'T the migration origin and collect their column names. Surfaces
  // the case where the same column name exists on multiple dataflow inputs
  // (e.g. a join key on both sides). Renaming that column on origin would
  // normally be safe, but the JSON-string sweep + structured rewriter rewrite
  // every reference in the dataflow regardless of which input it sourced
  // from — so the user has to be warned.
  const dataflowCollisions = await collectDataflowCollisions({
    byItem,
    originId,
    selectedDataflows: selectedItems?.dataflows || [],
    tabId
  });

  return { byColumn, byItem, dataflowCollisions, dataflowScriptWarnings, dataflowSqlWarnings, errors, viewFusionWarnings };
}

async function collectDataflowCollisions({ byItem, originId, selectedDataflows, tabId }) {
  const collisions = new Map();
  if (!originId || selectedDataflows.length === 0) return collisions;

  // Gather unique non-origin input datasets across all selected dataflows.
  // Many dataflows may share the same other-input dataset; we fetch each
  // schema once.
  const otherInputs = new Map();
  for (const df of selectedDataflows) {
    const itemKey = makeItemKey('dataflows', df.id);
    const def = byItem.get(itemKey)?.definition;
    const inputs = def?.inputs || [];
    for (const input of inputs) {
      if (!input?.dataSourceId || input.dataSourceId === originId) continue;
      if (!otherInputs.has(input.dataSourceId)) {
        otherInputs.set(input.dataSourceId, {
          dataflowsUsing: [],
          name: input.dataSourceName || `Dataset ${input.dataSourceId}`
        });
      }
      otherInputs.get(input.dataSourceId).dataflowsUsing.push({
        id: df.id,
        name: df.name || String(df.id)
      });
    }
  }

  if (otherInputs.size === 0) return collisions;

  // Fetch each other-input schema with bounded concurrency.
  const queue = [...otherInputs.entries()];
  const FETCH_CONCURRENCY = 3;
  const fetchOne = async (datasetId) => {
    try {
      const cols = await fetchDatasetSchemaColumns(datasetId, tabId);
      const meta = otherInputs.get(datasetId);
      for (const col of cols) {
        if (!col?.name) continue;
        if (!collisions.has(col.name)) collisions.set(col.name, []);
        for (const df of meta.dataflowsUsing) {
          collisions.get(col.name).push({
            dataflowId: df.id,
            dataflowName: df.name,
            otherInputId: datasetId,
            otherInputName: meta.name
          });
        }
      }
    } catch {
      // Schema fetch failed — non-fatal; we just lose this collision check.
    }
  };
  const workers = Array.from({ length: FETCH_CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) return;
      await fetchOne(next[0]);
    }
  });
  await Promise.allSettled(workers);
  return collisions;
}

async function fetchDataflowDefinition(dataflowId, tabId) {
  return executeInPage(
    async (dataflowId) => {
      const response = await fetch(
        `/api/dataprocessing/v2/dataflows/${dataflowId}?hydrationState=VISUALIZATION&validationType=SAVE`,
        { credentials: 'include' }
      );
      if (!response.ok) throw new Error(`GET dataflow HTTP ${response.status}`);
      return response.json();
    },
    [dataflowId],
    tabId
  );
}

async function fetchDatasetSchemaColumns(datasetId, tabId) {
  return executeInPage(
    async (datasetId) => {
      const res = await fetch(`/api/data/v2/datasources/${datasetId}/schemas/latest`, {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      return (data?.schema?.columns || []).map((c) => ({ name: c.name, type: c.type }));
    },
    [datasetId],
    tabId
  );
}

async function fetchDatasetViewDefinition(viewId, tabId) {
  return executeInPage(
    async (viewId) => {
      const response = await fetch(`/api/query/v1/datasources/${viewId}/schema/indexed`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`GET view schema HTTP ${response.status}`);
      return response.json();
    },
    [viewId],
    tabId
  );
}

// ---------------------------------------------------------------------------
// Orchestrator: scan every selected item for column refs, in parallel.
//
// Returns:
//   {
//     byColumn: Map<colName, Array<{type, id, name}>>,  // who uses each column
//     byItem: Map<itemKey, { definition, usedColumns: Set<string>, error?: string }>,
//     errors: Array<{type, id, error}>
//   }
//
// `definition` is cached so the rewrite phase doesn't re-fetch.
// ---------------------------------------------------------------------------

function walkDatasetViewForRefs(node, onColumnRef) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkDatasetViewForRefs(item, onColumnRef);
    return;
  }
  if (typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
    // `fromItemInfo` is the view's available-input-column PALETTE (every column
    // each joined input exposes), not the query. A view with two inputs can list
    // hundreds of columns here that it never selects, joins on, or outputs. Those
    // aren't "used" — counting them flags columns for remap that don't appear in
    // `select.selectBody` or the output schema. Real usage lives in `select`
    // (selectBody) and `viewTemplate.select`, both still walked, so skip this
    // subtree entirely. (Observed: a real view reported 392 columns via the full
    // walk vs 70 actually used, the other 322 were palette-only.)
    if (key === 'fromItemInfo') continue;
    if (typeof value === 'string') {
      if (key === 'referencedColumnName' || key === 'columnName') {
        onColumnRef(stripBackticks(value));
      } else if (value.indexOf('`') !== -1) {
        const re = /`([^`]+)`/g;
        let match;
        while ((match = re.exec(value)) !== null) {
          onColumnRef(match[1]);
        }
      }
      continue;
    }
    walkDatasetViewForRefs(value, onColumnRef);
  }
}

function walkForColumnRefs(node, onColumnRef, parentKey = null) {
  if (node == null) return;

  if (typeof node === 'string') {
    // We arrive at strings only when called from a column-bearing context
    // (the parent invocation already decided this string is a column ref).
    // The expression-field handling lives in the object branch below.
    return;
  }

  if (Array.isArray(node)) {
    for (const item of node) walkForColumnRefs(item, onColumnRef, parentKey);
    return;
  }

  if (typeof node !== 'object') return;

  // Magic ETL structured Field node: { type: 'Field', name: '<col>', table }
  // (see columnFields.js header). Mirrors the rewriter: the column sits at
  // `name` under `expression`, which the bare-`name` gate below skips, so
  // collect it explicitly here. The Set dedupes if another branch also sees it.
  if (node.type === 'Field' && typeof node.name === 'string') {
    onColumnRef(stripBackticks(node.name));
  }

  for (const [key, value] of Object.entries(node)) {
    // 1. Column-keyed objects — keys are column names.
    if (COLUMN_KEYED_FIELDS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const colName of Object.keys(value)) onColumnRef(colName);
      // Also recurse into the values (formats etc. may carry expressions).
      for (const v of Object.values(value)) walkForColumnRefs(v, onColumnRef, key);
      continue;
    }

    // 2. Column-list fields — array of strings or array of {column}/{name}.
    if (COLUMN_LIST_FIELDS.has(key) && Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === 'string') {
          onColumnRef(stripBackticks(item));
        } else if (item && typeof item === 'object') {
          // Pick the first present known column-bearing field.
          for (const fieldName of ['column', 'columnName', 'inStreamName', 'name', 'field', 'id']) {
            if (typeof item[fieldName] === 'string') {
              onColumnRef(stripBackticks(item[fieldName]));
              break;
            }
          }
          // Recurse into the rest of the object (sort objects may carry
          // expression fields, etc.).
          walkForColumnRefs(item, onColumnRef, key);
        }
      }
      continue;
    }

    // 3. Plain column-value fields — value is a string column name.
    if (COLUMN_VALUE_FIELDS.has(key) && typeof value === 'string') {
      // `name` and `id` are over-broad on their own — only treat as column
      // refs when nested under a parent that's a column-list context.
      if ((key === 'name' || key === 'id') && !isColumnListParent(parentKey)) {
        // skip
      } else {
        onColumnRef(stripBackticks(value));
      }
      continue;
    }

    // 4. Expression fields — string value with backticked refs.
    if (EXPRESSION_FIELDS.has(key) && typeof value === 'string') {
      let match;
      while ((match = BACKTICK_REF_RE.exec(value)) !== null) {
        onColumnRef(match[1]);
      }
      continue;
    }

    // Recurse into anything else.
    walkForColumnRefs(value, onColumnRef, key);
  }
}
