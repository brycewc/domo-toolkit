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

// Chrome match patterns for every host the extension may act on: hosted Domo
// instances plus locally run ones. Match patterns cannot contain a port, so
// `*.localhost` covers every local dev port, and local hosts of the form
// `<customer>.localhost.domo.com` already fall inside the domo.com pattern.
// Access to the localhost pattern is an optional permission, so queries and
// listeners using these simply return nothing for local hosts until the
// developer opts in.
export const LOCAL_MATCH_PATTERN = '*://*.localhost/*';
export const DOMO_MATCH_PATTERNS = ['*://*.domo.com/*', LOCAL_MATCH_PATTERN];

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

// URL prefix → human-readable section name for a Domo section, covering both its
// list/index page and the detail pages beneath it. Used two ways: when Domo leaves
// a list page's tab title as bare "Domo", we set the section name; and because Domo
// reuses these titles across a section's list and its detail pages, they count as
// overwritable "managed" titles, so when Domo stamps one onto a detail page after
// we've resolved an object name (e.g. "People - Domo" over a person's name), we
// re-apply that name. Matched by longest-prefix-first so more-specific paths win
// (e.g. /datacenter/dataflows before /datacenter).
export const SECTION_TITLES = {
  '/admin/people': 'People',
  '/app-studio': 'App Studio Apps',
  '/appDb': 'AppDB Admin',
  '/approval': 'Approvals',
  '/codeengine': 'Code Engine Packages',
  '/datacenter/accounts': 'Accounts',
  '/datacenter/beastmode': 'Beast Mode',
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
    accept: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    extension: 'pptx'
  }
};
