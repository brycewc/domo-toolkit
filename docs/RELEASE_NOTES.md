# Domo Toolkit v1.7.0 Release Notes (WIP)

## New Features and Improvements

- The Current Context footer now shows the name of a dashboard, App Page, or Worksheet View you don't have access to, and Navigate to Copied Object recognizes such a dashboard's ID.
- The Current Context footer on a dataset produced by a Jupyter Workspace now has a Jupyter Workspace tab naming the workspace that produced it.
- Open All now warns when a list has more than 50 items and opens only the first 50.
- Share All is now much faster on a long list of pages, App Studio Apps, or Worksheets.
- The API Errors list now includes Magic ETL preview failures.
- An approval template with no dataset now has a Create DataSet button.
- Certification Processes now support Objects Owned and Transfer Ownership.
- Domo Everywhere Publications now support Objects Owned and Transfer Ownership.
- Governance Toolkit Jobs now support Objects Owned and Transfer Ownership, listed under the application that holds them.
- Governance Toolkit Jobs and applications now open straight from a copied ID, a row in a list, or a link you share.
- Drill Paths can now be opened from a copied ID in Navigate to Copied Object.
- Scheduled Reports now support Objects Owned and Transfer Ownership.
- Data Models are now recognized as their own type.
- Views and Data Fusions are now recognized as their own types instead of being treated as plain DataSets.
- The Current Context footer on a data model, view, or data fusion now has a Definition tab showing how it is built.
- Data models now support Get Data Model Inputs.

### Reports

- Reports now support Objects Owned and Transfer Ownership, and transferring a report also moves its deliveries to the new owner.
- A report you have open in Report Builder is now recognized as the current object.
- The Current Context footer now shows a report's Studio App, report page, and deliveries, a scheduled report's report and Studio App, and a Reports tab on a Studio App.
- The Copy button on a report now offers to copy its App ID and its report page ID.

### Beast Modes

- Beast Modes now support Get Cards, Get Card Pages, Get Beast Modes, Manage Card Owners, and Manage Card Locks.
- Beast Modes now support Migrate Content, repointing the cards, drills, and Beast Modes that use one onto a different Beast Mode or a column on the same dataset and deleting the original once nothing uses it.
- Deleting a Beast Mode now lists the cards, drills, and Beast Modes that still use it, and blocks the delete until nothing does.
- The Current Context footer on a Beast Mode now shows its dataset and the cards using it, and the Copy button offers to copy its DataSet ID.

### Code Engine Packages

- Code Engine Packages now support Get Usage, listing the workflows and custom apps that use them, marking each workflow version Active or Inactive, and narrowing to just the active versions or the package version you are viewing.
- Code Engine Packages now support Delete, removing the package and every version it has from either the package or one of its versions.
- Deleting a Code Engine Package now lists the workflows and custom apps that use it, and blocks the delete until nothing live does.
- The Current Context footer on a Code Engine Package now has Workflows, App Designs, and Custom Apps tabs.
- A Code Engine tile selected in a workflow now has an Open in Code Engine button that opens its package page in a new tab.

### Migrate Content and Remap Columns

- Migrate Content and Remap Columns can now drop a column that a dataset view only selects, naming the output columns that go away with it, instead of forcing a remap.
- Migrate Content now moves the Jupyter Workspaces that read a dataset onto the new dataset when you press Check Jupyter Workspaces, warning that a moved workspace's notebook code still names the old columns.
- Migrate Content now warns before you migrate that a nested Beast Mode can't be created when the Beast Mode it nests is already nested on the target, and names the one to bring a copy of instead.
- Migrate Content now has a Set All button that applies one choice to every Beast Mode conflict at once, and a Refresh button on the page where you pick the target dataset.
- Migrate Content now opens faster on datasets with a lot of Beast Modes.
- Remap Columns now reloads the dataset's Cards page if you are still on it when the remap finishes.

### Delete

- DataSets other than a dataflow's outputs now support Delete, listing the cards, alerts, Beast Modes, and PDP policies that go with one, and blocking the delete while a dataset view is built on it.
- Deleting a dataset or dataflow can now search for the Jupyter Workspaces that read or write it when you press Check Jupyter Workspaces, and names the places the dependency check doesn't look, such as workflows, Code Engine Packages, and Domo Everywhere Publications.
- Deleting a dataflow and its inputs now lets you pick which inputs go, says why an input can't be deleted with it, and lists the Beast Modes on its output datasets.
- Deleting a workflow now lists the datasets, forms, Task Center Queues, Code Engine Packages, subflows, pages, and Jupyter Workspaces it uses, and names anything the check couldn't read.
- Deleting an App Page or Worksheet Page can now delete the whole App or Worksheet while leaving the cards that also appear outside it in place.
- The dependency list for deleting a dataflow now appears right away, with each output dataset's dependency count filling in as it arrives, and a dataflow's cards load faster when it has several output datasets.

### Task Center

- Task Center Tasks can now be voided, listing the task's queue and the workflow that created it, warning that the workflow waiting on it fails with it, and offering to cancel that execution first.
- Task Center Queues can now be shared with yourself, granting you admin on the queue, from the queue, its row in a list, or one of its tasks.
- A Task Center Task opened from a workflow's user task response page is now named and shows its queue.

### Activity Log

- People and groups now support an activity log across every card they own and the pages those cards appear on.
- The activity log on a list row or group header that covers several object types now offers each type as its own choice, such as just the App Pages or just the Cards.
- The Activity Log now shows when the DomoStats Activity Log dataset last updated.
- The activity log on a view or a data model now includes its created and edited events.

### Copy Color Rules

- Copy Color Rules now lets you pick which rules to copy instead of copying all of them, listing each with its color, grouped by the column it tests.
- Copy Color Rules can now add its rules to the destination's existing ones instead of always replacing them.
- Copy Color Rules now says why a copy was rejected instead of showing an error code.

### Internal Domo Instances

- Domo development test rigs on domorig.io are now supported, under the same setting that enables locally run Domo instances.
- Anyone who already had locally run Domo instances enabled has to switch the setting on once more, since it now asks for localhost and domorig.io access together.
- Favicon Preferences now offers bottom-local and bottom-rig effects, putting a colored band across the bottom of the icon with LOCAL or RIG in it.
- Enabling internal Domo instances now adds favicon rules that mark locally run instances LOCAL and test rigs RIG, and turning the setting back off removes them.

## UI Improvements

- A workflow execution is now named for when it started, like "Run of My Workflow - 12/15/2025, 8:11:59 AM", instead of repeating the workflow's name.
- Get View Inputs is now named Get Fusion Inputs on a Fusion.
- The Activity Log DataSet ID in Per-Instance Settings is now a link that opens that dataset in a new tab.
- A Code Engine Package version is now named with a "v" on its version number, like "Domo Certified Attributes - v1.0.1".

### Objects Owned

- Objects Owned now opens with a note listing the object types it cannot check, such as Custom App Designs and Workbench Jobs.

### Alerts and Toasts

- Update Details' and Delete's messages now lead with a short title such as "Success" or "Invalid Email" and put the detail below it.
- Buttons in an alert or a toast now carry an icon, stretch to fill the width, and sit below the message instead of beside it.

### Migrate Content

- Migrate Content now collapses its warnings into one block and lists each decision you still need to make with a count.
- Migrate Content no longer pre-picks how to resolve a Beast Mode conflict, and its confirm dialog spells out what any choices you left unmade will do.

### Delete

- Delete now gathers its warnings into a "Warnings" section you can collapse, and lists "Will Also Be Deleted" above "Other Dependencies".

## Bug Fixes

- Hovering a Jupyter Workspace in a list no longer puts scrollbars on the whole panel.
- A delete that the platform refuses now reports the failure and keeps the view open instead of reading as a success.
- A checkbox you can't tick, such as one in Manage Card Locks or Manage Card Owners, now explains why when you hover it.
- Open All on a group now reports the number of items it actually opened.
- Lists now order names containing numbers by value, so Card 9 comes before Card 10 instead of after it.
- Task Center tasks and queues on an internal Domo instance now open at the right address.
- A certification process for Beast Modes now opens its own admin page instead of the certified datasets page.
- Document Collections are recognized again now that Domo moved them to a new address, and links to them open the right page.
- Remove Empty String Filters now also finds empty string filters saved in a card's filter list, not just its quick filters.
- Navigate to Copied Object now identifies a pro-code custom app design as pro-code instead of calling it a brick, and a variable instead of calling it a Beast Mode.
- Objects Owned and Transfer Ownership no longer list a dataflow that has been deleted.
- Set Stream to Manual no longer appears on a data model.
- Share With Self on a view, data fusion, or data model now explains that it has no account instead of reporting that the account was not found.
- A custom app card no longer shows a Definition tab that fails to load.
- Get Card Pages now says there are no cards when an object has none, instead of reporting that its cards aren't on any pages.
- A dataflow's last run time in Lineage now includes the year when the run wasn't this year.
- The tab title on an alert now shows the alert's name instead of "Alerts Management" or the dataset's name.
- The browser tab title now updates when you open a different object in the same tab, instead of staying stuck on the first one.
- Leaving an agent or toolkit in the AI Library now shows "AI Agents" or "AI Toolkits" in the browser tab.
- Actions that depend on your permissions no longer stay hidden on a tab the extension couldn't read your account on when it loaded.
- Download Code on a Code Engine Package version no longer repeats the version number in the file name.

### Activity Log

- The Activity Log on a report's page now shows that page's events instead of coming back empty.
- A group header with nothing loggable under it, such as a column in the Copy Color Rules list, no longer offers an activity log button that comes back empty.

### Delete

- Deleting a dataflow's inputs no longer removes an input that other content still uses or that another dataflow produces.
- Deleting a dataflow now reloads the dataflow's page if you are still on it.
- Deleting a scheduled report or an approval template now sends you to the Scheduled Reports or Request Forms list if you are still on the deleted object's page.

### Copy Filters

- Copy Filters now names a Beast Mode filter instead of copying its ID.
- Copy Filters no longer copies one filter several times when cards match it against a mix of columns and Beast Modes.

### Migrate Content and Remap Columns

- Going back a step in Migrate Content no longer discards the Beast Mode conflict choices you already made.
- Migrate Content no longer asks you to map PDP policies before you have picked a target dataset.
- Migrate Content now offers to remap or drop a column the content references that is missing from both the original and the target dataset, instead of failing those items at the end.
- Migrate Content and Remap Columns no longer ask you to remap a column because a formula spells its name in a different capitalization than the dataset does, and a card that spells one differently now migrates instead of being rejected.
- Migrate Content and Remap Columns no longer count a column as used when the formula line referencing it is commented out, or miss one because an earlier commented-out line left a backtick unclosed.
- Migrate Content now skips a downstream data model instead of attempting a repoint that has no effect.
- Remap Columns now flags a downstream data model for review instead of reporting that it uses none of the columns.
- Migrate Content and Remap Columns no longer ask you to remap the date grouping on a card's axis, such as month or quarter, as if it were a dataset column.
- Auto Map now fills in a replacement column whose name differs only in capitalization or separators, instead of leaving it unmapped.
- Remap Columns no longer offers to drop a broken view column that the view also filters, groups, or sorts on.
- Migrate Content and Remap Columns no longer count a Beast Mode as saved when Domo rejected the change.
- A Beast Mode whose formula can't be read no longer fails every content type in Migrate Content; it is now reported on its own, with the reason it couldn't be read, and the rest still migrate.
- Remap Columns no longer fails a Beast Mode whose formula wasn't read during the initial scan.
- Migrate Content now migrates a Beast Mode whose formula uses a variable instead of skipping it.
- Migrate Content no longer skips a Beast Mode when the Beast Mode it nests did migrate, and names the nested Beast Mode that didn't migrate when it does skip one.
- Choosing Overwrite for a Beast Mode conflict in Migrate Content now replaces the target's Beast Mode instead of failing every one of them.
- Renaming a card's Beast Mode, or pointing it at the target's, to settle a name conflict in Migrate Content now takes effect instead of being ignored.
- Migrate Content now explains that Domo allows only one level of Beast Mode nesting when that is why a Beast Mode couldn't be created, instead of showing Domo's raw error.
- A card whose conditional formatting still names a dataset it no longer reads, or that references a Beast Mode saved on one, now migrates instead of failing.
- A card carrying a filter that has no values now migrates, and that filter is removed.
- Migrate Content now repoints a Text card instead of failing it with a "Cannot read properties of null" message.
- Migrate Content and Remap Columns now update a pro-code app card that takes its dataset binding from its App Design, instead of reporting success while leaving it unchanged, and report one that doesn't read the dataset as skipped instead of counting it as migrated.
- Migrate Content and Remap Columns no longer warn that a pro-code app would lose fields when the app already maps two of its fields to the same column.
- Migrate Content and Remap Columns now update a dataset view instead of failing it with "Unknown error".
- Migrate Content now merges the input tiles of a Magic ETL dataflow that already reads the target dataset, instead of failing it.
- Migrate Content now warns as soon as you pick a target dataset that some of the selected content already reads it, and skips a SQL dataflow, dataset view, or fusion that already reads it, saying which ones it left behind.
- The card counts shown for both datasets in the Data Center and on their overview pages now update after Migrate Content runs.

### Migrating Alerts

- An alert whose Personalized Data Permissions are set to Contextual now migrates and stays Contextual, instead of being rebound to whichever PDP policies you have access to, and Migrate Content no longer asks you to map PDP policies for it.
- An alert carrying both the "All Rows" policy and named PDP policies now migrates, leaving off the "All Rows" policy Domo won't accept alongside them.
- Migrating an alert no longer leaves you subscribed to it, unless you were subscribed to the original, or signs you up for a daily or weekly digest that belonged to one of its subscribers.
- An alert Domo refuses to move now reports Domo's reason and trace ID instead of a raw error body.
- An alert whose columns the target dataset isn't exposing yet, such as while it finishes indexing after an update, now says so instead of failing with "Bad Request".
