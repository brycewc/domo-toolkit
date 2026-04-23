import {
  getOwnedAccounts,
  getOwnedAiModels,
  getOwnedAiProjects,
  getOwnedAlerts,
  getOwnedAppDbCollections,
  getOwnedApprovals,
  getOwnedApprovalTemplates,
  getOwnedAppStudioApps,
  getOwnedCards,
  getOwnedCodeEnginePackages,
  getOwnedCustomApps,
  getOwnedDataflows,
  getOwnedDatasets,
  getOwnedFilesets,
  getOwnedFunctions,
  getOwnedGoals,
  getOwnedGroups,
  getOwnedJupyterWorkspaces,
  getOwnedMetrics,
  getOwnedPages,
  getOwnedProjectsAndTasks,
  getOwnedRepositories,
  getOwnedSubscriptions,
  getOwnedTaskCenterQueues,
  getOwnedTaskCenterTasks,
  getOwnedWorkflows,
  getOwnedWorksheets,
  getOwnedWorkspaces,
  getUserOwnedAppStudioApps,
  getUserOwnedWorksheets,
  transferAccounts,
  transferAiModels,
  transferAiProjects,
  transferAlerts,
  transferAppDbCollections,
  transferApprovals,
  transferApprovalTemplates,
  transferAppStudioApps,
  transferCards,
  transferCodeEnginePackages,
  transferCustomApps,
  transferDataflows,
  transferDatasets,
  transferFilesets,
  transferFunctions,
  transferGoals,
  transferGroups,
  transferJupyterWorkspaces,
  transferMetrics,
  transferPages,
  transferProjectsAndTasks,
  transferRepositories,
  transferSubscriptions,
  transferTaskCenterQueues,
  transferTaskCenterTasks,
  transferWorkflows,
  transferWorksheets,
  transferWorkspaces
} from '@/services';

/**
 * Registry of all transferable object types.
 * Each entry defines how to list and transfer ownership for that type.
 * Sorted alphabetically by key.
 */
export const TRANSFER_TYPES = [
  {
    getOwned: getOwnedAccounts,
    key: 'accounts',
    label: 'Accounts',
    requiredAuthority: 'account.admin',
    transfer: transferAccounts
  },
  {
    getOwned: getOwnedAiModels,
    key: 'aiModels',
    label: 'AI Models',
    requiredAuthority: 'ai.services.admin',
    transfer: transferAiModels
  },
  {
    getOwned: getOwnedAiProjects,
    key: 'aiProjects',
    label: 'AI Projects',
    requiredAuthority: 'ai.services.admin',
    transfer: transferAiProjects
  },
  {
    getOwned: getOwnedAlerts,
    key: 'alerts',
    label: 'Alerts',
    requiredAuthority: 'alert.admin',
    transfer: transferAlerts
  },
  {
    getOwned: getOwnedAppStudioApps,
    getOwnedForTransfer: getUserOwnedAppStudioApps,
    key: 'appStudioApps',
    label: 'App Studio Apps',
    requiredAuthority: 'content.admin',
    transfer: transferAppStudioApps
  },
  {
    getOwned: getOwnedAppDbCollections,
    key: 'appDbCollections',
    label: 'AppDB Collections',
    requiredAuthority: 'datastore.admin',
    transfer: transferAppDbCollections
  },
  {
    getOwned: getOwnedApprovals,
    key: 'approvals',
    label: 'Approvals',
    requiredAuthority: 'approvalcenter.admin',
    transfer: transferApprovals
  },
  {
    getOwned: getOwnedApprovalTemplates,
    key: 'approvalTemplates',
    label: 'Approval Templates',
    requiredAuthority: 'approvalcenter.admin',
    transfer: transferApprovalTemplates
  },
  {
    getOwned: getOwnedCards,
    key: 'cards',
    label: 'Cards',
    requiredAuthority: 'content.admin',
    transfer: transferCards
  },
  {
    getOwned: getOwnedCodeEnginePackages,
    key: 'codeEnginePackages',
    label: 'Code Engine Packages',
    requiredAuthority: 'codeengine.package.admin',
    transfer: transferCodeEnginePackages
  },
  {
    getOwned: getOwnedCustomApps,
    key: 'customApps',
    label: 'Custom App Designs',
    requiredAuthority: 'app.admin',
    transfer: transferCustomApps
  },
  {
    getOwned: getOwnedDataflows,
    key: 'dataflows',
    label: 'DataFlows',
    requiredAuthority: 'dataflow.admin',
    transfer: transferDataflows
  },
  {
    getOwned: getOwnedDatasets,
    key: 'datasets',
    label: 'DataSets',
    requiredAuthority: 'dataset.admin',
    transfer: transferDatasets
  },
  {
    getOwned: getOwnedSubscriptions,
    key: 'subscriptions',
    label: 'Domo Everywhere Subscriptions',
    requiredAuthority: 'publish.subscribers.manage',
    transfer: transferSubscriptions
  },
  {
    getOwned: getOwnedFilesets,
    key: 'filesets',
    label: 'FileSets',
    requiredAuthority: 'fileset.admin',
    transfer: transferFilesets
  },
  {
    getOwned: getOwnedFunctions,
    key: 'functions',
    label: 'Functions (Beast Modes & Variables)',
    requiredAuthority: 'content.admin',
    transfer: transferFunctions
  },
  {
    getOwned: getOwnedGoals,
    key: 'goals',
    label: 'Goals',
    requiredAuthority: 'goal.admin',
    transfer: transferGoals
  },
  {
    getOwned: getOwnedGroups,
    key: 'groups',
    label: 'Groups',
    requiredAuthority: 'group.admin',
    transfer: transferGroups
  },
  {
    getOwned: getOwnedJupyterWorkspaces,
    key: 'jupyterWorkspaces',
    label: 'Jupyter Workspaces',
    requiredAuthority: 'datascience.notebooks.admin',
    transfer: transferJupyterWorkspaces
  },
  {
    getOwned: getOwnedMetrics,
    key: 'metrics',
    label: 'Metrics',
    requiredAuthority: 'ai.services.admin',
    transfer: transferMetrics
  },
  {
    getOwned: getOwnedPages,
    key: 'pages',
    label: 'Pages (Dashboards)',
    requiredAuthority: 'content.admin',
    transfer: transferPages
  },
  {
    getOwned: getOwnedProjectsAndTasks,
    key: 'projectsAndTasks',
    label: 'Projects & Tasks',
    requiredAuthority: 'tasks.admin',
    transfer: transferProjectsAndTasks
  },
  {
    getOwned: getOwnedRepositories,
    key: 'repositories',
    label: 'Sandbox Repositories',
    requiredAuthority: 'versions.repository.admin',
    transfer: transferRepositories
  },
  {
    getOwned: getOwnedTaskCenterQueues,
    key: 'taskCenterQueues',
    label: 'Task Center Queues',
    requiredAuthority: 'queue.admin',
    transfer: transferTaskCenterQueues
  },
  {
    getOwned: getOwnedTaskCenterTasks,
    key: 'taskCenterTasks',
    label: 'Task Center Tasks',
    requiredAuthority: 'queue.admin',
    transfer: transferTaskCenterTasks
  },
  {
    getOwned: getOwnedWorkflows,
    key: 'workflows',
    label: 'Workflows',
    requiredAuthority: 'workflow.admin',
    transfer: transferWorkflows
  },
  {
    getOwned: getOwnedWorksheets,
    getOwnedForTransfer: getUserOwnedWorksheets,
    key: 'worksheets',
    label: 'Worksheets',
    requiredAuthority: 'content.admin',
    transfer: transferWorksheets
  },
  {
    getOwned: getOwnedWorkspaces,
    key: 'workspaces',
    label: 'Workspaces',
    requiredAuthority: 'workspace.admin',
    transfer: transferWorkspaces
  }
];

/**
 * Maps TRANSFER_TYPES keys to DomoObjectType ID strings for audit logging.
 * Unlike TYPE_KEY_TO_DOMO_TYPE in GetOwnedObjectsView (which uses null for
 * non-navigable types to skip link construction), this map is complete so
 * every row in the transfer log has a type label.
 *
 * For projectsAndTasks, the log row builder should emit 'PROJECT' or 'TASK'
 * based on the item's subType rather than reading this map.
 */
export const TYPE_KEY_TO_LOG_TYPE = {
  accounts: 'ACCOUNT',
  aiModels: 'AI_MODEL',
  aiProjects: 'AI_PROJECT',
  alerts: 'ALERT',
  appDbCollections: 'MAGNUM_COLLECTION',
  approvals: 'APPROVAL',
  approvalTemplates: 'TEMPLATE',
  appStudioApps: 'DATA_APP',
  cards: 'CARD',
  codeEnginePackages: 'CODEENGINE_PACKAGE',
  customApps: 'APP',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE',
  filesets: 'FILESET',
  functions: 'BEAST_MODE_FORMULA',
  goals: 'GOAL',
  groups: 'GROUP',
  jupyterWorkspaces: 'DATA_SCIENCE_NOTEBOOK',
  metrics: 'METRIC',
  pages: 'PAGE',
  projectsAndTasks: null,
  repositories: 'REPOSITORY',
  subscriptions: 'SUBSCRIPTION',
  taskCenterQueues: 'HOPPER_QUEUE',
  taskCenterTasks: 'HOPPER_TASK',
  workflows: 'WORKFLOW_MODEL',
  workspaces: 'WORKSPACE'
};

/**
 * Count items in a raw owned-objects result, accounting for the nested
 * projectsAndTasks shape.
 *
 * @param {string} typeKey
 * @param {*} owned - Raw result from getOwned / getOwnedForTransfer
 * @returns {number}
 */
export function countOwned(typeKey, owned) {
  if (!owned) return 0;
  if (typeKey === 'projectsAndTasks') {
    return (owned.projects?.length || 0) + (owned.tasks?.length || 0);
  }
  return owned.length || 0;
}

/**
 * Flatten a raw owned-objects result into `[{id, name, subType?}, ...]` for
 * audit logging. projectsAndTasks gets `subType: 'Project' | 'Task'` so the
 * log row builder can emit accurate type labels.
 *
 * @param {string} typeKey
 * @param {*} owned - Raw result from getOwned / getOwnedForTransfer
 * @returns {Array<{id: any, name: string, subType?: string}>}
 */
export function flattenOwned(typeKey, owned) {
  if (!owned) return [];
  if (typeKey === 'projectsAndTasks') {
    return [
      ...(owned.projects || []).map((p) => ({ ...p, subType: 'Project' })),
      ...(owned.tasks || []).map((t) => ({ ...t, subType: 'Task' }))
    ];
  }
  return Array.isArray(owned) ? owned : [];
}

/**
 * Transfer all ownership from one user to another for selected types.
 * Runs each enabled type in parallel via Promise.allSettled.
 *
 * @param {Object} params
 * @param {Set<string>} params.enabledTypes - Set of type keys to transfer
 * @param {number} params.fromUserId - Source user ID
 * @param {Function} params.onTypeProgress - Callback: ({ typeKey, status, count, result }) => void
 * @param {Object} [params.seededOwnedObjects] - Optional pre-fetched owned map
 *   keyed by type.key → raw result from getOwned. When present for a type that
 *   has no dedicated getOwnedForTransfer, Phase 1 is skipped. Types with
 *   getOwnedForTransfer always re-fetch via that variant even when seeded,
 *   since its result may differ from getOwned.
 * @param {number} params.tabId - Chrome tab ID
 * @param {number} params.toUserId - Destination user ID
 * @returns {Promise<Map<string, {count: number, errors: Array, failed: number, succeeded: number}>>}
 */
export async function transferAllOwnership({
  enabledTypes,
  fromUserId,
  onTypeProgress,
  seededOwnedObjects,
  tabId,
  toUserId
}) {
  const results = new Map();

  const transferPromises = TRANSFER_TYPES.filter((type) =>
    enabledTypes.has(type.key)
  ).map(async (type) => {
    // Hoisted so the catch block can still emit a meaningful `attempted` list
    // when Phase 2 fails after Phase 1 succeeded.
    let owned;
    try {
      // Phase 1: List owned objects (or reuse seeded data when safe)
      const seed =
        !type.getOwnedForTransfer && seededOwnedObjects?.[type.key];

      if (seed) {
        owned = seed;
      } else {
        onTypeProgress?.({
          count: 0,
          status: 'listing',
          typeKey: type.key
        });
        const listOwned = type.getOwnedForTransfer || type.getOwned;
        owned = await listOwned(fromUserId, tabId);
      }

      const count = countOwned(type.key, owned);

      if (count === 0) {
        const result = {
          attempted: [],
          count: 0,
          errors: [],
          failed: 0,
          succeeded: 0
        };
        results.set(type.key, result);
        onTypeProgress?.({
          count: 0,
          result,
          status: 'done',
          typeKey: type.key
        });
        return;
      }

      // Phase 2: Transfer ownership
      onTypeProgress?.({
        count,
        status: 'transferring',
        typeKey: type.key
      });

      let transferResult;

      // Handle special types with non-standard signatures
      if (type.key === 'projectsAndTasks') {
        transferResult = await type.transfer(
          owned,
          fromUserId,
          toUserId,
          tabId
        );
      } else if (type.key === 'approvals') {
        // Approvals need the full objects (id + version)
        transferResult = await type.transfer(
          owned,
          fromUserId,
          toUserId,
          tabId
        );
      } else if (type.key === 'taskCenterTasks') {
        // Tasks need the full objects (id + queueId)
        transferResult = await type.transfer(
          owned,
          fromUserId,
          toUserId,
          tabId
        );
      } else {
        // Standard types: extract IDs and pass to transfer
        const ids = owned.map((o) => o.id);
        transferResult = await type.transfer(
          ids,
          fromUserId,
          toUserId,
          tabId
        );
      }

      const result = {
        attempted: flattenOwned(type.key, owned),
        count,
        ...transferResult
      };
      results.set(type.key, result);
      onTypeProgress?.({
        count,
        result,
        status: 'done',
        typeKey: type.key
      });
    } catch (error) {
      const result = {
        attempted: flattenOwned(type.key, owned),
        count: 0,
        errors: [{ error: error.message, id: 'all' }],
        failed: 1,
        succeeded: 0
      };
      results.set(type.key, result);
      onTypeProgress?.({
        count: 0,
        result,
        status: 'error',
        typeKey: type.key
      });
    }
  });

  await Promise.allSettled(transferPromises);

  return results;
}
