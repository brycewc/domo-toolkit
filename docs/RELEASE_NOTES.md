# Domo Toolkit v1.7.0 Release Notes (WIP)

## New Features and Improvements

- Migrate Content and Remap Columns can now drop a column that a dataset view only selects, removing the output columns it feeds instead of forcing a remap.
- Choosing to drop such a column now says which view columns go away with it.
- Migrate Content now opens faster on datasets with a lot of Beast Modes.
- Remap Columns now reloads the dataset's Cards page if you are still on it when the remap finishes.
- Migrate Content now warns before you migrate that a nested Beast Mode can't be created when the Beast Mode it nests is already nested on the target, and names the one to bring a copy of instead.
- Migrate Content now has a Refresh button on the page where you pick the target DataSet.
- The Activity Log now shows when the DomoStats Activity Log dataset last updated.

## UI Improvements

- Delete Unused Beast Modes now shows its delete progress on the Delete button instead of above the list.

## Bug Fixes

- Remap Columns no longer offers to drop a broken view column that the view also filters, groups, or sorts on.
- A Beast Mode whose formula can't be read no longer fails every content type in Migrate Content; it is now reported on its own and the rest still migrate.
- Migrate Content now reports why a Beast Mode's formula couldn't be read instead of showing a "Cannot read properties of null" message.
- Migrate Content and Remap Columns no longer count a Beast Mode as saved when Domo rejected the change.
- Remap Columns no longer fails a Beast Mode whose formula wasn't read during the initial scan.
- Migrate Content now offers to remap or drop a column the content references that is missing from both the original and the target dataset, instead of failing those items at the end.
- A card whose conditional formatting still names a dataset it no longer reads now migrates instead of failing.
- A card that still references a Beast Mode saved on a dataset it no longer reads now migrates instead of failing.
- Migrate Content now explains that Domo allows only one level of Beast Mode nesting when that is why a Beast Mode couldn't be created, instead of showing Domo's raw error.
- Auto Map now fills in a replacement column whose name differs only in capitalization or separators, instead of leaving it unmapped.
- Migrate Content and Remap Columns no longer count a column as used when the formula line referencing it is commented out.
- Migrate Content and Remap Columns no longer miss a column because an earlier commented-out line left a backtick unclosed.
