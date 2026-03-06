(() => {
  var originalFetch = window.fetch;
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  // Depth counter used by executeInPage to mark extension-initiated requests.
  // When > 0, fetch/XHR interception is bypassed so extension requests never
  // trigger card error notifications.
  window.__domoToolkitExtDepth = 0;

  function isCardEndpoint(url) {
    var patterns = [
      /\/api\/.*\/cards/,
      /\/api\/.*\/visualization/,
      /\/api\/.*\/cardviews/
    ];
    return patterns.some((p) => p.test(url));
  }

  var KPI_RENDER_PATTERN = /\/api\/content\/v3\/cards\/kpi\/render\/preview/;

  function isOnCardPage() {
    var href = location.href.toLowerCase();
    return href.includes('kpis/') || href.includes('cardid');
  }

  // ---- Error emission ----

  function emitCardError(errorData) {
    if (!isOnCardPage()) return;

    // Ignore "Bad Request" errors
    try {
      if (JSON.parse(errorData.response)?.message === 'Bad Request') return;
    } catch (e) {
      // Not JSON, continue
    }

    window.postMessage(
      { source: 'domo-toolkit-card-error', error: errorData },
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

    // Only intercept card endpoints
    if (!isCardEndpoint(url) && !KPI_RENDER_PATTERN.test(url)) {
      return originalFetch.apply(window, args);
    }

    var method = (args[1] && args[1].method) || 'GET';

    return originalFetch
      .apply(window, args)
      .then((response) => {
        if (!response.ok && isCardEndpoint(url)) {
          var cloned = response.clone();
          cloned
            .text()
            .then((text) => {
              emitCardError({
                method: method,
                response: text,
                status: response.status,
                statusText: response.statusText,
                timestamp: new Date().toLocaleString(),
                url: url
              });
            })
            .catch(() => {});
        } else if (response.ok && KPI_RENDER_PATTERN.test(url)) {
          var cloned = response.clone();
          cloned
            .json()
            .then((data) => {
              if (data && data.exceptions) {
                var details =
                  data.exceptions.main && data.exceptions.main.details;
                var innerStatus = details && details.status;
                emitCardError({
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
        if (isCardEndpoint(url)) {
          emitCardError({
            method: method,
            response: error.message,
            status: 0,
            statusText: 'Network Error',
            timestamp: new Date().toLocaleString(),
            url: url
          });
        }
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

    // Only intercept card endpoints
    if (
      !monitor ||
      (!isCardEndpoint(monitor.url) && !KPI_RENDER_PATTERN.test(monitor.url))
    ) {
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

      if (xhr.status >= 400 && isCardEndpoint(monitor.url)) {
        emitCardError({
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
            emitCardError({
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
      if (monitor && isCardEndpoint(monitor.url)) {
        emitCardError({
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
