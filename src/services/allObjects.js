import { executeInPage } from '@/utils';

/**
 * Fetch object details from the Domo API and enrich metadata (page-safe version)
 * This version can be executed in page context via executeInPage
 * @param {Object} params - Parameters object
 * @param {string} params.typeId - The object type ID
 * @param {string} params.objectId - The object ID
 * @param {Object} params.apiConfig - The API configuration {method, endpoint, pathToName, bodyTemplate}
 * @param {boolean} params.requiresParent - Whether parent ID is required for API
 * @param {string} [params.parentId] - Optional parent ID if already known
 * @param {boolean} [params.throwOnError=true] - Whether to throw errors
 * @returns {Promise<Object>} Metadata object {details, name}
 */
export async function fetchObjectDetailsInPage(params) {
  const {
    apiConfig,
    objectId,
    parentId: providedParentId,
    requiresParent,
    throwOnError = true,
    typeId
  } = params;

  const {
    bodyTemplate = null,
    endpoint,
    filterByIdField = null,
    method = 'GET',
    nameTemplate = null,
    pathToDetails = null,
    pathToName,
    pathToParentId = null
  } = apiConfig;
  let url;
  let parentId = providedParentId;

  try {
    // Build the endpoint URL
    if (requiresParent) {
      if (!parentId) {
        const error = new Error(
          `Cannot fetch details for ${typeId} ${objectId} because parent ID is required`
        );
        if (throwOnError) throw error;
        console.warn(error.message);
        return { details: null, name: null };
      }
      // Replace {parent} in endpoint
      url = endpoint.replace('{parent}', parentId);
      url = `/api${url.replace('{id}', objectId)}`;
    } else {
      url = `/api${endpoint}`.replace('{id}', objectId);
    }

    // Prepare fetch options
    const options = {
      method
    };

    // Add body for POST requests
    if (method !== 'GET' && bodyTemplate) {
      options.body = JSON.stringify(bodyTemplate).replace(/{id}/g, objectId);
      if (parentId) {
        options.body = options.body.replace(/{parent}/g, parentId);
      }
      options.headers = {
        'Content-Type': 'application/json'
      };
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = new Error(
        `Failed to fetch details for ${typeId} ${objectId}: HTTP ${response.status}`
      );
      if (throwOnError) throw error;
      console.warn(error.message);
      return { details: null, name: null };
    }

    let data = await response.json();

    // If the endpoint returns a list, find the matching item by ID field
    if (filterByIdField && Array.isArray(data)) {
      data = data.find((item) => String(item[filterByIdField]) === String(objectId)) || null;
      if (!data) {
        const error = new Error(
          `${typeId} ${objectId} not found in list response`
        );
        if (throwOnError) throw error;
        return { details: null, name: null };
      }
    }

    const resolvePath = (path) =>
      (path.match(/[^.[\]]+/g) || []).reduce(
        (current, prop) => current?.[prop],
        data
      );
    const details = pathToDetails ? resolvePath(pathToDetails) : data;
    const name = nameTemplate
      ? nameTemplate.replace(/{([^}]+)}/g, (_, path) =>
          path === 'id' ? objectId : (resolvePath(path) ?? '')
        )
      : resolvePath(pathToName);
    const extractedParentId = pathToParentId
      ? resolvePath(pathToParentId)
      : undefined;

    return { details, name, parentId: extractedParentId };
  } catch (error) {
    console.error(`Error fetching details for ${typeId}:`, error);
    if (throwOnError) throw error;
    return { details: null, name: null };
  }
}

/**
 * Share a batch of resources with a set of recipients via the generic
 * /api/content/v1/share endpoint. Useful for bulk card/page sharing flows.
 *
 * Supply `resources` like [{ type: 'badge', id: '123' }, ...] and
 * `recipients` like [{ type: 'user', id: '456' }, ...].
 *
 * @param {Object} params
 * @param {Array<{type: string, id: string}>} params.resources
 * @param {Array<{type: string, id: string}>} params.recipients
 * @param {string} [params.message='']
 * @param {boolean} [params.sendEmail=false]
 * @param {number|null} [tabId]
 * @returns {Promise<boolean>} true on success
 */
export async function shareResources(
  { message = '', recipients, resources, sendEmail = false },
  tabId = null
) {
  if (!resources?.length || !recipients?.length) return true;
  return executeInPage(
    async (resources, recipients, message, sendEmail) => {
      const response = await fetch(
        `/api/content/v1/share?sendEmail=${sendEmail}`,
        {
          body: JSON.stringify({ message, recipients, resources }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      return response.ok;
    },
    [resources, recipients, message, sendEmail],
    tabId
  );
}
