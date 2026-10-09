import { getSidepanelData, launchView } from '@/utils/sidepanel';

// Matches the side panel's cutoff for a record written before it mounted.
const REQUEST_MAX_AGE_BEFORE_MOUNT_MS = 10000;

export async function clearOwnedObjectsLogRequest(instance) {
  await chrome.storage.session.remove(await ownedObjectsLogRequestKey(instance));
}

export function isOwnedObjectsLogRequestFor(request, { mountedAt, ownerId, ownerType }) {
  return (
    request?.ownerId === String(ownerId) &&
    request.ownerType === ownerType &&
    request.requestedAt >= mountedAt - REQUEST_MAX_AGE_BEFORE_MOUNT_MS
  );
}

export async function ownedObjectsLogRequestKey(instance) {
  const { id } = await chrome.windows.getCurrent();
  return `ownedObjectsLogRequest_${id}_${instance}`;
}

/**
 * Ask the Objects Owned view to open the activity log for everything it lists,
 * opening that view first unless one is already open for this owner.
 */
export async function requestOwnedObjectsLog({ currentContext, onStatusUpdate }) {
  const { id, typeId } = currentContext.domoObject;
  await chrome.storage.session.set({
    [await ownedObjectsLogRequestKey(currentContext.instance)]: {
      ownerId: String(id),
      ownerType: typeId,
      requestedAt: Date.now()
    }
  });
  if (await isOwnershipViewOpenFor(currentContext)) return;
  await launchView({ currentContext, onStatusUpdate, type: 'ownership' });
}

// A closed side panel leaves its last record behind, so the record alone can't prove the view is mounted.
async function isOwnershipViewOpenFor(currentContext) {
  const { id: windowId } = await chrome.windows.getCurrent();
  const panels = (await chrome.runtime.getContexts?.({ contextTypes: ['SIDE_PANEL'], windowIds: [windowId] })) ?? [];
  if (panels.length === 0) return false;
  const record = await getSidepanelData(currentContext.instance);
  const owner = record?.type === 'ownership' ? record.currentContext?.domoObject : null;
  return owner?.typeId === currentContext.domoObject.typeId && String(owner.id) === String(currentContext.domoObject.id);
}
