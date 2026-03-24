export const releases = [
   {
    date: '2026-03-23',
    fullPage: false,
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.1.2',
    highlights: [

    ],
    summary:
      'All improvements from 1.1.0, plus fixing a breaking bug that caused the extension to fail to load for some users on v1.1.0',
    version: '1.1.2'
  },
  {
    date: '2026-03-18',
    fullPage: true,
    githubUrl: 'https://github.com/brycewc/domo-toolkit/releases/tag/v1.1.0',
    highlights: [
      'Added dataflow support for Get Cards, Get Card Pages, and Delete',
      'Actions are enabled or disabled based on your Domo permissions',
      'User and group data cached per instance for the session, improving performance'
    ],
    summary:
      'Enhanced dataflow support, permission-based action gating, and performance improvements.',
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
