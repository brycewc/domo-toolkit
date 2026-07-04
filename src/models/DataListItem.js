import { DomoObject } from './DomoObject';

/**
 * DataListItem class represents an item in the DataList component.
 * Provides a consistent structure for list items across different features
 * (pages, datasets, etc.) with optional DomoObject reference.
 */
export class DataListItem {
  /**
   * @param {Object} config - Configuration object
   * @param {{ tooltip: string }} [config.annotation] - Optional leading info
   *   icon rendered before the label, with `tooltip` surfaced via the icon's
   *   native `title` on hover. Because the icon sits at the start of the label,
   *   it survives label truncation. Best suited to non-link rows; the
   *   explanatory text it points to typically also appears as a legend near the
   *   list (see ColumnUsagesModal).
   * @param {string|number} config.id - Unique identifier for the item
   * @param {string} config.label - Display label for the item
   * @param {string} [config.url] - Optional URL for navigation
   * @param {string} [config.typeId] - Object type identifier (e.g., 'PAGE', 'DATA_APP_VIEW')
   * @param {string} [config.metadata] - Optional metadata string for display (e.g., "ID: 123")
   * @param {boolean} [config.muted] - When true, DataList renders the row's
   *   label (name + `currentColor` icon) muted, marking it as a secondary or
   *   container entry rather than a direct result. Any annotation marker keeps
   *   its own color.
   * @param {number} [config.count] - Optional count for children or related items
   * @param {string} [config.countLabel] - Optional label for count display (e.g., 'cards', 'pages')
   * @param {DataListItem[]} [config.children] - Optional nested child items
   * @param {string} [config.childTypeId] - On a virtual-parent group whose rows
   *   are all one object type, the type of those rows (e.g. 'DATA_APP'). Lets
   *   DataList derive the group's "all" actions from that type's capabilities
   *   instead of walking the children. Leave null for heterogeneous groups.
   * @param {boolean} [config.isVirtualParent] - Whether this is a grouping/virtual parent node
   * @param {DomoObject} [config.domoObject] - Optional DomoObject instance for richer functionality
   * @param {'loading'|'loaded'|'transferring'|'transferred'|'error'|'failed'} [config.status]
   *   Async-state for virtual-parent groupings. When undefined, treated as 'loaded'.
   *   Spans both fetch (`loading`/`loaded`/`error`) and transfer (`transferring`/
   *   `transferred`/`failed`) phases so a row can reuse the same field across
   *   the lifecycle.
   * @param {string} [config.error] - Error message to display when status is 'error' or 'failed'
   * @param {*} [config.errorDetail] - Optional raw, structured error payload (e.g.
   *   the full array of per-item failures). When present, DataList's error Alert
   *   exposes a copy button that copies this serialized as pretty-printed JSON,
   *   so the complete failure data is recoverable even though the Alert body
   *   shows a human-readable summary.
   * @param {string|number} [config.originalId] - Canonical id for clipboard
   *   copy when `id` has been namespaced for uniqueness (e.g.
   *   `project-123`/`task-123` to avoid cross-namespace collisions). When
   *   absent, copy actions use `id` directly.
   * @param {boolean} [config.unshareable] - When true, DataList suppresses the
   *   share and share-all affordances for this item. On a virtual-parent group
   *   this hides the group's "Share all with yourself" button (via
   *   `hasShareableChildren`), so a view can expose share-all for some groups
   *   but not others.
   */
  constructor({
    annotation = null,
    children = undefined,
    childTypeId = null,
    count = undefined,
    countLabel = null,
    domoObject = null,
    error = null,
    errorDetail = null,
    id,
    isVirtualParent = false,
    label,
    metadata = null,
    muted = false,
    originalId = undefined,
    status = undefined,
    typeId = null,
    unshareable = false,
    url = null
  }) {
    this.id = id;
    this.label = label;
    this.url = url;
    this.typeId = typeId;
    this.metadata = metadata;
    this.count = count;
    this.countLabel = countLabel;
    this.children = children;
    this.childTypeId = childTypeId;
    this.isVirtualParent = isVirtualParent;
    this.domoObject = domoObject;
    this.status = status;
    this.error = error;
    this.errorDetail = errorDetail;
    this.originalId = originalId;
    this.unshareable = unshareable;
    this.annotation = annotation;
    this.muted = muted;
  }

  /**
   * Create a virtual parent item (grouping header)
   * @param {Object} config - Configuration object
   * @param {string} config.id - Unique identifier for the group
   * @param {string} config.label - Display label for the group
   * @param {DataListItem[]} [config.children] - Child items in this group
   * @param {string} [config.childTypeId] - The object type of this group's rows
   *   when they are homogeneous (e.g. 'DATA_APP'), so DataList can derive the
   *   group's "all" actions from that type. Omit for mixed-type groups.
   * @param {number} [config.count] - Override child count (defaults to children.length).
   *   Useful for async-loading rows where children aren't populated yet but a
   *   total is known.
   * @param {string} [config.metadata] - Optional metadata (defaults to child count description)
   * @param {'loading'|'loaded'|'transferring'|'transferred'|'error'|'failed'} [config.status]
   *   Async state that DataList renders as a spinner or X icon in the count slot.
   * @param {string} [config.error] - Error message rendered inside the body when expanded (status='error'/'failed').
   * @returns {DataListItem}
   */
  static createGroup({ children, childTypeId = null, count, error, id, label, metadata, status }) {
    const childCount = Array.isArray(children) ? children.length : 0;
    return new DataListItem({
      children,
      childTypeId,
      count: count !== undefined ? count : childCount,
      domoObject: null,
      error,
      id,
      isVirtualParent: true,
      label,
      metadata: metadata || `${childCount} item${childCount !== 1 ? 's' : ''}`,
      status,
      typeId: null,
      url: null
    });
  }

  /**
   * Create a DataListItem from a DomoObject
   * @param {DomoObject} domoObject - The DomoObject to create an item from
   * @param {Object} [options] - Additional options
   * @param {string} [options.label] - Override the label (defaults to domoObject.metadata.name)
   * @param {DataListItem[]} [options.children] - Optional children
   * @param {number} [options.count] - Optional count override
   * @param {string} [options.countLabel] - Optional label for count display (e.g., 'cards')
   * @returns {DataListItem}
   */
  static fromDomoObject(domoObject, options = {}) {
    const { children, count, countLabel, label } = options;

    return new DataListItem({
      children,
      count: count !== undefined ? count : children?.length,
      countLabel,
      domoObject,
      id: domoObject.id,
      isVirtualParent: false,
      label: label || domoObject.metadata?.name || `${domoObject.typeName} ${domoObject.id}`,
      metadata: `ID: ${domoObject.id}`,
      typeId: domoObject.typeId,
      url: domoObject.url
    });
  }

  /**
   * Deserialize from plain object
   * @param {Object} data - Plain object representation
   * @returns {DataListItem}
   */
  static fromJSON(data) {
    if (!data) return null;

    return new DataListItem({
      annotation: data.annotation || null,
      children: data.children?.map((child) => DataListItem.fromJSON(child)),
      childTypeId: data.childTypeId ?? null,
      count: data.count,
      countLabel: data.countLabel || null,
      domoObject: data.domoObject ? DomoObject.fromJSON(data.domoObject) : null,
      error: data.error || null,
      errorDetail: data.errorDetail ?? null,
      id: data.id,
      isVirtualParent: data.isVirtualParent || false,
      label: data.label,
      metadata: data.metadata,
      muted: data.muted || false,
      originalId: data.originalId,
      status: data.status,
      typeId: data.typeId,
      unshareable: data.unshareable || false,
      url: data.url
    });
  }

  /**
   * Get the child count
   * @returns {number}
   */
  getChildCount() {
    return this.children?.length || 0;
  }

  /**
   * Check if this item has children
   * @returns {boolean}
   */
  hasChildren() {
    return this.children && this.children.length > 0;
  }

  /**
   * Serialize to plain object for message passing or storage
   * @returns {Object}
   */
  toJSON() {
    return {
      annotation: this.annotation,
      children: this.children?.map((child) => (child instanceof DataListItem ? child.toJSON() : child)),
      childTypeId: this.childTypeId,
      count: this.count,
      countLabel: this.countLabel,
      domoObject: this.domoObject?.toJSON() || null,
      error: this.error,
      errorDetail: this.errorDetail,
      id: this.id,
      isVirtualParent: this.isVirtualParent,
      label: this.label,
      metadata: this.metadata,
      muted: this.muted,
      originalId: this.originalId,
      status: this.status,
      typeId: this.typeId,
      unshareable: this.unshareable,
      url: this.url
    };
  }
}
