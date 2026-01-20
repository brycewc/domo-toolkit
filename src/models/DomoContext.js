import { DomoObject } from '@/models';

/**
 * DomoContext - Represents the complete context of a Domo tab
 * Includes the tab ID, URL, instance information, and optionally the detected object
 */
export class DomoContext {
  /**
   * @param {number} tabId - The Chrome tab ID
   * @param {string} url - The full URL of the tab
   * @param {DomoObject} [domoObject] - The detected Domo object (optional)
   */
  constructor(tabId, url, domoObject = null) {
    this.tabId = tabId;
    this.url = url;

    // Extract instance from URL
    try {
      const hostname = new URL(url).hostname;
      this.instance = hostname.includes('.domo.com')
        ? hostname.replace('.domo.com', '')
        : null;
    } catch (error) {
      console.error('Error extracting instance from URL:', error);
      this.instance = null;
    }

    this.domoObject = domoObject;
  }

  /**
   * Serialize to plain object for storage or message passing
   * @returns {Object}
   */
  toJSON() {
    return {
      tabId: this.tabId,
      url: this.url,
      instance: this.instance,
      domoObject: this.domoObject
        ? {
            id: this.domoObject.id,
            baseUrl: this.domoObject.baseUrl,
            metadata: this.domoObject.metadata,
            url: this.domoObject.url,
            objectType: {
              id: this.domoObject.objectType.id,
              name: this.domoObject.objectType.name,
              urlPath: this.domoObject.objectType.urlPath,
              parents: this.domoObject.objectType.parents
            }
          }
        : null
    };
  }

  /**
   * Deserialize from plain object
   * @param {Object} data - Plain object representation
   * @returns {DomoContext}
   */
  static fromJSON(data) {
    // Use DomoObject.fromJSON to properly reconstruct the DomoObject instance
    const domoObject = data.domoObject
      ? DomoObject.fromJSON(data.domoObject)
      : null;

    return new DomoContext(data.tabId, data.url, domoObject);
  }
}
