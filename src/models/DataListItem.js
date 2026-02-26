import { DomoObject } from './DomoObject';

/**
 * DataListItem class represents an item in the DataList component.
 * Provides a consistent structure for list items across different features
 * (pages, datasets, etc.) with optional DomoObject reference.
 */
export class DataListItem {
  /**
   * @param {Object} config - Configuration object
   * @param {string|number} config.id - Unique identifier for the item
   * @param {string} config.label - Display label for the item
   * @param {string} [config.url] - Optional URL for navigation
   * @param {string} [config.typeId] - Object type identifier (e.g., 'PAGE', 'DATA_APP_VIEW')
   * @param {string} [config.metadata] - Optional metadata string for display (e.g., "ID: 123")
   * @param {number} [config.count] - Optional count for children or related items
   * @param {string} [config.countLabel] - Optional label for count display (e.g., 'cards', 'pages')
   * @param {DataListItem[]} [config.children] - Optional nested child items
   * @param {boolean} [config.isVirtualParent] - Whether this is a grouping/virtual parent node
   * @param {DomoObject} [config.domoObject] - Optional DomoObject instance for richer functionality
   */
  constructor({
    children = undefined,
    count = undefined,
    countLabel = null,
    domoObject = null,
    id,
    isVirtualParent = false,
    label,
    metadata = null,
    typeId = null,
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
    this.isVirtualParent = isVirtualParent;
    this.domoObject = domoObject;
  }

  /**
   * Create a virtual parent item (grouping header)
   * @param {Object} config - Configuration object
   * @param {string} config.id - Unique identifier for the group
   * @param {string} config.label - Display label for the group
   * @param {DataListItem[]} config.children - Child items in this group
   * @param {string} [config.metadata] - Optional metadata (defaults to child count description)
   * @returns {DataListItem}
   */
  static createGroup({ children, id, label, metadata }) {
    return new DataListItem({
      children,
      count: children.length,
      domoObject: null,
      id,
      isVirtualParent: true,
      label,
      metadata: metadata || `${children.length} item${children.length !== 1 ? 's' : ''}`,
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
      children: data.children?.map((child) => DataListItem.fromJSON(child)),
      count: data.count,
      countLabel: data.countLabel || null,
      domoObject: data.domoObject ? DomoObject.fromJSON(data.domoObject) : null,
      id: data.id,
      isVirtualParent: data.isVirtualParent || false,
      label: data.label,
      metadata: data.metadata,
      typeId: data.typeId,
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
      children: this.children?.map((child) =>
        child instanceof DataListItem ? child.toJSON() : child
      ),
      count: this.count,
      countLabel: this.countLabel,
      domoObject: this.domoObject?.toJSON() || null,
      id: this.id,
      isVirtualParent: this.isVirtualParent,
      label: this.label,
      metadata: this.metadata,
      typeId: this.typeId,
      url: this.url
    };
  }
}
