/**
 * Shared utilities for components that work with cards, forms, and queues
 */

/**
 * Wait for cards, forms, and queues to be loaded in the context.
 * The background service worker populates these asynchronously after
 * initial context detection.
 * @param {Object} currentContext - The current DomoContext
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 50 = 10 seconds)
 * @returns {Promise<{success: boolean, cards: Array, forms: Array, queues: Array, error: string|null}>}
 */
export async function waitForCards(currentContext, maxAttempts = 50) {
  let details = currentContext.domoObject.metadata?.details;
  let cards = details?.cards;
  let forms = details?.forms;
  let queues = details?.queues;

  // Three states per field:
  // 1. undefined/null: Not yet checked - need to wait
  // 2. []: Checked and found none
  // 3. [...]: Has items

  const allResolved = () =>
    cards !== undefined &&
    cards !== null &&
    forms !== undefined &&
    forms !== null &&
    queues !== undefined &&
    queues !== null;

  if (!allResolved()) {
    console.log('[cardHelpers] Page items not yet loaded, waiting...');

    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));

      const response = await chrome.runtime.sendMessage({
        tabId: currentContext.tabId,
        type: 'GET_TAB_CONTEXT'
      });

      if (response?.success) {
        details = response.context?.domoObject?.metadata?.details;
        if (details?.cards !== undefined && details?.cards !== null) {
          cards = details.cards;
        }
        if (details?.forms !== undefined && details?.forms !== null) {
          forms = details.forms;
        }
        if (details?.queues !== undefined && details?.queues !== null) {
          queues = details.queues;
        }

        if (allResolved()) {
          console.log(
            `[cardHelpers] Page items loaded: ${cards?.length || 0} cards, ${forms?.length || 0} forms, ${queues?.length || 0} queues`
          );
          break;
        }
      }
    }

    if (!allResolved()) {
      console.log('[cardHelpers] Timeout waiting for page items');
      return {
        cards: cards || [],
        error: 'Timeout while checking for page items. Please try again.',
        forms: forms || [],
        queues: queues || [],
        success: false
      };
    }
  }

  return {
    cards: cards || [],
    error: null,
    forms: forms || [],
    queues: queues || [],
    success: true
  };
}
