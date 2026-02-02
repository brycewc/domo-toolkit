import { DomoObject } from '@/models';
import { executeInPage } from '@/utils';
import { getCurrentUserId } from '@/services';

/**
 * Fetch object details from the Domo API and enrich metadata (page-safe version)
 * This version can be executed in page context via executeInPage
 * @param {Object} params - Parameters object
 * @param {string} params.typeId - The object type ID
 * @param {string} params.objectId - The object ID
 * @param {string} params.baseUrl - The base URL
 * @param {Object} params.apiConfig - The API configuration {method, endpoint, pathToName, bodyTemplate}
 * @param {boolean} params.requiresParent - Whether parent ID is required for API
 * @param {string} [params.parentId] - Optional parent ID if already known
 * @param {boolean} [params.throwOnError=true] - Whether to throw errors
 * @returns {Promise<Object>} Metadata object {details, name}
 */
export async function fetchObjectDetailsInPage(params) {
  const {
    typeId,
    objectId,
    baseUrl,
    apiConfig,
    requiresParent,
    parentId: providedParentId,
    throwOnError = true
  } = params;

  const { method, endpoint, pathToName, bodyTemplate } = apiConfig;
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
      method,
      credentials: 'include'
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

    const data = await response.json();
    const name = pathToName
      .split('.')
      .reduce((current, prop) => current?.[prop], data);

    return { details: data, name };
  } catch (error) {
    console.error(`Error fetching details for ${typeId}:`, error);
    if (throwOnError) throw error;
    return { details: null, name: null };
  }
}

/**
 * Share a Domo object with the current user
 * @param {Object} params
 * @param {DomoObject} params.object - The Domo object to share
 * @param {Function} params.setStatus - Callback to update status (title, description, status)
 * @param {number} [params.tabId] - Optional Chrome tab ID for context
 * @returns {Promise<void>}
 */
export async function shareWithSelf({ object, setStatus, tabId = null }) {
  try {
    if (!object || !object.typeId || !object.id) {
      throw new Error('Invalid object provided');
    }

    // Get current user ID
    const userId = await getCurrentUserId(tabId);

    // Execute share based on object type
    const result = await executeInPage(
      async (objectTypeId, objectId, userId, metadata) => {
        let url, options, successMessage;

        switch (objectTypeId) {
          case 'DATA_SOURCE': {
            // For DataSets, we need to share the account
            if (!metadata?.details?.accountId) {
              throw new Error('DataSet account ID not found in metadata');
            }

            const accountId = metadata.details.accountId;

            // Check if it's a dataflow output (which doesn't have an account to share)
            if (metadata.details.type === 'dataflow') {
              throw new Error(
                'DataSet is a DataFlow output and does not have an account to share'
              );
            }

            url = `/api/data/v2/accounts/share/${accountId}`;
            options = {
              method: 'PUT',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'USER',
                id: userId,
                accessLevel: 'CAN_VIEW'
              })
            };
            successMessage = `Account ${accountId} shared successfully`;
            break;
          }

          case 'APP': {
            // Custom App Design (assetlibrary)
            url = `/api/apps/v1/designs/${objectId}/permissions/ADMIN`;
            options = {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([userId])
            };
            successMessage = `Custom App Design ${objectId} shared successfully`;
            break;
          }

          case 'PAGE':
          case 'DATA_APP_VIEW': {
            // Page or App Studio Page
            url = `/api/content/v1/share?sendEmail=false`;
            options = {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resources: [{ type: 'page', id: objectId }],
                recipients: [
                  { type: 'user', id: userId, permission: 'HAS_ACCESS' }
                ]
              })
            };
            successMessage = `Page ${objectId} shared successfully`;
            break;
          }

          case 'DATA_APP': {
            // Studio App (shared like pages)
            url = `/api/content/v1/share?sendEmail=false`;
            options = {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                resources: [{ type: 'page', id: objectId }],
                recipients: [
                  { type: 'user', id: userId, permission: 'HAS_ACCESS' }
                ]
              })
            };
            successMessage = `Studio App ${objectId} shared successfully`;
            break;
          }

          default:
            throw new Error(
              `Sharing not supported for object type: ${objectTypeId}`
            );
        }

        const response = await fetch(url, options);

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(
            `Failed to share object. Status: ${response.status}. ${errorText}`
          );
        }

        return successMessage;
      },
      [object.typeId, object.id, userId, object.metadata],
      tabId
    );

    // Success callback
    setStatus?.('Shared Successfully', result, 'success');
  } catch (error) {
    console.error('Error sharing object with self:', error);
    setStatus?.('Share Failed', error.message, 'danger');
    throw error;
  }
}

export async function deleteObject({ object, tabId = null }) {
  console.log('deleteObject called with:', object, tabId);
  try {
    if (!object || !object.typeId || !object.id) {
      return {
        success: false,
        statusTitle: 'Delete Failed',
        statusDescription: 'Invalid object provided for deletion',
        statusType: 'danger'
      };
    }

    const result = await executeInPage(
      async (object) => {
        console.log('Executing delete for object:', object);
        const fetchRequest = {
          method: 'DELETE',
          url: null
        };
        switch (object.typeId) {
          case 'MAGNUM_COLLECTION':
            fetchRequest.url = `/api/datastores/v1/collections/${object.id}`;
            break;
          case 'ACCESS_TOKEN':
            fetchRequest.url = `/api/data/v1/accesstokens/${object.id}`;
            break;
          case 'APP':
            fetchRequest.url = `/api/apps/v1/designs/${object.id}`;
            break;
          case 'BEAST_MODE_FORMULA':
          case 'FUNCTION_TEMPLATE':
          case 'VARIABLE':
            fetchRequest.url = `/api/query/v1/functions/template/${object.id}`;
            break;
          case 'WORKFLOW_MODEL':
            fetchRequest.url = `/api/workflow/v1/models/${object.id}`;
            break;
          default:
            break;
        }

        if (!fetchRequest.url) {
          return {
            success: false,
            error: `Deletion not supported for object type: ${object.typeId}`
          };
        }

        console.log('Delete fetch request:', fetchRequest);
        const response = await fetch(fetchRequest.url, {
          method: fetchRequest.method
        });
        console.log('Delete response:', response);

        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            statusCode: response.status,
            error: errorText
          };
        } else {
          return {
            success: true,
            objectId: object.id,
            typeName: object.typeName
          };
        }
      },
      [object.toJSON()],
      tabId
    );

    if (result.success) {
      return {
        success: true,
        statusTitle: 'Deleted Successfully',
        statusDescription: `Deleted ${result.typeName?.toLowerCase() || 'object'} ${result.objectId}`,
        statusType: 'success'
      };
    } else {
      return {
        success: false,
        statusTitle: 'Delete Failed',
        statusDescription:
          result.error ||
          `Failed to delete object. Status: ${result.statusCode || 'unknown'}`,
        statusType: 'danger'
      };
    }
  } catch (error) {
    console.error('Error in deleteObject:', error);
    return {
      success: false,
      error: error.message,
      statusTitle: 'Delete Failed',
      statusDescription: error.message,
      statusType: 'danger'
    };
  }
}

export async function updateOwner({ object, owner, tabId = null }) {
  try {
    if (!object || !object.typeId || !object.id) {
      return {
        success: false,
        statusTitle: 'Update Failed',
        statusDescription: 'Invalid object provided for owner update',
        statusType: 'danger'
      };
    }

    const result = await executeInPage(
      async (object, newOwnerId) => {
        console.log('Executing updateOwner:', object, newOwnerId);
        const fetchRequest = {
          method: 'PUT',
          url: null,
          body: { id: object.id, owner: parseInt(newOwnerId) }
        };
        switch (object.typeId) {
          case 'ALERT':
            fetchRequest.method = 'PATCH';
            fetchRequest.url = `/api/social/v4/alerts/${object.id}`;
            fetchRequest.body = {
              id: parseInt(object.id),
              owner: parseInt(newOwnerId)
            };
            break;
          case 'WORKFLOW_MODEL':
            fetchRequest.url = `/api/workflow/v1/models/${object.id}`;
            fetchRequest.body.owner = newOwnerId.toString();
            break;
          default:
            break;
        }

        if (!fetchRequest.url) {
          return {
            success: false,
            error: `Update not supported for object type: ${object.typeId}`
          };
        }

        console.log('Update fetch request:', fetchRequest);
        const response = await fetch(fetchRequest.url, {
          method: fetchRequest.method,
          body: JSON.stringify(fetchRequest.body),
          headers: {
            'Content-Type': 'application/json'
          }
        });
        console.log('Update response:', response);
        if (!response.ok) {
          const errorText = await response.text();
          return {
            success: false,
            statusCode: response.status,
            error: errorText
          };
        } else {
          return {
            success: true,
            objectId: object.id,
            typeName: object.typeName
          };
        }
      },
      [object.toJSON(), owner],
      tabId
    );

    if (result.success) {
      return {
        success: true,
        statusTitle: 'Updated Successfully',
        statusDescription: `Updated ${result.typeName?.toLowerCase() || 'object'} ${result.objectId}`,
        statusType: 'success'
      };
    } else {
      return {
        success: false,
        statusTitle: 'Update Failed',
        statusDescription:
          result.error ||
          `Failed to update object. Status: ${result.statusCode || 'unknown'}`,
        statusType: 'danger'
      };
    }
  } catch (error) {
    console.error('Error in updateOwner:', error);
    return {
      success: false,
      error: error.message,
      statusTitle: 'Update Failed',
      statusDescription: error.message,
      statusType: 'danger'
    };
  }
}
