---
description: Browser console debug utilities for reverse-engineering Domo pages. Use when investigating how Domo stores object IDs, inspecting React component internals, or searching for IDs/UUIDs on a page.
---

# Domo Debug Utilities

These are browser console scripts for inspecting Domo pages at runtime. They are designed to be pasted into the browser DevTools console or executed via `chrome.scripting.executeScript` from the extension's background/popup context.

## Find Integer IDs on a Page

Scans the entire page for integer IDs (useful for discovering Domo object IDs). Searches:

- DOM attributes
- Inline `<script>` tags
- `<meta>` tags
- URL (path segments, query params, hash)
- `window.bootstrap` (Domo-specific global)
- Cookies, localStorage, sessionStorage
- Known Domo globals: `__NEXT_DATA__`, `__INITIAL_STATE__`, `__APP_DATA__`, `domo`, `appData`, `pageData`, `cardData`
- CSS custom properties on `:root`

```javascript
function findIntegerIds(targetId = null) {
  const results = new Map();
  const target = targetId !== null ? String(targetId) : null;

  function addResult(location, value) {
    const id = String(value);
    if (target && id !== target) return;
    if (!target && parseInt(id, 10) < 100) return;
    if (!results.has(id)) results.set(id, []);
    const locations = results.get(id);
    if (locations.length < 20) locations.push(location);
  }

  function checkValue(val, location) {
    if (val === null || val === undefined) return;
    if (typeof val === 'number' && Number.isInteger(val) && val > 0) {
      addResult(location, val);
    } else if (typeof val === 'string') {
      if (/^\d+$/.test(val.trim()) && val.trim().length <= 15) {
        addResult(location, val.trim());
      }
    }
  }

  function extractFromText(str, location) {
    const matches = str.match(/(?<![0-9a-f-])\b\d{3,15}\b(?![0-9a-f-])/g);
    if (matches) matches.forEach((m) => addResult(location, m));
  }

  document.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
    const desc = `<${tag}${id || cls}>`;
    for (const attr of el.attributes) {
      checkValue(attr.value, `DOM attr: ${desc} [${attr.name}]`);
      if (attr.value.length > 20) extractFromText(attr.value, `DOM attr: ${desc} [${attr.name}]`);
    }
  });

  document.querySelectorAll('script:not([src])').forEach((script, i) => {
    if (script.textContent) extractFromText(script.textContent, `Inline <script> #${i}`);
  });

  document.querySelectorAll('meta').forEach((meta) => {
    const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
    if (meta.content) checkValue(meta.content, `<meta ${name}>`);
  });

  extractFromText(location.href, 'window.location.href');
  if (location.hash) extractFromText(location.hash, 'window.location.hash');
  location.pathname.split('/').forEach((seg, i) => checkValue(seg, `URL path segment [${i}]`));
  new URLSearchParams(location.search).forEach((val, key) => checkValue(val, `URL param: ${key}`));

  function scanObject(obj, path, depth = 0, visited = new WeakSet()) {
    if (depth > 6 || !obj || visited.has(obj)) return;
    if (typeof obj === 'object') visited.add(obj);
    for (const key of Object.keys(obj)) {
      try {
        const val = obj[key];
        const fullPath = `${path}.${key}`;
        if (typeof val === 'number' || typeof val === 'string') {
          checkValue(val, fullPath);
        } else if (Array.isArray(val)) {
          val.forEach((item, i) => {
            if (typeof item === 'number' || typeof item === 'string') checkValue(item, `${fullPath}[${i}]`);
            else if (typeof item === 'object' && item) scanObject(item, `${fullPath}[${i}]`, depth + 1, visited);
          });
        } else if (typeof val === 'object' && val) {
          scanObject(val, fullPath, depth + 1, visited);
        }
      } catch {}
    }
  }

  if (window.bootstrap) scanObject(window.bootstrap, 'window.bootstrap');
  extractFromText(document.cookie, 'document.cookie');
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      checkValue(key, `localStorage key: ${key}`);
      const val = localStorage.getItem(key);
      if (val) {
        checkValue(val, `localStorage[${key}]`);
        if (val.length > 20) extractFromText(val, `localStorage[${key}]`);
      }
    }
  } catch {}
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      checkValue(key, `sessionStorage key: ${key}`);
      const val = sessionStorage.getItem(key);
      if (val) {
        checkValue(val, `sessionStorage[${key}]`);
        if (val.length > 20) extractFromText(val, `sessionStorage[${key}]`);
      }
    }
  } catch {}

  for (const name of ['__NEXT_DATA__', '__INITIAL_STATE__', '__APP_DATA__', 'domo', 'appData', 'pageData', 'cardData']) {
    try {
      if (window[name] && typeof window[name] === 'object') scanObject(window[name], `window.${name}`);
    } catch {}
  }

  try {
    const rootStyles = getComputedStyle(document.documentElement);
    for (const prop of rootStyles) {
      if (prop.startsWith('--')) {
        const val = rootStyles.getPropertyValue(prop).trim();
        checkValue(val, `CSS var: ${prop}`);
      }
    }
  } catch {}

  const sorted = [...results.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [id, locations] of sorted) {
    console.groupCollapsed(
      `%c${id}%c — found in ${locations.length} location(s)`,
      'color: #60a5fa; font-weight: bold',
      'color: inherit'
    );
    locations.forEach((loc) => console.log(`  ${loc}`));
    console.groupEnd();
  }
  console.log(
    `\nTotal: ${results.size} unique ID(s) across ${[...results.values()].reduce((s, l) => s + l.length, 0)} location(s)`
  );
  return results;
}

// Usage:
findIntegerIds(); // Find all integer IDs (skips < 100)
findIntegerIds(1234567); // Search for a specific ID
```

## Find UUIDs on a Page

Same scanning approach as above but searches for UUID patterns (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

```javascript
function findUuids(targetUUID = null) {
  const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const results = new Map();

  function addResult(location, value) {
    const uuid = typeof value === 'string' ? value.toLowerCase() : value;
    if (targetUUID && uuid !== targetUUID.toLowerCase()) return;
    if (!results.has(uuid)) results.set(uuid, []);
    const locations = results.get(uuid);
    if (locations.length < 20) locations.push(location);
  }

  function extractUUIDs(str, location) {
    const matches = str.match(UUID_REGEX);
    if (matches) matches.forEach((m) => addResult(location, m));
  }

  document.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls = el.className && typeof el.className === 'string' ? `.${el.className.split(' ')[0]}` : '';
    const desc = `<${tag}${id || cls}>`;
    for (const attr of el.attributes) extractUUIDs(attr.value, `DOM attr: ${desc} [${attr.name}]`);
  });

  document.querySelectorAll('script:not([src])').forEach((script, i) => {
    if (script.textContent) extractUUIDs(script.textContent, `Inline <script> #${i}`);
  });

  document.querySelectorAll('meta').forEach((meta) => {
    const name = meta.getAttribute('name') || meta.getAttribute('property') || '';
    if (meta.content) extractUUIDs(meta.content, `<meta ${name}>`);
  });

  extractUUIDs(location.href, 'window.location.href');
  if (location.hash) extractUUIDs(location.hash, 'window.location.hash');

  function scanObject(obj, path, depth = 0, visited = new WeakSet()) {
    if (depth > 6 || !obj || visited.has(obj)) return;
    if (typeof obj === 'object') visited.add(obj);
    for (const key of Object.keys(obj)) {
      try {
        const val = obj[key];
        const fullPath = `${path}.${key}`;
        if (typeof val === 'string') extractUUIDs(val, fullPath);
        else if (Array.isArray(val)) {
          val.forEach((item, i) => {
            if (typeof item === 'string') extractUUIDs(item, `${fullPath}[${i}]`);
            else if (typeof item === 'object' && item) scanObject(item, `${fullPath}[${i}]`, depth + 1, visited);
          });
        } else if (typeof val === 'object' && val) scanObject(val, fullPath, depth + 1, visited);
      } catch {}
    }
  }

  if (window.bootstrap) scanObject(window.bootstrap, 'window.bootstrap');
  extractUUIDs(document.cookie, 'document.cookie');
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      extractUUIDs(key, `localStorage key: ${key}`);
      const val = localStorage.getItem(key);
      if (val) extractUUIDs(val, `localStorage[${key}]`);
    }
  } catch {}
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      extractUUIDs(key, `sessionStorage key: ${key}`);
      const val = sessionStorage.getItem(key);
      if (val) extractUUIDs(val, `sessionStorage[${key}]`);
    }
  } catch {}

  for (const name of ['__NEXT_DATA__', '__INITIAL_STATE__', '__APP_DATA__', 'domo', 'appData', 'pageData', 'cardData']) {
    try {
      if (window[name] && typeof window[name] === 'object') scanObject(window[name], `window.${name}`);
    } catch {}
  }

  try {
    const rootStyles = getComputedStyle(document.documentElement);
    for (const prop of rootStyles) {
      if (prop.startsWith('--')) {
        const val = rootStyles.getPropertyValue(prop);
        extractUUIDs(val, `CSS var: ${prop}`);
      }
    }
  } catch {}

  const sorted = [...results.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [uuid, locations] of sorted) {
    console.groupCollapsed(
      `%c${uuid}%c — found in ${locations.length} location(s)`,
      'color: #f59e0b; font-weight: bold',
      'color: inherit'
    );
    locations.forEach((loc) => console.log(`  ${loc}`));
    console.groupEnd();
  }
  console.log(
    `\nTotal: ${results.size} unique UUID(s) across ${[...results.values()].reduce((s, l) => s + l.length, 0)} location(s)`
  );
  return results;
}

// Usage:
findUuids(); // Find all UUIDs
findUuids('550e8400-e29b-41d4-a716-446655440000'); // Search for a specific UUID
```

## Inspect React Fiber Tree

Extracts React internals from DOM elements. Useful for reverse-engineering Domo's React components to find props, state, and event handlers.

```javascript
function getReactFiber(element) {
  const key = Object.keys(element).find((k) => k.startsWith('__reactFiber$'));
  return element[key];
}

function getReactProps(element) {
  const key = Object.keys(element).find((k) => k.startsWith('__reactProps$'));
  return element[key];
}

// Example: find the onClick handler for a menu item
const row = document.querySelector('[data-menu-item-button]');
let fiber = getReactFiber(row);

while (fiber) {
  const onClick = fiber.memoizedProps?.onClick;
  if (onClick && !onClick.toString().includes('closeMenu')) {
    console.log('Type:', fiber.type?.name || fiber.type);
    console.log('onClick:', onClick.toString());
    console.log('Props:', fiber.memoizedProps);
    break;
  }
  fiber = fiber.return;
}
```

### Domo-Specific Globals to Inspect

Domo pages commonly expose data through these window properties:

- `window.bootstrap` — Primary Domo config (user info, instance settings, feature flags)
- `window.__NEXT_DATA__` — Next.js page data (some newer Domo pages)
- `window.__INITIAL_STATE__` / `window.__APP_DATA__` — App state
- `window.domo` / `window.appData` / `window.pageData` / `window.cardData` — Legacy globals

## Reach Domo's Redux Store

The store is never on `window` outside Domo's dev builds, so get it through the react-redux provider's props. The anchor element matters: a dashboard is reachable from the document root, but an App Studio view was only reachable from inside the filter chrome (`[class*="filter"]`, at fiber depth 56), so try several selectors and allow a generous depth.

```javascript
function findStore() {
  const selectors = ['#root', 'body > div', '[class*="filter"]', '[class*="control"]', '[class*="page"]'];
  for (const selector of selectors) {
    for (const anchor of Array.from(document.querySelectorAll(selector)).slice(0, 20)) {
      const key = Object.keys(anchor).find((name) => name.startsWith('__reactFiber$'));
      if (!key) continue;
      let fiber = anchor[key];
      for (let depth = 0; fiber && depth < 100; depth++, fiber = fiber.return) {
        const store = fiber.memoizedProps?.value?.store;
        if (typeof store?.getState === 'function') return store;
      }
    }
  }
  return null;
}
```

`src/services/governanceToolkit.js` and `src/services/pageVariables.js` both use this.

### Page Variable State

Variable state lives in a different slice on each surface, so read all three and use whichever is populated. **"Populated" means carrying an override, not merely holding controls:** a card page loads the surrounding page's slice as well, with its controls but an empty values map, so picking the first slice that simply has controls reads the wrong one and reports nothing as changed.

| Surface               | Slice                                              | Controls                 | Current values                                        | Keyed by             |
| --------------------- | -------------------------------------------------- | ------------------------ | ----------------------------------------------------- | -------------------- |
| Dashboard `/page/:id` | `state.page.variables`                             | `variables` map          | `controlValuesByPageId[pageId]`                       | control ID           |
| App Studio view       | `state.stack.variables`                            | `variables` map          | `contexts["REDUX_CONTEXT_ID:<viewId>"].controlValues` | control urn          |
| Card details          | `state.card.cardDetailsPage.dataControlsByCardURN` | `dataControls` **array** | `functionOverrides`                                   | function template ID |

The control ID lists are also inconsistently shaped. The page slice has `pageVariableControlIdsByPageId` and `cardVariableControlIdsByPageId`, both maps of page ID to array. The stack context has `pageVariableControlUrns` as a bare array but `cardVariableControlUrns` as a map of card ID to array. Flatten defensively.

The card slice's values are wrapped one level deeper, as `{ name, functionName, parsedExpression: { exprType, value } }`, where the other two hold `{ exprType, value }` directly.

A control object is otherwise the same in every slice:

```javascript
{
  id: '4342',                     // `urn: '4142'` in the stack slice
  name: 'Health Monitor Summary',
  function: { id: 469619, name: 'Health Monitor Summary', dataType: 'STRING', expression: "'TOTAL'", variable: true },
  entityType: 'PAGE',             // or 'CARD'
  entityId: '603719348',
  type: 'DROPDOWN',
  dataType: 'STRING',
  values: [{ expression: { exprType: 'STRING_VALUE', value: 'TOTAL' } }],
  override: { exprType: 'STRING_VALUE', value: 'TOTAL' },   // the DEFAULT, not the live value
  controlType: 'VARIABLE'
}
```

### Deciding whether a variable is actually changed

**An entry in the values map does not mean the user changed anything.** Setting a variable back to its default leaves the override behind rather than clearing it, so presence alone reports a variable as changed when it is sitting exactly where it started.

The question to ask instead is **what value Domo falls back to when the variable is absent**, and compare against that. The baseline is per slice, and this is the part that is easy to get backwards:

| Slice        | Baseline                                                                                     |
| ------------ | -------------------------------------------------------------------------------------------- |
| Page, stack  | `control.override` (the page's saved value), falling back to `function.expression`           |
| Card details | `function.expression` only, since this slice's `override` mirrors the value that was applied |

Two traps behind that table:

- **`override` means different things per slice.** On the page and stack slices it is the saved fallback and the live value lives in the values map. On a card details page the control has no `override` until one is applied, and then it holds the live value, so using it as a baseline there compares a value against itself.
- **A page's saved value can differ from the variable's own default**, so `function.expression` is not a universal baseline. Using it on a page whose saved value is something else would drop a variable the user deliberately set to the variable's default.

`function.expression` is a bare literal (`'TOTAL'`, `42`). Treat anything more complex as unknown and let the value through rather than risking a wrong drop.

One variable can drive several controls (a page-level one plus one per card), all sharing a `function.id`, so dedupe by that.

### Which `pvariables` format a link needs

**The name-keyed form works on every surface, cards included.** Emit it and nothing else; the id-keyed form is instance-specific and buys nothing.

`normalizePVariables` resolves a name only against the controls the target surface declares, and drops silently when nothing matches, which makes cards look like a problem. They are not: a card that uses a Beast Mode referencing a variable carries its own `VARIABLE` control (`entityType: 'CARD'`) in the card definition, and `loadCardDetails` matches against that definition's `controls` straight off the API, not against the Redux slice.

**Do not judge this from `dataControlsByCardURN[cardId].dataControls`.** `CARD__DETAILS_LOAD_STARTED` writes that entry with only `functionOverrides` and no controls, so a read before `CARD__DETAILS_LOAD_FINISHED` shows an empty control list on a card that does declare one. Verified applying `?pvariables={"Health Monitor Summary":"Domain"}` on `/page/:id/kpis/details/:card`, `/app-studio/:app/pages/:view/kpis/details/:card` and the bare `/kpis/details/:card`: all three land it in `functionOverrides`.

All three of those routes render the card, so the app-scoped one is real, contrary to what this file said before.

### How to encode `pfilters` and `pvariables`

**`encodeURI(JSON.stringify(payload))`, not `URLSearchParams`.** Domo canonicalizes the address bar to the `encodeURI` form on arrival, so a param carrying `+` for a space, `%3A` or `%2C` gets visibly rewritten a moment after the page loads. Matching Domo's form means the URL that is opened is the URL that stays. `encodeURI` keeps `:` and `,` literal while still escaping the space, `"`, `{`, `}`, `[` and `]`.

Two traps in building it:

- **`URLSearchParams` re-serializes the entire query on any access**, including a `delete`, so setting one param through it silently reverts an already-encoded sibling. Split and rejoin `url.search` as a string instead. `src/utils/domoQueryParam.js` does both sides of this.
- **`encodeURI` leaves `#`, `&` and `+` alone**, which would end the param, split it, or decode back to a space. Escape those three by hand. Domo does not, so a value containing one still gets rewritten, but the link arrives intact.

**Do not check this in the address bar.** The omnibox renders `%22` as `"` and `%20` as a space, so a correctly encoded link looks like it was decoded on arrival. Nothing can put a literal `"` in a query anyway: the URL parser escapes `"` and space on parse, while leaving `{` and `}` alone, which is why a hand-typed raw JSON param still gets rewritten. To see what really happened, wrap `history.replaceState` before navigating and read the URL it is handed; no call at all means the encoding already matched.
