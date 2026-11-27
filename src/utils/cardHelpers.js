/**
 * Shared utilities for components that work with cards, forms, workflows, and queues
 */

/** Domo's own `canManageKpi` rule. `isCurrentUserOwner` counts group owners but needs `owners` in the card read's parts. */
export function canManageCard({ card, userRights = [] }) {
  return (
    userRights.includes('content.admin') ||
    card?.isCurrentUserOwner === true ||
    (userRights.includes('content.card.edit') && !card?.locked)
  );
}

/** Card URL scoped to the page it sits on, so opening it keeps the page's filters; null outside a known page. */
export function cardUrlOnPage({ cardId, objectId, objectType, origin, parentId }) {
  if (objectType === 'PAGE') return `${origin}/page/${objectId}/kpis/details/${cardId}`;
  if (parentId && (objectType === 'DATA_APP_VIEW' || objectType === 'WORKSHEET_VIEW')) {
    return `${origin}/app-studio/${parentId}/pages/${objectId}/kpis/details/${cardId}`;
  }
  return null;
}

/** Names the `getCardsForParent` views that failed, or counts them past three; null when none did. */
export function describeFailedViews(viewGroups, { bold = false } = {}) {
  const names = viewGroups.filter((vg) => vg.error).map((vg) => (bold ? `**${vg.viewName}**` : vg.viewName));
  if (names.length === 0) return null;
  if (names.length > 3) return `${names.length} pages`;
  return new Intl.ListFormat('en', { type: 'conjunction' }).format(names);
}

/**
 * Wait for cards, forms, workflows, and queues to be loaded in the context.
 * The background service worker populates these asynchronously after
 * initial context detection.
 * @param {Object} currentContext - The current DomoContext
 * @param {number} maxAttempts - Maximum number of polling attempts (default: 50 = 10 seconds)
 * @returns {Promise<{success: boolean, cards: Array, forms: Array, queues: Array, workflows: Array, error: string|null}>}
 */
export async function waitForCards(currentContext, maxAttempts = 50) {
  let details = currentContext.domoObject.metadata?.context;
  let cards = details?.cards;
  let forms = details?.forms;
  let queues = details?.queues;
  let workflows = details?.workflows;

  const objectType = currentContext.domoObject?.typeId;
  const hasPageContent = ['DATA_APP_VIEW', 'PAGE', 'REPORT_BUILDER_PAGE', 'WORKSHEET_VIEW'].includes(objectType);

  // Three states per field:
  // 1. undefined/null: Not yet checked - need to wait
  // 2. []: Checked and found none
  // 3. [...]: Has items

  const isSet = (v) => v !== undefined && v !== null;
  const allResolved = () => isSet(cards) && (!hasPageContent || (isSet(forms) && isSet(queues) && isSet(workflows)));

  if (!allResolved()) {
    let attempts = 0;

    while (attempts < maxAttempts) {
      attempts++;
      await new Promise((resolve) => setTimeout(resolve, 200));

      const response = await chrome.runtime.sendMessage({
        tabId: currentContext.tabId,
        type: 'GET_TAB_CONTEXT'
      });

      if (response?.success) {
        details = response.context?.domoObject?.metadata?.context;
        if (details?.cards !== undefined && details?.cards !== null) {
          cards = details.cards;
        }
        if (details?.forms !== undefined && details?.forms !== null) {
          forms = details.forms;
        }
        if (details?.queues !== undefined && details?.queues !== null) {
          queues = details.queues;
        }
        if (details?.workflows !== undefined && details?.workflows !== null) {
          workflows = details.workflows;
        }

        if (allResolved()) {
          break;
        }
      }
    }

    if (!allResolved()) {
      return {
        cards: cards || [],
        error: 'Timeout while checking for page items. Please try again.',
        forms: forms || [],
        queues: queues || [],
        success: false,
        workflows: workflows || []
      };
    }
  }

  return {
    cards: cards || [],
    error: null,
    forms: forms || [],
    queues: queues || [],
    success: true,
    workflows: workflows || []
  };
}
