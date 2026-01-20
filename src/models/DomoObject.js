import { getObjectType } from '@/models';
import { getAppStudioPageParent, getDrillParentCardId } from '@/services';
import { executeInPage } from '@/utils';

/**
 * DomoObject class represents an instance of a Domo object
 */
export class DomoObject {
  /**
   * @param {string} type - The object type identifier
   * @param {string} id - The object ID
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {Object} [metadata] - Optional metadata about the object
   */
  constructor(type, id, baseUrl, metadata = {}) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.metadata = metadata;
    this.objectType = getObjectType(type);

    if (!this.objectType) {
      throw new Error(`Unknown object type: ${type}`);
    }

    // Build and cache the URL only if the type has a navigable URL and doesn't require a parent
    // For types requiring a parent, the URL will be built asynchronously when needed
    if (!this.objectType.hasUrl()) {
      // For types without URLs, we can't navigate
      this.url = null;
    } else if (this.requiresParentForUrl()) {
      // For types requiring a parent, don't build URL yet (it's async)
      this.url = null;
    } else {
      // For simple types, build URL synchronously
      this.url = this.objectType.buildObjectUrl(baseUrl, id);
    }
  }

  /**
   * Get the human-readable type name
   * @returns {string} The type name
   */
  get typeName() {
    return this.objectType.name;
  }

  /**
   * Get the human-readable type name
   * @returns {string} The type name
   */
  get typeId() {
    return this.objectType.id;
  }

  /**
   * Check if this object's ID is valid for its type
   * @returns {boolean} Whether the ID is valid
   */
  isValidObjectId() {
    return this.objectType.isValidObjectId(this.id);
  }

  /**
   * Check if this object type requires a parent ID for URL construction
   * @returns {boolean} Whether a parent ID is required for URL construction
   */
  requiresParentForUrl() {
    return this.objectType.requiresParentForUrl();
  }

  /**
   * Check if this object type requires a parent ID for API calls
   * @returns {boolean} Whether a parent ID is required for API calls
   */
  requiresParentForApi() {
    return this.objectType.requiresParentForApi();
  }

  /**
   * Check if this object type has a navigable URL
   * @returns {boolean} Whether the object type has a URL
   */
  hasUrl() {
    return this.objectType.hasUrl();
  }

  /**
   * Get the parent ID for this object and enrich metadata with parent details
   * @param {boolean} [inPageContext=false] - Whether already in page context (skip executeInPage)
   * @returns {Promise<string>} The parent ID
   * @throws {Error} If the parent cannot be fetched or is not supported
   */
  async getParent(inPageContext = false) {
    let parentId;

    switch (this.objectType.id) {
      case 'DATA_APP_VIEW':
        parentId = await getAppStudioPageParent(this.id, inPageContext);
        break;
      case 'DRILL_PATH':
        parentId = await getDrillParentCardId(this.id, inPageContext);
        break;
      default:
        throw new Error(
          `Parent lookup not supported for type: ${this.objectType.id}`
        );
    }

    // Fetch parent details and store in metadata
    if (
      parentId &&
      this.objectType.parents &&
      this.objectType.parents.length > 0
    ) {
      const parentTypeId = this.objectType.parents[0]; // Use first parent type
      const parentType = getObjectType(parentTypeId);
      const parentTypeName = parentType ? parentType.name : parentTypeId;

      if (parentType && parentType.api) {
        try {
          // Fetch parent details using its API configuration
          const { method, endpoint, pathToName } = parentType.api;

          const fetchParentDetails = async (
            endpoint,
            method,
            pathToName,
            parentId,
            parentTypeId,
            parentTypeName
          ) => {
            const url = `/api${endpoint}`.replace('{id}', parentId);
            const options = {
              method,
              credentials: 'include'
            };

            const response = await fetch(url, options);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            const name = pathToName
              .split('.')
              .reduce((current, prop) => current?.[prop], data);

            return {
              id: parentId,
              objectType: {
                id: parentTypeId,
                name: parentTypeName
              },
              name: name,
              details: data
            };
          };

          // If already in page context, execute directly; otherwise use executeInPage
          const parentDetails = inPageContext
            ? await fetchParentDetails(
                endpoint,
                method,
                pathToName,
                parentId,
                parentTypeId,
                parentTypeName
              )
            : await executeInPage(fetchParentDetails, [
                endpoint,
                method,
                pathToName,
                parentId,
                parentTypeId,
                parentTypeName
              ]);

          // Store parent details in metadata
          this.metadata.parent = parentDetails;
          console.log('Enriched parent metadata:', parentDetails);
        } catch (error) {
          console.error('Error fetching parent details:', error);
          // Still return the parentId even if we can't fetch details
        }
      }
    }

    return parentId;
  }

  /**
   * Get the parent ID for this object using a specific tab ID
   * @param {number} tabId - The Chrome tab ID to execute the lookup in
   * @returns {Promise<string>} The parent ID
   * @throws {Error} If the parent cannot be fetched or is not supported
   */
  async getParentWithTabId(tabId) {
    let parentId;

    switch (this.objectType.id) {
      case 'DATA_APP_VIEW':
        parentId = await getAppStudioPageParent(this.id, false, tabId);
        break;
      case 'DRILL_PATH':
        parentId = await getDrillParentCardId(this.id, false, tabId);
        break;
      default:
        throw new Error(
          `Parent lookup not supported for type: ${this.objectType.id}`
        );
    }

    return parentId;
  }

  /**
   * Build the full URL for this object
   * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
   * @param {number} [tabId] - Optional Chrome tab ID for parent lookups
   * @returns {Promise<string>} The full URL
   */
  async buildUrl(baseUrl, tabId = null) {
    if (this.requiresParentForUrl()) {
      const parentId = tabId
        ? await this.getParentWithTabId(tabId)
        : await this.getParent();
      console.log(
        `Building URL for ${this.typeName} ${this.id} with parent ${parentId}`
      );
      return this.objectType.buildObjectUrl(baseUrl, this.id, parentId);
    }
    return this.objectType.buildObjectUrl(baseUrl, this.id);
  }

  /**
   * Navigate to this object in a Chrome tab
   * @returns {Promise<void>}
   */
  async navigateTo() {
    if (!this.hasUrl()) {
      throw new Error(
        `Cannot navigate to ${this.objectType.name}: this object type does not have a navigable URL`
      );
    }
    const url = this.url || (await this.buildUrl(this.baseUrl));
    await chrome.tabs.create({ url });
  }

  /**
   * Serialize to plain object for message passing
   * @returns {Object}
   */
  toJSON() {
    return {
      id: this.id,
      baseUrl: this.baseUrl,
      metadata: this.metadata,
      url: this.url,
      objectType: {
        id: this.objectType.id,
        name: this.objectType.name,
        urlPath: this.objectType.urlPath,
        parents: this.objectType.parents
      }
    };
  }

  /**
   * Deserialize from plain object to DomoObject instance
   * @param {Object} data - Plain object representation
   * @returns {DomoObject}
   */
  static fromJSON(data) {
    if (!data) return null;

    // Create instance using the objectType.id
    const instance = new DomoObject(
      data.objectType.id,
      data.id,
      data.baseUrl,
      data.metadata || {}
    );

    // Restore the URL if it was already built
    if (data.url !== undefined) {
      instance.url = data.url;
    }

    return instance;
  }
}
