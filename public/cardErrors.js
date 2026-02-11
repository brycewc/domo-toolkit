(function () {
  var originalFetch = window.fetch;
  var originalXHROpen = XMLHttpRequest.prototype.open;
  var originalXHRSend = XMLHttpRequest.prototype.send;

  function isCardEndpoint(url) {
    var patterns = [
      /\/api\/.*\/cards/,
      /\/api\/.*\/page/,
      /\/api\/.*\/content/,
      /\/api\/.*\/visualization/,
      /\/api\/.*\/cardviews/
    ];
    return patterns.some(function (p) {
      return p.test(url);
    });
  }

  var KPI_RENDER_PATTERN = /\/api\/content\/v3\/cards\/kpi\/render\/preview/;

  // ---- Notification UI ----

  function showErrorNotification(errorData) {
    // Ignore "Bad Request" errors
    if (JSON.parse(errorData.response)?.message == 'Bad Request') {
      return;
    }

    var wrapper = document.getElementById('domo-toolkit-card-errors');
    if (!wrapper) {
      wrapper = document.createElement('div');
      wrapper.id = 'domo-toolkit-card-errors';
      wrapper.style.cssText =
        'position:fixed;top:8px;right:8px;z-index:999999;display:flex;flex-direction:column;gap:6px;max-width:420px;max-height:80vh;overflow-y:auto;';
      document.body.appendChild(wrapper);
    }

    var DISMISS_MS = 30000;

    var card = document.createElement('div');
    card.style.cssText =
      'background:#fff;border:1px solid rgba(211,47,47,0.4);border-radius:6px;box-shadow:0 4px 12px rgba(0,0,0,0.15);padding:10px 12px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:12px;color:#333;position:relative;overflow:hidden;';

    // Progress bar for auto-dismiss
    var progressBar = document.createElement('div');
    progressBar.style.cssText =
      'position:absolute;bottom:0;left:0;height:2px;background:#d32f2f;width:100%;transform-origin:left;animation:domo-toolkit-dismiss ' +
      DISMISS_MS +
      'ms linear forwards;';
    card.appendChild(progressBar);

    // Inject keyframes if not already present
    if (!document.getElementById('domo-toolkit-card-error-styles')) {
      var style = document.createElement('style');
      style.id = 'domo-toolkit-card-error-styles';
      style.textContent =
        '@keyframes domo-toolkit-dismiss{from{transform:scaleX(1)}to{transform:scaleX(0)}}';
      document.head.appendChild(style);
    }

    // Header row
    var header = document.createElement('div');
    header.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;';

    var title = document.createElement('div');
    title.style.cssText = 'font-weight:600;font-size:12px;color:#d32f2f;';
    title.textContent = 'Card Error ' + errorData.status;
    header.appendChild(title);

    var closeBtn = document.createElement('button');
    closeBtn.textContent = '\u2715';
    closeBtn.style.cssText =
      'background:none;border:none;cursor:pointer;font-size:14px;color:#888;padding:0 0 0 8px;line-height:1;';
    closeBtn.addEventListener('click', function () {
      card.remove();
      if (wrapper.children.length === 0) wrapper.remove();
    });
    header.appendChild(closeBtn);
    card.appendChild(header);

    // Request info
    var reqDiv = document.createElement('div');
    reqDiv.style.cssText =
      'opacity:0.7;margin-bottom:4px;word-break:break-all;';
    reqDiv.textContent = errorData.method + ' ' + errorData.url;
    card.appendChild(reqDiv);

    // Response body
    var responseText = errorData.response || '';
    var formattedResponse;
    try {
      formattedResponse = JSON.stringify(JSON.parse(responseText), null, 2);
    } catch (e) {
      formattedResponse = responseText;
    }

    if (formattedResponse) {
      var pre = document.createElement('pre');
      pre.textContent = formattedResponse;
      pre.style.cssText =
        'margin:0;white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,0.03);padding:6px;border-radius:4px;font-size:11px;max-height:200px;overflow-y:auto;';
      card.appendChild(pre);
    }

    // Footer: label left, timestamp right
    var footer = document.createElement('div');
    footer.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;margin-top:4px;font-size:10px;opacity:0.5;';

    var label = document.createElement('div');
    label.textContent = 'Domo Toolkit';
    footer.appendChild(label);

    var timeDiv = document.createElement('div');
    timeDiv.textContent = errorData.timestamp;
    footer.appendChild(timeDiv);

    card.appendChild(footer);

    wrapper.appendChild(card);

    // Auto-dismiss
    setTimeout(function () {
      if (card.parentNode) {
        card.remove();
        if (wrapper.children.length === 0) wrapper.remove();
      }
    }, DISMISS_MS);
  }

  // ---- Fetch interception ----

  window.fetch = function () {
    var args = arguments;
    var url = typeof args[0] === 'string' ? args[0] : args[0] && args[0].url;
    var method = (args[1] && args[1].method) || 'GET';

    return originalFetch
      .apply(this, args)
      .then(function (response) {
        if (!response.ok && isCardEndpoint(url)) {
          var cloned = response.clone();
          cloned
            .text()
            .then(function (text) {
              showErrorNotification({
                url: url,
                method: method,
                status: response.status,
                statusText: response.statusText,
                response: text,
                timestamp: new Date().toLocaleString()
              });
            })
            .catch(function () {});
        } else if (response.ok && KPI_RENDER_PATTERN.test(url)) {
          var cloned = response.clone();
          cloned
            .json()
            .then(function (data) {
              if (data && data.exceptions) {
                var details =
                  data.exceptions.main && data.exceptions.main.details;
                var innerStatus = details && details.status;
                showErrorNotification({
                  url: url,
                  method: method,
                  status: innerStatus || 'Exception',
                  statusText: (details && details.statusReason) || '',
                  response: JSON.stringify(data.exceptions, null, 2),
                  timestamp: new Date().toLocaleString()
                });
              }
            })
            .catch(function () {});
        }
        return response;
      })
      .catch(function (error) {
        if (isCardEndpoint(url)) {
          showErrorNotification({
            url: url,
            method: method,
            status: 0,
            statusText: 'Network Error',
            response: error.message,
            timestamp: new Date().toLocaleString()
          });
        }
        throw error;
      });
  };

  // ---- XHR interception ----

  XMLHttpRequest.prototype.open = function (method, url) {
    this._domoToolkitMonitor = { method: method, url: url };
    return originalXHROpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function () {
    var xhr = this;

    xhr.addEventListener('load', function () {
      var monitor = xhr._domoToolkitMonitor;
      if (!monitor) return;

      if (xhr.status >= 400 && isCardEndpoint(monitor.url)) {
        showErrorNotification({
          url: monitor.url,
          method: monitor.method,
          status: xhr.status,
          statusText: xhr.statusText,
          response: xhr.responseText,
          timestamp: new Date().toLocaleString()
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
            showErrorNotification({
              url: monitor.url,
              method: monitor.method,
              status: innerStatus || 'Exception',
              statusText: (details && details.statusReason) || '',
              response: JSON.stringify(data.exceptions, null, 2),
              timestamp: new Date().toLocaleString()
            });
          }
        } catch (e) {}
      }
    });

    xhr.addEventListener('error', function () {
      var monitor = xhr._domoToolkitMonitor;
      if (monitor && isCardEndpoint(monitor.url)) {
        showErrorNotification({
          url: monitor.url,
          method: monitor.method,
          status: 0,
          statusText: 'Network Error',
          response: 'Network request failed',
          timestamp: new Date().toLocaleString()
        });
      }
    });

    return originalXHRSend.apply(this, arguments);
  };
})();
