/**
 * Domo API service for fetching object details
 */

import { getObjectType, getAllObjectTypes, DomoObject } from '@/models';
import { executeInPage, getCurrentInstance } from '@/utils';

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
			parentId,
			objectType
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
 * @param {string} objectType - The object type identifier
 */
async function fetchObjectDetailsInPage(
	apiConfig,
	objectId,
	parentId,
	objectType
) {
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
			// throw new Error(`HTTP ${response.status}`);
			console.log(
				`Non-OK response for ${objectType} ${objectId} at ${url}:`,
				response
			);
			return null;
		}

		const data = await response.json();

		// Extract name using the pathToName
		const name =
			pathToName.split('.').reduce((current, prop) => current?.[prop], data) ||
			`Object #${objectId}`;
		console.log(`Fetched ${objectType} details in page:`, { name, data });
		return {
			name
		};
	} catch (error) {
		console.error(
			`Error in fetchObjectDetailsInPage for ${objectType}:`,
			error
		);
		throw error;
	}
}

/**
 * Try to fetch object details by trying different object types
 * @param {string} objectId - The object ID
 * @returns {Promise<DomoObject>} DomoObject instance with enriched metadata
 */
export async function detectAndFetchObject(objectId) {
	// Get the current Domo instance to build the baseUrl
	const instance = await getCurrentInstance();
	if (!instance) {
		throw new Error('Not on a Domo instance. Cannot detect object type.');
	}
	const baseUrl = `https://${instance}.domo.com`;

	// Get all object types that have API configurations and match the ID pattern
	const allTypes = getAllObjectTypes();
	const typesToTry = allTypes
		.filter(
			(type) =>
				type.api && // Has API configuration
				type.isValidObjectId(objectId) // ID matches pattern
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
			// For types requiring a parent, try to fetch the parent first
			let parentId = null;
			let tempObject = null;
			if (typeConfig.requiresParent()) {
				try {
					// Use DomoObject.getParent which executes in page context
					tempObject = new DomoObject(typeConfig.id, objectId, baseUrl);
					parentId = await tempObject.getParent(baseUrl);
					console.log(
						`Fetched parent for ${typeConfig.id} ${objectId}: ${parentId}`
					);
				} catch (parentError) {
					// If we can't get the parent, still try to fetch the object
					// The API call might succeed anyway or fail naturally
					console.log(
						`Could not fetch parent for ${typeConfig.id} ${objectId} (will try anyway):`,
						parentError.message
					);
					// Don't continue - still try the API call
				}
			}

			const result = await fetchObjectDetails(
				typeConfig.id,
				objectId,
				parentId
			);
			if (result && result.name) {
				// Create DomoObject instance with enriched metadata
				const metadata = {
					name: result.name,
					details: result
				};

				// If we fetched parent details, include them in metadata
				if (tempObject?.metadata?.parent) {
					metadata.parent = tempObject.metadata.parent;
				}

				const domoObject = new DomoObject(
					typeConfig.id,
					objectId,
					baseUrl,
					metadata
				);
				return domoObject;
			}
		} catch (error) {
			// Continue to next type
			continue;
		}
	}

	// If all fail, return DomoObject with UNKNOWN type
	// Create a minimal DomoObject without a specific type
	const unknownObject = new DomoObject('CARD', objectId, baseUrl, {
		name: `Object #${objectId}`,
		isUnknown: true
	});
	// Override the type to indicate it's unknown
	unknownObject._unknownType = true;
	return unknownObject;
}
