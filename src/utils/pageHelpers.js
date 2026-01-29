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
      await new Promise((resolve) => setTimeout(resolve, 100));

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

/**
 * Determine if currently running in sidepanel context
 * @returns {boolean}
 */
export function isSidepanel() {
  return window.location.pathname.includes('/sidepanel');
}

/**
 * Show a status message, either directly via callback or by sending message to sidepanel
 * @param {Object} options
 * @param {Function} options.onStatusUpdate - Direct status update callback (for sidepanel context)
 * @param {string} options.title - Status title
 * @param {string} options.description - Status description
 * @param {string} options.status - Status type (success, warning, danger, accent)
 * @param {number} options.timeout - Auto-dismiss timeout in ms (0 for manual dismiss)
 * @param {boolean} options.inSidepanel - Whether currently in sidepanel
 * @param {Function} options.onComplete - Optional callback after status is shown
 */
export async function showStatus({
  onStatusUpdate,
  title,
  description,
  status = 'accent',
  timeout = 3000,
  inSidepanel = false,
  onComplete = null
}) {
  if (inSidepanel) {
    // If we're in the sidepanel, call onStatusUpdate directly
    onStatusUpdate?.(title, description, status, timeout);
    onComplete?.();
  } else {
    // If we're in the popup, send message to sidepanel
    console.log('[pageHelpers] Sending SHOW_STATUS message to sidepanel');
    try {
      await chrome.runtime.sendMessage({
        type: 'SHOW_STATUS',
        title,
        description,
        status,
        timeout
      });
      console.log('[pageHelpers] SHOW_STATUS message sent successfully');
      onComplete?.();
    } catch (error) {
      console.log(
        '[pageHelpers] SHOW_STATUS message failed, showing in popup instead:',
        error
      );
      // If sidepanel is not open, show in popup instead
      onStatusUpdate?.(title, description, status, timeout);
      onComplete?.();
    }
  }
}

/**
 * Store data for sidepanel and optionally open it
 * @param {Object} options
 * @param {string} options.type - Type of data (e.g., 'getPages', 'childPagesWarning')
 * @param {number} options.objectId - Object ID
 * @param {string} options.objectName - Object name
 * @param {string} options.objectType - Object type ('PAGE', 'DATA_APP_VIEW', 'CARD')
 * @param {Object} options.currentContext - Current DomoContext
 * @param {Array} options.childPages - Optional child pages array
 * @param {boolean} options.statusShown - Whether status was already shown
 * @param {boolean} options.openPanel - Whether to open the sidepanel after storing
 * @param {boolean} options.closeWindow - Whether to close the current window after opening sidepanel
 */
export async function storeSidepanelData({
  type,
  objectId,
  objectName,
  objectType,
  currentContext,
  childPages = null,
  statusShown = false
}) {
  const data = {
    type,
    objectId,
    objectName,
    objectType,
    currentContext: currentContext?.toJSON?.() || currentContext,
    tabId: currentContext?.tabId || null,
    timestamp: Date.now(),
    statusShown
  };

  // Add childPages if provided
  if (childPages !== null) {
    data.childPages = childPages;
  }

  await chrome.storage.local.set({ sidepanelDataList: data });
}

export function openSidepanel() {
  // Try to open the sidepanel
  // If it's already open, this will fail, but that's okay -
  // the already-open sidepanel will detect the storage change
  try {
    chrome.tabs.query(
      { active: true, currentWindow: true, windowType: 'normal' },
      ([tab]) => {
        chrome.sidePanel.open({ tabId: tab.id });
        window.close();
      }
    );
  } catch (error) {
    // Sidepanel is likely already open, which is fine
  }
}
