import { executeInPage } from '@/utils';

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