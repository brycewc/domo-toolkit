import { executeInPage } from '@/utils/executeInPage';

/**
 * Resolve an alert's actions to their target objects.
 *
 * Each entry in an alert's `actions` array is shallow (id, type, ownerId, empty
 * metadata). For each one this fetches the full action body and replaces the
 * action's metadata with the fetched detail's metadata. Object-backed types
 * (WORKFLOW, REPORT, TASK) additionally get a `url` linking to that object and
 * the object itself nested under `workflow`, `report`, or `task`; custom actions
 * are enriched with their detail metadata only. An action whose detail fetch
 * fails passes through unchanged.
 * @param {Object} params
 * @param {Array<{id: number, type: string}>} params.actions - The alert's actions array
 * @param {number|string} params.alertId - The alert ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} One enriched item per action
 */
export async function getAlertActions({ actions, alertId, tabId = null }) {
  return executeInPage(
    async (actions, alertId) => {
      const ID_FIELDS = { REPORT: 'scheduledReportId', TASK: 'createdTaskId', WORKFLOW: 'modelId' };
      const OBJECT_ENDPOINTS = {
        REPORT: '/api/content/v1/reportschedules/',
        TASK: '/api/content/v1/tasks/',
        WORKFLOW: '/api/workflow/v1/models/'
      };
      const OBJECT_KEYS = { REPORT: 'report', TASK: 'task', WORKFLOW: 'workflow' };
      const URL_PATHS = { REPORT: '/scheduled-reports/history/', TASK: '/project?taskId=', WORKFLOW: '/workflows/models/' };

      const result = [];
      for (const action of actions) {
        let detail = null;
        try {
          const response = await fetch(`/api/social/v4/alerts/${alertId}/actions/${action.id}`);
          if (response.ok) detail = await response.json();
        } catch {
          detail = null;
        }

        // Detail fetch failed: leave the action untouched.
        if (!detail?.metadata) {
          result.push(action);
          continue;
        }

        // Enrich every action's metadata from the fetched detail. Object-backed
        // types (WORKFLOW, REPORT, TASK) also get a url to the tied object and
        // the object itself nested under workflow/report/task; custom types get
        // the detail metadata only.
        const metadata = { ...detail.metadata };
        const objectId = OBJECT_KEYS[action.type] ? detail.metadata[ID_FIELDS[action.type]] : undefined;
        if (objectId) {
          metadata.url = `${location.origin}${URL_PATHS[action.type]}${objectId}`;
          try {
            const objectResponse = await fetch(`${OBJECT_ENDPOINTS[action.type]}${objectId}`);
            if (objectResponse.ok) metadata[OBJECT_KEYS[action.type]] = await objectResponse.json();
          } catch {
            // Tied-object fetch failed: keep the url and metadata, skip nesting.
          }
        }
        result.push({ ...action, metadata });
      }

      return result;
    },
    [actions, alertId],
    tabId
  );
}

/**
 * Get all alerts owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedAlerts(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allAlerts = [];
      const limit = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(`/api/social/v4/alerts?limit=${limit}&offset=${offset}&ownerId=${userId}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allAlerts.push(...data.map((a) => ({ id: a.id, name: a.name || a.id.toString() })));
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allAlerts;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer alert ownership to a new user.
 * @param {number[]} alertIds - Array of alert IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAlerts(alertIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (alertIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of alertIds) {
        try {
          const response = await fetch(`/api/social/v4/alerts/${id}`, {
            body: JSON.stringify({ id, owner: toUserId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PATCH'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [alertIds, fromUserId, toUserId],
    tabId
  );
}

/**
 * Update the owner of a single alert.
 * @param {Object} params
 * @param {number|string} params.alertId - The alert ID
 * @param {number|string} params.newOwnerId - The new owner's user ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function updateAlertOwner({ alertId, newOwnerId, tabId = null }) {
  return executeInPage(
    async (alertId, newOwnerId) => {
      const response = await fetch(`/api/social/v4/alerts/${alertId}`, {
        body: JSON.stringify({
          id: Number(alertId),
          owner: Number(newOwnerId)
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PATCH'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [alertId, newOwnerId],
    tabId
  );
}
