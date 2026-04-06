/**
 * Wait for the workflow version definition to be loaded in the context.
 * The background service worker populates this asynchronously after
 * initial context detection for WORKFLOW_MODEL_VERSION objects.
 * @param {Object} currentContext - The current DomoContext
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 50 = 10 seconds)
 * @returns {Promise<{success: boolean, definition: Object|null, error: string|null}>}
 */
export async function waitForDefinition(currentContext, maxAttempts = 50) {
  let definition = currentContext.domoObject.metadata?.details?.definition;

  if (definition === undefined || definition === null) {
    console.log('[workflowHelpers] Definition not yet loaded, waiting...');

    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));

      const response = await chrome.runtime.sendMessage({
        tabId: currentContext.tabId,
        type: 'GET_TAB_CONTEXT'
      });

      if (response?.success) {
        const details = response.context?.domoObject?.metadata?.details;
        if (details?.definition !== undefined && details?.definition !== null) {
          definition = details.definition;
          console.log('[workflowHelpers] Definition loaded');
          break;
        }
      }
    }

    if (definition === undefined || definition === null) {
      console.log('[workflowHelpers] Timeout waiting for definition');
      return {
        definition: null,
        error: 'Timeout waiting for workflow definition to load. Please try again.',
        success: false
      };
    }
  }

  return {
    definition,
    error: null,
    success: true
  };
}
