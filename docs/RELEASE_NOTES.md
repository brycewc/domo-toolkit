# Domo Toolkit v1.5.1 Release Notes

## New Features and Improvements

- Added a setting to strip the " - Domo" suffix from Domo tab titles.
- Added Remap Columns for datasets: repair every downstream card, Beast Mode, dataflow, dataset view, and pro-code app card that references a renamed or removed column.
- Update Person Details now lets admins change a user's username, with an option to keep the email in sync.
- Approval Center datasets now show a Template tab linking to the approval template that created them.
- Side panel views are now scoped to each Domo instance.
- Get DataSets now always shows both Input DataSets and Output DataSets for dataflows, marking an empty side as (0).
- Get DataSets for a page, App Studio page, or worksheet page now nests the cards on that page under the datasets they come from. ([#89](https://github.com/brycewc/domo-toolkit/issues/89))
- Get DataSets now works on connector accounts, listing the datasets an account feeds.
- Get Cards now always shows Cards, Forms, and Queues for App Studio pages, marking an empty category as (0).
- The lineage view can now export its full upstream and downstream lineage as a CSV, Excel, or JSON file. ([#83](https://github.com/brycewc/domo-toolkit/issues/83))
- The popup, side panel, and object details now show when the current object was created.
- An approval request now has a Transfer Approval button to reassign that single pending request to another user.
- Added Manage Tags for dataflows: add or remove tags on a dataflow and its output datasets together in one step.
- A dataflow's Inputs and Outputs JSON tabs now show each dataset's full details and links.
- Inspect DataFlow now shows the tiles for the specific version you're viewing when you open a dataflow at an older version.
- Admins can now switch a dataset to any compatible account in the instance without first sharing that account with themselves.
- Added Get Beast Modes: list the Beast Modes tied to a dataset, dataflow, card, page, app, or worksheet, showing where each one is used. ([#7](https://github.com/brycewc/domo-toolkit/issues/7))
- The welcome screen now has a quick theme switcher for System, Light, or Dark.
- The delete confirmation view now lets you share an affected object, or all affected objects, with yourself.
- Cards now have a Definition tab showing the card's full underlying definition. ([#81](https://github.com/brycewc/domo-toolkit/issues/81))
- Alerts now have an Actions tab listing the actions an alert triggers, with a link to the workflow, scheduled report, or task behind each one.
- Generate Definition from JSDoc now picks up a function's nested output schema.
- Added Update Trigger Versions, which repoints all of a workflow's alert triggers to a chosen version in one step, with the option to exclude individual triggers.
- Added Get Workspaces, which lists the workspaces a card, dataset, dataflow, dashboard, app, worksheet, or workflow has been added to.
- Update Details now lets you rename an AppDB collection.

### Copy Filters

- Copy Filters now copies the filtered URL as a clickable formatted link titled with the page name.
- Copy Filters now offers an option to apply the active filters to the current tab and reload it.

### Migrate Content

- Migrate Content now moves a dataset's alerts to the target dataset, prompting you to map any PDP policy that has no match there.
- When migrating downstream content, navigating to another dataset now offers it as the migration target in one click.
- Migrate Content now repoints pro-code app cards to the target dataset along with the rest of a dataset's downstream content.

### Jupyter Workspaces

- Jupyter Workspaces are now detected when their settings dialog is open, so a workspace no longer needs to be running to act on it.
- Jupyter Workspaces now show their input datasets, output datasets, and accounts as tabs, with details and links for each.

### Duplicate User

- Duplicate User can now add a source user's groups and individually-shared content to an existing user, not just create a new one. ([#91](https://github.com/brycewc/domo-toolkit/issues/91))
- Duplicate User now lets you choose which of the source user's group memberships to copy.

### Get Card Pages

- Get Card Pages now lists cards that aren't on any page under an Orphaned Cards group.
- Get Card Pages now always shows App Studio Apps, Dashboards, Report Builder Pages, and Worksheets, marking any with no cards as (0).

### Transfer Ownership

- Transferring ownership of a dataflow now shares its input datasets with the new owner. ([#92](https://github.com/brycewc/domo-toolkit/issues/92))
- Transfer Ownership can now email the Excel summary to yourself, the new owner, or both.

### Activity Log

- Every object in a list now has an activity log button that opens its log directly, or a menu to view the object's log or everything nested under it.
- Lists now offer a View Activity Log for all action in the header.

### Inspect Dataflow

- Added Inspect Dataflow: open a searchable, exploded view of every transform in a dataflow. ([#87](https://github.com/brycewc/domo-toolkit/issues/87))
- SQL dataflow transforms now show their SQL formatted and color-coded, with each step labeled by its output table.

### Supported Types

- Approval templates are now recognized on the create-request page.
- The toolkit now recognizes the account you have open when its edit or sharing dialog is showing.
- A detected account now has a DataSets tab listing the datasets it feeds.
- Get DataSets now works on Jupyter Workspaces.
- Scheduled reports can now be deleted from the toolkit.
- A detected scheduled report now links to its view and to the page, card, or app it reports on.
- Certifications are now recognized, linking to the object they certify and their certification process.

## UI Improvements

- Duplicate User's shared-content picker is now a single combined list that scrolls smoothly.
- In selectable lists, clicking a category's name now expands or collapses it.
- Result lists grouped into categories now open the one category with results on launch when it's the only category that has any.
- The Activity Log's loading placeholder now reserves space for the source banner.
- Nested group headers in result lists are now slightly lighter than top-level headers.
- The View Errors button now always shows at the top of the expanded actions, disabled with a 0 count when there are no errors.
- Removed the Copy ID button from result list headers.
- The delete confirmation view now presents the objects it affects as one list with "Will be deleted" and "Other dependencies" as expandable groups that start open.
- Object names in result lists now show a normal arrow cursor when the row can't be expanded.
- Hovering an object in a result list now shows its type before the ID (for example "Page ID: 123").
- An object's Share and Share All buttons in a result list are now a single share button with a dropdown.
- Errors on a result list group now appear in full inside a dismissable alert with a copy button.
- Dataflow nodes in the lineage view now show the dataflow's type (Magic ETL, MySQL, Redshift, etc.) next to the ID.
- Datasets in the DataSets Used in View list now have a View Lineage button.
- Objects Owned now offers Share All with yourself on the App Studio Apps, Custom Apps, and Worksheets groups.
- The Update Owner and Transfer Ownership dialogs now open centered on screen.
- The Update Details view now puts the object's name in its title ("Update Details for <object>"), with the ID below it.
- The refresh button's icon now spins counter-clockwise while refreshing, matching Domo's own sync icon.
- Checkboxes shown on cards and panels now use a flatter style.
- The warnings shown when updating code engine versions now use the app's standard alert styling.
- The opt-in toggles shown when updating code engine versions are now switches instead of checkboxes.
- The per-action overrides and change-review sections under a code engine package now open one at a time.
- The sections for reviewing a code engine action's changes now appear directly under the package that triggered them.
- The per-action version overrides for a code engine package now match the styling of the review sections.
- When updating code engine versions, the version dropdown for a built-in package already on its latest version is now disabled.
- The Built-in tag on a code engine package now has an info tooltip explaining that built-in packages can only be upgraded.
- The warning shown when a code engine version change alters a variable's data type now states the variable's current type.
- When updating code engine versions, the option to update a variable's type to match a function's new version now starts turned on.
- The Update Code Engine Versions title now includes the workflow's name.
- The warnings and errors shown by Generate Definition from JSDoc now use the app's standard alert styling.
- Generate Definition from JSDoc now shows each function's JSDoc default-value edits under that function in the changes list, tagged with a JSDoc marker.
- Copying a workflow version now copies its parent workflow's ID by default, with the version number moved to the copy button's dropdown.
- Alerts throughout the extension now use tighter padding.
- Per-instance settings now have their own tab on the options page instead of sitting at the bottom of the Settings tab.

### Get Card Pages

- Renamed the "Worksheet Views" group to "Worksheets" in Get Card Pages.
- Get Card Pages now nests each report builder page under its report.
- Get Card Pages on a single card no longer repeats that card under every page where it appears.
- Get Card Pages no longer includes the button to remove a card from a page.

### App & Worksheet Views

- App Pages and Worksheet Views now show just the page's own name in the context footer.
- The browser tab title for App Pages and Worksheet Views now separates the app and page names with ">" instead of ":".

### Settings Dropdowns

- The theme dropdown in settings now shows an icon next to each option.
- The favicon effect dropdown now shows an icon next to each option.

### Favicon Rules

- The delete button on the last remaining favicon rule now stays visible but disabled with an explanatory tooltip, instead of disappearing.
- The Add Rule button now floats to the right of the toolbar instead of sitting next to the Save button.

### Settings

- The Save Settings button now sits at the top of the Settings tab instead of below the list of settings.
- Added a Restore Defaults button to the Settings tab that resets every setting to its default value.

### Options Page

- The options page now asks you to confirm before leaving with unsaved favicon or settings changes.

### Side Panel

- Side panel view headers now lead with an icon for the action, and views about a specific object show that object's type icon inline next to its name.
- More side panel views now have reload and refresh buttons in their header.

### Migrate Content

- Migrating downstream content now shows its live progress on the Migrate button.
- The Migrate Content view now has a reload button to restart it for whichever dataset you've since navigated to.
- In the cross-input collision warning, the linked dataflow name now matches the warning's text color, and still turns the accent color on hover.
- The input datasets named in the cross-input collision warning are now clickable links to those datasets.

## Bug Fixes

- Side panel actions no longer intermittently fail to open when many tabs are open or after viewing very large objects.
- When an action fails while reading data from the Domo page, it now reports the actual reason instead of a misleading "Cannot read properties of null" message.
- Approvals and Approval Templates no longer appear as failing rows in Objects Owned and Transfer Ownership on instances that don't have Approvals enabled.
- The Activity Log no longer briefly flashes scroll bars across the page while it loads.
- Deleting a page and all its cards no longer fails with a "Timeout while checking for page items" error.
- Get Child Pages now lists grandchild pages again for pages with more than 10 child pages.
- Expanding upstream or downstream in the lineage view now brings the newly revealed nodes into view.
- The API Errors view now shows each failed request's real method (DELETE, PUT, POST).
- Searching for a dataset by name now matches against the dataset name only.
- Copy Filters no longer pins a page-wide filter to a single dataset.
- Update Code Engine Versions now reports a change to an object's fields as a properties change you can sync to the bound variable.
- Update Code Engine Versions can now save a version bump for a function whose input or output is an object (or list of objects).
- Update Code Engine Versions no longer keeps prompting you to sync a variable that already matches the new version.

### Migrate Content

- Migrating downstream content now records a clearer note on each updated dataflow version.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns.
- Migrating a dataset view that appends (unions) inputs and has a calculated column built from those inputs now produces a working view.
- Migrating downstream content now remaps column references inside fused views (DataFusions), and flags any fused view that uses the dataset in a calculated column for manual review.
- Migrating downstream content now flags any dataflow that uses the dataset's columns inside a Python or R script tile for manual review.
- Nested Beast Modes now migrate correctly, with their dependencies in the right order and references repointed to the migrated copies.
- Datasets with more than one saved Beast Mode now migrate their Beast Modes (and the cards that use them) correctly.
- Beast Modes that live on a card are no longer listed as separate items to migrate; they now travel with their card.
- When a migrating card has a Beast Mode whose name already exists on the target dataset, you can now choose to use the target's Beast Mode or rename the card's.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.
- The progress count shown while migrating downstream content now counts only the content types you're actually moving.

### Other Fixes

- The popup now vertically centers its current-context description text, matching the side panel.
- Refreshing a Domo page now retries fetching the object's name and details when an earlier attempt came up empty.
- The browser tab title now updates to the current page when you move between pages of an App Studio app.
- Opening a specific Code Engine package, workflow, or workspace now shows the object's name in the browser tab.
