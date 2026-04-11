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

  var KPI_RENDER_PATTERN = /\/api\/content\/v3\/cards\/kpi\/render\/preview/;

  // ---- Error emission ----

  function emitApiError(errorData) {
    window.postMessage(
      { error: errorData, source: 'domo-toolkit-api-error' },
      '*'
    );
  }

  // ---- Fetch interception ----

  window.fetch = (...args) => {
    // Bypass interception for extension-initiated requests
    if (window.__domoToolkitExtDepth > 0) {
      return originalFetch.apply(window, args);
    }

    var url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;

    if (!isApiEndpoint(url)) {
      return originalFetch.apply(window, args);
    }

    var method = (args[1] && args[1].method) || 'GET';

    return originalFetch
      .apply(window, args)
      .then((response) => {
        if (!response.ok) {
          var cloned = response.clone();
          cloned
            .text()
            .then((text) => {
              emitApiError({
                method: method,
                response: text,
                status: response.status,
                statusText: response.statusText,
                timestamp: new Date().toLocaleString(),
                url: url
              });
            })
            .catch(() => {});
        } else if (KPI_RENDER_PATTERN.test(url)) {
          // KPI render can return 200 with embedded exceptions
          var cloned = response.clone();
          cloned
            .json()
            .then((data) => {
              if (data && data.exceptions) {
                var details =
                  data.exceptions.main && data.exceptions.main.details;
                var innerStatus = details && details.status;
                emitApiError({
                  method: method,
                  response: JSON.stringify(data.exceptions, null, 2),
                  status: innerStatus || 'Exception',
                  statusText: (details && details.statusReason) || '',
                  timestamp: new Date().toLocaleString(),
                  url: url
                });
              }
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
          timestamp: new Date().toLocaleString(),
          url: url
        });
        throw error;
      });
  };

  // ---- XHR interception ----

  XMLHttpRequest.prototype.open = function(method, url) {
    this._domoToolkitMonitor = { method: method, url: url };
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function() {
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
          response: xhr.responseText,
          status: xhr.status,
          statusText: xhr.statusText,
          timestamp: new Date().toLocaleString(),
          url: monitor.url
        });
      } else if (
        xhr.status >= 200 &&
        xhr.status < 300 &&
        KPI_RENDER_PATTERN.test(monitor.url)
      ) {
        try {
          var data = JSON.parse(xhr.responseText);
          if (data && data.exceptions) {
            var details = data.exceptions.main && data.exceptions.main.details;
            var innerStatus = details && details.status;
            emitApiError({
              method: monitor.method,
              response: JSON.stringify(data.exceptions, null, 2),
              status: innerStatus || 'Exception',
              statusText: (details && details.statusReason) || '',
              timestamp: new Date().toLocaleString(),
              url: monitor.url
            });
          }
        } catch (e) {}
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
          timestamp: new Date().toLocaleString(),
          url: monitor.url
        });
      }
    });

    return originalXHRSend.apply(this, arguments);
  };
})();
