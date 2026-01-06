import {
	getCurrentObject,
	detectCardModal,
	applyFaviconRules,
	applyInstanceLogoAuto
} from '@/utils';

// Track current domain to detect domain changes
let currentDomain = location.hostname;

// Track visited Domo instances
async function trackDomoInstances() {
	if (location.hostname.includes('domo.com')) {
		// Extract subdomain (e.g., 'mycompany' from 'mycompany.domo.com') as instance
		const instance = location.hostname.replace('.domo.com', '');
		const result = await chrome.storage.sync.get(['visitedDomoInstances']);
		const visited = result.visitedDomoInstances || [];

		// Add instance if not already in list
		if (!visited.includes(instance)) {
			const updated = [...visited, instance].sort();
			await chrome.storage.sync.set({ visitedDomoInstances: updated });
		}

		// Store the current instance
		await chrome.storage.local.set({ currentDomoInstance: instance });
	}
}

// Track instance on page load
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', trackDomoInstances);
} else {
	trackDomoInstances();
}

// Apply favicon rules on page load
async function applyFavicon() {
	try {
		const result = await chrome.storage.sync.get(['faviconRules']);
		if (result.faviconRules && result.faviconRules.length > 0) {
			// If rules are configured, apply them (they take precedence)
			await applyFaviconRules(result.faviconRules);
		} else {
			// If no rules configured, automatically apply instance logo
			await applyInstanceLogoAuto();
		}
	} catch (error) {
		console.error('Error applying favicon rules:', error);
	}
}

// Apply favicon when page loads
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', applyFavicon);
} else {
	applyFavicon();
}

// Listen for storage changes to update favicon when rules change
chrome.storage.onChanged.addListener((changes, areaName) => {
	if (areaName === 'sync' && changes.faviconRules) {
		console.log('Favicon rules changed, reapplying...');
		applyFavicon();
	}
});

// Watch for domain changes (for SPAs or navigation)
function checkDomainChange() {
	if (location.hostname !== currentDomain) {
		currentDomain = location.hostname;
		console.log('Domain changed, applying favicon:', currentDomain);
		applyFavicon();
	}
}

// Check for domain changes periodically (for SPAs)
setInterval(checkDomainChange, 1000);

// Listen for navigation events (when user navigates to a new domain)
window.addEventListener('beforeunload', () => {
	// Reset domain tracking when navigating away
	currentDomain = null;
});

// Also check on popstate (back/forward navigation)
window.addEventListener('popstate', () => {
	checkDomainChange();
});

// Detect and store object type on page load
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', getCurrentObject);
} else {
	getCurrentObject();
}

// Re-detect when URL changes (for SPAs)
let objectUrl = location.href;
let lastDetectedCardId = null;

const urlCheckInterval = setInterval(() => {
	if (location.href !== objectUrl) {
		objectUrl = location.href;
		console.log('URL changed, re-detecting object type');
		getCurrentObject();
	}
}, 1000);

// Watch for card modal changes
function checkCardModal() {
	const kpiId = detectCardModal();

	// If card modal is open and ID changed or newly appeared
	if (kpiId && kpiId !== lastDetectedCardId) {
		console.log('Card modal detected/changed, re-detecting object type');
		lastDetectedCardId = kpiId;
		getCurrentObject();
	} else if (!kpiId && lastDetectedCardId) {
		// Modal was closed
		console.log('Card modal closed, re-detecting object type');
		lastDetectedCardId = null;
		getCurrentObject();
	}
}

// Set up MutationObserver to watch for modal changes
const observer = new MutationObserver((mutations) => {
	// Debounce the check to avoid excessive calls
	clearTimeout(observer.timeoutId);
	observer.timeoutId = setTimeout(checkCardModal, 100);
});

// Start observing the document for modal changes
observer.observe(document.body, {
	childList: true,
	subtree: true,
	attributes: false
});

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'getObjectType') {
		// Re-detect and update when popup requests it
		getCurrentObject().then((domoObject) => {
			sendResponse(domoObject);
		});
		return true; // Keep message channel open for async response
	}
	return true;
});
