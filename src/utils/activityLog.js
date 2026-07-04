/**
 * Opens the Activity Log viewer in a new options-page tab, scoped to the given
 * objects. Writes the four session keys the viewer reads on mount
 * (`ActivityLogTable`), then opens `src/options/index.html#activity-log` right
 * after the launching tab so the log stays in the same window/incognito context.
 *
 * @param {Object} params
 * @param {string} params.instance - Domo instance subdomain (e.g. `my-co`).
 * @param {Array<{ id: string, name?: string, type: string }>} params.objects - Objects to log.
 * @param {number} params.tabId - The Domo tab used for auth and as the opener for tab positioning.
 * @param {string} params.type - Scoping type read by the viewer (`single-object`, `object-and-parent`, `multi-object`, etc.).
 */
export async function launchActivityLog({ instance, objects, tabId, type }) {
  await chrome.storage.session.set({
    activityLogInstance: instance,
    activityLogObjects: objects,
    activityLogTabId: tabId,
    activityLogType: type
  });

  const tab = await chrome.tabs.get(tabId);
  chrome.tabs.create({
    index: tab.index + 1,
    openerTabId: tab.id,
    url: chrome.runtime.getURL('src/options/index.html#activity-log'),
    windowId: tab.windowId
  });
}
