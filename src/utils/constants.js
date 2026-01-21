/**
 * Application-wide constants
 */

// List of excluded hostnames where certain features should be disabled
// These are special Domo domains that should be excluded from favicon modifications
// and not shown in instance selection lists
export const EXCLUDED_HOSTNAMES = [
  'domo.com',
  'www.domo.com',
  'embed.domo.com',
  'community-forums.domo.com',
  'domo-support.domo.com',
  'ai.domo.com',
  'api.domo.com',
  'git.empdev.domo.com',
  'wikidev.domo.com',
  'onjira.domo.com',
  'developer.domo.com',
  'adminprod.domo.com'
];

// Get excluded instances (without .domo.com suffix)
export const EXCLUDED_INSTANCES = EXCLUDED_HOSTNAMES.map((hostname) =>
  hostname.endsWith('.domo.com') ? hostname.replace('.domo.com', '') : hostname
);

// Partial match patterns for action colors
// Checked after exact matches, uses .includes() for matching
export const ACTION_COLOR_PATTERNS = {
  created: 'success',
  deleted: 'danger',
  enabled: 'success',
  exported: 'warning',
  imported: 'success',
  killed: 'danger',
  shared: 'accent',
  updated: 'warning',
  viewed: 'accent',
  changed: 'warning',
  added: 'success',
  removed: 'danger',
  failed: 'danger',
  started: 'success',
  stopped: 'danger',
  completed: 'success',
  canceled: 'danger',
};