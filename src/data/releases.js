export const releases = [
  {
    date: '2026-08-24',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.6.0',
    highlights: [
      'Delete Unused Beast Modes: find every Beast Mode and Variable on a dataset or person with no active usage, review the results, and delete them in one pass',
      "Manage Card Owners: see every owner across all of an object's cards and add or remove users and groups on many cards at once",
      'Update Action Versions (formerly Update Code Engine Versions) now bumps subflow action versions too, handles workflow version locks, and offers a No Change override per action',
      'Remap Columns can now repair dataset views broken by a renamed or removed column, drop a broken column outright, and fill in every replacement with one Auto Map click',
      'Delete adds combined actions for a dataflow with its inputs and outputs, a page with only the cards that live there, and a datastore with all of its collections',
      'Get Owned Objects and Transfer Ownership now work on a group, and Get Card Pages now works on a person',
      'Lineage nodes now show who owns each dataset or dataflow, and lineage exports include owner columns',
      'Pro-code custom apps and custom app instances are recognized as their own types, with links between a card, its app instance, and the app design behind it'
    ],
    notify: 'fullPage',
    summary:
      'Feature release adding Delete Unused Beast Modes and Manage Card Owners, expanded Update Action Versions and Remap Columns, new combined delete actions, group-level ownership tools, and recognition for pro-code custom apps.',
    version: '1.6.0'
  },
  {
    date: '2026-07-04',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.5.1',
    highlights: [
      'Remap Columns: repair every downstream card, beast mode, dataflow, and dataset view that references a renamed or removed dataset column',
      'Get Beast Modes: list the beast modes tied to a dataset, dataflow, card, page, app, or worksheet, showing where each one is used',
      'Inspect DataFlow: open a searchable, exploded view of every transform in a dataflow, with SQL formatted and color-coded',
      'Lineage graphs can now export their full upstream and downstream lineage as a CSV, Excel, or JSON file',
      'Get Workspaces lists the workspaces a card, dataset, dataflow, dashboard, app, worksheet, or workflow has been added to',
      "Update Trigger Versions repoints all of a workflow's alert triggers to a chosen version in one step"
    ],
    notify: 'fullPage',
    summary:
      'Feature release adding Remap Columns, Get Beast Modes, Inspect DataFlow, Get Workspaces, and lineage export, plus new support for Jupyter Workspaces, Accounts, Scheduled Reports, and Certifications.',
    version: '1.5.1'
  },
  {
    date: '2026-06-05',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.4.0',
    highlights: [
      'Migrate DataSet Content (Beta): repoint every beast mode, card, drill path, dataflow, and dataset view from one dataset to another in a single pass, with a schema-compatibility check and column remapping that reaches inside formulas and SQL',
      'Transfer Ownership (Beta) now lets you pick individual objects within a type instead of all-or-nothing, with tasks nested under their parent project',
      'Duplicate User now lists every shared card, page, and app for per-item re-sharing, auto-downloads an Excel audit log, and no longer over-shares content the source user only reached indirectly',
      'AppDB collections gain Sync Datastore and Generate Schema actions, inferring a column schema from recent documents',
      'Approval Templates can be deleted with a full dependency check, or deleted together with their backing dataset',
      'Activity Log adds an "in / not in" user filter and combined logs for app pages and worksheet views alongside their parent',
      'New object type recognition for Variables, Drill Paths, and DataFlow Executions'
    ],
    notify: 'fullPage',
    summary:
      'Feature release adding Migrate DataSet Content, granular Transfer Ownership and Duplicate User controls, AppDB and Approval Template tools, and several newly recognized object types.',
    version: '1.4.0'
  },
  {
    date: '2026-05-14',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.3.0',
    highlights: [
      'User off-boarding suite: transfer ownership of all objects to another user, view everything a user owns, clone users with their access intact, and a new Direct Sign-On button',
      "Activity Log can now read from DomoStats datasets, surfacing audit data beyond the API's ~1-year retention window",
      'Cancel Stuck Stream Update: clear a dataset stream stuck in ACTIVE state without filing a support ticket',
      'Sync JSDoc to Code Engine Package: derive the package manifest from JSDoc and update it in place, with a structural diff preview',
      'Major Delete Object improvements: preview all dependencies before confirming, with pages-with-children hard-blocked',
      'Cookie Clearing Settings split into three independent controls (auto-clear, button visibility, button behavior) so they can coexist',
      'Custom Toolbar Icon Color: choose between Domo Blue, Black, or White for the toolbar icon to ensure visibility against any browser theme',
      "Replaced Tabler icons with Domo's official icon set for visual consistency across the extension"
    ],
    notify: 'fullPage',
    summary: 'Major release with improvements to activity log, delete, cookie clearing, extension icons, and overall UI.',
    version: '1.3.0'
  },
  {
    date: '2026-04-05',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.2.0',
    highlights: [
      'New Lineage graph feature to trace upstream and downstream dependencies for datasets and dataflows with lightning-fast performance and a sleek UI',
      'Easily update all code engine actions in a workflow to the latest version with a single click',
      'Navigate from copied object now activates on button click instead of passive monitoring, improving performance and reliability',
      'Added object type recognition for workflow triggers',
      'New transparent extension icon that works on all toolbar backgrounds'
    ],
    notify: 'fullPage',
    summary:
      'Major release introducing a new lightning-fast lineage graph and bulk upgrade versions feature for workflow code engine actions.',
    version: '1.2.0'
  },
  {
    date: '2026-03-24',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.1.3',
    highlights: [],
    notify: 'silent',
    summary: 'Fixed user rights detection failing on some Domo instances.',
    version: '1.1.3'
  },
  {
    date: '2026-03-18',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.1.0',
    highlights: [
      'Added dataflow support for Get Cards, Get Card Pages, and Delete',
      'Actions are enabled or disabled based on your Domo permissions',
      'User and group data cached per instance for the session, improving performance'
    ],
    notify: 'fullPage',
    summary: 'Enhanced dataflow support, permission-based action gating, and performance improvements.',
    version: '1.1.0'
  },
  {
    date: '2026-03-10',
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.0.0',
    highlights: [
      'Release notes notifications',
      'Long-press Copy Filtered URL for an option to copy just the pfilters param',
      'Open datasets in Views Explorer from data discovery views',
      'Share All now includes the parent page along with all child pages',
      'Fixed domo-logo-colored favicon rules not applying outside of dev mode',
      'Workflow deletion now deactivates active versions first (failed before if active versions were present)',
      'Activity log date filtering is now server-side for better performance and more accurate results',
      'Copy ID keyboard shortcut (Ctrl+Shift+1) now shows badge feedback on extension icon for success or failure'
    ],
    notify: 'fullPage',
    summary: 'Initial public release',
    version: '1.0.0'
  }
];
