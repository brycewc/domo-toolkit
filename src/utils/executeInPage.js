/**
 * Execute a function in the page context (MAIN world) to access page resources
 * like Domo's authentication cookies
 * @param {Function} func - The function to execute in page context
 * @param {Array} args - Arguments to pass to the function
 * @param {number} tabId - Optional specific tab ID. If not provided, uses active tab in current window
 * @returns {Promise<any>} - The result from the executed function
 */
export async function executeInPage(func, args = [], tabId = null) {
  try {
    let targetTabId = tabId;

    // If no tabId provided, get active tab
    if (!targetTabId) {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });

      if (!tab) {
        throw new Error('No active tab found');
      }

      targetTabId = tab.id;
    }

    // Verify the tab is on a Domo page
    const tab = await chrome.tabs.get(targetTabId);
    if (!tab.url || !tab.url.includes('domo.com')) {
      throw new Error('Not on a Domo page');
    }

    // Execute function in the page context
    const result = await chrome.scripting.executeScript({
      target: { tabId: targetTabId },
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
