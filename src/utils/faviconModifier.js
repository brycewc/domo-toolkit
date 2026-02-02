/**
 * Favicon modifier utility
 * Applies visual effects to page favicons based on configured rules
 */

import domoLogoTransparent from '@/assets/domo-logo-no-background.png';
import { EXCLUDED_HOSTNAMES } from './constants';

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
 * Generate a cache key for a favicon rule
 * @param {string} subdomain - The subdomain
 * @param {Object} rule - The favicon rule
 * @returns {string} Cache key
 */
function generateCacheKey(subdomain, rule) {
  return `favicon_${subdomain}_${rule.effect}_${rule.color || 'none'}`;
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
 * Cache a favicon data URL
 * @param {string} cacheKey - The cache key
 * @param {string} dataUrl - The favicon data URL
 */
async function cacheFavicon(cacheKey, dataUrl) {
  try {
    await chrome.storage.local.set({ [cacheKey]: dataUrl });
    console.log('Cached favicon:', cacheKey);
  } catch (error) {
    console.error('Error caching favicon:', error);
  }
}

/**
 * Clear all cached favicons (called when rules change)
 */
export async function clearFaviconCache() {
  try {
    const storage = await chrome.storage.local.get(null);
    const faviconKeys = Object.keys(storage).filter((key) =>
      key.startsWith('favicon_')
    );

    if (faviconKeys.length > 0) {
      await chrome.storage.local.remove(faviconKeys);
      console.log(
        'Cleared favicon cache (including instance logos):',
        faviconKeys.length,
        'items'
      );
    }
  } catch (error) {
    console.error('Error clearing favicon cache:', error);
  }
}

/**
 * Automatically apply instance logo for any .domo.com domain
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

  // Extract subdomain from current URL
  const subdomainMatch = hostname.match(/^(.+?)\.domo\.com$/);

  if (!subdomainMatch) {
    return;
  }

  const subdomain = subdomainMatch[1];

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
    console.log(
      'Favicon modification skipped for excluded hostname:',
      hostname
    );
    return;
  }

  // Skip auth pages - user isn't logged in yet so API calls will fail
  if (location.pathname.startsWith('/auth/')) {
    return;
  }

  // Extract subdomain from current URL
  const subdomainMatch = hostname.match(/^(.+?)\.domo\.com$/);

  if (!subdomainMatch) {
    console.log('Not a Domo instance URL');
    return;
  }

  const subdomain = subdomainMatch[1];
  console.log('Current subdomain:', subdomain);

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
      console.log(
        `Testing pattern "${rule.pattern}" against "${subdomain}":`,
        matches
      );
      return matches;
    } catch (e) {
      console.error('Invalid regex pattern:', rule.pattern, e);
      return false;
    }
  });

  if (!matchingRule) {
    console.log('No matching favicon rule found');
    return;
  }

  console.log('Applying favicon rule:', matchingRule);

  // Get the current favicon
  const favicon = getFavicon();
  if (!favicon) {
    console.warn('No favicon found on page');
    return;
  }

  // Check cache first (instance-logo has its own caching logic)
  if (matchingRule.effect !== 'instance-logo') {
    const cacheKey = generateCacheKey(subdomain, matchingRule);
    const cachedFavicon = await getCachedFavicon(cacheKey);

    if (cachedFavicon) {
      console.log('Using cached favicon');
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
    faviconDataUrl = await applyColorEffect(
      favicon,
      matchingRule.effect,
      matchingRule.color
    );
  }

  // Cache the result (except for instance-logo)
  if (faviconDataUrl && matchingRule.effect !== 'instance-logo') {
    const cacheKey = generateCacheKey(subdomain, matchingRule);
    await cacheFavicon(cacheKey, faviconDataUrl);
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
 * Apply instance logo as favicon
 * @param {HTMLLinkElement} favicon - The favicon element
 * @param {string} subdomain - The subdomain
 */
async function applyInstanceLogo(favicon, subdomain) {
  try {
    // Check if instance logo exists and get its ID
    const checkUrl = '/api/content/v1/avatar/CUSTOMER/CUSTOMER/all';
    const checkResponse = await fetch(checkUrl, {
      method: 'GET'
    });

    if (!checkResponse.ok) {
      console.warn('Could not check for instance logo');
      return;
    }

    const avatars = await checkResponse.json();

    if (!Array.isArray(avatars) || avatars.length === 0) {
      console.log('No instance logo available');
      return;
    }

    // Find the primary logo
    const primaryLogo = avatars.find((avatar) => avatar.primary === true);
    if (!primaryLogo || !primaryLogo.id) {
      console.log('No primary instance logo found');
      return;
    }

    const currentLogoId = primaryLogo.id;

    // Check if we have a cached logo with the same ID
    const logoCacheKey = generateInstanceLogoCacheKey(subdomain);
    const logoIdCacheKey = generateInstanceLogoIdCacheKey(subdomain);

    const cachedLogoId = await getCachedFavicon(logoIdCacheKey);

    if (cachedLogoId === currentLogoId) {
      // Logo hasn't changed, use cached version
      const cachedLogo = await getCachedFavicon(logoCacheKey);
      if (cachedLogo) {
        console.log('Using cached instance logo (ID matches):', currentLogoId);
        favicon.href = cachedLogo;
        return;
      }
    }

    // Logo has changed or not cached, fetch it
    const logoUrl = '/api/content/v1/avatar/CUSTOMER/CUSTOMER';

    // Fetch the logo and convert to data URL for caching
    const logoResponse = await fetch(logoUrl, {
      method: 'GET'
    });

    if (!logoResponse.ok) {
      console.warn('Could not fetch instance logo');
      return;
    }

    const logoBlob = await logoResponse.blob();
    const logoDataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.readAsDataURL(logoBlob);
    });

    // Apply the logo
    favicon.href = logoDataUrl;

    // Cache the logo and its ID
    await cacheFavicon(logoCacheKey, logoDataUrl);
    await cacheFavicon(logoIdCacheKey, currentLogoId);

    console.log('Applied and cached instance logo with ID:', currentLogoId);
  } catch (error) {
    console.error('Error fetching instance logo:', error);
  }
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

      console.log('Applied Domo logo with colored background:', color);
      resolve(newFaviconUrl);
    };

    img.onerror = (error) => {
      console.error('Error loading Domo logo:', error);
      reject(error);
    };

    // Load the transparent Domo logo
    img.src = chrome.runtime.getURL(domoLogoTransparent);
  });
}

/**
 * Apply color effect to favicon
 * @param {HTMLLinkElement} favicon - The favicon element
 * @param {string} effect - The effect type (top, right, bottom, left, cover, replace, background, xor-top)
 * @param {string} color - The color to apply
 * @returns {Promise<string>} The favicon data URL
 */
async function applyColorEffect(favicon, effect, color) {
  // Get the original favicon URL
  const originalHref = favicon.href || '/favicon.ico';

  // Load the original favicon as an image
  const img = new Image();
  img.crossOrigin = 'anonymous';

  return new Promise((resolve, reject) => {
    img.onload = () => {
      // Create a canvas to draw the modified favicon
      const canvas = document.createElement('canvas');
      const size = 32; // Standard favicon size
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');

      // Draw the original favicon
      ctx.drawImage(img, 0, 0, size, size);

      // Apply the effect
      applyEffect(ctx, size, effect, color);

      // Convert canvas to data URL and set as new favicon
      const newFaviconUrl = canvas.toDataURL('image/png');
      favicon.href = newFaviconUrl;

      console.log('Applied favicon effect:', effect, color);
      resolve(newFaviconUrl);
    };

    img.onerror = (error) => {
      console.error('Error loading favicon:', error);
      reject(error);
    };

    img.src = originalHref;
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
    case 'top':
      ctx.fillRect(0, 0, size, size / 4);
      break;

    case 'right':
      ctx.fillRect((size * 3) / 4, 0, size / 4, size);
      break;

    case 'bottom':
      ctx.fillRect(0, (size * 3) / 4, size, size / 4);
      break;

    case 'left':
      ctx.fillRect(0, 0, size / 4, size);
      break;

    case 'cover':
      ctx.globalAlpha = 0.5;
      ctx.fillRect(0, 0, size, size);
      ctx.globalAlpha = 1.0;
      break;

    case 'replace':
      // Get image data and replace non-transparent pixels
      const imageData = ctx.getImageData(0, 0, size, size);
      const data = imageData.data;
      const rgb = hexToRgb(color);

      for (let i = 0; i < data.length; i += 4) {
        // If pixel is not transparent
        if (data[i + 3] > 0) {
          data[i] = rgb.r;
          data[i + 1] = rgb.g;
          data[i + 2] = rgb.b;
        }
      }

      ctx.putImageData(imageData, 0, 0);
      break;

    case 'background':
      // Draw color behind the icon
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = size;
      tempCanvas.height = size;
      const tempCtx = tempCanvas.getContext('2d');

      // Copy current canvas
      tempCtx.drawImage(ctx.canvas, 0, 0);

      // Draw background color
      ctx.fillRect(0, 0, size, size);

      // Draw icon on top
      ctx.drawImage(tempCanvas, 0, 0);
      break;

    case 'xor-top':
      // Draw white rectangle
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, size, size / 4);
      // Draw colored rectangle with XOR blending
      ctx.globalCompositeOperation = 'xor';
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, size, size / 4);
      ctx.globalCompositeOperation = 'source-over';
      break;
  }
}

/**
 * Convert hex color to RGB
 * @param {string} hex - Hex color string
 * @returns {{r: number, g: number, b: number}}
 */
function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
      }
    : { r: 0, g: 0, b: 0 };
}
