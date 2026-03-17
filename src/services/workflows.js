import { executeInPage } from '@/utils';

/**
 * Get the current user's permissions for a Workflow Model.
 * @param {string} modelId - The Workflow Model ID
 * @param {number|string} userId - The current user's ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<string[]>} Array of permission strings, or empty array
 */
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
