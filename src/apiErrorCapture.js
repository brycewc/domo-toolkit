// Dedicated content script for capturing failed Domo API requests.
//
// Unlike the main content script, this runs in ALL frames (all_frames: true in
// the manifest), so it also covers Domo App iframes served from the
// *.domoapps.*.domo.com origin, where the app's own requests originate. The
// interceptor patches fetch/XHR per frame, and the MAIN-world script posts each
// error to its own frame's window, so the relay listener must run in that same
// frame (a postMessage does not reach the parent). Keeping this separate from
// the main content script lets that script stay top-frame-only for favicon and
// modal detection.

// Inject MAIN world script that intercepts failed Domo API requests.
(function injectApiErrorCapture() {
  if (document.getElementById('domo-toolkit-api-errors-script')) return;

  const script = document.createElement('script');
  script.id = 'domo-toolkit-api-errors-script';
  script.src = chrome.runtime.getURL('public/apiErrors.js');
  document.documentElement.appendChild(script);
})();

// Relay API errors from the MAIN world script to the background service worker.
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  if (event.data?.source !== 'domo-toolkit-api-error') return;

  chrome.runtime
    .sendMessage({
      error: event.data.error,
      type: 'API_ERROR_DETECTED'
    })
    .catch(() => {});
});
