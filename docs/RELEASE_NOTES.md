---
---

# Domo Toolkit v1.5.0 Release Notes (WIP)

## New Features and Improvements

- Added a setting to strip the " - Domo" suffix from Domo tab titles.
- Added Remap Columns for datasets: repair every downstream card, Beast Mode, dataflow, dataset view, and pro-code app card that references a renamed or removed column, with the old column names discovered automatically from the broken content.
- Update Person Details lets admins change a user's username (the login and SSO identity), with an option to keep the email in sync.
- Approval Center datasets now show a Template tab linking to the approval template that created them.
- Side panel views are now scoped to each Domo instance, so switching instances swaps to that instance's own view (in-progress operations included) instead of carrying one view everywhere.
- Get DataSets now always shows both Input DataSets and Output DataSets for dataflows, marking an empty side as (0) instead of hiding it.
- Get DataSets for a page, App Studio page, or worksheet page now nests the cards on that page under the datasets they come from. ([#89](https://github.com/brycewc/domo-toolkit/issues/89))
- Get DataSets now works on connector accounts, listing the datasets an account feeds.
- Get Cards now always shows Cards, Forms, and Queues for App Studio pages, marking an empty category as (0) instead of hiding it.
- The lineage view can now export its full upstream and downstream lineage (with each object's level relative to the root) as a CSV, Excel, or JSON file. ([#83](https://github.com/brycewc/domo-toolkit/issues/83))
- The popup, side panel, and object details now show when the current object was created.
- An approval request now has a Transfer Approval button to reassign that single pending request to another user.
- Added Manage Tags for dataflows: add or remove tags on a dataflow and its output datasets together in one step.
- A dataflow's Inputs and Outputs JSON tabs now show each dataset's full details and links instead of just its name and ID.
- Inspect DataFlow now shows the tiles for the specific version you're viewing when you open a dataflow at an older version, instead of always showing the current one.
- Admins can now switch a dataset to any compatible account in the instance, without first sharing that account with themselves.
- Added Get Beast Modes: list the Beast Modes tied to a dataset, dataflow, card, page, app, or worksheet, showing the cards, drills, and other Beast Modes each one is used on. ([#7](https://github.com/brycewc/domo-toolkit/issues/7))
- The welcome screen now has a quick theme switcher to set System, Light, or Dark without opening settings.
- The delete confirmation view now lets you share an affected object, or all affected objects, with yourself.
- Cards now have a Definition tab showing the card's full underlying definition. ([#81](https://github.com/brycewc/domo-toolkit/issues/81))
- Alerts now have an Actions tab listing the actions an alert triggers, with a link to the workflow, scheduled report, or task behind each one.
- Generate Definition from JSDoc now picks up a function's nested output schema (the fields of the objects it returns), where before it only read the top-level return type.
- Added Update Trigger Versions, which repoints all of a workflow's alert triggers to a chosen version in one step, with the option to exclude individual triggers.
- Added Get Workspaces, which lists the workspaces a card, dataset, dataflow, dashboard, app, worksheet, or workflow has been added to.
- Update Details now lets you rename an AppDB collection.

### Copy Filters

- Copy Filters now copies the filtered URL as a clickable formatted link titled with the page name, instead of as plain text.
- Copy Filters now offers an option to apply the active filters to the current tab and reload it, useful for keeping the filter state after page refresh.

### Migrate Content

- Migrate Content now moves a dataset's alerts to the target dataset, prompting you to map any PDP policy that has no match there.
- When migrating downstream content, navigating to another dataset now offers it as the migration target in one click, instead of having to copy and paste its ID.
- Migrate Content now repoints pro-code app cards to the target dataset along with the rest of a dataset's downstream content, instead of skipping them.

### Jupyter Workspaces

- Jupyter Workspaces are now detected when their settings dialog is open, so a workspace no longer needs to be running to act on it.
- Jupyter Workspaces now show their input datasets, output datasets, and accounts as tabs, with details and links for each.

### Duplicate User

- Duplicate User can now add a source user's groups and individually-shared content to an existing user, not just create a new one. ([#91](https://github.com/brycewc/domo-toolkit/issues/91))
- Duplicate User now lets you choose which of the source user's group memberships to copy, instead of always copying them all.

### Get Card Pages

- Get Card Pages now lists cards that aren't on any page under an Orphaned Cards group, instead of leaving them out of the results.
- Get Card Pages now always shows App Studio Apps, Dashboards, Report Builder Pages, and Worksheets, marking any with no cards as (0) instead of hiding the category.

### Transfer Ownership

- Transferring ownership of a dataflow now shares its input datasets with the new owner if they don't already have access. ([#92](https://github.com/brycewc/domo-toolkit/issues/92))
- Transfer Ownership can now email the Excel summary to yourself, the new owner, or both.

### Activity Log

- Every object in a list now has an activity log button that opens its log directly, or a menu to view the object's log or everything nested under it when it has nested items.
- Lists now offer a View Activity Log for all action in the header, covering every object in the list.

### Inspect Dataflow

- Added Inspect Dataflow: open a searchable, exploded view of every transform in a dataflow without opening each one in turn. ([#87](https://github.com/brycewc/domo-toolkit/issues/87))
- SQL dataflow transforms now show their SQL formatted and color-coded like Domo's editor, with each step labeled by its output table.

### Supported Types

- Approval templates are now recognized on the create-request page, not just when editing the template.
- The toolkit now recognizes the account you have open when its edit or sharing dialog is showing.
- A detected account now has a DataSets tab listing the datasets it feeds.
- Get DataSets now works on Jupyter Workspaces, listing their input and output datasets in separate groups.
- Scheduled reports can now be deleted from the toolkit.
- A detected scheduled report now links to its view and to the page, card, or app it reports on.
- Certifications are now recognized, linking to the object they certify and their certification process.

## UI Improvements

- Duplicate User's shared-content picker is now a single combined list that scrolls smoothly, instead of separate per-category lists that scrolled awkwardly.
- In selectable lists, clicking a category's name now expands or collapses it, not just the chevron or the empty space beside it.
- Result lists grouped into categories now open the one category with results on launch when it's the only category that has any, instead of leaving everything collapsed.
- The Activity Log's loading placeholder now reserves space for the source banner, so the layout no longer jumps when it finishes loading.
- Nested group headers in result lists are now slightly lighter than top-level headers, making the grouping hierarchy easier to read at a glance.
- The View Errors button now always shows at the top of the expanded actions, disabled with a 0 count when there are no errors, instead of appearing only when errors exist.
- Removed the Copy ID button from result list headers, since the same ID can be copied from the object's own action button.
- The delete confirmation view now presents the objects it affects as one list with "Will be deleted" and "Other dependencies" as expandable groups that start open.
- Object names in result lists now show a normal arrow cursor when the row can't be expanded, while expandable rows keep the pointer cursor to signal the name is clickable.
- Hovering an object in a result list now shows its type before the ID (for example "Page ID: 123" instead of just "ID: 123").
- An object's Share and Share All buttons in a result list are now a single share button with a dropdown to share just that object or it and everything nested under it.
- Errors on a result list group now appear in full inside a dismissable alert with a copy button, instead of being cut off after the first line.
- Dataflow nodes in the lineage view now show the dataflow's type (Magic ETL, MySQL, Redshift, etc.) next to the ID.
- Datasets in the DataSets Used in View list now have a View Lineage button, matching the dataset lists elsewhere.
- Objects Owned now offers Share All with yourself on the App Studio Apps, Custom Apps, and Worksheets groups, not just Pages.
- The Update Owner and Transfer Ownership dialogs now open centered on screen instead of near the top.
- The Update Details view now puts the object's name in its title ("Update Details for <object>") instead of a generic per-type heading, with just the ID below it.
- The refresh button's icon now spins counter-clockwise while refreshing, matching the direction of Domo's own sync icon.
- Checkboxes shown on cards and panels now use a flatter style that sits better on those surfaces.
- The warnings shown when updating code engine versions now use the app's standard alert styling.
- The opt-in toggles shown when updating code engine versions are now switches instead of checkboxes.
- The per-action overrides and change-review sections under a code engine package now open one at a time instead of several being expanded at once.
- The sections for reviewing a code engine action's changes now appear directly under the package that triggered them, instead of grouped together at the bottom of the list.
- The per-action version overrides for a code engine package now match the styling of the review sections.
- When updating code engine versions, the version dropdown for a built-in package already on its latest version is now disabled.
- The Built-in tag on a code engine package now has an info tooltip explaining that built-in packages can only be upgraded, not downgraded to an earlier version.
- The warning shown when a code engine version change alters a variable's data type now states the variable's current type, not just the new one.
- When updating code engine versions, the option to update a variable's type to match a function's new version now starts turned on.
- The Update Code Engine Versions title now includes the workflow's name.
- The warnings and errors shown by Generate Definition from JSDoc now use the app's standard alert styling.
- Copying a workflow version now copies its parent workflow's ID by default, with the version number moved to the copy button's dropdown.
- Alerts throughout the extension now use tighter padding, matching the compact spacing of the rest of the UI.

### Get Card Pages

- Renamed the "Worksheet Views" group to "Worksheets" in Get Card Pages.
- Get Card Pages now nests each report builder page under its report, matching how app studio pages nest under their app.
- Get Card Pages on a single card no longer repeats that card under every page where it appears.
- Get Card Pages no longer includes the button to remove a card from a page.

### App & Worksheet Views

- App Pages and Worksheet Views now show just the page's own name in the context footer, keeping the parent app or worksheet name in the browser tab title only.
- The browser tab title for App Pages and Worksheet Views now separates the app and page names with ">" instead of ":".

### Settings Dropdowns

- The theme dropdown in settings now shows an icon next to each option.
- The favicon effect dropdown now shows an icon next to each option.

### Side Panel

- Side panel view headers now lead with an icon for the action, and views about a specific object show that object's type icon inline next to its name.
- More side panel views now have reload and refresh buttons in their header, matching the content lists.

### Migrate Content

- Migrating downstream content now shows its live progress on the Migrate button, instead of in a message that could sit off-screen below the column-mapping options.
- The Migrate Content view now has a reload button to restart it for whichever dataset you've since navigated to, matching the reload control on the other content lists.
- In the cross-input collision warning, the linked dataflow name now matches the warning's text color instead of appearing in the default dark color, and still turns the accent color on hover.
- The input datasets named in the cross-input collision warning are now clickable links to those datasets, matching the dataflow link in the same warning.

## Bug Fixes

- Side panel actions no longer intermittently fail to open when many tabs are open or after viewing very large objects, such as datasets with thousands of Beast Modes or pages with many cards.
- When an action fails while reading data from the Domo page, it now reports the actual reason instead of a misleading "Cannot read properties of null" message.
- Approvals and Approval Templates no longer appear as failing rows in Objects Owned and Transfer Ownership on instances that don't have Approvals enabled.
- The Activity Log no longer briefly flashes scroll bars across the page while it loads.
- Deleting a page and all its cards no longer fails with a "Timeout while checking for page items" error.
- Get Child Pages now lists grandchild pages again for pages with more than 10 child pages, which previously returned no grandchildren at all.
- Expanding upstream or downstream in the lineage view now brings the newly revealed nodes into view instead of jumping the view back to the root.
- The API Errors view now shows each failed request's real method (DELETE, PUT, POST) instead of mislabeling some as GET.
- Searching for a dataset by name now matches against the dataset name only, instead of returning hundreds of unrelated datasets.
- Copy Filters no longer pins a page-wide filter to a single dataset, so a copied link keeps applying the filter across every dataset on the page.
- Update Code Engine Versions now reports a change to an object's fields (or the fields of the objects in an array) as a properties change you can sync to the bound variable, instead of mislabeling it as a data type change.
- Update Code Engine Versions can now save a version bump for a function whose input or output is an object (or list of objects), which previously failed to apply.
- Update Code Engine Versions no longer keeps prompting you to sync a variable that already matches the new version.

### Migrate Content

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating a dataset view that appends (unions) inputs and has a calculated column built from those inputs now produces a working view, instead of one that errored when opened or queried.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Migrating downstream content now flags any dataflow that uses the dataset's columns inside a Python or R script tile for manual review, instead of migrating it with the script left pointing at the old column names.
- Nested Beast Modes now migrate correctly: the Beast Modes they rely on come along in the right order, and the nested references are repointed to the migrated copies on the target instead of breaking.
- Datasets with more than one saved Beast Mode now migrate their Beast Modes (and the cards that use them) correctly, instead of failing the whole batch.
- Beast Modes that live on a card (rather than being saved to the dataset) are no longer listed as separate items to migrate; they now travel with their card.
- When a migrating card has a Beast Mode whose name already exists as a Beast Mode on the target dataset, you can now choose to use the target's Beast Mode or rename the card's, instead of the migration failing.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.
- The progress count shown while migrating downstream content now counts only the content types you're actually moving, instead of including ones with nothing selected.

### Other Fixes

- Refreshing a Domo page now retries fetching the object's name and details when an earlier attempt came up empty, instead of staying blank until you navigate away.
- The browser tab title now updates to the current page when you move between pages of an App Studio app, instead of staying stuck on the page you first opened.
- Opening a specific Code Engine package, workflow, or workspace now shows the object's name in the browser tab, instead of leaving it on a generic section title like "Code Engine Packages".
