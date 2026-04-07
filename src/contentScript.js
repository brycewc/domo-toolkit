import {
  applyFaviconRules,
  applyInstanceLogoAuto
} from './faviconModifier';

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

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'PING') {
    sendResponse({ alive: true });
    return;
  } else if (message.type === 'APPLY_FAVICON') {
    applyFavicon();
    sendResponse({ success: true });
    return true;
  } else if (message.type === 'TAB_CONTEXT_UPDATED') {
    // Reset workflow action tracking so next click triggers fresh detection
    lastSelectedActionNodeId = null;
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

// NOTE: URL change detection and instance tracking are handled by service worker
// Modal/overlay detection requires DOM access, so we handle it here via MutationObserver.
// Each detector is a config object; the shared observer iterates them on every mutation batch.

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

// Handle a detected card modal: extract ID and trigger redetection
function handleCardModalDetected() {
  const cardId = extractCardIdFromModal();
  if (cardId) {
    if (cardId !== lastDetectedCardId) {
      lastDetectedCardId = cardId;
      triggerContextRedetection();
    }
  } else {
    // Modal class found but ID not set yet (React may set it asynchronously).
    // Retry after a short delay to give the framework time to render the ID.
    setTimeout(() => {
      const retryId = extractCardIdFromModal();
      if (retryId && retryId !== lastDetectedCardId) {
        lastDetectedCardId = retryId;
        triggerContextRedetection();
      }
    }, 200);
  }
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

// ============================================================
// Code Engine version selector change detection
// ============================================================

let lastDetectedCEVersion = null;

function checkCEVersionChange() {
  const container = document.querySelector(
    'div[class*="module_packageControls"]'
  );
  const input = container?.querySelector(
    'input[class*="SelectListInputComponent"]'
  );
  const currentValue = input?.value || null;
  if (currentValue && currentValue !== lastDetectedCEVersion) {
    lastDetectedCEVersion = currentValue;
    triggerContextRedetection();
  }
}

if (location.pathname.includes('codeEngine') || location.pathname.includes('codeengine')) {
  // Listen for clicks on the version dropdown to detect version changes.
  // Use capture phase and delay to let React update the input value.
  document.addEventListener(
    'click',
    () => {
      setTimeout(checkCEVersionChange, 300);
    },
    true
  );
}

// ============================================================
// Workflow action selection detection
// ============================================================

// Track last selected workflow action node to avoid redundant detections
let lastSelectedActionNodeId = null;

// Listen for clicks to detect workflow action selection changes.
// Use capture phase so the event fires even if React Flow stops propagation.
document.addEventListener(
  'click',
  () => {
    if (!location.pathname.includes('workflows/models/')) return;

    // Wait for React to update selection state after the click
    requestAnimationFrame(() => {
      const selectedNode = document.querySelector(
        '.react-flow__node.selected'
      );
      const selectedNodeId = selectedNode?.getAttribute('data-id') || null;

      if (selectedNodeId !== lastSelectedActionNodeId) {
        lastSelectedActionNodeId = selectedNodeId;
        triggerContextRedetection();
      }
    });
  },
  true
);

// ============================================================
// Admin list view selection detection
// ============================================================

let lastAdminDetailTitle = null;

if (location.pathname.startsWith('/admin/')) {
  document.addEventListener(
    'click',
    () => {
      // Use setTimeout to allow Angular's digest cycle to update the detail panel
      setTimeout(() => {
        const titleEl = document.querySelector(
          '.bulk-item-details-title'
        );
        const currentTitle = titleEl?.innerText?.trim() || null;

        if (currentTitle !== lastAdminDetailTitle) {
          lastAdminDetailTitle = currentTitle;
          triggerContextRedetection();
        }
      }, 200);
    },
    true
  );
}

// ============================================================
// Declarative modal/overlay detection framework
// ============================================================

/**
 * Factory for simple boolean-presence detectors.
 * Tracks whether the element is in the DOM and triggers redetection on transitions.
 */
function createSimpleDetector({ selector, urlGuard }) {
  let isPresent = false;
  return {
    onDetected() {
      if (!isPresent) {
        isPresent = true;
        triggerContextRedetection();
      }
    },
    onLoadCheck() {
      if (document.querySelector(selector)) {
        isPresent = true;
        triggerContextRedetection();
      }
    },
    onRemoved() {
      if (isPresent) {
        isPresent = false;
        triggerContextRedetection();
      }
    },
    selector,
    urlGuard
  };
}

/**
 * Registry of modal/overlay detectors.
 * Each entry needs: selector, onDetected(), onRemoved(), onLoadCheck().
 * Optional urlGuard string restricts the detector to pages whose pathname includes it.
 * Use createSimpleDetector() for elements that only need boolean presence tracking.
 */
const MODAL_DETECTORS = [
  // Card detail modal — custom logic for ID extraction with retry
  {
    onDetected() {
      handleCardModalDetected();
    },
    onLoadCheck() {
      if (document.querySelector('.card-details-modal')) {
        handleCardModalDetected();
      }
    },
    onRemoved() {
      lastDetectedCardId = null;
      triggerContextRedetection();
    },
    selector: '.card-details-modal'
  },

  // Governance Toolkit job overview panel
  createSimpleDetector({
    selector: '[class*="job-overview-top"]',
    urlGuard: 'governance-toolkit'
  }),

  // Admin list detail panel — custom logic for title-based dedup
  {
    onDetected() {
      const titleEl = document.querySelector('.bulk-item-details-title');
      const currentTitle = titleEl?.innerText?.trim() || null;
      if (currentTitle !== lastAdminDetailTitle) {
        lastAdminDetailTitle = currentTitle;
        triggerContextRedetection();
      }
    },
    onLoadCheck() {
      if (document.querySelector('.bulk-item-details-content')) {
        lastAdminDetailTitle =
          document.querySelector('.bulk-item-details-title')
            ?.innerText?.trim() || null;
        triggerContextRedetection();
      }
    },
    onRemoved() {
      lastAdminDetailTitle = null;
      triggerContextRedetection();
    },
    selector: '.bulk-item-details-content',
    urlGuard: '/admin/',
    urlGuardMethod: 'startsWith'
  },

  // Workflow trigger timer modal
  createSimpleDetector({
    selector: '[role="dialog"][class*="TimerModal"]',
    urlGuard: 'workflows/triggers/'
  }),

  // Code Engine version selector — triggers redetection when the selector
  // first appears (handles late rendering after initial page detection)
  {
    onDetected() {
      checkCEVersionChange();
    },
    onLoadCheck() {
      if (
        document.querySelector(
          'div[class*="module_packageControls"]'
        )
      ) {
        checkCEVersionChange();
      }
    },
    onRemoved() {
      lastDetectedCEVersion = null;
    },
    selector: 'div[class*="module_packageControls"]',
    urlGuard: 'codeEngine'
  }
];

function matchesUrlGuard(detector) {
  if (!detector.urlGuard) return true;
  const method = detector.urlGuardMethod || 'includes';
  return location.pathname[method](detector.urlGuard);
}

function nodeMatchesSelector(node, selector) {
  return node.matches?.(selector) || !!node.querySelector?.(selector);
}

// Unified MutationObserver callback
const modalObserver = new MutationObserver((mutations) => {
  for (const detector of MODAL_DETECTORS) {
    if (!matchesUrlGuard(detector)) continue;

    let handled = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue;

      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (nodeMatchesSelector(node, detector.selector)) {
          detector.onDetected();
          handled = true;
          break;
        }
      }
      if (handled) break;

      for (const node of mutation.removedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (nodeMatchesSelector(node, detector.selector)) {
          detector.onRemoved();
          handled = true;
          break;
        }
      }
      if (handled) break;
    }
  }
});

modalObserver.observe(document.body, {
  childList: true,
  subtree: true
});

// Run on-load checks for all detectors (handles extension reload with modal/panel open)
for (const detector of MODAL_DETECTORS) {
  if (matchesUrlGuard(detector)) {
    detector.onLoadCheck();
  }
}

// ============================================================
// Card error capture
// ============================================================

// Inject MAIN world script that intercepts card API errors.
(function injectCardErrorCapture() {
  if (document.getElementById('domo-toolkit-card-errors-script')) return;

  const script = document.createElement('script');
  script.id = 'domo-toolkit-card-errors-script';
  script.src = chrome.runtime.getURL('public/cardErrors.js');
  document.documentElement.appendChild(script);
})();

// Relay card errors from MAIN world script to background service worker
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'domo-toolkit-card-error') return;

  chrome.runtime
    .sendMessage({
      error: event.data.error,
      type: 'CARD_ERROR_DETECTED'
    })
    .catch(() => {});
});
