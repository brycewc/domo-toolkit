# Domo Debug Utilities

Browser console debug utilities for reverse-engineering Domo pages. Use when investigating how Domo stores object IDs, inspecting React component internals, or searching for IDs/UUIDs on a page.

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
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); checkValue(key, `localStorage key: ${key}`); const val = localStorage.getItem(key); if (val) { checkValue(val, `localStorage[${key}]`); if (val.length > 20) extractFromText(val, `localStorage[${key}]`); } } } catch {}
  try { for (let i = 0; i < sessionStorage.length; i++) { const key = sessionStorage.key(i); checkValue(key, `sessionStorage key: ${key}`); const val = sessionStorage.getItem(key); if (val) { checkValue(val, `sessionStorage[${key}]`); if (val.length > 20) extractFromText(val, `sessionStorage[${key}]`); } } } catch {}

  for (const name of ['__NEXT_DATA__', '__INITIAL_STATE__', '__APP_DATA__', 'domo', 'appData', 'pageData', 'cardData']) {
    try { if (window[name] && typeof window[name] === 'object') scanObject(window[name], `window.${name}`); } catch {}
  }

  try { const rootStyles = getComputedStyle(document.documentElement); for (const prop of rootStyles) { if (prop.startsWith('--')) { const val = rootStyles.getPropertyValue(prop).trim(); checkValue(val, `CSS var: ${prop}`); } } } catch {}

  const sorted = [...results.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [id, locations] of sorted) {
    console.groupCollapsed(`%c${id}%c — found in ${locations.length} location(s)`, 'color: #60a5fa; font-weight: bold', 'color: inherit');
    locations.forEach((loc) => console.log(`  ${loc}`));
    console.groupEnd();
  }
  console.log(`\nTotal: ${results.size} unique ID(s) across ${[...results.values()].reduce((s, l) => s + l.length, 0)} location(s)`);
  return results;
}

// Usage:
findIntegerIds();          // Find all integer IDs (skips < 100)
findIntegerIds(1234567);   // Search for a specific ID
```

## Find UUIDs on a Page

Same scanning approach but searches for UUID patterns (`xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`).

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
  try { for (let i = 0; i < localStorage.length; i++) { const key = localStorage.key(i); extractUUIDs(key, `localStorage key: ${key}`); const val = localStorage.getItem(key); if (val) extractUUIDs(val, `localStorage[${key}]`); } } catch {}
  try { for (let i = 0; i < sessionStorage.length; i++) { const key = sessionStorage.key(i); extractUUIDs(key, `sessionStorage key: ${key}`); const val = sessionStorage.getItem(key); if (val) extractUUIDs(val, `sessionStorage[${key}]`); } } catch {}

  for (const name of ['__NEXT_DATA__', '__INITIAL_STATE__', '__APP_DATA__', 'domo', 'appData', 'pageData', 'cardData']) {
    try { if (window[name] && typeof window[name] === 'object') scanObject(window[name], `window.${name}`); } catch {}
  }

  try { const rootStyles = getComputedStyle(document.documentElement); for (const prop of rootStyles) { if (prop.startsWith('--')) { const val = rootStyles.getPropertyValue(prop); extractUUIDs(val, `CSS var: ${prop}`); } } } catch {}

  const sorted = [...results.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [uuid, locations] of sorted) {
    console.groupCollapsed(`%c${uuid}%c — found in ${locations.length} location(s)`, 'color: #f59e0b; font-weight: bold', 'color: inherit');
    locations.forEach((loc) => console.log(`  ${loc}`));
    console.groupEnd();
  }
  console.log(`\nTotal: ${results.size} unique UUID(s) across ${[...results.values()].reduce((s, l) => s + l.length, 0)} location(s)`);
  return results;
}

// Usage:
findUuids();                                          // Find all UUIDs
findUuids('550e8400-e29b-41d4-a716-446655440000');    // Search for a specific UUID
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
