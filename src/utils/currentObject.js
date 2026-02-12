/**
 * Get a valid tab ID for making API calls to the specified Domo instance.
 * Prefers the current active tab if it's on the correct instance.
 * @param {string} instance - The Domo instance subdomain (e.g., 'mycompany')
 * @returns {Promise<number>} The tab ID to use for API calls
 * @throws {Error} If no valid tab is found on the correct instance
 */
export async function getValidTabForInstance(instance) {
  const expectedOrigin = `https://${instance}.domo.com`;

  // First, try the current active tab
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (activeTab?.url?.startsWith(expectedOrigin)) {
    return activeTab.id;
  }

  // If active tab isn't on the right instance, search for any tab on that instance
  const matchingTabs = await chrome.tabs.query({
    url: `${expectedOrigin}/*`
  });

  if (matchingTabs.length > 0) {
    return matchingTabs[0].id;
  }

  throw new Error(
    `No open tab found for ${instance}.domo.com. Please open a tab on that Domo instance and try again.`
  );
}

/**
 * Main detection function that runs in page context
 * This is a self-contained function that can be stringified and injected via chrome.scripting.executeScript
 * It must have no external dependencies and returns serializable data
 * @returns {Object|null} Plain object with typeId, id, url, baseUrl properties
 */
export async function detectCurrentObject() {
  const url = location.href;

  if (!location.hostname.includes('domo.com')) {
    return null;
  }

  // Helper function to detect card modal (must be inline for injection)
  function detectCardModal() {
    const modalElement = document.querySelector('[id^="card-details-modal-"]');
    if (modalElement && modalElement.id) {
      const match = modalElement.id.match(/card-details-modal-(\d+)/);
      if (match && match[1]) {
        return match[1];
      }
    }
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

    case url.includes('cardid='):
      objectType = 'CARD';
      id = parts[parts.indexOf('cardid') + 1];
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
        if (!url.includes('app-studio')) {
          objectType = 'PAGE';
        } else {
          // console.log('Fetching App Studio object type...');
          // Need to fetch to determine if Worksheet or Data App
          try {
            const response = await fetch(
              `/api/content/v1/dataapps/${parts[parts.indexOf('app-studio') + 1]}`
            );
            // console.log('Fetch response received:', response);
            if (response.ok) {
              const data = await response.json();
              // console.log('Fetch data:', data);
              if (data && data.type === 'worksheet') {
                objectType = 'WORKSHEET_VIEW';
              } else {
                objectType = 'DATA_APP_VIEW';
              }
            } else {
              objectType = 'DATA_APP_VIEW';
            }
          } catch (e) {
            console.error('Error fetching App Studio object type:', e);
            objectType = 'DATA_APP_VIEW';
          }
        }
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

    case url.includes('instances/') && parts[parts.indexOf('instances') + 3]:
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

    case url.includes('filesets/'): {
      const filesetId = parts[parts.indexOf('filesets') + 1];
      if (url.includes('/preview/')) {
        objectType = 'FILESET_FILE';
        // Extract file path: everything after /preview/
        const previewIndex = url.indexOf('/preview/');
        const filePath = url
          .substring(previewIndex + '/preview/'.length)
          .split('?')[0];
        // Return early with extra context for async ID resolution
        return {
          typeId: objectType,
          id: null,
          url,
          baseUrl: `${location.protocol}//${location.hostname}`,
          resolveContext: { filesetId, filePath }
        };
      }
      objectType = 'FILESET';
      break;
    }

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

    case url.includes('workspaces/'):
      objectType = 'WORKSPACE';
      break;
    default:
      return null;
  }

  // Return plain serializable object
  // Service worker will construct DomoObject from this data
  return {
    typeId: objectType,
    id: id, // May be null, will be extracted by service worker if needed
    url: url,
    baseUrl: `${location.protocol}//${location.hostname}`
  };
}
