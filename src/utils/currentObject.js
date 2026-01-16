import { DomoObject, getObjectType } from '@/models';

/**
 * Fetch object details from the Domo API and enrich the DomoObject with metadata
 * @param {DomoObject} domoObject - The DomoObject to enrich
 * @returns {Promise<DomoObject>} The enriched DomoObject
 */
async function fetchAndEnrichObjectDetails(domoObject) {
  const objectType = getObjectType(domoObject.typeId);

  // Only fetch if the object type has API configuration
  if (!objectType || !objectType.api) {
    return domoObject;
  }

  const { method, endpoint, pathToName, bodyTemplate } = objectType.api;

  try {
    // Build the endpoint URL
    let url = `/api${endpoint}`.replace('{id}', domoObject.id);

    // Prepare fetch options
    const options = {
      method,
      credentials: 'include'
    };

    // Add body for POST requests
    if (method !== 'GET' && bodyTemplate) {
      options.body = JSON.stringify(bodyTemplate).replace(
        /{id}/g,
        domoObject.id
      );
      options.headers = {
        'Content-Type': 'application/json'
      };
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      console.warn(
        `Failed to fetch details for ${domoObject.typeId} ${domoObject.id}: HTTP ${response.status}`
      );
      return domoObject;
    }

    const data = await response.json();

    // Extract the full object data and store in metadata
    const details = pathToName
      .split('.')
      .reduce((current, prop) => current?.[prop.split('[')[0]], data);

    // Store the full response data in metadata.details
    domoObject.metadata.details = data;
    domoObject.metadata.name = pathToName
      .split('.')
      .reduce((current, prop) => current?.[prop], data);

    // If the object type has parents, try to fetch the parent
    // Note: We're already in page context (content script), so pass inPageContext=true
    if (objectType.parents && objectType.parents.length > 0) {
      try {
        const parentId = await domoObject.getParent(true);
        if (parentId && domoObject.metadata?.parent) {
          console.log(
            `Fetched parent for ${domoObject.typeId} ${domoObject.id}: ${parentId}`
          );
        }
      } catch (parentError) {
        // Parent fetch is optional, so just log and continue
        console.log(
          `Could not fetch optional parent for ${domoObject.typeId} ${domoObject.id}:`,
          parentError.message
        );
      }
    }

    return domoObject;
  } catch (error) {
    console.error(`Error fetching details for ${domoObject.typeId}:`, error);
    return domoObject;
  }
}

export async function getCurrentObject() {
  const domoObject = detectCurrentObject();
  if (!domoObject) {
    // Clear the stored object when on a page without a current object
    await chrome.storage.local.set({ currentObject: null });
    // document.title = 'Domo';
    return null;
  }

  // Fetch and enrich with API details
  const enrichedObject = await fetchAndEnrichObjectDetails(domoObject);

  await storeCurrentObject(enrichedObject);
  return enrichedObject;
}

/**
 * Detects the current object from the page and stores it in Chrome storage
 * This should be called from the content script when the page loads or URL changes
 */
export async function storeCurrentObject(domoObject) {
  console.log('Detected Domo object:', domoObject);
  // Update the page title if it's just "Domo"
  if (document.title === 'Domo' && domoObject.metadata?.name) {
    document.title = `${domoObject.metadata.name} - Domo`;
  }

  // For objects detected from the current page, use the actual current URL
  // This avoids unnecessary API calls to build URLs for objects we're already viewing
  let url = domoObject.url;
  if (!url && location.href.includes(domoObject.id)) {
    url = location.href;
  }
  // Only build the URL if we still don't have one and it requires a parent
  if (!url && domoObject.requiresParent()) {
    url = await domoObject.buildUrl(domoObject.baseUrl);
  }

  // Store in chrome.storage for quick access
  // We need to serialize the object because DomoObject instances can't be directly stored
  const serialized = {
    objectType: {
      id: domoObject.typeId,
      name: domoObject.typeName
    },
    id: domoObject.id,
    baseUrl: domoObject.baseUrl,
    url: url,
    metadata: domoObject.metadata
  };

  await chrome.storage.local.set({ currentObject: serialized });
}

/**
 * Retrieves the current object from Chrome storage and converts it to a DomoObject instance
 * @returns {Promise<DomoObject|null>} DomoObject instance or null if no object is stored
 */
export async function fetchCurrentObjectAsDomoObject() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['currentObject'], (result) => {
      const storedObject = result.currentObject;

      if (!storedObject || !storedObject.objectType || !storedObject.id) {
        resolve(null);
        return;
      }

      // If it's already a DomoObject instance (has methods), return it
      if (storedObject instanceof DomoObject) {
        resolve(storedObject);
        return;
      }

      // Convert plain object to DomoObject instance
      try {
        const baseUrl =
          storedObject.baseUrl ||
          (storedObject.url ? new URL(storedObject.url).origin : null);

        if (!baseUrl) {
          console.warn('No baseUrl found in stored object');
          resolve(null);
          return;
        }

        const domoObject = new DomoObject(
          storedObject.objectType.id,
          storedObject.id,
          baseUrl,
          storedObject.metadata || {}
        );

        resolve(domoObject);
      } catch (error) {
        console.error('Error converting stored object to DomoObject:', error);
        resolve(null);
      }
    });
  });
}

/**
 * Listens for changes to currentObject in Chrome storage and calls the callback with a DomoObject instance
 * @param {function(DomoObject|null): void} callback - Function to call when currentObject changes
 * @returns {function(): void} Cleanup function to remove the listener
 */
export function onCurrentObjectChange(callback) {
  const handleStorageChange = async (changes, areaName) => {
    if (areaName === 'local' && changes.currentObject) {
      const newValue = changes.currentObject.newValue;

      if (!newValue || !newValue.objectType || !newValue.id) {
        callback(null);
        return;
      }

      // If it's already a DomoObject instance, use it
      if (newValue instanceof DomoObject) {
        callback(newValue);
        return;
      }

      // Convert plain object to DomoObject instance
      try {
        const baseUrl =
          newValue.baseUrl ||
          (newValue.url ? new URL(newValue.url).origin : null);

        if (!baseUrl) {
          console.warn('No baseUrl found in updated object');
          callback(null);
          return;
        }

        const domoObject = new DomoObject(
          newValue.objectType.id,
          newValue.id,
          baseUrl,
          newValue.metadata || {}
        );

        callback(domoObject);
      } catch (error) {
        console.error('Error converting updated object to DomoObject:', error);
        callback(null);
      }
    }
  };

  chrome.storage.onChanged.addListener(handleStorageChange);

  // Return cleanup function
  return () => {
    chrome.storage.onChanged.removeListener(handleStorageChange);
  };
}

/**
 * Detects the Domo object type and ID based on the current URL
 * Based on the logic from Copy Current Object ID bookmarklet
 * @returns {DomoObject | null} DomoObject instance, or null if not recognized
 */

function detectCurrentObject() {
  const url = location.href;

  if (!location.hostname.includes('domo.com')) {
    return null;
  }

  let objectType;
  let id;
  const parts = url.split(/[/?=&]/);

  switch (true) {
    case url.includes('alerts/'):
      objectType = 'ALERT';
      break;

    case url.includes('drillviewid='):
      objectType = 'DRILL_VIEW';
      break;

    case url.includes('kpis/details/'):
      // Prefer Drill Path ID from breadcrumb when on a drill path
      try {
        const bcSpan = document.querySelector(
          'ul.breadcrumb li:last-child span[id]'
        );
        const bcId = bcSpan && (bcSpan.id || bcSpan.getAttribute('id'));
        if (bcId && bcId.indexOf(':') > -1) {
          // Format: dr:<drill_path_id>:<card_id>
          const partsColon = bcId.split(':');
          const dpIdRaw = partsColon[1];
          const dpId = dpIdRaw && (dpIdRaw.match(/\d+/) || [])[0];
          if (dpId) {
            objectType = 'DRILL_VIEW';
            id = dpId;
            break;
          }
        }
      } catch (e) {
        // ignore and fall back
      }
      // Fallback: Card ID from URL
      objectType = 'CARD';
      break;

    // App Studio: Prefer Card ID from modal when open; otherwise use Page ID from URL
    case url.includes('page/'):
    case url.includes('pages/'):
      const kpiId = detectCardModal();
      if (kpiId) {
        objectType = 'CARD';
        id = kpiId;
      } else {
        objectType = url.includes('app-studio') ? 'DATA_APP_VIEW' : 'PAGE';
      }
      break;

    case url.includes('beastmode?'):
      objectType = 'BEAST_MODE_FORMULA';
      break;

    case url.includes('datasources/') &&
      parts[parts.indexOf('datasources') + 1].length > 5:
      objectType = 'DATA_SOURCE';
      break;

    case url.includes('dataflows/'):
      objectType = 'DATAFLOW_TYPE';
      break;

    case url.includes('people/'):
      objectType = 'USER';
      break;

    case url.includes('/up/'):
      objectType = 'USER';
      id = parts[parts.indexOf('up') + 1];
      break;

    case url.includes('groups/'):
      objectType = 'GROUP';
      break;

    case url.includes('admin/roles/'):
      objectType = 'ROLE';
      break;

    case url.includes('instances/') && parts.length >= 8:
      objectType = 'WORKFLOW_INSTANCE';
      break;

    case url.includes('workflows/'):
      objectType = 'WORKFLOW_MODEL';
      break;

    case url.includes('codeengine/'):
      objectType = 'CODEENGINE_PACKAGE';
      break;

    case url.includes('appDb/'):
      objectType = 'MAGNUM_COLLECTION';
      break;

    case url.includes('assetlibrary/'):
      objectType = 'APP';
      break;

    case url.includes('pro-code-editor/'):
      objectType = 'APP';
      id = parts[parts.indexOf('pro-code-editor') + 1];
      break;

    case url.includes('filesets/'):
      objectType = 'FILESET';
      break;

    case url.includes('ai-services/projects/'):
      objectType = 'AI_PROJECT';
      break;

    case url.includes('ai-services/models/'):
      objectType = 'AI_MODEL';
      break;

    case url.includes('taskId='):
      objectType = 'PROJECT_TASK';
      break;

    case url.includes('project/'):
      objectType = 'PROJECT';
      break;

    case url.includes('key-results/'):
      objectType = 'KEY_RESULT';
      break;

    case url.includes('goals/profile/user/') && url.includes('/goal/'):
      objectType = 'OBJECTIVE';
      id = parts[parts.indexOf('goal') + 1];
      break;

    case url.includes('goals/profile/user/'):
      objectType = 'USER';
      id = parts[parts.indexOf('user') + 1];
      break;

    case url.includes('goals/tree/'):
      objectType = 'OBJECTIVE';
      break;

    case url.includes('goals/profile/'):
      objectType = 'OBJECTIVE';
      id = parts[parts.indexOf('goal') + 1];
      break;

    case url.includes('goals/'):
      objectType = 'OBJECTIVE';
      break;

    case url.includes('queues') && url.includes('id='):
      objectType = 'HOPPER_TASK';
      break;

    case url.includes('queueId='):
      objectType = 'HOPPER_QUEUE';
      break;

    case url.includes('approval/request-details/'):
      objectType = 'APPROVAL';
      break;

    case url.includes('approval/edit-request-form/'):
      objectType = 'TEMPLATE';
      break;

    case url.includes('jupyter-workspaces/'):
      objectType = 'DATA_SCIENCE_NOTEBOOK';
      break;

    case url.includes('domo-everywhere/publications'):
      objectType = 'PUBLICATION';
      break;

    case url.includes('sandbox/repositories/'):
      objectType = 'REPOSITORY';
      break;

    default:
      return null;
  }

  // Get the object type model to extract typeName and ID
  const typeModel = getObjectType(objectType);
  if (!typeModel) {
    return null;
  }

  // Extract ID using model if not already extracted
  if (!id) {
    id = typeModel.extractObjectId(url);
  }

  if (!id) {
    return null;
  }

  // Extract baseUrl from current location
  const baseUrl = `${location.protocol}//${location.hostname}`;

  return new DomoObject(objectType, id, baseUrl);
}

/**
 * Detects if a card modal is open and returns the card ID
 * @returns {string|null} Card ID if modal is open, null otherwise
 */
export function detectCardModal() {
  // Look for modal element with ID pattern: card-details-modal-{cardId}
  const modalElement = document.querySelector('[id^="card-details-modal-"]');
  if (modalElement && modalElement.id) {
    const match = modalElement.id.match(/card-details-modal-(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}
