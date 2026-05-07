/**
 * Migrate downstream content (cards, dataset views, dataflows) from one
 * dataset to another. Adapted from a standalone CLI tool — the recursive
 * dataset-view swap helpers are ported verbatim because they are the only
 * reliable way to handle joins, set operations, column references, and
 * formattedExpression rewrites in dataset-view definitions.
 */

import { executeInPage } from '@/utils';

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

      const datasetIds = [];
      const dataflows = [];
      for (const child of directChildren) {
        if (!child) continue;
        if (child.type === 'DATA_SOURCE') {
          datasetIds.push(String(child.id));
        } else if (child.type === 'DATAFLOW') {
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
      const response = await fetch('/api/search/v1/query', {
        body: JSON.stringify({
          combineResults: false,
          count: limit,
          entityList: [['dataset']],
          facetValuesToInclude: [],
          filters: [],
          offset,
          query: text || '*',
          sort: { fieldSorts: [{ field: '_score', sortOrder: 'DESC' }] }
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to search datasets: HTTP ${response.status}`);
      }
      const data = await response.json();
      const beans = data.searchObjects || data.results || [];
      const datasets = beans.map((b) => ({
        dataProviderType: b.dataProviderType || b.displayType || null,
        id: b.databaseId || b.entityId || b.id,
        name: b.name || b.displayName || `Dataset ${b.databaseId || b.entityId || b.id}`,
        owner: b.ownerName || b.owner_name || b.owner || null
      }));
      const totalCount =
        typeof data.totalResultCount === 'number'
          ? data.totalResultCount
          : typeof data.count === 'number'
            ? data.count
            : null;
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
 * @param {number} cardId
 * @param {string} originId
 * @param {string} targetId
 * @param {number|null} tabId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapCardInput(cardId, originId, targetId, tabId = null) {
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

/**
 * @param {any} dataflowId
 * @param {string} originId
 * @param {string} targetId
 * @param {number|null} tabId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapDataflowInput(dataflowId, originId, targetId, tabId = null) {
  return executeInPage(
    async (dataflowId, originId, targetId) => {
      try {
        const getResponse = await fetch(
          `/api/dataprocessing/v2/dataflows/${dataflowId}?hydrationState=VISUALIZATION&validationType=SAVE`,
          { credentials: 'include' }
        );
        if (!getResponse.ok) {
          return { error: `GET dataflow HTTP ${getResponse.status}`, success: false };
        }
        const dataflowDefinition = await getResponse.json();
        const updated = JSON.parse(
          JSON.stringify(dataflowDefinition).replaceAll(originId, targetId)
        );

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
    [dataflowId, originId, targetId],
    tabId
  );
}

/**
 * @param {string} viewId
 * @param {string} originId
 * @param {string} targetId
 * @param {number|null} tabId
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function swapDatasetViewInput(viewId, originId, targetId, tabId = null) {
  return executeInPage(
    async (viewId, originId, targetId) => {
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
              if (col.formattedExpression) col.formattedExpression = replaceId(col.formattedExpression);
            });
          });
        };

        const getResponse = await fetch(
          `/api/query/v1/datasources/${viewId}/schema/indexed`,
          { credentials: 'include' }
        );
        if (!getResponse.ok) {
          return { error: `GET schema HTTP ${getResponse.status}`, success: false };
        }
        const viewDefinition = await getResponse.json();

        const payload = JSON.parse(JSON.stringify(viewDefinition));
        swapDatasetRecursive(payload.viewTemplate?.select?.selectBody, originId, targetId);
        updateColumnReferences(payload, originId, targetId);
        updateMappingExpressions(payload.viewTemplate, originId, targetId);
        // Final sweep — catches anywhere else the old ID may still appear.
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
    [viewId, originId, targetId],
    tabId
  );
}

// ===========================================================================
// ORCHESTRATOR
// ===========================================================================

/**
 * Type registry for the migration view. Each entry knows how to discover
 * candidates (driven by the view's parallel fetches) and how to swap a
 * single item's input dataset. Sorted by the order we want them rendered.
 */
export const MIGRATE_TYPES = [
  {
    key: 'cards',
    label: 'Cards',
    swap: swapCardInput
  },
  {
    key: 'datasetViews',
    label: 'Dataset Views',
    swap: swapDatasetViewInput
  },
  {
    key: 'dataflows',
    label: 'Dataflows',
    swap: swapDataflowInput
  }
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
 * @param {Function} [params.onProgress]
 * @param {number|null} [params.tabId]
 * @returns {Promise<Map<string, {attempted: Array, count: number, errors: Array, failed: number, succeeded: number}>>}
 */
export async function migrateAllDownstreamContent({
  onProgress,
  originId,
  selectedItems,
  tabId,
  targetId
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
        const resp = await type.swap(item.id, originId, targetId, tabId);
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
