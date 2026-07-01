import { releases } from '@/data/releases';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { fetchObjectDetailsInPage, getObjectType, resolvePrimaryCopy } from '@/models/DomoObjectType';
import { getDataflowForOutputDataset } from '@/services/dataflows';
import { runEnrichments } from '@/services/enrichments';
import { getFeatureSwitches } from '@/services/features';
import { checkPageType } from '@/services/pages';
import { getCurrentUser, getUserGroups } from '@/services/users';
import { clearCookies } from '@/utils/clearCookies';
import { EXCLUDED_HOSTNAMES, SECTION_TITLES } from '@/utils/constants';
import { detectCurrentObject, isDomoUrl } from '@/utils/currentObject';
import { executeInPage } from '@/utils/executeInPage';
import { sidepanelStorageKeyPrefix } from '@/utils/sidepanel';

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

  // Single owner: typed object
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
          const res = await fetch(`/api/files/v1/filesets/${filesetId}/path?path=${filePath}`);
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
// Per-entry budget for the session backup, in JSON string length (roughly
// bytes). toStorageJSON already drops the known-heavy fields; this is the
// generic backstop for any object whose raw details blob is still huge, so
// the worst case stays around MAX_CACHED_TABS * this out of the 10 MB quota.
const MAX_BACKUP_ENTRY_CHARS = 250000;

// Session storage keys
const SESSION_STORAGE_KEY = 'tabContextsBackup';
const INSTANCE_USERS_KEY = 'instanceUsersBackup';

// Persisted instance-user entries older than this are treated as stale on
// restore and re-fetched, so group changes can't be served indefinitely from a
// long-lived backup. In-session cache behavior is unchanged.
const INSTANCE_USER_TTL_MS = 12 * 60 * 60 * 1000;

// Per-tab detection generation counter to prevent stale async callbacks
const tabDetectionGen = new Map();
// Tabs with a detection currently running (tabId -> the generation that is in
// flight). Used so the page-reload retry branch doesn't start a competing
// detection while one is already running, which would bump the generation and
// cancel the in-flight run before it commits the object's name.
const tabDetectionInFlight = new Map();

// Per-instance cache for user + groups + feature switches
// (instance -> { user, userGroups, featureSwitches, promise })
const instanceUserCache = new Map();

// Cached setting: omit the " - Domo" suffix when renaming Domo tabs (synced from storage)
let removeDomoTitleSuffix = false;

/**
 * Get or fetch the current user, their groups, and the instance's enabled
 * feature switches. Returns cached data if available, otherwise fetches and
 * caches. Feature switches ride the same per-instance entry as the user, so
 * they share its caching, persistence, and logout invalidation.
 * @param {string} instance - The Domo instance subdomain
 * @param {number} tabId - The tab ID to execute API calls in
 * @returns {Promise<{ user: Object, userGroups: string[], featureSwitches: string[]|null }>}
 */
function getInstanceUser(instance, tabId) {
  const cached = instanceUserCache.get(instance);
  if (cached?.user?.metadata?.USER_RIGHTS?.length) {
    return Promise.resolve({
      featureSwitches: cached.featureSwitches ?? null,
      user: cached.user,
      userGroups: cached.userGroups
    });
  }
  if (cached?.promise) return cached.promise;

  const promise = (async () => {
    const user = await getCurrentUser(tabId);
    let userGroups = [];
    let featureSwitches = null;
    if (user?.id) {
      const [richGroups, switches] = await Promise.all([
        getUserGroups(user.id, tabId).catch((error) => {
          console.warn(`[Background] Could not fetch user groups for ${instance}:`, error.message);
          return [];
        }),
        getFeatureSwitches(tabId).catch((error) => {
          console.warn(`[Background] Could not fetch feature switches for ${instance}:`, error.message);
          return null;
        })
      ]);
      userGroups = richGroups.map((g) => g.groupId);
      featureSwitches = switches;
    }
    // Only cache a user that actually carries its rights. Empty USER_RIGHTS means
    // bootstrap wasn't fully hydrated when we read it; caching that hollow user
    // would serve it to every later detection and disable audit-gated features
    // for a full admin until logout. Dropping it lets the next detection retry.
    if (user?.metadata?.USER_RIGHTS?.length) {
      instanceUserCache.set(instance, { featureSwitches, promise: null, user, userGroups });
      persistInstanceUsers();
    } else {
      instanceUserCache.delete(instance);
    }
    return { featureSwitches, user, userGroups };
  })();

  // Clear cache on failure so next detection retries
  promise.catch(() => {
    instanceUserCache.delete(instance);
  });

  instanceUserCache.set(instance, { featureSwitches: null, promise, user: null, userGroups: null });
  return promise;
}

/**
 * Invalidate the user cache for an instance (e.g., on logout).
 * @param {string} instance - The Domo instance subdomain
 */
function invalidateInstanceUser(instance) {
  instanceUserCache.delete(instance);
  persistInstanceUsers();
  console.log(`[Background] Invalidated user cache for instance: ${instance}`);
}

// Per-tab API error storage
const tabApiErrors = new Map();
const tabLastContext = new Map();
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

function buildAllowedTitlePrefixes(domoObject) {
  const template = domoObject.objectType?.api?.displayName;
  const parentName = domoObject.metadata?.parent?.name;
  if (!template || !parentName || !template.includes('{name}')) {
    return [];
  }
  // The part of a title before the object's own name is shared by every sibling
  // under the same parent (e.g. every page of one app studio app, which don't
  // reset the tab title on internal navigation). A current title starting with
  // it is one the toolkit set for a sibling, so it is safe to overwrite when
  // moving between those siblings.
  const prefix = template
    .slice(0, template.indexOf('{name}'))
    .replace('{parent.name}', parentName)
    .replace('{id}', domoObject.id ?? '');
  return prefix ? [prefix] : [];
}

function buildAllowedTitles(domoObject) {
  const allowed = [];
  if (domoObject.metadata?.parent?.name) {
    const parentName = domoObject.metadata.parent.name;
    allowed.push(`${parentName} - Domo`);
    allowed.push(parentName);
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
 * Resolve the name used for the tab title. Prefers the parent-qualified
 * titleName (composed from a type's api.displayName template) and falls back to
 * the object's own name, which is what the context footer shows.
 */
function getTitleName(domoObject) {
  return domoObject?.metadata?.titleName || domoObject?.metadata?.name;
}

const ICON_PATHS = {
  black: {
    16: 'toolkit-black-16.png',
    24: 'toolkit-black-24.png',
    32: 'toolkit-black-32.png'
  },
  blue: {
    16: 'toolkit-16.png',
    24: 'toolkit-24.png',
    32: 'toolkit-32.png'
  },
  white: {
    16: 'toolkit-white-16.png',
    24: 'toolkit-white-24.png',
    32: 'toolkit-white-32.png'
  }
};

function applyIconFromStorage() {
  chrome.storage.sync.get(['iconColor'], (result) => {
    setActionIcon(result.iconColor || 'blue');
  });
}

// One-shot migration from the legacy `defaultClearCookiesHandling` tri-state
// to three independent settings (auto / button visibility / button behavior).
async function migrateClearCookiesSetting() {
  const { defaultClearCookiesHandling } = await chrome.storage.sync.get(['defaultClearCookiesHandling']);
  if (defaultClearCookiesHandling === undefined) return;

  const mapping = {
    all: {
      autoClearCookiesOn431: false,
      clearCookiesButtonBehavior: 'all',
      showClearCookiesButton: true
    },
    auto: {
      autoClearCookiesOn431: true,
      clearCookiesButtonBehavior: 'preserve',
      showClearCookiesButton: false
    },
    preserve: {
      autoClearCookiesOn431: false,
      clearCookiesButtonBehavior: 'preserve',
      showClearCookiesButton: true
    }
  };
  const newSettings = mapping[defaultClearCookiesHandling];
  if (!newSettings) return;

  await chrome.storage.sync.set(newSettings);
  await chrome.storage.sync.remove('defaultClearCookiesHandling');
  console.log('[Background] Migrated cookie clearing setting:', defaultClearCookiesHandling, '→', newSettings);
}

function pathnameOf(url) {
  try {
    return new URL(url).pathname;
  } catch {
    return url ?? null;
  }
}

/**
 * Persist the per-instance user/groups cache to session storage. These are
 * identical across every tab on an instance, so they live here once instead of
 * being duplicated in each tab's context backup. Only user-bearing entries are
 * written (in-flight promise entries are skipped); each is stamped so stale
 * entries can be dropped on restore.
 */
async function persistInstanceUsers() {
  try {
    const record = {};
    for (const [instance, entry] of instanceUserCache.entries()) {
      if (entry?.user) {
        record[instance] = {
          featureSwitches: entry.featureSwitches || null,
          fetchedAt: Date.now(),
          user: entry.user,
          userGroups: entry.userGroups || []
        };
      }
    }
    await chrome.storage.session.set({ [INSTANCE_USERS_KEY]: record });
  } catch (error) {
    console.error('[Background] Error persisting instance users:', error);
  }
}

/**
 * Persist current tab contexts to session storage
 */
async function persistToSession() {
  try {
    // Convert Map to array for storage. toStorageJSON allowlists what survives
    // per tab; on top of that, any entry still over MAX_BACKUP_ENTRY_CHARS
    // (some type's raw details blob) is stored without details at all. The
    // identity fields keep titles, navigation, and action gating working after
    // a restore, and details re-enrich on the next detection.
    const contextsArray = Array.from(tabContexts.entries())
      .slice(0, MAX_CACHED_TABS)
      .map(([tabId, context]) => {
        let entry = context?.toStorageJSON?.() || context;
        if (entry?.domoObject?.metadata?.details && JSON.stringify(entry).length > MAX_BACKUP_ENTRY_CHARS) {
          entry = {
            ...entry,
            domoObject: {
              ...entry.domoObject,
              metadata: { ...entry.domoObject.metadata, details: null }
            }
          };
        }
        return [tabId, entry];
      });
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
    // Restore the instance-user cache first so contexts (which no longer carry
    // their own user/userGroups in the backup) can be rehydrated from it.
    await restoreInstanceUsers();

    const result = await chrome.storage.session.get(SESSION_STORAGE_KEY);
    if (result[SESSION_STORAGE_KEY]) {
      const contextsArray = result[SESSION_STORAGE_KEY];
      tabContexts.clear();
      tabAccessTimes.clear();

      for (const [tabId, contextData] of contextsArray) {
        // Reconstruct DomoContext instance from plain object
        const context = DomoContext.fromJSON(contextData);
        // Rehydrate user/userGroups from the per-instance cache (toStorageJSON
        // dropped them from the backup). A miss leaves them null until the next
        // detection re-fetches, same as a cold start with no cache.
        const cached = context.instance ? instanceUserCache.get(context.instance) : null;
        if (cached?.user) {
          context.user = cached.user;
          context.userGroups = cached.userGroups || null;
          context.featureSwitches = cached.featureSwitches || null;
        }
        tabContexts.set(tabId, context);
        touchTab(tabId);
      }

      console.log(`[Background] Restored ${tabContexts.size} tab contexts from session`);
    }
  } catch (error) {
    console.error('[Background] Error restoring from session storage:', error);
  }
}

/**
 * Restore the per-instance user/groups cache from session storage on service
 * worker wake. Entries older than INSTANCE_USER_TTL_MS are skipped so group
 * changes aren't served indefinitely from a long-lived backup.
 */
async function restoreInstanceUsers() {
  try {
    const result = await chrome.storage.session.get(INSTANCE_USERS_KEY);
    const record = result[INSTANCE_USERS_KEY];
    if (!record) return;
    const now = Date.now();
    for (const [instance, entry] of Object.entries(record)) {
      if (entry?.user && now - (entry.fetchedAt || 0) < INSTANCE_USER_TTL_MS) {
        instanceUserCache.set(instance, {
          featureSwitches: entry.featureSwitches || null,
          promise: null,
          user: entry.user,
          userGroups: entry.userGroups || []
        });
      }
    }
    console.log(`[Background] Restored ${instanceUserCache.size} instance user(s) from session`);
  } catch (error) {
    console.error('[Background] Error restoring instance users:', error);
  }
}

function setActionIcon(color) {
  const path = ICON_PATHS[color] ?? ICON_PATHS.blue;
  chrome.action.setIcon({ path }).catch((err) => console.error('[Background] setIcon failed:', err));
}

function setSectionTitle(tabId, url, force = false) {
  try {
    const pathname = new URL(url).pathname;
    const sortedKeys = Object.keys(SECTION_TITLES).sort((a, b) => b.length - a.length);
    const matchedKey = sortedKeys.find((key) => pathname.startsWith(key));
    if (matchedKey) {
      setTabTitle(tabId, SECTION_TITLES[matchedKey], [], force);
      return true;
    }
  } catch (error) {
    console.error(`[Background] Error setting section title for tab ${tabId}:`, error);
  }
  return false;
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
    const allowedPrefixes = buildAllowedTitlePrefixes(context.domoObject);
    setTabTitle(tabId, getTitleName(context.domoObject), allowedTitles, false, allowedPrefixes);
  }

  const contextData = context?.toJSON();

  // Send to content script in the specific tab
  chrome.tabs
    .sendMessage(tabId, {
      context: contextData,
      type: 'TAB_CONTEXT_UPDATED'
    })
    .catch((error) => {
      console.log(`[Background] Could not send context to tab ${tabId}:`, error.message);
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
      console.log('[Background] No listeners for TAB_CONTEXT_UPDATED:', error.message);
    });
}

function setTabTitle(tabId, objectName, allowedTitles = [], force = false, allowedPrefixes = []) {
  try {
    chrome.scripting.executeScript({
      args: [objectName, allowedTitles, allowedPrefixes, removeDomoTitleSuffix, force],
      func: (objectName, allowedTitles, allowedPrefixes, removeSuffix, force) => {
        const currentTitle = document.title.trim();
        const isManagedTitle =
          currentTitle === 'Domo' ||
          allowedTitles.includes(currentTitle) ||
          allowedPrefixes.some((prefix) => prefix && currentTitle.startsWith(prefix));
        if (!force && !isManagedTitle) {
          return;
        }
        document.title = removeSuffix ? objectName : `${objectName} - Domo`;
      },
      target: { tabId },
      world: 'MAIN'
    });
  } catch (error) {
    console.error(`[Background] Error updating title for tab ${tabId}:`, error);
  }
}

function stripTitleSuffix(tabId) {
  try {
    chrome.scripting.executeScript({
      func: () => {
        const suffix = ' - Domo';
        if (document.title.endsWith(suffix) && document.title.length > suffix.length) {
          document.title = document.title.slice(0, -suffix.length);
        }
      },
      target: { tabId },
      world: 'MAIN'
    });
  } catch (error) {
    console.error(`[Background] Error stripping title suffix for tab ${tabId}:`, error);
  }
}

/**
 * Update LRU timestamp for a tab
 */
function touchTab(tabId) {
  tabAccessTimes.set(tabId, Date.now());
}

/**
 * Update the tracked {objectKey, url} for a tab and clear errors only when
 * BOTH change. Same URL with object toggling (e.g., selecting a tile in a
 * modal) preserves errors; same object across URLs (e.g., card view ↔ edit)
 * also preserves them.
 */
function updateTabContextKey(tabId, { objectKey, url }) {
  const urlPath = pathnameOf(url);
  const prev = tabLastContext.get(tabId);
  if (prev && prev.objectKey !== objectKey && prev.url !== urlPath) {
    clearApiErrors(tabId);
  }
  tabLastContext.set(tabId, { objectKey, url: urlPath });
}

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
  const currentVersion = chrome.runtime.getManifest().version;

  migrateClearCookiesSetting();
  applyIconFromStorage();

  if (details.reason === 'install') {
    chrome.tabs.create({
      url: chrome.runtime.getURL('src/options/index.html#welcome')
    });
    chrome.storage.local.set({ lastSeenVersion: currentVersion });
  } else if (details.reason === 'update' && details.previousVersion) {
    const newReleases = releases.filter((r) => compareVersions(r.version, details.previousVersion) > 0);

    if (newReleases.length === 0) {
      // No release entry for this version, silently update lastSeenVersion
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
applyIconFromStorage();

chrome.runtime.onStartup.addListener(applyIconFromStorage);

// 431 error handler function (stored for add/remove)
// Only active when autoClearCookiesOn431 is true - preserves last 2 instances
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
      domoTabs.sort((a, b) => (b.lastAccessed || b.id) - (a.lastAccessed || a.id));

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
          const data = await executeInPage(async () => window.bootstrap?.data, [], tab.id);
          if (data?.environmentId && data?.analytics?.company) {
            daSidsToPreserve.push(`DA-SID-${data.environmentId}-${data.analytics.company}`);
            console.log('[Background] Preserving DA-SID for tab', tab.id, daSidsToPreserve[daSidsToPreserve.length - 1]);
          }
        } catch (e) {
          console.warn(`[Background] Could not get DA-SID for tab ${tab.id}:`, e);
        }
      }

      let domainsToPreserve = recentDomoTabs.map((t) => t.domain);

      // Safeguard: if no Domo tabs found, at least preserve the current domain
      if (domainsToPreserve.length === 0) {
        const currentDomain = new URL(details.url).hostname;
        domainsToPreserve = [currentDomain];
        console.log('[Background] No Domo tabs found, preserving current domain:', currentDomain);
      }

      console.log('[Background] Preserving domains:', domainsToPreserve, 'DA-SIDs:', daSidsToPreserve);

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
    chrome.webRequest.onResponseStarted.addListener(handle431Response, webRequestFilter);
    is431ListenerActive = true;
    console.log('[Background] 431 auto-clear listener enabled');
  }
}

// Initialize 431 listener based on stored setting.
// Reads the new key; falls back to deriving from the legacy key on the first
// boot after update if the migration hasn't completed yet.
chrome.storage.sync.get(['autoClearCookiesOn431', 'defaultClearCookiesHandling'], (result) => {
  const enabled =
    result.autoClearCookiesOn431 ??
    (result.defaultClearCookiesHandling === undefined ? true : result.defaultClearCookiesHandling === 'auto');

  if (enabled) {
    enable431Listener();
  }
});

// Initialize the cached tab-title suffix setting from storage.
chrome.storage.sync.get(['removeDomoTitleSuffix'], (result) => {
  removeDomoTitleSuffix = result.removeDomoTitleSuffix ?? false;
});

// Clean up when tabs are closed
chrome.tabs.onRemoved.addListener((tabId) => {
  console.log(`[Background] Tab ${tabId} removed, cleaning up context`);
  tabContexts.delete(tabId);
  tabAccessTimes.delete(tabId);
  tabDetectionGen.delete(tabId);
  tabDetectionInFlight.delete(tabId);
  tabApiErrors.delete(tabId);
  tabLastContext.delete(tabId);
  persistToSession();
});

// Sweep a closed window's per-instance sidepanel records so their full context
// serializations don't pile up against the session-storage quota. getKeys()
// (Chrome 130+) lists keys without deserializing the stored values.
chrome.windows.onRemoved.addListener(async (windowId) => {
  try {
    const keys = await chrome.storage.session.getKeys();
    const matches = keys.filter((key) => key.startsWith(sidepanelStorageKeyPrefix(windowId)));
    if (matches.length > 0) {
      await chrome.storage.session.remove(matches);
    }
  } catch (error) {
    console.error(`[Background] Error sweeping sidepanel records for window ${windowId}:`, error);
  }
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
    } catch {
      /* empty */
    }
  }

  // React to URL changes on Domo domains
  if (changeInfo.url && isDomoUrl(changeInfo.url)) {
    console.log(`[Background] URL changed for tab ${tabId}, triggering detection`);

    await detectAndStoreContext(tabId);
  }

  // A page refresh reloads the same URL, so `changeInfo.url` never fires and the
  // branch above is skipped. If an earlier detection left the context without a
  // resolved object name (a transient API/auth failure, or the page wasn't ready
  // when detection first ran), use the reload completing as a retry point so the
  // name and metadata get fetched again.
  //
  // Skip when a detection is already running for this tab: a redetection nulls
  // the cached object until it commits, and a reload fires `complete` more than
  // once, so an unguarded retry would read that transient null, start a
  // competing detection, and cancel the in-flight run (e.g. the one Share with
  // Self kicks off after reloading), leaving the details blank.
  if (changeInfo.status === 'complete' && isDomoUrl(tab.url) && !tabDetectionInFlight.has(tabId)) {
    const context = getTabContext(tabId);
    if (context && !context.domoObject?.metadata?.name) {
      console.log(`[Background] Tab ${tabId} reloaded without resolved object metadata, retrying detection`);
      await detectAndStoreContext(tabId);
    }
  }

  // Update the title when Domo resets it to "Domo", leaves a stale parent-only
  // title, or (with the suffix setting on) tacks " - Domo" onto any other page.
  if (changeInfo.title && isDomoUrl(tab.url)) {
    const context = getTabContext(tabId);
    const objectName = context?.domoObject?.metadata?.name;
    const allowedTitles = objectName ? buildAllowedTitles(context.domoObject) : [];
    const allowedPrefixes = objectName ? buildAllowedTitlePrefixes(context.domoObject) : [];
    if (changeInfo.title === 'Domo') {
      // Title reset to "Domo", so apply the object name or a section title
      if (objectName) {
        console.log(`[Background] Updating title for tab ${tabId} to include object name`);
        setTabTitle(tabId, getTitleName(context.domoObject), allowedTitles, false, allowedPrefixes);
      } else if (tab.url) {
        setSectionTitle(tabId, tab.url);
      }
    } else if (objectName && allowedTitles.includes(changeInfo.title)) {
      // Stale parent-only title (e.g., "MyApp - Domo"), so enrich to the object name
      console.log(`[Background] Enriching stale title for tab ${tabId}`);
      setTabTitle(tabId, getTitleName(context.domoObject), allowedTitles, false, allowedPrefixes);
    } else if (removeDomoTitleSuffix && changeInfo.title.endsWith(' - Domo')) {
      // Suffix setting on, so strip " - Domo" from any other Domo tab title.
      // Excluded hosts never reach here: isDomoUrl(tab.url) above is false for them.
      stripTitleSuffix(tabId);
    }
  }
});

// Detect context when history state changes (SPA navigation)
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (details.url && isDomoUrl(details.url)) {
    console.log(`[Background] History state updated for tab ${details.tabId}, triggering detection`);
    await detectAndStoreContext(details.tabId);
  }
});

// Listen for setting changes
chrome.storage.onChanged.addListener(async (changes, areaName) => {
  if (areaName === 'sync' && changes.autoClearCookiesOn431 !== undefined) {
    if (changes.autoClearCookiesOn431.newValue) {
      enable431Listener();
    } else {
      disable431Listener();
    }
  }

  if (areaName === 'sync' && changes.iconColor) {
    applyIconFromStorage();
  }

  if (areaName === 'sync' && changes.removeDomoTitleSuffix !== undefined) {
    removeDomoTitleSuffix = changes.removeDomoTitleSuffix.newValue ?? false;

    // Re-title open Domo tabs so the change applies without a reload
    const tabs = await chrome.tabs.query({
      url: '*://*.domo.com/*',
      windowType: 'normal'
    });
    for (const tab of tabs) {
      // The query matches every *.domo.com host, including excluded ones
      // (support, developer, etc.); skip those so no title management runs there.
      if (!isDomoUrl(tab.url)) continue;
      const context = getTabContext(tab.id);
      if (context?.domoObject?.metadata?.name) {
        const allowedTitles = buildAllowedTitles(context.domoObject);
        const allowedPrefixes = buildAllowedTitlePrefixes(context.domoObject);
        setTabTitle(tab.id, getTitleName(context.domoObject), allowedTitles, true, allowedPrefixes);
        continue;
      }
      // Unmanaged page (no detected object): re-apply a section title if one
      // matches, otherwise strip the suffix directly when the setting is on.
      const appliedSection = setSectionTitle(tab.id, tab.url, true);
      if (!appliedSection && removeDomoTitleSuffix) {
        stripTitleSuffix(tab.id);
      }
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
      if (!isDomoUrl(tab.url)) continue;
      sendMessageWithRetry(tab.id, { type: 'APPLY_FAVICON' }, 3)
        .then(() => {
          console.log(`[Background] Updated favicon for tab ${tab.id}`);
        })
        .catch((error) => {
          console.log(`[Background] Could not notify tab ${tab.id}:`, error.message);
        });
    }
  }
});

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'copy_id') {
    console.log('[Background] Keyboard command triggered: copy_id');
    handleCopyIdCommand();
  }
});

/**
 * Ask any open extension UI (sidepanel/popup) to copy its current object's
 * primary ID. Only the surface that currently has focus performs the write and
 * responds; the others stay silent. Resolves true when a focused surface
 * copied, false otherwise (no UI open, or none focused).
 */
async function copyViaFocusedUi() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'COPY_ID_SHORTCUT'
    });
    return response?.copied === true;
  } catch {
    // "Receiving end does not exist" when no extension UI is open to receive it.
    return false;
  }
}

/**
 * Detect and store context for a specific tab
 * Injects detection script into page and enriches with API data
 * @returns {DomoContext|null} DomoContext instance or null
 */
async function detectAndStoreContext(tabId) {
  const generation = (tabDetectionGen.get(tabId) || 0) + 1;
  tabDetectionGen.set(tabId, generation);
  tabDetectionInFlight.set(tabId, generation);
  const isStale = () => tabDetectionGen.get(tabId) !== generation;

  try {
    // Get tab info for URL
    const tab = await chrome.tabs.get(tabId);
    if (!tab || !isDomoUrl(tab.url)) {
      // Not a Domo domain - clear any existing context and broadcast the update
      console.log(`[Background] Tab ${tabId} is not on a Domo domain, clearing context`);
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
            console.log('[Background] No listeners for TAB_CONTEXT_UPDATED (null):', error.message);
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

    // Fetch current user + groups + feature switches (cached per instance, non-blocking)
    getInstanceUser(context.instance, tabId)
      .then(({ featureSwitches, user, userGroups }) => {
        if (isStale()) return;
        const currentContext = getTabContext(tabId);
        if (currentContext) {
          currentContext.user = user;
          currentContext.userGroups = userGroups;
          currentContext.featureSwitches = featureSwitches;
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
          // resolved yet; the final setTabContext after detection will
          // broadcast the complete context.
          if (isRedetection && !currentContext.domoObject) {
            tabContexts.set(tabId, currentContext);
          } else {
            setTabContext(tabId, currentContext);
          }
        }
        console.log(`[Background] User for tab ${tabId} (${context.instance}):`, user?.id);
      })
      .catch((error) => {
        console.warn(`[Background] Could not fetch user for tab ${tabId}:`, error.message);
      });

    // Execute detection script in page context
    const detected = await executeInPage(detectCurrentObject, [], tabId);
    if (isStale()) return null;
    if (!detected) {
      console.log(`[Background] No Domo object detected on tab ${tabId}`);
      if (tab.url) {
        updateTabContextKey(tabId, { objectKey: null, url: tab.url });
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
      updateTabContextKey(tabId, { objectKey: null, url: tab.url });
      setSectionTitle(tabId, tab.url);
      // During redetection, broadcast the empty context so the UI clears the
      // stale object instead of leaving the previous one on screen
      if (isRedetection) {
        setTabContext(tabId, context);
      }
      return null;
    }

    // Extract ID using model if not already extracted
    let objectId = detected.id;
    if (!objectId) {
      objectId = typeModel.extractObjectId(detected.url);
    }

    // Resolve ID via API if needed (e.g., FILESET_FILE where ID isn't in the URL)
    if (!objectId && detected.resolveContext) {
      objectId = await resolveObjectId(detected.typeId, detected.resolveContext, tabId);
      if (isStale()) return null;
    }

    if (!objectId) {
      console.warn(`[Background] Could not extract ID for ${detected.typeId}`);
      updateTabContextKey(tabId, { objectKey: null, url: tab.url });
      setSectionTitle(tabId, tab.url);
      // The URL matched a type by path (e.g. /cloud-integrations/) but carries
      // no object ID, such as a Cloud Integration's engine manage list. During
      // redetection, broadcast the empty context so the UI clears the stale
      // object rather than keeping the one we navigated away from.
      if (isRedetection) {
        setTabContext(tabId, context);
      }
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
      typeModel.extractParentId(detected.url) || detected.parentId || detected.resolveContext?.filesetId || null;

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
    const enrichedMetadata = (await executeInPage(fetchObjectDetailsInPage, [params], tabId)) || {};
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

    // Beast Modes and Variables share the same URL (/datacenter/beastmode?id=)
    // and the same function-template endpoint, so URL detection can't tell them
    // apart. The enriched details carry a `global` flag that is true only for
    // Variables; anything else (false or absent) is a Beast Mode. Refine the
    // type here, after enrichment, since `global` isn't known at URL-detection
    // time. Both types share `urlPath`, so the already-built URL stays valid;
    // we only need to swap the type model (which drives icon, label, parents).
    if (detected.typeId === 'BEAST_MODE_FORMULA' && enrichedMetadata.details?.global === true) {
      detected.typeId = 'VARIABLE';
      typeModel = getObjectType('VARIABLE');
      domoObject.objectType = typeModel;
    }

    // Preserve workflow context from CE tile detection within a workflow
    if (detected.workflowModelId) {
      domoObject.metadata.context.workflowModelId = detected.workflowModelId;
      domoObject.metadata.context.workflowVersionNumber = detected.workflowVersionNumber;
    }

    // Preserve page/app context when a card is viewed from a page or app
    if (detected.pageId) {
      const appId = await executeInPage(checkPageType, [detected.pageId], tabId);
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
    domoObject.metadata.isOwner = computeIsOwner(typeModel.id, enrichedMetadata.details, currentUser?.id, currentUserGroups);

    // DATA_SOURCE: resolve DATAFLOW_TYPE parent via reverse-lookup API
    if (!parentId && typeModel.id === 'DATA_SOURCE' && enrichedMetadata.details?.type?.toLowerCase() === 'dataflow') {
      try {
        const dataflowId = await getDataflowForOutputDataset(objectId, tabId);
        if (isStale()) return null;
        parentId = dataflowId;
        domoObject.parentId = dataflowId;
      } catch (error) {
        if (isStale()) return null;
        console.warn(`[Background] Could not resolve DataFlow parent for DATA_SOURCE ${objectId}:`, error.message);
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
    // (skip for stream parents; those are enriched async below)
    console.log(`[Background] Parent enrichment check: parentId=${parentId}, parents=${JSON.stringify(typeModel.parents)}`);
    if (parentId && typeModel.parents && typeModel.parents.length > 0 && !isStreamParent) {
      try {
        console.log(`[Background] Calling getParent for ${typeModel.id} ${objectId} with tabId=${tabId}`);
        await domoObject.getParent(false, detected.url, tabId);
        if (isStale()) return null;
        console.log(`[Background] Enriched parent metadata for ${typeModel.id} ${objectId}:`, domoObject.metadata?.parent);
      } catch (error) {
        if (isStale()) return null;
        console.warn(`[Background] Could not enrich parent metadata for ${typeModel.id} ${objectId}:`, error);
      }
    }

    // Compose a tab-title display name from template if configured. This is kept
    // separate from metadata.name so the context footer shows the object's own
    // name while the tab title gets the parent-qualified form.
    if (typeModel.api?.displayName && domoObject.metadata?.parent?.name) {
      domoObject.metadata.titleName = typeModel.api.displayName
        .replace('{parent.name}', domoObject.metadata.parent.name)
        .replace('{name}', domoObject.metadata.name || '')
        .replace('{id}', objectId);
    }

    updateTabContextKey(tabId, {
      objectKey: `${typeModel.id}:${objectId}`,
      url: tab.url
    });

    // Final stale check before committing context
    if (isStale()) return null;

    // Update DomoContext with DomoObject
    context.domoObject = domoObject;

    console.log(`[Background] Detected and stored context for tab ${tabId}:`, context);
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
    console.error(`[Background] Error detecting context for tab ${tabId}:`, error);
    return null;
  } finally {
    // Only clear if we're still the latest run; a newer generation that
    // superseded us owns the marker now and must clear it itself.
    if (tabDetectionInFlight.get(tabId) === generation) {
      tabDetectionInFlight.delete(tabId);
    }
  }
}

/**
 * Handle the copy_id keyboard shortcut.
 *
 * navigator.clipboard.writeText only succeeds in a focused document. When the
 * sidepanel or popup has focus, the Domo page document does not, so injecting
 * the write into the page silently no-ops. We therefore ask any open extension
 * UI to perform the copy first; only the focused surface responds. If none is
 * focused (the Domo page itself has focus), we fall back to the in-page write.
 */
async function handleCopyIdCommand() {
  if (await copyViaFocusedUi()) {
    showCopyBadge(true);
    return;
  }

  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
    windowType: 'normal'
  });
  if (!tab) {
    console.log('[Background] No active tab found for copy_id command');
    return;
  }

  const context = getTabContext(tab.id);
  const copy = resolvePrimaryCopy(context?.domoObject);
  if (!copy) {
    console.log('[Background] No Domo object ID found in context for copy_id command');
    return;
  }

  try {
    await executeInPage(
      async (text) => {
        await navigator.clipboard.writeText(text);
      },
      [copy.value],
      tab.id
    );
    showCopyBadge(true);
  } catch (error) {
    console.error('[Background] Failed to copy ID to clipboard:', error);
    showCopyBadge(false);
  }
}

/**
 * Flash the action badge to confirm (or report failure of) a shortcut copy,
 * then restore the badge to its prior state.
 */
function showCopyBadge(success) {
  chrome.action.setBadgeText({ text: success ? '\u2713' : '!' });
  chrome.action.setBadgeBackgroundColor({
    color: success ? '#22c55e' : '#ef4444'
  });
  restoreBadgeAfterDelay();
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
          console.log('[Background] GET_TAB_CONTEXT for window', windowId, tabs);
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
