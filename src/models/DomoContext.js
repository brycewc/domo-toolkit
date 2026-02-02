import { DomoObject } from './DomoObject';
import { EXCLUDED_HOSTNAMES } from '@/utils/constants';

/**
 * DomoContext - Represents the complete context of a Domo tab
 * Includes the tab ID, URL, instance information, and optionally the detected object
 */
export class DomoContext {
  /**
   * @param {number} tabId - The Chrome tab ID
   * @param {string} url - The full URL of the tab
   * @param {DomoObject} [domoObject] - The detected Domo object (optional)
   * @param {chrome.tabs.Tab} [tab] - The Chrome tab object (optional)
   */
  constructor(tabId, url, domoObject = null, tab = null) {
    this.tabId = tabId;
    this.url = url;
    this.tab = tab;

    // Extract instance from URL and determine if this is a valid Domo page
    try {
      const hostname = new URL(url).hostname;
      this.instance = hostname.includes('.domo.com')
        ? hostname.replace('.domo.com', '')
        : null;

      // Check if this is a valid Domo page (not excluded)
      this.isDomoPage =
        hostname.includes('.domo.com') &&
        !EXCLUDED_HOSTNAMES.includes(hostname);
    } catch (error) {
      console.error('Error extracting instance from URL:', error);
      this.instance = null;
      this.isDomoPage = false;
    }

    this.domoObject = domoObject;

    // Fetch tab object if not provided but tabId is available
    if (
      !this.tab &&
      this.tabId &&
      typeof chrome !== 'undefined' &&
      chrome.tabs
    ) {
      chrome.tabs
        .get(this.tabId)
        .then((fetchedTab) => {
          this.tab = fetchedTab;
        })
        .catch((error) => {
          console.error('Error fetching tab object:', error);
        });
    }
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
      isDomoPage: this.isDomoPage,
      tab: this.tab || null,
      domoObject: this.domoObject
        ? {
            id: this.domoObject.id,
            baseUrl: this.domoObject.baseUrl,
            metadata: this.domoObject.metadata,
            url: this.domoObject.url,
            originalUrl: this.domoObject.originalUrl,
            parentId: this.domoObject.parentId,
            typeId: this.domoObject.typeId,
            typeName: this.domoObject.typeName,
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

    const context = new DomoContext(
      data.tabId,
      data.url,
      domoObject,
      data.tab || null
    );

    // Override isDomoPage if it was explicitly set in the serialized data
    if (data.hasOwnProperty('isDomoPage')) {
      context.isDomoPage = data.isDomoPage;
    }

    return context;
  }
}
