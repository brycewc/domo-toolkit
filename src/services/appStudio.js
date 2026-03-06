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
              `/api/workflow/v1/models/widget/${widgetId}`,
              { method: 'GET' }
            );
            if (!widgetResponse.ok) return null;
            const widget = await widgetResponse.json();

            const formId = widget.startModel?.form?.id;
            const modelId = widget.modelId;
            const modelVersion = widget.modelVersion;
            if (!formId) return null;

            // Step 2: Fetch form details for the title
            const formResponse = await fetch(`/api/forms/v2/${formId}`, {
              method: 'GET'
            });
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
            const widgetResponse = await fetch(
              `/api/queues/v1/widget/${widgetId}`,
              { method: 'GET' }
            );
            if (!widgetResponse.ok) return null;
            const widget = await widgetResponse.json();

            const queueId = widget.queueId;
            if (!queueId) return null;

            // Step 2: Fetch queue details for the name
            const queueResponse = await fetch(`/api/queues/v1/${queueId}`, {
              method: 'GET'
            });
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
