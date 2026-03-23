import { executeInPage } from '@/utils';

/**
 * Get the current user's permissions for a Workflow Model.
 * @param {string} modelId - The Workflow Model ID
 * @param {number|string} userId - The current user's ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<string[]>} Array of permission strings, or empty array
 */
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
