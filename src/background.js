import { releases } from '@/data';
import { DomoContext, DomoObject, getObjectType } from '@/models';
import {
  extractPageContentIds,
  fetchObjectDetailsInPage,
  getCardsForObject,
  getChildPages,
  getCurrentUser,
  getDataflowForOutputDataset,
  getDataflowPermission,
  getFormsForPage,
  getPagesForCards,
  getQueuesForPage,
  getSubpageIds,
  getUserGroups,
  getVersionDefinition,
  getWorkflowPermission
} from '@/services';
import {
  clearCookies,
  detectCurrentObject,
  EXCLUDED_HOSTNAMES,
  executeInPage
} from '@/utils';

/**
 * Compute whether the current user is an owner of the detected object.
 * Handles pre-computed booleans, plain IDs, typed objects, and arrays.
 * @param {string} typeId - The object type ID
 * @param {Object} details - The enriched metadata details
 * @param {number|string} userId - The current user's ID
 * @param {string[]} userGroups - Group IDs the user belongs to
 * @returns {boolean|null} true/false if determinable, null if unknown
 */
function computeIsOwner(typeId, details, userId, userGroups) {
  if (!userId) return null;

  // Types where the API pre-computes isOwner
  if (typeId === 'PAGE' || typeId === 'DATA_APP_VIEW') {
    return details?.page?.isOwner ?? null;
  }

  // Approval templates: owner is { id } on the details object
  if (typeId === 'TEMPLATE') {
    const ownerId = details?.owner?.id;
    if (ownerId == null) return null;
    return String(userId) === String(ownerId);
  }

  // Approval templates: owner is { id } on the details object
  if (typeId === 'TEMPLATE') {
    const ownerId = details?.owner?.id;
    if (ownerId == null) return null;
    return String(userId) === String(ownerId);
  }

  // Types where owner is a plain ID (always a user)
  if (typeId === 'BEAST_MODE_FORMULA' || typeId === 'MAGNUM_COLLECTION' || typeId === 'VARIABLE') {
    const ownerId = details?.owner;
    if (ownerId == null) return null;
    return String(userId) === String(ownerId);
  }

  // Helper: check a single typed owner {id, type}
  function checkTypedOwner(owner) {
    if (!owner?.id) return null;
    if (!owner.type || owner.type === 'USER') {
      return String(userId) === String(owner.id);
    }
    if (owner.type === 'GROUP') {
      return (userGroups || []).includes(String(owner.id));
    }
    return false;
  }

  // Remaining types: owner can be typed object, array, or plain ID
  const owner = details?.owner;
  if (owner == null) return null;

  // Multiple owners (array)
  if (Array.isArray(owner)) {
    // Check USER entries first (cheap)
    for (const o of owner) {
      if ((!o.type || o.type === 'USER') && String(userId) === String(o.id)) {
        return true;
      }
    }
    // Then check GROUP entries
    for (const o of owner) {
      if (o.type === 'GROUP' && (userGroups || []).includes(String(o.id))) {
        return true;
      }
    }
    return false;
  }

  // Single owner — typed object
  if (typeof owner === 'object') {
    return checkTypedOwner(owner);
  }

  // Fallback: plain ID comparison
  return String(userId) === String(owner);
}

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
    // Use the manifest-registered content script path. CRXJS transforms
    // the source file into a loader at build time, so we read the actual
    // path from the manifest to stay in sync.
    const manifest = chrome.runtime.getManifest();
    const file = manifest.content_scripts?.[0]?.js?.[0];
    if (file) {
      await chrome.scripting.executeScript({
        files: [file],
        target: { tabId }
      });
    }
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

// Per-tab detection generation counter to prevent stale async callbacks
const tabDetectionGen = new Map();

// Per-instance cache for user + groups (instance -> { user, userGroups, promise })
const instanceUserCache = new Map();

/**
 * Get or fetch the current user and their groups for an instance.
 * Returns cached data if available, otherwise fetches and caches.
 * @param {string} instance - The Domo instance subdomain
 * @param {number} tabId - The tab ID to execute API calls in
 * @returns {Promise<{ user: Object, userGroups: string[] }>}
 */
function getInstanceUser(instance, tabId) {
  const cached = instanceUserCache.get(instance);
  if (cached?.user) {
    return Promise.resolve({ user: cached.user, userGroups: cached.userGroups });
  }
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const user = await getCurrentUser(tabId);
    let userGroups = [];
    if (user?.id) {
      userGroups = await getUserGroups(user.id, tabId).catch((error) => {
        console.warn(
          `[Background] Could not fetch user groups for ${instance}:`,
          error.message
        );
        return [];
      });
    }
    const entry = { promise: null, user, userGroups };
    instanceUserCache.set(instance, entry);
    return { user, userGroups };
  })();

  // Clear cache on failure so next detection retries
  promise.catch(() => {
    instanceUserCache.delete(instance);
  });

  instanceUserCache.set(instance, { promise, user: null, userGroups: null });
  return promise;
}

/**
 * Invalidate the user cache for an instance (e.g., on logout).
 * @param {string} instance - The Domo instance subdomain
 */
function invalidateInstanceUser(instance) {
  instanceUserCache.delete(instance);
  console.log(`[Background] Invalidated user cache for instance: ${instance}`);
}

// Per-tab card error storage
const tabCardErrors = new Map();
const tabLastCardId = new Map();
const MAX_ERRORS_PER_TAB = 50;

function addCardError(tabId, error) {
  if (!tabCardErrors.has(tabId)) {
    tabCardErrors.set(tabId, []);
  }
  const errors = tabCardErrors.get(tabId);

  error.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  errors.push(error);

  // Enforce max limit (remove oldest)
  if (errors.length > MAX_ERRORS_PER_TAB) {
    errors.splice(0, errors.length - MAX_ERRORS_PER_TAB);
  }

  broadcastCardErrors(tabId);
}

function broadcastCardErrors(tabId) {
  const errors = getCardErrors(tabId);
  chrome.runtime
    .sendMessage({
      errorCount: errors.length,
      errors,
      tabId,
      type: 'CARD_ERRORS_UPDATED'
    })
    .catch(() => {});
}

function clearCardErrors(tabId) {
  tabCardErrors.delete(tabId);
  broadcastCardErrors(tabId);
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

function getCardErrors(tabId) {
  return tabCardErrors.get(tabId) || [];
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

      console.log(
        `[Background] Restored ${tabContexts.size} tab contexts from session`
      );
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
      console.log(
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
    .catch((error) => {
      // No listeners, that's fine (popup/sidepanel might not be open)
      console.log(
        '[Background] No listeners for TAB_CONTEXT_UPDATED:',
        error.message
      );
    });
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
  const currentVersion = chrome.runtime.getManifest().version;

  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/index.html#welcome')
    });
    chrome.storage.local.set({ lastSeenVersion: currentVersion });
  } else if (details.reason === 'update' && details.previousVersion) {
    const newReleases = releases.filter(
      (r) => compareVersions(r.version, details.previousVersion) > 0
    );

    if (newReleases.length > 0) {
      const hasFullPage = newReleases.some((r) => r.notify === 'fullPage');
      const hasBadge = newReleases.some((r) => r.notify === 'badge');

      if (hasFullPage) {
        chrome.tabs.create({
          url: chrome.runtime.getURL('src/options/index.html#release-notes')
        });
        chrome.storage.local.set({ lastSeenVersion: currentVersion });
      } else if (hasBadge) {
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
      } else {
        chrome.storage.local.set({ lastSeenVersion: currentVersion });
      }
    }
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

// 431 error handler function (stored for add/remove)
// Only active when mode is 'auto' - preserves last 2 instances
async function handle431Response(details) {
  if (details.statusCode === 431) {
    try {
      console.log('[Background] 431 detected, auto-clearing with preservation');

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
      console.log(
        '[Background] Found Domo tabs:',
        domoTabs.map((t) => t.url)
      );

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
            console.log(
              '[Background] Preserving DA-SID for tab',
              tab.id,
              daSidsToPreserve[daSidsToPreserve.length - 1]
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
        console.log(
          '[Background] No Domo tabs found, preserving current domain:',
          currentDomain
        );
      }

      console.log(
        '[Background] Preserving domains:',
        domainsToPreserve,
        'DA-SIDs:',
        daSidsToPreserve
      );

      const result = await clearCookies({
        daSidsToPreserve,
        domains: domainsToPreserve,
        excludeDomains: true
      });
      console.log('[Background] Handled 431 response:', result.description);
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
    console.log('[Background] 431 auto-clear listener disabled');
  }
}

function enable431Listener() {
  if (!is431ListenerActive) {
    chrome.webRequest.onResponseStarted.addListener(
      handle431Response,
      webRequestFilter
    );
    is431ListenerActive = true;
    console.log('[Background] 431 auto-clear listener enabled');
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
  console.log(`[Background] Tab ${tabId} removed, cleaning up context`);
  tabContexts.delete(tabId);
  tabAccessTimes.delete(tabId);
  tabDetectionGen.delete(tabId);
  tabCardErrors.delete(tabId);
  tabLastCardId.delete(tabId);
  persistToSession();
});

// Detect context when tab becomes active (eager detection)
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  console.log(`[Background] Tab ${tabId} activated in window ${windowId}`);

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
  // Invalidate user cache when navigating to auth pages (logout)
  if (changeInfo.url && changeInfo.url.includes('domo.com/auth/')) {
    try {
      const hostname = new URL(changeInfo.url).hostname;
      const instance = hostname.replace('.domo.com', '');
      invalidateInstanceUser(instance);
    } catch { /* empty */ }
  }

  // React to URL changes on Domo domains
  if (changeInfo.url && changeInfo.url.includes('domo.com')) {
    console.log(
      `[Background] URL changed for tab ${tabId}, triggering detection`
    );

    await detectAndStoreContext(tabId);
  }

  // Update title if it's just "Domo" and we have object metadata
  if (changeInfo.title === 'Domo' && tab.url?.includes('domo.com')) {
    const context = getTabContext(tabId);
    if (context?.domoObject?.metadata?.name) {
      console.log(
        `[Background] Updating title for tab ${tabId} to include object name`
      );
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

// Listen for setting changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
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
    console.log('[Background] Favicon rules changed, notifying all Domo tabs');

    // Get all tabs with domo.com URLs
    const tabs = await chrome.tabs.query({
      url: '*://*.domo.com/*',
      windowType: 'normal'
    });

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
  if (command === 'copy_id') {
    console.log('[Background] Keyboard command triggered: copy_id');
    // Get the active tab
    chrome.tabs.query(
      { active: true, currentWindow: true, windowType: 'normal' },
      async (tabs) => {
        if (tabs.length === 0) {
          console.log('[Background] No active tab found for copy_id command');
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
            chrome.action.setBadgeText({ text: '\u2713' });
            chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
            restoreBadgeAfterDelay();
          } catch (error) {
            console.error(
              '[Background] Failed to copy ID to clipboard:',
              error
            );
            chrome.action.setBadgeText({ text: '!' });
            chrome.action.setBadgeBackgroundColor({ color: '#ef4444' });
            restoreBadgeAfterDelay();
          }
        } else {
          console.log(
            '[Background] No Domo object ID found in context for copy_id command'
          );
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
  const generation = (tabDetectionGen.get(tabId) || 0) + 1;
  tabDetectionGen.set(tabId, generation);
  const isStale = () => tabDetectionGen.get(tabId) !== generation;

  try {
    // Get tab info for URL
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !tab?.url?.includes('domo.com')) {
      // Not a Domo domain - clear any existing context and broadcast the update
      console.log(
        `[Background] Tab ${tabId} is not on a Domo domain, clearing context`
      );
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
            console.log(
              '[Background] No listeners for TAB_CONTEXT_UPDATED (null):',
              error.message
            );
          });
      }

      return null;
    }
    const context = new DomoContext(tabId, tab.url, null);
    setTabContext(tabId, context);

    // Fetch current user + groups (cached per instance, non-blocking)
    getInstanceUser(context.instance, tabId)
      .then(({ user, userGroups }) => {
        if (isStale()) return;
        const currentContext = getTabContext(tabId);
        if (currentContext) {
          currentContext.user = user;
          currentContext.userGroups = userGroups;
          // Recompute isOwner if metadata is already available
          if (currentContext.domoObject?.metadata?.details) {
            currentContext.domoObject.metadata.isOwner = computeIsOwner(
              currentContext.domoObject.typeId,
              currentContext.domoObject.metadata.details,
              user?.id,
              userGroups
            );
          }
          setTabContext(tabId, currentContext);
        }
        console.log(
          `[Background] User for tab ${tabId} (${context.instance}):`,
          user?.id
        );
      })
      .catch((error) => {
        console.warn(
          `[Background] Could not fetch user for tab ${tabId}:`,
          error.message
        );
      });

    // Execute detection script in page context
    const detected = await executeInPage(detectCurrentObject, [], tabId);
    if (isStale()) return null;
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

    // Resolve ID via API if needed (e.g., FILESET_FILE where ID isn't in the URL)
    if (!objectId && detected.resolveContext) {
      objectId = await resolveObjectId(
        detected.typeId,
        detected.resolveContext,
        tabId
      );
      if (isStale()) return null;
    }

    if (!objectId) {
      console.warn(`[Background] Could not extract ID for ${detected.typeId}`);
      return null;
    }

    // Extract parent ID from URL, detection result, or resolveContext
    let parentId =
      typeModel.extractParentId(detected.url) ||
      detected.parentId ||
      detected.resolveContext?.filesetId ||
      null;

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
    if (isStale()) return null;

    // Set parentId from API response if not already extracted from URL
    console.log(
      '[Background] enrichedMetadata keys:',
      Object.keys(enrichedMetadata),
      `parentId from URL: ${parentId}, parentId from API: ${enrichedMetadata.parentId}`
    );
    if (!parentId && enrichedMetadata.parentId) {
      parentId = enrichedMetadata.parentId;
      domoObject.parentId = parentId;
      console.log(`[Background] Set parentId from API response: ${parentId}`);
    }

    domoObject.metadata = enrichedMetadata;

    // Preserve code engine version from workflow detection
    if (detected.codeEngineVersion) {
      domoObject.metadata.codeEngineVersion = detected.codeEngineVersion;
    }

    // Compute isOwner if user and groups are already available
    const currentUser = context.user;
    const currentUserGroups = context.userGroups;
    domoObject.metadata.isOwner = computeIsOwner(
      typeModel.id,
      enrichedMetadata.details,
      currentUser?.id,
      currentUserGroups
    );

    // DATA_SOURCE: resolve DATAFLOW_TYPE parent via reverse-lookup API
    if (
      !parentId &&
      typeModel.id === 'DATA_SOURCE' &&
      enrichedMetadata.details?.type?.toLowerCase() === 'dataflow'
    ) {
      try {
        const dataflowId = await getDataflowForOutputDataset(objectId, tabId);
        if (isStale()) return null;
        parentId = dataflowId;
        domoObject.parentId = dataflowId;
      } catch (error) {
        if (isStale()) return null;
        console.warn(
          `[Background] Could not resolve DataFlow parent for DATA_SOURCE ${objectId}:`,
          error.message
        );
      }
    }

    // DATA_SOURCE: set streamId as parentId for non-DataFlow datasets
    const isStreamParent =
      typeModel.id === 'DATA_SOURCE' &&
      !parentId &&
      enrichedMetadata.details?.streamId &&
      enrichedMetadata.details?.type?.toLowerCase() !== 'dataflow';

    if (isStreamParent) {
      parentId = String(enrichedMetadata.details.streamId);
      domoObject.parentId = parentId;
    }

    // For objects with parents, enrich metadata with parent details
    // (skip for stream parents — those are enriched async below)
    console.log(
      `[Background] Parent enrichment check: parentId=${parentId}, parents=${JSON.stringify(typeModel.parents)}`
    );
    if (parentId && typeModel.parents && typeModel.parents.length > 0 && !isStreamParent) {
      try {
        console.log(
          `[Background] Calling getParent for ${typeModel.id} ${objectId} with tabId=${tabId}`
        );
        await domoObject.getParent(false, detected.url, tabId);
        if (isStale()) return null;
        console.log(
          `[Background] Enriched parent metadata for ${typeModel.id} ${objectId}:`,
          domoObject.metadata?.parent
        );
      } catch (error) {
        if (isStale()) return null;
        console.warn(
          `[Background] Could not enrich parent metadata for ${typeModel.id} ${objectId}:`,
          error
        );
      }
    }

    // Clear card errors when navigating to a different card on this tab
    if (typeModel.id === 'CARD') {
      const lastCardId = tabLastCardId.get(tabId);
      if (lastCardId && lastCardId !== objectId) {
        clearCardErrors(tabId);
      }
      tabLastCardId.set(tabId, objectId);
    }

    // Final stale check before committing context
    if (isStale()) return null;

    // Update DomoContext with DomoObject
    context.domoObject = domoObject;

    console.log(
      `[Background] Detected and stored context for tab ${tabId}:`,
      context
    );
    setTabContext(tabId, context);

    // For non-DataFlow DATA_SOURCE with a stream, fetch stream details asynchronously
    if (isStreamParent) {
      const streamId = String(enrichedMetadata.details.streamId);
      const streamType = getObjectType('STREAM');
      executeInPage(
        fetchObjectDetailsInPage,
        [
          {
            apiConfig: streamType.api,
            objectId: streamId,
            typeId: 'STREAM'
          }
        ],
        tabId
      )
        .then((streamMetadata) => {
          if (isStale()) return;
          if (!streamMetadata?.details) return;
          const name = streamType.api.nameTemplate.replace(
            /{([^}]+)}/g,
            (_, path) =>
              path === 'id'
                ? streamId
                : (path
                    .split('.')
                    .reduce(
                      (o, k) => o?.[k],
                      streamMetadata.details
                    ) ?? '')
          );
          domoObject.metadata.parent = {
            details: streamMetadata.details,
            id: streamId,
            name,
            objectType: { id: 'STREAM', name: 'Stream' }
          };
          setTabContext(tabId, context);
        })
        .catch((err) => {
          if (isStale()) return;
          console.warn(
            `[Background] Could not fetch stream ${streamId}:`,
            err.message
          );
        });
    }

    // Helper to store child/app pages in context metadata
    const storeChildPages = (pages, propertyName) => {
      const currentContext = getTabContext(tabId);
      if (currentContext?.domoObject?.id === objectId) {
        if (!currentContext.domoObject?.metadata) {
          currentContext.domoObject.metadata = {};
        }
        if (!currentContext.domoObject.metadata?.details) {
          currentContext.domoObject.metadata.details = {};
        }
        currentContext.domoObject.metadata.details[propertyName] = pages;
        setTabContext(tabId, currentContext);
      }
    };

    // For PAGE type, use fast subpages endpoint as a pre-check
    if (typeModel.id === 'PAGE') {
      getSubpageIds({ pageId: parseInt(objectId), tabId })
        .then((subpageIds) => {
          if (isStale()) return;

          if (!subpageIds || subpageIds.length === 0) {
            storeChildPages([], 'childPages');
            console.log(
              `[Background] No child pages for PAGE ${objectId} (fast check)`
            );
            return;
          }

          // Subpages exist — fetch full details for names and hierarchy
          return getChildPages({
            includeGrandchildren: true,
            pageId: parseInt(objectId),
            pageType: 'PAGE',
            tabId
          }).then((childPages) => {
            if (isStale()) return;
            storeChildPages(childPages, 'childPages');
            console.log(
              `[Background] Fetched ${childPages?.length || 0} child pages for PAGE ${objectId}`
            );
          });
        })
        .catch((error) => {
          if (isStale()) return;
          console.error(
            `[Background] Error fetching child pages for PAGE ${objectId}:`,
            error
          );
          storeChildPages([], 'childPages');
        });
    } else if (
      typeModel.id === 'DATA_APP_VIEW' ||
      typeModel.id === 'WORKSHEET_VIEW' ||
      typeModel.id === 'REPORT_BUILDER_VIEW'
    ) {
      const appId =
        typeModel.id === 'DATA_APP_VIEW' && domoObject.parentId
          ? parseInt(domoObject.parentId)
          : null;

      getChildPages({
        appId,
        pageId: parseInt(objectId),
        pageType: typeModel.id,
        tabId
      })
        .then((childPages) => {
          if (isStale()) return;
          storeChildPages(childPages, 'appPages');
          console.log(
            `[Background] Fetched ${childPages?.length || 0} app pages for ${typeModel.id} ${objectId}`
          );
        })
        .catch((error) => {
          if (isStale()) return;
          console.error(
            `[Background] Error fetching app pages for ${typeModel.id} ${objectId}:`,
            error
          );
          storeChildPages([], 'appPages');
        });
    } else if (typeModel.id === 'CARD') {
      // Fetch pages for card in background without blocking
      getPagesForCards([parseInt(objectId)], tabId)
        .then((result) => {
          if (isStale()) return;
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.cardPages =
              result.pages || [];
            currentContext.domoObject.metadata.details.cardsByPage =
              result.cardsByPage || {};

            setTabContext(tabId, currentContext);

            console.log(
              `[Background] Fetched ${result.pages?.length || 0} card pages for ${typeModel.id} ${objectId}`
            );
          }
        })
        .catch((error) => {
          if (isStale()) return;
          console.error(
            `[Background] Error fetching card pages for ${typeModel.id} ${objectId}:`,
            error
          );
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.cardPages = [];
            setTabContext(tabId, currentContext);
          }
        });
    }

    // Helper: build combined content array for PAGE and DATA_APP_VIEW context footer.
    // Called after each async enrichment callback; only produces output once all three
    // (cards, forms, queues) have resolved.
    function updatePageContent() {
      if (isStale()) return;
      const ctx = getTabContext(tabId);
      const objType = ctx?.domoObject?.typeId;
      const contentTypes = ['PAGE', 'DATA_APP_VIEW', 'WORKSHEET_VIEW', 'REPORT_BUILDER_VIEW'];
      if (!contentTypes.includes(objType)) return;
      const details = ctx?.domoObject?.metadata?.details;
      if (!details) return;
      if (details.cards == null || details.forms == null || details.queues == null)
        return;

      const content = [];
      for (const card of details.cards) {
        content.push({ ...card, type: 'CARD' });
      }
      for (const form of details.forms) {
        content.push({ ...form, type: 'ENIGMA_FORM' });
      }
      for (const queue of details.queues) {
        content.push({ ...queue, type: 'HOPPER_QUEUE' });
      }
      details.content = content;
      setTabContext(tabId, ctx);
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
          if (isStale()) return;
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.cards = cards;

            setTabContext(tabId, currentContext);
            updatePageContent();
          }
        })
        .catch((error) => {
          if (isStale()) return;
          console.error(
            `[Background] Error fetching cards for ${typeModel.id} ${objectId}:`,
            error
          );
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            if (!currentContext.domoObject?.metadata) {
              currentContext.domoObject.metadata = {};
            }
            if (!currentContext.domoObject.metadata?.details) {
              currentContext.domoObject.metadata.details = {};
            }
            currentContext.domoObject.metadata.details.cards = [];
            setTabContext(tabId, currentContext);
            updatePageContent();
          }
        });
    }

    // For page-like types, extract and enrich forms and queues from page layout
    if (['DATA_APP_VIEW', 'PAGE', 'REPORT_BUILDER_VIEW', 'WORKSHEET_VIEW'].includes(typeModel.id)) {
      const { formWidgetIds, queueWidgetIds } = extractPageContentIds(
        enrichedMetadata.details
      );

      if (formWidgetIds.length > 0) {
        getFormsForPage({ formWidgetIds, tabId })
          .then((forms) => {
            if (isStale()) return;
            const currentContext = getTabContext(tabId);
            if (currentContext?.domoObject?.id === objectId) {
              if (!currentContext.domoObject?.metadata) {
                currentContext.domoObject.metadata = {};
              }
              if (!currentContext.domoObject.metadata?.details) {
                currentContext.domoObject.metadata.details = {};
              }
              currentContext.domoObject.metadata.details.forms = forms;
              setTabContext(tabId, currentContext);
              updatePageContent();
            }
          })
          .catch((error) => {
            if (isStale()) return;
            console.error(
              `[Background] Error fetching forms for ${typeModel.id} ${objectId}:`,
              error
            );
            const currentContext = getTabContext(tabId);
            if (currentContext?.domoObject?.id === objectId) {
              if (!currentContext.domoObject?.metadata) {
                currentContext.domoObject.metadata = {};
              }
              if (!currentContext.domoObject.metadata?.details) {
                currentContext.domoObject.metadata.details = {};
              }
              currentContext.domoObject.metadata.details.forms = [];
              setTabContext(tabId, currentContext);
              updatePageContent();
            }
          });
      } else {
        const currentContext = getTabContext(tabId);
        if (currentContext?.domoObject?.id === objectId) {
          if (!currentContext.domoObject?.metadata) {
            currentContext.domoObject.metadata = {};
          }
          if (!currentContext.domoObject.metadata?.details) {
            currentContext.domoObject.metadata.details = {};
          }
          currentContext.domoObject.metadata.details.forms = [];
          setTabContext(tabId, currentContext);
          updatePageContent();
        }
      }

      if (queueWidgetIds.length > 0) {
        getQueuesForPage({ queueWidgetIds, tabId })
          .then((queues) => {
            if (isStale()) return;
            const currentContext = getTabContext(tabId);
            if (currentContext?.domoObject?.id === objectId) {
              if (!currentContext.domoObject?.metadata) {
                currentContext.domoObject.metadata = {};
              }
              if (!currentContext.domoObject.metadata?.details) {
                currentContext.domoObject.metadata.details = {};
              }
              currentContext.domoObject.metadata.details.queues = queues;
              setTabContext(tabId, currentContext);
              updatePageContent();
            }
          })
          .catch((error) => {
            if (isStale()) return;
            console.error(
              `[Background] Error fetching queues for ${typeModel.id} ${objectId}:`,
              error
            );
            const currentContext = getTabContext(tabId);
            if (currentContext?.domoObject?.id === objectId) {
              if (!currentContext.domoObject?.metadata) {
                currentContext.domoObject.metadata = {};
              }
              if (!currentContext.domoObject.metadata?.details) {
                currentContext.domoObject.metadata.details = {};
              }
              currentContext.domoObject.metadata.details.queues = [];
              setTabContext(tabId, currentContext);
              updatePageContent();
            }
          });
      } else {
        const currentContext = getTabContext(tabId);
        if (currentContext?.domoObject?.id === objectId) {
          if (!currentContext.domoObject?.metadata) {
            currentContext.domoObject.metadata = {};
          }
          if (!currentContext.domoObject.metadata?.details) {
            currentContext.domoObject.metadata.details = {};
          }
          currentContext.domoObject.metadata.details.queues = [];
          setTabContext(tabId, currentContext);
          updatePageContent();
        }
      }
    }

    // For WORKFLOW_MODEL, fetch permission asynchronously (non-blocking)
    if (typeModel.id === 'WORKFLOW_MODEL') {
      const userId = context.user?.id;
      const fetchPermission = userId
        ? getWorkflowPermission(objectId, userId, tabId)
        : Promise.resolve([]);

      fetchPermission
        .then((values) => {
          if (isStale()) return;
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            if (!currentContext.domoObject.metadata) {
              currentContext.domoObject.metadata = {};
            }
            currentContext.domoObject.metadata.permission = { values };
            setTabContext(tabId, currentContext);
          }
        })
        .catch((error) => {
          if (isStale()) return;
          console.warn(
            `[Background] Could not fetch permission for WORKFLOW_MODEL ${objectId}:`,
            error.message
          );
        });
    }

    // For WORKFLOW_MODEL_VERSION, fetch definition asynchronously (non-blocking)
    if (typeModel.id === 'WORKFLOW_MODEL_VERSION') {
      const modelId = domoObject.parentId;
      const versionNumber = objectId;

      if (modelId) {
        getVersionDefinition(modelId, versionNumber, tabId)
          .then((definition) => {
            if (isStale()) return;
            const currentContext = getTabContext(tabId);
            if (currentContext?.domoObject?.id === objectId) {
              if (!currentContext.domoObject.metadata) {
                currentContext.domoObject.metadata = {};
              }
              if (!currentContext.domoObject.metadata.details) {
                currentContext.domoObject.metadata.details = {};
              }
              currentContext.domoObject.metadata.details.definition = definition;
              setTabContext(tabId, currentContext);
            }
          })
          .catch((error) => {
            if (isStale()) return;
            console.warn(
              `[Background] Could not fetch definition for WORKFLOW_MODEL_VERSION ${objectId}:`,
              error.message
            );
          });
      }
    }

    // For MAGNUM_COLLECTION, fetch permission asynchronously (non-blocking)
    if (typeModel.id === 'MAGNUM_COLLECTION') {
      executeInPage(
        async (collectionId) => {
          const res = await fetch(
            `/api/datastores/v1/collections/${collectionId}/permission`
          );
          if (!res.ok) return null;
          return res.json();
        },
        [objectId],
        tabId
      )
        .then((permission) => {
          if (isStale()) return;
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            if (!currentContext.domoObject.metadata) {
              currentContext.domoObject.metadata = {};
            }
            currentContext.domoObject.metadata.permission = permission;
            setTabContext(tabId, currentContext);
          }
        })
        .catch((error) => {
          if (isStale()) return;
          console.warn(
            `[Background] Could not fetch permission for MAGNUM_COLLECTION ${objectId}:`,
            error.message
          );
        });
    }

    // For DATAFLOW_TYPE, fetch permission asynchronously (non-blocking)
    if (typeModel.id === 'DATAFLOW_TYPE') {
      getDataflowPermission(objectId, tabId)
        .then((permission) => {
          if (isStale()) return;
          const currentContext = getTabContext(tabId);
          if (currentContext?.domoObject?.id === objectId) {
            if (!currentContext.domoObject.metadata) {
              currentContext.domoObject.metadata = {};
            }
            currentContext.domoObject.metadata.permission = permission;
            setTabContext(tabId, currentContext);
          }
        })
        .catch((error) => {
          if (isStale()) return;
          console.warn(
            `[Background] Could not fetch permission for DATAFLOW_TYPE ${objectId}:`,
            error.message
          );
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
        case 'CARD_ERROR_DETECTED': {
          const sourceTabId = sender.tab?.id;
          if (sourceTabId) {
            addCardError(sourceTabId, message.error);
          }
          sendResponse({ success: true });
          break;
        }

        case 'CLEAR_CARD_ERRORS': {
          clearCardErrors(message.tabId);
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

        case 'GET_CARD_ERRORS': {
          const errors = getCardErrors(message.tabId);
          sendResponse({ errors, success: true });
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
          console.log(
            '[Background] GET_TAB_CONTEXT for window',
            windowId,
            tabs
          );
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

        case 'RELEASE_NOTES_SEEN': {
          const currentVersion = chrome.runtime.getManifest().version;
          await chrome.storage.local.set({ lastSeenVersion: currentVersion });
          chrome.action.setBadgeText({ text: '' });
          sendResponse({ success: true });
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

/**
 * Compare two semver strings. Returns positive if a > b, negative if a < b, 0 if equal.
 */
function compareVersions(a, b) {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
  const len = Math.max(partsA.length, partsB.length);

  for (let i = 0; i < len; i++) {
    const diff = (partsA[i] || 0) - (partsB[i] || 0);
    if (diff !== 0) return diff;
  }

  return 0;
}

function restoreBadgeAfterDelay(ms = 2000) {
  setTimeout(() => {
    chrome.storage.local.get(['lastSeenVersion'], (result) => {
      const currentVersion = chrome.runtime.getManifest().version;
      if (result.lastSeenVersion !== currentVersion) {
        chrome.action.setBadgeText({ text: 'NEW' });
        chrome.action.setBadgeBackgroundColor({ color: '#6366f1' });
      } else {
        chrome.action.setBadgeText({ text: '' });
      }
    });
  }, ms);
}
