/**
 * Get the current Domo instance from storage
 * @returns {Promise<string|null>} The current instance name (e.g., 'mycompany') or null if not on a Domo page
 */
export async function getCurrentInstance() {
	const result = await chrome.storage.local.get(['currentDomoInstance']);
	return result.currentDomoInstance || null;
}

/**
 * Listen for changes to the current instance
 * @param {Function} callback - Callback function that receives the new instance name
 * @returns {Function} Cleanup function to remove the listener
 */
export function onCurrentInstanceChange(callback) {
	const listener = (changes, areaName) => {
		if (areaName === 'local' && changes.currentDomoInstance) {
			callback(changes.currentDomoInstance.newValue);
		}
	};

	chrome.storage.onChanged.addListener(listener);

	// Return cleanup function
	return () => {
		chrome.storage.onChanged.removeListener(listener);
	};
}
