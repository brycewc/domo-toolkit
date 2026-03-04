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
   * @param {DataListItem[]} [config.children] - Optional nested child items
   * @param {boolean} [config.isVirtualParent] - Whether this is a grouping/virtual parent node
   * @param {DomoObject} [config.domoObject] - Optional DomoObject instance for richer functionality
   */
  constructor({
    id,
    label,
    url = null,
    typeId = null,
    metadata = null,
    count = undefined,
    children = undefined,
    isVirtualParent = false,
    domoObject = null
  }) {
    this.id = id;
    this.label = label;
    this.url = url;
    this.typeId = typeId;
    this.metadata = metadata;
    this.count = count;
    this.children = children;
    this.isVirtualParent = isVirtualParent;
    this.domoObject = domoObject;
  }

  /**
   * Check if this item has children
   * @returns {boolean}
   */
  hasChildren() {
    return this.children && this.children.length > 0;
  }

  /**
   * Get the child count
   * @returns {number}
   */
  getChildCount() {
    return this.children?.length || 0;
  }

  /**
   * Create a DataListItem from a DomoObject
   * @param {DomoObject} domoObject - The DomoObject to create an item from
   * @param {Object} [options] - Additional options
   * @param {string} [options.label] - Override the label (defaults to domoObject.metadata.name)
   * @param {DataListItem[]} [options.children] - Optional children
   * @param {number} [options.count] - Optional count override
   * @returns {DataListItem}
   */
  static fromDomoObject(domoObject, options = {}) {
    const { label, children, count } = options;

    return new DataListItem({
      id: domoObject.id,
      label: label || domoObject.metadata?.name || `${domoObject.typeName} ${domoObject.id}`,
      url: domoObject.url,
      typeId: domoObject.typeId,
      metadata: `ID: ${domoObject.id}`,
      count: count !== undefined ? count : children?.length,
      children,
      isVirtualParent: false,
      domoObject
    });
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
  static createGroup({ id, label, children, metadata }) {
    return new DataListItem({
      id,
      label,
      url: null,
      typeId: null,
      metadata: metadata || `${children.length} item${children.length !== 1 ? 's' : ''}`,
      count: children.length,
      children,
      isVirtualParent: true,
      domoObject: null
    });
  }

  /**
   * Serialize to plain object for message passing or storage
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      label: this.label,
      url: this.url,
      typeId: this.typeId,
      metadata: this.metadata,
      count: this.count,
      children: this.children?.map((child) =>
        child instanceof DataListItem ? child.toJSON() : child
      ),
      isVirtualParent: this.isVirtualParent,
      domoObject: this.domoObject?.toJSON() || null
    };
  }

  /**
   * Deserialize from plain object
   * @param {Object} data - Plain object representation
   * @returns {DataListItem}
   */
  static fromJSON(data) {
    if (!data) return null;

    return new DataListItem({
      id: data.id,
      label: data.label,
      url: data.url,
      typeId: data.typeId,
      metadata: data.metadata,
      count: data.count,
      children: data.children?.map((child) => DataListItem.fromJSON(child)),
      isVirtualParent: data.isVirtualParent || false,
      domoObject: data.domoObject ? DomoObject.fromJSON(data.domoObject) : null
    });
  }
}
