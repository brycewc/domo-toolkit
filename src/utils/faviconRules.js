/**
 * The favicon rules that ride along with the internal-instances permission.
 *
 * Granting the permission seeds one rule per internal host family, so a developer
 * gets a marked favicon without building a rule by hand; revoking deletes them
 * again rather than leaving rules behind that can never match. Both live above
 * whatever the user already has, since the first matching rule wins.
 */

export const INTERNAL_FAVICON_EFFECTS = ['bottom-local', 'bottom-rig'];

// Cleared on revoke so a later grant seeds a fresh pair. It guards two things
// while access stays granted: a repeat grant event prepending duplicates, and
// rules the user deleted on purpose coming back.
export const INTERNAL_FAVICON_SEEDED_KEY = 'internalFaviconRulesSeeded';

/**
 * Build the rules seeded for internal instances.
 * @returns {Array<Object>} A localhost rule followed by a rig rule
 */
export function internalFaviconRules() {
  const id = Date.now();
  return [
    {
      color: '#EF4444FF',
      effect: 'bottom-local',
      id,
      // Matched against the instance key, so these two mirror isInternalInstanceKey()
      // and must be kept in step with it: `localhost` can sit at any label position,
      // and a hosted key is a bare subdomain that cannot contain a dot.
      pattern: '(^|\\.)localhost(\\.|:|$)'
    },
    {
      color: '#F59E0BFF',
      effect: 'bottom-rig',
      id: id + 1,
      pattern: '\\.domorig\\.io(:|$)'
    }
  ];
}

/**
 * Drop the seeded rules, so revoking the permission leaves no unreachable rules.
 * @returns {Promise<void>}
 */
export async function removeInternalFaviconRules() {
  const stored = await chrome.storage.sync.get(['faviconRules', INTERNAL_FAVICON_SEEDED_KEY]);
  const faviconRules = stored.faviconRules || [];
  const remaining = faviconRules.filter((rule) => !INTERNAL_FAVICON_EFFECTS.includes(rule.effect));

  // Writing unconditionally would broadcast a rules change on every revoke, even one
  // with nothing to undo.
  if (remaining.length === faviconRules.length && !stored[INTERNAL_FAVICON_SEEDED_KEY]) {
    return;
  }

  await chrome.storage.sync.set({
    faviconRules: remaining,
    [INTERNAL_FAVICON_SEEDED_KEY]: false
  });
}

/**
 * Seed the internal-instance rules, once per grant.
 * @returns {Promise<void>}
 */
export async function seedInternalFaviconRules() {
  const stored = await chrome.storage.sync.get(['faviconRules', INTERNAL_FAVICON_SEEDED_KEY]);
  if (stored[INTERNAL_FAVICON_SEEDED_KEY]) {
    return;
  }

  const existing = stored.faviconRules || [];
  if (existing.some((rule) => INTERNAL_FAVICON_EFFECTS.includes(rule.effect))) {
    await chrome.storage.sync.set({ [INTERNAL_FAVICON_SEEDED_KEY]: true });
    return;
  }

  // One write, so the rules-changed listener broadcasts to open tabs just once.
  await chrome.storage.sync.set({
    faviconRules: [...internalFaviconRules(), ...existing],
    [INTERNAL_FAVICON_SEEDED_KEY]: true
  });
}
