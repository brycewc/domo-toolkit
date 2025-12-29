/**
 * Domo API service for fetching object details
 */

const API_BASE = 'https://api.domo.com';

/**
 * Fetch details about a Domo object
 * @param {string} objectType - The type of object (CARD, DATA_SOURCE, etc.)
 * @param {string} objectId - The object ID
 * @returns {Promise<{name: string, type: string, id: string}>}
 */
export async function fetchObjectDetails(objectType, objectId) {
	try {
		// Get active tab to execute fetch in Domo context
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true
		});

		if (!tab || !tab.url || !tab.url.includes('domo.com')) {
			throw new Error('Not on a Domo page');
		}

		// Execute fetch in the page context to use Domo's authentication
		const result = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			func: fetchObjectDetailsInPage,
			args: [objectType, objectId]
		});

		if (result && result[0] && result[0].result) {
			return result[0].result;
		}

		throw new Error('Failed to fetch object details');
	} catch (error) {
		console.error('Error fetching object details:', error);
		throw error;
	}
}

/**
 * Function executed in page context to fetch object details
 * @param {string} objectType - The object type
 * @param {string} objectId - The object ID
 */
async function fetchObjectDetailsInPage(objectType, objectId) {
	const typeToEndpoint = {
		CARD: `/api/content/v2/cards/${objectId}`,
		DATA_SOURCE: `/api/data/v2/datasources/${objectId}`,
		DATAFLOW_TYPE: `/api/data/v2/dataflows/${objectId}`,
		PAGE: `/api/content/v2/pages/${objectId}`,
		USER: `/api/identity/v1/users/${objectId}`,
		GROUP: `/api/identity/v1/groups/${objectId}`,
		ALERT: `/api/data/v1/alerts/${objectId}`,
		DRILL_VIEW: `/api/content/v1/cards/${objectId}/drillviews`,
		WORKFLOW_MODEL: `/api/workflow/v1/models/${objectId}`,
		APP: `/api/content/v1/apps/${objectId}`,
		PROJECT: `/api/project/v1/projects/${objectId}`
	};

	const endpoint = typeToEndpoint[objectType];
	if (!endpoint) {
		return {
			name: `${objectType} #${objectId}`,
			type: objectType,
			id: objectId
		};
	}

	try {
		const response = await fetch(endpoint, {
			credentials: 'include',
			headers: {
				'Content-Type': 'application/json'
			}
		});

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}

		const data = await response.json();

		// Extract name from various possible fields
		const name =
			data.name ||
			data.displayName ||
			data.title ||
			data.cardName ||
			`${objectType} #${objectId}`;

		return {
			name,
			type: objectType,
			id: objectId
		};
	} catch (error) {
		console.error('Error in fetchObjectDetailsInPage:', error);
		return {
			name: `${objectType} #${objectId}`,
			type: objectType,
			id: objectId,
			error: error.message
		};
	}
}

/**
 * Detect object type from ID patterns
 * @param {string} id - The object ID
 * @returns {string|null} - Detected object type or null
 */
export function detectObjectTypeFromId(id) {
	// Domo object IDs follow certain patterns
	// This is a heuristic approach and may need refinement

	if (!id || typeof id !== 'string') return null;

	const trimmedId = id.trim();

	// UUIDs are typically used for certain object types
	const uuidPattern =
		/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

	// Numeric IDs
	const numericPattern = /^\d+$/;

	if (uuidPattern.test(trimmedId)) {
		// UUIDs are often used for apps, workflows, etc.
		return null; // Need more context
	} else if (numericPattern.test(trimmedId)) {
		// Most common objects use numeric IDs
		// Without more context, we'll need to try API calls
		return null;
	}

	return null;
}

/**
 * Try to fetch object details by trying different object types
 * @param {string} objectId - The object ID
 * @returns {Promise<{name: string, type: string, id: string}>}
 */
export async function detectAndFetchObject(objectId) {
	// Try common object types in order of likelihood
	const typesToTry = [
		'CARD',
		'DATA_SOURCE',
		'DATAFLOW_TYPE',
		'PAGE',
		'USER',
		'GROUP',
		'ALERT',
		'APP'
	];

	for (const objectType of typesToTry) {
		try {
			const result = await fetchObjectDetails(objectType, objectId);
			if (result && !result.error) {
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
