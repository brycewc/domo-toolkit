import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import * as React from 'react';
import React__default, { isValidElement, createContext, useContext, useState, useRef, useEffect, useMemo, useLayoutEffect, useCallback } from 'react';
import { flushSync } from 'react-dom';

/******************************************************************************
Copyright (c) Microsoft Corporation.

Permission to use, copy, modify, and/or distribute this software for any
purpose with or without fee is hereby granted.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH
REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY
AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT,
INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM
LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR
OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR
PERFORMANCE OF THIS SOFTWARE.
***************************************************************************** */
/* global Reflect, Promise, SuppressedError, Symbol, Iterator */


function __awaiter(thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
}

typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
};

function getDefaultExportFromCjs (x) {
	return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
}

var toggleSelection = function () {
  var selection = document.getSelection();
  if (!selection.rangeCount) {
    return function () {};
  }
  var active = document.activeElement;

  var ranges = [];
  for (var i = 0; i < selection.rangeCount; i++) {
    ranges.push(selection.getRangeAt(i));
  }

  switch (active.tagName.toUpperCase()) { // .toUpperCase handles XHTML
    case 'INPUT':
    case 'TEXTAREA':
      active.blur();
      break;

    default:
      active = null;
      break;
  }

  selection.removeAllRanges();
  return function () {
    selection.type === 'Caret' &&
    selection.removeAllRanges();

    if (!selection.rangeCount) {
      ranges.forEach(function(range) {
        selection.addRange(range);
      });
    }

    active &&
    active.focus();
  };
};

var deselectCurrent = toggleSelection;

var clipboardToIE11Formatting = {
  "text/plain": "Text",
  "text/html": "Url",
  "default": "Text"
};

var defaultMessage = "Copy to clipboard: #{key}, Enter";

function format(message) {
  var copyKey = (/mac os x/i.test(navigator.userAgent) ? "⌘" : "Ctrl") + "+C";
  return message.replace(/#{\s*key\s*}/g, copyKey);
}

function copy(text, options) {
  var debug,
    message,
    reselectPrevious,
    range,
    selection,
    mark,
    success = false;
  if (!options) {
    options = {};
  }
  debug = options.debug || false;
  try {
    reselectPrevious = deselectCurrent();

    range = document.createRange();
    selection = document.getSelection();

    mark = document.createElement("span");
    mark.textContent = text;
    // avoid screen readers from reading out loud the text
    mark.ariaHidden = "true";
    // reset user styles for span element
    mark.style.all = "unset";
    // prevents scrolling to the end of the page
    mark.style.position = "fixed";
    mark.style.top = 0;
    mark.style.clip = "rect(0, 0, 0, 0)";
    // used to preserve spaces and line breaks
    mark.style.whiteSpace = "pre";
    // do not inherit user-select (it may be `none`)
    mark.style.webkitUserSelect = "text";
    mark.style.MozUserSelect = "text";
    mark.style.msUserSelect = "text";
    mark.style.userSelect = "text";
    mark.addEventListener("copy", function(e) {
      e.stopPropagation();
      if (options.format) {
        e.preventDefault();
        if (typeof e.clipboardData === "undefined") { // IE 11
          debug && console.warn("unable to use e.clipboardData");
          debug && console.warn("trying IE specific stuff");
          window.clipboardData.clearData();
          var format = clipboardToIE11Formatting[options.format] || clipboardToIE11Formatting["default"];
          window.clipboardData.setData(format, text);
        } else { // all other browsers
          e.clipboardData.clearData();
          e.clipboardData.setData(options.format, text);
        }
      }
      if (options.onCopy) {
        e.preventDefault();
        options.onCopy(e.clipboardData);
      }
    });

    document.body.appendChild(mark);

    range.selectNodeContents(mark);
    selection.addRange(range);

    var successful = document.execCommand("copy");
    if (!successful) {
      throw new Error("copy command was unsuccessful");
    }
    success = true;
  } catch (err) {
    debug && console.error("unable to copy using execCommand: ", err);
    debug && console.warn("trying IE specific stuff");
    try {
      window.clipboardData.setData(options.format || "text", text);
      options.onCopy && options.onCopy(window.clipboardData);
      success = true;
    } catch (err) {
      debug && console.error("unable to copy using clipboardData: ", err);
      debug && console.error("falling back to prompt");
      message = format("message" in options ? options.message : defaultMessage);
      window.prompt(message, text);
    }
  } finally {
    if (selection) {
      if (typeof selection.removeRange == "function") {
        selection.removeRange(range);
      } else {
        selection.removeAllRanges();
      }
    }

    if (mark) {
      document.body.removeChild(mark);
    }
    reselectPrevious();
  }

  return success;
}

var copyToClipboard = copy;

var copy$1 = /*@__PURE__*/getDefaultExportFromCjs(copyToClipboard);

function isObject(node) {
    return Object.prototype.toString.call(node) === '[object Object]';
}
function objectSize(node) {
    return Array.isArray(node) ? node.length : isObject(node) ? Object.keys(node).length : 0;
}
function stringifyForCopying(node, space) {
    // return single string nodes without quotes
    if (typeof node === 'string') {
        return node;
    }
    try {
        return JSON.stringify(node, (key, value) => {
            switch (typeof value) {
                case 'bigint':
                    return String(value) + 'n';
                case 'number':
                case 'boolean':
                case 'object':
                case 'string':
                    return value;
                default:
                    return String(value);
            }
        }, space);
    }
    catch (error) {
        return `${error.name}: ${error.message}` || 'JSON.stringify failed';
    }
}
function writeClipboard(value) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield navigator.clipboard.writeText(value);
        }
        catch (err) {
            copy$1(value);
        }
    });
}
function isCollapsed(node, depth, indexOrName, collapsed, collapseObjectsAfterLength, customOptions) {
    if (customOptions && customOptions.collapsed !== undefined)
        return !!customOptions.collapsed;
    if (typeof collapsed === 'boolean')
        return collapsed;
    if (typeof collapsed === 'number' && depth > collapsed)
        return true;
    const size = objectSize(node);
    if (typeof collapsed === 'function') {
        const result = safeCall(collapsed, [{ node, depth, indexOrName, size }]);
        if (typeof result === 'boolean')
            return result;
    }
    if (Array.isArray(node) && size > collapseObjectsAfterLength)
        return true;
    if (isObject(node) && size > collapseObjectsAfterLength)
        return true;
    return false;
}
function isCollapsed_largeArray(node, depth, indexOrName, collapsed, collapseObjectsAfterLength, customOptions) {
    if (customOptions && customOptions.collapsed !== undefined)
        return !!customOptions.collapsed;
    if (typeof collapsed === 'boolean')
        return collapsed;
    if (typeof collapsed === 'number' && depth > collapsed)
        return true;
    const size = Math.ceil(node.length / 100);
    if (typeof collapsed === 'function') {
        const result = safeCall(collapsed, [{ node, depth, indexOrName, size }]);
        if (typeof result === 'boolean')
            return result;
    }
    if (Array.isArray(node) && size > collapseObjectsAfterLength)
        return true;
    if (isObject(node) && size > collapseObjectsAfterLength)
        return true;
    return false;
}
function ifDisplay(displaySize, depth, fold) {
    if (typeof displaySize === 'boolean')
        return displaySize;
    if (typeof displaySize === 'number' && depth > displaySize)
        return true;
    if (displaySize === 'collapsed' && fold)
        return true;
    if (displaySize === 'expanded' && !fold)
        return true;
    return false;
}
function safeCall(func, params) {
    try {
        return func(...params);
    }
    catch (event) {
        reportError(event);
    }
}
function editableAdd(editable) {
    if (editable === true)
        return true;
    if (isObject(editable) && editable.add === true)
        return true;
}
function editableEdit(editable) {
    if (editable === true)
        return true;
    if (isObject(editable) && editable.edit === true)
        return true;
}
function editableDelete(editable) {
    if (editable === true)
        return true;
    if (isObject(editable) && editable.delete === true)
        return true;
}
function isReactComponent(component) {
    return typeof component === 'function';
}
function customAdd(customOptions) {
    return !customOptions || customOptions.add === undefined || !!customOptions.add;
}
function customEdit(customOptions) {
    return !customOptions || customOptions.edit === undefined || !!customOptions.edit;
}
function customDelete(customOptions) {
    return !customOptions || customOptions.delete === undefined || !!customOptions.delete;
}
function customCopy(customOptions) {
    return !customOptions || customOptions.enableClipboard === undefined || !!customOptions.enableClipboard;
}
function customMatchesURL(customOptions) {
    return !customOptions || customOptions.matchesURL === undefined || !!customOptions.matchesURL;
}
function resolveEvalFailedNewValue(type, value) {
    if (type === 'string') {
        return value.trim().replace(/^\"([\s\S]+?)\"$/, '$1');
    }
    return value;
}

function getNodeType(node) {
    if (node === null)
        return 'null';
    if (Array.isArray(node))
        return 'array';
    const t = typeof node;
    if (t === 'object')
        return 'object';
    return t;
}

// Path helpers for the flattened row model. A "path" is the sequence of
// keys/indices from the root to a node (root = []). Path keys must be
// collision-free even when object keys contain dots, so we use JSON.stringify
// rather than join('.').
function pathKey(path) {
    return JSON.stringify(path.map(String));
}
// Namespace for a large-array chunk's expand state (chunks are a visual grouping,
// not a real path level, so they need their own key derived from the array path).
function chunkKey(arrayPath, chunkIndex) {
    return pathKey(arrayPath) + ' chunk ' + chunkIndex;
}
function getByPath(root, path) {
    let node = root;
    for (const seg of path) {
        if (node == null)
            return undefined;
        node = node[seg];
    }
    return node;
}
// The parent container of the node at `path` (root's parent is undefined).
function getParentByPath(root, path) {
    if (path.length === 0)
        return undefined;
    return getByPath(root, path.slice(0, -1));
}

/**
 * Whether a container node is expanded. `ownDepth` is the node's own depth
 * (= path.length + 1), matching what the legacy ObjectNode passed to isCollapsed.
 */
function isContainerExpanded(overrides, key, node, ownDepth, indexOrName, opts, largeArray, customOptions) {
    if (overrides.has(key))
        return overrides.get(key);
    const collapsedResult = largeArray
        ? isCollapsed_largeArray(node, ownDepth, indexOrName, opts.collapsed, opts.collapseObjectsAfterLength, customOptions)
        : isCollapsed(node, ownDepth, indexOrName, opts.collapsed, opts.collapseObjectsAfterLength, customOptions);
    return !collapsedResult;
}
/** Large-array chunks default to folded (legacy LargeArrayNode useState(true)). */
function isChunkExpanded(overrides, key) {
    var _a;
    return (_a = overrides.get(key)) !== null && _a !== void 0 ? _a : false;
}

const CHUNK_SIZE = 100;
const LARGE_ARRAY_THRESHOLD = 100;
function makeId(path, kind, expandKey) {
    if (kind === 'chunk' || kind === 'chunk-open' || kind === 'chunk-close')
        return expandKey + ':' + kind;
    return pathKey(path) + ':' + kind;
}
/**
 * Turn `root` + the expand-state overrides into an ordered flat array of visible
 * rows. Collapsed subtrees are never walked, so cost is O(visible rows).
 */
function flatten(root, opts) {
    const { expand, collapsed, collapseObjectsAfterLength, customizeNode, ignoreLargeArray, addingKey } = opts;
    const rows = [];
    const stack = [{ t: 'node', value: root, path: [], depth: 1, indexOrName: undefined, parentType: null }];
    while (stack.length) {
        const frame = stack.pop();
        if (frame.t === 'emit') {
            rows.push(frame.row);
            continue;
        }
        if (frame.t === 'chunk') {
            processChunk(frame, expand, rows, stack);
            continue;
        }
        const { value, path, depth, indexOrName, parentType } = frame;
        const ownDepth = path.length + 1;
        // customizeNode runs first, exactly like json-node.tsx short-circuit
        let customOptions;
        if (typeof customizeNode === 'function') {
            const ret = safeCall(customizeNode, [{ node: value, depth: ownDepth, indexOrName }]);
            if (ret) {
                if (isValidElement(ret)) {
                    rows.push(mkRow({ kind: 'custom', path, depth, indexOrName, parentType, value, customRender: ret }));
                    continue;
                }
                else if (isReactComponent(ret)) {
                    rows.push(mkRow({ kind: 'custom', path, depth, indexOrName, parentType, value, customRender: ret }));
                    continue;
                }
                else if (typeof ret === 'object') {
                    customOptions = ret;
                }
            }
        }
        const nodeType = getNodeType(value);
        const isArr = nodeType === 'array';
        const isObj = nodeType === 'object';
        if (!isArr && !isObj) {
            rows.push(mkRow({ kind: 'value', path, depth, indexOrName, parentType, value, nodeType, customOptions }));
            continue;
        }
        const key = pathKey(path);
        const size = objectSize(value);
        const largeArray = isArr && !ignoreLargeArray && value.length > LARGE_ARRAY_THRESHOLD;
        const expanded = isContainerExpanded(expand, key, value, ownDepth, indexOrName, { collapsed, collapseObjectsAfterLength }, largeArray, customOptions);
        const openBracket = isArr ? '[' : '{';
        const closeBracket = isArr ? ']' : '}';
        if (!expanded) {
            rows.push(mkRow({ kind: 'collapsed', path, depth, indexOrName, parentType, value, nodeType, bracket: openBracket, size, expandKey: key, customOptions }));
            continue;
        }
        rows.push(mkRow({ kind: 'open', path, depth, indexOrName, parentType, value, nodeType, bracket: openBracket, size, expandKey: key, customOptions }));
        const closeRow = mkRow({ kind: 'close', path, depth, indexOrName, parentType, value, nodeType, bracket: closeBracket, size, expandKey: key });
        stack.push({ t: 'emit', row: closeRow });
        // children, pushed reversed so the first child pops first
        if (largeArray) {
            const arr = value;
            const chunkCount = Math.ceil(arr.length / CHUNK_SIZE);
            for (let c = chunkCount - 1; c >= 0; c--) {
                const start = c * CHUNK_SIZE;
                const end = Math.min(arr.length, start + CHUNK_SIZE);
                stack.push({ t: 'chunk', array: arr, path, depth: depth + 1, index: c, start, end });
            }
        }
        else if (isArr) {
            const arr = value;
            for (let i = arr.length - 1; i >= 0; i--) {
                stack.push({ t: 'node', value: arr[i], path: [...path, i], depth: depth + 1, indexOrName: i, parentType: 'array' });
            }
        }
        else {
            const entries = Object.entries(value);
            for (let i = entries.length - 1; i >= 0; i--) {
                const [k, v] = entries[i];
                stack.push({ t: 'node', value: v, path: [...path, k], depth: depth + 1, indexOrName: k, parentType: 'object' });
            }
        }
        // add-input row emits right after the open row (top of stack)
        if (addingKey !== undefined && addingKey === key) {
            stack.push({ t: 'emit', row: mkRow({ kind: 'add-input', path, depth: depth + 1, indexOrName, parentType: isArr ? 'array' : 'object', value: null }) });
        }
    }
    return rows;
}
function processChunk(frame, expand, rows, stack) {
    const { array, path, depth, index, start, end } = frame;
    const key = chunkKey(path, index);
    const chunkMeta = { index, start, end: end - 1 };
    const expanded = isChunkExpanded(expand, key);
    if (!expanded) {
        rows.push(mkRow({ kind: 'chunk', path, depth, indexOrName: undefined, parentType: 'array', value: array.slice(start, end), nodeType: 'array', bracket: '[', expandKey: key, chunk: chunkMeta }));
        return;
    }
    rows.push(mkRow({ kind: 'chunk-open', path, depth, indexOrName: undefined, parentType: 'array', value: array.slice(start, end), nodeType: 'array', bracket: '[', expandKey: key, chunk: chunkMeta }));
    const closeRow = mkRow({ kind: 'chunk-close', path, depth, indexOrName: undefined, parentType: 'array', value: null, nodeType: 'array', bracket: ']', expandKey: key, chunk: chunkMeta });
    stack.push({ t: 'emit', row: closeRow });
    for (let i = end - 1; i >= start; i--) {
        stack.push({ t: 'node', value: array[i], path: [...path, i], depth: depth + 1, indexOrName: i, parentType: 'array' });
    }
}
function mkRow(partial) {
    var _a;
    const nodeType = (_a = partial.nodeType) !== null && _a !== void 0 ? _a : getNodeType(partial.value);
    return Object.assign(Object.assign({}, partial), { nodeType, parentPath: partial.path.slice(0, -1), id: makeId(partial.path, partial.kind, partial.expandKey) });
}

const defaultConfig = {
    collapseStringsAfterLength: 99,
    collapseStringMode: 'directly',
    customizeCollapseStringUI: undefined,
    enableClipboard: true,
    editable: false,
    displaySize: undefined,
    displayArrayIndex: true,
    matchesURL: false,
    urlRegExp: /^$/,
    customizeCopy: () => { }
};
const ConfigContext = createContext(defaultConfig);
const HandlersContext = createContext({});

const LongString = React__default.forwardRef(({ str, className, ctrlClick, truncated: truncatedProp, onToggleTruncated }, ref) => {
    let { collapseStringMode, collapseStringsAfterLength, customizeCollapseStringUI } = useContext(ConfigContext);
    const [truncatedLocal, setTruncatedLocal] = useState(true);
    const truncated = truncatedProp !== null && truncatedProp !== void 0 ? truncatedProp : truncatedLocal;
    const setTruncated = (next) => (onToggleTruncated ? onToggleTruncated(next) : setTruncatedLocal(next));
    const strRef = useRef(null);
    collapseStringsAfterLength = collapseStringsAfterLength > 0 ? collapseStringsAfterLength : 0;
    const str_show = str.replace(/\s+/g, ' ');
    const collapseStringUI = typeof customizeCollapseStringUI === 'function'
        ? customizeCollapseStringUI(str_show, truncated)
        : typeof customizeCollapseStringUI === 'string'
            ? customizeCollapseStringUI
            : '...';
    const clickToTruncateOrEdit = (event) => {
        var _a;
        if ((event.ctrlKey || event.metaKey) && ctrlClick) {
            ctrlClick(event);
        }
        else {
            const selection = window.getSelection();
            if (selection && selection.anchorOffset !== selection.focusOffset && ((_a = selection.anchorNode) === null || _a === void 0 ? void 0 : _a.parentElement) === strRef.current)
                return;
            setTruncated(!truncated);
        }
    };
    if (str.length <= collapseStringsAfterLength)
        return (jsxs("span", { ref: strRef, className: className, onClick: ctrlClick, children: ["\"", str, "\""] }));
    if (collapseStringMode === 'address')
        return str.length <= 10 ? (jsxs("span", { ref: strRef, className: className, onClick: ctrlClick, children: ["\"", str, "\""] })) : (jsxs("span", { ref: strRef, onClick: clickToTruncateOrEdit, className: className + ' cursor-pointer', children: ["\"", truncated ? [str_show.slice(0, 6), collapseStringUI, str_show.slice(-4)] : str, "\""] }));
    if (collapseStringMode === 'directly') {
        return (jsxs("span", { ref: strRef, onClick: clickToTruncateOrEdit, className: className + ' cursor-pointer', children: ["\"", truncated ? [str_show.slice(0, collapseStringsAfterLength), collapseStringUI] : str, "\""] }));
    }
    if (collapseStringMode === 'word') {
        let index_ahead = collapseStringsAfterLength;
        let index_behind = collapseStringsAfterLength + 1;
        let str_collapsed = str_show;
        let count = 1;
        while (true) {
            if (/\W/.test(str[index_ahead])) {
                str_collapsed = str.slice(0, index_ahead);
                break;
            }
            if (/\W/.test(str[index_behind])) {
                str_collapsed = str.slice(0, index_behind);
                break;
            }
            if (count === 6) {
                str_collapsed = str.slice(0, collapseStringsAfterLength);
                break;
            }
            count++;
            index_ahead--;
            index_behind++;
        }
        return (jsxs("span", { ref: strRef, onClick: clickToTruncateOrEdit, className: className + ' cursor-pointer', children: ["\"", truncated ? [str_collapsed, collapseStringUI] : str, "\""] }));
    }
    return (jsxs("span", { ref: strRef, className: className, children: ["\"", str, "\""] }));
});

var _path$8;
function _extends$8() { return _extends$8 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$8.apply(null, arguments); }
var SvgCopy = function SvgCopy(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$8({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$8 || (_path$8 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M17.542 2.5h-4.75a3.963 3.963 0 0 0-3.959 3.958v4.75a3.963 3.963 0 0 0 3.959 3.959h4.75a3.963 3.963 0 0 0 3.958-3.959v-4.75A3.963 3.963 0 0 0 17.542 2.5m2.375 8.708a2.38 2.38 0 0 1-2.375 2.375h-4.75a2.38 2.38 0 0 1-2.375-2.375v-4.75a2.38 2.38 0 0 1 2.375-2.375h4.75a2.38 2.38 0 0 1 2.375 2.375zm-4.75 6.334a3.963 3.963 0 0 1-3.959 3.958h-4.75A3.963 3.963 0 0 1 2.5 17.542v-4.75a3.963 3.963 0 0 1 3.958-3.959.791.791 0 1 1 0 1.584 2.38 2.38 0 0 0-2.375 2.375v4.75a2.38 2.38 0 0 0 2.375 2.375h4.75a2.38 2.38 0 0 0 2.375-2.375.792.792 0 1 1 1.584 0"
  })));
};

var _path$7, _path2$5;
function _extends$7() { return _extends$7 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$7.apply(null, arguments); }
var SvgCopied = function SvgCopied(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$7({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$7 || (_path$7 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M17.25 3H6.75A3.755 3.755 0 0 0 3 6.75v10.5A3.754 3.754 0 0 0 6.75 21h10.5A3.754 3.754 0 0 0 21 17.25V6.75A3.755 3.755 0 0 0 17.25 3m2.25 14.25a2.25 2.25 0 0 1-2.25 2.25H6.75a2.25 2.25 0 0 1-2.25-2.25V6.75A2.25 2.25 0 0 1 6.75 4.5h10.5a2.25 2.25 0 0 1 2.25 2.25z"
  })), _path2$5 || (_path2$5 = /*#__PURE__*/React.createElement("path", {
    fill: "#14C786",
    d: "M10.312 14.45 7.83 11.906a.625.625 0 0 0-.896 0 .66.66 0 0 0 0 .918l2.481 2.546a1.26 1.26 0 0 0 .896.381 1.24 1.24 0 0 0 .895-.38l5.858-6.011a.66.66 0 0 0 0-.919.625.625 0 0 0-.896 0z"
  })));
};

function CopyButton({ node, nodeMeta }) {
    const { customizeCopy, CopyComponent, CopiedComponent } = useContext(ConfigContext);
    const [copied, setCopied] = useState(false);
    const copyHandler = (event) => {
        event.stopPropagation();
        const value = customizeCopy(node, nodeMeta);
        if (typeof value === 'string' && value) {
            writeClipboard(value);
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
    };
    return copied ? (typeof CopiedComponent === 'function' ? (jsx(CopiedComponent, { className: 'json-view--copy', style: { display: 'inline-block' } })) : (jsx(SvgCopied, { className: 'json-view--copy', style: { display: 'inline-block' } }))) : typeof CopyComponent === 'function' ? (jsx(CopyComponent, { onClick: copyHandler, className: 'json-view--copy' })) : (jsx(SvgCopy, { onClick: copyHandler, className: 'json-view--copy' }));
}

var _path$6;
function _extends$6() { return _extends$6 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$6.apply(null, arguments); }
var SvgAngleDown = function SvgAngleDown(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$6({
    xmlns: "http://www.w3.org/2000/svg",
    width: 16,
    height: 16,
    fill: "none",
    viewBox: "0 0 16 16"
  }, props), _path$6 || (_path$6 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M12.473 5.806a.666.666 0 0 0-.946 0L8.473 8.86a.667.667 0 0 1-.946 0L4.473 5.806a.667.667 0 1 0-.946.94l3.06 3.06a2 2 0 0 0 2.826 0l3.06-3.06a.667.667 0 0 0 0-.94"
  })));
};

var _path$5;
function _extends$5() { return _extends$5 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$5.apply(null, arguments); }
var SvgEdit = function SvgEdit(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$5({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$5 || (_path$5 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M17.25 3H6.75A3.754 3.754 0 0 0 3 6.75v10.5A3.754 3.754 0 0 0 6.75 21h10.5A3.754 3.754 0 0 0 21 17.25V6.75A3.754 3.754 0 0 0 17.25 3m2.25 14.25c0 1.24-1.01 2.25-2.25 2.25H6.75c-1.24 0-2.25-1.01-2.25-2.25V6.75c0-1.24 1.01-2.25 2.25-2.25h10.5c1.24 0 2.25 1.01 2.25 2.25zm-6.09-9.466-5.031 5.03a2.98 2.98 0 0 0-.879 2.121v1.19c0 .415.336.75.75.75h1.19c.8 0 1.554-.312 2.12-.879l5.03-5.03a2.25 2.25 0 0 0 0-3.182c-.85-.85-2.331-.85-3.18 0m-2.91 7.151c-.28.28-.666.44-1.06.44H9v-.44c0-.4.156-.777.44-1.06l3.187-3.187 1.06 1.06zm5.03-5.03-.782.783-1.06-1.061.782-.782a.766.766 0 0 1 1.06 0 .75.75 0 0 1 0 1.06"
  })));
};

var _path$4, _path2$4;
function _extends$4() { return _extends$4 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$4.apply(null, arguments); }
var SvgTrash = function SvgTrash(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$4({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$4 || (_path$4 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M18.75 6h-2.325a3.76 3.76 0 0 0-3.675-3h-1.5a3.76 3.76 0 0 0-3.675 3H5.25a.75.75 0 0 0 0 1.5H6v9.75A3.754 3.754 0 0 0 9.75 21h4.5A3.754 3.754 0 0 0 18 17.25V7.5h.75a.75.75 0 1 0 0-1.5m-7.5-1.5h1.5A2.255 2.255 0 0 1 14.872 6H9.128a2.255 2.255 0 0 1 2.122-1.5m5.25 12.75a2.25 2.25 0 0 1-2.25 2.25h-4.5a2.25 2.25 0 0 1-2.25-2.25V7.5h9z"
  })), _path2$4 || (_path2$4 = /*#__PURE__*/React.createElement("path", {
    fill: "#DA0000",
    d: "M10.5 16.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 1 0-1.5 0v4.5a.75.75 0 0 0 .75.75M13.5 16.5a.75.75 0 0 0 .75-.75v-4.5a.75.75 0 1 0-1.5 0v4.5a.75.75 0 0 0 .75.75"
  })));
};

var _path$3, _path2$3;
function _extends$3() { return _extends$3 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$3.apply(null, arguments); }
var SvgAddSquare = function SvgAddSquare(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$3({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$3 || (_path$3 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M21 6.75v10.5A3.754 3.754 0 0 1 17.25 21H6.75A3.754 3.754 0 0 1 3 17.25V6.75A3.754 3.754 0 0 1 6.75 3h10.5A3.754 3.754 0 0 1 21 6.75m-1.5 0c0-1.24-1.01-2.25-2.25-2.25H6.75C5.51 4.5 4.5 5.51 4.5 6.75v10.5c0 1.24 1.01 2.25 2.25 2.25h10.5c1.24 0 2.25-1.01 2.25-2.25z"
  })), _path2$3 || (_path2$3 = /*#__PURE__*/React.createElement("path", {
    fill: "#14C786",
    d: "M15 12.75a.75.75 0 1 0 0-1.5h-2.25V9a.75.75 0 1 0-1.5 0v2.25H9a.75.75 0 1 0 0 1.5h2.25V15a.75.75 0 1 0 1.5 0v-2.25z"
  })));
};

var _path$2, _path2$2;
function _extends$2() { return _extends$2 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$2.apply(null, arguments); }
var SvgDone = function SvgDone(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$2({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$2 || (_path$2 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9m0 16.5a7.5 7.5 0 1 1 7.5-7.5 7.51 7.51 0 0 1-7.5 7.5"
  })), _path2$2 || (_path2$2 = /*#__PURE__*/React.createElement("path", {
    fill: "#14C786",
    d: "m10.85 13.96-1.986-2.036a.5.5 0 0 0-.716 0 .527.527 0 0 0 0 .735l1.985 2.036a1 1 0 0 0 .717.305 1 1 0 0 0 .716-.305l4.686-4.808a.526.526 0 0 0 0-.735.5.5 0 0 0-.716 0z"
  })));
};

var _path$1, _path2$1;
function _extends$1() { return _extends$1 = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends$1.apply(null, arguments); }
var SvgCancel = function SvgCancel(props) {
  return /*#__PURE__*/React.createElement("svg", _extends$1({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path$1 || (_path$1 = /*#__PURE__*/React.createElement("path", {
    fill: "#DA0000",
    d: "M15 9a.75.75 0 0 0-1.06 0L12 10.94 10.06 9A.75.75 0 0 0 9 10.06L10.94 12 9 13.94A.75.75 0 0 0 10.06 15L12 13.06 13.94 15A.75.75 0 0 0 15 13.94L13.06 12 15 10.06A.75.75 0 0 0 15 9"
  })), _path2$1 || (_path2$1 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M12 3a9 9 0 1 0 9 9 9.01 9.01 0 0 0-9-9m0 16.5a7.5 7.5 0 1 1 7.5-7.5 7.51 7.51 0 0 1-7.5 7.5"
  })));
};

var _path, _path2;
function _extends() { return _extends = Object.assign ? Object.assign.bind() : function (n) { for (var e = 1; e < arguments.length; e++) { var t = arguments[e]; for (var r in t) ({}).hasOwnProperty.call(t, r) && (n[r] = t[r]); } return n; }, _extends.apply(null, arguments); }
var SvgLink = function SvgLink(props) {
  return /*#__PURE__*/React.createElement("svg", _extends({
    xmlns: "http://www.w3.org/2000/svg",
    width: 24,
    height: 24,
    fill: "none",
    viewBox: "0 0 24 24"
  }, props), _path || (_path = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M6.75 3h5.5v1.5h-5.5C5.51 4.5 4.5 5.51 4.5 6.75v10.5c0 1.24 1.01 2.25 2.25 2.25h10.5c1.24 0 2.25-1.01 2.25-2.25v-5.5H21v5.5A3.754 3.754 0 0 1 17.25 21H6.75A3.754 3.754 0 0 1 3 17.25V6.75A3.754 3.754 0 0 1 6.75 3"
  })), _path2 || (_path2 = /*#__PURE__*/React.createElement("path", {
    fill: "currentColor",
    d: "M20.013 3h-3.946a.987.987 0 0 0 0 1.973h1.564l-6.342 6.342a1.004 1.004 0 0 0 0 1.396 1.004 1.004 0 0 0 1.396 0l6.342-6.342v1.564a.987.987 0 0 0 1.973 0V3.987A.987.987 0 0 0 20.013 3"
  })));
};

function Done({ onClick }) {
    const { DoneComponent } = useContext(ConfigContext);
    const style = { display: 'inline-block' };
    return typeof DoneComponent === 'function' ? (jsx(DoneComponent, { className: "json-view--edit", style: style, onClick: onClick })) : (jsx(SvgDone, { className: "json-view--edit", style: style, onClick: onClick }));
}
function Cancel({ onClick }) {
    const { CancelComponent } = useContext(ConfigContext);
    const style = { display: 'inline-block' };
    return typeof CancelComponent === 'function' ? (jsx(CancelComponent, { className: "json-view--edit", style: style, onClick: onClick })) : (jsx(SvgCancel, { className: "json-view--edit", style: style, onClick: onClick }));
}
function Row({ row, editing, deleting, adding, stringTruncated, index, style, measureRef }) {
    const config = useContext(ConfigContext);
    const handlers = useContext(HandlersContext);
    const { displaySize, displayArrayIndex, CustomOperation } = config;
    const customOptions = row.customOptions;
    // hoverable rows keep the legacy .json-view--pair class so consumer hover CSS
    // (icons revealed on pair:hover) keeps working; icons stay direct children.
    const isPair = row.kind === 'value' || row.kind === 'open' || row.kind === 'collapsed' || row.kind === 'chunk' || row.kind === 'chunk-open' || row.kind === 'custom';
    const wrap = (children) => (jsx("div", { className: isPair ? 'json-view--pair jv-row' : 'jv-row', "data-index": index, ref: measureRef, style: Object.assign(Object.assign({}, style), { paddingLeft: `${row.depth - 1}em` }), children: children }));
    const keyLabel = row.path.length === 0 || (row.parentType === 'array' && !displayArrayIndex) ? null : (jsxs(Fragment, { children: [jsx("span", { className: typeof row.indexOrName === 'number' ? 'json-view--index' : 'json-view--property', children: row.indexOrName }), ":", ' '] }));
    switch (row.kind) {
        case 'value':
            return wrap(jsxs(Fragment, { children: [keyLabel, jsx(ValueLeaf, { row: row, editing: editing, deleting: deleting, stringTruncated: stringTruncated })] }));
        case 'open':
            return wrap(jsxs(Fragment, { children: [keyLabel, jsx("span", { children: row.bracket }), jsx(ContainerIcons, { row: row, deleting: deleting, adding: adding, folded: false })] }));
        case 'collapsed':
            return wrap(jsxs(Fragment, { children: [keyLabel, jsx("span", { children: row.bracket }), typeof CustomOperation === 'function' ? jsx(CustomOperation, { node: row.value }) : null, jsx("button", { onClick: () => handlers.toggle(row), className: "jv-button", children: "..." }), jsx("span", { children: row.bracket === '{' ? '}' : ']' }), ifDisplay(displaySize, row.depth, true) && (jsxs("span", { onClick: () => handlers.toggle(row), className: "jv-size", children: [row.size, " Items"] }))] }));
        case 'close':
            return wrap(jsx("span", { children: row.bracket }));
        case 'chunk':
            return wrap(jsxs(Fragment, { children: [jsx("span", { children: '[' }), typeof CustomOperation === 'function' ? jsx(CustomOperation, { node: row.value }) : null, jsxs("button", { onClick: () => handlers.toggleChunk(row), className: "jv-button", children: [row.chunk.start, " ... ", row.chunk.end] }), jsx("span", { children: ']' })] }));
        case 'chunk-open':
            return wrap(jsxs(Fragment, { children: [jsx("span", { children: '[' }), jsxs("span", { onClick: () => handlers.toggleChunk(row), className: "jv-size-chevron", children: [ifDisplay(displaySize, row.depth, false) && jsxs("span", { className: "jv-size", children: [row.value.length, " Items"] }), jsx(SvgAngleDown, { className: "jv-chevron" })] }), config.enableClipboard && customCopy(customOptions) && (jsx(CopyButton, { node: row.value, nodeMeta: { depth: row.depth, indexOrName: row.chunk.index, parentPath: row.parentPath.map(String), currentPath: row.path.map(String) } })), typeof CustomOperation === 'function' ? jsx(CustomOperation, { node: row.value }) : null] }));
        case 'chunk-close':
            return wrap(jsx("span", { children: ']' }));
        case 'add-input':
            return wrap(jsx(AddInput, { row: row }));
        case 'custom': {
            const Custom = row.customRender;
            const content = React__default.isValidElement(Custom) ? Custom : jsx(Custom, { node: row.value, depth: row.depth, indexOrName: row.indexOrName });
            return wrap(jsxs(Fragment, { children: [keyLabel, content] }));
        }
        default:
            return null;
    }
}
// flatten() produces fresh FlatRow objects on every recompute, so a default
// shallow compare would re-render every mounted row. Compare the fields that
// actually affect output (incl. the virtual row's translateY) so unchanged rows
// skip re-render — this is what keeps large / scrolling lists cheap.
function areEqual(a, b) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    if (a.editing !== b.editing || a.deleting !== b.deleting || a.adding !== b.adding || a.index !== b.index)
        return false;
    if (a.stringTruncated !== b.stringTruncated)
        return false;
    if (((_a = a.style) === null || _a === void 0 ? void 0 : _a.transform) !== ((_b = b.style) === null || _b === void 0 ? void 0 : _b.transform))
        return false;
    const r1 = a.row;
    const r2 = b.row;
    return (r1.id === r2.id &&
        r1.kind === r2.kind &&
        r1.value === r2.value &&
        r1.depth === r2.depth &&
        r1.size === r2.size &&
        r1.indexOrName === r2.indexOrName &&
        r1.bracket === r2.bracket &&
        r1.customOptions === r2.customOptions &&
        r1.customRender === r2.customRender &&
        ((_c = r1.chunk) === null || _c === void 0 ? void 0 : _c.index) === ((_d = r2.chunk) === null || _d === void 0 ? void 0 : _d.index) &&
        ((_e = r1.chunk) === null || _e === void 0 ? void 0 : _e.start) === ((_f = r2.chunk) === null || _f === void 0 ? void 0 : _f.start) &&
        ((_g = r1.chunk) === null || _g === void 0 ? void 0 : _g.end) === ((_h = r2.chunk) === null || _h === void 0 ? void 0 : _h.end));
}
var Row$1 = React__default.memo(Row, areEqual);
function ValueLeaf({ row, editing, deleting, stringTruncated }) {
    const config = useContext(ConfigContext);
    const handlers = useContext(HandlersContext);
    const { editable, enableClipboard, matchesURL, urlRegExp, EditComponent, CustomOperation } = config;
    const customOptions = row.customOptions;
    const type = row.nodeType;
    const node = row.value;
    const valueRef = useRef(null);
    const key = pathKey(row.path);
    let className = 'json-view--string';
    switch (type) {
        case 'number':
        case 'bigint':
            className = 'json-view--number';
            break;
        case 'boolean':
            className = 'json-view--boolean';
            break;
        case 'null':
            className = 'json-view--null';
            break;
    }
    if (typeof (customOptions === null || customOptions === void 0 ? void 0 : customOptions.className) === 'string')
        className += ' ' + customOptions.className;
    if (deleting)
        className += ' json-view--deleting';
    let displayValue = String(node);
    if (type === 'bigint')
        displayValue += 'n';
    const commit = () => {
        var _a, _b;
        const text = (_b = (_a = valueRef.current) === null || _a === void 0 ? void 0 : _a.innerText) !== null && _b !== void 0 ? _b : '';
        try {
            handlers.editValue(row, JSON.parse(text));
        }
        catch (_c) {
            handlers.editValue(row, resolveEvalFailedNewValue(type, text));
        }
    };
    const handleKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            commit();
        }
        else if (event.key === 'Escape') {
            handlers.cancelEdit();
        }
    };
    useEffect(() => {
        if (editing && valueRef.current) {
            const el = valueRef.current;
            setTimeout(() => {
                var _a;
                (_a = window.getSelection()) === null || _a === void 0 ? void 0 : _a.selectAllChildren(el);
                el.focus();
            });
        }
    }, [editing]);
    const canEdit = editableEdit(editable) && customEdit(customOptions);
    const ctrlClick = !editing && !deleting && canEdit
        ? (event) => {
            if (event.ctrlKey || event.metaKey)
                handlers.startEdit(row);
        }
        : undefined;
    const EditingElement = useMemo(() => (jsx("span", { contentEditable: true, className: className, dangerouslySetInnerHTML: { __html: type === 'string' ? `"${displayValue}"` : displayValue }, ref: valueRef, onKeyDown: handleKeyDown })), [displayValue, type, className]);
    const isEditing = editing || deleting;
    const icons = (jsxs(Fragment, { children: [isEditing && jsx(Done, { onClick: deleting ? () => handlers.deleteRow(row) : commit }), isEditing && jsx(Cancel, { onClick: deleting ? () => handlers.cancelDelete() : () => handlers.cancelEdit() }), !isEditing && enableClipboard && customCopy(customOptions) && (jsx(CopyButton, { node: node, nodeMeta: { depth: row.depth, indexOrName: row.indexOrName, parentPath: row.parentPath.map(String), currentPath: row.path.map(String) } })), !isEditing && matchesURL && type === 'string' && urlRegExp.test(node) && customMatchesURL(customOptions) && (jsx("a", { href: node, target: "_blank", className: "json-view--link", rel: "noreferrer", children: jsx(SvgLink, {}) })), !isEditing &&
                canEdit &&
                (typeof EditComponent === 'function' ? (jsx(EditComponent, { className: "json-view--edit", onClick: () => handlers.startEdit(row) })) : (jsx(SvgEdit, { className: "json-view--edit", onClick: () => handlers.startEdit(row) }))), !isEditing && editableDelete(editable) && customDelete(customOptions) && jsx(SvgTrash, { className: "json-view--edit", onClick: () => handlers.startDelete(row) }), typeof CustomOperation === 'function' ? jsx(CustomOperation, { node: node }) : null] }));
    if (type === 'string') {
        return (jsxs(Fragment, { children: [editing ? (EditingElement) : (jsx(LongString, { str: node, ref: valueRef, className: className, ctrlClick: ctrlClick, truncated: stringTruncated, onToggleTruncated: next => handlers.setStringExpanded(key, next) })), icons] }));
    }
    return (jsxs(Fragment, { children: [editing ? (EditingElement) : (jsx("span", { className: className, onClick: ctrlClick, children: displayValue })), icons] }));
}
function ContainerIcons({ row, deleting, adding, folded }) {
    const config = useContext(ConfigContext);
    const handlers = useContext(HandlersContext);
    const { editable, enableClipboard, displaySize, CustomOperation } = config;
    const customOptions = row.customOptions;
    const isEditing = deleting || adding;
    const isArr = row.nodeType === 'array';
    return (jsxs(Fragment, { children: [!isEditing && (jsxs("span", { onClick: () => handlers.toggle(row), className: "jv-size-chevron", children: [ifDisplay(displaySize, row.depth, folded) && jsxs("span", { className: "jv-size", children: [row.size, " Items"] }), jsx(SvgAngleDown, { className: "jv-chevron" })] })), deleting && jsx(Done, { onClick: () => handlers.deleteRow(row) }), deleting && jsx(Cancel, { onClick: () => handlers.cancelDelete() }), !isEditing && enableClipboard && customCopy(customOptions) && (jsx(CopyButton, { node: row.value, nodeMeta: { depth: row.depth, indexOrName: row.indexOrName, parentPath: row.parentPath.map(String), currentPath: row.path.map(String) } })), !isEditing && editableAdd(editable) && customAdd(customOptions) && (jsx(SvgAddSquare, { className: "json-view--edit", onClick: () => (isArr ? handlers.pushArrayItem(row) : handlers.startAdd(row)) })), !isEditing && editableDelete(editable) && customDelete(customOptions) && jsx(SvgTrash, { className: "json-view--edit", onClick: () => handlers.startDelete(row) }), typeof CustomOperation === 'function' ? jsx(CustomOperation, { node: row.value }) : null] }));
}
function AddInput({ row }) {
    const handlers = useContext(HandlersContext);
    const inputRef = useRef(null);
    useEffect(() => {
        var _a;
        (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.focus();
    }, []);
    const submit = () => {
        var _a;
        const name = (_a = inputRef.current) === null || _a === void 0 ? void 0 : _a.value;
        if (name)
            handlers.addProperty(row, name);
    };
    const onKeyDown = (event) => {
        if (event.key === 'Enter') {
            event.preventDefault();
            submit();
        }
        else if (event.key === 'Escape') {
            handlers.cancelAdd();
        }
    };
    return (jsxs(Fragment, { children: [jsx("input", { className: "json-view--input", placeholder: "property", ref: inputRef, onKeyDown: onKeyDown }), jsx(Done, { onClick: submit }), jsx(Cancel, { onClick: () => handlers.cancelAdd() })] }));
}

function createLazyMeasurementsView(count, flat, getItemKey) {
  const cache = new Array(count);
  return new Proxy(cache, {
    get(target, prop, receiver) {
      if (typeof prop === "string") {
        const c = prop.charCodeAt(0);
        if (c >= 48 && c <= 57) {
          const i = +prop;
          if (Number.isInteger(i) && i >= 0 && i < count) {
            let v = target[i];
            if (!v) {
              const s = flat[i * 2];
              v = target[i] = {
                index: i,
                key: getItemKey(i),
                start: s,
                size: flat[i * 2 + 1],
                end: s + flat[i * 2 + 1],
                lane: 0
              };
            }
            return v;
          }
        }
        if (prop === "length") return count;
      }
      return Reflect.get(target, prop, receiver);
    }
  });
}

function memo(getDeps, fn, opts) {
  let deps = opts.initialDeps ?? [];
  let result;
  let isInitial = true;
  function memoizedFunction() {
    var _a;
    const debugEnabled = process.env.NODE_ENV !== "production" && !!opts.key && !!((_a = opts.debug) == null ? void 0 : _a.call(opts));
    let depTime = 0;
    if (debugEnabled) depTime = Date.now();
    const newDeps = getDeps();
    const depsChanged = newDeps.length !== deps.length || newDeps.some((dep, index) => deps[index] !== dep);
    if (!depsChanged) {
      return result;
    }
    deps = newDeps;
    let resultTime = 0;
    if (debugEnabled) resultTime = Date.now();
    result = fn(...newDeps);
    if (debugEnabled) {
      const depEndTime = Math.round((Date.now() - depTime) * 100) / 100;
      const resultEndTime = Math.round((Date.now() - resultTime) * 100) / 100;
      const resultFpsPercentage = resultEndTime / 16;
      const pad = (str, num) => {
        str = String(str);
        while (str.length < num) {
          str = " " + str;
        }
        return str;
      };
      console.info(
        `%c⏱ ${pad(resultEndTime, 5)} /${pad(depEndTime, 5)} ms`,
        `
            font-size: .6rem;
            font-weight: bold;
            color: hsl(${Math.max(
          0,
          Math.min(120 - 120 * resultFpsPercentage, 120)
        )}deg 100% 31%);`,
        opts == null ? void 0 : opts.key
      );
    }
    if ((opts == null ? void 0 : opts.onChange) && !(isInitial && opts.skipInitialOnChange)) {
      opts.onChange(result);
    }
    isInitial = false;
    return result;
  }
  memoizedFunction.updateDeps = (newDeps) => {
    deps = newDeps;
  };
  return memoizedFunction;
}
function notUndefined(value, msg) {
  if (value === void 0) {
    throw new Error(`Unexpected undefined${msg ? `: ${msg}` : ""}`);
  } else {
    return value;
  }
}
const approxEqual = (a, b) => Math.abs(a - b) < 1.01;
const debounce = (targetWindow, fn, ms) => {
  let timeoutId;
  return function(...args) {
    targetWindow.clearTimeout(timeoutId);
    timeoutId = targetWindow.setTimeout(() => fn.apply(this, args), ms);
  };
};

let _isIOSResult;
const isIOSWebKit = () => {
  if (_isIOSResult !== void 0) return _isIOSResult;
  if (typeof navigator === "undefined") return _isIOSResult = false;
  if (/iP(hone|od|ad)/.test(navigator.userAgent)) return _isIOSResult = true;
  const mtp = navigator.maxTouchPoints;
  return _isIOSResult = navigator.platform === "MacIntel" && mtp !== void 0 && mtp > 0;
};
const getRect = (element) => {
  const { offsetWidth, offsetHeight } = element;
  return { width: offsetWidth, height: offsetHeight };
};
const defaultKeyExtractor = (index) => index;
const defaultRangeExtractor = (range) => {
  const start = Math.max(range.startIndex - range.overscan, 0);
  const end = Math.min(range.endIndex + range.overscan, range.count - 1);
  const len = end - start + 1;
  const arr = new Array(len);
  for (let i = 0; i < len; i++) {
    arr[i] = start + i;
  }
  return arr;
};
const observeElementRect = (instance, cb) => {
  const element = instance.scrollElement;
  if (!element) {
    return;
  }
  const targetWindow = instance.targetWindow;
  if (!targetWindow) {
    return;
  }
  const handler = (rect) => {
    const { width, height } = rect;
    cb({ width: Math.round(width), height: Math.round(height) });
  };
  handler(getRect(element));
  if (!targetWindow.ResizeObserver) {
    return () => {
    };
  }
  const observer = new targetWindow.ResizeObserver((entries) => {
    const run = () => {
      const entry = entries[0];
      if (entry == null ? void 0 : entry.borderBoxSize) {
        const box = entry.borderBoxSize[0];
        if (box) {
          handler({ width: box.inlineSize, height: box.blockSize });
          return;
        }
      }
      handler(getRect(element));
    };
    instance.options.useAnimationFrameWithResizeObserver ? requestAnimationFrame(run) : run();
  });
  observer.observe(element, { box: "border-box" });
  return () => {
    observer.unobserve(element);
  };
};
const addEventListenerOptions = {
  passive: true
};
const supportsScrollend = typeof window == "undefined" ? true : "onscrollend" in window;
const observeOffset = (instance, cb, readOffset) => {
  const element = instance.scrollElement;
  if (!element) {
    return;
  }
  const targetWindow = instance.targetWindow;
  if (!targetWindow) {
    return;
  }
  const registerScrollendEvent = instance.options.useScrollendEvent && supportsScrollend;
  let offset = 0;
  const fallback = registerScrollendEvent ? null : debounce(
    targetWindow,
    () => cb(offset, false),
    instance.options.isScrollingResetDelay
  );
  const createHandler = (isScrolling) => () => {
    offset = readOffset(element);
    fallback == null ? void 0 : fallback();
    cb(offset, isScrolling);
  };
  const handler = createHandler(true);
  const endHandler = createHandler(false);
  element.addEventListener("scroll", handler, addEventListenerOptions);
  if (registerScrollendEvent) {
    element.addEventListener("scrollend", endHandler, addEventListenerOptions);
  }
  return () => {
    element.removeEventListener("scroll", handler);
    if (registerScrollendEvent) {
      element.removeEventListener("scrollend", endHandler);
    }
  };
};
const observeElementOffset = (instance, cb) => observeOffset(instance, cb, (el) => {
  const { horizontal, isRtl } = instance.options;
  return horizontal ? el.scrollLeft * (isRtl && -1 || 1) : el.scrollTop;
});
const measureElement = (element, entry, instance) => {
  if (instance.options.useCachedMeasurements) {
    const index = instance.indexFromElement(element);
    const key = instance.options.getItemKey(index);
    return instance.itemSizeCache.get(key) ?? instance.options.estimateSize(index);
  }
  if (entry == null ? void 0 : entry.borderBoxSize) {
    const box = entry.borderBoxSize[0];
    if (box) {
      const size = Math.round(
        box[instance.options.horizontal ? "inlineSize" : "blockSize"]
      );
      return size;
    }
  }
  if (!entry) {
    const index = instance.indexFromElement(element);
    const key = instance.options.getItemKey(index);
    const cachedSize = instance.itemSizeCache.get(key);
    if (cachedSize !== void 0) {
      return cachedSize;
    }
  }
  return element[instance.options.horizontal ? "offsetWidth" : "offsetHeight"];
};
const scrollWithAdjustments = (offset, {
  adjustments = 0,
  behavior
}, instance) => {
  var _a, _b;
  (_b = (_a = instance.scrollElement) == null ? void 0 : _a.scrollTo) == null ? void 0 : _b.call(_a, {
    [instance.options.horizontal ? "left" : "top"]: offset + adjustments,
    behavior
  });
};
const elementScroll = scrollWithAdjustments;
class Virtualizer {
  constructor(opts) {
    this.unsubs = [];
    this.scrollElement = null;
    this.targetWindow = null;
    this.isScrolling = false;
    this.scrollState = null;
    this.measurementsCache = [];
    this._flatMeasurements = null;
    this.itemSizeCache = /* @__PURE__ */ new Map();
    this.itemSizeCacheVersion = 0;
    this.laneAssignments = /* @__PURE__ */ new Map();
    this.pendingMin = null;
    this.prevLanes = void 0;
    this.lanesChangedFlag = false;
    this.lanesSettling = false;
    this.pendingScrollAnchor = null;
    this.scrollRect = null;
    this.scrollOffset = null;
    this.scrollDirection = null;
    this.scrollAdjustments = 0;
    this._iosDeferredAdjustment = 0;
    this._iosTouching = false;
    this._iosJustTouchEnded = false;
    this._iosTouchEndTimerId = null;
    this._intendedScrollOffset = null;
    this.elementsCache = /* @__PURE__ */ new Map();
    this.now = () => {
      var _a, _b, _c;
      return ((_c = (_b = (_a = this.targetWindow) == null ? void 0 : _a.performance) == null ? void 0 : _b.now) == null ? void 0 : _c.call(_b)) ?? Date.now();
    };
    this.observer = /* @__PURE__ */ (() => {
      let _ro = null;
      const get = () => {
        if (_ro) {
          return _ro;
        }
        if (!this.targetWindow || !this.targetWindow.ResizeObserver) {
          return null;
        }
        return _ro = new this.targetWindow.ResizeObserver((entries) => {
          entries.forEach((entry) => {
            const run = () => {
              const node = entry.target;
              const index = this.indexFromElement(node);
              if (!node.isConnected) {
                this.observer.unobserve(node);
                for (const [cacheKey, cachedNode] of this.elementsCache) {
                  if (cachedNode === node) {
                    this.elementsCache.delete(cacheKey);
                    break;
                  }
                }
                return;
              }
              if (this.shouldMeasureDuringScroll(index)) {
                this.resizeItem(
                  index,
                  this.options.measureElement(node, entry, this)
                );
              }
            };
            this.options.useAnimationFrameWithResizeObserver ? requestAnimationFrame(run) : run();
          });
        });
      };
      return {
        disconnect: () => {
          var _a;
          (_a = get()) == null ? void 0 : _a.disconnect();
          _ro = null;
        },
        observe: (target) => {
          var _a;
          return (_a = get()) == null ? void 0 : _a.observe(target, { box: "border-box" });
        },
        unobserve: (target) => {
          var _a;
          return (_a = get()) == null ? void 0 : _a.unobserve(target);
        }
      };
    })();
    this.range = null;
    this.setOptions = (opts2) => {
      var _a, _b;
      const merged = {
        debug: false,
        initialOffset: 0,
        overscan: 1,
        paddingStart: 0,
        paddingEnd: 0,
        scrollPaddingStart: 0,
        scrollPaddingEnd: 0,
        horizontal: false,
        getItemKey: defaultKeyExtractor,
        rangeExtractor: defaultRangeExtractor,
        onChange: () => {
        },
        measureElement,
        initialRect: { width: 0, height: 0 },
        scrollMargin: 0,
        gap: 0,
        indexAttribute: "data-index",
        initialMeasurementsCache: [],
        lanes: 1,
        anchorTo: "start",
        followOnAppend: false,
        scrollEndThreshold: 1,
        isScrollingResetDelay: 150,
        enabled: true,
        isRtl: false,
        useScrollendEvent: false,
        useAnimationFrameWithResizeObserver: false,
        laneAssignmentMode: "estimate",
        useCachedMeasurements: false
      };
      for (const key in opts2) {
        const v = opts2[key];
        if (v !== void 0) merged[key] = v;
      }
      const prevOptions = this.options;
      let anchor = null;
      let followOnAppend = null;
      let edgeKeysChanged = false;
      if (prevOptions !== void 0 && prevOptions.enabled && merged.enabled && merged.anchorTo === "end" && this.scrollElement !== null) {
        const prevCount = prevOptions.count;
        const nextCount = merged.count;
        const measurements = this.getMeasurements();
        const prevFirstKey = prevCount > 0 ? ((_a = measurements[0]) == null ? void 0 : _a.key) ?? prevOptions.getItemKey(0) : null;
        const prevLastKey = prevCount > 0 ? ((_b = measurements[prevCount - 1]) == null ? void 0 : _b.key) ?? prevOptions.getItemKey(prevCount - 1) : null;
        const didCountChange = nextCount !== prevCount;
        const didEdgeKeysChange = didCountChange || prevCount > 0 && nextCount > 0 && (merged.getItemKey(0) !== prevFirstKey || merged.getItemKey(nextCount - 1) !== prevLastKey);
        if (didEdgeKeysChange) {
          edgeKeysChanged = true;
          const item = prevCount > 0 ? this.getVirtualItemForOffset(this.getScrollOffset()) ?? measurements[0] : null;
          if (item) {
            anchor = [item.key, this.getScrollOffset() - item.start];
          }
          const behavior = merged.followOnAppend === true ? "auto" : merged.followOnAppend || null;
          if (behavior && nextCount > prevCount && this.isAtEnd(prevOptions.scrollEndThreshold) && (prevCount === 0 || merged.getItemKey(nextCount - 1) !== prevLastKey)) {
            followOnAppend = behavior;
          }
        }
      }
      this.options = merged;
      if (edgeKeysChanged) {
        this.pendingMin = 0;
        this.itemSizeCacheVersion++;
      }
      let anchorResolved = false;
      let anchorDelta = 0;
      if (anchor && this.scrollOffset !== null) {
        const [anchorKey, anchorOffset] = anchor;
        const newMeasurements = this.getMeasurements();
        const { count, getItemKey } = this.options;
        let idx = 0;
        while (idx < count && getItemKey(idx) !== anchorKey) {
          idx++;
        }
        if (idx < count) {
          const anchorItem = newMeasurements[idx];
          if (anchorItem) {
            const newOffset = anchorItem.start + anchorOffset;
            if (newOffset !== this.scrollOffset) {
              anchorDelta = newOffset - this.scrollOffset;
              this.scrollOffset = newOffset;
              anchorResolved = true;
            }
          }
        }
      }
      if (anchorResolved || followOnAppend) {
        this.pendingScrollAnchor = [
          anchorResolved ? anchor[0] : null,
          anchorResolved ? anchor[1] : 0,
          followOnAppend,
          anchorDelta
        ];
      }
    };
    this.notify = (sync) => {
      var _a, _b;
      (_b = (_a = this.options).onChange) == null ? void 0 : _b.call(_a, this, sync);
    };
    this.maybeNotify = memo(
      () => {
        this.calculateRange();
        return [
          this.isScrolling,
          this.range ? this.range.startIndex : null,
          this.range ? this.range.endIndex : null
        ];
      },
      (isScrolling) => {
        this.notify(isScrolling);
      },
      {
        key: process.env.NODE_ENV !== "production" && "maybeNotify",
        debug: () => this.options.debug,
        initialDeps: [
          this.isScrolling,
          this.range ? this.range.startIndex : null,
          this.range ? this.range.endIndex : null
        ]
      }
    );
    this.cleanup = () => {
      this.unsubs.filter(Boolean).forEach((d) => d());
      this.unsubs = [];
      this.observer.disconnect();
      if (this.rafId != null && this.targetWindow) {
        this.targetWindow.cancelAnimationFrame(this.rafId);
        this.rafId = null;
      }
      this.scrollState = null;
      this._iosDeferredAdjustment = 0;
      this._iosTouching = false;
      this._iosJustTouchEnded = false;
      this.scrollElement = null;
      this.targetWindow = null;
    };
    this._didMount = () => {
      return () => {
        this.cleanup();
      };
    };
    this._willUpdate = () => {
      var _a;
      const scrollElement = this.options.enabled ? this.options.getScrollElement() : null;
      if (this.scrollElement !== scrollElement) {
        this.cleanup();
        if (!scrollElement) {
          this.maybeNotify();
          return;
        }
        this.scrollElement = scrollElement;
        if (this.scrollElement && "ownerDocument" in this.scrollElement) {
          this.targetWindow = this.scrollElement.ownerDocument.defaultView;
        } else {
          this.targetWindow = ((_a = this.scrollElement) == null ? void 0 : _a.window) ?? null;
        }
        this.elementsCache.forEach((cached) => {
          this.observer.observe(cached);
        });
        this.unsubs.push(
          this.options.observeElementRect(this, (rect) => {
            this.scrollRect = rect;
            this.maybeNotify();
          })
        );
        this.unsubs.push(
          this.options.observeElementOffset(this, (offset, isScrolling) => {
            if (isScrolling && this._intendedScrollOffset === null && offset === this.scrollOffset) {
              return;
            }
            if (this._intendedScrollOffset !== null && Math.abs(offset - this._intendedScrollOffset) < 1.5) {
              offset = this._intendedScrollOffset;
            }
            this._intendedScrollOffset = null;
            this.scrollAdjustments = 0;
            const prevOffset = this.getScrollOffset();
            this.scrollDirection = isScrolling ? prevOffset === offset ? this.scrollDirection : prevOffset < offset ? "forward" : "backward" : null;
            this.scrollOffset = offset;
            this.isScrolling = isScrolling;
            this._flushIosDeferredIfReady();
            if (this.scrollState) {
              this.scheduleScrollReconcile();
            }
            this.maybeNotify();
          })
        );
        if ("addEventListener" in this.scrollElement) {
          const scrollEl = this.scrollElement;
          const onTouchStart = () => {
            this._iosTouching = true;
            this._iosJustTouchEnded = false;
            if (this._iosTouchEndTimerId !== null && this.targetWindow != null) {
              this.targetWindow.clearTimeout(this._iosTouchEndTimerId);
              this._iosTouchEndTimerId = null;
            }
          };
          const onTouchEnd = () => {
            this._iosTouching = false;
            if (!isIOSWebKit() || this.targetWindow == null) {
              return;
            }
            this._iosJustTouchEnded = true;
            this._iosTouchEndTimerId = this.targetWindow.setTimeout(() => {
              this._iosJustTouchEnded = false;
              this._iosTouchEndTimerId = null;
              this._flushIosDeferredIfReady();
            }, 150);
          };
          scrollEl.addEventListener(
            "touchstart",
            onTouchStart,
            addEventListenerOptions
          );
          scrollEl.addEventListener(
            "touchend",
            onTouchEnd,
            addEventListenerOptions
          );
          this.unsubs.push(() => {
            scrollEl.removeEventListener("touchstart", onTouchStart);
            scrollEl.removeEventListener("touchend", onTouchEnd);
            if (this._iosTouchEndTimerId !== null && this.targetWindow != null) {
              this.targetWindow.clearTimeout(this._iosTouchEndTimerId);
              this._iosTouchEndTimerId = null;
            }
          });
        }
        this._scrollToOffset(this.getScrollOffset(), {
          adjustments: void 0,
          behavior: void 0
        });
      }
      const anchor = this.pendingScrollAnchor;
      this.pendingScrollAnchor = null;
      if (anchor && this.scrollElement && this.options.enabled) {
        const [key, _offset, followOnAppend, anchorDelta] = anchor;
        if (key !== null && !followOnAppend) {
          if (isIOSWebKit() && (this.isScrolling || this._iosTouching || this._iosJustTouchEnded)) {
            if (anchorDelta !== 0) {
              this._iosDeferredAdjustment += anchorDelta;
            }
          } else {
            this._scrollToOffset(this.getScrollOffset(), {
              adjustments: void 0,
              behavior: void 0
            });
          }
        }
        if (followOnAppend) {
          this.scrollToEnd({ behavior: followOnAppend });
        }
      }
    };
    this._flushIosDeferredIfReady = () => {
      if (this._iosDeferredAdjustment === 0) return;
      if (this.isScrolling) return;
      if (this._iosTouching) return;
      if (this._iosJustTouchEnded) return;
      const cur = this.getScrollOffset();
      const max = this.getMaxScrollOffset();
      if (cur < 0 || cur > max) return;
      const delta = this._iosDeferredAdjustment;
      this._iosDeferredAdjustment = 0;
      this._scrollToOffset(cur, {
        adjustments: this.scrollAdjustments += delta,
        behavior: void 0
      });
    };
    this.rafId = null;
    this.getSize = () => {
      if (!this.options.enabled) {
        this.scrollRect = null;
        return 0;
      }
      this.scrollRect = this.scrollRect ?? this.options.initialRect;
      return this.scrollRect[this.options.horizontal ? "width" : "height"];
    };
    this.getScrollOffset = () => {
      if (!this.options.enabled) {
        this.scrollOffset = null;
        return 0;
      }
      this.scrollOffset = this.scrollOffset ?? (typeof this.options.initialOffset === "function" ? this.options.initialOffset() : this.options.initialOffset);
      return this.scrollOffset;
    };
    this.getMeasurementOptions = memo(
      () => [
        this.options.count,
        this.options.paddingStart,
        this.options.scrollMargin,
        this.options.getItemKey,
        this.options.enabled,
        this.options.lanes,
        this.options.laneAssignmentMode,
        this.options.gap
      ],
      (count, paddingStart, scrollMargin, getItemKey, enabled, lanes, laneAssignmentMode, gap) => {
        const lanesChanged = this.prevLanes !== void 0 && this.prevLanes !== lanes;
        if (lanesChanged) {
          this.lanesChangedFlag = true;
        }
        this.prevLanes = lanes;
        this.pendingMin = null;
        return {
          count,
          paddingStart,
          scrollMargin,
          getItemKey,
          enabled,
          lanes,
          laneAssignmentMode,
          gap
        };
      },
      {
        key: false
      }
    );
    this.getMeasurements = memo(
      () => [this.getMeasurementOptions(), this.itemSizeCacheVersion],
      ({
        count,
        paddingStart,
        scrollMargin,
        getItemKey,
        enabled,
        lanes,
        laneAssignmentMode,
        gap
      }, _itemSizeCacheVersion) => {
        const itemSizeCache = this.itemSizeCache;
        if (!enabled) {
          this.measurementsCache = [];
          this.itemSizeCache.clear();
          this.laneAssignments.clear();
          return [];
        }
        if (this.laneAssignments.size > count) {
          for (const index of this.laneAssignments.keys()) {
            if (index >= count) {
              this.laneAssignments.delete(index);
            }
          }
        }
        if (this.lanesChangedFlag) {
          this.lanesChangedFlag = false;
          this.lanesSettling = true;
          this.measurementsCache = [];
          this.itemSizeCache.clear();
          this.laneAssignments.clear();
          this.pendingMin = null;
        }
        if (this.measurementsCache.length === 0 && !this.lanesSettling) {
          this.measurementsCache = this.options.initialMeasurementsCache;
          this.measurementsCache.forEach((item) => {
            this.itemSizeCache.set(item.key, item.size);
          });
        }
        const min = this.lanesSettling ? 0 : this.pendingMin ?? 0;
        this.pendingMin = null;
        if (this.lanesSettling && this.measurementsCache.length === count) {
          this.lanesSettling = false;
        }
        if (lanes === 1) {
          const need = count * 2;
          let flat = this._flatMeasurements;
          if (!flat || flat.length < need) {
            const next = new Float64Array(need);
            if (flat && min > 0) next.set(flat.subarray(0, min * 2));
            flat = next;
            this._flatMeasurements = flat;
          }
          let runningStart;
          if (min === 0) {
            runningStart = paddingStart + scrollMargin;
          } else {
            const prevIdx = min - 1;
            runningStart = flat[prevIdx * 2] + flat[prevIdx * 2 + 1] + gap;
          }
          for (let i = min; i < count; i++) {
            const key = getItemKey(i);
            const measuredSize = itemSizeCache.get(key);
            const size = typeof measuredSize === "number" ? measuredSize : this.options.estimateSize(i);
            flat[i * 2] = runningStart;
            flat[i * 2 + 1] = size;
            runningStart += size + gap;
          }
          const view = createLazyMeasurementsView(count, flat, getItemKey);
          this.measurementsCache = view;
          return view;
        }
        const measurements = this.measurementsCache.slice(0, min);
        const laneLastIndex = new Array(lanes).fill(
          void 0
        );
        const laneEnds = new Float64Array(lanes);
        let filledLanes = 0;
        for (let m = 0; m < min; m++) {
          const item = measurements[m];
          if (item) {
            if (laneLastIndex[item.lane] === void 0) filledLanes++;
            laneLastIndex[item.lane] = m;
            laneEnds[item.lane] = item.end;
          }
        }
        for (let i = min; i < count; i++) {
          const key = getItemKey(i);
          const cachedLane = this.laneAssignments.get(i);
          let lane;
          let start;
          const shouldCacheLane = laneAssignmentMode === "estimate" || itemSizeCache.has(key);
          if (cachedLane !== void 0 && this.options.lanes > 1) {
            lane = cachedLane;
            const prevIndex = laneLastIndex[lane];
            const prevInLane = prevIndex !== void 0 ? measurements[prevIndex] : void 0;
            start = prevInLane ? prevInLane.end + gap : paddingStart + scrollMargin;
          } else if (filledLanes === lanes) {
            let bestLane = 0;
            let bestEnd = laneEnds[0];
            let bestIdx = laneLastIndex[0];
            for (let l = 1; l < lanes; l++) {
              const e = laneEnds[l];
              if (e < bestEnd || e === bestEnd && laneLastIndex[l] < bestIdx) {
                bestLane = l;
                bestEnd = e;
                bestIdx = laneLastIndex[l];
              }
            }
            lane = bestLane;
            start = bestEnd + gap;
            if (shouldCacheLane) {
              this.laneAssignments.set(i, lane);
            }
          } else {
            lane = i % this.options.lanes;
            start = paddingStart + scrollMargin;
            if (shouldCacheLane) {
              this.laneAssignments.set(i, lane);
            }
          }
          const measuredSize = itemSizeCache.get(key);
          const size = typeof measuredSize === "number" ? measuredSize : this.options.estimateSize(i);
          const end = start + size;
          measurements[i] = {
            index: i,
            start,
            size,
            end,
            key,
            lane
          };
          if (laneLastIndex[lane] === void 0) filledLanes++;
          laneLastIndex[lane] = i;
          laneEnds[lane] = end;
        }
        this.measurementsCache = measurements;
        return measurements;
      },
      {
        key: process.env.NODE_ENV !== "production" && "getMeasurements",
        debug: () => this.options.debug
      }
    );
    this.calculateRange = memo(
      () => [
        this.getMeasurements(),
        this.getSize(),
        this.getScrollOffset(),
        this.options.lanes
      ],
      (measurements, outerSize, scrollOffset, lanes) => {
        if (measurements.length === 0 || outerSize === 0) {
          this.range = null;
          return null;
        }
        this.range = calculateRangeImpl(
          measurements,
          outerSize,
          scrollOffset,
          lanes,
          // Pass the typed array so binary search + forward-walk can read
          // start/end directly from Float64Array, skipping the Proxy traps.
          lanes === 1 && this._flatMeasurements != null ? this._flatMeasurements : null
        );
        return this.range;
      },
      {
        key: process.env.NODE_ENV !== "production" && "calculateRange",
        debug: () => this.options.debug
      }
    );
    this.getVirtualIndexes = memo(
      () => {
        let startIndex = null;
        let endIndex = null;
        const range = this.calculateRange();
        if (range) {
          startIndex = range.startIndex;
          endIndex = range.endIndex;
        }
        this.maybeNotify.updateDeps([this.isScrolling, startIndex, endIndex]);
        return [
          this.options.rangeExtractor,
          this.options.overscan,
          this.options.count,
          startIndex,
          endIndex
        ];
      },
      (rangeExtractor, overscan, count, startIndex, endIndex) => {
        return startIndex === null || endIndex === null ? [] : rangeExtractor({
          startIndex,
          endIndex,
          overscan,
          count
        });
      },
      {
        key: process.env.NODE_ENV !== "production" && "getVirtualIndexes",
        debug: () => this.options.debug
      }
    );
    this.indexFromElement = (node) => {
      const attributeName = this.options.indexAttribute;
      const indexStr = node.getAttribute(attributeName);
      if (!indexStr) {
        console.warn(
          `Missing attribute name '${attributeName}={index}' on measured element.`
        );
        return -1;
      }
      return parseInt(indexStr, 10);
    };
    this.shouldMeasureDuringScroll = (index) => {
      var _a;
      if (!this.scrollState || this.scrollState.behavior !== "smooth") {
        return true;
      }
      const scrollIndex = this.scrollState.index ?? ((_a = this.getVirtualItemForOffset(this.scrollState.lastTargetOffset)) == null ? void 0 : _a.index);
      if (scrollIndex !== void 0 && this.range) {
        const bufferSize = Math.max(
          this.options.overscan,
          Math.ceil((this.range.endIndex - this.range.startIndex) / 2)
        );
        const minIndex = Math.max(0, scrollIndex - bufferSize);
        const maxIndex = Math.min(
          this.options.count - 1,
          scrollIndex + bufferSize
        );
        return index >= minIndex && index <= maxIndex;
      }
      return true;
    };
    this.measureElement = (node) => {
      if (!node) {
        this.elementsCache.forEach((cached, key2) => {
          if (!cached.isConnected) {
            this.observer.unobserve(cached);
            this.elementsCache.delete(key2);
          }
        });
        return;
      }
      const index = this.indexFromElement(node);
      const key = this.options.getItemKey(index);
      const prevNode = this.elementsCache.get(key);
      if (prevNode !== node) {
        if (prevNode) {
          this.observer.unobserve(prevNode);
        }
        this.observer.observe(node);
        this.elementsCache.set(key, node);
      }
      if ((!this.isScrolling || this.scrollState) && this.shouldMeasureDuringScroll(index)) {
        this.resizeItem(index, this.options.measureElement(node, void 0, this));
      }
    };
    this.resizeItem = (index, size) => {
      var _a, _b;
      if (index < 0 || index >= this.options.count) return;
      let cachedSize;
      let itemStart;
      let key;
      const flat = this._flatMeasurements;
      if (this.options.lanes === 1 && flat !== null) {
        key = this.options.getItemKey(index);
        itemStart = flat[index * 2];
        cachedSize = flat[index * 2 + 1];
      } else {
        const item = this.measurementsCache[index];
        if (!item) return;
        key = item.key;
        itemStart = item.start;
        cachedSize = item.size;
      }
      const itemSize = this.itemSizeCache.get(key) ?? cachedSize;
      const delta = size - itemSize;
      if (delta !== 0) {
        const wasAtEnd = this.options.anchorTo === "end" && ((_a = this.scrollState) == null ? void 0 : _a.behavior) !== "smooth" && this.getVirtualDistanceFromEnd() <= this.options.scrollEndThreshold;
        const prevTotalSize = wasAtEnd ? this.getTotalSize() : 0;
        const shouldAdjustScroll = ((_b = this.scrollState) == null ? void 0 : _b.behavior) !== "smooth" && (this.shouldAdjustScrollPositionOnItemSizeChange !== void 0 ? this.shouldAdjustScrollPositionOnItemSizeChange(
          // The callback expects a VirtualItem; build one lazily only
          // when the consumer actually supplied a custom predicate.
          this.measurementsCache[index] ?? {
            index,
            key,
            start: itemStart,
            size: cachedSize,
            end: itemStart + cachedSize,
            lane: 0
          },
          delta,
          this
        ) : (
          // Default: adjust when the resize is an above-viewport item.
          // First measurement (!has(key)): always adjust — the item
          // has never been sized, so the estimate→actual delta must
          // be compensated regardless of scroll direction.
          // Re-measurement (has(key)): skip during backward scroll
          // to avoid the "items jump while scrolling up" cascade.
          itemStart < this.getScrollOffset() + this.scrollAdjustments && (!this.itemSizeCache.has(key) || this.scrollDirection !== "backward")
        ));
        if (this.pendingMin === null || index < this.pendingMin) {
          this.pendingMin = index;
        }
        this.itemSizeCache.set(key, size);
        this.itemSizeCacheVersion++;
        if (wasAtEnd) {
          this.applyScrollAdjustment(this.getTotalSize() - prevTotalSize);
        } else if (shouldAdjustScroll) {
          this.applyScrollAdjustment(delta);
        }
        this.notify(false);
      }
    };
    this.getVirtualItems = memo(
      () => [this.getVirtualIndexes(), this.getMeasurements()],
      (indexes, measurements) => {
        const virtualItems = [];
        for (let k = 0, len = indexes.length; k < len; k++) {
          const i = indexes[k];
          const measurement = measurements[i];
          virtualItems.push(measurement);
        }
        return virtualItems;
      },
      {
        key: process.env.NODE_ENV !== "production" && "getVirtualItems",
        debug: () => this.options.debug
      }
    );
    this.getVirtualItemForOffset = (offset) => {
      const measurements = this.getMeasurements();
      if (measurements.length === 0) {
        return void 0;
      }
      const flat = this._flatMeasurements;
      const useFlat = this.options.lanes === 1 && flat != null;
      const idx = findNearestBinarySearch(
        0,
        measurements.length - 1,
        useFlat ? (i) => flat[i * 2] : (i) => notUndefined(measurements[i]).start,
        offset
      );
      return notUndefined(measurements[idx]);
    };
    this.getMaxScrollOffset = () => {
      if (!this.scrollElement) return 0;
      if ("scrollHeight" in this.scrollElement) {
        return this.options.horizontal ? this.scrollElement.scrollWidth - this.scrollElement.clientWidth : this.scrollElement.scrollHeight - this.scrollElement.clientHeight;
      } else {
        const doc = this.scrollElement.document.documentElement;
        return this.options.horizontal ? doc.scrollWidth - this.scrollElement.innerWidth : doc.scrollHeight - this.scrollElement.innerHeight;
      }
    };
    this.getVirtualDistanceFromEnd = () => {
      return Math.max(
        this.getTotalSize() - this.getSize() - this.getScrollOffset(),
        0
      );
    };
    this.getDistanceFromEnd = () => {
      return Math.max(this.getMaxScrollOffset() - this.getScrollOffset(), 0);
    };
    this.isAtEnd = (threshold = this.options.scrollEndThreshold) => {
      return this.getDistanceFromEnd() <= threshold;
    };
    this.getOffsetForAlignment = (toOffset, align, itemSize = 0) => {
      if (!this.scrollElement) return 0;
      const size = this.getSize();
      const scrollOffset = this.getScrollOffset();
      if (align === "auto") {
        align = toOffset >= scrollOffset + size ? "end" : "start";
      }
      if (align === "center") {
        toOffset += (itemSize - size) / 2;
      } else if (align === "end") {
        toOffset -= size;
      }
      const maxOffset = this.getMaxScrollOffset();
      return Math.max(Math.min(maxOffset, toOffset), 0);
    };
    this.getOffsetForIndex = (index, align = "auto") => {
      index = Math.max(0, Math.min(index, this.options.count - 1));
      const size = this.getSize();
      const scrollOffset = this.getScrollOffset();
      const item = this.measurementsCache[index];
      if (!item) return;
      if (align === "auto") {
        if (item.end >= scrollOffset + size - this.options.scrollPaddingEnd) {
          align = "end";
        } else if (item.start <= scrollOffset + this.options.scrollPaddingStart) {
          align = "start";
        } else {
          return [scrollOffset, align];
        }
      }
      if (align === "end" && index === this.options.count - 1) {
        return [this.getMaxScrollOffset(), align];
      }
      const toOffset = align === "end" ? item.end + this.options.scrollPaddingEnd : item.start - this.options.scrollPaddingStart;
      return [
        this.getOffsetForAlignment(toOffset, align, item.size),
        align
      ];
    };
    this.scrollToOffset = (toOffset, { align = "start", behavior = "auto" } = {}) => {
      const offset = this.getOffsetForAlignment(toOffset, align);
      const now = this.now();
      this.scrollState = {
        index: null,
        align,
        behavior,
        startedAt: now,
        lastTargetOffset: offset,
        stableFrames: 0
      };
      this._scrollToOffset(offset, { adjustments: void 0, behavior });
      this.scheduleScrollReconcile();
    };
    this.scrollToIndex = (index, {
      align: initialAlign = "auto",
      behavior = "auto"
    } = {}) => {
      index = Math.max(0, Math.min(index, this.options.count - 1));
      const offsetInfo = this.getOffsetForIndex(index, initialAlign);
      if (!offsetInfo) {
        return;
      }
      const [offset, align] = offsetInfo;
      const now = this.now();
      this.scrollState = {
        index,
        align,
        behavior,
        startedAt: now,
        lastTargetOffset: offset,
        stableFrames: 0
      };
      this._scrollToOffset(offset, { adjustments: void 0, behavior });
      this.scheduleScrollReconcile();
    };
    this.scrollBy = (delta, { behavior = "auto" } = {}) => {
      const offset = this.getScrollOffset() + delta;
      const now = this.now();
      this.scrollState = {
        index: null,
        align: "start",
        behavior,
        startedAt: now,
        lastTargetOffset: offset,
        stableFrames: 0
      };
      this._scrollToOffset(offset, { adjustments: void 0, behavior });
      this.scheduleScrollReconcile();
    };
    this.scrollToEnd = ({ behavior = "auto" } = {}) => {
      if (this.options.count > 0) {
        this.scrollToIndex(this.options.count - 1, {
          align: "end",
          behavior
        });
        return;
      }
      this.scrollToOffset(Math.max(this.getTotalSize() - this.getSize(), 0), {
        behavior
      });
    };
    this.getTotalSize = () => {
      var _a;
      const measurements = this.getMeasurements();
      let end;
      if (measurements.length === 0) {
        end = this.options.paddingStart;
      } else if (this.options.lanes === 1) {
        const lastIdx = measurements.length - 1;
        const flat = this._flatMeasurements;
        if (flat != null) {
          end = flat[lastIdx * 2] + flat[lastIdx * 2 + 1];
        } else {
          end = ((_a = measurements[lastIdx]) == null ? void 0 : _a.end) ?? 0;
        }
      } else {
        const endByLane = Array(this.options.lanes).fill(null);
        let endIndex = measurements.length - 1;
        while (endIndex >= 0 && endByLane.some((val) => val === null)) {
          const item = measurements[endIndex];
          if (endByLane[item.lane] === null) {
            endByLane[item.lane] = item.end;
          }
          endIndex--;
        }
        end = Math.max(...endByLane.filter((val) => val !== null));
      }
      return Math.max(
        end - this.options.scrollMargin + this.options.paddingEnd,
        0
      );
    };
    this.takeSnapshot = () => {
      const snapshot = [];
      if (this.itemSizeCache.size === 0) return snapshot;
      const m = this.getMeasurements();
      for (const item of m) {
        if (item && this.itemSizeCache.has(item.key)) {
          snapshot.push({
            index: item.index,
            key: item.key,
            start: item.start,
            size: item.size,
            end: item.end,
            lane: item.lane
          });
        }
      }
      return snapshot;
    };
    this._scrollToOffset = (offset, {
      adjustments,
      behavior
    }) => {
      this._intendedScrollOffset = offset + (adjustments ?? 0);
      this.options.scrollToFn(offset, { behavior, adjustments }, this);
    };
    this.measure = () => {
      this.pendingMin = null;
      this.itemSizeCache.clear();
      this.laneAssignments.clear();
      this.itemSizeCacheVersion++;
      this.notify(false);
    };
    this.setOptions(opts);
  }
  applyScrollAdjustment(delta, behavior) {
    if (delta === 0) return;
    if (process.env.NODE_ENV !== "production" && this.options.debug) {
      console.info("correction", delta);
    }
    if (isIOSWebKit() && (this.isScrolling || this._iosTouching || this._iosJustTouchEnded)) {
      this._iosDeferredAdjustment += delta;
    } else {
      this._scrollToOffset(this.getScrollOffset(), {
        adjustments: this.scrollAdjustments += delta,
        behavior
      });
      if (this.scrollOffset !== null) {
        this.scrollOffset += this.scrollAdjustments;
        this.scrollAdjustments = 0;
      }
    }
  }
  scheduleScrollReconcile() {
    if (!this.targetWindow) {
      this.scrollState = null;
      return;
    }
    if (this.rafId != null) return;
    this.rafId = this.targetWindow.requestAnimationFrame(() => {
      this.rafId = null;
      this.reconcileScroll();
    });
  }
  reconcileScroll() {
    if (!this.scrollState) return;
    const el = this.scrollElement;
    if (!el) return;
    const MAX_RECONCILE_MS = 5e3;
    if (this.now() - this.scrollState.startedAt > MAX_RECONCILE_MS) {
      this.scrollState = null;
      return;
    }
    const offsetInfo = this.scrollState.index != null ? this.getOffsetForIndex(this.scrollState.index, this.scrollState.align) : void 0;
    const targetOffset = offsetInfo ? offsetInfo[0] : this.scrollState.lastTargetOffset;
    const STABLE_FRAMES = 1;
    const targetChanged = targetOffset !== this.scrollState.lastTargetOffset;
    if (!targetChanged && approxEqual(targetOffset, this.getScrollOffset())) {
      this.scrollState.stableFrames++;
      if (this.scrollState.stableFrames >= STABLE_FRAMES) {
        if (this.getScrollOffset() !== targetOffset) {
          this._scrollToOffset(targetOffset, {
            adjustments: void 0,
            behavior: "auto"
          });
        }
        this.scrollState = null;
        return;
      }
    } else {
      this.scrollState.stableFrames = 0;
      if (targetChanged) {
        const viewport = this.getSize() || 600;
        const distance = Math.abs(targetOffset - this.getScrollOffset());
        const keepSmooth = this.scrollState.behavior === "smooth" && distance > viewport;
        this.scrollState.lastTargetOffset = targetOffset;
        if (!keepSmooth) {
          this.scrollState.behavior = "auto";
        }
        this._scrollToOffset(targetOffset, {
          adjustments: void 0,
          behavior: keepSmooth ? "smooth" : "auto"
        });
      }
    }
    this.scheduleScrollReconcile();
  }
}
const findNearestBinarySearch = (low, high, getCurrentValue, value) => {
  while (low <= high) {
    const middle = (low + high) / 2 | 0;
    const currentValue = getCurrentValue(middle);
    if (currentValue < value) {
      low = middle + 1;
    } else if (currentValue > value) {
      high = middle - 1;
    } else {
      return middle;
    }
  }
  if (low > 0) {
    return low - 1;
  } else {
    return 0;
  }
};
function findNearestBinarySearchFlat(flat, high, value) {
  let low = 0;
  while (low <= high) {
    const middle = (low + high) / 2 | 0;
    const currentValue = flat[middle * 2];
    if (currentValue < value) {
      low = middle + 1;
    } else if (currentValue > value) {
      high = middle - 1;
    } else {
      return middle;
    }
  }
  return low > 0 ? low - 1 : 0;
}
function calculateRangeImpl(measurements, outerSize, scrollOffset, lanes, flat) {
  const lastIndex = measurements.length - 1;
  if (measurements.length <= lanes) {
    return { startIndex: 0, endIndex: lastIndex };
  }
  if (lanes === 1 && flat !== null) {
    const startIndex2 = findNearestBinarySearchFlat(
      flat,
      lastIndex,
      scrollOffset
    );
    let endIndex2 = startIndex2;
    const limit = scrollOffset + outerSize;
    while (endIndex2 < lastIndex && flat[endIndex2 * 2] + flat[endIndex2 * 2 + 1] < limit) {
      endIndex2++;
    }
    return { startIndex: startIndex2, endIndex: endIndex2 };
  }
  const getStart = (index) => measurements[index].start;
  let startIndex = findNearestBinarySearch(0, lastIndex, getStart, scrollOffset);
  let endIndex = startIndex;
  if (lanes === 1) {
    while (endIndex < lastIndex && measurements[endIndex].end < scrollOffset + outerSize) {
      endIndex++;
    }
  } else if (lanes > 1) {
    const endPerLane = Array(lanes).fill(0);
    while (endIndex < lastIndex && endPerLane.some((pos) => pos < scrollOffset + outerSize)) {
      const item = measurements[endIndex];
      endPerLane[item.lane] = item.end;
      endIndex++;
    }
    const startPerLane = Array(lanes).fill(scrollOffset + outerSize);
    while (startIndex >= 0 && startPerLane.some((pos) => pos >= scrollOffset)) {
      const item = measurements[startIndex];
      startPerLane[item.lane] = item.start;
      startIndex--;
    }
    startIndex = Math.max(0, startIndex - startIndex % lanes);
    endIndex = Math.min(lastIndex, endIndex + (lanes - 1 - endIndex % lanes));
  }
  return { startIndex, endIndex };
}

const useIsomorphicLayoutEffect = typeof document !== "undefined" ? React.useLayoutEffect : React.useEffect;
function useVirtualizerBase({
  useFlushSync = true,
  directDomUpdates = false,
  directDomUpdatesMode = "transform",
  ...options
}) {
  const rerender = React.useReducer((x) => x + 1, 0)[1];
  const directRef = React.useRef({
    enabled: directDomUpdates,
    mode: directDomUpdatesMode,
    container: null,
    lastSize: null,
    // Keyed by the element itself so a remounted node (same key, new DOM
    // node — e.g. when `enabled` is toggled off then on) is treated as fresh
    // and gets its style written.
    lastPositions: /* @__PURE__ */ new WeakMap(),
    prevRange: null
  });
  directRef.current.enabled = directDomUpdates;
  directRef.current.mode = directDomUpdatesMode;
  const applyDirectStyles = (instance2) => {
    const state = directRef.current;
    if (!state.enabled || !state.container) return;
    const totalSize = instance2.getTotalSize();
    if (totalSize !== state.lastSize) {
      state.lastSize = totalSize;
      const sizeAxis = instance2.options.horizontal ? "width" : "height";
      state.container.style[sizeAxis] = `${totalSize}px`;
    }
    const horizontal = !!instance2.options.horizontal;
    const useTransform = state.mode === "transform";
    const posAxis = horizontal ? "left" : "top";
    const scrollMargin = instance2.options.scrollMargin;
    const items = instance2.getVirtualItems();
    for (const item of items) {
      const next = item.start - scrollMargin;
      const el = instance2.elementsCache.get(item.key);
      if (!el) continue;
      if (state.lastPositions.get(el) === next) continue;
      state.lastPositions.set(el, next);
      if (useTransform) {
        el.style.transform = horizontal ? `translate3d(${next}px, 0, 0)` : `translate3d(0, ${next}px, 0)`;
      } else {
        el.style[posAxis] = `${next}px`;
      }
    }
  };
  const resolvedOptions = {
    ...options,
    onChange: (instance2, sync) => {
      var _a;
      const state = directRef.current;
      let shouldRerender = true;
      if (state.enabled) {
        applyDirectStyles(instance2);
        const range = instance2.range;
        const prev = state.prevRange;
        shouldRerender = !prev || prev.isScrolling !== instance2.isScrolling || prev.startIndex !== (range == null ? void 0 : range.startIndex) || prev.endIndex !== (range == null ? void 0 : range.endIndex);
        if (shouldRerender) {
          state.prevRange = range ? {
            startIndex: range.startIndex,
            endIndex: range.endIndex,
            isScrolling: instance2.isScrolling
          } : null;
        }
      }
      if (shouldRerender) {
        if (useFlushSync && sync) {
          flushSync(rerender);
        } else {
          rerender();
        }
      }
      (_a = options.onChange) == null ? void 0 : _a.call(options, instance2, sync);
    }
  };
  const [instance] = React.useState(() => {
    const v = new Virtualizer(resolvedOptions);
    return Object.assign(v, {
      containerRef: (node) => {
        const state = directRef.current;
        state.container = node;
        state.lastSize = null;
        if (node && state.enabled) {
          const total = v.getTotalSize();
          state.lastSize = total;
          const axis = v.options.horizontal ? "width" : "height";
          node.style[axis] = `${total}px`;
        }
      }
    });
  });
  instance.setOptions(resolvedOptions);
  useIsomorphicLayoutEffect(() => {
    return instance._didMount();
  }, []);
  useIsomorphicLayoutEffect(() => {
    return instance._willUpdate();
  });
  useIsomorphicLayoutEffect(() => {
    applyDirectStyles(instance);
  });
  return instance;
}
function useVirtualizer(options) {
  return useVirtualizerBase({
    observeElementRect,
    observeElementOffset,
    scrollToFn: elementScroll,
    ...options
  });
}

function VirtualList({ rows, flagsFor, className, style, height, maxHeight, estimatedRowHeight, overscan, scrollRef }) {
    const rootRef = useRef(null);
    // External mode: the caller's element scrolls and this list may sit below other
    // content in it. Self mode: the root <code> below is itself the scroll element.
    const external = scrollRef != null;
    // In external mode the list can start partway down the scroll container, so the
    // virtualizer needs that leading offset (scrollMargin) to map scroll position to
    // rows. Measured from layout, refreshed when the row count changes; 0 in self mode.
    const [scrollMargin, setScrollMargin] = useState(0);
    useLayoutEffect(() => {
        if (!external) {
            setScrollMargin(0);
            return;
        }
        const scrollEl = scrollRef.current;
        const listEl = rootRef.current;
        if (!scrollEl || !listEl)
            return;
        setScrollMargin(listEl.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top + scrollEl.scrollTop);
    }, [external, scrollRef, rows.length]);
    const virtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => (external ? scrollRef.current : rootRef.current),
        estimateSize: () => estimatedRowHeight,
        overscan,
        scrollMargin
    });
    const items = virtualizer.getVirtualItems();
    return (
    // Root is <code> to match the non-virtualized path so the UA monospace font
    // applies identically in both modes. In self mode it owns the scroll box
    // (jv-scroll class + overflow + height/maxHeight); in external mode the
    // caller's element scrolls, so drop the scroll class and box styling and let
    // this be a plain sizer host.
    jsx("code", { ref: rootRef, className: external ? className : className + ' jv-scroll', style: external ? style : Object.assign({ overflow: 'auto', height, maxHeight }, style), children: jsx("div", { className: "jv-sizer", style: { height: virtualizer.getTotalSize(), position: 'relative', minWidth: 'max-content' }, children: items.map(vi => {
                const row = rows[vi.index];
                const flags = flagsFor(row);
                return (jsx(Row$1, Object.assign({ row: row, index: vi.index }, flags, { measureRef: virtualizer.measureElement, style: { position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${vi.start - scrollMargin}px)` } }), row.id));
            }) }) }));
}

const defaultURLRegExp = /^(((ht|f)tps?):\/\/)?([^!@#$%^&*?.\s-]([^!@#$%^&*?.\s]{0,63}[^!@#$%^&*?.\s])?\.)+[a-z]{2,6}\/?/;
function JsonView({ src: _src, collapseStringsAfterLength = 99, collapseStringMode = 'directly', customizeCollapseStringUI, collapseObjectsAfterLength = 99, collapsed, onCollapse, enableClipboard = true, editable = false, onEdit, onDelete, onAdd, onChange, dark = false, theme = 'default', customizeNode, customizeCopy = node => stringifyForCopying(node), displaySize, displayArrayIndex = true, style, className, matchesURL = false, urlRegExp = defaultURLRegExp, ignoreLargeArray = false, virtual = 'auto', rowVirtualThreshold = 100, height, maxHeight, estimatedRowHeight = 20, overscan = 8, scrollRef, CopyComponent, CopiedComponent, EditComponent, CancelComponent, DoneComponent, CustomOperation }) {
    const [version, setVersion] = useState(0);
    const forceUpdate = useCallback(() => setVersion(v => v + 1), []);
    const [src, setSrc] = useState(_src);
    useEffect(() => setSrc(_src), [_src]);
    const [ui, setUI] = useState({});
    const expand = useRef(new Map());
    const stringExpand = useRef(new Map());
    // Mirror the legacy reset: changing collapsed / collapseObjectsAfterLength
    // discards user fold overrides so defaults recompute.
    useEffect(() => {
        expand.current.clear();
        forceUpdate();
    }, [collapsed, collapseObjectsAfterLength, forceUpdate]);
    // Latest refs so handlers can stay referentially stable (Phase 6 memo win).
    const srcRef = useRef(src);
    srcRef.current = src;
    const cbRef = useRef({ onEdit, onDelete, onAdd, onChange, onCollapse });
    cbRef.current = { onEdit, onDelete, onAdd, onChange, onCollapse };
    const handlers = useMemo(() => {
        const fireEdit = (row, newValue, oldValue) => {
            var _a, _b, _c, _d;
            const depth = row.path.length;
            const parentType = row.parentType;
            const parentPath = row.parentPath.map(String);
            (_b = (_a = cbRef.current).onEdit) === null || _b === void 0 ? void 0 : _b.call(_a, { newValue, oldValue, depth, src: srcRef.current, indexOrName: row.indexOrName, parentType, parentPath });
            (_d = (_c = cbRef.current).onChange) === null || _d === void 0 ? void 0 : _d.call(_c, { type: 'edit', depth, src: srcRef.current, indexOrName: row.indexOrName, parentType, parentPath });
        };
        return {
            toggle(row) {
                var _a, _b;
                const key = row.expandKey;
                const willExpand = row.kind === 'collapsed';
                expand.current.set(key, willExpand);
                (_b = (_a = cbRef.current).onCollapse) === null || _b === void 0 ? void 0 : _b.call(_a, { isCollapsing: !willExpand, node: row.value, indexOrName: row.indexOrName, depth: row.path.length + 1 });
                forceUpdate();
            },
            toggleChunk(row) {
                const key = row.expandKey;
                expand.current.set(key, row.kind === 'chunk');
                forceUpdate();
            },
            editValue(row, newValue) {
                var _a, _b, _c, _d;
                const oldValue = row.value;
                if (row.path.length === 0) {
                    setSrc(newValue);
                    (_b = (_a = cbRef.current).onEdit) === null || _b === void 0 ? void 0 : _b.call(_a, { newValue, oldValue, depth: 1, src: srcRef.current, indexOrName: row.indexOrName, parentType: null, parentPath: [] });
                    (_d = (_c = cbRef.current).onChange) === null || _d === void 0 ? void 0 : _d.call(_c, { type: 'edit', depth: 1, src: srcRef.current, indexOrName: row.indexOrName, parentType: null, parentPath: [] });
                }
                else {
                    const parent = getParentByPath(srcRef.current, row.path);
                    if (Array.isArray(parent))
                        parent[Number(row.indexOrName)] = newValue;
                    else if (parent)
                        parent[row.indexOrName] = newValue;
                    fireEdit(row, newValue, oldValue);
                }
                setUI(s => (Object.assign(Object.assign({}, s), { editingKey: undefined })));
                forceUpdate();
            },
            deleteRow(row) {
                var _a, _b, _c, _d, _e, _f, _g, _h;
                const isContainer = row.kind === 'open' || row.kind === 'collapsed';
                if (row.path.length === 0) {
                    setSrc(undefined);
                    (_b = (_a = cbRef.current).onDelete) === null || _b === void 0 ? void 0 : _b.call(_a, { value: srcRef.current, depth: 1, src: srcRef.current, indexOrName: row.indexOrName, parentType: null, parentPath: [] });
                    (_d = (_c = cbRef.current).onChange) === null || _d === void 0 ? void 0 : _d.call(_c, { type: 'delete', depth: 1, src: srcRef.current, indexOrName: row.indexOrName, parentType: null, parentPath: [] });
                }
                else {
                    const parent = getParentByPath(srcRef.current, row.path);
                    if (Array.isArray(parent))
                        parent.splice(Number(row.indexOrName), 1);
                    else if (parent)
                        delete parent[row.indexOrName];
                    const depth = row.path.length + 1;
                    const parentType = isContainer ? (row.nodeType === 'array' ? 'array' : 'object') : row.parentType;
                    const parentPath = (isContainer ? row.path : row.parentPath).map(String);
                    (_f = (_e = cbRef.current).onDelete) === null || _f === void 0 ? void 0 : _f.call(_e, { value: row.value, depth, src: srcRef.current, indexOrName: row.indexOrName, parentType, parentPath });
                    (_h = (_g = cbRef.current).onChange) === null || _h === void 0 ? void 0 : _h.call(_g, { type: 'delete', depth, src: srcRef.current, indexOrName: row.indexOrName, parentType, parentPath });
                }
                setUI(s => (Object.assign(Object.assign({}, s), { deletingKey: undefined })));
                forceUpdate();
            },
            addProperty(row, name) {
                var _a, _b, _c, _d;
                const container = getByPath(srcRef.current, row.path);
                if (container && typeof container === 'object')
                    container[name] = null;
                const depth = row.path.length + 1;
                const parentPath = row.path.map(String);
                (_b = (_a = cbRef.current).onAdd) === null || _b === void 0 ? void 0 : _b.call(_a, { indexOrName: name, depth, src: srcRef.current, parentType: 'object', parentPath });
                (_d = (_c = cbRef.current).onChange) === null || _d === void 0 ? void 0 : _d.call(_c, { type: 'add', indexOrName: name, depth, src: srcRef.current, parentType: 'object', parentPath });
                setUI(s => (Object.assign(Object.assign({}, s), { addingKey: undefined })));
                forceUpdate();
            },
            pushArrayItem(row) {
                var _a, _b, _c, _d;
                const arr = getByPath(srcRef.current, row.path);
                if (Array.isArray(arr)) {
                    arr.push(null);
                    const depth = row.path.length + 1;
                    const parentPath = row.path.map(String);
                    (_b = (_a = cbRef.current).onAdd) === null || _b === void 0 ? void 0 : _b.call(_a, { indexOrName: arr.length - 1, depth, src: srcRef.current, parentType: 'array', parentPath });
                    (_d = (_c = cbRef.current).onChange) === null || _d === void 0 ? void 0 : _d.call(_c, { type: 'add', indexOrName: arr.length - 1, depth, src: srcRef.current, parentType: 'array', parentPath });
                }
                forceUpdate();
            },
            startEdit(row) {
                setUI({ editingKey: pathKey(row.path) });
            },
            cancelEdit() {
                setUI(s => (Object.assign(Object.assign({}, s), { editingKey: undefined })));
            },
            startDelete(row) {
                setUI({ deletingKey: pathKey(row.path) });
            },
            cancelDelete() {
                setUI(s => (Object.assign(Object.assign({}, s), { deletingKey: undefined })));
            },
            startAdd(row) {
                setUI({ addingKey: row.expandKey });
            },
            cancelAdd() {
                setUI(s => (Object.assign(Object.assign({}, s), { addingKey: undefined })));
            },
            setStringExpanded(key, expanded) {
                stringExpand.current.set(key, expanded);
                forceUpdate();
            },
            stringExpanded(key) {
                return stringExpand.current.get(key);
            }
        };
    }, [forceUpdate]);
    const config = useMemo(() => ({
        collapseStringsAfterLength,
        collapseStringMode,
        customizeCollapseStringUI,
        enableClipboard,
        editable,
        displaySize,
        displayArrayIndex,
        matchesURL,
        urlRegExp,
        customizeCopy,
        CopyComponent,
        CopiedComponent,
        EditComponent,
        CancelComponent,
        DoneComponent,
        CustomOperation
    }), [
        collapseStringsAfterLength,
        collapseStringMode,
        customizeCollapseStringUI,
        enableClipboard,
        editable,
        displaySize,
        displayArrayIndex,
        matchesURL,
        urlRegExp,
        customizeCopy,
        CopyComponent,
        CopiedComponent,
        EditComponent,
        CancelComponent,
        DoneComponent,
        CustomOperation
    ]);
    const rows = useMemo(() => flatten(src, { expand: expand.current, collapsed, collapseObjectsAfterLength, customizeNode, ignoreLargeArray, addingKey: ui.addingKey }), 
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [src, version, ui.addingKey, collapsed, collapseObjectsAfterLength, customizeNode, ignoreLargeArray]);
    const flagsFor = useCallback((row) => {
        const nodeKey = pathKey(row.path);
        return {
            editing: row.kind === 'value' && ui.editingKey === nodeKey,
            deleting: (row.kind === 'value' || row.kind === 'open' || row.kind === 'collapsed') && ui.deletingKey === nodeKey,
            adding: row.kind === 'open' && ui.addingKey === nodeKey,
            stringTruncated: row.kind === 'value' && row.nodeType === 'string' ? stringExpand.current.get(nodeKey) : undefined
        };
    }, 
    // version is a dep so string-truncation toggles (which bump it) recompute flags
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui.editingKey, ui.deletingKey, ui.addingKey, version]);
    const rootClassName = 'json-view' + (dark ? ' dark' : '') + (theme && theme !== 'default' ? ' json-view_' + theme : '') + (className ? ' ' + className : '');
    const shouldVirtual = virtual === false ? false : virtual === true ? true : rows.length > rowVirtualThreshold || height != null || maxHeight != null;
    // A consumer-supplied scroll container owns scrolling, so skip the self-scroll
    // box sizing (height/maxHeight and the 70vh fallback) in that mode.
    const resolvedMaxHeight = scrollRef != null ? undefined : maxHeight != null ? maxHeight : shouldVirtual && height == null ? '70vh' : undefined;
    return (jsx(ConfigContext.Provider, { value: config, children: jsx(HandlersContext.Provider, { value: handlers, children: shouldVirtual ? (jsx(VirtualList, { rows: rows, flagsFor: flagsFor, className: rootClassName, style: style, height: scrollRef != null ? undefined : height, maxHeight: resolvedMaxHeight, estimatedRowHeight: estimatedRowHeight, overscan: overscan, scrollRef: scrollRef })) : (jsx("code", { className: rootClassName, style: style, children: rows.map(row => {
                    const flags = flagsFor(row);
                    return jsx(Row$1, Object.assign({ row: row }, flags), row.id);
                }) })) }) }));
}

export { SvgCancel as CancelSVG, SvgCopied as CopiedSVG, SvgCopy as CopySVG, SvgTrash as DeleteSVG, SvgDone as DoneSVG, SvgEdit as EditSVG, SvgLink as LinkSVG, JsonView as default, defaultURLRegExp, stringifyForCopying as stringify };
//# sourceMappingURL=index.mjs.map
