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
		// Set default favicon rule if none exists
		if (!result.faviconRules || result.faviconRules.length === 0) {
			const defaultFaviconRule = [
				{
					id: Date.now(),
					pattern: '.*',
					effect: 'instance-logo',
					color: '#000000'
				}
			];
			chrome.storage.sync.set({ faviconRules: defaultFaviconRule });
		}
	});
});
