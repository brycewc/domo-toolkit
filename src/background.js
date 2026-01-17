import { DomoObject, DomoContext, getObjectType } from '@/models';
import { detectCurrentObjectInPage, EXCLUDED_HOSTNAMES } from '@/utils';

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
 * Store context for a specific tab
 */
function setTabContext(tabId, context) {
  evictLRUIfNeeded();
  tabContexts.set(tabId, context);
  touchTab(tabId);

  // Persist to session storage (async, non-blocking)
  persistToSession();
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

    // Trigger favicon application for new URL
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'APPLY_FAVICON' });
    } catch (error) {
      // Tab might not be ready yet, ignore
      console.log(`[Background] Could not send APPLY_FAVICON to tab ${tabId}`);
    }
  }

  // Apply favicon when favIconUrl changes (page loaded or favicon updated)
  if (changeInfo.favIconUrl && tab.url?.includes('domo.com')) {
    console.log(
      `[Background] Favicon changed for tab ${tabId}, applying rules`
    );
    try {
      await chrome.tabs.sendMessage(tabId, { type: 'APPLY_FAVICON' });
    } catch (error) {
      console.log(`[Background] Could not send APPLY_FAVICON to tab ${tabId}`);
    }
  }

  // Update title if it's just "Domo" and we have object metadata
  if (changeInfo.title === 'Domo' && tab.url?.includes('domo.com')) {
    const context = getTabContext(tabId);
    if (context?.domoObject?.metadata?.name) {
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
      try {
        await chrome.tabs.sendMessage(tab.id, { type: 'APPLY_FAVICON' });
      } catch (error) {
        // Tab might not have content script loaded
        console.log(`[Background] Could not notify tab ${tab.id}`);
      }
    }
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

    // Inject detection script into page context
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      world: 'MAIN',
      func: detectCurrentObjectInPage
    });

    if (!results || !results[0] || !results[0].result) {
      console.log(`[Background] No Domo object detected on tab ${tabId}`);
      setTabContext(tabId, null);
      return null;
    }

    const detected = results[0].result;
    const typeModel = getObjectType(detected.typeId);

    if (!typeModel) {
      console.warn(`[Background] Unknown object type: ${detected.typeId}`);
      setTabContext(tabId, null);
      return null;
    }

    // Extract ID using model if not already extracted
    let objectId = detected.id;
    if (!objectId) {
      objectId = typeModel.extractObjectId(detected.url);
    }

    if (!objectId) {
      console.warn(`[Background] Could not extract ID for ${detected.typeId}`);
      setTabContext(tabId, null);
      return null;
    }

    // Create DomoObject
    const domoObject = new DomoObject(
      detected.typeId,
      objectId,
      detected.baseUrl,
      {} // metadata will be enriched below
    );

    // Enrich with API data if available
    if (typeModel.api) {
      try {
        const apiData = await fetchObjectDetailsForTab(
          tabId,
          typeModel.api,
          objectId
        );
        if (apiData) {
          domoObject.metadata.details = apiData;
          domoObject.metadata.name = typeModel.api.pathToName
            .split('.')
            .reduce((current, prop) => current?.[prop], apiData);
        }
      } catch (error) {
        console.warn(
          `[Background] Failed to enrich ${detected.typeId} ${objectId}:`,
          error.message
        );
      }
    }

    // Create DomoContext with the tab info and DomoObject
    const context = new DomoContext(tabId, tab.url, domoObject);

    console.log(
      `[Background] Detected and stored context for tab ${tabId}:`,
      context
    );
    setTabContext(tabId, context);
    return context;
  } catch (error) {
    console.error(
      `[Background] Error detecting context for tab ${tabId}:`,
      error
    );
    setTabContext(tabId, null);
    return null;
  }
}

/**
 * Fetch object details via API in page context
 */
async function fetchObjectDetailsForTab(tabId, apiConfig, objectId) {
  const { method, endpoint, bodyTemplate } = apiConfig;

  const results = await chrome.scripting.executeScript({
    target: { tabId },
    world: 'MAIN',
    func: async (apiMethod, apiEndpoint, apiBodyTemplate, objId) => {
      let url = `/api${apiEndpoint}`.replace('{id}', objId);

      const options = {
        method: apiMethod,
        credentials: 'include'
      };

      if (apiMethod !== 'GET' && apiBodyTemplate) {
        options.body = JSON.stringify(apiBodyTemplate).replace(/{id}/g, objId);
        options.headers = {
          'Content-Type': 'application/json'
        };
      }

      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    },
    args: [method, endpoint, bodyTemplate, objectId]
  });

  return results && results[0] && results[0].result ? results[0].result : null;
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
