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

// ---------------------------------------------------------------------------
// Configuration: known fields and key-paths where column references live.
// Keep these conservative; widen as we learn from real payloads.
// ---------------------------------------------------------------------------

/** Field names whose string value is itself a column name. */
const COLUMN_VALUE_FIELDS = new Set([
  'aggregateColumn',
  'column',
  'columnName',
  'columnNameNew',
  'columnNameOld',
  'existingColumnName',
  'field',
  'fieldName',
  'fromColumn',
  'groupBy',
  'groupByColumn',
  'id', // only when nested under known column-list contexts (see below)
  'inputColumn',
  'inStreamName',
  'keyColumn',
  'keyField', // Magic ETL Pivot — pivot column
  'leftColumn',
  'leftField', // Magic ETL Filter — filterList[].leftField
  'name', // only when nested under known column-list contexts (see below)
  'newColumnName',
  'outputColumn',
  'pivotColumn',
  'rightColumn',
  'rightField', // Magic ETL Filter — filterList[].rightField
  'sortColumn',
  'source', // Magic ETL GroupBy — fields[].source
  'sourceColumn',
  'sourceField', // Magic ETL Unpivot — fields[].sourceField
  'targetColumn',
  'toColumn',
  'valueColumn'
]);

/**
 * Field names whose value is an array of column references — either an array
 * of strings (each a column name) OR an array of `{column}` / `{name}` /
 * `{columnName}` objects.
 */
const COLUMN_LIST_FIELDS = new Set([
  'aggregationColumns',
  'columns',
  'fields',
  'fixedColumns',
  'group', // Magic ETL Pivot — row identifier list
  'groupBy',
  'groupByColumns',
  'groups', // Magic ETL GroupBy — group columns
  'inputColumns',
  'keys1',
  'keys2',
  'leftJoinColumns',
  'orderBy',
  'orderByColumns',
  'outputColumns',
  'partitionBy',
  'partitionByColumns',
  'rightJoinColumns',
  'schemaModification1',
  'schemaModification2',
  'selectedColumns',
  'sort',
  'sortColumns',
  'sourceColumns',
  'unpivotColumns'
]);

/** Object keys that are themselves keyed by column name. */
const COLUMN_KEYED_FIELDS = new Set(['columnFormats']);

/** Field names whose string value is an expression (search for backtick refs). */
const EXPRESSION_FIELDS = new Set([
  'expression',
  'formattedExpression',
  'formula',
  'having',
  'sqlExpression',
  'value',
  'where'
]);

const BACKTICK_REF_RE = /`([^`]+)`/g;

/**
 * @param {Object} cardDefinition
 * @returns {Set<string>}
 */
export function extractCardColumnRefs(cardDefinition) {
  const refs = new Set();
  walkForColumnRefs(cardDefinition, (name) => refs.add(name));
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
 * Mirror of `rewriteDatasetViewColumns` in columnRewriter.js — extract refs
 * the same way the rewriter would change them, so the modal only surfaces
 * columns that are BOTH used AND will actually be rewritten on submit.
 *
 * @param {Object} viewDefinition
 * @returns {Set<string>}
 */
export function extractDatasetViewColumnRefs(viewDefinition) {
  const refs = new Set();
  walkDatasetViewForRefs(viewDefinition, (name) => refs.add(name));
  return refs;
}

// ---------------------------------------------------------------------------
// Public extractors — one per content type. Each returns Set<string>.
// ---------------------------------------------------------------------------

export function makeItemKey(typeKey, itemId) {
  return `${typeKey}:${itemId}`;
}

/**
 * @param {Object} params
 * @param {{ cards: Array<{id: any, name?: string}>, datasetViews: Array<{id: string, name?: string}>, dataflows: Array<{id: any, name?: string}> }} params.selectedItems
 * @param {string} [params.originId] - The migration's origin dataset ID. Used to identify "other inputs" on dataflows for cross-input collision detection.
 * @param {number|null} [params.tabId]
 * @returns {Promise<{
 *   byColumn: Map<string, Array<{type: string, id: any, name: string}>>,
 *   byItem: Map<string, {definition: Object|null, usedColumns: Set<string>, error?: string}>,
 *   errors: Array<{type: string, id: any, error: string}>,
 *   dataflowCollisions: Map<string, Array<{dataflowId: any, dataflowName: string, otherInputId: string, otherInputName: string}>>
 * }>}
 */
export async function scanContentForColumns({ originId, selectedItems, tabId = null }) {
  const byColumn = new Map();
  const byItem = new Map();
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
      } else if (typeKey === 'datasetViews') {
        definition = await fetchDatasetViewDefinition(item.id, tabId);
        used = extractDatasetViewColumnRefs(definition);
      } else if (typeKey === 'dataflows') {
        definition = await fetchDataflowDefinition(item.id, tabId);
        used = extractDataflowColumnRefs(definition);
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
  for (const view of selectedItems?.datasetViews || []) queue.push(['datasetViews', view]);
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

  return { byColumn, byItem, dataflowCollisions, errors };
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

function isColumnListParent(parentKey) {
  if (parentKey === 'columns') return true;
  if (parentKey === 'fields') return true;
  if (parentKey === 'group' || parentKey === 'groups') return true;
  if (parentKey === 'schemaModification1' || parentKey === 'schemaModification2') return true;
  return false;
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

function stripBackticks(name) {
  if (typeof name !== 'string') return name;
  if (name.length >= 2 && name.startsWith('`') && name.endsWith('`')) {
    return name.slice(1, -1);
  }
  return name;
}

function walkDatasetViewForRefs(node, onColumnRef) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkDatasetViewForRefs(item, onColumnRef);
    return;
  }
  if (typeof node !== 'object') return;
  for (const [key, value] of Object.entries(node)) {
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
          for (const fieldName of [
            'column',
            'columnName',
            'inStreamName',
            'name',
            'field',
            'id'
          ]) {
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
