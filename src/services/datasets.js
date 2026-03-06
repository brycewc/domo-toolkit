import { executeInPage } from '@/utils';

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
 * Get datasets used by a page or app studio view
 * @param {Object} params - Parameters
 * @param {string|number} params.pageId - The page ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForPage({ pageId, tabId }) {
  const fetchLogic = async (pageId) => {
    console.log('[getDatasetsForPage] Fetching datasets for page:', pageId);
    const response = await fetch(
      `/api/content/v1/datasources/pages/${pageId}`,
      {
        credentials: 'include',
        method: 'GET'
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch datasets for page ${pageId}. HTTP status: ${response.status}`
      );
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
    const schemaResponse = await fetch(
      `/api/query/v1/datasources/${datasetId}/schema/indexed?includeHidden=true`,
      {
        credentials: 'include',
        method: 'GET'
      }
    );

    if (!schemaResponse.ok) {
      throw new Error(
        `Failed to fetch schema for datasource ${datasetId}. HTTP status: ${schemaResponse.status}`
      );
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
          const name =
            j.left === false
              ? j.leftItem && j.leftItem.name
              : j.rightItem && j.rightItem.name;
          if (name) idsSet.add(stripTicks(name));
        }
      }
    }
    const datasetIds = Array.from(idsSet).filter(Boolean);

    if (datasetIds.length === 0) {
      return [];
    }

    // 3) Get names for all datasets using bulk endpoint
    const bulkResponse = await fetch(
      '/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true',
      {
        body: JSON.stringify(datasetIds),
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        method: 'POST'
      }
    );

    if (!bulkResponse.ok) {
      // If bulk fails, return IDs without names
      console.warn('Bulk datasource fetch failed, returning IDs only');
      return datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
    }

    const namesResponse = await bulkResponse.json();
    const namesData = namesResponse.dataSources || [];
    const byId = Object.fromEntries(
      namesData.map((d) => [d.id || d.datasetId, d])
    );
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
      const response = await fetch(
        `/api/data/v1/streams/${streamId}/executions/${executionId}`,
        { method: 'GET' }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch execution ${executionId} for stream ${streamId}. HTTP status: ${response.status}`
        );
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
      const stateResponse = await fetch(
        `/api/data/v1/streams/state/${streamId}`,
        {
          method: 'GET'
        }
      );
      if (!stateResponse.ok) {
        throw new Error(
          `Failed to fetch stream state for stream ${streamId}. HTTP status: ${stateResponse.status}`
        );
      }
      const stateData = await stateResponse.json();
      const offset =
        stateData[0].executionId < limit ? 0 : stateData[0].executionId - limit;

      const response = await fetch(
        `/api/data/v1/streams/${streamId}/executions?limit=${limit}&offset=${offset}`,
        {
          method: 'GET'
        }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch stream executions for stream ${streamId}. HTTP status: ${response.status}`
        );
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
 * Get dependent datasets for a dataset via the lineage API
 * @param {Object} params - Parameters
 * @param {string} params.datasetId - The datasource ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of dataset objects with details
 */
export async function getDependentDatasets({ datasetId, tabId }) {
  const fetchLogic = async (datasetId) => {
    const lineageResponse = await fetch(
      `/api/data/v1/lineage/DATA_SOURCE/${datasetId}?traverseUp=false&requestEntities=DATA_SOURCE`,
      { credentials: 'include', method: 'GET' }
    );

    if (!lineageResponse.ok) {
      throw new Error(
        `Failed to fetch lineage for dataset ${datasetId}. HTTP status: ${lineageResponse.status}`
      );
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
        credentials: 'include',
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
