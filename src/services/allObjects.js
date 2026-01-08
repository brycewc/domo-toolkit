/**
 * Domo API service for fetching object details
 */

import { getObjectType, getAllObjectTypes } from '@/models';
import { executeInPage } from '@/utils';

const API_BASE = 'https://api.domo.com';

/**
 * Fetch details about a Domo object
 * @param {string} objectType - The type of object (CARD, DATA_SOURCE, etc.)
 * @param {string} objectId - The object ID
 * @param {string} [parentId] - Optional parent ID for types that require it
 * @returns {Promise<{name: string, type: string, id: string}>}
 */
export async function fetchObjectDetails(
	objectType,
	objectId,
	parentId = null
) {
	try {
		// Get the object type configuration
		const typeConfig = getObjectType(objectType);
		if (!typeConfig || !typeConfig.api) {
			throw new Error(`No API configuration for object type: ${objectType}`);
		}

		// Execute fetch in the page context to use Domo's authentication
		const result = await executeInPage(fetchObjectDetailsInPage, [
			typeConfig.api,
			objectId,
			parentId
		]);

		return {
			...result,
			type: objectType,
			id: objectId
		};
	} catch (error) {
		console.error('Error fetching object details:', error);
		throw error;
	}
}

/**
 * Function executed in page context to fetch object details
 * @param {Object} apiConfig - The API configuration from DomoObjectType
 * @param {string} objectId - The object ID
 * @param {string|null} parentId - Optional parent ID
 */
async function fetchObjectDetailsInPage(apiConfig, objectId, parentId) {
	const { method, endpoint, pathToName, bodyTemplate } = apiConfig;

	try {
		// Build the endpoint URL
		let url = `/api${endpoint}`
			.replace('{id}', objectId)
			.replace('{parent}', parentId || '');

		// Prepare fetch options
		const options = {
			method,
			credentials: 'include'
		};

		// Add body for POST requests
		if (method !== 'GET' && bodyTemplate) {
			// Replace {id} in bodyTemplate
			options.body = JSON.stringify(bodyTemplate).replace(/{id}/g, objectId);
			options.headers = {
				'Content-Type': 'application/json'
			};
		}

		const response = await fetch(url, options);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();

		// Extract name using the pathToName
		const name =
			pathToName.split('.').reduce((current, prop) => current?.[prop], data) ||
			`Object #${objectId}`;
		console.log('Fetched object details in page:', { name, data });
		return {
			name
		};
	} catch (error) {
		console.error('Error in fetchObjectDetailsInPage:', error);
		throw error;
	}
}

/**
 * Try to fetch object details by trying different object types
 * @param {string} objectId - The object ID
 * @returns {Promise<{name: string, type: string, id: string}>}
 */
export async function detectAndFetchObject(objectId) {
	// Get all object types that have API configurations and match the ID pattern
	const allTypes = getAllObjectTypes();
	const typesToTry = allTypes
		.filter(
			(type) =>
				type.api && // Has API configuration
				type.isValidObjectId(objectId) && // ID matches pattern
				!type.requiresParent() // Doesn't require a parent ID
		)
		// Sort by likelihood (common types first)
		.sort((a, b) => {
			const priority = [
				'CARD',
				'DATA_SOURCE',
				'DATAFLOW_TYPE',
				'DATA_APP',
				'DATA_APP_VIEW',
				'PAGE',
				'USER',
				'GROUP',
				'ALERT',
				'BEAST_MODE_FORMULA',
				'WORKFLOW_MODEL'
			];
			const aIndex = priority.indexOf(a.id);
			const bIndex = priority.indexOf(b.id);
			if (aIndex !== -1 && bIndex !== -1) return aIndex - bIndex;
			if (aIndex !== -1) return -1;
			if (bIndex !== -1) return 1;
			return 0;
		});

	for (const typeConfig of typesToTry) {
		try {
			const result = await fetchObjectDetails(typeConfig.id, objectId);
			if (result && result.name) {
				return result;
			}
		} catch (error) {
			// Continue to next type
			continue;
		}
	}

	// If all fail, return generic
	return {
		name: `Object #${objectId}`,
		type: 'UNKNOWN',
		id: objectId
	};
}
