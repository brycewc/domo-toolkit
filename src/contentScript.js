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

// Listen for messages from service worker
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'APPLY_FAVICON') {
    applyFavicon();
    sendResponse({ success: true });
    return true;
  }
});

// Update tab title if it's just "Domo" and we have object metadata
async function updateTabTitle() {
  try {
    // Only update if title is just "Domo"
    if (document.title !== 'Domo') {
      return;
    }

    // Request context from background script
    const response = await chrome.runtime.sendMessage({
      type: 'GET_TAB_CONTEXT'
    });

    if (response?.success && response?.context?.domoObject?.metadata?.name) {
      const objectName = response.context.domoObject.metadata.name;
      document.title = `${objectName} - Domo`;
      console.log(`[ContentScript] Updated title to: ${document.title}`);
    }
  } catch (error) {
    console.log('[ContentScript] Could not update tab title:', error);
  }
}

// Apply favicon on initial load
(async () => {
  console.log('[ContentScript] Initialized, applying favicon');
  await applyFavicon();
  
  // Update title after initial detection
  // Give a brief delay to allow background script to detect context first
  setTimeout(async () => {
    await updateTabTitle();
  }, 700);
})();

// Track last known clipboard value to detect changes
let lastKnownClipboard = '';

// Helper function to check and cache clipboard
async function checkAndCacheClipboard() {
  try {
    const clipboardText = await navigator.clipboard.readText();

    // Only send if clipboard has changed
    if (clipboardText !== lastKnownClipboard) {
      lastKnownClipboard = clipboardText;

      // Send to background script to cache
      chrome.runtime
        .sendMessage({
          type: 'CLIPBOARD_COPIED',
          clipboardData: clipboardText
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
  console.log('[ContentScript] Window gained focus, checking clipboard');
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
                console.log(
                  '[ContentScript] Card modal detected with ID:',
                  cardId
                );
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
              console.log(
                '[ContentScript] Card modal element removed from DOM'
              );
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

// Check for pending activity log filter on page load
async function checkForActivityLogFilter() {
  // Only run on /admin/logging page
  if (!window.location.pathname.includes('/admin/logging')) {
    return;
  }

  console.log(
    '[ContentScript] On activity log page, checking for pending filter...'
  );

  try {
    const result = await chrome.storage.local.get(['activityLogFilter']);

    if (!result.activityLogFilter) {
      console.log('[ContentScript] No pending filter found');
      return;
    }

    const { typeName, objectId, objectName, timestamp } =
      result.activityLogFilter;

    // Check if filter is recent (within 10 seconds)
    const age = Date.now() - timestamp;
    if (age > 10000) {
      console.log('[ContentScript] Filter is too old, ignoring');
      await chrome.storage.local.remove(['activityLogFilter']);
      return;
    }

    console.log('[ContentScript] Applying filter:', {
      typeName,
      objectId,
      objectName
    });

    // Wait for the input element to appear in the DOM
    waitForElement('input[aria-labelledby="downshift-0-label"]', 10000)
      .then(() => {
        applyActivityLogFilter(typeName, objectId, objectName);
        // Clear the filter after applying
        chrome.storage.local.remove(['activityLogFilter']);
      })
      .catch((error) => {
        console.error(
          '[ContentScript] Timeout waiting for input element:',
          error
        );
        chrome.storage.local.remove(['activityLogFilter']);
      });
  } catch (error) {
    console.error(
      '[ContentScript] Error checking for activity log filter:',
      error
    );
  }
}

// Wait for an element to appear in the DOM
function waitForElement(selector, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) {
      console.log('[ContentScript] Element already exists:', selector);
      return resolve(element);
    }

    console.log('[ContentScript] Waiting for element:', selector);

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        console.log('[ContentScript] Element found:', selector);
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Timeout waiting for element: ${selector}`));
    }, timeout);
  });
}

// Apply the activity log filter
function applyActivityLogFilter(typeName, objectId, objectName) {
  console.log('[ContentScript] Starting filter process for:', {
    typeName,
    objectId,
    objectName
  });

  // Find the input element specifically by aria-labelledby
  const input = document.querySelector(
    'input[aria-labelledby="downshift-0-label"]'
  );

  if (!input) {
    console.error('[ContentScript] Input not found!');
    return;
  }

  console.log('[ContentScript] Input found:', input);

  // Click the input to open the dropdown modal
  input.click();
  console.log('[ContentScript] Input clicked to open dropdown');

  // Focus the input
  input.focus();
  console.log('[ContentScript] Input focused');

  // Wait a moment for the dropdown to fully initialize
  setTimeout(() => {
    // Simulate typing character by character
    console.log('[ContentScript] Simulating typing:', typeName);

    let currentValue = '';
    const chars = typeName.split('');

    // Type each character with proper event sequence
    chars.forEach((char, index) => {
      setTimeout(() => {
        currentValue += char;

        // Get the native setter to bypass React's value caching
        const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
          window.HTMLInputElement.prototype,
          'value'
        ).set;
        nativeInputValueSetter.call(input, currentValue);

        // Fire input event
        const inputEvent = new InputEvent('input', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: char
        });
        input.dispatchEvent(inputEvent);

        // Fire beforeinput event (with the character data)
        const beforeInputEvent = new InputEvent('beforeinput', {
          bubbles: true,
          cancelable: true,
          inputType: 'insertText',
          data: char
        });
        input.dispatchEvent(beforeInputEvent);

        console.log(
          `[ContentScript] Typed character: "${char}", current value: "${currentValue}"`
        );

        // After typing the last character, wait and find the matching option
        if (index === chars.length - 1) {
          setTimeout(() => {
            console.log(
              '[ContentScript] Finished typing, searching for exact match...'
            );

            // Wait for filtered options to appear
            waitForElement('[role="option"]', 5000)
              .then(() => {
                // Function to search for matching option with scrolling
                const findOptionWithScroll = (scrollAttempts = 0) => {
                  const options = document.querySelectorAll('[role="option"]');
                  console.log(
                    `[ContentScript] Search attempt ${scrollAttempts + 1}: Found ${options.length} filtered options`
                  );

                  // Find exact match
                  const matchingOption = Array.from(options).find((opt) => {
                    const textDivs = opt.querySelectorAll('div');
                    return Array.from(textDivs).some(
                      (div) => div.textContent.trim() === typeName
                    );
                  });

                  if (matchingOption) {
                    console.log(
                      '[ContentScript] Exact match found:',
                      matchingOption
                    );
                    matchingOption.click();
                    console.log('[ContentScript] Option clicked!');

                    // If we have an objectId, wait for loading to complete then filter by ID
                    if (objectId) {
                      // Wait for any "Loading..." span to disappear
                      console.log(
                        '[ContentScript] Waiting for loading to complete...'
                      );

                      const waitForLoadingToComplete = () => {
                        const loadingSpans = Array.from(
                          document.querySelectorAll('span')
                        ).filter(
                          (span) => span.textContent.trim() === 'Loading...'
                        );

                        if (loadingSpans.length > 0) {
                          console.log(
                            `[ContentScript] Found ${loadingSpans.length} loading indicator(s), waiting...`
                          );
                          setTimeout(waitForLoadingToComplete, 200);
                        } else {
                          console.log(
                            '[ContentScript] Loading complete, starting ID filter'
                          );
                          setTimeout(() => {
                            console.log(
                              '[ContentScript] Starting ID filter for:',
                              {
                                objectId,
                                objectName
                              }
                            );
                            applyIdFilter(objectId, objectName);
                          }, 500);
                        }
                      };

                      // Start checking after a brief delay
                      setTimeout(waitForLoadingToComplete, 500);
                    }
                  } else if (scrollAttempts < 20) {
                    // Try scrolling the dropdown
                    console.log(
                      '[ContentScript] No match found, scrolling dropdown...'
                    );

                    const lastOption = options[options.length - 1];
                    if (lastOption) {
                      lastOption.scrollIntoView({
                        behavior: 'smooth',
                        block: 'end'
                      });

                      // Wait for new options to load, then search again
                      setTimeout(() => {
                        findOptionWithScroll(scrollAttempts + 1);
                      }, 300);
                    } else {
                      console.error(
                        '[ContentScript] No options to scroll, giving up'
                      );
                    }
                  } else {
                    // Log what options were found for debugging
                    const foundOptions = Array.from(options).map((opt) => {
                      const textDivs = opt.querySelectorAll('div');
                      return Array.from(textDivs)
                        .map((d) => d.textContent.trim())
                        .filter((t) => t.length > 0);
                    });

                    console.error(
                      '[ContentScript] No exact match found after 20 scroll attempts'
                    );
                    console.log(
                      '[ContentScript] Available options:',
                      foundOptions
                    );
                    console.log('[ContentScript] Looking for:', typeName);
                  }
                };

                // Start the search
                findOptionWithScroll();
              })
              .catch((error) => {
                console.error(
                  '[ContentScript] Timeout waiting for filtered options:',
                  error
                );
              });
          }, 500);
        }
      }, index * 5); // 5ms delay between characters
    });
  }, 1000); // Wait 1000ms after focus before starting to type
}

// Apply the ID filter (after object type is selected)
function applyIdFilter(objectId, objectName) {
  console.log('[ContentScript] Starting ID filter process for:', {
    objectId,
    objectName
  });

  // Find the ID input element by placeholder
  waitForElement('input[placeholder="All objects"]', 5000)
    .then(() => {
      const input = document.querySelector('input[placeholder="All objects"]');

      if (!input) {
        console.error('[ContentScript] ID input not found!');
        return;
      }

      console.log('[ContentScript] ID input found:', input);

      // Click to open dropdown
      input.click();
      console.log('[ContentScript] ID input clicked');

      // Focus the input
      input.focus();
      console.log('[ContentScript] ID input focused');

      // Wait before typing
      setTimeout(() => {
        console.log('[ContentScript] Simulating name typing:', objectName);

        let currentValue = '';
        const chars = objectName.toString().split('');

        // Type each character
        chars.forEach((char, index) => {
          setTimeout(() => {
            currentValue += char;

            // Get native setter
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
              window.HTMLInputElement.prototype,
              'value'
            ).set;
            nativeInputValueSetter.call(input, currentValue);

            // Fire events
            const inputEvent = new InputEvent('input', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char
            });
            input.dispatchEvent(inputEvent);

            const beforeInputEvent = new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType: 'insertText',
              data: char
            });
            input.dispatchEvent(beforeInputEvent);

            console.log(
              `[ContentScript] Typed name character: "${char}", current value: "${currentValue}"`
            );

            // After last character, find and click the matching option
            if (index === chars.length - 1) {
              setTimeout(() => {
                console.log(
                  '[ContentScript] Finished typing name, searching for ID match...'
                );

                // Wait for filtered options
                waitForElement('[role="option"]', 5000)
                  .then(() => {
                    // Function to search for matching option with scrolling
                    const findIdOptionWithScroll = (scrollAttempts = 0) => {
                      const options =
                        document.querySelectorAll('[role="option"]');
                      console.log(
                        `[ContentScript] ID search attempt ${scrollAttempts + 1}: Found ${options.length} options`
                      );

                      // Find option with tooltip containing the ID
                      const matchingOption = Array.from(options).find((opt) => {
                        const tooltip = opt.querySelector(
                          'div[role="tooltip"]'
                        );
                        if (tooltip) {
                          const span = tooltip.querySelector('span');
                          if (span) {
                            const text = span.textContent.trim();
                            // Check if text matches format: {name} ({id})
                            return text.includes(`(${objectId})`);
                          }
                        }
                        return false;
                      });

                      if (matchingOption) {
                        console.log(
                          '[ContentScript] ID match found:',
                          matchingOption
                        );
                        matchingOption.click();
                        console.log('[ContentScript] ID option clicked!');

                        // After ID filter, remove the auto-applied date filter
                        setTimeout(() => {
                          console.log(
                            '[ContentScript] Starting date filter removal...'
                          );
                          removeDateFilter();
                        }, 1000);
                      } else if (scrollAttempts < 20) {
                        // Try scrolling the dropdown
                        console.log(
                          '[ContentScript] No ID match found, scrolling dropdown...'
                        );

                        const lastOption = options[options.length - 1];
                        if (lastOption) {
                          lastOption.scrollIntoView({
                            behavior: 'smooth',
                            block: 'end'
                          });

                          // Wait for new options to load, then search again
                          setTimeout(() => {
                            findIdOptionWithScroll(scrollAttempts + 1);
                          }, 300);
                        } else {
                          console.error(
                            '[ContentScript] No ID options to scroll, giving up'
                          );
                        }
                      } else {
                        // Log available options for debugging
                        const foundOptions = Array.from(options).map((opt) => {
                          const tooltip = opt.querySelector(
                            'div[role="tooltip"]'
                          );
                          if (tooltip) {
                            const span = tooltip.querySelector('span');
                            return span ? span.textContent.trim() : 'No span';
                          }
                          return 'No tooltip';
                        });

                        console.error(
                          '[ContentScript] No ID match found after 20 scroll attempts'
                        );
                        console.log(
                          '[ContentScript] Available ID options:',
                          foundOptions
                        );
                        console.log(
                          '[ContentScript] Looking for ID:',
                          objectId
                        );
                      }
                    };

                    // Start the ID search
                    findIdOptionWithScroll();
                  })
                  .catch((error) => {
                    console.error(
                      '[ContentScript] Timeout waiting for ID options:',
                      error
                    );
                  });
              }, 500);
            }
          }, index * 50);
        });
      }, 1000);
    })
    .catch((error) => {
      console.error(
        '[ContentScript] Timeout waiting for ID input element:',
        error
      );
    });
}

// Remove the auto-applied date filter
function removeDateFilter() {
  console.log('[ContentScript] Searching for DATE filter header...');

  // Find the th with class DATE
  const dateHeader = document.querySelector('th.DATE');

  if (!dateHeader) {
    console.error('[ContentScript] DATE header not found!');
    return;
  }

  console.log('[ContentScript] DATE header found:', dateHeader);

  // Find the child span with data-filter=true
  const filterSpan = dateHeader.querySelector('span[data-filter="true"]');

  if (!filterSpan) {
    console.error('[ContentScript] Filter span not found in DATE header!');
    return;
  }

  console.log('[ContentScript] Filter span found:', filterSpan);

  // Click the filter span to open the popover
  filterSpan.click();
  console.log('[ContentScript] Filter span clicked');

  // Wait for the popover to appear
  waitForElement(
    'div[data-class="PopoverBase-module_container__gzgeY_v3"]',
    10000
  )
    .then(() => {
      console.log('[ContentScript] Popover loaded');

      const popover = document.querySelector(
        'div[data-class="PopoverBase-module_container__gzgeY_v3"]'
      );

      if (!popover) {
        console.error('[ContentScript] Popover not found!');
        return;
      }

      // Find the trash icon
      const trashIcon = popover.querySelector('i.icon-trash');

      if (!trashIcon) {
        console.error('[ContentScript] Trash icon not found in popover!');
        return;
      }

      console.log('[ContentScript] Trash icon found:', trashIcon);

      // Get the grandparent button and click it
      const deleteButton = trashIcon.parentElement?.parentElement;

      if (!deleteButton || deleteButton.tagName !== 'BUTTON') {
        console.error(
          '[ContentScript] Grandparent button not found or is not a button!',
          deleteButton
        );
        return;
      }

      console.log('[ContentScript] Delete button found:', deleteButton);
      deleteButton.click();
      console.log('[ContentScript] Date filter removed!');

      // Unfocus everything to give user a clean slate
      setTimeout(() => {
        if (document.activeElement) {
          document.activeElement.blur();
          console.log('[ContentScript] Unfocused active element');
        }
        console.log('[ContentScript] Filter process complete!');
      }, 500);
    })
    .catch((error) => {
      console.error('[ContentScript] Timeout waiting for popover:', error);
    });
}

// Run on page load
checkForActivityLogFilter();
