/**
 * Migrate downstream content (cards, datasets, dataflows) from one
 * dataset to another. Adapted from a standalone CLI tool — the recursive
 * dataset-view swap helpers are ported verbatim because they are the only
 * reliable way to handle joins, set operations, column references, and
 * formattedExpression rewrites in dataset-view definitions.
 */

import { executeInPage } from '@/utils/executeInPage';

import { getCardDefinition } from './cards';
import { extractDataflowColumnRefs, isFusionView, makeItemKey } from './columnReferences';
import {
  hasEffectiveMapping,
  removeCardColumns,
  rewriteBeastModeColumns,
  rewriteCardColumns,
  rewriteDataflowColumns,
  rewriteDatasetViewColumns
} from './columnRewriter';
import { getDataflowDetail } from './dataflows';
import { createDatasetFunctions, getDatasetFunctions, getFunctionTemplate, updateDatasetFunctions } from './functions';
import { extractDataflowSqlColumnRefs, getDataflowEngine, rewriteDataflowSqlColumns } from './sqlColumns';
import { getCurrentUserId } from './users';

// ===========================================================================
// DISCOVERY
// ===========================================================================

/**
 * Cards and drill views sourced from this dataset.
 *
 * `?drill=true` makes the dataset → cards endpoint return BOTH cards whose own
 * datasource is this dataset AND cards that touch it only through a drill, and
 * it nests each card's drills under a `drills[]` array (so no separate drill-
 * discovery call is needed). A parent (kpi) card is included only when its own
 * `datasourceId` matches; otherwise the card surfaced solely because a drill
 * under it uses the dataset, so we migrate that drill, not the parent. Drills
 * are filtered the same way: included only when their own `datasourceId` matches.
 *
 * Every card carries its `chartType` (used to gate the "drop column" choice to
 * `badge_table` cards). Drill cards additionally carry `isDrill: true`, the
 * drill's `urn` (the `dr:<drillId>:<rootId>` form), `parentId`, and `parentName`
 * (so the UI can label the parent even when it isn't migrating). Regular cards
 * have just `{chartType, id, name}`.
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<Array<{id: number, name: string, chartType: string|null, urn?: string, isDrill?: boolean, parentId?: number, parentName?: string}>>}
 */
export async function getDownstreamCards(datasetId, tabId = null) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/content/v1/datasources/${datasetId}/cards?drill=true`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch cards for dataset ${datasetId}: HTTP ${response.status}`);
      }
      const cards = (await response.json()) || [];
      const matchesDataset = (id) => id != null && String(id) === String(datasetId);
      const out = [];
      const seenDrills = new Set();
      for (const card of cards) {
        const cardId =
          card.id || card.kpiId || (typeof card.urn === 'string' ? parseInt(card.urn.split(':').pop(), 10) : null);
        // Parent migrates only when it uses this dataset directly; otherwise it's
        // here purely as the container for a drill that does.
        if (matchesDataset(card.datasourceId) && Number.isFinite(cardId)) {
          out.push({ chartType: card.chartType || null, id: cardId, name: card.title || card.name || `Card ${cardId}` });
        }
        for (const drill of Array.isArray(card.drills) ? card.drills : []) {
          if (!matchesDataset(drill?.datasourceId)) continue;
          const drillId = drill.id ?? (typeof drill.urn === 'string' ? parseInt(drill.urn.split(':')[1], 10) : null);
          if (!Number.isFinite(drillId) || seenDrills.has(drillId)) continue;
          seenDrills.add(drillId);
          out.push({
            chartType: drill.chartType || null,
            id: drillId,
            isDrill: true,
            name: drill.title || `Drill ${drillId}`,
            parentId: Number.isFinite(cardId) ? cardId : null,
            // The parent's name, carried so the UI can label it even when the
            // parent itself isn't migrating (it doesn't use this dataset) and so
            // isn't in the cards list to resolve the name from.
            parentName: card.title || card.name || (Number.isFinite(cardId) ? `Card ${cardId}` : null),
            urn: drill.urn
          });
        }
      }
      return out;
    },
    [datasetId],
    tabId
  );
}

/**
 * Fetch downstream cards, datasets, and dataflows that consume this dataset as
 * an input. Cards come from the dataset → cards endpoint. Downstream datasets
 * and dataflows come from the lineage API (downstream only).
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<{ cards: any[], dataflows: any[], datasets: any[] }>}
 */
export async function getDownstreamContent(datasetId, tabId = null) {
  const [cards, lineage] = await Promise.all([getDownstreamCards(datasetId, tabId), getDownstreamLineage(datasetId, tabId)]);
  return {
    cards,
    dataflows: lineage.dataflows,
    datasets: lineage.datasets
  };
}

/**
 * Walk the lineage graph downstream from this dataset. Returns separate
 * arrays for the derived datasets and dataflows that take this dataset as an
 * input. Dataset names aren't in the lineage payload, so we bulk-fetch their
 * metadata to label them.
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<{ datasets: Array<{id: string, name: string}>, dataflows: Array<{id: any, name: string}> }>}
 */
export async function getDownstreamLineage(datasetId, tabId = null) {
  const lineage = await executeInPage(
    async (datasetId) => {
      const url = `/api/data/v1/lineage/DATA_SOURCE/${datasetId}?traverseUp=false&maxDepth=4&requestEntities=DATA_SOURCE,DATAFLOW`;
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) {
        throw new Error(`Failed to fetch lineage: HTTP ${response.status}`);
      }
      const lineage = await response.json();

      // Direct downstream consumers only — children of the start node.
      const startKey = `DATA_SOURCE${datasetId}`;
      const startEntity = lineage[startKey];
      const directChildren = startEntity?.children || [];

      // Lineage children can repeat (a dataflow with multiple inputs from
      // this dataset shows up once per input). Track seen-keys so we don't
      // emit duplicate React rows.
      const seenDatasets = new Set();
      const seenDataflows = new Set();
      const datasetIds = [];
      const dataflows = [];
      for (const child of directChildren) {
        if (!child) continue;
        if (child.type === 'DATA_SOURCE') {
          const idStr = String(child.id);
          if (seenDatasets.has(idStr)) continue;
          seenDatasets.add(idStr);
          datasetIds.push(idStr);
        } else if (child.type === 'DATAFLOW') {
          if (seenDataflows.has(child.id)) continue;
          seenDataflows.add(child.id);
          // Lineage payload doesn't carry dataflow names — caller hydrates
          // these via getDataflowDetail after this returns.
          dataflows.push({ id: child.id });
        }
      }

      // Downstream DATA_SOURCE children of a dataset are always derived
      // datasets (views / data-fusions) — a plain dataset can't sit downstream
      // of another. So there's nothing to filter; we only bulk-fetch to pick up
      // their names (the lineage payload carries ids/types but no names).
      let datasets = [];
      if (datasetIds.length > 0) {
        const bulkResponse = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&part=core', {
          body: JSON.stringify(datasetIds),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (bulkResponse.ok) {
          const bulk = await bulkResponse.json();
          datasets = (bulk.dataSources || []).map((ds) => ({ id: ds.id, name: ds.name || `Dataset ${ds.id}` }));
        } else {
          // Bulk failed — fall back to id-based labels; the user can still pick.
          datasets = datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
        }
      }

      return { dataflows, datasets };
    },
    [datasetId],
    tabId
  );

  // Hydrate dataflow names — the lineage endpoint returns IDs only.
  // Best-effort: a failed detail fetch falls back to the ID-based label
  // rather than blocking the whole migration picker.
  const dataflowsWithNames = await Promise.all(
    lineage.dataflows.map(async (df) => {
      try {
        const detail = await getDataflowDetail(df.id, tabId);
        return { id: df.id, name: detail?.name || `Dataflow ${df.id}` };
      } catch {
        return { id: df.id, name: `Dataflow ${df.id}` };
      }
    })
  );

  return { dataflows: dataflowsWithNames, datasets: lineage.datasets };
}

const DATASET_SEARCH_PAGE_SIZE = 50;

// ===========================================================================
// SCHEMA COMPATIBILITY
// ===========================================================================

/**
 * Compare two datasets' column schemas. Compatible iff every column in
 * `originId` exists in `targetId` with a matching type. Returns the
 * non-matching columns so the caller can warn the user before transferring.
 *
 * @param {string} originId
 * @param {string} targetId
 * @param {number|null} tabId
 * @returns {Promise<{compatible: boolean, missing: Array<{name: string, expectedType: string, actualType: string|null}>}>}
 */
export async function compareDatasetSchemas(originId, targetId, tabId = null) {
  return executeInPage(
    async (originId, targetId) => {
      const fetchSchema = async (id) => {
        const res = await fetch(`/api/data/v2/datasources/${id}/schemas/latest`, {
          credentials: 'include'
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data?.schema?.columns || [];
      };

      const [originCols, targetCols] = await Promise.all([fetchSchema(originId), fetchSchema(targetId)]);
      const targetByName = new Map(targetCols.map((c) => [c.name, c.type]));
      const missing = [];
      for (const col of originCols) {
        if (!targetByName.has(col.name)) {
          missing.push({ actualType: null, expectedType: col.type, name: col.name });
        } else if (targetByName.get(col.name) !== col.type) {
          missing.push({
            actualType: targetByName.get(col.name),
            expectedType: col.type,
            name: col.name
          });
        }
      }
      return { compatible: missing.length === 0, missing };
    },
    [originId, targetId],
    tabId
  );
}

// ===========================================================================
// DATASET SEARCH (target picker)
// ===========================================================================

/**
 * Search Domo datasets via the universal search endpoint. Mirrors the shape
 * of `searchUsers` so a typeahead can plug it into the same render pattern.
 *
 * @param {string} text
 * @param {number|null} tabId
 * @param {number} offset
 * @returns {Promise<{datasets: Array<{id: string, name: string, owner?: string, dataProviderType?: string}>, totalCount: number|null}>}
 */
export async function searchDatasets(text, tabId = null, offset = 0) {
  return executeInPage(
    async (text, offset, limit) => {
      // Body shape matches the known-working pattern from getOwnedCards /
      // getOwnedDataflows in this codebase — `combineResults: false`,
      // `entityList`, `filters`. Anything beyond those fields (sort,
      // facetValuesToInclude, etc.) makes Domo reject the request, which
      // historically caused the typeahead dropdown to hang on each keystroke.
      const response = await fetch('/api/search/v1/query', {
        body: JSON.stringify({
          combineResults: false,
          count: limit,
          entityList: [['dataset']],
          filters: [],
          offset,
          query: text && text.length > 0 ? text : '*'
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to search datasets: HTTP ${response.status}`);
      }
      const data = await response.json();
      const beans = data.searchObjects || [];
      const seen = new Set();
      const datasets = [];
      for (const b of beans) {
        const id = b.databaseId || b.entityId || b.id;
        if (id == null || seen.has(id)) continue;
        seen.add(id);
        datasets.push({
          dataProviderType: b.dataProviderType || b.displayType || null,
          id,
          name: b.title || b.name || b.displayName || `Dataset ${id}`,
          owner: b.ownerName || b.ownedByName || null
        });
      }
      const totalCount = typeof data.totalResultCount === 'number' ? data.totalResultCount : null;
      return { datasets, totalCount };
    },
    [text, offset, DATASET_SEARCH_PAGE_SIZE],
    tabId
  );
}

// ===========================================================================
// SWAP EXECUTORS
//
// Note: the dataset-view swap recurses through `selectBody` (handles `joins`
// and `setOperationList`), updates column `referenceDataSourceId` references,
// rewrites `formattedExpression` mapping strings, then does a final
// JSON-string sweep to catch any remaining occurrences of the old ID. All
// the recursive helpers are inlined inside `executeInPage` so they evaluate
// in the page's main world without depending on closures crossing the
// chrome.scripting bridge.
// ===========================================================================

/**
 * Swap a card's input dataset.
 *
 * Two paths:
 *   - **fast**: schemas are compatible AND no remap requested → uses the
 *     lightweight `/datasource/{id}?currentDsId=...` shortcut. Domo handles
 *     column matching server-side by name; safe only when the schemas line up.
 *   - **full**: schema mismatch was detected (`useFullPath`) OR an effective
 *     `columnMap` is provided → fetches the full card definition, applies
 *     column rewrites + dataset-id rewrite, and PUTs the whole thing back.
 *     `cachedDefinition` lets the caller reuse the definition already fetched
 *     during the column scan.
 *
 * @param {Object} params
 * @param {number} params.cardId
 * @param {string} params.originId
 * @param {string} params.targetId
 * @param {Record<string, string|null>} [params.columnMap]
 * @param {Object} [params.cachedDefinition]
 * @param {boolean} [params.useFullPath] - Force the full-PUT path even with no remap. Set when the schema check found mismatches; the lightweight endpoint can't reconcile mismatched column names server-side and would error.
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapCardInput({
  beastModeIdRemap,
  cachedDefinition,
  cardId,
  columnMap,
  droppedColumns,
  originId,
  tabId = null,
  targetId,
  urn,
  useFullPath = false
}) {
  // A non-empty Beast Mode remap forces the full-PUT path: the lightweight
  // shortcut can't repoint a card's references to its dataset's Beast Modes,
  // which now live on the target under new ids.
  const hasBeastModeRemap = beastModeIdRemap && Object.keys(beastModeIdRemap).length > 0;
  // Dropping columns also forces the full-PUT path: the lightweight shortcut
  // can't strip a column's references from the definition.
  const hasDroppedColumns = Array.isArray(droppedColumns) && droppedColumns.length > 0;
  // Drill cards (urn = `dr:<drillId>:<rootId>`) always go through the full-PUT
  // path: the lightweight `/datasource/{id}` shortcut is for plain kpi cards
  // and likely won't recognize the drill, and we need to preserve the drill's
  // `drillpath` array (parent linkage) on PUT.
  const isDrill = typeof urn === 'string' && urn.startsWith('dr:');
  if (!isDrill && !useFullPath && !hasEffectiveMapping(columnMap) && !hasBeastModeRemap && !hasDroppedColumns) {
    return swapCardInputFast(cardId, originId, targetId, tabId);
  }
  try {
    const fetchUrn = urn || cardId;
    const definition = cachedDefinition || (await getCardDefinition({ cardId: fetchUrn, tabId }));
    let rewritten = hasEffectiveMapping(columnMap)
      ? rewriteCardColumns(definition, columnMap)
      : JSON.parse(JSON.stringify(definition));
    if (Array.isArray(rewritten.columns)) {
      for (const col of rewritten.columns) {
        if (col.sourceId === originId) col.sourceId = targetId;
      }
    }
    rewritten = JSON.parse(JSON.stringify(rewritten).replaceAll(originId, targetId));
    // Repoint references to the origin dataset's Beast Modes onto the ones now
    // on the target. Keys are origin legacyIds (`calculation_<uuid>`), which
    // are collision-safe for a string sweep (unlike short numeric ids).
    if (hasBeastModeRemap) {
      let json = JSON.stringify(rewritten);
      for (const [from, to] of Object.entries(beastModeIdRemap)) {
        if (from && to && from !== to) json = json.replaceAll(from, to);
      }
      rewritten = JSON.parse(json);
    }
    // Drop columns the user chose to remove (offered only for badge_table
    // cards/drills): strip every reference so they disappear from the table.
    if (hasDroppedColumns) {
      rewritten = removeCardColumns(rewritten, droppedColumns);
    }
    // Filter unused columns: some chart types list every column even when not
    // used. Keep only columns with a 'mapping' key (the presence of the key
    // signals the column is actually referenced by the chart).
    if (rewritten?.subscriptions?.main?.columns && Array.isArray(rewritten.subscriptions.main.columns)) {
      rewritten.subscriptions.main.columns = rewritten.subscriptions.main.columns.filter(
        (col) => col && Object.prototype.hasOwnProperty.call(col, 'mapping')
      );
    }
    return await putCardForMigration(cardId, rewritten, tabId, { isDrill, urn });
  } catch (err) {
    console.error('[swapCardInput] full-path failed:', err);
    return { error: err?.message || String(err), success: false };
  }
}

/**
 * Swap a dataflow's input dataset, optionally rewriting column references.
 *
 * Magic ETL column rewrites run via the structured `columnRewriter`; Redshift
 * and MySQL rewrite column refs inside their SQL (dialect-aware, scoped to the
 * origin alias). The dataset-id repoint is a JSON-string sweep on the UUID
 * (collision-safe). A version-history comment naming the swap is recorded on
 * the new dataflow version so the change is auditable in Domo.
 *
 * @param {Object} params
 * @param {any} params.dataflowId
 * @param {string} params.originId
 * @param {string} params.targetId
 * @param {Record<string, string|null>} [params.columnMap]
 * @param {Object} [params.cachedDefinition]
 * @param {string} [params.originName] - Origin dataset name, for the version comment.
 * @param {string} [params.targetName] - Target dataset name, for the version comment.
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string, unhandled?: Array<{actionId: any, field: string, index?: number}>}>}
 */
export async function swapDataflowInput({
  cachedDefinition,
  columnMap,
  dataflowId,
  originId,
  originName,
  tabId = null,
  targetId,
  targetName
}) {
  try {
    let definition = cachedDefinition;
    if (!definition) {
      definition = await fetchDataflowDefinitionInPage(dataflowId, tabId);
    }
    const engine = getDataflowEngine(definition);
    // Magic ETL rewrites column refs in structured fields; Redshift/MySQL
    // rewrite them inside SQL, scoped to the origin alias. `unhandled` lists
    // SQL statements left verbatim (origin SELECT *, etc.) for manual review.
    let unhandled = [];
    let remappedColumnCount = 0;
    if (hasEffectiveMapping(columnMap)) {
      // Count before rewriting (the rewriters clone, so `definition` still has
      // origin's original column names here).
      remappedColumnCount = countRemappedColumns(definition, columnMap, originId, engine);
      if (engine === 'mysql' || engine === 'redshift') {
        const result = rewriteDataflowSqlColumns(definition, columnMap, originId);
        definition = result.definition;
        unhandled = result.unhandled;
      } else if (engine === 'magic') {
        definition = rewriteDataflowColumns(definition, columnMap);
      }
      // Unknown non-Magic engines: repoint the input only. The column scan
      // already flagged them for manual review, and blindly running the
      // structured rewriter could corrupt an unfamiliar definition shape.
    }
    // Record a version-history comment on the new dataflow version so the
    // change is auditable in Domo. Set it even for a pure repoint (count 0).
    setDataflowVersionDescription(definition, originName, targetName, remappedColumnCount);
    const putResult = await putDataflowInPage(dataflowId, definition, originId, targetId, tabId);
    return putResult.success && unhandled.length > 0 ? { ...putResult, unhandled } : putResult;
  } catch (err) {
    return { error: err?.message || String(err), success: false };
  }
}

/**
 * Swap a dataset view's input dataset, optionally rewriting column references.
 *
 * Column rewrites run in the extension context first; then the page does the
 * dataset-id rewrite (recursive selectBody, column referenceDataSourceId,
 * formattedExpression mapping, final JSON sweep) before PUT.
 *
 * @param {Object} params
 * @param {string} params.viewId
 * @param {string} params.originId
 * @param {string} params.targetId
 * @param {Record<string, string|null>} [params.columnMap]
 * @param {Object} [params.cachedDefinition]
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapDatasetViewInput({
  cachedDefinition,
  columnMap,
  originId,
  tabId = null,
  targetColumnTypes,
  targetId,
  viewId
}) {
  try {
    let definition = cachedDefinition;
    if (!definition) {
      definition = await fetchDatasetViewDefinitionInPage(viewId, tabId);
    }
    if (hasEffectiveMapping(columnMap)) {
      definition = rewriteDatasetViewColumns(definition, columnMap, originId, targetColumnTypes);
    }
    return await putDatasetViewInPage(viewId, definition, originId, targetId, targetColumnTypes, tabId);
  } catch (err) {
    return { error: err?.message || String(err), success: false };
  }
}

/**
 * Swap a data fusion's input dataset, optionally rewriting column references.
 *
 * Fusions are a distinct object from template/SQL views with their own edit
 * model and endpoint (`/api/query/v1/fusions/{id}`), so this path never touches
 * the template-view PUT. It fetches the native fusion definition, repoints the
 * origin input id and rewrites only that input's column refs (join predicates
 * and `columnList[].fuseMapping`), and PUTs the native shape back. Output column
 * names and the other input's columns are preserved.
 *
 * @param {Object} params
 * @param {string} params.fusionId
 * @param {string} params.originId
 * @param {string} params.targetId
 * @param {Record<string, string|null>} [params.columnMap]
 * @param {Record<string, string>} [params.targetColumnTypes] - Map of NEW column name → target type.
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapFusionInput({ columnMap, fusionId, originId, tabId = null, targetColumnTypes, targetId }) {
  try {
    const definition = await fetchFusionDefinitionInPage(fusionId, tabId);
    return await putFusionInPage(fusionId, definition, originId, targetId, columnMap, targetColumnTypes, tabId);
  } catch (err) {
    return { error: err?.message || String(err), success: false };
  }
}

async function fetchDataflowDefinitionInPage(dataflowId, tabId) {
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

async function fetchDatasetViewDefinitionInPage(viewId, tabId) {
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

async function fetchFusionDefinitionInPage(fusionId, tabId) {
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

/**
 * Migration-aware card PUT — bypasses `updateCardDefinition` so we can route
 * dataset-persisted beast modes to `formulas.dsUpdated` instead of force-
 * converting them to card-level.
 *
 * Why not reuse `updateCardDefinition`? It always sets
 * `formulas.dsUpdated = []`, so any persisted formula (e.g. `SUM(\`col\`)`
 * shared across many cards) gets dropped from the body — the card update
 * then references a missing formula and Domo 400s, OR Domo auto-migrates
 * the original (with the OLD column refs!) creating a duplicate. Routing
 * persisted formulas to `dsUpdated` preserves their persistence on the
 * target dataset and supplies our rewritten formula text so the auto-
 * migration doesn't run with stale refs.
 *
 * Other preprocessing mirrors `updateCardDefinition` exactly: strips
 * id/urn/columns/drillpath/embedded/dataSourceWrite, derives
 * dataProvider.dataSourceId from columns[0].sourceId, transforms
 * conditionalFormats from array to {card, datasource}.
 */
async function putCardForMigration(cardId, definition, tabId, { isDrill = false, urn = null } = {}) {
  const datasetId = definition?.columns?.[0]?.sourceId;

  // Strip internal-only fields the v3 PUT endpoint doesn't accept.
  delete definition.id;
  delete definition.urn;
  delete definition.columns;
  // For drill cards, `drillpath` is a `[parentId]` array that must be
  // preserved — it's how Domo links a drill back to its root parent. For
  // regular kpi cards, `drillpath` is empty in the v3 response and the
  // standard updateCardDefinition strips it; we follow suit there.
  if (!isDrill) delete definition.drillpath;
  delete definition.embedded;
  delete definition.dataSourceWrite;

  definition.dataProvider = { dataSourceId: datasetId || null };
  definition.variables = true;

  const allFormulas = Array.isArray(definition?.definition?.formulas) ? definition.definition.formulas : [];
  // Only card-level Beast Modes ride with the card. Dataset-persisted ones
  // migrate as their own Beast Mode type, created on the target with their
  // column refs already rewritten; the card just references them by id, which
  // the Beast Mode id remap repoints during the card swap. Sending them in
  // dsUpdated would re-write the same Beast Mode once per card that uses it and
  // risk Domo auto-migrating stale refs, so dsUpdated/dsDeleted stay empty.
  definition.definition.formulas = {
    card: allFormulas.filter((f) => f && f.persistedOnDataSource === false),
    dsDeleted: [],
    dsUpdated: []
  };
  definition.definition.annotations = { deleted: [], modified: [], new: [] };

  if (Array.isArray(definition.definition.conditionalFormats)) {
    const cardFormats = [];
    const datasourceFormats = [];
    for (const fmt of definition.definition.conditionalFormats) {
      if (fmt?.dataSourceId) datasourceFormats.push(fmt);
      else cardFormats.push(fmt);
    }
    definition.definition.conditionalFormats = {
      card: cardFormats,
      datasource: datasourceFormats
    };
  }

  // For drill cards the URL must use the full `dr:<drillId>:<rootId>` URN —
  // PUTing to the bare numeric id returns "Unable to find card id in urn".
  const pathSegment = isDrill && urn ? urn : String(cardId);

  return executeInPage(
    async (pathSegment, definition) => {
      try {
        const response = await fetch(`/api/content/v3/cards/kpi/${pathSegment}`, {
          body: JSON.stringify(definition),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) {
          let bodyText = '';
          try {
            bodyText = await response.text();
          } catch {
            // body unreadable — fall through with empty
          }
          return {
            error: `PUT card HTTP ${response.status}: ${bodyText}`.trim(),
            success: false
          };
        }
        return { success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
      }
    },
    [pathSegment, definition],
    tabId
  );
}

async function putDataflowInPage(dataflowId, definition, originId, targetId, tabId) {
  return executeInPage(
    async (dataflowId, definition, originId, targetId) => {
      try {
        const updated = JSON.parse(JSON.stringify(definition).replaceAll(originId, targetId));
        const putResponse = await fetch(`/api/dataprocessing/v1/dataflows/${dataflowId}`, {
          body: JSON.stringify(updated),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!putResponse.ok) {
          const text = await putResponse.text().catch(() => '');
          return {
            error: `PUT dataflow HTTP ${putResponse.status}: ${text}`.trim(),
            success: false
          };
        }
        return { success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
      }
    },
    [dataflowId, definition, originId, targetId],
    tabId
  );
}

async function putDatasetViewInPage(viewId, viewDefinition, originId, targetId, targetColumnTypes, tabId) {
  return executeInPage(
    async (viewId, viewDefinition, originId, targetId, targetColumnTypes) => {
      try {
        const cleanId = (id) => (!id ? id : id.replace(/`/g, ''));
        const quoteId = (id) => `\`${cleanId(id)}\``;

        const swapDatasetRecursive = (node, oldId, newId) => {
          if (!node) return;
          const oldClean = cleanId(oldId);
          const newQuoted = quoteId(newId);
          if (node.fromItem && node.fromItem.name) {
            if (cleanId(node.fromItem.name) === oldClean) node.fromItem.name = newQuoted;
          }
          if (node.joins && Array.isArray(node.joins)) {
            node.joins.forEach((join) => {
              if (join?.rightItem?.name && cleanId(join.rightItem.name) === oldClean) {
                join.rightItem.name = newQuoted;
              }
            });
          }
          if (node.setOperationList && Array.isArray(node.setOperationList)) {
            node.setOperationList.forEach((operation) => {
              if (operation?.selectBody) {
                swapDatasetRecursive(operation.selectBody, oldId, newId);
              }
            });
          }
        };

        const updateColumnReferences = (schema, oldId, newId) => {
          if (!schema?.tables) return;
          schema.tables.forEach((table) => {
            if (!table.columns) return;
            table.columns.forEach((col) => {
              if (col.referenceDataSourceId === oldId) col.referenceDataSourceId = newId;
            });
          });
        };

        const updateMappingExpressions = (viewTemplate, oldId, newId) => {
          if (!viewTemplate?.fromItemInfo) return;
          const oldStr = cleanId(oldId);
          const newStr = cleanId(newId);
          const replaceId = (value) => (typeof value !== 'string' ? value : value.replaceAll(oldStr, newStr));
          Object.values(viewTemplate.fromItemInfo).forEach((section) => {
            if (!section?.columnInfo) return;
            Object.values(section.columnInfo).forEach((col) => {
              if (col.formattedExpression) col.formattedExpression = replaceId(col.formattedExpression);
            });
          });
        };

        // The id sweep repoints the input but leaves the available-column palette
        // (fromItemInfo.columnInfo) listing the ORIGIN's columns under the target's
        // id, so it shows columns the target doesn't have and omits ones it does.
        // Rebuild the target-input passthrough entries from the target's real
        // schema: drop every entry that is a bare `targetId`.`col` ref and re-add
        // one per target column. Computed expressions and other inputs' refs (e.g.
        // a join's base alias) aren't bare target refs, so they're left untouched.
        // Skipped when the target schema isn't known (compatible-schema migrations
        // don't fetch it, and their swept palette has no dangling columns anyway).
        const regenerateTargetPalette = (viewTemplate, newId, columnTypes) => {
          if (!viewTemplate?.fromItemInfo || !columnTypes || Object.keys(columnTypes).length === 0) return;
          const idClean = cleanId(newId);
          const escaped = idClean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const bareTargetRef = new RegExp('^`' + escaped + '`\\.`[^`]+`$');
          Object.values(viewTemplate.fromItemInfo).forEach((section) => {
            if (!section?.columnInfo) return;
            const kept = {};
            for (const [key, entry] of Object.entries(section.columnInfo)) {
              const fe = entry?.formattedExpression;
              if (typeof fe === 'string' && bareTargetRef.test(fe)) continue; // drop stale target passthrough
              kept[key] = entry;
            }
            const usedKeys = new Set(Object.keys(kept));
            const rebuilt = { ...kept };
            for (const [colName, type] of Object.entries(columnTypes)) {
              let key = colName;
              let n = 1;
              while (usedKeys.has(key)) key = `${colName} ${n++}`;
              usedKeys.add(key);
              rebuilt[key] = { aggregated: false, formattedExpression: `\`${idClean}\`.\`${colName}\``, type };
            }
            section.columnInfo = rebuilt;
          });
        };

        const payload = JSON.parse(JSON.stringify(viewDefinition));
        swapDatasetRecursive(payload.viewTemplate?.select?.selectBody, originId, targetId);
        updateColumnReferences(payload, originId, targetId);
        updateMappingExpressions(payload.viewTemplate, originId, targetId);
        const cleaned = JSON.parse(JSON.stringify(payload).replaceAll(originId, targetId));
        // Run after the id sweep so the palette is rebuilt against the target id.
        // Non-fatal: a failure here must not block the (already-correct) migration.
        try {
          regenerateTargetPalette(cleaned.viewTemplate, targetId, targetColumnTypes);
        } catch (paletteErr) {
          console.warn('[migrate] view palette regeneration skipped:', paletteErr);
        }
        const updatedPayload = {
          dataProviderType: null,
          dataSourceName: payload.name,
          schema: cleaned,
          trigger: {}
        };

        const putResponse = await fetch(`/api/query/v1/views/${viewId}`, {
          body: JSON.stringify(updatedPayload),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!putResponse.ok) {
          const text = await putResponse.text().catch(() => '');
          return { error: `PUT view HTTP ${putResponse.status}: ${text}`.trim(), success: false };
        }
        return { success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
      }
    },
    [viewId, viewDefinition, originId, targetId, targetColumnTypes],
    tabId
  );
}

/**
 * PUT a data fusion's native definition back with its input repointed and the
 * origin input's column refs rewritten. Operates on the native fusion shape
 * (`columnFuse` + `columnList`), NOT the compiled `/schema/indexed` shape the
 * template-view PUT uses, which is what broke fusions with `Invalid alias
 * 'mapping'`.
 *
 * Column rewrites are scoped to the ORIGIN input (identified by its dataSource
 * id) so the other input's columns are never touched:
 *   - `columnList[].fuseMapping.columnName` where `fuseMapping.dataSource` is the
 *     origin (and its declared `type` when the remap crosses a type boundary).
 *   - the origin side of each join predicate (`leftColumn` when
 *     `leftDataSource` is origin, else `rightColumn`).
 * Output column names (`columnList[].name`) are the view's own and stay put.
 * After the scoped rewrite, the origin input id is swept to the target (UUID, so
 * a string sweep is collision-safe) and validation is disabled on save.
 */
async function putFusionInPage(fusionId, fusionDefinition, originId, targetId, columnMap, targetColumnTypes, tabId) {
  return executeInPage(
    async (fusionId, fusionDefinition, originId, targetId, columnMap, targetColumnTypes) => {
      try {
        const stripTicks = (s) =>
          typeof s === 'string' && s.length >= 2 && s.startsWith('`') && s.endsWith('`') ? s.slice(1, -1) : s;
        const originClean = stripTicks(originId);
        const map = columnMap || {};
        const types = targetColumnTypes || {};
        const remapColumn = (name) => {
          if (typeof name !== 'string') return name;
          const wasTicked = name.length >= 2 && name.startsWith('`') && name.endsWith('`');
          const bare = wasTicked ? name.slice(1, -1) : name;
          const to = map[bare];
          if (to == null || to === bare) return name;
          return wasTicked ? `\`${to}\`` : to;
        };

        const payload = JSON.parse(JSON.stringify(fusionDefinition));

        const rewrite = (node) => {
          if (Array.isArray(node)) {
            for (const item of node) rewrite(item);
            return;
          }
          if (!node || typeof node !== 'object') return;
          // columnList entry: { name, type, fuseMapping: { dataSource, columnName } }
          if (
            node.fuseMapping &&
            typeof node.fuseMapping === 'object' &&
            stripTicks(node.fuseMapping.dataSource) === originClean &&
            typeof node.fuseMapping.columnName === 'string'
          ) {
            const oldCol = stripTicks(node.fuseMapping.columnName);
            const newCol = map[oldCol];
            if (newCol != null && newCol !== oldCol) {
              node.fuseMapping.columnName = remapColumn(node.fuseMapping.columnName);
              const newType = types[newCol];
              if (newType && typeof node.type === 'string' && node.type !== newType) node.type = newType;
            }
          }
          // columnFuse node: { type, leftDataSource, rightDataSource, predicates }
          if (Array.isArray(node.predicates) && (node.leftDataSource || node.rightDataSource)) {
            const leftIsOrigin = stripTicks(node.leftDataSource) === originClean;
            const rightIsOrigin = stripTicks(node.rightDataSource) === originClean;
            for (const predicate of node.predicates) {
              if (!predicate || typeof predicate !== 'object') continue;
              if (leftIsOrigin && typeof predicate.leftColumn === 'string') {
                predicate.leftColumn = remapColumn(predicate.leftColumn);
              }
              if (rightIsOrigin && typeof predicate.rightColumn === 'string') {
                predicate.rightColumn = remapColumn(predicate.rightColumn);
              }
            }
          }
          for (const v of Object.values(node)) rewrite(v);
        };
        rewrite(payload);

        const updated = JSON.parse(JSON.stringify(payload).replaceAll(originId, targetId));
        updated.validate = false;
        // The fusion edit endpoint requires the type discriminator; default it if
        // the GET response (which is otherwise round-tripped verbatim) omits it.
        if (!updated.dataSourceType) updated.dataSourceType = 'datafusion';

        const putResponse = await fetch(`/api/query/v1/fusions/${fusionId}`, {
          body: JSON.stringify(updated),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!putResponse.ok) {
          const text = await putResponse.text().catch(() => '');
          return { error: `PUT fusion HTTP ${putResponse.status}: ${text}`.trim(), success: false };
        }
        return { success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
      }
    },
    [fusionId, fusionDefinition, originId, targetId, columnMap, targetColumnTypes],
    tabId
  );
}

async function swapCardInputFast(cardId, originId, targetId, tabId) {
  return executeInPage(
    async (cardId, originId, targetId) => {
      try {
        const response = await fetch(`/api/content/v1/cards/${cardId}/datasource/${targetId}?currentDsId=${originId}`, {
          body: '{}',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) {
          const text = await response.text().catch(() => '');
          return { error: `HTTP ${response.status}: ${text}`.trim(), success: false };
        }
        return { success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
      }
    },
    [cardId, originId, targetId],
    tabId
  );
}

// ===========================================================================
// ORCHESTRATOR
// ===========================================================================

/**
 * Type registry for the migration view, in render order. Display labels are
 * derived from the object type model (see `typeGroupLabel` in the view), not
 * stored here, so they stay correct (e.g. "DataFlow"/"DataSet" casing).
 */
export const MIGRATE_TYPES = [{ key: 'beastModes' }, { key: 'cards' }, { key: 'dataflows' }, { key: 'datasets' }];

/**
 * Migrate every selected item from `originId` to `targetId`. Calls
 * `onProgress` per type with `{typeKey, status, count, result}` so the
 * view can drive its DataList rows the same way OwnershipView does.
 *
 * Beast Modes migrate FIRST: cards reference their dataset's Beast Modes by id,
 * so the Beast Modes must exist on the target (with their new ids known) before
 * the cards swap repoints those references.
 *
 * @param {Object} params
 * @param {string} params.originId
 * @param {string} [params.originName] - Origin dataset name, for the dataflow version-history comment.
 * @param {string} params.targetId
 * @param {string} [params.targetName] - Target dataset name, for the dataflow version-history comment.
 * @param {{ beastModes?: Array<{id: any, name?: string, legacyId?: string}>, cards: Array<{id: any, name?: string}>, datasets: Array<{id: string, name?: string}>, dataflows: Array<{id: any, name?: string}> }} params.selectedItems
 * @param {Record<string, {disposition: 'create'|'rename'|'keep'|'overwrite', newName?: string}>} [params.beastModeChoices] - Per origin Beast Mode id, the conflict resolution chosen on the target.
 * @param {Array<{id: any, name: string, legacyId?: string}>} [params.targetBeastModes] - The target dataset's existing Beast Modes (for keep/overwrite).
 * @param {Record<string, string|null>} [params.columnMap] - Origin → target column-name map. Null targets and no-op entries are skipped.
 * @param {string[]} [params.droppedColumns] - Origin column names to remove entirely from card definitions (the "drop column" choice; cards only).
 * @param {Map<string, { definition: Object }>} [params.definitionsByItemKey] - Cached content definitions from the column-reference scan, keyed by `${typeKey}:${itemId}`. Reused so we don't re-fetch.
 * @param {Function} [params.onProgress]
 * @param {number|null} [params.tabId]
 * @returns {Promise<Map<string, {attempted: Array, count: number, errors: Array, failed: number, manualReview: Array<{id: any, name: string}>, succeeded: number}>>}
 */
export async function migrateAllDownstreamContent({
  beastModeChoices,
  columnMap,
  definitionsByItemKey,
  droppedColumns,
  onProgress,
  originId,
  originName,
  selectedItems,
  tabId,
  targetBeastModes,
  targetColumnTypes,
  targetId,
  targetName,
  useFullPath = false
}) {
  const results = new Map();

  // Phase 1: Beast Modes. Produces the origin → target id remap the card swap
  // consumes; nothing else depends on it, so it must complete before phase 2.
  const beastModeItems = selectedItems?.beastModes || [];
  let beastModeIdRemap = {};
  const beastModeAttempted = beastModeItems.map((i) => ({ id: i.id, name: i.name || String(i.id) }));
  if (beastModeItems.length === 0) {
    const result = { attempted: [], count: 0, errors: [], failed: 0, succeeded: 0 };
    results.set('beastModes', result);
    onProgress?.({ count: 0, result, status: 'done', typeKey: 'beastModes' });
  } else {
    onProgress?.({ count: beastModeItems.length, status: 'transferring', typeKey: 'beastModes' });
    const bm = await migrateBeastModes({
      beastModeChoices,
      columnMap,
      definitionsByItemKey,
      originId,
      selectedBeastModes: beastModeItems,
      tabId,
      targetBeastModes,
      targetId
    });
    beastModeIdRemap = bm.idRemap;
    const result = {
      attempted: beastModeAttempted,
      count: beastModeItems.length,
      errors: bm.errors,
      failed: bm.errors.length,
      succeeded: bm.succeeded
    };
    results.set('beastModes', result);
    onProgress?.({ count: beastModeItems.length, result, status: 'done', typeKey: 'beastModes' });
  }

  // Phase 2: cards / datasets / dataflows. Cards consume `beastModeIdRemap`.
  await Promise.allSettled(
    MIGRATE_TYPES.filter((type) => type.key !== 'beastModes').map(async (type) => {
      const items = selectedItems?.[type.key] || [];
      const attempted = items.map((i) => ({ id: i.id, name: i.name || String(i.id) }));

      if (items.length === 0) {
        const result = { attempted: [], count: 0, errors: [], failed: 0, manualReview: [], succeeded: 0 };
        results.set(type.key, result);
        onProgress?.({ count: 0, result, status: 'done', typeKey: type.key });
        return;
      }

      onProgress?.({ count: items.length, status: 'transferring', typeKey: type.key });

      const errors = [];
      const manualReview = [];
      let succeeded = 0;
      for (const item of items) {
        const cached = definitionsByItemKey?.get?.(makeItemKey(type.key, item.id))?.definition;
        const resp = await dispatchSwap(type.key, item, {
          beastModeIdRemap,
          cachedDefinition: cached,
          columnMap,
          droppedColumns,
          originId,
          originName,
          tabId,
          targetColumnTypes,
          targetId,
          targetName,
          useFullPath
        });
        if (resp?.success) {
          succeeded++;
          // SQL dataflow statements we couldn't safely rewrite (origin SELECT *,
          // etc.). The input still repointed; the user must fix these by hand.
          if (Array.isArray(resp.unhandled) && resp.unhandled.length > 0) {
            manualReview.push({ id: item.id, name: item.name || String(item.id) });
          }
        } else {
          errors.push({ error: resp?.error || 'Unknown error', id: item.id });
        }
      }

      const result = {
        attempted,
        count: items.length,
        errors,
        failed: errors.length,
        manualReview,
        succeeded
      };
      results.set(type.key, result);
      onProgress?.({ count: items.length, result, status: 'done', typeKey: type.key });
    })
  );

  return results;
}

/**
 * Build a Beast Mode create/update entry from a (column-rewritten) origin
 * template: first repoint references to OTHER beast modes (origin
 * `calculation_<uuid>` → the target id they were created under, via `idRemap`),
 * then sweep origin-dataset-id references onto the target (catches the
 * `DATA_SOURCE` link and any embedded ids, same approach as the card/view
 * swaps), drop server-managed timestamps, set the name, and set the owner
 * to the current user. Callers handle `id`/`legacyId` (deleted for create,
 * set to the target's for overwrite).
 *
 * The id-remap sweep runs BEFORE the dataset-id sweep so a nested beast mode's
 * embedded reference points at the already-created target beast mode; the
 * target `calculation_<uuid>` tokens don't contain `originId`, so the dataset
 * sweep can't corrupt them.
 */
function buildBeastModeEntry(template, { currentUserId, idRemap, name, originId, targetId }) {
  let json = JSON.stringify(template);
  if (idRemap) {
    for (const [from, to] of Object.entries(idRemap)) {
      if (from && to && from !== to) json = json.replaceAll(from, to);
    }
  }
  json = json.replaceAll(originId, targetId);
  const entry = JSON.parse(json);
  delete entry.created;
  delete entry.lastModified;
  entry.name = name;
  entry.owner = currentUserId;
  return entry;
}

/**
 * Build the dataflow version-history comment, capped at Domo's 253-char limit.
 * Drops the target name first, then the origin name, to stay under the cap.
 *
 * The input remap is stated as the primary action; the column-reference rename
 * count is a separate trailing sentence. This keeps the two facts distinct so a
 * same-name reconciliation (where only the column's type changed, so no
 * reference needs renaming) still reads as a deliberate remap instead of "0
 * column references", which looked like nothing happened.
 */
function buildDataflowVersionDescription(originName, targetName, count) {
  const max = 253;
  const refsSentence =
    count === 0 ? 'No column references needed renaming.' : `Renamed ${count} column reference${count === 1 ? '' : 's'}.`;
  const candidates = [];
  if (originName && targetName) {
    candidates.push(`Remapped ${originName} to ${targetName} via Domo Toolkit. ${refsSentence}`);
  }
  if (originName) {
    candidates.push(`Remapped ${originName} via Domo Toolkit. ${refsSentence}`);
  }
  candidates.push(`Remapped the input via Domo Toolkit. ${refsSentence}`);
  for (const candidate of candidates) {
    if (candidate.length <= max) return candidate;
  }
  return candidates[candidates.length - 1].slice(0, max);
}

/**
 * Count the distinct origin columns this dataflow references that have an
 * effective remap. Read from the original definition (before any rewrite).
 * Unknown engines aren't column-rewritten, so they report 0.
 */
function countRemappedColumns(definition, columnMap, originId, engine) {
  let referenced;
  if (engine === 'mysql' || engine === 'redshift') {
    referenced = extractDataflowSqlColumnRefs(definition, originId).refs;
  } else if (engine === 'magic') {
    referenced = extractDataflowColumnRefs(definition);
  } else {
    return 0;
  }
  let count = 0;
  for (const name of referenced) {
    const to = columnMap?.[name];
    if (to != null && to !== name) count++;
  }
  return count;
}

/**
 * Route a downstream dataset to the correct swap path. Downstream datasets are
 * always derived (template/SQL views or data-fusions); fusions need their own
 * native edit endpoint, so detect fusion-ness from the indexed schema (cached by
 * the column scan, fetched here only if absent) and branch.
 */
async function dispatchDatasetSwap(item, options) {
  let indexed = options.cachedDefinition;
  if (!indexed) {
    try {
      indexed = await fetchDatasetViewDefinitionInPage(item.id, options.tabId);
    } catch (err) {
      return { error: err?.message || String(err), success: false };
    }
  }
  if (isFusionView(indexed)) {
    return swapFusionInput({
      columnMap: options.columnMap,
      fusionId: item.id,
      originId: options.originId,
      tabId: options.tabId,
      targetColumnTypes: options.targetColumnTypes,
      targetId: options.targetId
    });
  }
  return swapDatasetViewInput({
    cachedDefinition: indexed,
    columnMap: options.columnMap,
    originId: options.originId,
    tabId: options.tabId,
    targetColumnTypes: options.targetColumnTypes,
    targetId: options.targetId,
    viewId: item.id
  });
}

async function dispatchSwap(typeKey, item, options) {
  if (typeKey === 'cards') {
    return swapCardInput({
      beastModeIdRemap: options.beastModeIdRemap,
      cachedDefinition: options.cachedDefinition,
      cardId: item.id,
      columnMap: options.columnMap,
      droppedColumns: options.droppedColumns,
      originId: options.originId,
      tabId: options.tabId,
      targetId: options.targetId,
      urn: item.urn,
      useFullPath: options.useFullPath
    });
  }
  if (typeKey === 'datasets') {
    // Fusions and template/SQL views are different objects with different edit
    // APIs, not variants of one shape. A fusion saved through the template-view
    // PUT round-trips its compiled internal projection (aliased `mapping`) and
    // Domo rejects it ("Invalid alias 'mapping'"), so route fusions to their own
    // native path. Detect from the cached indexed schema (the scan caches it);
    // fall back to fetching it when no cache is present.
    return dispatchDatasetSwap(item, options);
  }
  if (typeKey === 'dataflows') {
    return swapDataflowInput({
      cachedDefinition: options.cachedDefinition,
      columnMap: options.columnMap,
      dataflowId: item.id,
      originId: options.originId,
      originName: options.originName,
      tabId: options.tabId,
      targetId: options.targetId,
      targetName: options.targetName
    });
  }
  return { error: `Unknown migrate type ${typeKey}`, success: false };
}

/**
 * Pull the created-function entries out of a `POST /functions/bulk/template`
 * response, in request order, so callers can resolve new legacyIds positionally
 * (collision-safe when duplicate names exist). Tolerant of the response being a
 * bare array or wrapping the created list under a known key.
 */
function extractCreatedFunctions(response) {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  for (const key of ['create', 'created', 'functions', 'results', 'templates']) {
    if (Array.isArray(response[key])) return response[key];
  }
  return [];
}

/** Read a Beast Mode entry's `legacyId` (the `calculation_<uuid>`), if present. */
function getEntryLegacyId(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return entry.legacyId || entry.template?.legacyId || null;
}

/**
 * Migrate dataset-saved Beast Modes onto the target, returning an id remap
 * (origin legacyId → target legacyId) the card swap uses to repoint references.
 *
 * Per Beast Mode, the user's choice (from `beastModeChoices`, keyed by origin
 * id) decides the disposition:
 *   - keep:      reuse the same-named Beast Mode already on the target.
 *   - overwrite: replace that target Beast Mode's definition with this one.
 *   - create / rename (default): create a new Beast Mode on the target.
 * Column refs are rewritten via `columnMap` before any write.
 *
 * Nested Beast Modes (one whose formula references another, e.g.
 * `bm3 = CONCAT(\`bm1\`, \`bm2\`)`) embed the ORIGIN `calculation_<uuid>` of the
 * Beast Modes they reference, which doesn't exist on the target. To handle them:
 *   1. keep/overwrite mappings are seeded into `idRemap` up front (their target
 *      ids are known immediately), so any create that references them resolves.
 *   2. creates are split into dependency-ordered WAVES (Kahn topological sort on
 *      "B references A's origin legacyId"); each wave is built with the
 *      accumulated `idRemap` applied, so its references point at the target ids
 *      of already-created Beast Modes.
 *   3. after each wave's create, new legacyIds are resolved positionally from
 *      the order-preserving bulk response (collision-safe for duplicate names),
 *      falling back to a name re-read only for any the response didn't surface.
 */
async function migrateBeastModes({
  beastModeChoices,
  columnMap,
  definitionsByItemKey,
  originId,
  selectedBeastModes,
  tabId,
  targetBeastModes,
  targetId
}) {
  const errors = [];
  const idRemap = {};
  const targetByName = new Map((targetBeastModes || []).map((b) => [b.name, b]));
  const applyRemap = hasEffectiveMapping(columnMap);
  const toCreate = [];
  const toUpdate = [];
  let succeeded = 0;

  // Fetch the current user's ID so we can set it as the owner on created Beast Modes.
  // The API rejects creates with owner set to another user.
  const currentUserId = await getCurrentUserId(tabId);
  if (!currentUserId) {
    return { errors: [{ error: 'Could not determine current user ID', id: 'all' }], idRemap: {}, succeeded: 0 };
  }

  const mapLegacyId = (origin, target) => {
    if (origin?.legacyId && target?.legacyId) idRemap[origin.legacyId] = target.legacyId;
  };

  // Classify each selected Beast Mode. keep/overwrite seed `idRemap` immediately
  // (their target ids are known), so dependent creates can reference them; the
  // actual overwrite writes are deferred until after creates so an overwrite that
  // references a freshly-created Beast Mode also resolves.
  for (const bm of selectedBeastModes) {
    try {
      const cached = definitionsByItemKey?.get?.(makeItemKey('beastModes', bm.id))?.definition;
      const template = cached || (await getFunctionTemplate(bm.id, tabId));
      const rewritten = applyRemap ? rewriteBeastModeColumns(template, columnMap) : template;
      const choice = beastModeChoices?.[bm.id] || {};
      const disposition = choice.disposition || 'create';

      if (disposition === 'keep') {
        const existing = targetByName.get(bm.name);
        if (existing) {
          mapLegacyId(bm, existing);
          succeeded++;
        } else {
          errors.push({ error: `No Beast Mode named "${bm.name}" on the target to keep`, id: bm.id });
        }
        continue;
      }

      if (disposition === 'overwrite') {
        const existing = targetByName.get(bm.name);
        if (!existing) {
          errors.push({ error: `No Beast Mode named "${bm.name}" on the target to overwrite`, id: bm.id });
          continue;
        }
        // Seed the remap now (the target Beast Mode already exists regardless of
        // whether the overwrite write succeeds); build the entry after creates.
        mapLegacyId(bm, existing);
        toUpdate.push({ name: bm.name, origin: bm, target: existing, template: rewritten });
        continue;
      }

      // create (default) or rename
      const name = disposition === 'rename' && choice.newName ? choice.newName : bm.name;
      toCreate.push({ name, origin: bm, template: rewritten });
    } catch (err) {
      errors.push({ error: err?.message || String(err), id: bm.id });
    }
  }

  // Create in dependency-ordered waves, extending `idRemap` after each wave.
  if (toCreate.length > 0) {
    const waves = orderBeastModeCreateWaves(toCreate);
    const unresolved = [];
    for (const wave of waves) {
      const entries = wave.map((c) => {
        const entry = buildBeastModeEntry(c.template, { currentUserId, idRemap, name: c.name, originId, targetId });
        delete entry.id;
        delete entry.legacyId;
        return entry;
      });
      let response;
      try {
        response = await createDatasetFunctions({ functions: entries, tabId });
      } catch (err) {
        for (const c of wave) errors.push({ error: err?.message || String(err), id: c.origin.id });
        continue;
      }
      // Prefer the order-preserving bulk response (collision-safe for duplicate
      // names); anything it doesn't surface falls through to a name re-read.
      const created = extractCreatedFunctions(response);
      for (let i = 0; i < wave.length; i++) {
        const c = wave[i];
        const newLegacyId = getEntryLegacyId(created[i]);
        if (newLegacyId && c.origin?.legacyId) {
          idRemap[c.origin.legacyId] = newLegacyId;
          succeeded++;
        } else {
          unresolved.push(c);
        }
      }
    }

    if (unresolved.length > 0) {
      try {
        const refreshed = await getDatasetFunctions(targetId, tabId);
        const refByName = new Map(refreshed.map((b) => [b.name, b]));
        for (const c of unresolved) {
          const found = refByName.get(c.name);
          if (found) {
            mapLegacyId(c.origin, found);
            succeeded++;
          } else {
            errors.push({ error: `Created Beast Mode "${c.name}" not found on the target`, id: c.origin.id });
          }
        }
      } catch (err) {
        for (const c of unresolved) errors.push({ error: err?.message || String(err), id: c.origin.id });
      }
    }
  }

  // Overwrites run last so their references to freshly-created Beast Modes
  // resolve through the now-complete `idRemap`.
  if (toUpdate.length > 0) {
    const entries = toUpdate.map((u) => {
      const entry = buildBeastModeEntry(u.template, { currentUserId, idRemap, name: u.name, originId, targetId });
      entry.id = u.target.id;
      entry.legacyId = u.target.legacyId;
      return entry;
    });
    try {
      await updateDatasetFunctions({ functions: entries, tabId });
      // idRemap was already seeded for overwrites during classification.
      succeeded += toUpdate.length;
    } catch (err) {
      for (const u of toUpdate) errors.push({ error: err?.message || String(err), id: u.origin.id });
    }
  }

  return { errors, idRemap, succeeded };
}

/**
 * Split Beast Mode create records into dependency-ordered waves so a nested
 * Beast Mode is always created AFTER the ones it references. Dependency `B → A`
 * is detected when B's (column-rewritten) template embeds A's origin
 * `legacyId` (`calculation_<uuid>`) — a collision-safe token, mirroring the
 * card-swap reference sweep. Waves are emitted via Kahn's algorithm: each wave
 * is the set of records whose dependencies have all been emitted. A dependency
 * cycle (which Domo itself forbids for Beast Modes) can't drain to empty, so the
 * remaining records are emitted as one final wave in their original order and
 * the existing per-create error path reports any that then fail.
 *
 * @param {Array<{name: string, origin: {id: any, legacyId?: string}, template: Object}>} createRecords
 * @returns {Array<Array<{name: string, origin: Object, template: Object}>>}
 */
function orderBeastModeCreateWaves(createRecords) {
  const n = createRecords.length;
  const tokens = createRecords.map((r) => r.origin?.legacyId || null);
  const serialized = createRecords.map((r) => JSON.stringify(r.template));
  // deps[i] = set of indices record i depends on (references).
  const deps = createRecords.map(() => new Set());
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      if (tokens[j] && serialized[i].includes(tokens[j])) deps[i].add(j);
    }
  }

  const remaining = new Set(Array.from({ length: n }, (_, i) => i));
  const emitted = new Set();
  const waves = [];
  while (remaining.size > 0) {
    const wave = [];
    for (const i of remaining) {
      let ready = true;
      for (const d of deps[i]) {
        if (!emitted.has(d)) {
          ready = false;
          break;
        }
      }
      if (ready) wave.push(i);
    }
    if (wave.length === 0) {
      // Cycle (or self-reference) — emit the rest in original order and let the
      // create path surface any failure.
      waves.push(
        Array.from(remaining)
          .sort((a, b) => a - b)
          .map((i) => createRecords[i])
      );
      break;
    }
    for (const i of wave) {
      remaining.delete(i);
      emitted.add(i);
    }
    waves.push(wave.map((i) => createRecords[i]));
  }
  return waves;
}

/** Set the auditable version-history comment on the dataflow's new version. */
function setDataflowVersionDescription(definition, originName, targetName, count) {
  if (!definition || typeof definition !== 'object') return;
  const description = buildDataflowVersionDescription(originName, targetName, count);
  definition.onboardFlowVersion = { ...(definition.onboardFlowVersion || {}), description };
}
