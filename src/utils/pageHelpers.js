/**
 * Shared utilities for components that work with pages and child pages
 */

/**
 * Wait for child pages to be loaded in the context
 * @param {Object} currentContext - The current DomoContext
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 50 = 5 seconds)
 * @returns {Promise<{success: boolean, childPages: Array|null, error: string|null}>}
 */
export async function waitForChildPages(currentContext, maxAttempts = 50) {
  const objectType = currentContext.domoObject?.typeId;
  const propertyName =
    objectType === 'DATA_APP_VIEW' ? 'appPages' : 'childPages';

  let childPages = currentContext.domoObject.metadata?.details?.[propertyName];

  // Three states:
  // 1. undefined/null: Not yet checked for pages - need to wait
  // 2. []: Checked and found no pages - safe to proceed
  // 3. [...]: Has pages

  if (childPages === undefined || childPages === null) {
    console.log(`[pageHelpers] ${propertyName} not yet loaded, waiting...`);

    // Poll for pages to be loaded (max 5 seconds by default)
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200)); // Wait 200ms

      // Re-fetch the current context to get updated pages
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TAB_CONTEXT',
        tabId: currentContext.tabId
      });

      if (
        response?.success &&
        response?.context?.domoObject?.metadata?.details?.[propertyName] !==
          undefined
      ) {
        childPages = response.context.domoObject.metadata.details[propertyName];
        console.log(
          `[pageHelpers] ${propertyName} loaded:`,
          childPages?.length || 0
        );
        break;
      }
    }

    if (childPages === undefined || childPages === null) {
      console.log(`[pageHelpers] Timeout waiting for ${propertyName}`);
      return {
        success: false,
        childPages: null,
        error: `Timeout while checking for ${objectType === 'DATA_APP_VIEW' ? 'app pages' : 'child pages'}. Please try again.`
      };
    }
  }

  return {
    success: true,
    childPages: childPages || [],
    error: null
  };
}
