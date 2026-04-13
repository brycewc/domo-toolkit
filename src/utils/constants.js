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
  '^dis': 'danger',
  '^un': 'danger',
  'added': 'success',
  'canceled': 'danger',
  'changed': 'warning',
  'completed': 'success',
  'created': 'success',
  'deleted': 'danger',
  'enabled': 'success',
  'exported': 'warning',
  'failed': 'danger',
  'imported': 'success',
  'killed': 'danger',
  'removed': 'danger',
  'shared': 'success',
  'started': 'success',
  'stopped': 'danger',
  'updated': 'warning'
};

// URL prefix → human-readable section name for list/index pages where Domo
// leaves the tab title as just "Domo".  Matched by longest-prefix-first so
// more-specific paths win (e.g. /datacenter/dataflows before /datacenter).
export const SECTION_TITLES = {
  '/codeEngine': 'Code Engine Packages',
  '/workflows': 'Workflows',
  '/workspaces': 'Workspaces'
};

export const EXPORT_FORMATS = {
  csv: {
    accept: 'text/csv',
    extension: 'csv'
  },
  excel: {
    accept: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    extension: 'xlsx'
  },
  powerpoint: {
    accept:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx'
  }
};
