import { executeInPage } from '@/utils';

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
        method: 'GET',
        credentials: 'include'
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
 * Extract dataset IDs from a view schema
 * Handles both DataFusion schema (has 'views' array) and SQL schema (has 'select' object)
 * @param {Object} schema - The schema object from the indexed endpoint
 * @returns {string[]} Array of dataset IDs
 */
function extractDatasetIdsFromSchema(schema) {
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
  }
  // Handle SQL schema structure (has 'select' object)
  else if (schema.select && schema.select.selectBody) {
    const sel = schema.select.selectBody;
    if (sel.fromItem && sel.fromItem.name) {
      idsSet.add(stripTicks(sel.fromItem.name));
    }
    if (Array.isArray(sel.joins)) {
      for (const j of sel.joins) {
        if (!j) continue;
        // If left is true, use rightItem.name; if left is false, use leftItem.name
        const name =
          j.left === false
            ? j.leftItem && j.leftItem.name
            : j.rightItem && j.rightItem.name;
        if (name) idsSet.add(stripTicks(name));
      }
    }
  }

  return Array.from(idsSet);
}

/**
 * Get datasets used by a dataset view (dataset-view or datafusion)
 * @param {Object} params - Parameters
 * @param {string|number} params.dataSourceId - The datasource ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForView({ dataSourceId, tabId }) {
  const fetchLogic = async (dataSourceId) => {
    // 1) Get the schema to extract dataset IDs
    const schemaResponse = await fetch(
      `/api/query/v1/datasources/${dataSourceId}/schema/indexed?includeHidden=true`,
      {
        method: 'GET',
        credentials: 'include'
      }
    );

    if (!schemaResponse.ok) {
      throw new Error(
        `Failed to fetch schema for datasource ${dataSourceId}. HTTP status: ${schemaResponse.status}`
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
    }
    // Handle SQL schema structure (has 'select' object)
    else if (schema.select && schema.select.selectBody) {
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

    const datasetIds = Array.from(idsSet);

    if (datasetIds.length === 0) {
      return [];
    }

    // 3) Get names for all datasets using bulk endpoint
    const bulkResponse = await fetch(
      `/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(datasetIds)
      }
    );

    if (!bulkResponse.ok) {
      // If bulk fails, return IDs without names
      console.warn('Bulk datasource fetch failed, returning IDs only');
      return datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
    }

    const bulkData = await bulkResponse.json();

    // Map the bulk response to our format
    // The response is an array of datasource objects
    const datasourceMap = new Map();
    for (const ds of bulkData) {
      const id = ds.id || ds.dataSourceId;
      const name = ds.dataSourceName || ds.name || `Dataset ${id}`;
      if (id) {
        datasourceMap.set(id.toString(), { id: id.toString(), name });
      }
    }

    // Return datasets in order, using map for names
    return datasetIds.map((id) => {
      const ds = datasourceMap.get(id.toString());
      return ds || { id, name: `Dataset ${id}` };
    });
  };

  try {
    return await executeInPage(fetchLogic, [dataSourceId], tabId);
  } catch (error) {
    console.error('Error fetching datasets for view:', error);
    throw error;
  }
}
