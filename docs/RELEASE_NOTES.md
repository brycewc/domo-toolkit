# Domo Toolkit v1.7.0 Release Notes (WIP)

## New Features and Improvements

- Migrate Content and Remap Columns can now drop a column that a dataset view only selects, removing the output columns it feeds instead of forcing a remap.
- Choosing to drop such a column now says which view columns go away with it.
- Migrate Content now opens faster on datasets with a lot of Beast Modes.
- Remap Columns now reloads the dataset's Cards page if you are still on it when the remap finishes.
- Migrate Content now warns before you migrate that a nested Beast Mode can't be created when the Beast Mode it nests is already nested on the target, and names the one to bring a copy of instead.
- Migrate Content now has a Refresh button on the page where you pick the target DataSet.
- The Activity Log now shows when the DomoStats Activity Log dataset last updated.
- The Current Context footer now shows the name of a dashboard, App Page, or Worksheet View you don't have access to.
- Navigate to Copied Object now recognizes the ID of a dashboard you don't have access to.
- Deleting a Beast Mode now lists the cards, drills, and Beast Modes that still use it, and blocks the delete until nothing does.
- Beast Modes now support Get Cards, listing the cards and drills that use them.
- Beast Modes now support Get Card Pages.
- Beast Modes now support Get Beast Modes, listing their nested Beast Modes and the ones they are nested in.
- Beast Modes now support Manage Card Owners and Manage Card Locks across the cards that use them.
- The Current Context footer on a Beast Mode now shows its DataSet and the cards using it.
- The Copy button on a Beast Mode now offers to copy its DataSet ID.
- Code Engine Packages now support Get Usage, listing the workflows and custom apps that use them.
- Get Usage marks each workflow version Active or Inactive.
- Get Usage can show only the active workflow versions.
- Get Usage can narrow the list to the package version you are viewing.
- The Current Context footer on a Code Engine Package now has Workflows, App Designs, and Custom Apps tabs.
- Code Engine Packages now support Delete, removing the package and every version it has.
- Deleting a Code Engine Package now lists the workflows and custom apps that use it, and blocks the delete until nothing live does.
- Delete on a Code Engine Package version now deletes its whole package.
- Deleting a DataFlow and its inputs now lets you pick which inputs go.
- An input DataSet that can't be deleted with its DataFlow now says why.
- The dependency list for deleting a DataFlow now appears right away.
- An output DataSet's dependency count now fills in as it arrives.
- A DataFlow's cards now load faster when it has several output DataSets.

## UI Improvements

- Delete Unused Beast Modes now shows its delete progress on the Delete button instead of above the list.
- The "System" chip on a system page now sits at the right of the row next to its actions instead of beside the name.

## Bug Fixes

- Deleting a DataFlow's inputs no longer removes an input that other content still uses or that another DataFlow produces.
- Deleting a Scheduled Report now sends you to the Scheduled Reports list if you are still on the deleted report's page.
- Deleting an Approval Template now sends you to the Request Forms list if you are still on the deleted template's page.
- A checkbox you can't tick, such as one in Manage Card Locks or Manage Card Owners, now explains why when you hover it.
- Lists now order names containing numbers by value, so Card 9 comes before Card 10 instead of after it.
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
- Document Collections are recognized again now that Domo moved them to a new address, and links to them open the right page.
- Remove Empty String Filters now also finds empty string filters saved in a card's filter list, not just its quick filters.
