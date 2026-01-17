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
