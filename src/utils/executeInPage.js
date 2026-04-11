import { isDomoUrl } from './constants';

/**
 * Execute a function in ALL frames in the page context (MAIN world)
 * Used to access filter state in nested iframes (like Domo embedded apps)
 * @param {Function} func - The function to execute in page context
 * @param {Array} args - Arguments to pass to the function
 * @param {number} tabId - Optional specific tab ID. If not provided, uses active tab in current window
 * @returns {Promise<Array>} - Array of results from all frames that returned valid data
 */
export async function executeInAllFrames(func, args = [], tabId = null) {
  // Dev mode: call function directly — Vite proxy handles API routing
  if (import.meta.env.DEV && !globalThis.chrome?.scripting) {
    const result = await func(...args);
    if (result == null) return [];
    return Array.isArray(result) ? result : [result];
  }

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
    if (!tab.url || !isDomoUrl(tab.url)) {
      throw new Error('Not on a Domo page');
    }

    const allFramesTarget = { allFrames: true, tabId: targetTabId };
    const mainFrameTarget = { tabId: targetTabId };

    // Mark extension-initiated requests so apiErrors.js bypasses interception.
    // Only target the main frame — apiErrors.js only runs there, and using
    // allFrames can fail if an iframe is restricted, leaking the counter.
    await chrome.scripting.executeScript({
      func: () => {
        window.__domoToolkitExtDepth =
          (window.__domoToolkitExtDepth || 0) + 1;
      },
      target: mainFrameTarget,
      world: 'MAIN'
    });

    try {
      // Execute function in ALL frames in the page context
      const results = await chrome.scripting.executeScript({
        args,
        func,
        target: allFramesTarget,
        world: 'MAIN'
      });

      // Collect all valid results from frames
      const validResults = [];
      if (results && Array.isArray(results)) {
        results.forEach((frameResult) => {
          if (
            frameResult &&
            frameResult.result !== undefined &&
            frameResult.result !== null
          ) {
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
    } finally {
      try {
        await chrome.scripting.executeScript({
          func: () => {
            window.__domoToolkitExtDepth = Math.max(
              0,
              (window.__domoToolkitExtDepth || 0) - 1
            );
          },
          target: mainFrameTarget,
          world: 'MAIN'
        });
      } catch {
        // Decrement failed (tab closed/navigated) — not recoverable
      }
    }
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
  // Dev mode: call function directly — Vite proxy handles API routing
  if (import.meta.env.DEV && !globalThis.chrome?.scripting) {
    return func(...args);
  }

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
    if (!tab.url || !isDomoUrl(tab.url)) {
      throw new Error('Not on a Domo page');
    }

    const target = { tabId: targetTabId };

    // Mark extension-initiated requests so apiErrors.js bypasses interception
    await chrome.scripting.executeScript({
      func: () => {
        window.__domoToolkitExtDepth =
          (window.__domoToolkitExtDepth || 0) + 1;
      },
      target,
      world: 'MAIN'
    });

    try {
      // Execute function in the page context
      const result = await chrome.scripting.executeScript({
        args,
        func,
        target,
        world: 'MAIN'
      });

      if (result && result[0] && result[0].result !== undefined) {
        return result[0].result;
      }

      throw new Error('No result from script execution');
    } finally {
      try {
        await chrome.scripting.executeScript({
          func: () => {
            window.__domoToolkitExtDepth = Math.max(
              0,
              (window.__domoToolkitExtDepth || 0) - 1
            );
          },
          target,
          world: 'MAIN'
        });
      } catch {
        // Decrement failed (tab closed/navigated) — not recoverable
      }
    }
  } catch (error) {
    console.error('Error executing script in page context:', error);
    throw error;
  }
}
