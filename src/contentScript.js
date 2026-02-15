import { DomoContext } from '@/models';
import {
  EXCLUDED_HOSTNAMES,
  applyFaviconRules,
  applyInstanceLogoAuto
} from '@/utils';

// Apply favicon rules - called by service worker
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

// Store current tab context
let currentTabContext = null;

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'APPLY_FAVICON') {
    applyFavicon();
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TAB_CONTEXT_UPDATED') {
    // console.log(
    //   '[ContentScript] Received tab context update:',
    //   message.context
    // );
    currentTabContext = DomoContext.fromJSON(message.context);
    // Update title when context is received
    sendResponse({ success: true });
    return true;
  }
});

// Apply favicon on initial load
(async () => {
  // console.log('[ContentScript] Initialized, applying favicon');
  await applyFavicon();

  // Title will be updated when we receive tab context from background
})();

// Track last known clipboard value to detect changes
let lastKnownClipboard = '';

// Helper function to check and cache clipboard
async function checkAndCacheClipboard() {
  try {
    const clipboardText = await navigator.clipboard.readText();
    // console.log('[ContentScript] Read clipboard text:', clipboardText);
    const trimmedText = clipboardText.trim();

    // Validate that clipboard contains a valid Domo object ID
    // Check if it looks like a Domo object ID (numeric including negative, or UUID)
    const isNumeric = /^-?\d+$/.test(trimmedText);
    const isUuid =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        trimmedText
      );

    if (!isNumeric && !isUuid) {
      // console.log(
      //   '[ContentScript] Clipboard does not contain a valid Domo object ID:',
      //   trimmedText
      // );
      // If the previous clipboard was a Domo ID, clear it
      if (lastKnownClipboard) {
        lastKnownClipboard = '';
        chrome.runtime
          .sendMessage({
            type: 'CLIPBOARD_COPIED',
            clipboardData: ''
          })
          .catch(() => {});
      }
      return null;
    }

    // Only send if clipboard has changed
    if (trimmedText !== lastKnownClipboard) {
      lastKnownClipboard = trimmedText;

      // Send to background script to cache
      chrome.runtime
        .sendMessage({
          type: 'CLIPBOARD_COPIED',
          clipboardData: trimmedText
        })
        .catch((err) => {
          console.log('[ContentScript] Error sending clipboard data:', err);
        });
    }
  } catch (error) {
    // Clipboard read might fail, that's okay
    console.log('[ContentScript] Could not read clipboard:', error);
  }
}

// Listen for copy events to cache clipboard contents
document.addEventListener('copy', async () => {
  // Wait a brief moment for clipboard to be populated
  setTimeout(async () => {
    await checkAndCacheClipboard();
  }, 100);
});

// Listen for window focus to detect when user returns to tab
// This handles the case where user copied from another application
window.addEventListener('focus', async () => {
  // console.log(
  //   '[ContentScript] Window gained focus, checking clipboard and tab title'
  // );
  await checkAndCacheClipboard();
});

// NOTE: URL change detection and instance tracking are handled by service worker
// Card modal detection requires DOM access, so we handle it here

// Track last detected card modal ID to avoid redundant detections
let lastDetectedCardId = null;

// Extract card ID from modal element ID (format: card-details-modal-{cardId})
function extractCardIdFromModal() {
  const modalElement = document.querySelector('[id^="card-details-modal-"]');
  if (modalElement && modalElement.id) {
    const match = modalElement.id.match(/card-details-modal-(\d+)/);
    if (match && match[1]) {
      return match[1];
    }
  }
  return null;
}

// Send message to service worker to trigger context re-detection
function triggerContextRedetection() {
  chrome.runtime
    .sendMessage({
      type: 'DETECT_CONTEXT'
    })
    .catch((error) => {
      console.error(
        '[ContentScript] Error triggering context re-detection:',
        error
      );
    });
}

// Watch for card modal element being added or removed
function checkForCardModalElement(mutations) {
  for (const mutation of mutations) {
    if (mutation.type === 'childList') {
      // Check for added nodes
      if (mutation.addedNodes.length > 0) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // Check if this is the modal element or contains it
            let modalElement = null;
            if (
              node.classList &&
              node.classList.contains('card-details-modal')
            ) {
              modalElement = node;
            } else if (node.querySelector) {
              modalElement = node.querySelector('.card-details-modal');
            }

            if (modalElement) {
              const cardId = extractCardIdFromModal();
              if (cardId && cardId !== lastDetectedCardId) {
                // console.log(
                //   '[ContentScript] Card modal detected with ID:',
                //   cardId
                // );
                lastDetectedCardId = cardId;
                triggerContextRedetection();
              }
              return;
            }
          }
        }
      }

      // Check for removed nodes
      if (mutation.removedNodes.length > 0) {
        for (const node of mutation.removedNodes) {
          if (node.nodeType === Node.ELEMENT_NODE) {
            let wasModal = false;
            if (
              node.classList &&
              node.classList.contains('card-details-modal')
            ) {
              wasModal = true;
            } else if (node.querySelector) {
              const modalElement = node.querySelector('.card-details-modal');
              if (modalElement) {
                wasModal = true;
              }
            }

            if (wasModal) {
              // console.log(
              //   '[ContentScript] Card modal element removed from DOM'
              // );
              if (lastDetectedCardId) {
                lastDetectedCardId = null;
                triggerContextRedetection();
              }
              return;
            }
          }
        }
      }
    }
  }
}

// Set up MutationObserver to watch for modal changes
const modalObserver = new MutationObserver((mutations) => {
  checkForCardModalElement(mutations);
});

// Start observing the document for modal changes
modalObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// ============================================================
// Card error capture
// ============================================================

// Inject MAIN world script that intercepts card API errors and displays them inline.
// Only injected when the cardErrorDetection setting is enabled (default: on).
(async function injectCardErrorCapture() {
  const result = await chrome.storage.sync.get(['cardErrorDetection']);
  if (result.cardErrorDetection === false) return;

  if (document.getElementById('domo-toolkit-card-errors-script')) return;

  const script = document.createElement('script');
  script.id = 'domo-toolkit-card-errors-script';
  script.src = chrome.runtime.getURL('public/cardErrors.js');
  document.documentElement.appendChild(script);
})();

// ============================================================
// Stream execution detailed errors
// ============================================================

// Inject MAIN world script that enriches expanded error rows with detailed API data.
// Loaded as an external file to comply with the page's Content Security Policy.
function injectStreamErrorEnricher() {
  if (document.getElementById('domo-toolkit-stream-errors-script')) return;

  const script = document.createElement('script');
  script.id = 'domo-toolkit-stream-errors-script';
  script.src = chrome.runtime.getURL('public/streamErrors.js');
  document.documentElement.appendChild(script);
}

// Watch for .dc-repair-table to appear, then inject the MAIN world script
if (document.querySelector('.dc-repair-table')) {
  injectStreamErrorEnricher();
} else {
  const streamErrorTableObserver = new MutationObserver(() => {
    if (document.querySelector('.dc-repair-table')) {
      injectStreamErrorEnricher();
      streamErrorTableObserver.disconnect();
    }
  });

  streamErrorTableObserver.observe(document.body, {
    childList: true,
    subtree: true
  });
}
