/**
 * Read the current window's sidepanel data for a Domo instance from session storage.
 * @param {string} instance - Domo instance the record is scoped to
 * @returns {Promise<Object|null>} The stored data, or null if none
 */
export async function getSidepanelData(instance) {
  if (!instance) return null;
  const { id } = await chrome.windows.getCurrent();
  const key = sidepanelStorageKey(id, instance);
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
 * there are no results, avoiding an unnecessary context switch (popup → sidepanel)
 * or a loading flash (sidepanel) just to display "no results".
 *
 * @param {Object} options
 * @param {string} options.type - View type routed by sidepanel App (e.g. 'getCards')
 * @param {Object} options.currentContext - Current DomoContext
 * @param {string} [options.instance] - Domo instance to scope the view to (defaults to currentContext.instance)
 * @param {Function} [options.onStatusUpdate] - Show a toast in the current context
 * @param {Function} [options.preCheck] - Async fn returning { empty, title, message } or null
 * @param {...any} options - Extra props forwarded to storeSidepanelData (e.g. appId)
 */
export async function launchView({ currentContext, onStatusUpdate, preCheck, type, ...extras }) {
  // Dismiss the just-clicked button's tooltip. The action bar stays expanded while
  // the view loads, so the hovered button keeps its tooltip open (and it would
  // otherwise linger over the panel). Blurring drops the hover/focus that holds it
  // open; with the cursor still, nothing reopens it before the bar collapses.
  document.activeElement?.blur?.();

  // In the popup, open the sidepanel immediately to preserve the user gesture
  // (chrome.sidePanel.open requires a recent user gesture; async preChecks
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
}

/**
 * Open the sidepanel for the current tab
 */
export function openSidepanel() {
  // Try to open the sidepanel
  // If it's already open, this will fail, but that's okay -
  // the already-open sidepanel will detect the storage change
  try {
    chrome.tabs.query({ active: true, currentWindow: true, windowType: 'normal' }, ([tab]) => {
      chrome.sidePanel.open({ tabId: tab.id });
      window.close();
    });
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
      console.log('[pageHelpers] SHOW_STATUS message failed, showing in popup instead:', error);
      // If sidepanel is not open, show in popup instead
      onStatusUpdate?.(title, description, status, timeout);
      onComplete?.();
    }
  }
}

/**
 * Build the window + instance scoped storage key for sidepanel data.
 * @param {number} windowId
 * @param {string} instance - Domo instance the record is scoped to
 * @returns {string}
 */
export function sidepanelStorageKey(windowId, instance) {
  return `${sidepanelStorageKeyPrefix(windowId)}${instance}`;
}

/**
 * Build the storage key prefix for one window's sidepanel records. The
 * trailing underscore keeps window 12's prefix from matching window 123's
 * keys, and instances cannot contain underscores, so slicing the prefix off
 * a matching key always yields the instance.
 * @param {number} windowId
 * @returns {string}
 */
export function sidepanelStorageKeyPrefix(windowId) {
  return `sidepanelData_${windowId}_`;
}

/**
 * Store data for sidepanel and optionally open it
 * Accepts any properties and passes them through to storage.
 * Special handling for currentContext to call toJSON() if available.
 *
 * @param {Object} options - Data to store
 * @param {string} options.type - Type of data (e.g., 'getChildPages', 'getCardPages', 'getDatasets', 'childPagesWarning')
 * @param {Object} [options.currentContext] - Current DomoContext (will be serialized via toJSON)
 * @param {string} [options.instance] - Domo instance to scope the record to (defaults to currentContext.instance)
 * @param {boolean} [options.statusShown] - Whether status was already shown
 * @param {...any} options - Any additional properties to store
 */
export async function storeSidepanelData(options) {
  const { currentContext, instance, ...rest } = options;

  // Scope the record to a Domo instance so each instance keeps its own view
  const effectiveInstance = instance ?? currentContext?.instance;
  if (!effectiveInstance) {
    console.warn('[storeSidepanelData] No instance to scope to, skipping store:', rest.type);
    return;
  }

  // Resolve window ID so each window gets its own storage slot
  let windowId;
  const tabId = currentContext?.tabId;
  if (tabId) {
    try {
      const tab = await chrome.tabs.get(tabId);
      windowId = tab.windowId;
    } catch {
      // Tab may have closed, fall back to current window
    }
  }
  if (!windowId) {
    const win = await chrome.windows.getCurrent();
    windowId = win.id;
  }

  const data = {
    ...rest,
    // Near-full serialization (not toStorageJSON): this single per-window record
    // is read back by views via getSidepanelData, and some need the heavy fields
    // toStorageJSON drops, e.g. CopyColorRules reads metadata.details.properties
    // and Ownership reads user. slimContextForSidepanel trims metadata.context to
    // its small routing fields, dropping the re-fetchable enrichment payloads (the
    // workflow definition chief among them) that no view reads back from here and
    // that overflow the session quota for a large object.
    currentContext: slimContextForSidepanel(currentContext),
    tabId: tabId || null,
    timestamp: Date.now()
  };

  const key = sidepanelStorageKey(windowId, effectiveInstance);
  console.log(`[storeSidepanelData] Storing data for window ${windowId}, instance ${effectiveInstance}:`, data);
  try {
    await chrome.storage.session.set({ [key]: data });
  } catch (error) {
    // A large object context can still exceed the session quota after the
    // definition is dropped (e.g. a dataset's full Beast Mode property dump under
    // metadata.details). Retry once without that blob rather than fail the whole
    // launch and leave the panel unable to open; views re-derive details from the
    // live background context when they need them.
    console.warn('[storeSidepanelData] Session store failed, retrying without heavy details:', error);
    const slimData = { ...data, currentContext: dropContextDetails(data.currentContext) };
    await chrome.storage.session.set({ [key]: slimData });
  }
}

/**
 * Strip the (potentially large) `details` blob from an already-serialized context.
 * Quota backstop for storeSidepanelData: mirrors the background backup's "store
 * without details" fallback so an over-budget record can still be written. Views
 * re-derive details from the live background context when they need them.
 * @param {Object} serializedContext - A context already run through toJSON.
 * @returns {Object}
 */
function dropContextDetails(serializedContext) {
  const metadata = serializedContext?.domoObject?.metadata;
  if (!metadata?.details) return serializedContext;
  const { details: _details, ...slimMetadata } = metadata;
  return {
    ...serializedContext,
    domoObject: { ...serializedContext.domoObject, metadata: slimMetadata }
  };
}

/**
 * Serialize a DomoContext for the per-window sidepanel record, dropping every
 * array or object on metadata.context. The fields a view reads back from the
 * stored record (workflowModelId, workflowVersionNumber, dataflowVersionId, and
 * the other routing ids) are all primitives; every non-primitive on context is a
 * re-fetchable enrichment payload read only from the live context, and some of it
 * (the workflow definition, a page's full card or child-page list) is large
 * enough to overflow the chrome.storage.session quota, which rejects the whole
 * set() and leaves the panel unable to open. Keying off type rather than a name
 * list means new enrichment payloads are dropped automatically. This mirrors
 * DomoContext.toStorageJSON's trimming for the background backup.
 *
 * toJSON returns a fresh top-level object but keeps a live reference to metadata,
 * so build fresh objects down to the trimmed node rather than mutating in place,
 * which would strip fields from the context still rendering and from the live
 * background context that waitForDefinition polls as a fallback.
 *
 * @param {Object} currentContext - A DomoContext instance (or already-plain object).
 * @returns {Object}
 */
function slimContextForSidepanel(currentContext) {
  const json = currentContext?.toJSON?.() || currentContext;
  const context = json?.domoObject?.metadata?.context;
  if (!context) return json;
  const slimContext = {};
  for (const [key, value] of Object.entries(context)) {
    if (typeof value !== 'object' || value === null) slimContext[key] = value;
  }
  return {
    ...json,
    domoObject: {
      ...json.domoObject,
      metadata: { ...json.domoObject.metadata, context: slimContext }
    }
  };
}
