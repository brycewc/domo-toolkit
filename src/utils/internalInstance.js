import { EXCLUDED_HOSTNAMES, INTERNAL_MATCH_PATTERNS } from './constants';
import { isInternalDomoHostname } from './instance';

/**
 * Opt-in access to Domo-internal instances.
 *
 * Two host families are internal. Domo's own web developers run DomoWeb behind a
 * proxy on `<customer>.localhost:<port>`, and Domo's development test rigs live on
 * `<rig>.domorig.io`. Reaching either needs a host permission, but declaring them
 * statically would widen the install-time warning for every store user, so they are
 * one optional permission the developer grants from the options page instead. The
 * two are granted and revoked together: anyone who needs one needs the other.
 *
 * Because the permission is optional, the content script cannot be declared for
 * these hosts in the manifest either (a static content_scripts entry carries its own
 * warning). It is registered at runtime instead, reusing whatever file the manifest's
 * own content script points at so this works in both the CRXJS dev build (where the
 * entry is a hashed loader) and production.
 */

// Persisted by the browser across extension updates, so renaming it would strand
// the old registration on installs that already granted the permission.
const CONTENT_SCRIPT_ID = 'local-domo-instances';

/**
 * Whether the extension is allowed to act on a URL's host at all.
 *
 * Hosted Domo hosts always are. An internal host requires the opt-in permission, and
 * that has to be checked rather than left to the browser: `activeTab` grants host
 * access to whatever tab the user opened the popup on, so scripting an internal page
 * succeeds even when the optional permission was never granted.
 * @param {string} url - A full URL string
 * @returns {Promise<boolean>}
 */
export async function canActOnHost(url) {
  try {
    if (!isInternalDomoHostname(new URL(url).hostname)) {
      return true;
    }
  } catch {
    return false;
  }
  return hasInternalAccess();
}

/**
 * Whether the user has granted access to Domo-internal instances.
 * @returns {Promise<boolean>}
 */
export async function hasInternalAccess() {
  return chrome.permissions.contains({ origins: INTERNAL_MATCH_PATTERNS });
}

/**
 * Register the content script for internal instances. Idempotent: a duplicate ID just
 * means it is already registered, which is not an error worth surfacing.
 * @returns {Promise<void>}
 */
export async function registerInternalContentScript() {
  const [declared] = chrome.runtime.getManifest().content_scripts ?? [];
  if (!declared?.js?.length) {
    console.warn('[internalInstance] No declared content script to mirror, skipping registration');
    return;
  }

  try {
    await chrome.scripting.registerContentScripts([
      {
        allFrames: false,
        excludeMatches: EXCLUDED_HOSTNAMES.map((hostname) => `*://${hostname}/*`),
        id: CONTENT_SCRIPT_ID,
        js: declared.js,
        matches: INTERNAL_MATCH_PATTERNS,
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
 * Ask the user for access to Domo-internal instances. Must be called from a user
 * gesture, so it cannot be deferred behind a Save button.
 * @returns {Promise<boolean>} Whether access was granted
 */
export async function requestInternalAccess() {
  const granted = await chrome.permissions.request({ origins: INTERNAL_MATCH_PATTERNS });
  if (granted) {
    await registerInternalContentScript();
  }
  return granted;
}

/**
 * Give up access to Domo-internal instances.
 * @returns {Promise<void>}
 */
export async function revokeInternalAccess() {
  await unregisterInternalContentScript();
  await chrome.permissions.remove({ origins: INTERNAL_MATCH_PATTERNS });
}

/**
 * Remove the dynamically registered internal content script. Tolerates it not being
 * registered, which is the normal case when access was never granted.
 * @returns {Promise<void>}
 */
export async function unregisterInternalContentScript() {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: [CONTENT_SCRIPT_ID] });
  } catch {
    /* not registered */
  }
}
