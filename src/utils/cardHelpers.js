/**
 * Shared utilities for components that work with cards
 */

/**
 * Wait for cards to be loaded in the context
 * @param {Object} currentContext - The current DomoContext
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 50 = 5 seconds)
 * @returns {Promise<{success: boolean, cards: Array|null, error: string|null}>}
 */
export async function waitForCards(currentContext, maxAttempts = 50) {
  let cards = currentContext.domoObject.metadata?.details?.cards;

  // Three states:
  // 1. undefined/null: Not yet checked for cards - need to wait
  // 2. []: Checked and found no cards
  // 3. [...]: Has cards

  if (cards === undefined || cards === null) {
    console.log('[cardHelpers] Cards not yet loaded, waiting...');

    // Poll for cards to be loaded (max 5 seconds by default)
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));

      // Re-fetch the current context to get updated cards
      const response = await chrome.runtime.sendMessage({
        type: 'GET_TAB_CONTEXT',
        tabId: currentContext.tabId
      });

      if (
        response?.success &&
        response?.context?.domoObject?.metadata?.details?.cards !== undefined
      ) {
        cards = response.context.domoObject.metadata.details.cards;
        console.log('[cardHelpers] Cards loaded:', cards?.length || 0);
        break;
      }
    }

    if (cards === undefined || cards === null) {
      console.log('[cardHelpers] Timeout waiting for cards');
      return {
        success: false,
        cards: null,
        error: 'Timeout while checking for cards. Please try again.'
      };
    }
  }

  return {
    success: true,
    cards: cards || [],
    error: null
  };
}
