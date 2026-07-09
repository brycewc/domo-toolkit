import { executeInPage } from '@/utils/executeInPage';

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
      const versionsRes = await fetch(`/api/workflow/v2/models/${modelId}/versions`);
      if (!versionsRes.ok) {
        throw new Error(`Failed to list workflow versions: HTTP ${versionsRes.status}`);
      }
      const versions = await versionsRes.json();
      const activeVersions = versions.filter((v) => v.active);
      for (const ver of activeVersions) {
        const deactivateRes = await fetch(`/api/workflow/v2/models/${modelId}/versions/${ver.version}`, {
          body: JSON.stringify({
            active: false,
            description: ver.description
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!deactivateRes.ok) {
          throw new Error(`Failed to deactivate version ${ver.version}: HTTP ${deactivateRes.status}`);
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
 * Ensure a workflow version can be edited, clearing an edit lock we're allowed
 * to clear. Domo locks a version while someone edits it; before we grab the
 * definition to change it, we honor that lock. A version that isn't locked, is
 * locked by the current user, or was locked more than 24 hours ago is treated
 * as editable (the latter two are unlocked first so editing can resume). A
 * version locked by someone else within the last 24 hours is left untouched and
 * reported as not editable. A lock status we can't read never blocks editing.
 * @param {Object} params
 * @param {string} params.modelId - The Workflow Model ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {string} params.versionNumber - The workflow version (e.g. '1.0.8')
 * @returns {Promise<boolean>} Whether the version is now editable
 */
export async function ensureWorkflowVersionEditable({ modelId, tabId = null, versionNumber }) {
  return executeInPage(
    async (modelId, versionNumber) => {
      const lockRes = await fetch(`/api/workflow/v1/models/${modelId}/versions/${versionNumber}/lock`);
      // If we can't read the lock, don't block editing.
      if (!lockRes.ok) return true;
      const lock = await lockRes.json().catch(() => null);
      const lockedBy = lock?.lockedBy != null ? String(lock.lockedBy) : null;
      // Not locked: editable as-is.
      if (!lockedBy) return true;

      // Compare the lock holder against the logged-in user (bootstrap is the
      // canonical source for the current user's id on a Domo page).
      const currentUserId =
        window.bootstrap?.currentUser?.USER_ID != null ? String(window.bootstrap.currentUser.USER_ID) : null;
      const isOwnLock = currentUserId != null && currentUserId === lockedBy;

      const lockedOnMs = lock?.lockedOn ? new Date(lock.lockedOn).getTime() : NaN;
      const isStale = Number.isFinite(lockedOnMs) && Date.now() - lockedOnMs > 24 * 60 * 60 * 1000;

      // Locked by someone else within the last 24 hours: leave it alone.
      if (!isOwnLock && !isStale) return false;

      const unlockRes = await fetch(
        `/api/workflow/v1/models/${modelId}/versions/${versionNumber}/lock/false?admin=false`,
        { method: 'PUT' }
      );
      return unlockRes.ok;
    },
    [modelId, versionNumber],
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
              name: w.winnerText || w.uuid
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
      const response = await fetch(`/api/workflow/v2/models/${modelId}/versions/${versionNumber}/definition`, {
        headers: { 'Content-Type': 'application/json;charset=utf-8' }
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    },
    [modelId, versionNumber],
    tabId
  );
}

/**
 * Fetch a workflow model's name and version list in a single call. Each version
 * entry carries a `deployedOn` timestamp, where a non-null value means the version
 * is released (the workflow equivalent of a Code Engine version's `released`).
 * Mirrors `getCodeEnginePackageInfo` so a subflow group can be enriched with one
 * request instead of a separate name lookup plus a versions lookup.
 * @param {string} modelId - The workflow model ID.
 * @param {number|null} [tabId] - Optional Chrome tab ID.
 * @returns {Promise<{name: string|null, versions: Array<{deployedOn: string, version: string}>}>}
 */
export async function getWorkflowModelInfo(modelId, tabId = null) {
  return executeInPage(
    async (modelId) => {
      const response = await fetch(`/api/workflow/v1/models/${modelId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const model = await response.json();
      return {
        name: model?.name ?? null,
        versions: Array.isArray(model?.versions) ? model.versions : []
      };
    },
    [modelId],
    tabId
  );
}

/**
 * Fetch a workflow model's display name.
 * @param {string} modelId - The workflow model ID.
 * @param {number|null} tabId - Optional Chrome tab ID.
 * @returns {Promise<string|null>} The workflow name, or null if unavailable.
 */
export async function getWorkflowModelName(modelId, tabId = null) {
  return executeInPage(
    async (modelId) => {
      const response = await fetch(`/api/workflow/v1/models/${modelId}`);
      if (!response.ok) return null;
      const model = await response.json();
      return model?.name ?? null;
    },
    [modelId],
    tabId
  );
}

export async function getWorkflowPermission(modelId, userId, tabId = null) {
  return executeInPage(
    async (modelId, userId) => {
      const response = await fetch(`/api/workflow/v1/models/${modelId}/permissions`);
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
 * List a workflow model's triggers, returning the raw trigger objects the API
 * provides (each with its `id`, `type`, `active` state, audit fields, and
 * `metadata`). Pass `types` to narrow the result to specific trigger types
 * (e.g. `['ALERT']` for the version-update flow); omit it to fetch every type.
 * @param {string} modelId - The Workflow Model ID
 * @param {Object} [options]
 * @param {number|null} [options.tabId] - Optional Chrome tab ID
 * @param {string[]|null} [options.types] - Trigger types to include; omit for all types
 * @returns {Promise<Array<Object>>} The matching triggers, or [] when none exist
 */
export async function getWorkflowTriggers(modelId, { tabId = null, types = null } = {}) {
  const requestedTypes = types ?? [
    'ALERT',
    'API',
    'APP_STUDIO',
    'CARD_ACCESS_REQUESTED',
    'CUSTOM_APP',
    'DATA_APP_ACCESS_REQUESTED',
    'MANUAL',
    'PAGE_ACCESS_REQUESTED',
    'TIMER',
    'WORKFLOW'
  ];
  return executeInPage(
    async (modelId, types) => {
      const response = await fetch(`/api/workflow/v2/triggers/model/${modelId}?types=${types.join(',')}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const triggers = await response.json();
      return Array.isArray(triggers) ? triggers : [];
    },
    [modelId, requestedTypes],
    tabId
  );
}

/**
 * List a workflow model's versions.
 * @param {string} modelId - The Workflow Model ID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{active: boolean, deployedOn: string, version: string}>>}
 */
export async function getWorkflowVersions(modelId, tabId = null) {
  return executeInPage(
    async (modelId) => {
      const response = await fetch(`/api/workflow/v1/models/${modelId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const model = await response.json();
      return Array.isArray(model?.versions) ? model.versions : [];
    },
    [modelId],
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
export async function transferWorkflows(workflowIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (workflowIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of workflowIds) {
        try {
          const getResponse = await fetch(`/api/workflow/v1/models/${id}`);
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

export async function updateVersionDefinition(modelId, versionNumber, definition, tabId = null) {
  return executeInPage(
    async (modelId, versionNumber, definition) => {
      const response = await fetch(`/api/workflow/v2/models/${modelId}/versions/${versionNumber}/definition`, {
        body: JSON.stringify(definition),
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        method: 'PUT'
      });
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
export async function updateWorkflowOwner({ modelId, newOwnerId, tabId = null }) {
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
