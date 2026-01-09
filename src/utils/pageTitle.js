import { getCurrentObject } from './currentObject';

/**
 * Updates the page title to include the current object name if the title is just "Domo"
 * @param {Object} currentObject - The current object from storage with metadata
 */
export async function updatePageTitle(currentObject) {
	// Only update if the current title is exactly "Domo"
	if (document.title === 'Domo' && currentObject?.metadata?.name) {
		document.title = `${currentObject.metadata.name} - Domo`;
	}
}

/**
 * Sets up a MutationObserver to watch for title changes and update them if needed
 */
export function watchPageTitle() {
	// Create observer to watch for title changes
	const titleObserver = new MutationObserver(async () => {
		if (document.title === 'Domo') {
			// Get the current object from storage
			const currentObject = await getCurrentObject();

			if (currentObject?.metadata?.name) {
				document.title = `${currentObject.metadata.name} - Domo`;
			}
		}
	});

	// Observe the title element
	const titleElement = document.querySelector('title');
	if (titleElement) {
		titleObserver.observe(titleElement, {
			childList: true,
			characterData: true,
			subtree: true
		});
	}

	// Return cleanup function
	return () => titleObserver.disconnect();
}
