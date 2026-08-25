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
  isCalculatedColumnEntry,
  isColumnListParent,
  stripBackticks
} from './columnFields';
import { getFunctionTemplate } from './functions';
import { findScriptColumnConflicts } from './scriptColumns';
import { extractDataflowSqlColumnRefs, getDataflowEngine } from './sqlColumns';

/**
 * Which of an origin dataset's columns a FUSION view uses only as plain
 * passthrough output columns, mapped to the fusion output each one feeds. A
 * column here can be dropped from the fusion (its output column is removed)
 * instead of being remapped; a column that also appears inside a computed
 * mapping expression or a join condition is absent, because removing its output
 * would leave that expression or join reading a column the fusion no longer has.
 *
 * The fusion counterpart to `collectViewDroppableColumns`, reading the compiled
 * `/schema/indexed` shape (`views[].mapping[out].expr`, `views[].columnFuses`)
 * the scan already caches.
 *
 * @param {Object} viewDefinition - The `/schema/indexed` fusion definition.
 * @param {string} originId - The origin dataset id (no backticks).
 * @returns {Map<string, string[]>} origin column name -> output column names.
 */
export function collectFusionDroppableColumns(viewDefinition, originId) {
  const outputs = new Map();
  const blocked = new Set();
  const origin = stripBackticks(originId);
  const views = Array.isArray(viewDefinition?.views) ? viewDefinition.views : [];

  for (const view of views) {
    const mapping = view?.mapping && typeof view.mapping === 'object' ? view.mapping : {};
    for (const [outputName, info] of Object.entries(mapping)) {
      const expr = info?.expr;
      if (!expr || typeof expr !== 'object') continue;
      if (expr.exprType === 'COLUMN') {
        if (stripBackticks(expr.table) !== origin || typeof expr.column !== 'string') continue;
        const column = stripBackticks(expr.column);
        if (!outputs.has(column)) outputs.set(column, new Set());
        outputs.get(column).add(stripBackticks(outputName));
      } else {
        collectFusionOriginLeaves(expr, origin, (name) => blocked.add(name));
      }
    }
    collectFusionOriginLeaves(view?.columnFuses, origin, (name) => blocked.add(name));
  }

  const droppable = new Map();
  for (const [column, names] of outputs) {
    if (blocked.has(column) || names.size === 0) continue;
    droppable.set(column, [...names]);
  }
  return droppable;
}

/**
 * Collect the column names a template/SQL view references FROM a specific source
 * dataset, scoped by that source's table aliases (mirroring the conservative
 * rewriter in `columnRewriter.js`). Returns a map from each referenced source
 * column name to the set of the view's OUTPUT column names (the enclosing
 * selectItem's `alias.name`) it feeds, so a caller can steer remap-vs-drop by
 * whether that output is used downstream. Refs inside join/filter clauses (no
 * enclosing output item) map to an empty set.
 *
 * Only CONFIDENT, source-attributed refs are collected, so a per-source diff
 * never misattributes another input's column as broken:
 *   - `columnName` whose sibling `table.name` is a source alias;
 *   - `referencedColumnName` whose sibling `referenceDataSourceId` is the source;
 *   - backticked `\`alias\`.\`col\`` refs where `alias` is a source alias.
 * Unqualified backticked refs are ambiguous across inputs and skipped. The
 * `fromItemInfo` palette is skipped for the same reason `extractDatasetViewColumnRefs`
 * skips it: it lists every input column whether the view uses it or not.
 *
 * @param {Object} viewDefinition - The `/schema/indexed` view definition.
 * @param {Set<string>} sourceAliases - Aliases resolving to the source (from `findOriginAliases`).
 * @param {string} sourceId - The source dataset id (no backticks).
 * @returns {Map<string, Set<string>>}
 */
export function collectViewColumnRefsForSource(viewDefinition, sourceAliases, sourceId) {
  const byColumn = new Map();
  const add = (rawCol, outputName) => {
    const col = stripBackticks(rawCol);
    if (!col) return;
    if (!byColumn.has(col)) byColumn.set(col, new Set());
    const output = stripBackticks(outputName);
    if (output) byColumn.get(col).add(output);
  };

  const walk = (node, currentOutput) => {
    if (node == null) return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item, currentOutput);
      return;
    }
    if (typeof node !== 'object') return;

    // A selectItem carries the OUTPUT alias for the refs inside its expression;
    // a ledger column entry carries its output name at `name`.
    let outputName = currentOutput;
    if (typeof node?.alias?.name === 'string') outputName = node.alias.name;
    else if (typeof node.referenceDataSourceId === 'string' && typeof node.name === 'string') outputName = node.name;

    const siblingTable = stripBackticks(node?.table?.name);
    const isSourceQualified = typeof siblingTable === 'string' && sourceAliases.has(siblingTable);
    const refDsIsSource =
      typeof node.referenceDataSourceId === 'string' && stripBackticks(node.referenceDataSourceId) === sourceId;

    for (const [key, value] of Object.entries(node)) {
      if (key === 'fromItemInfo') continue; // input-column palette, not real usage
      if (typeof value === 'string') {
        if (key === 'columnName') {
          if (isSourceQualified) add(value, outputName);
        } else if (key === 'referencedColumnName') {
          if (refDsIsSource) add(value, outputName);
        } else if (value.indexOf('`') !== -1) {
          collectScopedBacktickRefs(value, sourceAliases, (col) => add(col, outputName));
        }
        continue;
      }
      walk(value, outputName);
    }
  };
  walk(viewDefinition, null);
  return byColumn;
}

/**
 * Which of a source dataset's columns a template/SQL view uses only as plain
 * selected columns, mapped to the view output each one feeds. A column here can
 * be dropped from the view (its output column is removed) instead of being
 * remapped; a column the view also filters, joins, groups, or sorts on, or one
 * that feeds a calculated column, is absent, because removing its output would
 * leave that clause or expression reading a column the view no longer has.
 *
 * Two reference shapes count as a plain selection, and `dropDatasetViewColumns`
 * removes both cleanly:
 *   - a `selectItems[]` entry whose whole expression IS the source column
 *     (`columnName` with a sibling source-aliased `table.name`), which projects
 *     it under the entry's `alias.name`;
 *   - an output-ledger entry (`tables[].columns[]`) naming the source column at
 *     `referencedColumnName` with `referenceDataSourceId` set to the source.
 * Every other source-attributed reference blocks the drop. `fromItemInfo` is
 * skipped for the same reason `collectViewColumnRefsForSource` skips it: it is
 * the available-input palette, not usage.
 *
 * @param {Object} viewDefinition - The `/schema/indexed` view definition.
 * @param {Set<string>} sourceAliases - Aliases resolving to the source (from `findOriginAliases`).
 * @param {string} sourceId - The source dataset id (no backticks).
 * @returns {Map<string, string[]>} source column name -> output column names.
 */
export function collectViewDroppableColumns(viewDefinition, sourceAliases, sourceId) {
  const outputs = new Map();
  const blocked = new Set();
  walkViewSourceRefs(viewDefinition, sourceAliases, stripBackticks(sourceId), (column, output) => {
    if (!column) return;
    if (!output) {
      blocked.add(column);
      return;
    }
    if (!outputs.has(column)) outputs.set(column, new Set());
    outputs.get(column).add(output);
  });

  const droppable = new Map();
  for (const [column, names] of outputs) {
    if (blocked.has(column) || names.size === 0) continue;
    droppable.set(column, [...names]);
  }
  return droppable;
}

/**
 * Scan an alert's rule for the column names it references, so a cross-schema
 * migration surfaces them for remap the same way cards and dataflows are. An
 * alert stores rule columns in two shapes, matching the alert rewriter
 * (`moveAlertToTarget`) field-for-field so anything surfaced here is also
 * rewritten:
 *   - `configurations`: `COLUMN_ID` (a single column) and `ANY_ROW_PRIMARY_KEYS`
 *     / `ANY_ROW_METADATA_COLUMNS` (comma-joined column lists).
 *   - `filters[].column`: threshold-style alerts filter on a named column.
 *
 * @param {Object} alertDefinition - A full alert (GET .../alerts/{id}?fields=all)
 * @returns {Set<string>}
 */
export function extractAlertColumnRefs(alertDefinition) {
  const refs = new Set();
  const configurations = Array.isArray(alertDefinition?.configurations) ? alertDefinition.configurations : [];
  for (const c of configurations) {
    if (!c || typeof c.value !== 'string') continue;
    if (c.name === 'COLUMN_ID') {
      refs.add(stripBackticks(c.value));
    } else if (c.name === 'ANY_ROW_PRIMARY_KEYS' || c.name === 'ANY_ROW_METADATA_COLUMNS') {
      for (const part of c.value.split(',')) {
        const name = stripBackticks(part.trim());
        if (name) refs.add(name);
      }
    }
  }
  const filters = Array.isArray(alertDefinition?.filters) ? alertDefinition.filters : [];
  for (const f of filters) {
    if (f && typeof f.column === 'string' && f.column) refs.add(stripBackticks(f.column));
  }
  return refs;
}

/**
 * Scan a pro-code app's dataset binding for the column names it references. Each
 * binding field maps the app's stable `alias` to a real dataset column via
 * `columnName`; a field mapped to a Beast Mode (`beastModeName`) has no column
 * reference to repair and is skipped.
 *
 * @param {Array<{columnName: string|null, beastModeName: string|null}>} fields
 * @returns {Set<string>}
 */
export function extractAppColumnRefs(fields) {
  const refs = new Set();
  for (const field of Array.isArray(fields) ? fields : []) {
    if (!field || field.beastModeName != null) continue;
    if (typeof field.columnName === 'string' && field.columnName) refs.add(field.columnName);
  }
  return refs;
}

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

  const collectOriginLeaves = (node, onLeaf) => collectFusionOriginLeaves(node, origin, onLeaf);

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
 * Fetch a dataset's current column schema (name + type per column) from its
 * latest schema. Both the mismatch baseline (which of a source's columns still
 * exist) and the replacement-candidate list for a broken view reference.
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<Array<{name: string, type: string}>>}
 */
export async function fetchDatasetSchemaColumns(datasetId, tabId) {
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

/**
 * Fetch a dataset view's compiled definition (`/schema/indexed`), the shape the
 * scanner and rewriter both operate on.
 *
 * @param {string} viewId
 * @param {number|null} tabId
 * @returns {Promise<Object>}
 */
export async function fetchDatasetViewDefinition(viewId, tabId) {
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

/**
 * Find every alias that resolves to the origin dataset DIRECTLY within this
 * view. Includes the bare origin dataset id itself so direct
 * `\`<originId>\`.col` refs also count as origin-qualified.
 *
 * Only DIRECT aliases (where `fromItem.name === originId`) qualify. SUB_SELECT
 * aliases (e.g. `base` wrapping a UNION) do NOT. Refs through a SUB_SELECT
 * point at the subquery's OUTPUT column names, determined by the inner branches'
 * `alias.name` rather than by origin's column names. We don't rewrite inner
 * aliases, so we shouldn't rewrite the outer column refs that read from those
 * aliases either. (Type propagation through SUB_SELECTs is handled separately by
 * `propagateColumnInfoTypes`.)
 */
export function findOriginAliases(viewDefinition, originId) {
  const aliases = new Set();
  if (originId) aliases.add(originId);

  const visitFromItem = (fromItem) => {
    if (!fromItem || typeof fromItem !== 'object') return;
    const tableName = stripBackticks(fromItem.name);
    if (tableName === originId) {
      const aliasName = stripBackticks(fromItem?.alias?.name);
      if (aliasName) aliases.add(aliasName);
      aliases.add(tableName);
    }
  };

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.fromItem) visitFromItem(node.fromItem);
    if (Array.isArray(node.joins)) {
      for (const j of node.joins) {
        if (j?.leftItem) visitFromItem(j.leftItem);
      }
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(viewDefinition);
  return aliases;
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
 *   byColumn: Map<string, Array<{type: string, id: any, name: string, dropOutputs?: string[]}>>,
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

  const addRef = (typeKey, item, columnName, extra = null) => {
    if (!columnName || typeof columnName !== 'string') return;
    if (!byColumn.has(columnName)) byColumn.set(columnName, []);
    byColumn.get(columnName).push({ ...(extra || {}), id: item.id, name: item.name || String(item.id), type: typeKey });
  };

  const fetchAndScan = async (typeKey, item) => {
    try {
      let definition;
      let used;
      // Views only: origin column -> the view output columns removing it would
      // take with it. A column absent from this map can't be dropped from the
      // view (see `collectViewDroppableColumns`), so the map doubles as the
      // per-view drop eligibility the remap UI gates the Drop choice on.
      let dropOutputsByColumn = null;
      if (typeKey === 'alerts') {
        // An alert's rule references columns by name; on a cross-schema move any
        // name missing from the target dataset makes Domo's create endpoint reject
        // the whole alert. Surface those columns so they join the remap step.
        definition = await fetchAlertDefinition(item.id, tabId);
        used = extractAlertColumnRefs(definition);
      } else if (typeKey === 'apps') {
        // App rows already carry their dataset binding fields, so the column set
        // needs no fetch. There's no cached definition to reuse at write time
        // (the swap re-reads the live instance context), so leave it null.
        definition = null;
        used = extractAppColumnRefs(item.fields);
      } else if (typeKey === 'cards') {
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
          dropOutputsByColumn = collectFusionDroppableColumns(definition, originId);
        } else {
          used = extractDatasetViewColumnRefs(definition);
          dropOutputsByColumn = collectViewDroppableColumns(definition, findOriginAliases(definition, originId), originId);
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
      for (const colName of used) {
        const dropOutputs = dropOutputsByColumn?.get(colName) || null;
        addRef(typeKey, item, colName, dropOutputs ? { dropOutputs } : null);
      }
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
  for (const alert of selectedItems?.alerts || []) queue.push(['alerts', alert]);
  for (const card of selectedItems?.cards || []) queue.push(['cards', card]);
  for (const bm of selectedItems?.beastModes || []) queue.push(['beastModes', bm]);
  for (const ds of selectedItems?.datasets || []) queue.push(['datasets', ds]);
  for (const df of selectedItems?.dataflows || []) queue.push(['dataflows', df]);
  for (const app of selectedItems?.apps || []) queue.push(['apps', app]);

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

/**
 * Visit every origin-sourced `{exprType: 'COLUMN', column, table}` leaf under a
 * fusion expression tree (a mapping expr, a `columnFuses` join condition), the
 * one shape a fusion stores column refs in.
 */
function collectFusionOriginLeaves(node, origin, onLeaf) {
  if (Array.isArray(node)) {
    for (const item of node) collectFusionOriginLeaves(item, origin, onLeaf);
    return;
  }
  if (!node || typeof node !== 'object') return;
  if (node.exprType === 'COLUMN' && stripBackticks(node.table) === origin && typeof node.column === 'string') {
    onLeaf(stripBackticks(node.column));
    return;
  }
  for (const v of Object.values(node)) collectFusionOriginLeaves(v, origin, onLeaf);
}

/**
 * Report the column of every backticked ref in an expression string that COULD
 * belong to the source: a qualified `\`alias\`.\`col\`` ref whose alias resolves
 * to the source, plus any bare `\`col\`` ref, which names no table and so can't
 * be ruled out. Only used to decide whether a column is safe to drop, where an
 * unattributable ref has to count against the drop. `collectScopedBacktickRefs`
 * stays strict for the opposite reason: misattributing a ref there would invent a
 * broken column the user then has to resolve.
 */
function collectPossibleSourceBacktickRefs(expr, sourceAliases, onRef) {
  const re = /`([^`]+)`(\.`([^`]+)`)?/g;
  let match;
  while ((match = re.exec(expr)) !== null) {
    if (match[3] == null) onRef(match[1]);
    else if (sourceAliases.has(match[1])) onRef(match[3]);
  }
}

/**
 * Pull source-attributed column refs out of a backticked expression string.
 * Only qualified `\`alias\`.\`col\`` refs where `alias` is a source alias can be
 * attributed to a source; bare `\`col\`` refs are ambiguous across inputs, so
 * they are left to the structured `columnName` path.
 */
function collectScopedBacktickRefs(expr, sourceAliases, onRef) {
  const re = /`([^`]+)`(\.`([^`]+)`)?/g;
  let match;
  while ((match = re.exec(expr)) !== null) {
    if (match[3] != null && sourceAliases.has(match[1])) onRef(match[3]);
  }
}

async function fetchAlertDefinition(alertId, tabId) {
  return executeInPage(
    async (alertId) => {
      const response = await fetch(`/api/social/v4/alerts/${alertId}?fields=all`, { credentials: 'include' });
      if (!response.ok) throw new Error(`GET alert HTTP ${response.status}`);
      return response.json();
    },
    [alertId],
    tabId
  );
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

/**
 * The source column a select item projects verbatim, or null when its expression
 * is anything else (a function, a cast, an arithmetic expression, another
 * input's column). A verbatim projection is a bare column node: `columnName`
 * qualified by a sibling `table.name` that resolves to the source.
 */
function plainSourceColumn(expression, sourceAliases) {
  if (!expression || typeof expression !== 'object' || typeof expression.columnName !== 'string') return null;
  const table = stripBackticks(expression.table?.name);
  if (!table || !sourceAliases.has(table)) return null;
  return stripBackticks(expression.columnName) || null;
}

// ---------------------------------------------------------------------------
// Orchestrator: scan every selected item for column refs, in parallel.
//
// Returns:
//   {
//     byColumn: Map<colName, Array<{type, id, name, dropOutputs?}>>,  // who uses each column
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
          // Pick the first present known column-bearing field. A card-level
          // Beast Mode entry is skipped at `name`/`id`: those hold its display
          // name and calc id, not a column (see `isCalculatedColumnEntry`).
          const isCalc = isCalculatedColumnEntry(item);
          for (const fieldName of ['column', 'columnName', 'inStreamName', 'name', 'field', 'id']) {
            if (isCalc && (fieldName === 'name' || fieldName === 'id')) continue;
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
      // refs when nested under a parent that's a column-list context, and never
      // on a card-level Beast Mode entry.
      if ((key === 'name' || key === 'id') && (!isColumnListParent(parentKey) || isCalculatedColumnEntry(node))) {
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

/**
 * Walk a template/SQL view definition and report every reference it makes to a
 * source dataset's columns, saying for each whether a drop could reach it.
 * `onRef` is called as `(column, outputName)`: an output name means the whole
 * reference is one select item or output-ledger entry projecting that column, so
 * removing that output removes the reference; `null` means the reference sits
 * where a drop can't reach it (a filter, join, group by, sort, or inside a
 * calculated expression), leaving remap as the only option.
 *
 * `fromItemInfo` is skipped for the same reason `collectViewColumnRefsForSource`
 * skips it: it is the available-input palette, not usage.
 */
function walkViewSourceRefs(node, sourceAliases, sourceId, onRef) {
  if (node == null || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkViewSourceRefs(item, sourceAliases, sourceId, onRef);
    return;
  }

  // An output-ledger entry (`tables[].columns[]`) names one output column and the
  // source column feeding it, so it reads as a projection.
  const isLedgerEntry =
    typeof node.referencedColumnName === 'string' &&
    typeof node.name === 'string' &&
    stripBackticks(node.referenceDataSourceId) === sourceId;
  if (isLedgerEntry) onRef(stripBackticks(node.referencedColumnName), stripBackticks(node.name));

  const siblingTable = stripBackticks(node?.table?.name);
  const isSourceQualified = typeof siblingTable === 'string' && sourceAliases.has(siblingTable);

  for (const [key, value] of Object.entries(node)) {
    if (key === 'fromItemInfo') continue;
    if (key === 'selectItems' && Array.isArray(value)) {
      for (const item of value) {
        const projected = plainSourceColumn(item?.expression, sourceAliases);
        const output = stripBackticks(item?.alias?.name);
        // An unaliased projection has no output name for the drop to match on,
        // so it counts as a reference the drop can't reach.
        if (projected && output) {
          onRef(projected, output);
          for (const [itemKey, itemValue] of Object.entries(item)) {
            if (itemKey !== 'expression') walkViewSourceRefs(itemValue, sourceAliases, sourceId, onRef);
          }
        } else {
          walkViewSourceRefs(item, sourceAliases, sourceId, onRef);
        }
      }
      continue;
    }
    if (typeof value === 'string') {
      if (key === 'columnName') {
        // An unqualified ref names no table, so it can't be ruled out as the
        // source's. Counting it blocks a drop the ref would have outlived.
        if (isSourceQualified || !siblingTable) onRef(stripBackticks(value), null);
      } else if (key === 'referencedColumnName') {
        if (!isLedgerEntry && stripBackticks(node.referenceDataSourceId) === sourceId) {
          onRef(stripBackticks(value), null);
        }
      } else if (value.indexOf('`') !== -1) {
        collectPossibleSourceBacktickRefs(value, sourceAliases, (col) => onRef(col, null));
      }
      continue;
    }
    walkViewSourceRefs(value, sourceAliases, sourceId, onRef);
  }
}
