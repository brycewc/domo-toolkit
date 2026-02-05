/**
 * Execute a function in ALL frames in the page context (MAIN world)
 * Used to access filter state in nested iframes (like Domo embedded apps)
 * @param {Function} func - The function to execute in page context
 * @param {Array} args - Arguments to pass to the function
 * @param {number} tabId - Optional specific tab ID. If not provided, uses active tab in current window
 * @returns {Promise<Array>} - Array of results from all frames that returned valid data
 */
export async function executeInAllFrames(func, args = [], tabId = null) {
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

    // Execute function in ALL frames in the page context
    const results = await chrome.scripting.executeScript({
      target: { tabId: targetTabId, allFrames: true },
      world: 'MAIN',
      func,
      args
    });

    // Collect all valid results from frames
    const validResults = [];
    if (results && Array.isArray(results)) {
      results.forEach((frameResult) => {
        if (frameResult && frameResult.result !== undefined && frameResult.result !== null) {
          // For array results, only include non-empty arrays
          if (Array.isArray(frameResult.result)) {
            if (frameResult.result.length > 0) {
              validResults.push(...frameResult.result);
            }
          } else {
            validResults.push(frameResult.result);
          }
        }
      });
    }

    return validResults;
  } catch (error) {
    console.error('Error executing script in all frames:', error);
    return [];
  }
}

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
