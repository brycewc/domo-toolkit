function findIntegerIds(targetId = null) {
  const results = new Map();
  const target = targetId !== null ? String(targetId) : null;

  function addResult(location, value) {
    const id = String(value);
    if (target && id !== target) return;
    // Skip very small numbers (likely not object IDs) unless targeting
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
      // Exact integer string match (not embedded in text)
      if (/^\d+$/.test(val.trim()) && val.trim().length <= 15) {
        addResult(location, val.trim());
      }
    }
  }

  function extractFromText(str, location) {
    // Look for standalone integers in longer text (URLs, JSON, etc.)
    const matches = str.match(/(?<![0-9a-f-])\b\d{3,15}\b(?![0-9a-f-])/g);
    if (matches) matches.forEach((m) => addResult(location, m));
  }

  // 1. HTML attributes
  console.log('[findIntegerIds] Scanning HTML attributes...');
  document.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      el.className && typeof el.className === 'string'
        ? `.${el.className.split(' ')[0]}`
        : '';
    const desc = `<${tag}${id || cls}>`;
    for (const attr of el.attributes) {
      checkValue(attr.value, `DOM attr: ${desc} [${attr.name}]`);
      if (attr.value.length > 20) {
        extractFromText(attr.value, `DOM attr: ${desc} [${attr.name}]`);
      }
    }
  });

  // 2. Inline scripts
  console.log('[findIntegerIds] Scanning inline scripts...');
  document.querySelectorAll('script:not([src])').forEach((script, i) => {
    if (script.textContent) {
      extractFromText(script.textContent, `Inline <script> #${i}`);
    }
  });

  // 3. Meta tags
  console.log('[findIntegerIds] Scanning meta tags...');
  document.querySelectorAll('meta').forEach((meta) => {
    const name =
      meta.getAttribute('name') || meta.getAttribute('property') || '';
    if (meta.content) checkValue(meta.content, `<meta ${name}>`);
  });

  // 4. URL
  console.log('[findIntegerIds] Scanning URL...');
  extractFromText(location.href, 'window.location.href');
  if (location.hash) extractFromText(location.hash, 'window.location.hash');
  // Also check URL segments individually
  location.pathname.split('/').forEach((seg, i) => {
    checkValue(seg, `URL path segment [${i}]`);
  });
  new URLSearchParams(location.search).forEach((val, key) => {
    checkValue(val, `URL param: ${key}`);
  });

  // 5. window.bootstrap (Domo-specific)
  console.log('[findIntegerIds] Scanning window.bootstrap...');
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
            if (typeof item === 'number' || typeof item === 'string') {
              checkValue(item, `${fullPath}[${i}]`);
            } else if (typeof item === 'object' && item) {
              scanObject(item, `${fullPath}[${i}]`, depth + 1, visited);
            }
          });
        } else if (typeof val === 'object' && val) {
          scanObject(val, fullPath, depth + 1, visited);
        }
      } catch {}
    }
  }

  if (window.bootstrap) scanObject(window.bootstrap, 'window.bootstrap');

  // 6. Cookies
  console.log('[findIntegerIds] Scanning cookies...');
  extractFromText(document.cookie, 'document.cookie');

  // 7. localStorage
  console.log('[findIntegerIds] Scanning localStorage...');
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

  // 8. sessionStorage
  console.log('[findIntegerIds] Scanning sessionStorage...');
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

  // 9. Common Domo window objects
  console.log('[findIntegerIds] Scanning known Domo globals...');
  const globals = [
    '__NEXT_DATA__',
    '__INITIAL_STATE__',
    '__APP_DATA__',
    'domo',
    'appData',
    'pageData',
    'cardData'
  ];
  for (const name of globals) {
    try {
      if (window[name] && typeof window[name] === 'object') {
        scanObject(window[name], `window.${name}`);
      }
    } catch {}
  }

  // 10. CSS custom properties on :root
  console.log('[findIntegerIds] Scanning CSS custom properties...');
  try {
    const rootStyles = getComputedStyle(document.documentElement);
    for (const prop of rootStyles) {
      if (prop.startsWith('--')) {
        const val = rootStyles.getPropertyValue(prop).trim();
        checkValue(val, `CSS var: ${prop}`);
      }
    }
  } catch {}

  // Output
  console.log('\n========== INTEGER ID SEARCH RESULTS ==========');
  if (results.size === 0) {
    console.log(
      'No integer IDs found' + (target ? ` matching ${target}` : '') + '.'
    );
  } else {
    const sorted = [...results.entries()].sort(
      (a, b) => b[1].length - a[1].length
    );
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
  }

  return results;
}

// Find ALL integer IDs on the page (skips values < 100 to reduce noise)
findIntegerIds();

// Search for a specific ID (accepts number or string)
// findIntegerIds(1234567);
// findIntegerIds('1234567');
