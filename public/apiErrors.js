(() => {
  var originalFetch = window.fetch;
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  // Depth counter used by executeInPage to mark extension-initiated requests.
  // When > 0, fetch/XHR interception is bypassed so extension requests never
  // trigger error notifications.
  window.__domoToolkitExtDepth = 0;

  function isApiEndpoint(url) {
    try {
      var path = new URL(url, location.origin).pathname;
      return path.startsWith('/api/') || path.startsWith('/domo/');
    } catch (e) {
      return false;
    }
  }

  // Endpoints that report a failure inside an otherwise successful response.
  // Each extract() takes the parsed body and returns null when it reports no
  // error. Matching on the URL first keeps every other 2xx body untouched.
  var SOFT_ERROR_CHECKS = [
    {
      extract: extractDataflowPreviewError,
      pattern: /\/api\/dataprocessing\/v\d+\/dataflows\/previews/
    },
    {
      extract: extractKpiRenderError,
      pattern: /\/api\/content\/v3\/cards\/kpi\/render\/preview/
    }
  ];

  // ---- Error emission ----

  function emitApiError(errorData) {
    window.postMessage({ error: errorData, source: 'domo-toolkit-api-error' }, '*');
  }

  function emitSoftError(method, url, soft) {
    emitApiError({
      method: method,
      response: soft.response,
      status: soft.status,
      statusText: soft.statusText,
      time: Date.now(),
      timestamp: new Date().toLocaleTimeString(),
      url: url
    });
  }

  // ---- Embedded error extraction ----

  function extractDataflowPreviewError(data) {
    if (!data) return null;
    var errors = Array.isArray(data.errors) ? data.errors : [];
    if (data.failed !== true && !errors.length) return null;

    // Domo repeats the same entry, and its own UI collapses the repeats.
    var seen = new Set();
    var deduped = [];
    for (var i = 0; i < errors.length; i++) {
      var error = errors[i] || {};
      var key = [error.code, error.actionId, error.message].join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      deduped.push(errors[i]);
    }

    return {
      response: JSON.stringify({ errors: deduped, previewId: data.previewId, state: data.state }, null, 2),
      status: 'Failed',
      statusText: 'DataFlow Preview'
    };
  }

  function extractKpiRenderError(data) {
    if (!data || !data.exceptions) return null;
    var details = data.exceptions.main && data.exceptions.main.details;
    return {
      response: JSON.stringify(data.exceptions, null, 2),
      status: (details && details.status) || 'Exception',
      statusText: (details && details.statusReason) || ''
    };
  }

  function matchSoftErrorCheck(url) {
    for (var i = 0; i < SOFT_ERROR_CHECKS.length; i++) {
      if (SOFT_ERROR_CHECKS[i].pattern.test(url)) return SOFT_ERROR_CHECKS[i];
    }
    return null;
  }

  // responseText throws outright when responseType is not '' or 'text'.
  function responseTextOf(xhr) {
    try {
      return xhr.responseText;
    } catch (e) {
      return '';
    }
  }

  function softErrorFrom(check, text) {
    try {
      return check.extract(JSON.parse(text));
    } catch (e) {
      return null;
    }
  }

  // ---- Fetch interception ----

  window.fetch = (...args) => {
    // Bypass interception for extension-initiated requests
    if (window.__domoToolkitExtDepth > 0) {
      return originalFetch.apply(window, args);
    }

    var isRequestObject = typeof args[0] !== 'string' && args[0] && typeof args[0].url === 'string';
    var url = isRequestObject ? args[0].url : args[0];

    if (!isApiEndpoint(url)) {
      return originalFetch.apply(window, args);
    }

    var method = (args[1] && args[1].method) || (isRequestObject && args[0].method) || 'GET';
    var softCheck = matchSoftErrorCheck(url);

    return originalFetch
      .apply(window, args)
      .then((response) => {
        if (!response.ok) {
          response
            .clone()
            .text()
            .then((text) => {
              emitApiError({
                method: method,
                response: text,
                status: response.status,
                statusText: response.statusText,
                time: Date.now(),
                timestamp: new Date().toLocaleTimeString(),
                url: url
              });
            })
            .catch(() => {});
        } else if (softCheck) {
          response
            .clone()
            .text()
            .then((text) => {
              var soft = softErrorFrom(softCheck, text);
              if (soft) emitSoftError(method, url, soft);
            })
            .catch(() => {});
        }
        return response;
      })
      .catch((error) => {
        emitApiError({
          method: method,
          response: error.message,
          status: 0,
          statusText: 'Network Error',
          time: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          url: url
        });
        throw error;
      });
  };

  // ---- XHR interception ----

  XMLHttpRequest.prototype.open = function (method, url) {
    this._domoToolkitMonitor = { method: method, url: url };
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var monitor = this._domoToolkitMonitor;

    if (!monitor || !isApiEndpoint(monitor.url)) {
      return originalXHRSend.apply(this, arguments);
    }

    // Bypass interception for extension-initiated requests
    if (window.__domoToolkitExtDepth > 0) {
      return originalXHRSend.apply(this, arguments);
    }

    var xhr = this;

    xhr.addEventListener('load', () => {
      var monitor = xhr._domoToolkitMonitor;
      if (!monitor) return;

      if (xhr.status >= 400) {
        emitApiError({
          method: monitor.method,
          response: responseTextOf(xhr),
          status: xhr.status,
          statusText: xhr.statusText,
          time: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          url: monitor.url
        });
      } else if (xhr.status >= 200 && xhr.status < 300) {
        var softCheck = matchSoftErrorCheck(monitor.url);
        var soft = softCheck && softErrorFrom(softCheck, responseTextOf(xhr));
        if (soft) emitSoftError(monitor.method, monitor.url, soft);
      }
    });

    xhr.addEventListener('error', () => {
      var monitor = xhr._domoToolkitMonitor;
      if (monitor) {
        emitApiError({
          method: monitor.method,
          response: 'Network request failed',
          status: 0,
          statusText: 'Network Error',
          time: Date.now(),
          timestamp: new Date().toLocaleTimeString(),
          url: monitor.url
        });
      }
    });

    return originalXHRSend.apply(this, arguments);
  };
})();
