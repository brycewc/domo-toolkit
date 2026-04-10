import { executeInPage } from '@/utils';

/**
 * Get the current user's permissions for a Workflow Model.
 * @param {string} modelId - The Workflow Model ID
 * @param {number|string} userId - The current user's ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<string[]>} Array of permission strings, or empty array
 */
/**
 * Get all workflows owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedWorkflows(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allWorkflows = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            count,
            entityList: [['workflow_model']],
            filters: [
              {
                facetType: 'user',
                field: 'owned_by_id',
                filterType: 'term',
                value: `${userId}:USER`
              }
            ],
            offset,
            query: '*'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.searchObjects && data.searchObjects.length > 0) {
          allWorkflows.push(
            ...data.searchObjects.map((w) => ({
              id: w.uuid,
              name: w.title || w.uuid
            }))
          );
          offset += count;
          if (data.searchObjects.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allWorkflows;
    },
    [userId],
    tabId
  );
}

export async function getVersionDefinition(modelId, versionNumber, tabId = null) {
  return executeInPage(
    async (modelId, versionNumber) => {
      const response = await fetch(
        `/api/workflow/v2/models/${modelId}/versions/${versionNumber}/definition`,
        { headers: { 'Content-Type': 'application/json;charset=utf-8' } }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    [modelId, versionNumber],
    tabId
  );
}

export async function getWorkflowPermission(modelId, userId, tabId = null) {
  return executeInPage(
    async (modelId, userId) => {
      const response = await fetch(
        `/api/workflow/v1/models/${modelId}/permissions`
      );
      if (!response.ok) return [];
      const data = await response.json();
      const users = data?.USER || [];
      const entry = users.find((u) => String(u.id) === String(userId));
      return entry?.permissions || [];
    },
    [modelId, userId],
    tabId
  );
}

/**
 * Transfer workflow ownership to a new user.
 * @param {string[]} workflowIds - Array of workflow model IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferWorkflows(
  workflowIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (workflowIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of workflowIds) {
        try {
          const getResponse = await fetch(
            `/api/workflow/v1/models/${id}`
          );
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const workflow = await getResponse.json();

          workflow.owner = toUserId.toString();

          const response = await fetch(`/api/workflow/v1/models/${id}`, {
            body: JSON.stringify(workflow),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [workflowIds, fromUserId, toUserId],
    tabId
  );
}

export async function updateVersionDefinition(
  modelId,
  versionNumber,
  definition,
  tabId = null
) {
  return executeInPage(
    async (modelId, versionNumber, definition) => {
      const response = await fetch(
        `/api/workflow/v2/models/${modelId}/versions/${versionNumber}/definition`,
        {
          body: JSON.stringify(definition),
          headers: { 'Content-Type': 'application/json;charset=utf-8' },
          method: 'PUT'
        }
      );
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    [modelId, versionNumber, definition],
    tabId
  );
}
