import { executeInPage } from '@/utils';

/**
 * Delete a Workflow Model. Internally lists the model's versions and
 * deactivates any that are still active before issuing the DELETE, because
 * the delete endpoint rejects models with active versions.
 * @param {Object} params
 * @param {string} params.modelId - The Workflow Model ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteWorkflow({ modelId, tabId = null }) {
  return executeInPage(
    async (modelId) => {
      const versionsRes = await fetch(
        `/api/workflow/v2/models/${modelId}/versions`
      );
      if (!versionsRes.ok) {
        throw new Error(
          `Failed to list workflow versions: HTTP ${versionsRes.status}`
        );
      }
      const versions = await versionsRes.json();
      const activeVersions = versions.filter((v) => v.active);
      for (const ver of activeVersions) {
        const deactivateRes = await fetch(
          `/api/workflow/v2/models/${modelId}/versions/${ver.version}`,
          {
            body: JSON.stringify({
              active: false,
              description: ver.description
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          }
        );
        if (!deactivateRes.ok) {
          throw new Error(
            `Failed to deactivate version ${ver.version}: HTTP ${deactivateRes.status}`
          );
        }
      }

      const deleteRes = await fetch(`/api/workflow/v1/models/${modelId}`, {
        method: 'DELETE'
      });
      if (!deleteRes.ok) throw new Error(`HTTP ${deleteRes.status}`);
    },
    [modelId],
    tabId
  );
}

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

/**
 * Update the owner of a Workflow Model via PATCH-style partial update.
 * @param {Object} params
 * @param {string} params.modelId - The Workflow Model ID
 * @param {number|string} params.newOwnerId - The new owner's user ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function updateWorkflowOwner({
  modelId,
  newOwnerId,
  tabId = null
}) {
  return executeInPage(
    async (modelId, newOwnerId) => {
      const response = await fetch(`/api/workflow/v1/models/${modelId}`, {
        body: JSON.stringify({ id: modelId, owner: String(newOwnerId) }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [modelId, newOwnerId],
    tabId
  );
}
