import { executeInPage } from '@/utils';

/**
 * Update a DataFlow's details (name and description)
 * @param {string} dataflowId - The DataFlow ID
 * @param {Object} updates - Object containing name and/or description
 * @returns {Promise<Object>} - The updated DataFlow object
 */
export async function updateDataflowDetails(dataflowId, updates) {
	try {
		const result = await executeInPage(updateDataflowDetailsInPage, [
			dataflowId,
			updates
		]);
		return result;
	} catch (error) {
		console.error('Error updating DataFlow:', error);
		throw error;
	}
}

/**
 * Function executed in page context to update DataFlow
 * @param {string} dataflowId - The DataFlow ID
 * @param {Object} updates - Object containing name and/or description
 */
async function updateDataflowDetailsInPage(dataflowId, updates) {
	try {
		// Filter out null and empty string values
		const payload = {};
		if (updates.name && updates.name.trim() !== '') {
			payload.name = updates.name;
		}
		if (updates.description && updates.description.trim() !== '') {
			payload.description = updates.description;
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
}
