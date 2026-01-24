import { DomoObject, DomoContext, getObjectType } from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import {
  detectCurrentObject,
  EXCLUDED_HOSTNAMES,
  executeInPage
} from '@/utils';

/**
 * Send a message to a tab with retry logic
 * @param {number} tabId - The tab ID
 * @param {Object} message - The message to send
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<any>} The response from the tab
 */
async function sendMessageWithRetry(tabId, message, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, message);
      return response;
    } catch (error) {
      if (i === maxRetries - 1) {
        throw error;
      }
      // Wait with exponential backoff: 100ms, 200ms, 400ms
      await new Promise((resolve) => setTimeout(resolve, 100 * Math.pow(2, i)));
    }
  }
}

// In-memory cache of tab contexts (tabId -> context object)
const tabContexts = new Map();
// LRU tracking (tabId -> timestamp)
const tabAccessTimes = new Map();
const MAX_CACHED_TABS = 10;

// Session storage keys
const SESSION_STORAGE_KEY = 'tabContextsBackup';

/**
 * Track visited Domo instances
 * @param {string} url - The tab URL
 */
async function trackDomoInstance(url) {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;

    // Only track .domo.com domains that aren't excluded
    if (
      hostname.includes('domo.com') &&
      !EXCLUDED_HOSTNAMES.includes(hostname)
    ) {
      // Extract subdomain (e.g., 'mycompany' from 'mycompany.domo.com')
      const instance = hostname.replace('.domo.com', '');
      const result = await chrome.storage.sync.get(['visitedDomoInstances']);
      const visited = result.visitedDomoInstances || [];

      // Add instance if not already in list
      if (!visited.includes(instance)) {
        const updated = [...visited, instance].sort();
        await chrome.storage.sync.set({ visitedDomoInstances: updated });
        console.log(`[Background] Tracked new Domo instance: ${instance}`);
      }
    }
  } catch (error) {
    console.error('[Background] Error tracking Domo instance:', error);
  }
}

/**
 * LRU eviction - remove least recently used tab if cache is full
 */
function evictLRUIfNeeded() {
  if (tabContexts.size >= MAX_CACHED_TABS) {
    let oldestTabId = null;
    let oldestTime = Infinity;

    for (const [tabId, timestamp] of tabAccessTimes.entries()) {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestTabId = tabId;
      }
    }

    if (oldestTabId !== null) {
      console.log(`[Background] Evicting LRU tab ${oldestTabId}`);
      tabContexts.delete(oldestTabId);
      tabAccessTimes.delete(oldestTabId);
    }
  }
}

/**
 * Update LRU timestamp for a tab
 */
function touchTab(tabId) {
  tabAccessTimes.set(tabId, Date.now());
}

/**
 * Store context for a specific tab and push to content script
 */
function setTabContext(tabId, context) {
  evictLRUIfNeeded();
  tabContexts.set(tabId, context);
  touchTab(tabId);

  // Persist to session storage (async, non-blocking)
  persistToSession();

  if (context.domoObject?.metadata?.name) {
    setTabTitle(tabId, context.domoObject.metadata.name);
  }

  const contextData = context.toJSON();

  // Send to content script in the specific tab
  chrome.tabs
    .sendMessage(tabId, {
      type: 'TAB_CONTEXT_UPDATED',
      context: contextData
    })
    .catch((error) => {
      console.log(
        `[Background] Could not send context to tab ${tabId}:`,
        error.message
      );
    });

  // Broadcast to extension pages (popup, sidepanel)
  chrome.runtime
    .sendMessage({
      type: 'TAB_CONTEXT_UPDATED',
      tabId: tabId,
      context: contextData
    })
    .catch((error) => {
      // No listeners, that's fine (popup/sidepanel might not be open)
    });
}

function setTabTitle(tabId, objectName) {
  try {
    chrome.scripting.executeScript({
      target: { tabId },
      func: (objectName) => {
        if (document.title.trim() !== 'Domo') {
          return;
        }
        document.title = `${objectName} - Domo`;
      },
      args: [objectName],
      world: 'MAIN'
    });
  } catch (error) {
    console.error(`[Background] Error updating title for tab ${tabId}:`, error);
  }
}

/**
 * Get context for a specific tab
 */
function getTabContext(tabId) {
  touchTab(tabId);
  return tabContexts.get(tabId) || null;
}

/**
 * Persist current tab contexts to session storage
 */
async function persistToSession() {
  try {
    // Convert Map to array for storage
    const contextsArray = Array.from(tabContexts.entries()).slice(
      0,
      MAX_CACHED_TABS
    );
    await chrome.storage.session.set({
      [SESSION_STORAGE_KEY]: contextsArray
    });
  } catch (error) {
    console.error('[Background] Error persisting to session storage:', error);
  }
}

/**
 * Restore tab contexts from session storage on service worker wake
 */
async function restoreFromSession() {
  try {
    const result = await chrome.storage.session.get(SESSION_STORAGE_KEY);
    if (result[SESSION_STORAGE_KEY]) {
      const contextsArray = result[SESSION_STORAGE_KEY];
      tabContexts.clear();
      tabAccessTimes.clear();

      for (const [tabId, context] of contextsArray) {
        tabContexts.set(tabId, context);
        touchTab(tabId);
      }

      console.log(
        `[Background] Restored ${tabContexts.size} tab contexts from session`
      );
    }
  } catch (error) {
    console.error('[Background] Error restoring from session storage:', error);
  }
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details);

  // Open options page with activity tab on fresh install
  if (details.reason === 'install') {
    // Create a new tab with the activity hash directly
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/index.html#activity')
    });
  }

  // Set default configurations
  chrome.storage.sync.get(null, (result) => {
    // Set default favicon rule if none exists
    if (!result.faviconRules || result.faviconRules.length === 0) {
      const defaultFaviconRule = [
        {
          id: Date.now(),
          pattern: '.*',
          effect: 'instance-logo',
          color: '#000000'
        }
      ];
      chrome.storage.sync.set({ faviconRules: defaultFaviconRule });
    }
  });
});

// Restore contexts on service worker startup
restoreFromSession();

// Track last clipboard value to detect changes
let lastClipboardValue = '';

/**
 * Check clipboard and notify listeners if it contains a valid Domo object ID
 * Note: Reading clipboard requires document focus, which may not be available when popup is open
 * This function will attempt to read, but may return cached value from session storage if read fails
 */
async function checkClipboard() {
  try {
    // Service workers can't directly access navigator.clipboard
    // We need to execute in an active tab context
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      console.log('[Background] No active tab found for clipboard check');
      // Return cached value from session storage if available
      const cached = await chrome.storage.session.get(['lastClipboardValue']);
      return cached.lastClipboardValue || null;
    }

    const tabId = tabs[0].id;
    const tabUrl = tabs[0].url;

    console.log(`[Background] Checking clipboard in tab ${tabId}`, tabs[0]);

    // Execute clipboard read in the tab's context
    // Note: This may fail if the tab doesn't have focus (e.g., when popup is open)
    try {
      const results = await chrome.scripting.executeScript({
        target: { tabId },
        func: async () => {
          try {
            // Try to read clipboard - this requires the document to have focus
            const text = await navigator.clipboard.readText();
            return { success: true, text };
          } catch (err) {
            // If clipboard read fails (usually due to focus), return error
            return { success: false, error: err.message };
          }
        },
        world: 'MAIN'
      });

      console.log('[Background] Clipboard check results:', results);
      const result = results?.[0]?.result;

      if (result?.success && result?.text) {
        const clipboardText = result.text;

        // Cache in session storage for later retrieval
        await chrome.storage.session.set({ lastClipboardValue: clipboardText });

        // Only send CLIPBOARD_UPDATED message if the value has changed
        if (clipboardText !== lastClipboardValue) {
          lastClipboardValue = clipboardText;

          // Notify all extension contexts (popup, sidepanel) about clipboard change
          chrome.runtime
            .sendMessage({
              type: 'CLIPBOARD_UPDATED',
              clipboardData: clipboardText
            })
            .catch(() => {
              // No listeners, that's fine
            });
        }

        return clipboardText;
      } else {
        console.log(
          '[Background] Clipboard read failed, using cached value:',
          result?.error
        );
        // Return cached value from session storage
        const cached = await chrome.storage.session.get(['lastClipboardValue']);
        return cached.lastClipboardValue || null;
      }
    } catch (execError) {
      console.log(
        '[Background] Execute script failed, using cached value:',
        execError
      );
      // Return cached value from session storage
      const cached = await chrome.storage.session.get(['lastClipboardValue']);
      return cached.lastClipboardValue || null;
    }
  } catch (error) {
    console.error('[Background] Error checking clipboard:', error);
    return null;
  }
}

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[Background] Tab ${tabId} removed, cleaning up context`);
  tabContexts.delete(tabId);
  tabAccessTimes.delete(tabId);
  persistToSession();
});

// Detect context when tab becomes active (eager detection)
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  console.log(`[Background] Tab ${tabId} activated in window ${windowId}`);

  // Check if we already have context for this tab
  if (!tabContexts.has(tabId)) {
    // Trigger detection for the active tab
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url && tab.url.includes('domo.com')) {
        console.log(`[Background] Eager detection for active tab ${tabId}`);
        await detectAndStoreContext(tabId);
      }
    } catch (error) {
      console.error(
        `[Background] Error in eager detection for tab ${tabId}:`,
        error
      );
    }
  }
});

// Detect context when URL changes (lazy detection for background tabs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // React to URL changes on Domo domains
  if (changeInfo.url && changeInfo.url.includes('domo.com')) {
    console.log(
      `[Background] URL changed for tab ${tabId}, triggering detection`
    );

    // Track this Domo instance
    await trackDomoInstance(changeInfo.url);

    await detectAndStoreContext(tabId);

    // Trigger favicon application for new URL with retry logic
    // sendMessageWithRetry(tabId, { type: 'APPLY_FAVICON' }, 3)
    //   .then(() => {
    //     console.log(`[Background] Applied favicon for tab ${tabId}`);
    //   })
    //   .catch((error) => {
    //     console.log(`[Background] Could not send APPLY_FAVICON to tab ${tabId}:`, error.message);
    //   });
  }

  // Apply favicon when favIconUrl changes (page loaded or favicon updated)
  // if (changeInfo.favIconUrl && tab.url?.includes('domo.com')) {
  //   console.log(
  //     `[Background] Favicon changed for tab ${tabId}, applying rules`
  //   );
  //   sendMessageWithRetry(tabId, { type: 'APPLY_FAVICON' }, 3)
  //     .then(() => {
  //       console.log(`[Background] Applied favicon for tab ${tabId}`);
  //     })
  //     .catch((error) => {
  //       console.log(`[Background] Could not send APPLY_FAVICON to tab ${tabId}:`, error.message);
  //     });
  // }

  // Update title if it's just "Domo" and we have object metadata
  if (changeInfo.title === 'Domo' && tab.url?.includes('domo.com')) {
    const context = getTabContext(tabId);
    if (context?.domoObject?.metadata?.name) {
      console.log(
        `[Background] Updating title for tab ${tabId} to include object name`
      );
      try {
        await chrome.scripting.executeScript({
          target: { tabId },
          func: (name) => {
            document.title = `${name} - Domo`;
          },
          args: [context.domoObject.metadata.name],
          world: 'MAIN'
        });
      } catch (error) {
        console.error(
          `[Background] Error updating title for tab ${tabId}:`,
          error
        );
      }
    }
  }
});

// Detect context when history state changes (SPA navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.url && details.url.includes('domo.com')) {
    console.log(
      `[Background] History state updated for tab ${details.tabId}, triggering detection`
    );
    await detectAndStoreContext(details.tabId);
  }
});

// Listen for favicon rule changes and notify all Domo tabs
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync' && changes.faviconRules) {
    console.log('[Background] Favicon rules changed, notifying all Domo tabs');

    // Get all tabs with domo.com URLs
    const tabs = await chrome.tabs.query({ url: '*://*.domo.com/*' });

    for (const tab of tabs) {
      sendMessageWithRetry(tab.id, { type: 'APPLY_FAVICON' }, 3)
        .then(() => {
          console.log(`[Background] Updated favicon for tab ${tab.id}`);
        })
        .catch((error) => {
          console.log(
            `[Background] Could not notify tab ${tab.id}:`,
            error.message
          );
        });
    }
  }
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'check_clipboard') {
    console.log('[Background] Keyboard command triggered: check_clipboard');
    checkClipboard();
  }
});

/**
 * Detect and store context for a specific tab
 * Injects detection script into page and enriches with API data
 * @returns {DomoContext|null} DomoContext instance or null
 */
async function detectAndStoreContext(tabId) {
  try {
    // Get tab info for URL
    const tab = await chrome.tabs.get(tabId);
    const context = new DomoContext(tabId, tab.url, null);
    setTabContext(tabId, context);

    // Execute detection script in page context
    const detected = await executeInPage(detectCurrentObject, [], tabId);
    if (!detected) {
      console.log(`[Background] No Domo object detected on tab ${tabId}`);
      return null;
    }
    const typeModel = getObjectType(detected.typeId);

    if (!typeModel) {
      console.warn(`[Background] Unknown object type: ${detected.typeId}`);
      return null;
    }

    // Extract ID using model if not already extracted
    let objectId = detected.id;
    if (!objectId) {
      objectId = typeModel.extractObjectId(detected.url);
    }

    if (!objectId) {
      console.warn(`[Background] Could not extract ID for ${detected.typeId}`);
      return null;
    }

    // Create DomoObject
    const domoObject = new DomoObject(
      detected.typeId,
      objectId,
      detected.baseUrl,
      {} // metadata will be enriched below
    );

    // Prepare parameters for page-safe enrichment function
    const params = {
      typeId: typeModel.id,
      objectId,
      baseUrl: detected.baseUrl,
      apiConfig: typeModel.api,
      requiresParent: typeModel.requiresParentForApi(),
      parentId: null,
      throwOnError: true
    };

    // Enrich with details - throw on error for current object detection
    domoObject.metadata = await executeInPage(
      fetchObjectDetailsInPage,
      [params],
      tabId
    );

    // Update DomoContext with DomoObject
    context.domoObject = domoObject;

    console.log(
      `[Background] Detected and stored context for tab ${tabId}:`,
      context
    );
    setTabContext(tabId, context);
    return context.toJSON();
  } catch (error) {
    console.error(
      `[Background] Error detecting context for tab ${tabId}:`,
      error
    );
    return null;
  }
}

/**
 * Message handler for popup/sidepanel requests
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'GET_TAB_CONTEXT': {
          const { windowId, tabId } = message;

          // If specific tabId provided, use it (sidepanel with locked tab)
          if (tabId) {
            const context = getTabContext(tabId);
            if (!context) {
              // Trigger detection if not cached
              const detected = await detectAndStoreContext(tabId);
              sendResponse({ success: true, context: detected });
            } else {
              sendResponse({ success: true, context });
            }
            return;
          }

          // Otherwise, get active tab in the specified window (popup)
          const tabs = await chrome.tabs.query({ active: true, windowId });
          if (!tabs || tabs.length === 0) {
            sendResponse({ success: false, error: 'No active tab found' });
            return;
          }

          const activeTabId = tabs[0].id;
          let context = getTabContext(activeTabId);

          if (!context && tabs[0].url && tabs[0].url.includes('domo.com')) {
            // Trigger detection if not cached
            context = await detectAndStoreContext(activeTabId);
          }

          sendResponse({ success: true, context, tabId: activeTabId });
          break;
        }

        case 'DETECT_CONTEXT': {
          // Use tabId from message if provided, otherwise from sender
          const targetTabId = message.tabId || sender.tab?.id;
          if (!targetTabId) {
            sendResponse({ success: false, error: 'No tab ID available' });
            return;
          }
          const context = await detectAndStoreContext(targetTabId);
          sendResponse({ success: true, context });
          break;
        }

        case 'CHECK_CLIPBOARD': {
          // Check clipboard and return current value
          console.log('[Background] CHECK_CLIPBOARD message received');
          const clipboardData = await checkClipboard();
          console.log('[Background] Returning clipboard data:', clipboardData);
          sendResponse({ success: true, clipboardData });
          break;
        }

        case 'CLIPBOARD_COPIED': {
          // Content script detected a copy event and read the clipboard
          const { clipboardData } = message;
          console.log('[Background] CLIPBOARD_COPIED received:', clipboardData);

          if (clipboardData) {
            // Cache in session storage
            await chrome.storage.session.set({
              lastClipboardValue: clipboardData
            });

            // Update in-memory value and notify if changed
            if (clipboardData !== lastClipboardValue) {
              lastClipboardValue = clipboardData;

              // Notify all extension contexts about clipboard change
              chrome.runtime
                .sendMessage({
                  type: 'CLIPBOARD_UPDATED',
                  clipboardData: clipboardData
                })
                .catch(() => {
                  // No listeners, that's fine
                });
            }
          }

          sendResponse({ success: true });
          break;
        }
        default:
          sendResponse({ success: false, error: 'Unknown message type' });
      }
    } catch (error) {
      console.error('[Background] Error handling message:', error);
      sendResponse({ success: false, error: error.message });
    }
  })();

  return true; // Keep message channel open for async response
});
