import { getObjectType } from '@/models/DomoObjectType';
import { getValidTabForInstance } from '@/utils/currentObject';
import { instanceKeyFromUrl } from '@/utils/instance';

export const COMBINED_PARENT_LOG_TYPES = ['DATA_APP_VIEW', 'WORKSHEET_VIEW'];

// Code Engine package versions are never written to the activity log, only the parent package is.
export const PARENT_ONLY_LOG_TYPES = ['CODEENGINE_PACKAGE_VERSION'];

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

/** Null when the type has no parent or the parent ID was never resolved. */
export function getActivityLogParent(domoObject) {
  const parentTypeId = getObjectType(domoObject?.typeId)?.parents?.[0];
  const parentId = domoObject?.parentId ?? domoObject?.metadata?.parent?.id;
  if (!parentTypeId || !parentId) return null;
  return {
    id: String(parentId),
    name: domoObject.metadata?.parent?.name || '',
    type: parentTypeId,
    typeName: getObjectType(parentTypeId)?.name
  };
}

/** Null for a parent-only type whose parent could not be resolved. */
export function getActivityLogTarget(domoObject) {
  const { typeId } = domoObject;
  const parent = getActivityLogParent(domoObject);

  if (PARENT_ONLY_LOG_TYPES.includes(typeId)) {
    return parent ? { objects: [parent], type: 'single-object' } : null;
  }

  // Domo splits some types' events across several audit types (a view and a data
  // model log edits as VIEW and the rest as DATA_SOURCE), so each needs its own entry.
  const self = (getObjectType(typeId)?.activityLogTypes ?? [typeId]).map((auditType) => ({
    id: String(domoObject.id),
    name: domoObject.metadata?.name || '',
    type: auditType,
    typeName: domoObject.typeName
  }));

  if (parent && COMBINED_PARENT_LOG_TYPES.includes(typeId)) {
    return { objects: [...self, parent], type: 'object-and-parent' };
  }
  return { objects: self, type: 'single-object' };
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

// Authenticates through any tab on the objects' instance, since the active tab may have moved on.
export async function launchActivityLogForOrigin({ objects, origin, type }) {
  const instance = origin ? instanceKeyFromUrl(origin) : null;
  if (!instance) return false;
  const tabId = await getValidTabForInstance(instance);
  await launchActivityLog({ instance, objects, origin, tabId, type });
  return true;
}
