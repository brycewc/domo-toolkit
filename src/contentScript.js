import {
  EXCLUDED_HOSTNAMES,
  getCurrentObject,
  applyFaviconRules,
  applyInstanceLogoAuto,
  watchPageTitle
} from '@/utils';

// Track current domain to detect domain changes
let currentDomain = location.hostname;

// Track visited Domo instances
async function trackDomoInstances() {
  if (
    location.hostname.includes('domo.com') &&
    !EXCLUDED_HOSTNAMES.includes(location.hostname)
  ) {
    // Extract subdomain (e.g., 'mycompany' from 'mycompany.domo.com') as instance
    const instance = location.hostname.replace('.domo.com', '');
    const result = await chrome.storage.sync.get(['visitedDomoInstances']);
    const visited = result.visitedDomoInstances || [];

    // Add instance if not already in list
    if (!visited.includes(instance)) {
      const updated = [...visited, instance].sort();
      await chrome.storage.sync.set({ visitedDomoInstances: updated });
    }

    // Store the current instance
    await chrome.storage.local.set({ currentDomoInstance: instance });
  } else {
    // Not on a Domo domain, clear current instance
    await chrome.storage.local.set({ currentDomoInstance: null });
  }
}

// Track instance on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', trackDomoInstances);
} else {
  trackDomoInstances();
}

// Apply favicon rules on page load
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

// Apply favicon when page loads
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', applyFavicon);
} else {
  applyFavicon();
}

// Start watching for page title changes
watchPageTitle();

// Listen for storage changes to update favicon when rules change
chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'sync' && changes.faviconRules) {
    console.log('Favicon rules changed, reapplying...');
    applyFavicon();
  }
});

// Watch for domain changes (for SPAs or navigation)
function checkDomainChange() {
  if (location.hostname !== currentDomain) {
    currentDomain = location.hostname;
    console.log('Domain changed, applying favicon:', currentDomain);
    applyFavicon();
  }
}

// Check for domain changes periodically (for SPAs)
setInterval(checkDomainChange, 1000);

// Listen for navigation events (when user navigates to a new domain)
window.addEventListener('beforeunload', () => {
  // Reset domain tracking when navigating away
  currentDomain = null;
});

// Also check on popstate (back/forward navigation)
window.addEventListener('popstate', () => {
  checkDomainChange();
});

// Detect and store object type on page load
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', getCurrentObject);
} else {
  getCurrentObject();
}

// Re-detect when URL changes (for SPAs)
let objectUrl = location.href;
let lastDetectedCardId = null;

const urlCheckInterval = setInterval(() => {
  if (location.href !== objectUrl) {
    objectUrl = location.href;
    console.log('URL changed, re-detecting object type');
    getCurrentObject();
  }
}, 1000);

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
                console.log('Card modal detected with ID:', cardId);
                lastDetectedCardId = cardId;
                getCurrentObject();
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
              console.log('Card modal element removed from DOM');
              if (lastDetectedCardId) {
                lastDetectedCardId = null;
                getCurrentObject();
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
const observer = new MutationObserver((mutations) => {
  checkForCardModalElement(mutations);
});

// Start observing the document for modal changes
observer.observe(document.body, {
  childList: true,
  subtree: true
});

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getObjectType') {
    // Re-detect and update when popup requests it
    getCurrentObject().then((domoObject) => {
      sendResponse(domoObject);
    });
    return true; // Keep message channel open for async response
  }
  return true;
});
