function findUuids(targetUUID = null) {
  const UUID_REGEX =
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
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

  // 1. HTML attributes
  console.log('[findUuids] Scanning HTML attributes...');
  document.querySelectorAll('*').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const id = el.id ? `#${el.id}` : '';
    const cls =
      el.className && typeof el.className === 'string'
        ? `.${el.className.split(' ')[0]}`
        : '';
    const desc = `<${tag}${id || cls}>`;
    for (const attr of el.attributes) {
      extractUUIDs(attr.value, `DOM attr: ${desc} [${attr.name}]`);
    }
  });

  // 2. Text content of script tags
  console.log('[findUuids] Scanning inline scripts...');
  document.querySelectorAll('script:not([src])').forEach((script, i) => {
    if (script.textContent) {
      extractUUIDs(script.textContent, `Inline <script> #${i}`);
    }
  });

  // 3. Meta tags
  console.log('[findUuids] Scanning meta tags...');
  document.querySelectorAll('meta').forEach((meta) => {
    const name =
      meta.getAttribute('name') || meta.getAttribute('property') || '';
    if (meta.content) extractUUIDs(meta.content, `<meta ${name}>`);
  });

  // 4. URL
  console.log('[findUuids] Scanning URL...');
  extractUUIDs(location.href, 'window.location.href');
  if (location.hash) extractUUIDs(location.hash, 'window.location.hash');

  // 5. window.bootstrap (Domo-specific)
  console.log('[findUuids] Scanning window.bootstrap...');
  function scanObject(obj, path, depth = 0, visited = new WeakSet()) {
    if (depth > 6 || !obj || visited.has(obj)) return;
    if (typeof obj === 'object') visited.add(obj);

    for (const key of Object.keys(obj)) {
      try {
        const val = obj[key];
        const fullPath = `${path}.${key}`;
        if (typeof val === 'string') {
          extractUUIDs(val, fullPath);
        } else if (Array.isArray(val)) {
          val.forEach((item, i) => {
            if (typeof item === 'string') {
              extractUUIDs(item, `${fullPath}[${i}]`);
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
  console.log('[findUuids] Scanning cookies...');
  extractUUIDs(document.cookie, 'document.cookie');

  // 7. localStorage
  console.log('[findUuids] Scanning localStorage...');
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      extractUUIDs(key, `localStorage key: ${key}`);
      const val = localStorage.getItem(key);
      if (val) extractUUIDs(val, `localStorage[${key}]`);
    }
  } catch {}

  // 8. sessionStorage
  console.log('[findUuids] Scanning sessionStorage...');
  try {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i);
      extractUUIDs(key, `sessionStorage key: ${key}`);
      const val = sessionStorage.getItem(key);
      if (val) extractUUIDs(val, `sessionStorage[${key}]`);
    }
  } catch {}

  // 9. Common Domo window objects
  console.log('[findUuids] Scanning known Domo globals...');
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
  console.log('[findUuids] Scanning CSS custom properties...');
  try {
    const rootStyles = getComputedStyle(document.documentElement);
    for (const prop of rootStyles) {
      if (prop.startsWith('--')) {
        const val = rootStyles.getPropertyValue(prop);
        extractUUIDs(val, `CSS var: ${prop}`);
      }
    }
  } catch {}

  // Output
  console.log('\n========== UUID SEARCH RESULTS ==========');
  if (results.size === 0) {
    console.log(
      'No UUIDs found' + (targetUUID ? ` matching ${targetUUID}` : '') + '.'
    );
  } else {
    const sorted = [...results.entries()].sort(
      (a, b) => b[1].length - a[1].length
    );
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
  }

  return results;
}

findUuids();

// Search for a specific UUID
//findUuids('550e8400-e29b-41d4-a716-446655440000');
