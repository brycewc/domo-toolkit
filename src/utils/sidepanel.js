/**
 * Determine if currently running in sidepanel context
 * @returns {boolean}
 */
export function isSidepanel() {
  return window.location.pathname.includes('/sidepanel');
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
 * Store data for sidepanel and optionally open it
 * Accepts any properties and passes them through to storage.
 * Special handling for currentContext to call toJSON() if available.
 *
 * @param {Object} options - Data to store
 * @param {string} options.type - Type of data (e.g., 'getPages', 'getDatasets', 'childPagesWarning')
 * @param {Object} [options.currentContext] - Current DomoContext (will be serialized via toJSON)
 * @param {boolean} [options.statusShown] - Whether status was already shown
 * @param {...any} options - Any additional properties to store
 */
export async function storeSidepanelData(options) {
  const { currentContext, ...rest } = options;

  const data = {
    ...rest,
    currentContext: currentContext?.toJSON?.() || currentContext,
    tabId: currentContext?.tabId || null,
    timestamp: Date.now()
  };

  console.log('[storeSidepanelData] Storing data:', data);
  await chrome.storage.session.set({ sidepanelDataList: data });
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
