/**
 * Favicon modifier utility
 * Applies visual effects to page favicons based on configured rules
 */

import { EXCLUDED_HOSTNAMES } from './utils/constants';
import { instanceKeyFromUrl } from './utils/instance';

// The effects that write a word into a band. They draw over the instance's own logo
// when it has one, since a local dev server usually proxies a real instance and its
// logo is what identifies which one.
const BAND_LABELS = { 'bottom-local': 'LOCAL', 'bottom-rig': 'RIG' };

/**
 * Apply favicon modifications based on rules
 * @param {Array} rules - Array of favicon rules from storage
 */
export async function applyFaviconRules(rules) {
  if (!rules || rules.length === 0) {
    return;
  }

  // Check if current hostname is in the excluded list
  const hostname = location.hostname;
  if (EXCLUDED_HOSTNAMES.includes(hostname)) {
    // console.log(
    //   'Favicon modification skipped for excluded hostname:',
    //   hostname
    // );
    return;
  }

  // Skip auth pages - user isn't logged in yet so API calls will fail
  if (location.pathname.startsWith('/auth/')) {
    return;
  }

  // The instance key is what rule patterns are tested against: a bare subdomain
  // for a hosted instance, or the full address with its port for a local one.
  const subdomain = instanceKeyFromUrl(location.href);

  if (!subdomain) {
    // console.log('Not a Domo instance URL');
    return;
  }

  // Find the first matching rule
  // IMPORTANT: Rules are checked in array order (top to bottom in the UI).
  // Array.find() returns the FIRST element that matches, then stops searching.
  // This means:
  //   - Higher priority rules should be at the start of the array (top of UI)
  //   - Once a match is found, all subsequent rules are ignored
  //   - Drag-and-drop reordering in the UI changes rule priority by changing array order
  const matchingRule = rules.find((rule) => {
    if (!rule.pattern) return false;

    try {
      const regex = new RegExp(rule.pattern);
      const matches = regex.test(subdomain);
      return matches;
    } catch (e) {
      console.error('Invalid regex pattern:', rule.pattern, e);
      return false;
    }
  });

  if (!matchingRule) {
    // console.log('No matching favicon rule found');
    return;
  }

  // console.log('Applying favicon rule:', matchingRule);

  // Get the current favicon
  const favicon = getFavicon();
  if (!favicon) {
    console.warn('No favicon found on page');
    return;
  }

  const instanceLogo = BAND_LABELS[matchingRule.effect] ? await getInstanceLogo(subdomain) : null;
  // The logo id joins the key so swapping the logo invalidates icons drawn from it.
  const cacheKey = generateCacheKey(subdomain, matchingRule, instanceLogo?.id);

  // Check cache first (instance-logo has its own caching logic)
  if (matchingRule.effect !== 'instance-logo') {
    const cachedFavicon = await getCachedFavicon(cacheKey);

    if (cachedFavicon) {
      // console.log('Using cached favicon');
      favicon.href = cachedFavicon;
      return;
    }
  }

  // Apply the effect
  let faviconDataUrl = null;

  if (matchingRule.effect === 'instance-logo') {
    // Instance logos are cached with ID tracking
    await applyInstanceLogo(favicon, subdomain);
  } else if (matchingRule.effect === 'domo-logo-colored') {
    faviconDataUrl = await applyDomoLogoColored(favicon, matchingRule.color);
  } else {
    faviconDataUrl = await applyColorEffect(favicon, matchingRule.effect, matchingRule.color, instanceLogo?.dataUrl);
  }

  // Cache the result (except for instance-logo)
  if (faviconDataUrl && matchingRule.effect !== 'instance-logo') {
    await cacheFavicon(cacheKey, faviconDataUrl);
  }
}

/**
 * Automatically apply instance logo for any Domo instance, hosted or local
 * This runs automatically when visiting a new domain, regardless of configured rules
 */
export async function applyInstanceLogoAuto() {
  // Check if current hostname is in the excluded list
  const hostname = location.hostname;
  if (EXCLUDED_HOSTNAMES.includes(hostname)) {
    return;
  }

  // Skip auth pages - user isn't logged in yet so API calls will fail
  if (location.pathname.startsWith('/auth/')) {
    return;
  }

  const subdomain = instanceKeyFromUrl(location.href);

  if (!subdomain) {
    return;
  }

  // Get the favicon element
  const favicon = getFavicon();
  if (!favicon) {
    console.warn('No favicon found on page');
    return;
  }

  // Apply the instance logo
  await applyInstanceLogo(favicon, subdomain);
}

/**
 * Draw a colored band across the bottom of the icon with a short label in it
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} size - Canvas size
 * @param {string} color - The band color
 * @param {string} text - The label, a few characters at most
 */
function applyBandLabel(ctx, size, color, text) {
  const band = size / 3;

  ctx.save();
  ctx.fillStyle = hexToRgba(color);
  ctx.fillRect(0, size - band, size, band);

  ctx.fillStyle = labelColorFor(color);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // An explicit stack keeps the label off whatever font the Domo page has loaded.
  ctx.font = `700 ${Math.round(band * 0.85)}px Arial, Helvetica, sans-serif`;
  // The maxWidth argument condenses the glyphs to fit instead of overflowing.
  ctx.fillText(text, size / 2, size - band / 2, size - 2);
  ctx.restore();
}

/**
 * Apply color effect to favicon
 * @param {HTMLLinkElement} favicon - The favicon element
 * @param {string} effect - The effect type (top, right, bottom, bottom-local, bottom-rig, left)
 * @param {string} color - The color to apply
 * @param {string} [baseImageUrl] - Image to draw under the effect, defaulting to the Domo logo
 * @returns {Promise<string>} The favicon data URL
 */
async function applyColorEffect(favicon, effect, color, baseImageUrl) {
  const img = new Image();

  return new Promise((resolve, reject) => {
    img.onload = () => {
      // Create a canvas to draw the modified favicon
      const canvas = document.createElement('canvas');
      const size = 32; // Standard favicon size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw the fresh logo as a clean base
      drawContain(ctx, img, size);

      // Apply the effect
      applyEffect(ctx, size, effect, color);

      // Convert canvas to data URL and set as new favicon
      const newFaviconUrl = canvas.toDataURL('image/png');
      favicon.href = newFaviconUrl;

      resolve(newFaviconUrl);
    };

    img.onerror = (error) => {
      console.error('Error loading Domo logo for effect:', error);
      reject(error);
    };

    // Always start from a fresh image to prevent effect stacking
    img.src = baseImageUrl || chrome.runtime.getURL('public/domo-logo.png');
  });
}

/**
 * Apply Domo logo with colored background
 * @param {HTMLLinkElement} favicon - The favicon element
 * @param {string} color - The background color to apply
 * @returns {Promise<string>} The favicon data URL
 */
async function applyDomoLogoColored(favicon, color) {
  return new Promise((resolve, reject) => {
    const img = new Image();

    img.onload = () => {
      // Create a canvas to draw the colored favicon
      const canvas = document.createElement('canvas');
      const size = 32; // Standard favicon size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw colored background
      ctx.fillStyle = hexToRgba(color);
      ctx.fillRect(0, 0, size, size);

      // Draw the Domo logo on top
      ctx.drawImage(img, 0, 0, size, size);

      // Convert canvas to data URL and set as new favicon
      const newFaviconUrl = canvas.toDataURL('image/png');
      favicon.href = newFaviconUrl;

      // console.log('Applied Domo logo with colored background:', color);
      resolve(newFaviconUrl);
    };

    img.onerror = (error) => {
      console.error('Error loading Domo logo:', error);
      reject(error);
    };

    // Load the transparent Domo logo
    img.src = chrome.runtime.getURL('public/domo-logo-no-background.png');
  });
}

/**
 * Apply visual effect to canvas context
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {number} size - Canvas size
 * @param {string} effect - Effect type
 * @param {string} color - Color to apply
 */
function applyEffect(ctx, size, effect, color) {
  ctx.fillStyle = hexToRgba(color);

  switch (effect) {
    case 'bottom':
      ctx.fillRect(0, (size * 3) / 4, size, size / 4);
      break;

    case 'bottom-local':
    case 'bottom-rig':
      applyBandLabel(ctx, size, color, BAND_LABELS[effect]);
      break;

    case 'left':
      ctx.fillRect(0, 0, size / 4, size);
      break;

    case 'right':
      ctx.fillRect((size * 3) / 4, 0, size / 4, size);
      break;

    case 'top':
      ctx.fillRect(0, 0, size, size / 4);
      break;
  }
}

/**
 * Apply instance logo as favicon
 * @param {HTMLLinkElement} favicon - The favicon element
 * @param {string} subdomain - The subdomain
 */
async function applyInstanceLogo(favicon, subdomain) {
  const logo = await getInstanceLogo(subdomain);

  if (logo) {
    favicon.href = logo.dataUrl;
  }
}

/**
 * Cache a favicon data URL
 * @param {string} cacheKey - The cache key
 * @param {string} dataUrl - The favicon data URL
 */
async function cacheFavicon(cacheKey, dataUrl) {
  try {
    await chrome.storage.local.set({ [cacheKey]: dataUrl });
    // console.log('Cached favicon:', cacheKey);
  } catch (error) {
    console.error('Error caching favicon:', error);
  }
}

/**
 * Draw an image centered in a square, scaled to fit. An instance logo is any shape,
 * so stretching it to the canvas would distort it.
 * @param {CanvasRenderingContext2D} ctx - Canvas context
 * @param {HTMLImageElement} img - The image to draw
 * @param {number} size - Canvas size
 */
function drawContain(ctx, img, size) {
  const scale = Math.min(size / img.width, size / img.height);
  const width = img.width * scale;
  const height = img.height * scale;

  ctx.drawImage(img, (size - width) / 2, (size - height) / 2, width, height);
}

/**
 * Generate a cache key for a favicon rule
 * @param {string} subdomain - The subdomain
 * @param {Object} rule - The favicon rule
 * @param {string} [logoId] - Id of the instance logo the icon was drawn over, when it was
 * @returns {string} Cache key
 */
function generateCacheKey(subdomain, rule, logoId) {
  const base = `favicon_${subdomain}_${rule.effect}_${rule.color || 'none'}`;
  return logoId ? `${base}_${logoId}` : base;
}

/**
 * Generate a cache key for instance logo
 * @param {string} subdomain - The subdomain
 * @returns {string} Cache key for instance logo data
 */
function generateInstanceLogoCacheKey(subdomain) {
  return `favicon_instance_logo_${subdomain}`;
}

/**
 * Generate a cache key for instance logo ID
 * @param {string} subdomain - The subdomain
 * @returns {string} Cache key for instance logo ID
 */
function generateInstanceLogoIdCacheKey(subdomain) {
  return `favicon_instance_logo_id_${subdomain}`;
}

/**
 * Get cached favicon if it exists
 * @param {string} cacheKey - The cache key
 * @returns {Promise<string|null>} Cached favicon data URL or null
 */
async function getCachedFavicon(cacheKey) {
  try {
    const result = await chrome.storage.local.get([cacheKey]);
    return result[cacheKey] || null;
  } catch (error) {
    console.error('Error getting cached favicon:', error);
    return null;
  }
}

/**
 * Get the favicon link element from the page
 * @returns {HTMLLinkElement|null}
 */
function getFavicon() {
  // Look for existing favicon
  let favicon = document.querySelector('link[rel*="icon"]');

  if (!favicon) {
    // Create a new favicon link if none exists
    favicon = document.createElement('link');
    favicon.rel = 'icon';
    document.head.appendChild(favicon);
  }

  return favicon;
}

/**
 * Get the instance's primary logo, reusing the cached copy while its id is unchanged
 * @param {string} subdomain - The subdomain
 * @returns {Promise<{dataUrl: string, id: string}|null>} The logo, or null when none is set
 */
async function getInstanceLogo(subdomain) {
  try {
    const checkResponse = await fetch('/api/content/v1/avatar/CUSTOMER/CUSTOMER/all');

    if (!checkResponse.ok) {
      console.warn('Could not check for instance logo');
      return null;
    }

    const avatars = await checkResponse.json();

    if (!Array.isArray(avatars) || avatars.length === 0) {
      // console.log('No instance logo available');
      return null;
    }

    const primaryLogo = avatars.find((avatar) => avatar.primary === true);
    if (!primaryLogo || !primaryLogo.id) {
      // console.log('No primary instance logo found');
      return null;
    }

    const id = primaryLogo.id;
    const logoCacheKey = generateInstanceLogoCacheKey(subdomain);
    const logoIdCacheKey = generateInstanceLogoIdCacheKey(subdomain);

    if ((await getCachedFavicon(logoIdCacheKey)) === id) {
      const cachedLogo = await getCachedFavicon(logoCacheKey);
      if (cachedLogo) {
        return { dataUrl: cachedLogo, id };
      }
    }

    const logoResponse = await fetch('/api/content/v1/avatar/CUSTOMER/CUSTOMER');

    if (!logoResponse.ok) {
      console.warn('Could not fetch instance logo');
      return null;
    }

    const logoBlob = await logoResponse.blob();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(logoBlob);
    });

    await cacheFavicon(logoCacheKey, dataUrl);
    await cacheFavicon(logoIdCacheKey, id);

    return { dataUrl, id };
  } catch (error) {
    console.error('Error fetching instance logo:', error);
    return null;
  }
}

/**
 * Convert hex color (with optional alpha) to rgba format
 * @param {string} hex - Hex color code (e.g., '#FF0000' or '#FF0000FF')
 * @returns {string} RGBA color string (e.g., 'rgba(255, 0, 0, 1)')
 */
function hexToRgba(hex) {
  // Remove the # if present
  hex = hex.replace('#', '');

  // Parse RGB values
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);

  // Parse alpha if present (8-character hex)
  let a = 1;
  if (hex.length === 8) {
    a = parseInt(hex.substring(6, 8), 16) / 255;
  }

  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/**
 * Pick a readable label color for a band, so a light custom color still works
 * @param {string} hex - Band color, with or without alpha
 * @returns {string} Either black or white
 */
function labelColorFor(hex) {
  const rgb = hex.replace('#', '').substring(0, 6);
  const [r, g, b] = [0, 2, 4].map((offset) => parseInt(rgb.substring(offset, offset + 2), 16));
  // YIQ brightness, not WCAG relative luminance: the latter's crossover puts black
  // on a mid-red band, which loses to white once the icon is scaled to 16px. Alpha
  // is ignored, since a translucent band's real backdrop is the logo underneath.
  return (r * 299 + g * 587 + b * 114) / 1000 > 128 ? '#000000' : '#FFFFFF';
}
