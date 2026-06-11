import { EXCLUDED_HOSTNAMES } from '@/utils/constants';

import { DomoObject } from './DomoObject';

/**
 * DomoContext - Represents the complete context of a Domo tab
 * Includes the tab ID, URL, instance information, and optionally the detected object
 */
export class DomoContext {
  /**
   * @param {number} tabId - The Chrome tab ID
   * @param {string} url - The full URL of the tab
   * @param {DomoObject} [domoObject] - The detected Domo object (optional)
   * @param {{id: number, metadata: Object}} [user] - The current user (optional)
   */
  constructor(tabId, url, domoObject = null, user = null) {
    this.tabId = tabId;
    this.url = url;

    // Extract instance from URL and determine if this is a valid Domo page
    try {
      const hostname = new URL(url).hostname;
      this.instance = hostname.endsWith('.domo.com') ? hostname.replace('.domo.com', '') : null;

      // Check if this is a valid Domo page (not excluded)
      this.isDomoPage = hostname.endsWith('.domo.com') && !EXCLUDED_HOSTNAMES.includes(hostname);
    } catch (error) {
      console.error('Error extracting instance from URL:', error);
      this.instance = null;
      this.isDomoPage = false;
    }

    this.domoObject = domoObject;
    this.user = user;
    this.userGroups = null;
    this.featureSwitches = null;
  }

  /**
   * Deserialize from plain object
   * @param {Object} data - Plain object representation
   * @returns {DomoContext}
   */
  static fromJSON(data) {
    // Use DomoObject.fromJSON to properly reconstruct the DomoObject instance
    const domoObject = data.domoObject ? DomoObject.fromJSON(data.domoObject) : null;

    const context = new DomoContext(data.tabId, data.url, domoObject, data.user || null);

    context.userGroups = data.userGroups || null;
    context.featureSwitches = data.featureSwitches || null;

    // Override isDomoPage if it was explicitly set in the serialized data
    if (Object.prototype.hasOwnProperty.call(data, 'isDomoPage')) {
      context.isDomoPage = data.isDomoPage;
    }

    return context;
  }

  /**
   * Serialize to plain object for storage or message passing
   * @returns {Object}
   */
  toJSON() {
    return {
      domoObject: this.domoObject
        ? {
            baseUrl: this.domoObject.baseUrl,
            id: this.domoObject.id,
            metadata: this.domoObject.metadata,
            objectType: {
              id: this.domoObject.objectType.id,
              name: this.domoObject.objectType.name,
              parents: this.domoObject.objectType.parents,
              urlPath: this.domoObject.objectType.urlPath
            },
            originalUrl: this.domoObject.originalUrl,
            parentId: this.domoObject.parentId,
            typeId: this.domoObject.typeId,
            typeName: this.domoObject.typeName,
            url: this.domoObject.url
          }
        : null,
      featureSwitches: this.featureSwitches || null,
      instance: this.instance,
      isDomoPage: this.isDomoPage,
      tabId: this.tabId,
      url: this.url,
      user: this.user || null,
      userGroups: this.userGroups || null
    };
  }

  /**
   * Serialization for the background's per-tab context backup, which caches up
   * to MAX_CACHED_TABS tabs and blew the 10 MB chrome.storage.session quota.
   * Where toJSON copies metadata wholesale, this allowlists it: only the keys
   * built below survive, so a new metadata slot (like the enrichment payload
   * that lived in `metadata.context`) stays out of the backup until it is
   * deliberately added here. Restored contexts rebuild dropped data on the
   * next detection.
   *
   * Within the allowlist, two more cuts:
   *
   *   - `metadata.details.properties`: a dataset's full Beast Mode formula dump
   *     from `?includeAllDetails=true`, often hundreds of KB. Read only from the
   *     live (messaged) context, never a restored one, so it's safe to omit.
   *   - `user` / `userGroups` / `featureSwitches`: identical for every tab on
   *     the same instance (the background already caches them per instance).
   *     The backup duplicated them per tab; restoreFromSession rehydrates them
   *     from the instance-level cache.
   *
   * `details` itself stays whole (the footer renders its fields wholesale), so
   * persistToSession adds a size backstop on top of this: an entry still over
   * budget is stored without `details` at all.
   *
   * NOTE: only for the background backup. The sidepanel's getSidepanelData record
   * keeps the heavy fields (CopyColorRules needs properties, Ownership needs
   * user), so that path uses toJSON, not this.
   *
   * @returns {Object}
   */
  toStorageJSON() {
    const json = this.toJSON();
    const metadata = json.domoObject?.metadata;
    if (metadata && typeof metadata === 'object') {
      const slimMetadata = {
        details: metadata.details,
        isOwner: metadata.isOwner,
        name: metadata.name,
        parent: metadata.parent,
        parentId: metadata.parentId,
        permission: metadata.permission
      };
      const details = slimMetadata.details;
      if (details && typeof details === 'object' && Object.prototype.hasOwnProperty.call(details, 'properties')) {
        const { properties: _omitProperties, ...slimDetails } = details;
        slimMetadata.details = slimDetails;
      }
      json.domoObject.metadata = slimMetadata;
    }
    json.user = null;
    json.userGroups = null;
    json.featureSwitches = null;
    return json;
  }
}
