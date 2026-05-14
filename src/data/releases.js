export const releases = [
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
    summary:
      'Major release with improvements to activity log, delete, cookie clearing, extension icons, and overall UI.',
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
    summary:
      'Enhanced dataflow support, permission-based action gating, and performance improvements.',
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
