import { executeInPage } from '@/utils';

export async function deleteObject({ object, tabId = null }) {
  // console.log('deleteObject called with:', object, tabId);
  try {
    if (!object || !object.typeId || !object.id) {
      return {
        statusDescription: 'Invalid object provided for deletion',
        statusTitle: 'Delete Failed',
        statusType: 'danger',
        success: false
      };
    }

    const result = await executeInPage(
      async (object) => {
        try {
        // console.log('Executing delete for object:', object);
          const fetchOptions = {
            method: 'DELETE'
          };
          let fetchUrl = null;
          switch (object.typeId) {
            case 'ACCESS_TOKEN':
              fetchUrl = `/api/data/v1/accesstokens/${object.id}`;
              break;
            case 'APP':
              fetchUrl = `/api/apps/v1/designs/${object.id}`;
              break;
            case 'BEAST_MODE_FORMULA':
            case 'FUNCTION_TEMPLATE':
            case 'VARIABLE':
              fetchUrl = `/api/query/v1/functions/template/${object.id}`;
              break;
            case 'MAGNUM_COLLECTION':
              fetchUrl = `/api/datastores/v1/collections/${object.id}`;
              break;
            case 'TEMPLATE':
              fetchOptions.method = 'POST';
              fetchUrl = '/api/synapse/approval/graphql';
              fetchOptions.body = JSON.stringify({
                operationName: 'archiveTemplate',
                query:
                'mutation archiveTemplate($id: ID!) {\n  success: deleteTemplate(id: $id)\n}',
                variables: {
                  id: object.id
                }
              });
              fetchOptions.headers = {
                'Content-Type': 'application/json'
              };
              break;
            case 'WORKFLOW_MODEL': {
              const versionsRes = await fetch(
                `/api/workflow/v2/models/${object.id}/versions`
              );
              if (!versionsRes.ok) {
                return {
                  error: `Failed to list workflow versions: HTTP ${versionsRes.status}`,
                  success: false
                };
              }
              const versions = await versionsRes.json();
              const activeVersions = versions.filter((v) => v.active);
              for (const ver of activeVersions) {
                const deactivateRes = await fetch(
                  `/api/workflow/v2/models/${object.id}/versions/${ver.version}`,
                  {
                    body: JSON.stringify({ active: false, description: ver.description }),
                    headers: { 'Content-Type': 'application/json' },
                    method: 'PUT'
                  }
                );
                if (!deactivateRes.ok) {
                  return {
                    error: `Failed to deactivate version ${ver.version}: HTTP ${deactivateRes.status}`,
                    success: false
                  };
                }
              }
              fetchUrl = `/api/workflow/v1/models/${object.id}`;
              break;
            }
            default:
              break;
          }

          if (!fetchUrl) {
            return {
              error: `Deletion not supported for object type: ${object.typeId}`,
              success: false
            };
          }

          const response = await fetch(fetchUrl, fetchOptions);

          if (!response.ok) {
            const errorText = await response.text();
            return {
              error: errorText,
              statusCode: response.status,
              success: false
            };
          }

          // TEMPLATE uses GraphQL and returns a JSON body with success/error
          if (object.typeId === 'TEMPLATE') {
            const data = await response.json();
            if (!data.data?.success) {
              return {
                error: data.data?.error,
                statusCode: response.status,
                success: false
              };
            }
          }

          return {
            objectId: object.id,
            success: true,
            typeName: object.typeName
          };
        } catch (error) {
          console.error('Error in deleteObject:', error);
          return {
            error: error.message,
            statusCode: 500,
            success: false
          };
        }
      },
      [object.toJSON()],
      tabId
    );

    if (result.success) {
      return {
        statusDescription: `Deleted ${result.typeName?.toLowerCase() || 'object'} ${result.objectId}`,
        statusTitle: 'Deleted Successfully',
        statusType: 'success',
        success: true
      };
    } else {
      return {
        statusDescription:
          result.error ||
          `Failed to delete object. Status: ${result.statusCode || 'unknown'}`,
        statusTitle: 'Delete Failed',
        statusType: 'danger',
        success: false
      };
    }
  } catch (error) {
    console.error('Error in deleteObject:', error);
    return {
      error: error.message,
      statusDescription: error.message,
      statusTitle: 'Delete Failed',
      statusType: 'danger',
      success: false
    };
  }
}

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

    const data = await response.json();
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
 * Share a Domo object with the current user
 * @param {Object} params
 * @param {DomoObject} params.object - The Domo object to share
 * @param {number} params.userId - The current user's ID
 * @param {Function} params.setStatus - Callback to update status (title, description, status)
 * @param {number} [params.tabId] - Optional Chrome tab ID for context
 * @returns {Promise<void>}
 */
export async function shareWithSelf({
  object,
  setStatus,
  tabId = null,
  userId
}) {
  try {
    if (!object || !object.typeId || !object.id) {
      throw new Error('Invalid object provided');
    }

    // Execute share based on object type
    const result = await executeInPage(
      async (objectTypeId, objectId, userId, metadata) => {
        let options, successMessage, url;

        switch (objectTypeId) {
          case 'APP': {
            url = `/api/apps/v1/designs/${objectId}/permissions/ADMIN`;
            options = {
              body: JSON.stringify([userId]),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            };
            successMessage = `Custom App Design ${objectId} shared successfully`;
            break;
          }

          case 'CARD': {
            if (metadata?.details?.type !== 'domoapp') {
              throw new Error('Sharing is only supported for DomoApp cards');
            }

            const appInstanceId = metadata.details.domoapp?.id;
            if (!appInstanceId) {
              throw new Error('App Instance ID not found in card metadata');
            }

            const appInstanceResponse = await fetch(`/api/apps/v1/instances/${appInstanceId}`);
            if (!appInstanceResponse.ok) {
              throw new Error(
                `Failed to fetch App Instance details. Status: ${appInstanceResponse.status}`
              );
            }
            const appInstanceData = await appInstanceResponse.json();
            const designId = appInstanceData.designId;
            if (!designId) {
              throw new Error('Design ID not found in App Instance response');
            }

            const designResponse = await fetch(
              `/api/apps/v1/designs/${designId}/permissions/ADMIN`,
              {
                body: JSON.stringify([userId]),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST'
              }
            );
            if (!designResponse.ok) {
              const errorText = await designResponse.text();
              throw new Error(
                `Failed to share app design. Status: ${designResponse.status}. ${errorText}`
              );
            }

            const collectionsResponse = await fetch(
              `/api/datastores/v1/${appInstanceId}/collections`
            );
            if (collectionsResponse.ok) {
              const collections = await collectionsResponse.json();
              if (Array.isArray(collections) && collections.length > 0) {
                const permissions = 'ADMIN,SHARE,DELETE,WRITE,READ,READ_CONTENT,CREATE_CONTENT,UPDATE_CONTENT,DELETE_CONTENT';
                await Promise.all(
                  collections.map((col) =>
                    fetch(
                      `/api/datastores/v1/collections/${col.id}/permission/USER/${userId}?overwrite=true&permissions=${permissions}`,
                      { method: 'PUT' }
                    )
                  )
                );
              }
            }

            return `Custom App Design ${designId} shared successfully (including ${appInstanceId} AppDB collections)`;
          }

          case 'DATA_APP':
          case 'WORKSHEET': {
            url = '/api/content/v1/dataapps/share?sendEmail=false';
            options = {
              body: JSON.stringify({
                dataAppIds: [objectId],
                message: 'I thought you might find this interesting.',
                recipients: [{ id: userId, type: 'user' }]
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            };
            successMessage = `Studio App ${objectId} shared successfully`;
            break;
          }

          case 'DATA_APP_VIEW':
          case 'WORKSHEET_VIEW': {
            const parentId = metadata?.parent?.id;
            if (!parentId) {
              throw new Error('Parent app ID not found — cannot share app page');
            }
            url = '/api/content/v1/dataapps/share?sendEmail=false';
            options = {
              body: JSON.stringify({
                dataAppIds: [parentId],
                message: 'I thought you might find this interesting.',
                recipients: [{ id: userId, type: 'user' }]
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            };
            successMessage = `App ${parentId} shared successfully`;
            break;
          }

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
              body: JSON.stringify({
                accessLevel: 'CAN_VIEW',
                id: userId,
                type: 'USER'
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            };
            successMessage = `Account ${accountId} shared successfully`;
            break;
          }

          case 'PAGE': {
            url = '/api/content/v1/share?sendEmail=false';
            options = {
              body: JSON.stringify({
                recipients: [
                  { id: userId, permission: 'HAS_ACCESS', type: 'user' }
                ],
                resources: [{ id: objectId, type: 'page' }]
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            };
            successMessage = `Page ${objectId} shared successfully`;
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

export async function updateOwner({ object, owner, tabId = null }) {
  try {
    if (!object || !object.typeId || !object.id) {
      return {
        statusDescription: 'Invalid object provided for owner update',
        statusTitle: 'Update Failed',
        statusType: 'danger',
        success: false
      };
    }

    const result = await executeInPage(
      async (object, newOwnerId) => {
        // console.log('Executing updateOwner:', object, newOwnerId);
        const fetchRequest = {
          body: { id: object.id, owner: parseInt(newOwnerId) },
          method: 'PUT',
          url: null
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
            error: `Update not supported for object type: ${object.typeId}`,
            success: false
          };
        }

        // console.log('Update fetch request:', fetchRequest);
        const response = await fetch(fetchRequest.url, {
          body: JSON.stringify(fetchRequest.body),
          headers: {
            'Content-Type': 'application/json'
          },
          method: fetchRequest.method
        });
        // console.log('Update response:', response);
        if (!response.ok) {
          const errorText = await response.text();
          return {
            error: errorText,
            statusCode: response.status,
            success: false
          };
        } else {
          return {
            objectId: object.id,
            success: true,
            typeName: object.typeName
          };
        }
      },
      [object.toJSON(), owner],
      tabId
    );

    if (result.success) {
      return {
        statusDescription: `Updated ${result.typeName?.toLowerCase() || 'object'} ${result.objectId}`,
        statusTitle: 'Updated Successfully',
        statusType: 'success',
        success: true
      };
    } else {
      return {
        statusDescription:
          result.error ||
          `Failed to update object. Status: ${result.statusCode || 'unknown'}`,
        statusTitle: 'Update Failed',
        statusType: 'danger',
        success: false
      };
    }
  } catch (error) {
    console.error('Error in updateOwner:', error);
    return {
      error: error.message,
      statusDescription: error.message,
      statusTitle: 'Update Failed',
      statusType: 'danger',
      success: false
    };
  }
}
