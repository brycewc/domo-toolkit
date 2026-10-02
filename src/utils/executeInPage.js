import { isDomoUrl } from './currentObject';
import { canActOnHost } from './internalInstance';

const evalBlockedOrigins = new Set();

/**
 * Execute a function in ALL frames in the page context (MAIN world)
 * Used to access filter state in nested iframes (like Domo embedded apps)
 * @param {Function} func - The function to execute in page context
 * @param {Array} args - Arguments to pass to the function
 * @param {number} tabId - Optional specific tab ID. If not provided, uses active tab in current window
 * @returns {Promise<Array>} - Array of results from all frames that returned valid data
 */
export async function executeInAllFrames(func, args = [], tabId = null) {
  // Dev mode: call function directly, since the Vite proxy handles API routing
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
    // A local instance additionally requires the opt-in permission. activeTab
    // would otherwise let this run on a local page the user never enabled.
    if (!(await canActOnHost(tab.url))) {
      throw new Error('Local Domo instances are off. Turn them on in the extension options to use the toolkit here.');
    }

    const allFramesTarget = { allFrames: true, tabId: targetTabId };
    const mainFrameTarget = { tabId: targetTabId };

    // Mark extension-initiated requests so apiErrors.js bypasses interception.
    // Only target the main frame: apiErrors.js only runs there, and using
    // allFrames can fail if an iframe is restricted, leaking the counter.
    await chrome.scripting.executeScript({
      func: () => {
        window.__domoToolkitExtDepth = (window.__domoToolkitExtDepth || 0) + 1;
      },
      target: mainFrameTarget,
      world: 'MAIN'
    });

    try {
      const { envelopes, raw } = await injectWithEnvelope(func, args, allFramesTarget, new URL(tab.url).origin);

      const validResults = [];
      for (const { envelope, frameId } of envelopes) {
        let value = envelope;
        if (!raw) {
          if (envelope?.__dtk === 'error') {
            // One frame failing (often a restricted iframe) must not drop the others.
            console.warn(`Script failed in frame ${frameId}:`, toError(envelope));
            continue;
          }
          value = envelope?.value;
        }
        if (value === undefined || value === null) continue;
        if (Array.isArray(value)) {
          validResults.push(...value);
        } else {
          validResults.push(value);
        }
      }

      return validResults;
    } finally {
      try {
        await chrome.scripting.executeScript({
          func: () => {
            window.__domoToolkitExtDepth = Math.max(0, (window.__domoToolkitExtDepth || 0) - 1);
          },
          target: mainFrameTarget,
          world: 'MAIN'
        });
      } catch {
        // Decrement failed (tab closed/navigated), not recoverable
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
  // Dev mode: call function directly, since the Vite proxy handles API routing
  if (import.meta.env.DEV && !globalThis.chrome?.scripting) {
    return func(...args);
  }

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
  // A local instance additionally requires the opt-in permission. activeTab
  // would otherwise let this run on a local page the user never enabled.
  if (!(await canActOnHost(tab.url))) {
    throw new Error('Local Domo instances are off. Turn them on in the extension options to use the toolkit here.');
  }

  const target = { tabId: targetTabId };

  // Mark extension-initiated requests so apiErrors.js bypasses interception
  await chrome.scripting.executeScript({
    func: () => {
      window.__domoToolkitExtDepth = (window.__domoToolkitExtDepth || 0) + 1;
    },
    target,
    world: 'MAIN'
  });

  try {
    const { envelopes, raw } = await injectWithEnvelope(func, args, target, new URL(tab.url).origin);
    const envelope = envelopes[0]?.envelope;

    if (raw) {
      if (envelope !== undefined) return envelope;
      throw new Error('No result from script execution');
    }
    if (envelope?.__dtk === 'ok') return envelope.value;
    if (envelope?.__dtk === 'error') throw toError(envelope);
    // No envelope at all means the injection itself failed before running, for
    // example on a literal NUL byte in the function source.
    throw new Error('No result from script execution');
  } finally {
    try {
      await chrome.scripting.executeScript({
        func: () => {
          window.__domoToolkitExtDepth = Math.max(0, (window.__domoToolkitExtDepth || 0) - 1);
        },
        target,
        world: 'MAIN'
      });
    } catch {
      // Decrement failed (tab closed/navigated), not recoverable
    }
  }
}

// `raw` means the page's CSP forbids eval, so the results are bare return values.
async function injectWithEnvelope(func, args, target, origin) {
  if (!evalBlockedOrigins.has(origin)) {
    const results = await chrome.scripting.executeScript({
      args: [func.toString(), args],
      func: runInPage,
      target,
      world: 'MAIN'
    });
    const blocked = results?.find((frame) => frame?.result?.__dtk === 'evalBlocked');
    if (!blocked) {
      return {
        envelopes: (results || []).map((frame) => ({ envelope: frame?.result ?? null, frameId: frame?.frameId })),
        raw: false
      };
    }
    evalBlockedOrigins.add(origin);
    console.warn(
      `[Domo Toolkit] ${origin} blocks eval (${blocked.result.message}), so errors thrown inside page scripts will read as null results.`
    );
  }

  const results = await chrome.scripting.executeScript({ args, func, target, world: 'MAIN' });
  return {
    envelopes: (results || []).map((frame) => ({ envelope: frame?.result, frameId: frame?.frameId })),
    raw: true
  };
}

// Chrome reports a throw or rejection from an injected function as `{ result: null }`
// with no `error`, so the function runs inside this envelope to carry the outcome back.
async function runInPage(source, args) {
  let fn;
  try {
    fn = (0, eval)(`(${source})`);
  } catch (error) {
    return { __dtk: 'evalBlocked', message: String(error?.message ?? error) };
  }
  try {
    return { __dtk: 'ok', value: await fn(...args) };
  } catch (error) {
    return {
      __dtk: 'error',
      message: String(error?.message ?? error),
      name: error?.name,
      status: error?.status
    };
  }
}

function toError(envelope) {
  const error = new Error(envelope.message || 'Script execution failed');
  if (envelope.name) error.name = envelope.name;
  if (envelope.status != null) error.status = envelope.status;
  return error;
}
