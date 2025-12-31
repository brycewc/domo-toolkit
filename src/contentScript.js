import { detectObjectType } from './utils/detectObjectType';
import { detectCardModal } from './utils/detectCardModal';
import { applyFaviconRules, applyInstanceLogoAuto } from './utils/faviconModifier';

// console.log('Majordomo Toolkit content script loaded');

// Track current domain to detect domain changes
let currentDomain = location.hostname;

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

// Detect and send object type on page load
function detectAndSendObjectType() {
	const domoObject = detectObjectType();

	if (domoObject) {
		console.log('Detected Domo object:', domoObject);

		// Send to background script
		// chrome.runtime.sendMessage({
		// 	action: 'objectTypeDetected',
		// 	objectType: domoObject.objectType,

		// 	objectId: domoObject.id,
		// 	url: location.href
		// });

		// Store in chrome.storage for quick access
		chrome.storage.local.set({
			currentObject: domoObject
		});
	} else {
		console.log('No Domo object detected on this page');
		// Clear stored object type
		chrome.storage.local.set({
			currentObject: {
				id: null,
				type: null,
				typeName: null,
				url: null,
				detectedAt: null
			}
		});
	}
}

// Detect on initial load
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', detectAndSendObjectType);
} else {
	detectAndSendObjectType();
}

// Re-detect when URL changes (for SPAs)
let objectUrl = location.href;
let lastDetectedCardId = null;

const urlCheckInterval = setInterval(() => {
	if (location.href !== objectUrl) {
		objectUrl = location.href;
		console.log('URL changed, re-detecting object type');
		detectAndSendObjectType();
	}
}, 1000);

// Watch for card modal changes
function checkCardModal() {
	const kpiId = detectCardModal();

	// If card modal is open and ID changed or newly appeared
	if (kpiId && kpiId !== lastDetectedCardId) {
		console.log('Card modal detected/changed, re-detecting object type');
		lastDetectedCardId = kpiId;
		detectAndSendObjectType();
	} else if (!kpiId && lastDetectedCardId) {
		// Modal was closed
		console.log('Card modal closed, re-detecting object type');
		lastDetectedCardId = null;
		detectAndSendObjectType();
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
		detectAndSendObjectType();
		const domoObject = detectObjectType();
		sendResponse(domoObject);
	}
	return true;
});
