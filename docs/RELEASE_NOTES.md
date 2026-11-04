# Domo Toolkit v1.9.0 Release Notes

## New Features and Improvements

- Card Owners, Get Collections, and other views that read many cards at once now load large card lists much faster.
- Migrate Content can now be scoped to specific pages and apps or launched from them. ([#100](https://github.com/brycewc/domo-toolkit/issues/100))
- Activity Log on a user now has an Actions by User option that lists the actions that user took, not just the actions taken on them.
- The Activity Log's user filter now lists inactive users.

## Newly Supported Object Types

- Connectors are now detected on their App Store page, with Streams and Accounts tabs listing where they are used.

## UI Improvements

## Bug Fixes

- Fixed Cancel Run not working on datasets with a long run history.
- Fixed names in the Activity Log's Object and Source columns often not linking to the object.
- Fixed a page's cards failing to load on some dashboards. _(TODO: confirm which views hit this, e.g. Get DataSets on a dashboard, before release)_
- Fixed listing app cards failing on datasets with several thousand of them.
- Objects Owned and Transfer Ownership no longer show failed rows for object types the instance doesn't have enabled, such as Workflows, Code Engine, Jupyter, or Goals.
- Migrate Content no longer offers to search Jupyter Workspaces on instances without Jupyter.
- Deleting a Code Engine package is no longer blocked on instances without Workflows or AI Services.
- Deleting a Workflow now succeeds when a deleted version was left running, and reports an error instead of success when the Workflow isn't actually deleted.
- Migrate Content now updates the alerts on migrated cards, which previously kept pointing at the old dataset's PDP policies, columns, and Beast Modes.
- Migrate Content now recognizes Beast Modes used in a card's color rules instead of listing them as missing columns.
