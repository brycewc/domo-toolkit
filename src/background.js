// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
	console.log('Extension installed:', details);

	// Set default configurations
	chrome.storage.local.get(null, (result) => {
		const defaultConfigs = {
			'Activity Log': {
				activityLogCardId: 2019620443,
				activityLogObjectIdColumnName: 'Object ID',
				activityLogObjectTypeColumnName: 'Object Type ID'
			}
		};

		// Only set defaults if no existing configuration
		for (const [bookmarkletName, config] of Object.entries(defaultConfigs)) {
			if (!result[bookmarkletName]) {
				chrome.storage.local.set({ [bookmarkletName]: config });
			}
		}
	});
});

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'executeScript') {
		// Execute script in the main world context to bypass CSP
		chrome.scripting
			.executeScript({
				target: { tabId: sender.tab.id },
				world: 'MAIN',
				func: executeBookmarkletScript,
				args: [request.script]
			})
			.then(() => {
				sendResponse({ success: true });
			})
			.catch((error) => {
				console.error('Script execution failed:', error);
				sendResponse({ success: false, error: error.message });
			});
		return true; // Keep message channel open for async response
	}
	return false;
});

// Function to execute bookmarklet script (injected into main world context)
function executeBookmarkletScript(script) {
	try {
		// Remove 'javascript:' prefix if present
		if (script.startsWith('javascript:')) {
			script = script.substring(11);
		}

		// Execute the script using eval in main world context
		eval(script);
	} catch (error) {
		console.error('Bookmarklet execution error:', error);
		alert('Error executing script: ' + error.message);
	}
}
