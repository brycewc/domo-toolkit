/**
 * Migrate downstream content (cards, dataset views, dataflows) from one
 * dataset to another. Adapted from a standalone CLI tool — the recursive
 * dataset-view swap helpers are ported verbatim because they are the only
 * reliable way to handle joins, set operations, column references, and
 * formattedExpression rewrites in dataset-view definitions.
 */

import { executeInPage } from '@/utils';

import { getCardDefinition } from './cards';
import { makeItemKey } from './columnReferences';
import {
  hasEffectiveMapping,
  rewriteCardColumns,
  rewriteDataflowColumns,
  rewriteDatasetViewColumns
} from './columnRewriter';

// ===========================================================================
// DISCOVERY
// ===========================================================================

/**
 * Cards that have this dataset as their primary datasource.
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getDownstreamCards(datasetId, tabId = null) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/content/v1/datasources/${datasetId}/cards`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch cards for dataset ${datasetId}: HTTP ${response.status}`);
      }
      const cards = (await response.json()) || [];
      return cards
        .map((c) => ({
          id:
            c.id ||
            c.kpiId ||
            (typeof c.urn === 'string' ? parseInt(c.urn.split(':').pop(), 10) : null),
          name: c.title || c.name || `Card ${c.id || c.kpiId || ''}`
        }))
        .filter((c) => Number.isFinite(c.id));
    },
    [datasetId],
    tabId
  );
}

/**
 * Fetch downstream cards, dataset views, and dataflows that consume this
 * dataset as an input. Cards come from the dataset → cards endpoint.
 * Dataset views and dataflows come from the lineage API (downstream only).
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<{ cards: any[], dataflows: any[], datasetViews: any[] }>}
 */
export async function getDownstreamContent(datasetId, tabId = null) {
  const [cards, lineage] = await Promise.all([
    getDownstreamCards(datasetId, tabId),
    getDownstreamLineage(datasetId, tabId)
  ]);
  return {
    cards,
    dataflows: lineage.dataflows,
    datasetViews: lineage.datasetViews
  };
}

/**
 * Walk the lineage graph downstream from this dataset. Returns separate
 * arrays for derived dataset views and dataflows that take this dataset as
 * an input. We post-filter dataset-view candidates by re-fetching the
 * dataset metadata (`isViewType`) because the lineage payload doesn't always
 * differentiate views from regular datasets.
 *
 * @param {string} datasetId
 * @param {number|null} tabId
 * @returns {Promise<{ datasetViews: Array<{id: string, name: string}>, dataflows: Array<{id: any, name: string}> }>}
 */
export async function getDownstreamLineage(datasetId, tabId = null) {
  return executeInPage(
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
          const entry = lineage[`DATAFLOW${child.id}`];
          dataflows.push({
            id: child.id,
            name: entry?.name || child.name || `Dataflow ${child.id}`
          });
        }
      }

      // Filter the downstream DATA_SOURCE children to only views — bulk fetch
      // their metadata and check dataProviderType / displayType. Views typically
      // surface as 'dataset-view' or 'datafusion'.
      let datasetViews = [];
      if (datasetIds.length > 0) {
        const bulkResponse = await fetch(
          '/api/data/v3/datasources/bulk?includePrivate=true&part=core',
          {
            body: JSON.stringify(datasetIds),
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (bulkResponse.ok) {
          const bulk = await bulkResponse.json();
          for (const ds of bulk.dataSources || []) {
            const provider = ds.dataProviderType || ds.displayType || ds.type;
            if (provider === 'dataset-view' || provider === 'datafusion') {
              datasetViews.push({ id: ds.id, name: ds.name || `Dataset View ${ds.id}` });
            }
          }
        } else {
          // Bulk failed — surface every downstream DATA_SOURCE; user can deselect.
          datasetViews = datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
        }
      }

      return { dataflows, datasetViews };
    },
    [datasetId],
    tabId
  );
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

      const [originCols, targetCols] = await Promise.all([
        fetchSchema(originId),
        fetchSchema(targetId)
      ]);
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
      const totalCount =
        typeof data.totalResultCount === 'number' ? data.totalResultCount : null;
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
  cachedDefinition,
  cardId,
  columnMap,
  originId,
  tabId = null,
  targetId,
  useFullPath = false
}) {
  if (!useFullPath && !hasEffectiveMapping(columnMap)) {
    return swapCardInputFast(cardId, originId, targetId, tabId);
  }
  try {
    const definition = cachedDefinition || (await getCardDefinition({ cardId, tabId }));
    let rewritten = hasEffectiveMapping(columnMap)
      ? rewriteCardColumns(definition, columnMap)
      : JSON.parse(JSON.stringify(definition));
    if (Array.isArray(rewritten.columns)) {
      for (const col of rewritten.columns) {
        if (col.sourceId === originId) col.sourceId = targetId;
      }
    }
    rewritten = JSON.parse(JSON.stringify(rewritten).replaceAll(originId, targetId));
    return await putCardForMigration(cardId, rewritten, tabId);
  } catch (err) {
    console.error('[swapCardInput] full-path failed:', err);
    return { error: err?.message || String(err), success: false };
  }
}

/**
 * Swap a dataflow's input dataset, optionally rewriting column references.
 *
 * Column rewrites are applied in the extension context (via `columnRewriter`)
 * BEFORE we hand the payload to the page for the dataset-id sweep + PUT. The
 * dataset-id sweep is left as a JSON-string replacement because dataflow IDs
 * are UUIDs (collision-safe).
 *
 * @param {Object} params
 * @param {any} params.dataflowId
 * @param {string} params.originId
 * @param {string} params.targetId
 * @param {Record<string, string|null>} [params.columnMap]
 * @param {Object} [params.cachedDefinition]
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapDataflowInput({
  cachedDefinition,
  columnMap,
  dataflowId,
  originId,
  tabId = null,
  targetId
}) {
  try {
    let definition = cachedDefinition;
    if (!definition) {
      definition = await fetchDataflowDefinitionInPage(dataflowId, tabId);
    }
    if (hasEffectiveMapping(columnMap)) {
      definition = rewriteDataflowColumns(definition, columnMap);
    }
    return await putDataflowInPage(dataflowId, definition, originId, targetId, tabId);
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
      definition = rewriteDatasetViewColumns(
        definition,
        columnMap,
        originId,
        targetColumnTypes
      );
    }
    return await putDatasetViewInPage(viewId, definition, originId, targetId, tabId);
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
async function putCardForMigration(cardId, definition, tabId) {
  const datasetId = definition?.columns?.[0]?.sourceId;

  // Strip internal-only fields the v3 PUT endpoint doesn't accept.
  delete definition.id;
  delete definition.urn;
  delete definition.columns;
  delete definition.drillpath;
  delete definition.embedded;
  delete definition.dataSourceWrite;

  definition.dataProvider = { dataSourceId: datasetId || null };
  definition.variables = true;

  const allFormulas = Array.isArray(definition?.definition?.formulas)
    ? definition.definition.formulas
    : [];
  definition.definition.formulas = {
    card: allFormulas.filter((f) => f && f.persistedOnDataSource === false),
    dsDeleted: [],
    // Persisted formulas keep their flag intact and ride in dsUpdated. Domo
    // applies these as updates to formulas on the card's CURRENT dataset
    // (which is now the target after our dataset-id swap), with our
    // already-rewritten formula text — preventing Domo's auto-migrate-from-
    // origin behavior from clobbering our rewrites.
    dsUpdated: allFormulas.filter((f) => f && f.persistedOnDataSource === true)
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

  return executeInPage(
    async (cardId, definition) => {
      try {
        const response = await fetch(`/api/content/v3/cards/kpi/${cardId}`, {
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
    [cardId, definition],
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

async function putDatasetViewInPage(viewId, viewDefinition, originId, targetId, tabId) {
  return executeInPage(
    async (viewId, viewDefinition, originId, targetId) => {
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
          const replaceId = (value) =>
            typeof value !== 'string' ? value : value.replaceAll(oldStr, newStr);
          Object.values(viewTemplate.fromItemInfo).forEach((section) => {
            if (!section?.columnInfo) return;
            Object.values(section.columnInfo).forEach((col) => {
              if (col.formattedExpression)
                col.formattedExpression = replaceId(col.formattedExpression);
            });
          });
        };

        const payload = JSON.parse(JSON.stringify(viewDefinition));
        swapDatasetRecursive(payload.viewTemplate?.select?.selectBody, originId, targetId);
        updateColumnReferences(payload, originId, targetId);
        updateMappingExpressions(payload.viewTemplate, originId, targetId);
        const cleaned = JSON.parse(JSON.stringify(payload).replaceAll(originId, targetId));
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
    [viewId, viewDefinition, originId, targetId],
    tabId
  );
}

async function swapCardInputFast(cardId, originId, targetId, tabId) {
  return executeInPage(
    async (cardId, originId, targetId) => {
      try {
        const response = await fetch(
          `/api/content/v1/cards/${cardId}/datasource/${targetId}?currentDsId=${originId}`,
          {
            body: '{}',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          }
        );
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
 * Type registry for the migration view. Sorted by the order we want them rendered.
 */
export const MIGRATE_TYPES = [
  { key: 'cards', label: 'Cards' },
  { key: 'datasetViews', label: 'Dataset Views' },
  { key: 'dataflows', label: 'Dataflows' }
];

/**
 * Migrate every selected item from `originId` to `targetId`. Calls
 * `onProgress` per type with `{typeKey, status, count, result}` so the
 * view can drive its DataList rows the same way OwnershipView does.
 *
 * @param {Object} params
 * @param {string} params.originId
 * @param {string} params.targetId
 * @param {{ cards: Array<{id: any, name?: string}>, datasetViews: Array<{id: string, name?: string}>, dataflows: Array<{id: any, name?: string}> }} params.selectedItems
 * @param {Record<string, string|null>} [params.columnMap] - Origin → target column-name map. Null targets and no-op entries are skipped.
 * @param {Map<string, { definition: Object }>} [params.definitionsByItemKey] - Cached content definitions from the column-reference scan, keyed by `${typeKey}:${itemId}`. Reused so we don't re-fetch.
 * @param {Function} [params.onProgress]
 * @param {number|null} [params.tabId]
 * @returns {Promise<Map<string, {attempted: Array, count: number, errors: Array, failed: number, succeeded: number}>>}
 */
export async function migrateAllDownstreamContent({
  columnMap,
  definitionsByItemKey,
  onProgress,
  originId,
  selectedItems,
  tabId,
  targetColumnTypes,
  targetId,
  useFullPath = false
}) {
  const results = new Map();

  await Promise.allSettled(
    MIGRATE_TYPES.map(async (type) => {
      const items = selectedItems?.[type.key] || [];
      const attempted = items.map((i) => ({ id: i.id, name: i.name || String(i.id) }));

      if (items.length === 0) {
        const result = { attempted: [], count: 0, errors: [], failed: 0, succeeded: 0 };
        results.set(type.key, result);
        onProgress?.({ count: 0, result, status: 'done', typeKey: type.key });
        return;
      }

      onProgress?.({ count: items.length, status: 'transferring', typeKey: type.key });

      const errors = [];
      let succeeded = 0;
      for (const item of items) {
        const cached = definitionsByItemKey?.get?.(makeItemKey(type.key, item.id))?.definition;
        const resp = await dispatchSwap(type.key, item, {
          cachedDefinition: cached,
          columnMap,
          originId,
          tabId,
          targetColumnTypes,
          targetId,
          useFullPath
        });
        if (resp?.success) {
          succeeded++;
        } else {
          errors.push({ error: resp?.error || 'Unknown error', id: item.id });
        }
      }

      const result = {
        attempted,
        count: items.length,
        errors,
        failed: errors.length,
        succeeded
      };
      results.set(type.key, result);
      onProgress?.({ count: items.length, result, status: 'done', typeKey: type.key });
    })
  );

  return results;
}

async function dispatchSwap(typeKey, item, options) {
  if (typeKey === 'cards') {
    return swapCardInput({
      cachedDefinition: options.cachedDefinition,
      cardId: item.id,
      columnMap: options.columnMap,
      originId: options.originId,
      tabId: options.tabId,
      targetId: options.targetId,
      useFullPath: options.useFullPath
    });
  }
  if (typeKey === 'datasetViews') {
    return swapDatasetViewInput({
      cachedDefinition: options.cachedDefinition,
      columnMap: options.columnMap,
      originId: options.originId,
      tabId: options.tabId,
      targetColumnTypes: options.targetColumnTypes,
      targetId: options.targetId,
      viewId: item.id
    });
  }
  if (typeKey === 'dataflows') {
    return swapDataflowInput({
      cachedDefinition: options.cachedDefinition,
      columnMap: options.columnMap,
      dataflowId: item.id,
      originId: options.originId,
      tabId: options.tabId,
      targetId: options.targetId
    });
  }
  return { error: `Unknown migrate type ${typeKey}`, success: false };
}
