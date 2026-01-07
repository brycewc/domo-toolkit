/**
 * Execute a function in the page context (MAIN world) to access page resources
 * like Domo's authentication cookies
 * @param {Function} func - The function to execute in page context
 * @param {Array} args - Arguments to pass to the function
 * @returns {Promise<any>} - The result from the executed function
 */
export async function executeInPage(func, args = []) {
	try {
		// Get active tab to execute in Domo context
		const [tab] = await chrome.tabs.query({
			active: true,
			currentWindow: true
		});

		if (!tab || !tab.url || !tab.url.includes('domo.com')) {
			throw new Error('Not on a Domo page');
		}

		// Execute function in the page context
		const result = await chrome.scripting.executeScript({
			target: { tabId: tab.id },
			world: 'MAIN',
			func,
			args
		});

		if (result && result[0] && result[0].result !== undefined) {
			return result[0].result;
		}

		throw new Error('No result from script execution');
	} catch (error) {
		console.error('Error executing script in page context:', error);
		throw error;
	}
}
