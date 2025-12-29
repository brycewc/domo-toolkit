import { detectObjectType } from './utils/detectObjectType';

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
const urlCheckInterval = setInterval(() => {
	if (location.href !== objectUrl) {
		objectUrl = location.href;
		console.log('URL changed, re-detecting object type');
		detectAndSendObjectType();
	}
}, 1000);

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
	if (request.action === 'getObjectType') {
		const domoObject = detectObjectType();
		sendResponse(domoObject);
	}
	return true;
});
