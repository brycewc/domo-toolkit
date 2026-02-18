(function () {
  var INJECTED_ATTR = 'data-domo-toolkit-errors';

  function findStreamId(scope) {
    var current = scope;
    while (current) {
      if (current.streamId) return current.streamId;
      if (current.stream && current.stream.id) return current.stream.id;
      if (current.dataSource && current.dataSource.streamId)
        return current.dataSource.streamId;
      current = current.$parent;
    }
    return null;
  }

  async function fetchAndInjectErrors(errorRow) {
    if (errorRow.getAttribute(INJECTED_ATTR)) return;

    var scope;
    try {
      scope = angular.element(errorRow).scope();
    } catch (e) {
      return;
    }
    if (!scope || !scope.$parent || !scope.$parent.execution) return;

    var execution = scope.$parent.execution;
    if (!execution.executionId) return;

    var streamId = findStreamId(scope);
    if (!streamId) return;

    errorRow.setAttribute(INJECTED_ATTR, 'loading');

    var errorInset = errorRow.querySelector('.error-inset');
    if (!errorInset) return;

    try {
      var response = await fetch(
        '/api/data/v1/streams/' +
          streamId +
          '/executions/' +
          execution.executionId,
        { method: 'GET' }
      );

      if (!response.ok) {
        errorRow.setAttribute(INJECTED_ATTR, 'error');
        return;
      }

      var data = await response.json();

      // Separate root-level execution details from the errors array
      var rootDetails = {};
      Object.keys(data).forEach(function (k) {
        if (k !== 'errors') rootDetails[k] = data[k];
      });
      var hasRootDetails = Object.keys(rootDetails).length > 0;

      // Build a set of error IDs already shown by Domo's UI
      var uiErrorIds = {};
      if (execution.errors && execution.errors.length > 0) {
        execution.errors.forEach(function (uiErr) {
          if (uiErr.id !== undefined) {
            uiErrorIds[uiErr.id] = true;
          }
        });
      }

      // Filter out errors that Domo already displays (same id, no parameters)
      var filteredErrors = (data.errors || []).filter(function (err) {
        if (
          err.parameters === null &&
          err.id !== undefined &&
          uiErrorIds[err.id]
        ) {
          return false;
        }
        return true;
      });

      if (!hasRootDetails && filteredErrors.length === 0) {
        errorRow.setAttribute(INJECTED_ATTR, 'done');
        return;
      }

      var container = document.createElement('div');
      container.style.cssText =
        'margin-top:8px;border-top:1px solid rgba(128,128,128,0.3);padding-top:8px;';

      var heading = document.createElement('div');
      heading.textContent = 'Execution Details (Domo Toolkit)';
      heading.style.cssText =
        'font-weight:600;margin-bottom:6px;font-size:12px;opacity:0.7;';
      container.appendChild(heading);

      // Render root-level execution details
      if (hasRootDetails) {
        var detailsDiv = document.createElement('div');
        detailsDiv.style.cssText =
          'margin-bottom:8px;padding:6px 8px;background:rgba(128,128,128,0.05);border-radius:4px;border:1px solid rgba(128,128,128,0.2);';

        var pre = document.createElement('pre');
        pre.textContent = JSON.stringify(rootDetails, null, 2);
        pre.style.cssText =
          'font-size:11px;opacity:0.8;white-space:pre-wrap;word-break:break-all;margin:0;';
        detailsDiv.appendChild(pre);

        container.appendChild(detailsDiv);
      }

      // Render individual errors
      filteredErrors.forEach(function (err) {
        var errDiv = document.createElement('div');
        errDiv.style.cssText =
          'margin-bottom:8px;padding:6px 8px;background:rgba(211,47,47,0.05);border-radius:4px;border:1px solid rgba(211,47,47,0.2);';

        if (err.message) {
          var msgP = document.createElement('div');
          msgP.textContent = err.message;
          msgP.style.cssText = 'word-break:break-word;';
          errDiv.appendChild(msgP);
        }

        if (err.code !== undefined) {
          var codeDiv = document.createElement('div');
          codeDiv.textContent = 'Code: ' + err.code;
          codeDiv.style.cssText = 'font-size:11px;opacity:0.6;margin-top:2px;';
          errDiv.appendChild(codeDiv);
        }

        var knownKeys = ['message', 'code'];
        var extraKeys = Object.keys(err).filter(function (k) {
          return knownKeys.indexOf(k) === -1;
        });
        if (extraKeys.length > 0) {
          var extra = {};
          extraKeys.forEach(function (k) {
            extra[k] = err[k];
          });
          var errPre = document.createElement('pre');
          errPre.textContent = JSON.stringify(extra, null, 2);
          errPre.style.cssText =
            'font-size:11px;opacity:0.7;margin-top:4px;white-space:pre-wrap;word-break:break-all;background:rgba(0,0,0,0.03);padding:4px 6px;border-radius:2px;';
          errDiv.appendChild(errPre);
        }

        container.appendChild(errDiv);
      });

      errorInset.appendChild(container);
      errorRow.setAttribute(INJECTED_ATTR, 'done');
    } catch (err) {
      errorRow.setAttribute(INJECTED_ATTR, 'error');
    }
  }

  function processExpandedErrorRows() {
    var errorRows = document.querySelectorAll('tr.error-container');
    errorRows.forEach(function (row) {
      if (row.classList.contains('ng-hide')) return;
      if (row.getAttribute(INJECTED_ATTR)) return;
      fetchAndInjectErrors(row);
    });
  }

  processExpandedErrorRows();

  var observer = new MutationObserver(function () {
    processExpandedErrorRows();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class']
  });
})();
