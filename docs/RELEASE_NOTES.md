# Domo Toolkit v1.7.0 Release Notes

## New Features and Improvements

- The Current Context footer and Navigate to Copied Object button now work fully for dashboards you don't have access to.
- The Current Context footer on a dataset produced by a Jupyter Workspace now has a Jupyter Workspace tab naming the workspace that produced it.
- Open All now warns when a list has more than 50 items and opens only the first 50.
- Share All is now much faster on a long list of pages, App Studio Apps, or Worksheets.
- The API Errors list now includes Magic ETL preview failures.
- An approval template with no dataset now has a Create DataSet button.
- Copy Filters now also captures the page's variables in the copied link.
- Objects Owned and Transfer Ownership now support Domo Everywhere Publications, Certification Processes, Governance Toolkit Jobs, and Scheduled Reports.
- Governance Toolkit Jobs and applications now link directly through Navigate to Copied Object and data list rows.
- Drill Paths can now be opened from a copied ID in Navigate to Copied Object.
- Added support for recognizing Data Models and Report Builder Reports.
- Views and Data Fusions are now recognized as their own types instead of being treated as plain DataSets, with JSON tabs for their definitions.
- The browser tab title updates from "Domo" for list pages, naming the specific section you are viewing.

### Beast Modes

- Beast Modes now support Get Cards, Get Card Pages, Get Beast Modes, Manage Card Owners, and Manage Card Locks.
- Beast Modes now support Migrate Content, repointing the cards, drills, and Beast Modes that use one onto a different Beast Mode or a column on the same dataset.
- Delete now supports listing dependencies and blocks until there are none.
- The Current Context footer on a Beast Mode now shows its dataset and the cards using it, and the Copy button offers to copy its DataSet ID.

### Delete

- DataSets, Beast Modes, and Workflows now list dependencies.
- Deleting a dataset or dataflow can now search for the Jupyter Workspaces that read or write it when you click Check Jupyter Workspaces, and names the places the dependency check doesn't look, such as workflows, Code Engine Packages, and Domo Everywhere Publications.
- Deleting a dataflow and its inputs now lets you pick which inputs go, says why an input can't be deleted with it, and lists the Beast Modes on its output datasets.
- Deleting an App Page or Worksheet Page can now delete the whole App or Worksheet while leaving the cards that also appear outside it in place.
- Warnings gather into a "Warnings" section you can collapse, and lists "Will Also Be Deleted" above "Other Dependencies".

### Task Center

- Task Center Tasks can now be voided, listing the task's queue and the workflow that created it, warning that the workflow waiting on it fails with it, and offering to cancel that execution first.
- Task Center Queues can now be shared with yourself, granting you admin on the queue, from the queue, its row in a list, or one of its tasks.
- A Task Center Task opened from a workflow's user task response page is now named and shows its queue.

### Activity Log

- People and groups now support an activity log across every card they own and the pages those cards appear on.
- The activity log on a list row or group header that covers several object types now offers each type as its own choice, such as just the App Pages or just the Cards.
- The activity log now shows when the DomoStats Activity Log dataset last updated.
- The activity log on a view or a data model now includes its created and edited events.

### Copy Color Rules

- Added support for picking which rules to copy.
- Added support for appending to existing rules on the target.
- Now says why a copy was rejected instead of showing an error code.

### Internal Domo Instances

- Domo development test rigs on domorig.io are now supported, under the same setting that enables locally run Domo instances.
- Anyone who already had locally run Domo instances enabled has to switch the setting on once more, since it now asks for localhost and domorig.io access together.
- Favicon Preferences now offers bottom-local and bottom-rig effects, putting a colored band across the bottom of the icon with LOCAL or RIG in it.
- Enabling internal Domo instances now adds favicon rules that mark locally run instances LOCAL and test rigs RIG, and turning the setting back off removes them.

## UI Improvements

- A workflow execution is now named for when it started, like "Run of My Workflow - 12/15/2025, 8:11:59 AM", instead of repeating the workflow's name.
- Get View Inputs is now named Get Fusion Inputs on a Fusion dataset.
- The Activity Log DataSet ID in Per-Instance Settings is now a link that opens that dataset in a new tab.
- A Code Engine Package version is now named with a "v" on its version number, like "Domo Certified Attributes - v1.0.1".
- Objects Owned now opens with a note listing the object types it cannot check, such as Custom App Designs and Workbench Jobs.
- Migrate Content now collapses its warnings into one block and lists each decision you still need to make with a count.

## Bug Fixes

- Fixed some deletes incorrectly reporting as successful when they error.
- Lots of adjustments to tab titles.
- A disabled checkbox, such as one in Manage Card Locks or Manage Card Owners, now explains why when you hover it.
- Open All on a group now reports the number of items it opened.
- A certification process for Beast Modes now opens its own admin page instead of the certified datasets page.
- Document Collections are recognized again now that Domo moved them to a new address, and links to them open the right page.
- Remove Empty String Filters now also finds empty string filters saved in a card's filter list, not just its quick filters.
- Navigate to Copied Object now identifies a pro-code custom app design as pro-code instead of calling it a brick, and a variable instead of calling it a Beast Mode.
- Share With Self on a view, data fusion, or data model now explains that it has no account instead of reporting that the account was not found.
- A custom app card no longer shows a Definition tab that fails to load.
- Get Card Pages now says there are no cards when an object has none, instead of reporting that its cards aren't on any pages.
- A dataflow's last run time in Lineage now includes the year when the run wasn't this year.
- Actions that depend on your permissions no longer stay hidden on a tab the extension couldn't read your account on when it loaded.
- Download Code on a Code Engine Package version no longer repeats the version number in the file name.
- Editing a card's drill path on an App Studio page no longer bounces you back to the app's landing page, thanks Kyle Perry!

### Activity Log

- The Activity Log on a report's page now shows that page's events instead of coming back empty.
- A group header with nothing loggable under it, such as a column in the Copy Color Rules list, no longer offers an activity log button that comes back empty.

### Delete

- Deleting a dataflow's inputs no longer removes an input that other content still uses or that another dataflow produces.
- Deleting a dataflow now reloads the dataflow's page.
- Deleting a scheduled report or an approval template now sends you to the Scheduled Reports or Request Forms list.

### Copy Filters

- A link copied by Copy Filters no longer changes its encoding in the address bar when you open it.
- Copy Filters now copies Beast Mode filters as their name instead of ID.
- Copy Filters no longer copies one filter several times when cards match it against a mix of columns and Beast Modes.

### Migrate Content and Remap Columns

- Fixed going back a step discarding the Beast Mode conflict choices you already made.
- Fixed being asked to map PDP policies before picking a target dataset, and being asked to remap the date grouping on a card's axis, such as month or quarter, as if it were a dataset column.
- Fixed content referencing a column that is missing from both the original and the target dataset failing at the end of the run; the column can now be remapped or dropped.
- Fixed a remap prompt, and a rejected card, when a formula spells a column name in a different capitalization than the dataset does.
- Fixed Auto Map leaving a replacement column unmapped when its name differs only in capitalization or separators.
- Fixed a Beast Mode counting as saved when Domo rejected the change.
- Fixed a Beast Mode whose formula can't be read failing every content type; it is now reported on its own with the reason, and Remap Columns no longer fails one whose formula wasn't read during the initial scan.
- Fixed a Beast Mode whose formula uses a variable being skipped.
- Fixed a Beast Mode being skipped when the Beast Mode it nests did migrate; a skipped Beast Mode now names the nested one that didn't.
- Fixed Beast Mode name conflict choices being ignored: Overwrite now replaces the target's Beast Mode rather than failing every one of them, and renaming a card's Beast Mode or pointing it at the target's now takes effect.
- Fixed a card failing to migrate due to its conditional formatting rules, when they name a dataset it no longer reads or a Beast Mode saved on one.
- Fixed a card carrying a filter that has no values failing to migrate; that filter is now removed.
- Fixed a Text card failing to migrate with a "Cannot read properties of null" message.
- Fixed a pro-code app card that takes its dataset binding from its App Design reporting as migrated while being left unchanged, and one that doesn't read the dataset now reports as skipped.
- Fixed a Magic ETL dataflow that already reads the target dataset failing to migrate; its input tiles are now merged.
- Fixed the card counts for both datasets in the Data Center and on their overview pages not updating after Migrate Content runs.
- An alert whose Personalized Data Permissions are set to Contextual now migrates and stays Contextual, instead of being rebound to whichever PDP policies you have access to, and Migrate Content no longer asks you to map PDP policies for it.
- Migrating an alert no longer leaves you subscribed to it, unless you were subscribed to the original, or signs you up for a daily or weekly digest that belonged to one of its subscribers.
