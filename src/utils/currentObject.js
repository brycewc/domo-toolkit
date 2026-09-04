import { DOMO_MATCH_PATTERNS, EXCLUDED_HOSTNAMES } from './constants';
import { instanceKeyFromUrl, instanceLabel, isDomoHostname, isLocalInstanceKey } from './instance';

/**
 * Main detection function that runs in page context
 * This is a self-contained function that can be stringified and injected via chrome.scripting.executeScript
 * It must have no external dependencies and returns serializable data
 * @returns {Object|null} Plain object with typeId, id, url, baseUrl properties
 */
export async function detectCurrentObject() {
  const url = location.href.toLowerCase();

  // Inlined copy of isDomoHostname from utils/instance.js: this function is
  // stringified and injected, so it cannot import. Keep the two in sync.
  const labels = location.hostname.split('.');
  const isLocalCandidate = labels.length > 1 && labels.includes('localhost');
  if (!isLocalCandidate && location.hostname !== 'domo.com' && !location.hostname.endsWith('.domo.com')) {
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

  function detectReportBuilderModal() {
    // Report Builder never touches the URL, so the id comes from React props.
    // Scans every dialog rather than matching a CSS-module class name, since only
    // the report modal carries reportContextId. Mirrored in contentScript.js.
    for (const dialog of document.querySelectorAll('[role="dialog"]')) {
      const fiberKey = Object.keys(dialog).find((k) => k.startsWith('__reactFiber$'));
      if (!fiberKey) continue;
      let fiber = dialog[fiberKey];
      for (let i = 0; i < 15 && fiber; i++) {
        const contextId = fiber.memoizedProps?.reportContextId;
        // An unsaved new report is keyed ':-1', which this deliberately misses.
        const match = typeof contextId === 'string' ? contextId.match(/:(\d+)$/) : null;
        if (match) return match[1];
        fiber = fiber.return;
      }
    }
    return null;
  }

  let objectType;
  let id;
  const parts = url.split(/[/?=&]/);

  const reportBuilderId = url.includes('app-studio') && !detectCardModal() ? detectReportBuilderModal() : null;

  switch (true) {
    case !!reportBuilderId:
      return {
        baseUrl: location.origin,
        id: reportBuilderId,
        parentId: parts[parts.indexOf('app-studio') + 1],
        typeId: 'REPORT_BUILDER',
        url
      };

    case url.includes('alerts/'):
      objectType = 'ALERT';
      break;

    case parts.includes('drillviewid'):
      objectType = 'DRILL_VIEW';
      id = parts[parts.indexOf('drillviewid') + 1];
      // Extract page/app context from query params (drill launched from a page or app)
      if (parts.includes('dataappid')) {
        return {
          appId: parts[parts.indexOf('dataappid') + 1],
          appViewId: parts[parts.indexOf('pageid') + 1],
          baseUrl: location.origin,
          id,
          typeId: objectType,
          url
        };
      } else if (parts.includes('pageid')) {
        return {
          baseUrl: location.origin,
          id,
          pageId: parts[parts.indexOf('pageid') + 1],
          typeId: objectType,
          url
        };
      }
      break;

    case parts.includes('cardid'):
      objectType = 'CARD';
      id = parts[parts.indexOf('cardid') + 1];
      // Extract page/app context from query params (e.g., analyzer launched from a page or app)
      if (parts.includes('dataappid')) {
        return {
          appId: parts[parts.indexOf('dataappid') + 1],
          appViewId: parts[parts.indexOf('pageid') + 1],
          baseUrl: location.origin,
          id,
          typeId: objectType,
          url
        };
      } else if (parts.includes('pageid')) {
        return {
          baseUrl: location.origin,
          id,
          pageId: parts[parts.indexOf('pageid') + 1],
          typeId: objectType,
          url
        };
      }
      break;

    case url.includes('kpis/details/'):
      // Prefer Drill Path ID from breadcrumb when on a drill path
      try {
        const bcSpan = document.querySelector('ul.breadcrumb li:last-child span[id]');
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
      id = parts[parts.indexOf('details') + 1];
      // Extract page/app context from URL prefix (card details viewed from a page or app)
      if (url.includes('app-studio')) {
        return {
          appId: parts[parts.indexOf('app-studio') + 1],
          appViewId: parts[parts.indexOf('pages') + 1],
          baseUrl: location.origin,
          id,
          typeId: objectType,
          url
        };
      } else if (parts.includes('page')) {
        return {
          baseUrl: location.origin,
          id,
          pageId: parts[parts.indexOf('page') + 1],
          typeId: objectType,
          url
        };
      }
      break;

    // App Studio: Prefer Card ID from modal when open; otherwise use Page ID from URL
    case url.includes('page/'):
    case url.includes('pages/'): {
      const kpiId = detectCardModal();
      if (kpiId) {
        objectType = 'CARD';
        id = kpiId;
        // Extract page/app context from current URL (card modal on a page or app)
        if (url.includes('app-studio')) {
          return {
            appId: parts[parts.indexOf('app-studio') + 1],
            appViewId: parts[parts.indexOf('pages') + 1],
            baseUrl: location.origin,
            id,
            typeId: objectType,
            url
          };
        }
        return {
          baseUrl: location.origin,
          id,
          pageId: parts[parts.indexOf('page') + 1],
          typeId: objectType,
          url
        };
      } else {
        if (!url.includes('app-studio')) {
          objectType = 'PAGE';
        } else {
          // console.log('Fetching App Studio object type...');
          // Need to fetch to determine if Worksheet or Data App
          try {
            const response = await fetch(`/api/content/v1/dataapps/${parts[parts.indexOf('app-studio') + 1]}`);
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
    }
    case url.includes('domoapp/card/edit/'):
      objectType = 'CARD';
      id = parts[parts.indexOf('edit') + 1];
      break;

    case url.includes('beastmode?'):
      objectType = 'BEAST_MODE_FORMULA';
      break;

    case url.includes('fusion/'):
      objectType = 'DATA_SOURCE';
      id = parts[parts.indexOf('fusion') + 1];
      break;
    case url.includes('datasources/') && parts[parts.indexOf('datasources') + 1].length > 5:
      objectType = 'DATA_SOURCE';
      break;

    case url.includes('dataflows/') && /^\d+$/.test(parts[parts.indexOf('details') + 1] || ''):
      objectType = 'DATAFLOW_TYPE_EXECUTION';
      break;

    case url.includes('dataflows/'):
      objectType = 'DATAFLOW_TYPE';
      // A DataFlow graph opened at a historical version carries ?versionId= (read from
      // location.search, which preserves case, since `url` above is lowercased). The object is
      // still the live DataFlow; the version is a qualifier the service worker stashes in context.
      return {
        baseUrl: location.origin,
        dataflowVersionId: new URLSearchParams(location.search).get('versionId') || null,
        typeId: objectType,
        url
      };

    case url.includes('scheduled-reports/history/'):
      objectType = 'REPORT_SCHEDULE';
      id = parts[parts.indexOf('history') + 1];
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

    case url.includes('workflows/user-task-response') && parts.includes('id'):
      objectType = 'HOPPER_TASK';
      id = parts[parts.indexOf('id') + 1];
      break;

    case url.includes('workflows/instances/') && !!parts[parts.indexOf('instances') + 3]:
      objectType = 'WORKFLOW_INSTANCE';
      break;

    case url.includes('workflows/') && !!parts[parts.indexOf('workflows') + 3]: {
      // Check for a selected nebulaFunction action in the workflow editor
      const selectedNode = document.querySelector('.react-flow__node.selected');
      if (selectedNode) {
        const nodeId = selectedNode.getAttribute('data-id');
        if (nodeId) {
          try {
            const workflowsIdx = parts.indexOf('workflows');
            const modelId = parts[workflowsIdx + 2];
            const version = parts[workflowsIdx + 3];

            const defResponse = await fetch(`/api/workflow/v2/models/${modelId}/versions/${version}/definition`);
            if (defResponse.ok) {
              const definition = await defResponse.json();
              const element = (definition.designElements || []).find((el) => el.id === nodeId);

              if (element?.data?.taskType === 'nebulaFunction' && element.data.metadata?.packageId) {
                if (element.data.metadata.version) {
                  return {
                    baseUrl: location.origin,
                    id: element.data.metadata.version,
                    parentId: element.data.metadata.packageId,
                    typeId: 'CODEENGINE_PACKAGE_VERSION',
                    url,
                    workflowModelId: modelId,
                    workflowVersionNumber: version
                  };
                }
                return {
                  baseUrl: location.origin,
                  id: element.data.metadata.packageId,
                  typeId: 'CODEENGINE_PACKAGE',
                  url
                };
              }

              if (element?.data?.isFormStart && element.data.formId) {
                return {
                  baseUrl: location.origin,
                  id: element.data.formId,
                  typeId: 'ENIGMA_FORM',
                  url
                };
              }

              // A user task that posts to a Task Center queue carries the queue id here
              if (element?.data?.selectedQueue) {
                return {
                  baseUrl: `${location.protocol}//${location.hostname}`,
                  id: element.data.selectedQueue,
                  typeId: 'HOPPER_QUEUE',
                  url,
                  workflowModelId: modelId,
                  workflowVersionNumber: version
                };
              }
            }
          } catch (e) {
            // Fall through to normal workflow version detection
          }
        }
      }
      objectType = 'WORKFLOW_MODEL_VERSION';
      break;
    }

    case url.includes('workflows/triggers/'): {
      const triggerModal = document.querySelector('[role="dialog"][class*="TimerModal"]');
      if (!triggerModal) {
        objectType = 'WORKFLOW_MODEL';
        break;
      }

      // Extract triggerId from React fiber tree (prop on parent component)
      const fiberKey = Object.keys(triggerModal).find((k) => k.startsWith('__reactFiber'));
      let triggerId = null;
      if (fiberKey) {
        let fiber = triggerModal[fiberKey];
        for (let i = 0; i < 15 && fiber; i++) {
          if (fiber.memoizedProps?.triggerId) {
            triggerId = fiber.memoizedProps.triggerId;
            break;
          }
          fiber = fiber.return;
        }
      }

      return {
        baseUrl: location.origin,
        id: triggerId,
        parentId: parts[parts.indexOf('triggers') + 1],
        typeId: 'WORKFLOW_TRIGGER',
        url
      };
    }

    case url.includes('workflows/'):
      objectType = 'WORKFLOW_MODEL';
      break;

    case url.includes('codeengine/'): {
      const packageId = parts[parts.indexOf('codeengine') + 1];
      const ceContainer = document.querySelector('div[class*="module_packageControls"]');
      const ceInput = ceContainer?.querySelector('input[class*="SelectListInputComponent"]');
      if (ceInput) {
        const ceMatch = ceInput.value.match(/^Version\s+(\d+\.\d+\.\d+)$/);
        if (ceMatch && packageId) {
          return {
            baseUrl: location.origin,
            id: ceMatch[1],
            parentId: packageId,
            typeId: 'CODEENGINE_PACKAGE_VERSION',
            url
          };
        }
      }
      objectType = 'CODEENGINE_PACKAGE';
      break;
    }

    case url.includes('appdb/'):
      objectType = 'MAGNUM_COLLECTION';
      break;

    case url.includes('assetlibrary') && parts.includes('designid'):
      objectType = 'APP';
      id = parts[parts.indexOf('designid') + 1];
      break;

    case url.includes('assetlibrary/'):
      objectType = 'APP';
      break;

    case url.includes('pro-code-editor/'):
      objectType = 'APP';
      id = parts[parts.indexOf('pro-code-editor') + 1];
      break;

    case url.includes('datacenter/documents/'): {
      const filesetId = parts[parts.indexOf('documents') + 1];
      if (url.includes('/preview/')) {
        objectType = 'FILESET_FILE';
        // Extract file path: everything after /preview/
        const previewIndex = url.indexOf('/preview/');
        const filePath = url.substring(previewIndex + '/preview/'.length).split('?')[0];
        // Return early with extra context for async ID resolution
        return {
          baseUrl: location.origin,
          id: null,
          resolveContext: { filePath, filesetId },
          typeId: objectType,
          url
        };
      }
      objectType = 'FILESET';
      break;
    }

    case url.includes('ai-services/projects/'):
      objectType = 'AI_PROJECT';
      break;

    // A model opens as a selection on the models list page (?model=<id>), so the
    // bare list URL carries no object.
    case url.includes('ai-services/models') && parts.includes('model'):
      objectType = 'AI_MODEL';
      break;

    case url.includes('ai-services/jupyter'): {
      const workspaceModal = document.querySelector('[class*="CreateWorkspaceModalV2_createModal"]');
      if (!workspaceModal) return null;

      // Extract workspaceId from React fiber tree (prop on ancestor component).
      // In create mode the prop is absent, so detection yields no object.
      const fiberKey = Object.keys(workspaceModal).find((k) => k.startsWith('__reactFiber'));
      let workspaceId = null;
      if (fiberKey) {
        let fiber = workspaceModal[fiberKey];
        for (let i = 0; i < 15 && fiber; i++) {
          if (fiber.memoizedProps?.workspaceId) {
            workspaceId = fiber.memoizedProps.workspaceId;
            break;
          }
          fiber = fiber.return;
        }
      }

      if (!workspaceId) return null;

      return {
        baseUrl: location.origin,
        id: workspaceId,
        typeId: 'DATA_SCIENCE_NOTEBOOK',
        url
      };
    }

    case url.includes('ai-library/toolkits/domo-provided/'):
      objectType = 'AI_TOOLKIT_DOMO_PROVIDED';
      break;

    case url.includes('ai-library/toolkits/'):
      objectType = 'AI_TOOLKIT';
      break;

    case url.includes('ai-library/agents/'):
      objectType = 'AGENT';
      break;

    case parts.includes('taskid'):
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

    case url.includes('queues') && parts.includes('id'): {
      // Task Center task IDs are case-sensitive, business-defined references
      // (e.g. "15AUG25_TS551E"), not UUIDs, so read id and queueId straight from
      // location.search to preserve their original case. The lowercased `url`
      // above would corrupt the id and make the task fetch fail.
      const search = new URLSearchParams(location.search);
      return {
        baseUrl: `${location.protocol}//${location.hostname}`,
        id: search.get('id'),
        parentId: search.get('queueId'),
        typeId: 'HOPPER_TASK',
        url
      };
    }

    case url.includes('queueid='):
      objectType = 'HOPPER_QUEUE';
      break;

    case url.includes('approval/request-details/'):
      objectType = 'APPROVAL';
      break;

    case url.includes('approval/create-request/'):
      objectType = 'TEMPLATE';
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
    case url.includes('cloud-integrations/'):
      objectType = 'WAREHOUSE_ACCOUNT';
      break;
    case url.includes('datacenter/accounts'): {
      const accountModal = document.querySelector('[role="dialog"][class*="AccountModal"]');
      if (!accountModal) return null;

      // Account ID lives only in the React fiber tree (props.account on an ancestor).
      // The modal is portaled to <body>, so DOM traversal can't reach the account row.
      // In create-account mode there is no account id, so detection yields no object.
      const fiberKey = Object.keys(accountModal).find((k) => k.startsWith('__reactFiber'));
      let accountId = null;
      if (fiberKey) {
        let fiber = accountModal[fiberKey];
        for (let i = 0; i < 15 && fiber; i++) {
          const account = fiber.memoizedProps?.account;
          if (account?.entityType === 'account' && account.id) {
            accountId = account.id;
            break;
          }
          fiber = fiber.return;
        }
      }

      if (!accountId) return null;

      return {
        baseUrl: location.origin,
        id: accountId,
        typeId: 'ACCOUNT',
        url
      };
    }
    case url.includes('workspaces/'):
      objectType = 'WORKSPACE';
      break;
    case url.includes('certifiedcontent') && url.includes('edit-form/'):
      objectType = 'CERTIFICATION_PROCESS';
      break;
    case url.includes('certification-center/request-details/'):
      objectType = 'CERTIFICATION';
      break;

    case url.includes('governance-toolkit'): {
      const jobElement = document.querySelector('[class*="job-overview-top"]');
      if (!jobElement) return null;

      const fiberKey = Object.keys(jobElement).find((k) => k.startsWith('__reactFiber$'));
      if (!fiberKey) return null;

      let fiber = jobElement[fiberKey];
      let jobData = null;

      // Walk up the fiber tree, checking each component's hooks chain
      while (fiber && !jobData) {
        let hook = fiber.memoizedState;
        while (hook) {
          const val = hook.memoizedState;
          // Check both direct state and ref.current (useRef wraps as { current: ... })
          const candidate = val?.current ?? val;
          if (
            candidate &&
            typeof candidate === 'object' &&
            !Array.isArray(candidate) &&
            typeof candidate.jobId === 'string' &&
            typeof candidate.applicationId === 'string'
          ) {
            jobData = candidate;
            break;
          }
          hook = hook.next;
        }
        fiber = fiber.return;
      }

      if (!jobData) return null;

      return {
        baseUrl: location.origin,
        id: jobData.jobId,
        parentId: jobData.applicationId,
        typeId: 'EXECUTOR_JOB',
        url
      };
    }

    case url.includes('/admin/'): {
      const adminTypeMap = {
        '/admin/pages': { scopeKey: 'pageId', typeId: 'PAGE' }
      };

      const pathname = location.pathname;
      let adminConfig = null;
      for (const [path, config] of Object.entries(adminTypeMap)) {
        if (pathname.startsWith(path)) {
          adminConfig = config;
          break;
        }
      }

      if (!adminConfig) return null;

      try {
        const detailPanel = document.querySelector('.bulk-item-details-content');
        if (!detailPanel) return null;

        // angular.element() is available in MAIN world on Domo admin pages
        const scope = angular.element(detailPanel).scope();
        const selectedId = scope?.details?.[adminConfig.scopeKey];
        if (selectedId) {
          return {
            baseUrl: location.origin,
            id: String(selectedId),
            typeId: adminConfig.typeId,
            url
          };
        }
      } catch (e) {
        // Angular not available or scope access failed
      }

      return null;
    }

    default:
      return null;
  }

  // Return plain serializable object
  // Service worker will construct DomoObject from this data
  return {
    baseUrl: location.origin,
    id: id, // May be null, will be extracted by service worker if needed
    typeId: objectType,
    url: url
  };
}

/**
 * Get a valid tab ID for making API calls to the specified Domo instance.
 * Prefers the current active tab if it's on the correct instance.
 *
 * Matches on the tab's authority (host plus port) rather than an origin prefix.
 * Chrome match patterns cannot express a port, so a local instance on :9128 has
 * to be filtered client-side, and comparing authorities also means a local
 * instance served over https (HTTPS=true) still matches.
 * @param {string} instance - The instance key (e.g. 'mycompany' or 'dev.localhost:9128')
 * @returns {Promise<number>} The tab ID to use for API calls
 * @throws {Error} If no valid tab is found on the correct instance
 */
export async function getValidTabForInstance(instance) {
  const isOnInstance = (url) => {
    try {
      return instanceKeyFromUrl(url) === instance;
    } catch {
      return false;
    }
  };

  // First, try the current active tab
  const [activeTab] = await chrome.tabs.query({
    active: true,
    currentWindow: true
  });

  if (activeTab?.url && isOnInstance(activeTab.url)) {
    return activeTab.id;
  }

  // If active tab isn't on the right instance, search for any tab on that instance
  const candidateTabs = await chrome.tabs.query(
    isLocalInstanceKey(instance) ? { url: DOMO_MATCH_PATTERNS } : { url: `https://${instance}.domo.com/*` }
  );
  const matchingTab = candidateTabs.find((tab) => tab.url && isOnInstance(tab.url));

  if (matchingTab) {
    return matchingTab.id;
  }

  throw new Error(
    `No open tab found for ${instanceLabel(instance)}. Please open a tab on that Domo instance and try again.`
  );
}

/**
 * Check if a URL is an actionable Domo page: a domo.com domain (exact or any
 * subdomain), or a local dev candidate, that is NOT one of the excluded hosts
 * (support, developer, marketing, embed, etc.). Excluded hosts are treated as
 * non-Domo so that no extension behavior (detection, title rewriting, in-page
 * execution) ever runs on them. This is the single gate the background and
 * executeInPage rely on, so folding the exclusion in here keeps every call site
 * consistent.
 *
 * Deliberately structural: a `*.localhost` host passes here so the background is
 * allowed to inject the window.bootstrap probe that decides whether it is really
 * running Domo. Whether a local origin is *confirmed* is a separate question,
 * answered by isVerifiedDomoOrigin in the background.
 * @param {string} url - A full URL string
 * @returns {boolean}
 */
export function isDomoUrl(url) {
  try {
    const { hostname } = new URL(url);
    if (EXCLUDED_HOSTNAMES.includes(hostname)) {
      return false;
    }
    return isDomoHostname(hostname);
  } catch {
    return false;
  }
}

/**
 * Send a tab somewhere else, but only if it is still showing one of the given
 * objects. Used after a delete: the tab needs rescuing from a page that no
 * longer exists, yet if the user has since navigated elsewhere (a different
 * page, the Data Center, another site entirely) then yanking them away from
 * whatever they moved on to is worse than doing nothing.
 *
 * "Still showing" is answered from the tab's live URL rather than the cached
 * detected context, because the cache only refreshes on Domo URLs: navigating
 * the tab off Domo leaves the old object cached and would read as still there.
 * A tab counts as showing an object when its URL carries that object's ID as a
 * whole path segment or parameter value, so a nested view of the same object
 * (a card modal over a page, a collection's other tabs) still qualifies.
 * @param {Object} options
 * @param {Array<string|number>} options.ids - IDs of the deleted objects; any one of them appearing in the tab's URL means the tab is still on deleted content
 * @param {number} options.tabId - Tab to redirect
 * @param {string} options.url - Where to send the tab
 * @returns {Promise<boolean>} True when the tab was redirected
 */
export async function redirectTabIfViewingObject({ ids, tabId, url }) {
  let tabUrl;
  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab?.url;
  } catch {
    // Tab was closed, so there is nothing to rescue
    return false;
  }
  if (!tabUrl) return false;

  // A tab moved to another instance (or another site) is not on the deleted
  // object, however familiar the IDs in its URL look.
  try {
    if (new URL(tabUrl).origin !== new URL(url).origin) return false;
  } catch {
    return false;
  }

  // Split on every URL delimiter so an ID matches only a whole segment or value,
  // never a digit run inside a longer ID.
  const tokens = new Set(tabUrl.toLowerCase().split(/[^a-z0-9-]+/));
  const isViewing = (ids || []).some((id) => id != null && tokens.has(String(id).toLowerCase()));
  if (!isViewing) return false;

  await chrome.tabs.update(tabId, { url });
  return true;
}
