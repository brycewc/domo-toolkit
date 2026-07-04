/**
 * Per-type row-action capability registry for DataList rows.
 *
 * Each entry lists the intrinsic ("self") actions a row of that type supports:
 * actions that depend only on the object's own type, not on its children
 * (`openAll`, derived from having children) or per-row data (`share`, also gated
 * by `isItemShareable`). `copy` and the activity-log actions are universal and
 * handled directly by DataList, so they need not be listed for the universal
 * case but are included where a type's menu is otherwise empty.
 *
 * Shareability is read from this one map: a type is shareable iff its list
 * contains `'share'` (see `isShareableType`). There is no separate set of
 * shareable types to keep in sync.
 */
const ROW_ACTION_CAPABILITIES = {
  APP: ['copy', 'share'],
  CARD: ['copy'],
  DATA_APP: ['copy', 'share'],
  DATA_APP_VIEW: ['copy'],
  DATA_SOURCE: ['copy', 'lineage', 'viewsExplorer'],
  DATAFLOW_TYPE: ['copy', 'lineage'],
  PAGE: ['copy', 'share'],
  WORKSHEET: ['copy', 'share']
};

/** Fallback menu for any type not in the map (and for null/untyped rows). */
const DEFAULT_ROW_ACTIONS = ['copy'];

/**
 * Walk a list of DataList rows (and their nested children) and return the
 * DomoObjects of the ones the "share with self" flow can target.
 * @param {Array} nodes - DataListItem-like rows with `domoObject`/`children`
 * @returns {Array} DomoObjects for every shareable row in the subtree
 */
export function collectShareableObjects(nodes) {
  const objects = [];
  const walk = (list) => {
    for (const node of list || []) {
      if (node.domoObject && isItemShareable(node)) objects.push(node.domoObject);
      if (node.children?.length) walk(node.children);
    }
  };
  walk(nodes);
  return objects;
}

/**
 * The set of intrinsic row actions a given object type supports.
 * @param {string|null} typeId
 * @returns {Set<string>}
 */
export function getRowActionsForType(typeId) {
  return new Set(ROW_ACTION_CAPABILITIES[typeId] ?? DEFAULT_ROW_ACTIONS);
}

/**
 * Whether a row has at least one shareable descendant (drives the "share all"
 * affordance on a group). Respects the `unshareable` flag on the row itself.
 * @param {Object} item - DataListItem-like row
 * @returns {boolean}
 */
export function hasShareableChildren(item) {
  if (item?.unshareable === true) return false;
  if (!item?.children?.length) return false;
  return item.children.some((c) => isItemShareable(c) || hasShareableChildren(c));
}

/**
 * Whether a single row can be shared with self: a shareable type, not flagged
 * `unshareable`, and not a synthetic negative id (e.g. Favorites/Overview).
 * @param {Object} item - DataListItem-like row
 * @returns {boolean}
 */
export function isItemShareable(item) {
  if (!item) return false;
  if (item.unshareable === true) return false;
  if (Number(item.id) < 0) return false;
  return isShareableType(item.typeId);
}

/**
 * Whether rows of this type expose a share action (i.e. the capability map
 * grants them `'share'`).
 * @param {string|null} typeId
 * @returns {boolean}
 */
export function isShareableType(typeId) {
  return getRowActionsForType(typeId).has('share');
}
