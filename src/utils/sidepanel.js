/**
 * Read the current window's sidepanel data from session storage.
 * @returns {Promise<Object|null>} The stored data, or null if none
 */
export async function getSidepanelData() {
  const { id } = await chrome.windows.getCurrent();
  const key = sidepanelStorageKey(id);
  const result = await chrome.storage.session.get([key]);
  return result[key] || null;
}

/**
 * Determine if currently running in sidepanel context
 * @returns {boolean}
 */
export function isSidepanel() {
  return window.location.pathname.includes('/sidepanel');
}

/**
 * Launch a sidepanel view. Buttons call this instead of branching on isSidepanel().
 *
 * The view becomes the single source of truth for fetching, validation, and display.
 * An optional `preCheck` can short-circuit with a toast when pre-fetched data shows
 * there are no results — avoiding an unnecessary context switch (popup → sidepanel)
 * or a loading flash (sidepanel) just to display "no results".
 *
 * @param {Object} options
 * @param {string} options.type - View type routed by sidepanel App (e.g. 'getCards')
 * @param {Object} options.currentContext - Current DomoContext
 * @param {Function} [options.onCollapseActions] - Collapse the action bar (sidepanel only)
 * @param {Function} [options.onStatusUpdate] - Show a toast in the current context
 * @param {Function} [options.preCheck] - Async fn returning { empty, title, message } or null
 * @param {...any} options - Extra props forwarded to storeSidepanelData (e.g. appId)
 */
export async function launchView({
  currentContext,
  onCollapseActions,
  onStatusUpdate,
  preCheck,
  type,
  ...extras
}) {
  // In the popup, open the sidepanel immediately to preserve the user gesture
  // (chrome.sidePanel.open requires a recent user gesture — async preChecks
  // that poll for pre-fetched data would cause it to expire).
  if (!isSidepanel()) {
    await storeSidepanelData({ currentContext, type, ...extras });
    openSidepanel();
    return;
  }

  // In the sidepanel, run the optional preCheck before opening the view.
  // If pre-fetched data shows the result is empty, show a toast and bail.
  if (preCheck) {
    const result = await preCheck();
    if (result?.empty) {
      onStatusUpdate?.(result.title, result.message, 'warning', 3000);
      return;
    }
  }

  await storeSidepanelData({ currentContext, type, ...extras });
  onCollapseActions?.();
}

/**
 * Open the sidepanel for the current tab
 */
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
  description,
  inSidepanel = false,
  onComplete = null,
  onStatusUpdate,
  status = 'accent',
  timeout = 3000,
  title
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
        description,
        status,
        timeout,
        title,
        type: 'SHOW_STATUS'
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
 * Build the window-scoped storage key for sidepanel data.
 * @param {number} windowId
 * @returns {string}
 */
export function sidepanelStorageKey(windowId) {
  return `sidepanelData_${windowId}`;
}

/**
 * Store data for sidepanel and optionally open it
 * Accepts any properties and passes them through to storage.
 * Special handling for currentContext to call toJSON() if available.
 *
 * @param {Object} options - Data to store
 * @param {string} options.type - Type of data (e.g., 'getChildPages', 'getCardPages', 'getDatasets', 'childPagesWarning')
 * @param {Object} [options.currentContext] - Current DomoContext (will be serialized via toJSON)
 * @param {boolean} [options.statusShown] - Whether status was already shown
 * @param {...any} options - Any additional properties to store
 */
export async function storeSidepanelData(options) {
  const { currentContext, ...rest } = options;

  // Resolve window ID so each window gets its own storage slot
  let windowId;
  const tabId = currentContext?.tabId;
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      windowId = tab.windowId;
    } catch {
      // Tab may have closed — fall back to current window
    }
  }
  if (!windowId) {
    const win = await chrome.windows.getCurrent();
    windowId = win.id;
  }

  const data = {
    ...rest,
    currentContext: currentContext?.toJSON?.() || currentContext,
    tabId: tabId || null,
    timestamp: Date.now()
  };

  const key = sidepanelStorageKey(windowId);
  console.log(`[storeSidepanelData] Storing data for window ${windowId}:`, data);
  await chrome.storage.session.set({ [key]: data });
}
