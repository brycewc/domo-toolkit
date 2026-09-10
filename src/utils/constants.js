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

// Match patterns cannot contain a port, so `*.localhost` covers every local dev
// port, and `<customer>.localhost.domo.com` already falls inside the domo.com
// pattern. The internal patterns are one optional permission granted as a unit,
// so queries and listeners using these return nothing for those hosts until a
// Domo developer opts in.
export const LOCAL_MATCH_PATTERN = '*://*.localhost/*';
export const RIG_MATCH_PATTERN = '*://*.domorig.io/*';
export const INTERNAL_MATCH_PATTERNS = [LOCAL_MATCH_PATTERN, RIG_MATCH_PATTERN];
export const DOMO_MATCH_PATTERNS = ['*://*.domo.com/*', ...INTERNAL_MATCH_PATTERNS];

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
  '/ai-services/jupyter': 'Jupyter Workspaces',
  '/alerts': 'Alerts Management',
  '/app-studio': 'App Studio Apps',
  '/appDb': 'AppDB Admin',
  '/approval': 'Approvals',
  '/codeengine': 'Code Engine Packages',
  '/datacenter/accounts': 'Accounts',
  '/datacenter/beastmode': 'Beast Mode',
  '/workflows': 'Workflows',
  '/workspaces': 'Workspaces'
};

// Domo's impact and lineage endpoints can take ten seconds each on a large
// instance, so per-dataset dependency lookups run together rather than one at a
// time; the cap keeps a wide list from firing every request at once.
export const DEPENDENCY_FETCH_CONCURRENCY = 6;

// Lists here run to thousands of rows, and a tab per row locks up the browser.
export const MAX_OPEN_ALL_TABS = 50;

// Domo's share endpoints take a list of resources, so a bulk share goes out in
// chunks rather than one request per object. Caps how many ride along per call.
export const SHARE_BATCH_SIZE = 100;

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
