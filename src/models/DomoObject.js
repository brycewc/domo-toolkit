import { getObjectType } from './DomoObjectType';
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
   * @param {string} [originalUrl] - Optional original URL for parent extraction
   * @param {string} [parentId] - Optional parent ID if already known
   */
  constructor(
    type,
    id,
    baseUrl,
    metadata = {},
    originalUrl = null,
    parentId = null
  ) {
    this.id = id;
    this.baseUrl = baseUrl;
    this.metadata = metadata;
    this.originalUrl = originalUrl; // Store for parent extraction
    this.parentId = parentId; // Store parent ID if already known
    this.objectType = getObjectType(type);

    if (!this.objectType) {
      throw new Error(`Unknown object type: ${type}`);
    }

    // Build and cache the URL
    if (!this.objectType.hasUrl()) {
      // For types without URLs, we can't navigate
      this.url = null;
    } else if (this.requiresParentForUrl()) {
      // For types requiring a parent, build URL if we have the parent ID
      if (parentId) {
        this.url = `${baseUrl}${this.objectType.urlPath.replace('{parent}', parentId).replace('{id}', id)}`;
      } else {
        // Don't build URL yet (it's async)
        this.url = null;
      }
    } else {
      // For simple types, build URL synchronously
      this.url = `${baseUrl}${this.objectType.urlPath.replace('{id}', id)}`;
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
   * @param {string} [url=null] - Optional URL to extract parent ID from (overrides this.originalUrl)
   * @param {number} [tabId=null] - Optional Chrome tab ID for executing in-page lookups
   * @returns {Promise<string>} The parent ID
   * @throws {Error} If the parent cannot be fetched or is not supported
   */
  async getParent(inPageContext = false, url = null, tabId = null) {
    let parentId;

    // First check if we already have the parent ID stored
    if (this.parentId) {
      parentId = this.parentId;
    } else {
      // Try to extract parent ID from URL if available
      const urlToUse = url || this.originalUrl;
      if (urlToUse) {
        parentId = this.objectType.extractParentId(urlToUse);
      }

      // Fall back to API lookup if URL extraction didn't work
      if (!parentId) {
        switch (this.objectType.id) {
          case 'DATA_APP_VIEW':
            parentId = await getAppStudioPageParent(this.id, inPageContext, tabId);
            break;
          case 'DRILL_PATH':
            parentId = await getDrillParentCardId(this.id, inPageContext, tabId);
            break;
          default:
            throw new Error(
              `Parent lookup not supported for type: ${this.objectType.id}`
            );
        }
      }
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

      console.log(
        `[getParent] parentType=${parentTypeId}, hasApi=${!!parentType?.api}, method=${parentType?.api?.method}, hasBodyTemplate=${!!parentType?.api?.bodyTemplate}`
      );
      if (parentType && parentType.api) {
        try {
          // Fetch parent details using its API configuration
          const {
            method,
            endpoint,
            pathToName,
            nameTemplate = null,
            pathToDetails = null,
            bodyTemplate = null
          } = parentType.api;

          console.log(
            `[getParent] Fetching parent details: method=${method}, endpoint=${endpoint}, parentId=${parentId}, inPageContext=${inPageContext}, tabId=${tabId}`
          );

          const fetchParentDetails = async (
            endpoint,
            method,
            pathToName,
            nameTemplate,
            pathToDetails,
            bodyTemplate,
            parentId,
            parentTypeId,
            parentTypeName
          ) => {
            const url = `/api${endpoint}`.replace('{id}', parentId);
            const options = {
              method,
              credentials: 'include'
            };

            if (method !== 'GET' && bodyTemplate) {
              options.body = JSON.stringify(bodyTemplate).replace(
                /{id}/g,
                parentId
              );
              options.headers = {
                'Content-Type': 'application/json'
              };
            }

            console.log(`[getParent:fetchParentDetails] Fetching ${method} ${url}, hasBody=${!!options.body}`);

            const response = await fetch(url, options);

            console.log(`[getParent:fetchParentDetails] Response status: ${response.status}`);

            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            console.log(`[getParent:fetchParentDetails] Response data keys:`, Object.keys(data));

            const details = pathToDetails
              ? pathToDetails
                  .split('.')
                  .reduce((current, prop) => current?.[prop], data)
              : data;
            const resolvePath = (path) =>
              path.split('.').reduce((current, prop) => current?.[prop], data);
            const name = nameTemplate
              ? nameTemplate.replace(/{([^}]+)}/g, (_, path) =>
                  path === 'id' ? parentId : resolvePath(path) ?? ''
                )
              : resolvePath(pathToName);

            console.log(`[getParent:fetchParentDetails] Extracted name=${name}, hasDetails=${!!details}`);

            return {
              id: parentId,
              objectType: {
                id: parentTypeId,
                name: parentTypeName
              },
              name: name,
              details: details
            };
          };

          // If already in page context, execute directly; otherwise use executeInPage
          const parentDetails = inPageContext
            ? await fetchParentDetails(
                endpoint,
                method,
                pathToName,
                nameTemplate,
                pathToDetails,
                bodyTemplate,
                parentId,
                parentTypeId,
                parentTypeName
              )
            : await executeInPage(
                fetchParentDetails,
                [
                  endpoint,
                  method,
                  pathToName,
                  nameTemplate,
                  pathToDetails,
                  bodyTemplate,
                  parentId,
                  parentTypeId,
                  parentTypeName
                ],
                tabId
              );

          // Store parent details in metadata
          this.metadata.parent = parentDetails;
          console.log('[getParent] Successfully set parent:', parentDetails);
        } catch (error) {
          console.error('[getParent] Error fetching parent details:', error);
          // Still return the parentId even if we can't fetch details
        }
      }
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
      const parentId = await this.getParent(false, null, tabId);
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
  async navigateTo(tabId = null) {
    if (!this.hasUrl()) {
      throw new Error(
        `Cannot navigate to ${this.objectType.name}: this object type does not have a navigable URL`
      );
    }
    const url = this.url || (await this.buildUrl(this.baseUrl, tabId));
    window.open(url, '_blank', 'noopener,noreferrer');
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
      originalUrl: this.originalUrl,
      parentId: this.parentId,
      typeId: this.objectType.id,
      typeName: this.objectType.name,
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

    // Create instance using the objectType.id, including originalUrl and parentId
    const instance = new DomoObject(
      data.objectType.id,
      data.id,
      data.baseUrl,
      data.metadata || {},
      data.originalUrl || null,
      data.parentId || null
    );

    // Restore the URL if it was already built
    if (data.url !== undefined) {
      instance.url = data.url;
    }

    return instance;
  }
}
