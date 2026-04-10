import { executeInPage } from '@/utils';

/**
 * Delete a DataFlow and all its output datasets.
 * Deletes outputs first, then the dataflow itself.
 * @param {Object} params
 * @param {string} params.dataflowId - The DataFlow ID
 * @param {Array} params.outputs - Array of output objects with dataSourceId
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Result with success/status info
 */
export async function deleteDataflowAndOutputs({
  dataflowId,
  outputs,
  tabId = null
}) {
  return executeInPage(
    async (dataflowId, outputs) => {
      const outputIds = outputs.map((o) => o.dataSourceId).filter(Boolean);

      // Step 1: Delete all output datasets
      if (outputIds.length > 0) {
        const results = await Promise.allSettled(
          outputIds.map((id) =>
            fetch(`/api/data/v3/datasources/${id}`, { method: 'DELETE' })
          )
        );

        const failures = results.filter((r) => r.status === 'rejected' || !r.value?.ok);
        if (failures.length > 0) {
          return {
            datasetsDeleted: outputIds.length - failures.length,
            datasetsFailed: failures.length,
            success: false
          };
        }
      }

      // Step 2: Delete the dataflow
      const response = await fetch(
        `/api/dataprocessing/v1/dataflows/${dataflowId}`,
        { method: 'DELETE' }
      );

      if (!response.ok) {
        return {
          datasetsDeleted: outputIds.length,
          statusCode: response.status,
          success: false
        };
      }

      return {
        datasetsDeleted: outputIds.length,
        success: true
      };
    },
    [dataflowId, outputs],
    tabId
  );
}

/**
 * Get the full detail of a DataFlow (including actions/tiles)
 * @param {string} dataflowId - The DataFlow ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} The full dataflow JSON
 */
export async function getDataflowDetail(dataflowId, tabId = null) {
  return executeInPage(
    async (dataflowId) => {
      const response = await fetch(
        `/api/dataprocessing/v1/dataflows/${dataflowId}`,
        {
          credentials: 'include',
          method: 'GET'
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch dataflow: HTTP ${response.status}`);
      }

      return response.json();
    },
    [dataflowId],
    tabId
  );
}

/**
 * Get the DataFlow ID for a given output DataSet (reverse lookup).
 * Only applicable when the DataSet is an output of a DataFlow.
 * @param {string} datasetId - The DataSet UUID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<string>} The DataFlow ID
 * @throws {Error} If the dataflow cannot be fetched
 */
export async function getDataflowForOutputDataset(datasetId, tabId = null) {
  const fetchLogic = async (datasetId) => {
    const response = await fetch(
      `/api/dataprocessing/v2/dataflows/${datasetId}?populateActions=false&excludeFields=executionCount`
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch DataFlow for DataSet ${datasetId}. HTTP status: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.id) {
      throw new Error(`No DataFlow ID returned for DataSet ${datasetId}`);
    }

    return data.id.toString();
  };

  try {
    return await executeInPage(fetchLogic, [datasetId], tabId);
  } catch (error) {
    console.error('Error fetching DataFlow for DataSet:', error);
    throw error;
  }
}

/**
 * Get the current user's permission for a DataFlow.
 * @param {string} dataflowId - The DataFlow ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>} Permission object (e.g. { mask: 515 }) or null
 */
export async function getDataflowPermission(dataflowId, tabId = null) {
  return executeInPage(
    async (dataflowId) => {
      const response = await fetch(
        '/api/dataprocessing/v1/dataflows/bulk/flowPermissions',
        {
          body: JSON.stringify({ dataFlowIds: [dataflowId] }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      if (!response.ok) return null;
      const data = await response.json();
      return data?.permissions?.[0]?.permission || null;
    },
    [dataflowId],
    tabId
  );
}

/**
 * Update a DataFlow's details (name and description)
 * @param {string} dataflowId - The DataFlow ID
 * @param {Object} updates - Object containing name and/or description
 * @returns {Promise<Object>} - The updated DataFlow object
 */
/**
 * Get all dataflows owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedDataflows(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allDataflows = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            count,
            entities: ['DATAFLOW'],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                value: userId
              }
            ],
            offset,
            query: '*'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.searchObjects && data.searchObjects.length > 0) {
          allDataflows.push(
            ...data.searchObjects.map((d) => ({
              id: d.databaseId,
              name: d.title || d.databaseId.toString()
            }))
          );
          offset += count;
          if (data.searchObjects.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allDataflows;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer dataflow ownership to a new user.
 * @param {string[]} dataflowIds - Array of dataflow IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferDataflows(
  dataflowIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (dataflowIds, fromUserId, toUserId) => {
      try {
        const response = await fetch(
          '/api/dataprocessing/v1/dataflows/bulk/patch',
          {
            body: JSON.stringify({
              dataFlowIds: dataflowIds,
              responsibleUserId: toUserId
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return { errors: [], failed: 0, succeeded: dataflowIds.length };
      } catch (error) {
        return {
          errors: dataflowIds.map((id) => ({ error: error.message, id })),
          failed: dataflowIds.length,
          succeeded: 0
        };
      }
    },
    [dataflowIds, fromUserId, toUserId],
    tabId
  );
}

export async function updateDataflowDetails(dataflowId, updates) {
  const result = await executeInPage(
    async (dataflowId, updates) => {
      try {
        // Build payload from updates - allow empty string for description (to clear it)
        const payload = {};
        if ('name' in updates && updates.name?.trim()) {
          payload.name = updates.name.trim();
        }
        if ('description' in updates) {
          payload.description = updates.description?.trim() ?? '';
        }

        // Update the DataFlow using PATCH
        const updateResponse = await fetch(
          `/api/dataprocessing/v1/dataflows/${dataflowId}/patch`,
          {
            body: JSON.stringify(payload),
            headers: {
              'Content-Type': 'application/json'
            },
            method: 'PUT'
          }
        );

        if (!updateResponse.ok) {
          throw new Error(`HTTP ${updateResponse.status}`);
        }

        const data = await updateResponse.json();
        return data;
      } catch (error) {
        console.error('Error in updateDataflowInPage:', error);
        throw error;
      }
    },
    [dataflowId, updates]
  );
  return result;
}
