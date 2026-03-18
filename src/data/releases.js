export const releases = [
  {
    date: '2026-03-17',
    fullPage: true,
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.1.0',
    highlights: [
      'Pipeline Lineage Viewer — interactive graph visualization for datasets and dataflows with ETL inspector and data preview',
      'Full dataflow support across Get Cards, Get Card Pages, Get DataSets, Activity Log, Delete, and Update Details',
      'Permission gating — actions are enabled or disabled based on your actual Domo permissions',
      'Trace Lineage from any dataset row in Get DataSets and Get DataSets Used in View',
      'Improved resilience when original Domo tab is closed — lineage and activity log automatically find another tab',
      'User and group data cached per instance for the session, improving performance'
    ],
    summary:
      'Pipeline lineage viewer, full dataflow support, and permission-based action gating.',
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
