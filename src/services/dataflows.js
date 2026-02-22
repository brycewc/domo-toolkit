import { executeInPage } from '@/utils';

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
      `/api/dataprocessing/v2/dataflows/${datasetId}?populateActions=false&excludeFields=executionCount`,
      {
        method: 'GET',
        credentials: 'include'
      }
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
 * Update a DataFlow's details (name and description)
 * @param {string} dataflowId - The DataFlow ID
 * @param {Object} updates - Object containing name and/or description
 * @returns {Promise<Object>} - The updated DataFlow object
 */
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
            method: 'PUT',
            credentials: 'include',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
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
