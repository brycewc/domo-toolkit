import { isDomoUrl } from './currentObject';
import { canActOnHost } from './localInstance';

/**
 * customizeCopy handler for react18-json-view. Routes the JSON viewer's own
 * per-node copy buttons through copyToClipboard so they land in the OS
 * clipboard history like every other copy, and pretty-prints objects so every
 * viewer copies the same way.
 *
 * The library writes to the clipboard itself only when this returns a non-empty
 * string, so we do the copy here and return '' to suppress its (history-
 * excluded) write. It still flashes its copied checkmark either way.
 *
 * @param {any} node - The JSON node the user clicked copy on
 * @returns {string} - Always '' so the library skips its own clipboard write
 */
export function copyJsonNode(node) {
  copyToClipboard(stringifyNode(node)).catch(() => {});
  return '';
}

/**
 * Copy text to the clipboard so the copy lands in the OS clipboard history
 * (Windows Win+V, and cloud clipboard sync).
 *
 * Chromium tags clipboard writes made from an extension surface (popup or side
 * panel, a chrome-extension:// origin) with the Windows "exclude from clipboard
 * history / cloud" formats, so navigator.clipboard.writeText() called directly
 * in the popup or side panel is pastable but never shows up in Win+V history.
 * Writes that originate from a normal web page are not tagged, so they do. We
 * therefore run the copy inside the Domo tab instead of the extension UI.
 *
 * The async Clipboard API can't be used in the tab here because it requires the
 * page document to be focused, and clicking a button focuses the extension UI
 * instead (see the copy_id fallback in background.js). document.execCommand
 * ('copy') has no focus requirement and, with the clipboardWrite permission,
 * runs from a content script (ISOLATED world) without a user gesture, so it
 * still works while the page is unfocused.
 *
 * @param {string} text - The text to copy
 * @param {number} [tabId] - The Domo tab to run the copy in. Omit to use the
 *   active tab in the current window.
 * @returns {Promise<boolean>} - true when the copy succeeded
 */
export async function copyToClipboard(text, tabId = null) {
  // Dev mode: no chrome.scripting; write directly via the polyfilled clipboard.
  if (import.meta.env.DEV && !globalThis.chrome?.scripting) {
    await navigator.clipboard.writeText(text);
    return true;
  }

  const domoTabId = await resolveDomoTabId(tabId);
  if (domoTabId == null) {
    // No Domo tab to run the copy in (e.g. the options page with no Domo tab
    // open). Fall back to a direct write: still pastable, though Windows may
    // leave it out of clipboard history.
    await navigator.clipboard.writeText(text);
    return true;
  }

  // No `world` — defaults to ISOLATED so the clipboardWrite permission applies.
  const [injection] = await chrome.scripting.executeScript({
    args: [text],
    func: (value) => {
      const textarea = document.createElement('textarea');
      textarea.value = value;
      textarea.setAttribute('readonly', '');
      textarea.style.left = '-9999px';
      textarea.style.opacity = '0';
      textarea.style.position = 'fixed';
      textarea.style.top = '0';
      document.body.appendChild(textarea);
      const selection = document.getSelection();
      const saved = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
      textarea.focus();
      textarea.select();
      try {
        return document.execCommand('copy');
      } finally {
        textarea.remove();
        // Restore whatever the user had selected before we hijacked it.
        if (saved && selection) {
          selection.removeAllRanges();
          selection.addRange(saved);
        }
      }
    },
    target: { tabId: domoTabId }
  });

  return injection?.result === true;
}

/**
 * Resolve the Domo tab to run a copy in, or null when none is reachable.
 * @param {number|null} tabId - Explicit tab, or null to use the active tab
 * @returns {Promise<number|null>}
 */
async function resolveDomoTabId(tabId) {
  try {
    // canActOnHost, not just isDomoUrl: invoking a keyboard command grants
    // activeTab, so a local tab is scriptable even without the opt-in permission.
    if (tabId != null) {
      const tab = await chrome.tabs.get(tabId);
      return tab?.url && isDomoUrl(tab.url) && (await canActOnHost(tab.url)) ? tabId : null;
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id != null && tab.url && isDomoUrl(tab.url) && (await canActOnHost(tab.url)) ? tab.id : null;
  } catch {
    return null;
  }
}

/**
 * Stringify a JSON node the way the viewer displays it: strings verbatim,
 * everything else pretty-printed.
 * @param {any} node
 * @returns {string}
 */
function stringifyNode(node) {
  return typeof node === 'object' && node !== null ? JSON.stringify(node, null, 2) : String(node);
}
