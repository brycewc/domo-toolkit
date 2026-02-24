import { DomoContext, DomoObject, getObjectType } from '@/models';
import {
  fetchObjectDetailsInPage,
  getCardsForObject,
  getChildPages,
  getCurrentUser,
  getDataflowForOutputDataset,
  getPagesForCards
} from '@/services';
import {
  clearCookies,
  detectCurrentObject,
  EXCLUDED_HOSTNAMES,
  executeInPage
} from '@/utils';

/**
 * Resolve an object ID via API when it cannot be extracted from the URL.
 * Used for types like FILESET_FILE where the URL contains a file path
 * instead of the actual object UUID.
 * @param {string} typeId - The object type ID
 * @param {Object} context - Extra context from detectCurrentObject
 * @param {number} tabId - The Chrome tab ID for executing in-page API calls
 * @returns {Promise<string|null>} The resolved object ID, or null
 */
async function resolveObjectId(typeId, context, tabId) {
  switch (typeId) {
    case 'FILESET_FILE': {
      const { filePath, filesetId } = context;
      return executeInPage(
        async (filesetId, filePath) => {
          const res = await fetch(
            `/api/files/v1/filesets/${filesetId}/path?path=${filePath}`
          );
          if (!res.ok) return null;
          const data = await res.json();
          return data?.id || null;
        },
        [filesetId, filePath],
        tabId
      );
    }
    default:
      return null;
  }
}

// Set session storage access level so content scripts can access it
chrome.storage.session.setAccessLevel({
  accessLevel: 'TRUSTED_AND_UNTRUSTED_CONTEXTS'
});

/**
 * Ping the content script on a tab and re-inject it if it doesn't respond.
 * Keeps clipboard monitoring, modal detection, and favicon logic alive
 * on long-lived tabs where the content script may have been disconnected.
 */
async function ensureContentScript(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: 'PING' });
  } catch {
    await chrome.scripting.executeScript({
      files: ['src/contentScript.js'],
      target: { tabId }
    });
  }
}

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
      tabContexts.delete(oldestTabId);
      tabAccessTimes.delete(oldestTabId);
    }
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

      for (const [tabId, contextData] of contextsArray) {
        // Reconstruct DomoContext instance from plain object
        const context = DomoContext.fromJSON(contextData);
        tabContexts.set(tabId, context);
        touchTab(tabId);
      }
    }
  } catch (error) {
    console.error('[Background] Error restoring from session storage:', error);
  }
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

  if (context?.domoObject?.metadata?.name) {
    setTabTitle(tabId, context.domoObject.metadata.name);
  }

  const contextData = context?.toJSON();

  // Send to content script in the specific tab
  chrome.tabs
    .sendMessage(tabId, {
      context: contextData,
      type: 'TAB_CONTEXT_UPDATED'
    })
    .catch((error) => {
      console.warn(
        `[Background] Could not send context to tab ${tabId}:`,
        error.message
      );
    });

  // Broadcast to extension pages (popup, sidepanel)
  chrome.runtime
    .sendMessage({
      context: contextData,
      tabId: tabId,
      type: 'TAB_CONTEXT_UPDATED'
    })
    .catch(() => {});
}

function setTabTitle(tabId, objectName) {
  try {
    chrome.scripting.executeScript({
      args: [objectName],
      func: (objectName) => {
        if (document.title.trim() !== 'Domo') {
          return;
        }
        document.title = `${objectName} - Domo`;
      },
      target: { tabId },
      world: 'MAIN'
    });
  } catch (error) {
    console.error(`[Background] Error updating title for tab ${tabId}:`, error);
  }
}

/**
 * Update LRU timestamp for a tab
 */
function touchTab(tabId) {
  tabAccessTimes.set(tabId, Date.now());
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  // Open welcome page on fresh install
  if (details.reason === 'install') {
    // Create a new tab with the activity hash directly
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/index.html#welcome')
    });
  }

  // Set default configurations
  chrome.storage.sync.get(null, (result) => {
    // Set default favicon rule if none exists
    if (!result.faviconRules || result.faviconRules.length === 0) {
      const defaultFaviconRule = [
        {
          color: '#000000',
          effect: 'instance-logo',
          id: Date.now(),
          pattern: '.*'
        }
      ];
      chrome.storage.sync.set({ faviconRules: defaultFaviconRule });
    }
  });
});

// Restore contexts on service worker startup
restoreFromSession();

/**
 * Update extension icon based on theme preference
 * Uses dark icon variant for light mode and regular icon for dark mode
 */
function updateExtensionIcon(isDark) {
  const iconPath = isDark
    ? {
        128: 'public/toolkit-dark-128.png',
        16: 'public/toolkit-dark-16.png',
        24: 'public/toolkit-dark-24.png',
        32: 'public/toolkit-dark-32.png',
        48: 'public/toolkit-dark-48.png'
      }
    : {
        128: 'public/toolkit-128.png',
        16: 'public/toolkit-16.png',
        24: 'public/toolkit-24.png',
        32: 'public/toolkit-32.png',
        48: 'public/toolkit-48.png'
      };

  chrome.action.setIcon({ path: iconPath }).catch((error) => {
    console.error('[Background] Error setting icon:', error);
  });
}

/**
 * Update icon based on stored icon style preference
 */
async function updateIconFromPreference() {
  const result = await chrome.storage.sync.get(['iconStyle']);
  updateExtensionIcon(result.iconStyle === 'dark');
}

// Set initial icon based on stored preference
updateIconFromPreference();

// Track last clipboard value to detect changes
let lastClipboardValue = '';

// 431 error handler function (stored for add/remove)
// Only active when mode is 'auto' - preserves last 2 instances
async function handle431Response(details) {
  if (details.statusCode === 431) {
    try {
      // Find all Domo tabs to determine which instances to preserve
      const allTabs = await chrome.tabs.query({ url: '*://*.domo.com/*' });
      const domoTabs = allTabs.filter((tab) => {
        try {
          const tabHostname = new URL(tab.url).hostname;
          return !EXCLUDED_HOSTNAMES.includes(tabHostname);
        } catch {
          return false;
        }
      });

      // Get unique domains from Domo tabs, prioritizing most recently accessed
      // Sort by lastAccessed if available, otherwise by tab id (higher = more recent)
      domoTabs.sort(
        (a, b) => (b.lastAccessed || b.id) - (a.lastAccessed || a.id)
      );

      const seenDomains = new Set();
      const recentDomoTabs = [];
      for (const tab of domoTabs) {
        const domain = new URL(tab.url).hostname;
        if (!seenDomains.has(domain)) {
          seenDomains.add(domain);
          recentDomoTabs.push({ domain, tab });
          if (recentDomoTabs.length >= 2) break;
        }
      }

      // Get DA-SID cookie names for each domain to preserve
      const daSidsToPreserve = [];
      for (const { tab } of recentDomoTabs) {
        try {
          const data = await executeInPage(
            async () => window.bootstrap?.data,
            [],
            tab.id
          );
          if (data?.environmentId && data?.analytics?.company) {
            daSidsToPreserve.push(
              `DA-SID-${data.environmentId}-${data.analytics.company}`
            );
          }
        } catch (e) {
          console.warn(
            `[Background] Could not get DA-SID for tab ${tab.id}:`,
            e
          );
        }
      }

      let domainsToPreserve = recentDomoTabs.map((t) => t.domain);

      // Safeguard: if no Domo tabs found, at least preserve the current domain
      if (domainsToPreserve.length === 0) {
        const currentDomain = new URL(details.url).hostname;
        domainsToPreserve = [currentDomain];
      }

      await clearCookies({
        daSidsToPreserve,
        domains: domainsToPreserve,
        excludeDomains: true
      });
      chrome.tabs.reload(details.tabId);
    } catch (error) {
      console.error('[Background] Error handling 431 response:', error);
    }
  }
}

const webRequestFilter = {
  types: ['main_frame'],
  urls: ['*://*.domo.com/*']
};

// Track if 431 listener is currently active
let is431ListenerActive = false;

function disable431Listener() {
  if (is431ListenerActive) {
    chrome.webRequest.onResponseStarted.removeListener(handle431Response);
    is431ListenerActive = false;
  }
}

function enable431Listener() {
  if (!is431ListenerActive) {
    chrome.webRequest.onResponseStarted.addListener(
      handle431Response,
      webRequestFilter
    );
    is431ListenerActive = true;
  }
}

// Initialize 431 listener based on stored setting
chrome.storage.sync.get(['defaultClearCookiesHandling'], (result) => {
  const mode = result.defaultClearCookiesHandling || 'auto';

  // Only enable 431 auto-clear listener for 'auto' mode
  if (mode === 'auto') {
    enable431Listener();
  }
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  tabContexts.delete(tabId);
  tabAccessTimes.delete(tabId);
  persistToSession();
});

// Detect context when tab becomes active (eager detection)
chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // Always update icon based on current preference
  updateIconFromPreference();

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && tab.url.includes('domo.com')) {
      await ensureContentScript(tabId);

      if (!tabContexts.has(tabId)) {
        await detectAndStoreContext(tabId);
      }
    }
  } catch (error) {
    console.error(`[Background] Error in tab activation for ${tabId}:`, error);
  }
});

// Detect context when URL changes (lazy detection for background tabs)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // React to URL changes on Domo domains
  if (changeInfo.url && changeInfo.url.includes('domo.com')) {
    await detectAndStoreContext(tabId);

    // Update title if it's just "Domo" and we have object metadata
    if (changeInfo.title === 'Domo' && tab.url?.includes('domo.com')) {
      const context = getTabContext(tabId);
      if (context?.domoObject?.metadata?.name) {
        try {
          await chrome.scripting.executeScript({
            args: [context.domoObject.metadata.name],
            func: (name) => {
              document.title = `${name} - Domo`;
            },
            target: { tabId },
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
  }
});

// Detect context when history state changes (SPA navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.url && details.url.includes('domo.com')) {
    await detectAndStoreContext(details.tabId);
  }
});

// Listen for setting changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync' && changes.iconStyle !== undefined) {
    const style = changes.iconStyle.newValue || 'light';
    updateExtensionIcon(style === 'dark');
  }

  if (
    areaName === 'sync' &&
    changes.defaultClearCookiesHandling !== undefined
  ) {
    const mode = changes.defaultClearCookiesHandling.newValue || 'auto';

    // Only enable 431 auto-clear listener for 'auto' mode
    if (mode === 'auto') {
      enable431Listener();
    } else {
      disable431Listener();
    }
  }

  if (areaName === 'sync' && changes.faviconRules) {
    // Get all tabs with domo.com URLs
    const tabs = await chrome.tabs.query({
      url: '*://*.domo.com/*',
      windowType: 'normal'
    });

    for (const tab of tabs) {
      sendMessageWithRetry(tab.id, { type: 'APPLY_FAVICON' }, 3).catch(
        (error) => {
          console.warn(
            `[Background] Could not notify tab ${tab.id} of favicon rules change:`,
            error.message
          );
        }
      );
    }
  }
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'copy_id') {
    // Get the active tab
    chrome.tabs.query(
      { active: true, currentWindow: true, windowType: 'normal' },
      async (tabs) => {
        if (tabs.length === 0) {
          return;
        }
        const tab = tabs[0];
        const context = getTabContext(tab.id);
        if (context?.domoObject?.id) {
          try {
            await executeInPage(
              async (text) => {
                await navigator.clipboard.writeText(text);
              },
              [context.domoObject.id],
              tab.id
            );
          } catch (error) {
            console.error(
              '[Background] Failed to copy ID to clipboard:',
              error
            );
          }
        }
      }
    );
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
    if (!tab || !tab?.url?.includes('domo.com')) {
      // Not a Domo domain - clear any existing context and broadcast the update
      const hadContext = tabContexts.has(tabId);
      tabContexts.delete(tabId);
      tabAccessTimes.delete(tabId);
      persistToSession();

      // Broadcast null context to extension pages so they update their UI
      if (hadContext) {
        chrome.runtime
          .sendMessage({
            context: null,
            tabId: tabId,
            type: 'TAB_CONTEXT_UPDATED'
          })
          .catch((error) => {
            console.warn(
              '[Background] No listeners for TAB_CONTEXT_UPDATED (null):',
              error.message
            );
          });
      }

      return null;
    }
    const context = new DomoContext(tabId, tab.url, null);
    setTabContext(tabId, context);

    // Fetch current user (non-blocking, updates context when complete)
    getCurrentUser(tabId)
      .then((user) => {
        context.user = user;
        setTabContext(tabId, context);
      })
      .catch((error) => {
        console.warn(
          `[Background] Could not fetch current user for tab ${tabId}:`,
          error.message
        );
      });

    // Execute detection script in page context
    const detected = await executeInPage(detectCurrentObject, [], tabId);
    if (!detected) {
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

    // Resolve ID via API if needed (e.g., FILESET_FILE where ID isn't in the URL)
    if (!objectId && detected.resolveContext) {
      objectId = await resolveObjectId(
        detected.typeId,
        detected.resolveContext,
        tabId
      );
    }

    if (!objectId) {
      console.warn(`[Background] Could not extract ID for ${detected.typeId}`);
      return null;
    }

    // Extract parent ID from URL if available
    let parentId = typeModel.extractParentId(detected.url);

    // For types resolved via resolveContext, extract parentId if available
    if (!parentId && detected.resolveContext?.filesetId) {
      parentId = detected.resolveContext.filesetId;
    }

    // Create DomoObject with original URL and parent ID for immediate URL building
    const domoObject = new DomoObject(
      detected.typeId,
      objectId,
      detected.baseUrl,
      {}, // metadata will be enriched below
      detected.url, // pass original URL for parent extraction
      parentId // pass parent ID if extracted from URL
    );

    // Prepare parameters for page-safe enrichment function
    const params = {
      apiConfig: typeModel.api,
      baseUrl: detected.baseUrl,
      objectId,
      parentId: parentId || null,
      requiresParent: typeModel.requiresParentForApi(),
      throwOnError: true,
      typeId: typeModel.id
    };

    // Enrich with details - throw on error for current object detection
    const enrichedMetadata =
      (await executeInPage(fetchObjectDetailsInPage, [params], tabId)) || {};

    // Set parentId from API response if not already extracted from URL
    if (!parentId && enrichedMetadata.parentId) {
      parentId = enrichedMetadata.parentId;
      domoObject.parentId = parentId;
    }

    domoObject.metadata = enrichedMetadata;

    // DATA_SOURCE: resolve DATAFLOW_TYPE parent via reverse-lookup API
    if (
      !parentId &&
      typeModel.id === 'DATA_SOURCE' &&
      enrichedMetadata.details?.type?.toLowerCase() === 'dataflow'
    ) {
      try {
        const dataflowId = await getDataflowForOutputDataset(objectId, tabId);
        parentId = dataflowId;
        domoObject.parentId = dataflowId;
      } catch (error) {
        console.warn(
          `[Background] Could not resolve DataFlow parent for DATA_SOURCE ${objectId}:`,
          error.message
        );
      }
    }

    // For objects with parents, enrich metadata with parent details
    if (parentId && typeModel.parents && typeModel.parents.length > 0) {
      try {
        await domoObject.getParent(false, detected.url, tabId);
      } catch (error) {
        console.warn(
          `[Background] Could not enrich parent metadata for ${typeModel.id} ${objectId}:`,
          error
        );
      }
    }

    // Update DomoContext with DomoObject
    context.domoObject = domoObject;
    setTabContext(tabId, context);

    // For PAGE, DATA_APP_VIEW, WORKSHEET_VIEW, and REPORT_BUILDER_VIEW types, fetch child pages asynchronously (non-blocking)
    // This happens in the background while the user interacts with the popup
    if (
      typeModel.id === 'PAGE' ||
      typeModel.id === 'DATA_APP_VIEW' ||
      typeModel.id === 'WORKSHEET_VIEW' ||
      typeModel.id === 'REPORT_BUILDER_VIEW'
    ) {
      const appId =
        typeModel.id === 'DATA_APP_VIEW' && domoObject.parentId
          ? parseInt(domoObject.parentId)
          : null;

      // Fetch child pages in background without blocking
      getChildPages({
        appId,
        includeGrandchildren: true,
        pageId: parseInt(objectId),
        pageType: typeModel.id,
        tabId
      })
        .then((childPages) => {
          // Get the current context (it might have been updated)
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            // Store pages in metadata.details.childPages or appPages
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }

            // For DATA_APP_VIEW, WORKSHEET_VIEW, and REPORT_BUILDER_VIEW, store in appPages (sibling pages in the app)
            // For PAGE, store in childPages (actual child pages)
            if (
              typeModel.id === 'DATA_APP_VIEW' ||
              typeModel.id === 'WORKSHEET_VIEW' ||
              typeModel.id === 'REPORT_BUILDER_VIEW'
            ) {
              currentContext.domoObject.metadata.details.appPages = childPages;
            } else {
              currentContext.domoObject.metadata.details.childPages =
                childPages;
            }

            // Update the stored context
            setTabContext(tabId, currentContext);
          }
        })
        .catch((error) => {
          console.error(
            `[Background] Error fetching child pages for ${typeModel.id} ${objectId}:`,
            error
          );
          // Store empty array on error so we don't keep retrying
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            if (
              typeModel.id === 'DATA_APP_VIEW' ||
              typeModel.id === 'WORKSHEET_VIEW' ||
              typeModel.id === 'REPORT_BUILDER_VIEW'
            ) {
              currentContext.domoObject.metadata.details.appPages = [];
            } else {
              currentContext.domoObject.metadata.details.childPages = [];
            }
            setTabContext(tabId, currentContext);
          }
        });
    }

    // For CARD types, fetch child pages asynchronously (non-blocking)
    if (typeModel.id === 'CARD') {
      // Fetch pages for card in background without blocking
      getPagesForCards([parseInt(objectId)], tabId)
        .then(({ pages: childPages }) => {
          // Get the current context (it might have been updated)
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            // Store child pages in metadata.details.childPages
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.childPages = childPages;

            // Update the stored context
            setTabContext(tabId, currentContext);
          }
        })
        .catch((error) => {
          console.error(
            `[Background] Error fetching child pages for ${typeModel.id} ${objectId}:`,
            error
          );
          // Store empty array on error
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.childPages = [];
            setTabContext(tabId, currentContext);
          }
        });
    }

    // For PAGE, DATA_APP_VIEW, and DATA_SOURCE types, fetch cards asynchronously (non-blocking)
    if (
      typeModel.id === 'PAGE' ||
      typeModel.id === 'DATA_APP_VIEW' ||
      typeModel.id === 'DATA_SOURCE' ||
      typeModel.id === 'WORKSHEET_VIEW' ||
      typeModel.id === 'REPORT_BUILDER_VIEW'
    ) {
      // Fetch cards in background without blocking
      getCardsForObject({
        objectId,
        objectType: typeModel.id,
        tabId
      })
        .then((cards) => {
          // Get the current context (it might have been updated)
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject) {
            // Store cards in metadata.details.cards
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.cards = cards;

            // Update the stored context
            setTabContext(tabId, currentContext);
          }
        })
        .catch((error) => {
          console.error(
            `[Background] Error fetching cards for ${typeModel.id} ${objectId}:`,
            error
          );
          // Store empty array on error
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.cards = [];
            setTabContext(tabId, currentContext);
          }
        });
    }

    return context;
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
        case 'CLIPBOARD_COPIED': {
          // Content script or Copy component detected a copy event
          const { clipboardData, domoObject } = message;

          // Cache in session storage (include object info if available)
          await chrome.storage.session.set({
            lastClipboardObject: clipboardData ? domoObject || null : null,
            lastClipboardValue: clipboardData || ''
          });

          // Update in-memory value and notify if changed
          if ((clipboardData || '') !== lastClipboardValue) {
            lastClipboardValue = clipboardData || '';

            // Notify all extension contexts about clipboard change
            chrome.runtime
              .sendMessage({
                clipboardData: clipboardData || '',
                domoObject: clipboardData ? domoObject || null : null,
                type: 'CLIPBOARD_UPDATED'
              })
              .catch(() => {
                // No listeners, that's fine
              });
          }

          sendResponse({ success: true });
          break;
        }

        case 'DETECT_CONTEXT': {
          // Use tabId from message if provided, otherwise from sender
          const targetTabId = message.tabId || sender.tab?.id;
          if (!targetTabId) {
            sendResponse({ error: 'No tab ID available', success: false });
            return;
          }
          const context = await detectAndStoreContext(targetTabId);
          sendResponse({ context: context?.toJSON(), success: true });
          break;
        }

        case 'GET_TAB_CONTEXT': {
          const { tabId, windowId } = message;

          // If specific tabId provided, use it (sidepanel with locked tab)
          if (tabId) {
            const context = getTabContext(tabId);
            if (!context) {
              // Trigger detection if not cached
              const detected = await detectAndStoreContext(tabId);
              sendResponse({ context: detected?.toJSON(), success: true });
            } else {
              sendResponse({ context: context?.toJSON(), success: true });
            }
            return;
          }

          // Otherwise, get active tab in the specified window (popup)
          const tabs = await chrome.tabs.query({
            active: true,
            windowId
          });

          if (!tabs || tabs.length === 0) {
            sendResponse({ error: 'No active tab found', success: false });
            return;
          }

          const activeTabId = tabs[0].id;
          let context = getTabContext(activeTabId);

          if (!context && tabs[0].url && tabs[0].url.includes('domo.com')) {
            // Trigger detection if not cached
            context = await detectAndStoreContext(activeTabId);
          }

          sendResponse({
            context: context?.toJSON(),
            success: true,
            tabId: activeTabId
          });
          break;
        }

        case 'UPDATE_CONTEXT_METADATA': {
          // Update cached context metadata without re-fetching from API
          const { metadataUpdates, tabId } = message;
          const context = getTabContext(tabId);

          if (!context) {
            sendResponse({ error: 'No context found for tab', success: false });
            return;
          }

          // Merge updates into metadata.details
          if (context.domoObject?.metadata) {
            context.domoObject.metadata.details = {
              ...context.domoObject.metadata.details,
              ...metadataUpdates
            };
            // Also update the top-level name if it was changed
            if (metadataUpdates.name !== undefined) {
              context.domoObject.metadata.name = metadataUpdates.name;
            }
          }

          // Re-store to persist and broadcast update
          setTabContext(tabId, context);
          sendResponse({ context: context.toJSON(), success: true });
          break;
        }

        default:
          sendResponse({ error: 'Unknown message type', success: false });
      }
    } catch (error) {
      console.error('[Background] Error handling message:', error);
      sendResponse({ error: error.message, success: false });
    }
  })();

  return true; // Keep message channel open for async response
});
