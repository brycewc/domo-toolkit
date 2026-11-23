import { getDrillParentCardId } from '@/services/cards';
import { getDataflowForOutputDataset } from '@/services/dataflows';
import { getSingleSourceDatasetId } from '@/services/datasets';
import { getGovernanceToolkitJobApplicationId } from '@/services/governanceToolkit';
import { getAppStudioPageParent, getPageParentPageId } from '@/services/pages';
import { executeInPage } from '@/utils/executeInPage';

import { fetchObjectDetailsInPage, getObjectType } from './DomoObjectType';

/**
 * DomoObject class represents an instance of a Domo object
 */
export class DomoObject {
  /**
   * Get the human-readable type name
   * @returns {string} The type name
   */
  get typeId() {
    return this.objectType.id;
  }

  /**
   * Get the human-readable type name
   * @returns {string} The type name
   */
  get typeName() {
    return this.objectType.name;
  }

  /**
   * @param {string} type - The object type identifier
   * @param {string} id - The object ID
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {Object} [metadata] - Optional metadata about the object
   * @param {string} [originalUrl] - Optional original URL for parent extraction
   * @param {DomoObject|{id: string, typeId?: string, metadata?: Object, parent?: Object}} [parent] - The parent,
   *   if already known. `typeId` may be left out for a type with a single parent type.
   */
  constructor(type, id, baseUrl, metadata = {}, originalUrl = null, parent = null) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.metadata = metadata;
    this.originalUrl = originalUrl;
    this.objectType = getObjectType(type);

    if (!this.objectType) {
      throw new Error(`Unknown object type: ${type}`);
    }

    this.parent = this.toParentObject(parent ?? this.objectType.resolveParentFromData(this));
    this.url = this.buildSyncUrl();
  }

  /**
   * Deserialize from plain object to DomoObject instance
   * @param {Object} data - Plain object representation
   * @returns {DomoObject}
   */
  static fromJSON(data) {
    if (!data) return null;

    const instance = new DomoObject(
      data.objectType?.id ?? data.typeId,
      data.id,
      data.baseUrl,
      data.metadata || {},
      data.originalUrl || null,
      data.parent ? DomoObject.fromJSON(data.parent) : null
    );

    if (data.url !== undefined) {
      instance.url = data.url;
    }

    return instance;
  }

  // Falls back to `originalUrl` when a placeholder stays unfilled.
  buildSyncUrl() {
    if (!this.objectType.hasUrl()) return null;
    if (this.requiresParentForUrl() && !this.parent) return null;

    let builtUrl = this.objectType.buildObjectUrl(this.baseUrl, this.id, this.parent, this.metadata);
    if (builtUrl.includes('{') && this.originalUrl) {
      for (const [key, value] of Object.entries(this.objectType.extractUrlParams(this.originalUrl))) {
        if (value) builtUrl = builtUrl.replace(`{${key}}`, value);
      }
    }
    return builtUrl.includes('{') ? (this.originalUrl ?? null) : builtUrl;
  }

  /**
   * Build the full URL for this object
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {number} [tabId] - Optional Chrome tab ID for parent lookups
   * @returns {Promise<string>} The full URL
   */
  async buildUrl(baseUrl, tabId = null) {
    const parent = this.requiresParentForUrl() ? await this.getParent({ tabId }) : this.parent;
    if (this.requiresParentForUrl() && !parent && !this.objectType.hasParentlessUrl()) {
      throw new Error(`Parent is required for ${this.typeId} ${this.id} and could not be resolved`);
    }
    return this.objectType.buildObjectUrl(baseUrl, this.id, parent, this.metadata);
  }

  // Tries the URL, then this object's own data (loading its details if missing), then the parent fetcher.
  async getParent({ tabId = null, url = null } = {}) {
    if (this.parent) return this.parent;
    if (!this.objectType.parent) return null;

    let resolved = this.objectType.extractParent(url || this.originalUrl) || this.objectType.resolveParentFromData(this);

    if (!resolved && !this.metadata?.details && this.objectType.hasApiConfig() && !this.objectType.requiresParentForApi()) {
      const metadata = await executeInPage(
        fetchObjectDetailsInPage,
        [{ apiConfig: this.objectType.api, objectId: this.id, throwOnError: false, typeId: this.typeId }],
        tabId
      );
      if (metadata?.details) {
        this.metadata = { ...this.metadata, ...metadata };
        resolved = this.objectType.resolveParentFromData(this);
      }
    }

    if (!resolved) {
      for (const entry of this.objectType.resolveCandidateParentTypes(this)) {
        const fetcher = entry.fetcher ? PARENT_FETCHERS[entry.fetcher] : null;
        if (!fetcher) continue;
        const id = await fetcher(this, tabId);
        if (id != null && id !== '') {
          resolved = { id: String(id), typeId: entry.typeId };
          break;
        }
      }
    }

    this.parent = this.toParentObject(resolved);
    if (this.parent && !this.url) this.url = this.buildSyncUrl();
    return this.parent;
  }

  /**
   * Check if this object type has a navigable URL
   * @returns {boolean} Whether the object type has a URL
   */
  hasUrl() {
    return this.objectType.hasUrl();
  }

  /**
   * Check if this object's ID is valid for its type
   * @returns {boolean} Whether the ID is valid
   */
  isValidObjectId() {
    return this.objectType.isValidObjectId(this.id);
  }

  async loadMetadata(tabId = null) {
    if (!this.objectType.hasApiConfig()) return null;
    const requiresParent = this.objectType.requiresParentForApi();
    const parent = requiresParent ? await this.getParent({ tabId }) : this.parent;
    const metadata = await executeInPage(
      fetchObjectDetailsInPage,
      [
        {
          apiConfig: this.objectType.api,
          objectId: this.id,
          parentId: parent?.id ?? null,
          requiresParent,
          throwOnError: false,
          typeId: this.typeId
        }
      ],
      tabId
    );
    if (!metadata?.details) return null;
    this.metadata = { ...this.metadata, ...metadata };
    return metadata;
  }

  /**
   * Navigate to this object in a Chrome tab
   * @returns {Promise<void>}
   */
  async navigateTo(tabId = null) {
    if (!this.hasUrl()) {
      throw new Error(`Cannot navigate to ${this.objectType.name}: this object type does not have a navigable URL`);
    }
    const url = this.url || (await this.buildUrl(this.baseUrl, tabId));
    // A placeholder the type couldn't fill comes back literally, and opening it
    // would land the user on a nonsense URL.
    if (url.includes('{')) {
      throw new Error(`Cannot navigate to ${this.objectType.name}: its URL could not be resolved`);
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /**
   * Check if this object type requires a parent ID for API calls
   * @returns {boolean} Whether a parent ID is required for API calls
   */
  requiresParentForApi() {
    return this.objectType.requiresParentForApi();
  }

  /**
   * Check if this object type requires a parent ID for URL construction
   * @returns {boolean} Whether a parent ID is required for URL construction
   */
  requiresParentForUrl() {
    return this.objectType.requiresParentForUrl();
  }

  /**
   * Serialize to plain object for message passing
   * @returns {Object}
   */
  toJSON() {
    return {
      baseUrl: this.baseUrl,
      id: this.id,
      metadata: this.metadata,
      objectType: {
        id: this.objectType.id,
        name: this.objectType.name
      },
      originalUrl: this.originalUrl,
      parent: this.parent?.toJSON() ?? null,
      typeId: this.objectType.id,
      typeName: this.objectType.name,
      url: this.url
    };
  }

  toParentObject(parent) {
    if (!parent) return null;
    if (parent instanceof DomoObject) return parent;
    if (parent.id == null || parent.id === '') return null;
    const typeIds = this.objectType.parentTypeIds;
    const typeId = parent.typeId ?? (typeIds.length === 1 ? typeIds[0] : null);
    if (!typeId || !getObjectType(typeId)) {
      console.warn(`[DomoObject] Dropped a parent of unknown type for ${this.typeId} ${this.id}`);
      return null;
    }
    return new DomoObject(typeId, String(parent.id), this.baseUrl, parent.metadata || {}, null, parent.parent ?? null);
  }
}

const PARENT_FETCHERS = {
  appStudioPageParent: (domoObject, tabId) => getAppStudioPageParent(domoObject.id, false, tabId),
  dataflowForOutput: (domoObject, tabId) => getDataflowForOutputDataset(domoObject.id, tabId),
  drillParentCard: (domoObject, tabId) => getDrillParentCardId(domoObject.id, false, tabId),
  governanceToolkitApplication: (domoObject, tabId) => getGovernanceToolkitJobApplicationId(domoObject.id, false, tabId),
  pageParentPage: (domoObject, tabId) => getPageParentPageId(domoObject.id, tabId),
  singleSourceDataset: (domoObject, tabId) => getSingleSourceDatasetId(domoObject.id, tabId)
};
