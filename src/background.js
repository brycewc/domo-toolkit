// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {
	console.log('Extension installed:', details);

	// Open options page with activity tab on fresh install
	if (details.reason === 'install') {
		// Create a new tab with the activity hash directly
		chrome.tabs.create({
			url: chrome.runtime.getURL('src/options/index.html#activity')
		});
	}

	// Set default configurations
	chrome.storage.sync.get(null, (result) => {
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
				chrome.storage.sync.set({ [bookmarkletName]: config });
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

	// if (request.action === 'objectTypeDetected') {
	// 	// Log detected object type
	// 	console.log('Object detected:', {
	// 		type: request.objectType,
	// 		id: request.objectId,
	// 		url: request.url
	// 	});

	// 	// Store in chrome.storage for access from popup/sidepanel
	// 	chrome.storage.local.set({
	// 		currentObjectType: request.objectType,
	// 		currentObjectId: request.objectId,
	// 		lastDetectedUrl: request.url,
	// 		lastDetectedTime: Date.now()
	// 	});

	// 	return false;
	// }

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
