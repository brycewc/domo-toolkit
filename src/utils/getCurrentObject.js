import { DomoObject } from '@/models/DomoObject';

/**
 * Retrieves the current object from Chrome storage and converts it to a DomoObject instance
 * @returns {Promise<DomoObject|null>} DomoObject instance or null if no object is stored
 */
export async function getCurrentObject() {
	chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
		if (tabs[0]?.id && tabs[0]?.url) {
			// Check if current page is a Domo instance
			try {
				const url = new URL(tabs[0].url);
				setIsDomoPage(url.hostname.includes('domo.com'));
			} catch (error) {
				setIsDomoPage(false);
			}

			chrome.tabs.sendMessage(
				tabs[0].id,
				{ action: 'getObjectType' },
				(response) => {
					// Response will be received, but storage change listener will handle the update
					if (chrome.runtime.lastError) {
						// Content script might not be loaded on this page (e.g., chrome:// pages)
						console.log(
							'Could not detect object type:',
							chrome.runtime.lastError.message
						);
					}
				}
			);
		}
	});

	return new Promise((resolve) => {
		chrome.storage.local.get(['currentObject'], (result) => {
			const storedObject = result.currentObject;

			if (!storedObject || !storedObject.objectType || !storedObject.id) {
				resolve(null);
				return;
			}

			// If it's already a DomoObject instance (has methods), return it
			if (storedObject instanceof DomoObject) {
				resolve(storedObject);
				return;
			}

			// Convert plain object to DomoObject instance
			try {
				const baseUrl =
					storedObject.baseUrl || storedObject.url
						? new URL(storedObject.url).origin
						: null;

				if (!baseUrl) {
					console.warn('No baseUrl found in stored object');
					resolve(null);
					return;
				}

				const domoObject = new DomoObject(
					storedObject.objectType.id,
					storedObject.id,
					baseUrl,
					storedObject.metadata || {}
				);

				resolve(domoObject);
			} catch (error) {
				console.error('Error converting stored object to DomoObject:', error);
				resolve(null);
			}
		});
	});
}

/**
 * Listens for changes to currentObject in Chrome storage and calls the callback with a DomoObject instance
 * @param {function(DomoObject|null): void} callback - Function to call when currentObject changes
 * @returns {function(): void} Cleanup function to remove the listener
 */
export function onCurrentObjectChange(callback) {
	const handleStorageChange = async (changes, areaName) => {
		if (areaName === 'local' && changes.currentObject) {
			const newValue = changes.currentObject.newValue;

			if (!newValue || !newValue.objectType || !newValue.id) {
				callback(null);
				return;
			}

			// If it's already a DomoObject instance, use it
			if (newValue instanceof DomoObject) {
				callback(newValue);
				return;
			}

			// Convert plain object to DomoObject instance
			try {
				const baseUrl =
					newValue.baseUrl || newValue.url
						? new URL(newValue.url).origin
						: null;

				if (!baseUrl) {
					console.warn('No baseUrl found in updated object');
					callback(null);
					return;
				}

				const domoObject = new DomoObject(
					newValue.objectType.id,
					newValue.id,
					baseUrl,
					newValue.metadata || {}
				);

				callback(domoObject);
			} catch (error) {
				console.error('Error converting updated object to DomoObject:', error);
				callback(null);
			}
		}
	};

	chrome.storage.onChanged.addListener(handleStorageChange);

	// Return cleanup function
	return () => {
		chrome.storage.onChanged.removeListener(handleStorageChange);
	};
}
