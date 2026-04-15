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
  getUserOwnedAppStudioApps,
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
  transferWorkflows
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
  }
];

/**
 * Transfer all ownership from one user to another for selected types.
 * Runs each enabled type in parallel via Promise.allSettled.
 *
 * @param {Object} params
 * @param {Set<string>} params.enabledTypes - Set of type keys to transfer
 * @param {number} params.fromUserId - Source user ID
 * @param {Function} params.onTypeProgress - Callback: ({ typeKey, status, count, result }) => void
 * @param {number} params.tabId - Chrome tab ID
 * @param {number} params.toUserId - Destination user ID
 * @returns {Promise<Map<string, {count: number, errors: Array, failed: number, succeeded: number}>>}
 */
export async function transferAllOwnership({
  enabledTypes,
  fromUserId,
  onTypeProgress,
  tabId,
  toUserId
}) {
  const results = new Map();

  const transferPromises = TRANSFER_TYPES.filter((type) =>
    enabledTypes.has(type.key)
  ).map(async (type) => {
    try {
      // Phase 1: List owned objects
      onTypeProgress?.({
        count: 0,
        status: 'listing',
        typeKey: type.key
      });

      const listOwned = type.getOwnedForTransfer || type.getOwned;
      const owned = await listOwned(fromUserId, tabId);
      const count =
        type.key === 'projectsAndTasks'
          ? (owned.projects?.length || 0) + (owned.tasks?.length || 0)
          : owned.length;

      if (count === 0) {
        const result = { count: 0, errors: [], failed: 0, succeeded: 0 };
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

      const result = { count, ...transferResult };
      results.set(type.key, result);
      onTypeProgress?.({
        count,
        result,
        status: 'done',
        typeKey: type.key
      });
    } catch (error) {
      const result = {
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
