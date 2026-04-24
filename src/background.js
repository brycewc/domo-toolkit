import { releases } from '@/data';
import {
  DomoContext,
  DomoObject,
  fetchObjectDetailsInPage,
  getObjectType
} from '@/models';
import {
  checkPageType,
  getCurrentUser,
  getDataflowForOutputDataset,
  getUserGroups,
  runEnrichments
} from '@/services';
import {
  clearCookies,
  detectCurrentObject,
  EXCLUDED_HOSTNAMES,
  executeInPage,
  isDomoUrl,
  SECTION_TITLES
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

// Per-tab API error storage
const tabApiErrors = new Map();
const tabLastObject = new Map();
const MAX_ERRORS_PER_TAB = 50;

function addApiError(tabId, error) {
  if (!tabApiErrors.has(tabId)) {
    tabApiErrors.set(tabId, []);
  }
  const errors = tabApiErrors.get(tabId);

  error.id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  errors.push(error);

  // Enforce max limit (remove oldest)
  if (errors.length > MAX_ERRORS_PER_TAB) {
    errors.splice(0, errors.length - MAX_ERRORS_PER_TAB);
  }

  broadcastApiErrors(tabId);
}

function broadcastApiErrors(tabId) {
  const errors = getApiErrors(tabId);
  chrome.runtime
    .sendMessage({
      errorCount: errors.length,
      errors,
      tabId,
      type: 'API_ERRORS_UPDATED'
    })
    .catch(() => {});
}

function buildAllowedTitles(domoObject) {
  const allowed = [];
  if (domoObject.metadata?.parent?.name) {
    allowed.push(`${domoObject.metadata.parent.name} - Domo`);
  }
  return allowed;
}

function clearApiErrors(tabId) {
  tabApiErrors.delete(tabId);
  broadcastApiErrors(tabId);
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

function getApiErrors(tabId) {
  return tabApiErrors.get(tabId) || [];
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

function setSectionTitle(tabId, url) {
  try {
    const pathname = new URL(url).pathname;
    const sortedKeys = Object.keys(SECTION_TITLES).sort(
      (a, b) => b.length - a.length
    );
    const matchedKey = sortedKeys.find((key) => pathname.startsWith(key));
    if (matchedKey) {
      setTabTitle(tabId, SECTION_TITLES[matchedKey]);
    }
  } catch (error) {
    console.error(
      `[Background] Error setting section title for tab ${tabId}:`,
      error
    );
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
    const allowedTitles = buildAllowedTitles(context.domoObject);
    setTabTitle(tabId, context.domoObject.metadata.name, allowedTitles);
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

function setTabTitle(tabId, objectName, allowedTitles = []) {
  try {
    chrome.scripting.executeScript({
      args: [objectName, allowedTitles],
      func: (objectName, allowedTitles) => {
        const currentTitle = document.title.trim();
        if (
          currentTitle !== 'Domo' &&
          !allowedTitles.includes(currentTitle)
        ) {
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

/**
 * Update the tracked object key for a tab and clear errors if the key changed.
 * Called on every detection attempt — both success (typeId:objectId) and
 * failure (url:pathname) — so errors always clear on navigation.
 */
function updateTabObjectKey(tabId, newKey) {
  const lastKey = tabLastObject.get(tabId);
  if (lastKey && lastKey !== newKey) {
    clearApiErrors(tabId);
  }
  tabLastObject.set(tabId, newKey);
}

/**
 * Build a fallback object key from a URL for pages where no object is detected.
 */
function urlObjectKey(url) {
  try {
    return `url:${new URL(url).pathname}`;
  } catch {
    return `url:${url}`;
  }
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

    if (newReleases.length === 0) {
      // No release entry for this version — silently update lastSeenVersion
      chrome.storage.local.set({ lastSeenVersion: currentVersion });
    } else {
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
  tabApiErrors.delete(tabId);
  tabLastObject.delete(tabId);
  persistToSession();
});

// Detect context when tab becomes active (eager detection)
chrome.tabs.onActivated.addListener(async ({ tabId, windowId }) => {
  console.log(`[Background] Tab ${tabId} activated in window ${windowId}`);

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url && isDomoUrl(tab.url)) {
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
  if (changeInfo.url && isDomoUrl(changeInfo.url)) {
    console.log(
      `[Background] URL changed for tab ${tabId}, triggering detection`
    );

    await detectAndStoreContext(tabId);
  }

  // Update title when Domo sets it to "Domo" or a stale parent-only title
  if (changeInfo.title && isDomoUrl(tab.url)) {
    const context = getTabContext(tabId);
    if (changeInfo.title === 'Domo') {
      // Title reset to "Domo" — apply object name or section title
      if (context?.domoObject?.metadata?.name) {
        console.log(
          `[Background] Updating title for tab ${tabId} to include object name`
        );
        const allowedTitles = buildAllowedTitles(context.domoObject);
        setTabTitle(tabId, context.domoObject.metadata.name, allowedTitles);
      } else if (tab.url) {
        setSectionTitle(tabId, tab.url);
      }
    } else if (context?.domoObject?.metadata?.name) {
      // Title changed to something other than "Domo" — check if it's a
      // stale parent-only title we can enrich (e.g., "MyApp - Domo")
      const allowedTitles = buildAllowedTitles(context.domoObject);
      if (allowedTitles.includes(changeInfo.title)) {
        console.log(
          `[Background] Enriching stale title for tab ${tabId}`
        );
        setTabTitle(tabId, context.domoObject.metadata.name, allowedTitles);
      }
    }
  }
});

// Detect context when history state changes (SPA navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.url && isDomoUrl(details.url)) {
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
            const typeModel = getObjectType(context.domoObject.typeId);
            const primaryConfig = typeModel?.copyConfigs?.find(
              (c) => c.primary
            );
            const copyId = primaryConfig
              ? primaryConfig.source
                  .split('.')
                  .reduce((cur, key) => cur?.[key], context.domoObject)
              : null;
            await executeInPage(
              async (text) => {
                await navigator.clipboard.writeText(text);
              },
              [copyId || context.domoObject.id],
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
    if (!tab || !isDomoUrl(tab.url)) {
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

    // If a context already exists for this tab (redetection), suppress
    // broadcasts until the new domoObject is ready so the UI doesn't flash
    // "No object detected" between states. For first-time detection,
    // broadcast immediately so the UI knows it's on a Domo page.
    const isRedetection = tabContexts.has(tabId);
    if (isRedetection) {
      tabContexts.set(tabId, context);
    } else {
      setTabContext(tabId, context);
    }

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
          // During redetection, only store silently if domoObject isn't
          // resolved yet — the final setTabContext after detection will
          // broadcast the complete context.
          if (isRedetection && !currentContext.domoObject) {
            tabContexts.set(tabId, currentContext);
          } else {
            setTabContext(tabId, currentContext);
          }
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
      // Track URL so errors clear when navigating between undetected pages
      if (tab.url) {
        updateTabObjectKey(tabId, urlObjectKey(tab.url));
        setSectionTitle(tabId, tab.url);
      }
      // During redetection, broadcast the empty context so the UI clears
      // the stale object (e.g., user deselected a workflow node)
      if (isRedetection) {
        setTabContext(tabId, context);
      }
      return null;
    }
    let typeModel = getObjectType(detected.typeId);

    if (!typeModel) {
      console.warn(`[Background] Unknown object type: ${detected.typeId}`);
      updateTabObjectKey(tabId, urlObjectKey(tab.url));
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
      updateTabObjectKey(tabId, urlObjectKey(tab.url));
      return null;
    }

    // Check if a detected PAGE is actually a data app view
    if (detected.typeId === 'PAGE') {
      const appId = await executeInPage(checkPageType, [objectId], tabId);
      if (isStale()) return null;
      if (appId) {
        detected.typeId = 'DATA_APP_VIEW';
        detected.parentId = appId;
        typeModel = getObjectType('DATA_APP_VIEW');
      }
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
    domoObject.metadata.context = {};

    // Preserve workflow context from CE tile detection within a workflow
    if (detected.workflowModelId) {
      domoObject.metadata.context.workflowModelId = detected.workflowModelId;
      domoObject.metadata.context.workflowVersionNumber =
        detected.workflowVersionNumber;
    }

    // Preserve page/app context when a card is viewed from a page or app
    if (detected.pageId) {
      const appId = await executeInPage(
        checkPageType,
        [detected.pageId],
        tabId
      );
      if (isStale()) return null;
      if (appId) {
        domoObject.metadata.context.appViewId = detected.pageId;
        domoObject.metadata.context.appId = appId;
      } else {
        domoObject.metadata.context.pageId = detected.pageId;
      }
    }
    if (detected.appViewId) {
      domoObject.metadata.context.appViewId = detected.appViewId;
      domoObject.metadata.context.appId = detected.appId;
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

    // Compose display name from template if configured
    if (typeModel.api?.displayName && domoObject.metadata?.parent?.name) {
      domoObject.metadata.name = typeModel.api.displayName
        .replace('{parent.name}', domoObject.metadata.parent.name)
        .replace('{name}', domoObject.metadata.name || '')
        .replace('{id}', objectId);
    }

    // Clear API errors when navigating to a different object on this tab
    updateTabObjectKey(tabId, `${typeModel.id}:${objectId}`);

    // Final stale check before committing context
    if (isStale()) return null;

    // Update DomoContext with DomoObject
    context.domoObject = domoObject;

    console.log(
      `[Background] Detected and stored context for tab ${tabId}:`,
      context
    );
    setTabContext(tabId, context);

    // Run all type-specific enrichments asynchronously (non-blocking)
    runEnrichments({
      domoObject,
      enrichedMetadata,
      getTabContext,
      isStale,
      objectId,
      setTabContext,
      tabId,
      typeId: typeModel.id,
      userId: context.user?.id
    });

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
        case 'API_ERROR_DETECTED': {
          const sourceTabId = sender.tab?.id;
          if (sourceTabId) {
            addApiError(sourceTabId, message.error);
          }
          sendResponse({ success: true });
          break;
        }

        case 'CLEAR_API_ERRORS': {
          clearApiErrors(message.tabId);
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

        case 'GET_API_ERRORS': {
          const errors = getApiErrors(message.tabId);
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

          if (!context && tabs[0].url && isDomoUrl(tabs[0].url)) {
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
          const { contextUpdates, metadataUpdates, tabId } = message;
          const context = getTabContext(tabId);

          if (!context) {
            sendResponse({ error: 'No context found for tab', success: false });
            return;
          }

          if (context.domoObject?.metadata) {
            // API-native field updates go to details
            if (metadataUpdates) {
              context.domoObject.metadata.details = {
                ...context.domoObject.metadata.details,
                ...metadataUpdates
              };
              // Also update the top-level name if it was changed
              if (metadataUpdates.name !== undefined) {
                context.domoObject.metadata.name = metadataUpdates.name;
              }
            }
            // Extension-injected updates go to context
            if (contextUpdates) {
              context.domoObject.metadata.context = {
                ...context.domoObject.metadata.context,
                ...contextUpdates
              };
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
