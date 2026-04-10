import { executeInPage } from '@/utils';

/**
 * Extract form and queue widget IDs from page layout content.
 * The pageLayoutV4.content array contains all elements on an App Studio page,
 * including cards, forms (type: 'WORKFLOW'), and queues (type: 'QUEUE').
 * @param {Object} details - The metadata.details object from the stacks API
 * @returns {{ formWidgetIds: string[], queueWidgetIds: string[] }}
 */
export function extractPageContentIds(details) {
  const content = details?.pageLayoutV4?.content;
  if (!Array.isArray(content)) return { formWidgetIds: [], queueWidgetIds: [] };

  const formWidgetIds = [];
  const queueWidgetIds = [];

  function walk(items) {
    for (const item of items) {
      if (item.type === 'WORKFLOW' && item.workflowId) {
        formWidgetIds.push(item.workflowId);
      } else if (item.type === 'QUEUE' && item.queueWidgetId) {
        queueWidgetIds.push(item.queueWidgetId);
      }
      if (item.children) walk(item.children);
      if (item.columns) walk(item.columns);
      if (item.rows) walk(item.rows);
    }
  }

  walk(content);
  return { formWidgetIds, queueWidgetIds };
}

/**
 * Fetch enriched form details for forms on an App Studio page.
 * Each form on a page is referenced by a workflow widget ID. The enrichment
 * resolves widget → workflow model → form ID → form title.
 * @param {Object} params
 * @param {string[]} params.formWidgetIds - Workflow widget IDs from pageLayoutV4.content
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @returns {Promise<Array<{ id: string, modelVersion: string, title: string, workflowModelId: string, workflowWidgetId: string }>>}
 */
export async function getFormsForPage({ formWidgetIds, tabId = null }) {
  return executeInPage(
    async (formWidgetIds) => {
      const results = await Promise.all(
        formWidgetIds.map(async (widgetId) => {
          try {
            // Step 1: Resolve widget to workflow model and form ID
            const widgetResponse = await fetch(
              `/api/workflow/v1/models/widget/${widgetId}`
            );
            if (!widgetResponse.ok) return null;
            const widget = await widgetResponse.json();

            const formId = widget.startModel?.form?.id;
            const modelId = widget.modelId;
            const modelVersion = widget.modelVersion;
            if (!formId) return null;

            // Step 2: Fetch form details for the title
            const formResponse = await fetch(`/api/forms/v2/${formId}`);
            if (!formResponse.ok) return null;
            const form = await formResponse.json();

            return {
              id: formId,
              modelVersion: modelVersion || null,
              title: form.name || null,
              workflowModelId: modelId || null,
              workflowWidgetId: widgetId
            };
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    },
    [formWidgetIds],
    tabId
  );
}

/**
 * Get all App Studio apps owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAppStudioApps(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allApps = [];
      const limit = 30;
      let moreData = true;
      let skip = 0;

      while (moreData) {
        const response = await fetch(
          `/api/content/v1/dataapps/adminsummary?limit=${limit}&skip=${skip}`,
          {
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (
          data.dataAppAdminSummaries &&
          data.dataAppAdminSummaries.length > 0
        ) {
          for (const app of data.dataAppAdminSummaries) {
            if (app.owners?.some((o) => o.id == userId)) {
              allApps.push({
                id: app.dataAppId.toString(),
                name: app.dataAppName || app.dataAppId.toString()
              });
            }
          }
          skip += limit;
          if (data.dataAppAdminSummaries.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allApps;
    },
    [userId],
    tabId
  );
}

/**
 * Fetch enriched queue details for queues on an App Studio page.
 * Each queue on a page is referenced by a queue widget ID. The enrichment
 * resolves widget → queue ID → queue name.
 * @param {Object} params
 * @param {string[]} params.queueWidgetIds - Queue widget IDs from pageLayoutV4.content
 * @param {number|null} [params.tabId=null] - Target tab for executeInPage
 * @returns {Promise<Array<{ id: string, name: string, queueWidgetId: string }>>}
 */
export async function getQueuesForPage({ queueWidgetIds, tabId = null }) {
  return executeInPage(
    async (queueWidgetIds) => {
      const results = await Promise.all(
        queueWidgetIds.map(async (widgetId) => {
          try {
            // Step 1: Resolve widget to actual queue ID
            const widgetResponse = await fetch(`/api/queues/v1/widget/${widgetId}`);
            if (!widgetResponse.ok) return null;
            const widget = await widgetResponse.json();

            const queueId = widget.queueId;
            if (!queueId) return null;

            // Step 2: Fetch queue details for the name
            const queueResponse = await fetch(`/api/queues/v1/${queueId}`);
            if (!queueResponse.ok) return null;
            const queue = await queueResponse.json();

            return {
              id: queueId,
              name: queue.name || null,
              queueWidgetId: widgetId
            };
          } catch {
            return null;
          }
        })
      );
      return results.filter(Boolean);
    },
    [queueWidgetIds],
    tabId
  );
}

/**
 * Transfer App Studio app ownership to a new user.
 * @param {string[]} appIds - Array of app IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAppStudioApps(
  appIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (appIds, fromUserId, toUserId) => {
      try {
        // Add new owner
        const addResponse = await fetch(
          '/api/content/v1/dataapps/bulk/owners',
          {
            body: JSON.stringify({
              entityIds: appIds,
              note: '',
              owners: [{ id: parseInt(toUserId), type: 'USER' }],
              sendEmail: false
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          }
        );
        if (!addResponse.ok) throw new Error(`HTTP ${addResponse.status}`);

        // Remove old owner
        const removeResponse = await fetch(
          '/api/content/v1/dataapps/bulk/owners/remove',
          {
            body: JSON.stringify({
              entityIds: appIds,
              owners: [{ id: fromUserId, type: 'USER' }]
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!removeResponse.ok)
          throw new Error(`HTTP ${removeResponse.status}`);

        return { errors: [], failed: 0, succeeded: appIds.length };
      } catch (error) {
        return {
          errors: appIds.map((id) => ({ error: error.message, id })),
          failed: appIds.length,
          succeeded: 0
        };
      }
    },
    [appIds, fromUserId, toUserId],
    tabId
  );
}
