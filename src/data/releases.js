export const releases = [
  {
    date: '2026-03-18',
    fullPage: true,
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.1.0',
    highlights: [
      'Fast lineage graph visualization for datasets and dataflows with ETL inspector and dataset preview',
      'Added dataflow support for Get Cards, Get Card Pages, and Delete',
      'Actions are enabled or disabled based on your Domo permissions',
      'Improved resilience when original Domo tab is closed for activity log and lineage',
      'User and group data cached per instance for the session, improving performance'
    ],
    summary:
      'Lineage graph, enhanced dataflow support, and permission-based action gating.',
    version: '1.1.0'
  },
  {
    date: '2026-03-10',
    fullPage: true,
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
    summary:
      'Initial public release',
    version: '1.0.0'
  }
];
