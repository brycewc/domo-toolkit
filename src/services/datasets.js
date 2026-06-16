import { getObjectType } from '@/models/DomoObjectType';
import { executeInPage } from '@/utils/executeInPage';

import { getJupyterWorkspaceDatasets } from './jupyterWorkspaces';
import { getUserName } from './users';

const DATASETS_PAGE_SIZE = 50;

export async function cancelStreamExecution({ executionId, streamId, tabId }) {
  return executeInPage(
    async (streamId, executionId) => {
      const response = await fetch(`/api/data/v1/streams/${streamId}/executions/${executionId}/abort`, {
        body: JSON.stringify({ category: 'CONNECTOR', message: 'Cancelled via Domo Toolkit' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) {
        throw new Error(`Failed to abort execution ${executionId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [streamId, executionId],
    tabId
  );
}

/**
 * Permanently delete a dataset.
 * @param {Object} params
 * @param {string} params.datasetId - The datasource ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteDataset({ datasetId, tabId = null }) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/data/v3/datasources/${datasetId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [datasetId],
    tabId
  );
}

/**
 * Get full details for the datasets fed by an account.
 *
 * Takes the lightweight id+name list attached to the account during detection
 * (the account-datasets endpoint returns only ids and names, everything else
 * null) and bulk-fetches the complete dataset records so the related-data tab
 * can show real owners, row counts, types, etc.
 *
 * @param {Object} params - Parameters
 * @param {Array<{dataSourceId: string}>} params.datasets - Light dataset list from detection
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of full dataset objects (empty if none)
 */
export async function getAccountDatasetDetails({ datasets, tabId }) {
  const datasetIds = (datasets || []).map((ds) => ds.dataSourceId).filter(Boolean);
  if (datasetIds.length === 0) return [];

  return executeInPage(
    async (datasetIds) => {
      const response = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true', {
        body: JSON.stringify(datasetIds),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset details. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data.dataSources || [];
    },
    [datasetIds],
    tabId
  );
}

/**
 * Get the conditional-format ("color") rules for a dataset.
 * @param {string} datasetId - The dataset UUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of rule objects (empty if none)
 */
export async function getColorRules(datasetId, tabId = null) {
  return executeInPage(
    async (id) => {
      const response = await fetch('/api/content/v1/datasources/conditionalFormats', {
        body: JSON.stringify([id]),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch color rules. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data?.[id] || [];
    },
    [datasetId],
    tabId
  );
}

/**
 * Get a dataset's Beast Mode (calculated column) definitions.
 * Each value is keyed by its `calculation_<uuid>` id and includes at least a
 * `name`. Used by the Copy Color Rules view to remap rule references between
 * datasets — beast mode ids are not stable across datasets, but names usually are.
 * @param {string} datasetId - The dataset UUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Map of `calculation_<uuid>` to `{name, ...}` (empty if none)
 */
export async function getDatasetBeastModes(datasetId, tabId = null) {
  return executeInPage(
    async (id) => {
      const response = await fetch(`/api/data/v3/datasources/${id}?includeAllDetails=true`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset definition. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data?.properties?.formulas?.formulas || {};
    },
    [datasetId],
    tabId
  );
}

/**
 * Get a dataset's column schema (id, name, type, etc. per column)
 * @param {Object} params - Parameters
 * @param {string} params.datasetId - The dataset UUID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of column descriptors
 */
export async function getDatasetColumns({ datasetId, tabId }) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/query/v1/datasources/${datasetId}/schema/indexed`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch schema: HTTP ${response.status}`);
      }
      const schema = await response.json();
      return schema.tables?.[0]?.columns || [];
    },
    [datasetId],
    tabId
  );
}

/**
 * Count the objects downstream of a dataset, used to decide whether deleting it
 * is safe. Reads Domo's precomputed impact endpoint, which already rolls up the
 * full downstream blast radius, and sums the impact counts (every dataflow,
 * dataset, card, and alert that ultimately depends on this dataset). The
 * `impact*` fields are the transitive totals; the unprefixed counts are direct
 * children only.
 * @param {Object} params
 * @param {string} params.datasetId - The datasource ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<number>} Total downstream impact (dataflows + datasets + cards + alerts)
 */
export async function getDatasetDependentCount({ datasetId, tabId = null }) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/data/v1/impacts/DATA_SOURCE/${datasetId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const impact = await response.json();
      return (
        (impact.impactCardCount || 0) +
        (impact.impactDataFlowCount || 0) +
        (impact.impactDataSourceCount || 0) +
        (impact.impactAlertCount || 0)
      );
    },
    [datasetId],
    tabId
  );
}

/**
 * Get a preview of a dataset's data (first N rows)
 * @param {string} datasetId - The dataset UUID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @param {number} [limit=100] - Max rows to return
 * @returns {Promise<{headers: string[], rows: Array[]}>}
 */
export async function getDatasetPreview(datasetId, tabId = null, limit = 100) {
  const columns = await getDatasetColumns({ datasetId, tabId });
  const headers = columns.map((col) => col.name);

  const rows = await executeInPage(
    async (datasetId, columns, limit) => {
      const response = await fetch(`/api/query/v1/execute/${datasetId}`, {
        body: JSON.stringify({
          context: {
            calendar: 'StandardCalendar',
            features: {
              AllowNullValues: true,
              TreatNumbersAsStrings: true
            }
          },
          query: {
            columns: columns.map((col) => ({ column: col.id, exprType: 'COLUMN' })),
            groupByColumns: [],
            having: null,
            limit: { limit, offset: 0 },
            orderByColumns: [],
            where: null
          },
          querySource: 'data_table',
          useCache: true
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch preview: HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.rows || [];
    },
    [datasetId, columns, limit],
    tabId
  );

  return { headers, rows };
}

/**
 * Get the datasets fed by a connector account.
 * @param {Object} params - Parameters
 * @param {string|number} params.accountId - The account ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of dataset objects (each keyed by dataSourceId/dataSourceName)
 */
export async function getDatasetsForAccount({ accountId, tabId }) {
  return executeInPage(
    async (accountId) => {
      const response = await fetch(`/api/data/v2/datasources/account/${accountId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets for account ${accountId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [accountId],
    tabId
  );
}

/**
 * Get all datasets for a data app or worksheet
 * @param {Object} params - Parameters
 * @param {string|number} params.appId - The data app or worksheet ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForApp({ appId, tabId }) {
  const fetchLogic = async (appId) => {
    const response = await fetch(`/api/content/v1/dataapps/${appId}/dataSources`);

    if (!response.ok) {
      throw new Error(`Failed to fetch datasets for app ${appId}. HTTP status: ${response.status}`);
    }

    return response.json();
  };

  try {
    return await executeInPage(fetchLogic, [appId], tabId);
  } catch (error) {
    console.error('[getDatasetsForApp] Error:', error);
    throw error;
  }
}

/**
 * Get datasets from a dataflow's inputs and outputs
 * @param {Object} params - Parameters
 * @param {Object} params.details - The dataflow metadata.details object
 * @returns {{inputs: Array<{id: string, name: string}>, outputs: Array<{id: string, name: string}>}}
 */
export function getDatasetsForDataflow({ details }) {
  const inputs = (details?.inputs || []).map((input) => ({
    id: input.dataSourceId,
    name: input.dataSourceName || `Dataset ${input.dataSourceId}`
  }));

  const outputs = (details?.outputs || []).map((output) => ({
    id: output.dataSourceId,
    name: output.dataSourceName || `Dataset ${output.dataSourceId}`
  }));

  return { inputs, outputs };
}

/**
 * Get datasets from a Jupyter workspace's input and output configuration.
 * Mirrors `getDatasetsForDataflow`'s `{ inputs, outputs }` shape so the view can
 * render both the same way, but the workspace stores dataset references as
 * id-only configuration entries, so each side is enriched with the dataset's
 * core details (name, owner, etc.) before being returned.
 * @param {Object} params - Parameters
 * @param {Object} params.details - The workspace metadata.details object
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{inputs: Array<Object>, outputs: Array<Object>}>}
 */
export async function getDatasetsForJupyterWorkspace({ details, tabId }) {
  const [inputs, outputs] = await Promise.all([
    getJupyterWorkspaceDatasets({ entries: details?.inputConfiguration, tabId }),
    getJupyterWorkspaceDatasets({ entries: details?.outputConfiguration, tabId })
  ]);
  return { inputs, outputs };
}

/**
 * Get datasets used by a page or app studio view
 * @param {Object} params - Parameters
 * @param {string|number} params.pageId - The page ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForPage({ pageId, tabId }) {
  const fetchLogic = async (pageId) => {
    console.log('[getDatasetsForPage] Fetching datasets for page:', pageId);
    const response = await fetch(`/api/content/v1/datasources/pages/${pageId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch datasets for page ${pageId}. HTTP status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[getDatasetsForPage] API response:', data);
    const result = data.dataSources || [];
    console.log('[getDatasetsForPage] Returning datasets:', result);
    return result;
  };

  try {
    const result = await executeInPage(fetchLogic, [pageId], tabId);
    console.log('[getDatasetsForPage] executeInPage result:', result);
    return result;
  } catch (error) {
    console.error('[getDatasetsForPage] Error:', error);
    throw error;
  }
}

/**
 * Get datasets used by a dataset view (dataset-view or datafusion)
 * @param {Object} params - Parameters
 * @param {string|number} params.datasetId - The datasource ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForView({ datasetId, tabId }) {
  const fetchLogic = async (datasetId) => {
    // 1) Get the schema to extract dataset IDs
    const schemaResponse = await fetch(`/api/query/v1/datasources/${datasetId}/schema/indexed?includeHidden=true`);

    if (!schemaResponse.ok) {
      throw new Error(`Failed to fetch schema for datasource ${datasetId}. HTTP status: ${schemaResponse.status}`);
    }

    const schema = await schemaResponse.json();

    // 2) Extract dataset IDs from schema
    const idsSet = new Set();
    const stripTicks = (s) => (typeof s === 'string' ? s.replace(/`/g, '') : s);

    // Handle DataFusion schema structure (has 'views' array)
    if (schema.views && Array.isArray(schema.views)) {
      for (const view of schema.views) {
        // Extract from 'from' field
        if (view.from) {
          idsSet.add(stripTicks(view.from));
        }
        // Extract from columnFuses datasource references
        if (view.columnFuses && Array.isArray(view.columnFuses)) {
          for (const fuse of view.columnFuses) {
            if (fuse.datasource) {
              idsSet.add(stripTicks(fuse.datasource));
            }
          }
        }
      }
    } else if (schema.select && schema.select.selectBody) {
      // Handle SQL schema structure (has 'select' object)
      const sel = schema.select.selectBody;
      if (sel.fromItem && sel.fromItem.name) {
        idsSet.add(stripTicks(sel.fromItem.name));
      }
      if (Array.isArray(sel.joins)) {
        for (const j of sel.joins) {
          if (!j) continue;
          const name = j.left === false ? j.leftItem && j.leftItem.name : j.rightItem && j.rightItem.name;
          if (name) idsSet.add(stripTicks(name));
        }
      }
    }
    const datasetIds = Array.from(idsSet).filter(Boolean);

    if (datasetIds.length === 0) {
      return [];
    }

    // 3) Get names for all datasets using bulk endpoint
    const bulkResponse = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true', {
      body: JSON.stringify(datasetIds),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });

    if (!bulkResponse.ok) {
      // If bulk fails, return IDs without names
      console.warn('Bulk datasource fetch failed, returning IDs only');
      return datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
    }

    const namesResponse = await bulkResponse.json();
    const namesData = namesResponse.dataSources || [];
    const byId = Object.fromEntries(namesData.map((d) => [d.id || d.datasetId, d]));
    const ordered = datasetIds.map((id) => byId[id]).filter(Boolean);
    // console.log('[getDatasetsForView] ordered:', ordered);
    return ordered;
  };

  try {
    return await executeInPage(fetchLogic, [datasetId], tabId);
  } catch (error) {
    console.error('Error fetching datasets for view:', error);
    throw error;
  }
}

/**
 * Get dependent datasets for a dataset via the lineage API
 * @param {Object} params - Parameters
 * @param {string} params.datasetId - The datasource ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of dataset objects with details
 */
export async function getDependentDatasets({ datasetId, tabId }) {
  const fetchLogic = async (datasetId) => {
    const lineageResponse = await fetch(
      `/api/data/v1/lineage/DATA_SOURCE/${datasetId}?traverseUp=false&requestEntities=DATA_SOURCE`
    );

    if (!lineageResponse.ok) {
      throw new Error(`Failed to fetch lineage for dataset ${datasetId}. HTTP status: ${lineageResponse.status}`);
    }

    const lineageData = await lineageResponse.json();

    const datasetIds = Object.values(lineageData)
      .filter((entry) => entry.type === 'DATA_SOURCE' && entry.id !== datasetId)
      .map((entry) => entry.id);

    if (datasetIds.length === 0) return [];

    const bulkResponse = await fetch(
      '/api/data/v3/datasources/bulk?includePrivate=true&part=core,impactcounts&includeFormulas=false',
      {
        body: JSON.stringify(datasetIds),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }
    );

    if (!bulkResponse.ok) {
      console.warn('Bulk datasource fetch failed, returning IDs only');
      return datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
    }

    const bulkData = await bulkResponse.json();
    const datasources = bulkData.dataSources || [];
    const byId = Object.fromEntries(datasources.map((d) => [d.id, d]));
    return datasetIds.map((id) => byId[id]).filter(Boolean);
  };

  try {
    return await executeInPage(fetchLogic, [datasetId], tabId);
  } catch (error) {
    console.error('Error fetching dependent datasets:', error);
    throw error;
  }
}

/**
 * Get all datasets owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedDatasets(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const response = await fetch('/api/data/ui/v3/datasources/ownedBy', {
        body: JSON.stringify([{ id: userId.toString(), type: 'USER' }]),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const ids = data && data.length > 0 && data[0].dataSourceIds ? data[0].dataSourceIds : [];
      if (ids.length === 0) return [];

      // Fetch names in bulk (max 100 per request)
      const batchSize = 100;
      const byId = {};
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        try {
          const bulkResponse = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&part=core', {
            body: JSON.stringify(chunk),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (bulkResponse.ok) {
            const bulk = await bulkResponse.json();
            for (const d of bulk.dataSources || []) {
              byId[d.id] = d.name || d.id;
            }
          }
        } catch {
          // Skip failed batch — IDs will fall back to ID-as-name below
        }
      }
      return ids.map((id) => ({ id, name: byId[id] || id }));
    },
    [userId],
    tabId
  );
}

export async function getProviders() {
  return executeInPage(async () => {
    const res = await fetch('/api/data/v1/providers');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);
}

/**
 * Get a single stream execution's detailed data
 * @param {Object} params - Parameters
 * @param {string|number} params.streamId - The stream ID
 * @param {string|number} params.executionId - The execution ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Execution object with detailed error data
 */
export async function getStreamExecution({ executionId, streamId, tabId }) {
  return executeInPage(
    async (streamId, executionId) => {
      const response = await fetch(`/api/data/v1/streams/${streamId}/executions/${executionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch execution ${executionId} for stream ${streamId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [streamId, executionId],
    tabId
  );
}

export async function getStreamExecutions({ limit = 100, streamId, tabId }) {
  const result = await executeInPage(
    async (streamId, limit) => {
      const stateResponse = await fetch(`/api/data/v1/streams/state/${streamId}`);
      if (!stateResponse.ok) {
        throw new Error(`Failed to fetch stream state for stream ${streamId}. HTTP status: ${stateResponse.status}`);
      }
      const stateData = await stateResponse.json();
      const offset = stateData[0].executionId < limit ? 0 : stateData[0].executionId - limit;

      const response = await fetch(`/api/data/v1/streams/${streamId}/executions?limit=${limit}&offset=${offset}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stream executions for stream ${streamId}. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    },
    [streamId, limit],
    tabId
  );
  return result;
}

/**
 * Check if a DATA_SOURCE is a view type (dataset-view or datafusion)
 * @param {Object} details - The metadata.details object
 * @returns {boolean}
 */
export function isViewType(details) {
  if (!details) return false;
  const viewTypes = ['dataset-view', 'datafusion'];
  return (
    viewTypes.includes(details.dataProviderType) ||
    viewTypes.includes(details.displayType) ||
    viewTypes.includes(details.type)
  );
}

/**
 * Search datasets by name (paginated) or look up a single dataset by ID.
 *
 * Mirrors the signature of `searchUsers` so consumers like DatasetComboBox can
 * stay structurally identical to UserComboBox. When `text` parses as a
 * DATA_SOURCE UUID the call swaps in a `databaseId` term filter so the result
 * collapses to that single dataset; otherwise it runs a name search.
 *
 * @param {string} text - Search text or a DATA_SOURCE UUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{totalCount: number|null, datasets: Array<Object>}>}
 */
export async function searchDatasets(text, tabId = null, offset = 0) {
  // Trim first: a pasted dataset ID is usually copied with surrounding
  // whitespace, which would otherwise fail the anchored UUID pattern.
  const trimmed = text?.trim() || '';
  const isId = !!trimmed && getObjectType('DATA_SOURCE').isValidObjectId(trimmed);

  // A valid dataset ID narrows the search to that one dataset via databaseId.
  const filters = isId ? [{ field: 'databaseId', filterType: 'term', value: trimmed }] : [];

  return executeInPage(
    async (filters, query, offset, count) => {
      const response = await fetch('/api/data/ui/v3/datasources/search', {
        body: JSON.stringify({
          combineResults: true,
          count,
          entities: ['DATASET'],
          filters,
          offset,
          query,
          sort: {
            fieldSorts: [{ field: 'create_date', sortOrder: 'DESC' }],
            isRelevance: false
          }
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to search datasets. Status: ${response.status}`);
      }
      const data = await response.json();
      return {
        datasets: data.dataSources || [],
        totalCount: data._metaData?.totalCount ?? null
      };
    },
    [filters, isId ? '*' : trimmed || '*', offset, DATASETS_PAGE_SIZE],
    tabId
  );
}

/**
 * Replace a dataset's conditional-format ("color") rules with the supplied list.
 * Each rule's `dataSourceId` (top level and inside `condition`) is rewritten to
 * the destination dataset id before sending — source rules carry references to
 * their original dataset that would otherwise persist on the destination.
 *
 * @param {string} datasetId - The destination dataset UUID
 * @param {Array<Object>} rules - Rule objects shaped like `{condition, format, dataSourceId}`
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>}
 */
export async function setColorRules(datasetId, rules, tabId = null) {
  const rewritten = rules.map((rule) => ({
    ...rule,
    condition: { ...rule.condition, dataSourceId: datasetId },
    dataSourceId: datasetId
  }));
  return executeInPage(
    async (id, body) => {
      const response = await fetch(`/api/content/v1/datasources/conditionalFormats/${id}`, {
        body,
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) {
        throw new Error(`Failed to save color rules. HTTP status: ${response.status}`);
      }
      return response.json().catch(() => null);
    },
    [datasetId, JSON.stringify(rewritten)],
    tabId
  );
}

export async function setStreamScheduleToManual({ streamId, tabId }) {
  return executeInPage(
    async (streamId) => {
      const getResponse = await fetch(`/api/data/v1/streams/${streamId}?fields=all`);
      if (!getResponse.ok) {
        throw new Error(`Failed to fetch stream ${streamId}. HTTP status: ${getResponse.status}`);
      }

      const definition = await getResponse.json();
      definition.scheduleState = 'MANUAL';
      definition.advancedScheduleJson = JSON.stringify({
        timezone: 'UTC',
        type: 'MANUAL'
      });

      const putResponse = await fetch(`/api/data/v1/streams/${streamId}`, {
        body: JSON.stringify(definition),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!putResponse.ok) {
        throw new Error(`Failed to update stream ${streamId}. HTTP status: ${putResponse.status}`);
      }

      return putResponse.json();
    },
    [streamId],
    tabId
  );
}

/**
 * Transfer dataset ownership to a new user.
 * @param {string[]} datasetIds - Array of dataset IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferDatasets(datasetIds, fromUserId, toUserId, tabId = null) {
  // Resolve the source user's name for the tag, but never let that lookup block
  // the transfer: on failure we proceed untagged rather than aborting ownership.
  const fromUserName = await getUserName(fromUserId, tabId).catch(() => null);
  return executeInPage(
    async (datasetIds, toUserId, fromUserName) => {
      const errors = [];
      let succeeded = 0;
      const batchSize = 50;

      for (let i = 0; i < datasetIds.length; i += batchSize) {
        const chunk = datasetIds.slice(i, i + batchSize);
        try {
          const response = await fetch('/api/data/v1/ui/bulk/reassign', {
            body: JSON.stringify({
              ids: chunk,
              type: 'DATA_SOURCE',
              userId: toUserId
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          // Tag each reassigned dataset with its previous owner so the new owner
          // can see where it came from. Best-effort: ownership has already moved,
          // so a failed tag call must not flip the batch to failed (which would
          // wrongly report a successful transfer as failed and invite a retry).
          if (fromUserName) {
            try {
              const tagResponse = await fetch('/api/data/v1/ui/bulk/tag', {
                body: JSON.stringify({
                  bulkItems: { ids: chunk, type: 'DATA_SOURCE' },
                  tags: [`From ${fromUserName}`]
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST'
              });
              if (!tagResponse.ok) throw new Error(`HTTP ${tagResponse.status}`);
            } catch {
              // Best-effort tagging; the ownership transfer already succeeded.
            }
          }

          succeeded += chunk.length;
        } catch (error) {
          chunk.forEach((id) => errors.push({ error: error.message, id }));
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [datasetIds, toUserId, fromUserName],
    tabId
  );
}

export async function updateDatasetProperties(datasetId, updates) {
  return executeInPage(
    async (id, body) => {
      const res = await fetch(`/api/data/v3/datasources/${id}/properties`, {
        body,
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json().catch(() => null);
    },
    [datasetId, JSON.stringify(updates)]
  );
}
