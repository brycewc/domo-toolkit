import { getObjectType } from '@/models';
import { getAppStudioPageParent, getDrillParentCardId } from '@/services';

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

		// Build and cache the URL only if the type has a navigable URL
		if (!this.objectType.hasUrl()) {
			// For types without URLs, we can't navigate
			this.url = null;
		} else if (this.requiresParent()) {
			// For types requiring parent, url will be set asynchronously
			this.url = null;
		} else {
			this.url = this.objectType.buildObjectUrl(baseUrl, this.id);
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
	 * Check if this object type requires a parent ID
	 * @returns {boolean} Whether a parent ID is required
	 */
	requiresParent() {
		return this.objectType.requiresParent();
	}

	/**
	 * Check if this object type has a navigable URL
	 * @returns {boolean} Whether the object type has a URL
	 */
	hasUrl() {
		return this.objectType.hasUrl();
	}

	/**
	 * Get the parent ID for this object
	 * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
	 * @returns {Promise<string>} The parent ID
	 * @throws {Error} If the parent cannot be fetched or is not supported
	 */
	async getParent(baseUrl) {
		switch (this.objectType.id) {
			case 'DATA_APP_VIEW':
				return await getAppStudioPageParent(this.id, baseUrl);
			case 'DRILL_PATH':
				return await getDrillParentCardId(this.id, baseUrl);
			default:
				throw new Error(
					`Parent lookup not supported for type: ${this.objectType.type}`
				);
		}
	}

	/**
	 * Build the full URL for this object
	 * @param {string} baseUrl - The base URL (e.g., https://instance.domo.com)
	 * @returns {Promise<string>} The full URL
	 */
	async buildUrl(baseUrl) {
		if (this.requiresParent()) {
			const parentId = await this.getParent(baseUrl);
			return this.objectType.buildObjectUrl(baseUrl, this.id, parentId);
		}
		return this.objectType.buildObjectUrl(baseUrl, this.id);
	}

	/**
	 * Navigate to this object in a Chrome tab
	 * @param {number} tabId - The Chrome tab ID
	 * @returns {Promise<void>}
	 */
	async navigateTo(tabId) {
		if (!this.hasUrl()) {
			throw new Error(
				`Cannot navigate to ${this.objectType.name}: this object type does not have a navigable URL`
			);
		}
		const url = this.url || (await this.buildUrl(this.baseUrl));
		await chrome.tabs.update(tabId, { url });
	}
}
