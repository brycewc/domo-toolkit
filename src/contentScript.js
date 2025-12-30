import { detectObjectType } from './utils/detectObjectType';
import { detectCardModal } from './utils/detectCardModal';

console.log('Majordomo Toolkit content script loaded');

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
