const NOUN_BY_ACTIVITY_LOG_TYPE = {
  'card-pages': 'Page',
  'cards': 'Card',
  'child-pages': 'Page'
};

/**
 * Title Case count phrase for a multi-object log, e.g. `12 Cards`. Shared by the
 * viewer's header and the options tab title so the two can't drift apart.
 */
export function activityLogCountLabel({ count, type }) {
  const noun = NOUN_BY_ACTIVITY_LOG_TYPE[type] ?? 'Object';
  return `${count} ${count === 1 ? noun : `${noun}s`}`;
}

/**
 * Opens the Activity Log viewer in a new options-page tab, scoped to the given
 * objects. Writes the session keys the viewer reads on mount
 * (`ActivityLogTable`), then opens `src/options/index.html#activity-log` right
 * after the launching tab so the log stays in the same window/incognito context.
 *
 * @param {Object} params
 * @param {string} params.instance - Instance key (e.g. `my-co` or `dev.localhost:9128`).
 * @param {Array<{ id: string, name?: string, type: string }>} params.objects - Objects to log.
 * @param {string} params.origin - The instance's exact origin, used for links and avatars.
 * @param {number} params.tabId - The Domo tab used for auth and as the opener for tab positioning.
 * @param {string} params.type - Scoping type read by the viewer (`single-object`, `object-and-parent`, `multi-object`, etc.).
 */
export async function launchActivityLog({ instance, objects, origin, tabId, type }) {
  await chrome.storage.session.set({
    activityLogInstance: instance,
    activityLogObjects: objects,
    activityLogOrigin: origin,
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
