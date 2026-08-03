import { EXCLUDED_HOSTNAMES, LOCAL_MATCH_PATTERN } from './constants';

/**
 * Opt-in access to locally run Domo instances.
 *
 * Domo's own web developers run DomoWeb behind a proxy on `<customer>.localhost:<port>`.
 * Reaching those hosts needs a host permission, but declaring it statically would
 * widen the install-time warning for every store user, so it is an optional
 * permission the developer grants from the options page instead.
 *
 * Because the permission is optional, the content script cannot be declared for
 * localhost in the manifest either (a static content_scripts entry carries its own
 * warning). It is registered at runtime instead, reusing whatever file the manifest's
 * own content script points at so this works in both the CRXJS dev build (where the
 * entry is a hashed loader) and production.
 */

const CONTENT_SCRIPT_ID = 'local-domo-instances';

/**
 * Whether the user has granted access to local Domo instances.
 * @returns {Promise<boolean>}
 */
export async function hasLocalAccess() {
  return chrome.permissions.contains({ origins: [LOCAL_MATCH_PATTERN] });
}

/**
 * Register the content script for local instances. Idempotent: a duplicate ID just
 * means it is already registered, which is not an error worth surfacing.
 * @returns {Promise<void>}
 */
export async function registerLocalContentScript() {
  const [declared] = chrome.runtime.getManifest().content_scripts ?? [];
  if (!declared?.js?.length) {
    console.warn('[localInstance] No declared content script to mirror, skipping registration');
    return;
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        allFrames: false,
        excludeMatches: EXCLUDED_HOSTNAMES.map((hostname) => `*://${hostname}/*`),
        id: CONTENT_SCRIPT_ID,
        js: declared.js,
        matches: [LOCAL_MATCH_PATTERN],
        runAt: 'document_idle'
      }
    ]);
  } catch (error) {
    if (!String(error?.message).includes('Duplicate script ID')) {
      throw error;
    }
  }
}

/**
 * Ask the user for access to local Domo instances. Must be called from a user
 * gesture, so it cannot be deferred behind a Save button.
 * @returns {Promise<boolean>} Whether access was granted
 */
export async function requestLocalAccess() {
  const granted = await chrome.permissions.request({ origins: [LOCAL_MATCH_PATTERN] });
  if (granted) {
    await registerLocalContentScript();
  }
  return granted;
}

/**
 * Give up access to local Domo instances.
 * @returns {Promise<void>}
 */
export async function revokeLocalAccess() {
  await unregisterLocalContentScript();
  await chrome.permissions.remove({ origins: [LOCAL_MATCH_PATTERN] });
}

/**
 * Remove the dynamically registered local content script. Tolerates it not being
 * registered, which is the normal case when access was never granted.
 * @returns {Promise<void>}
 */
export async function unregisterLocalContentScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    /* not registered */
  }
}
