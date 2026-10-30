export const NOT_ON_PAGE_KEY = 'none';

const KIND_BY_TYPE = {
  DATA_APP_VIEW: 'appView',
  PAGE: 'page',
  REPORT_BUILDER_PAGE: 'reportPage',
  WORKSHEET_VIEW: 'worksheetView'
};

export function locationKey(kind, id) {
  return `${kind}:${id}`;
}

// A whole-app scope comes from the button's long-press instead, since the context names only the one view.
export function scopeFromContext(context) {
  const domoObject = context?.domoObject;
  const kind = KIND_BY_TYPE[domoObject?.typeId];
  if (!kind || domoObject.id == null) return null;
  const appId = domoObject.parentId != null ? String(domoObject.parentId) : undefined;
  return { appId, id: String(domoObject.id), kind };
}
