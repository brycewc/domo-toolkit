---
---

# Domo Toolkit v1.5.0 Release Notes (WIP)

## New Features and Improvements

- Copy Filters now copies the filtered URL as a clickable formatted link titled with the page name, instead of as plain text.
- Copy Filters now offers an option to apply the active filters to the current tab and reload it, useful for keeping the filter state after page refresh.
- Added a setting to strip the " - Domo" suffix from Domo tab titles.
- When migrating downstream content, navigating to another dataset now offers it as the migration target in one click, instead of having to copy and paste its ID.
- Migrate Content now repoints pro-code app cards to the target dataset along with the rest of a dataset's downstream content, instead of skipping them.
- Added Remap Columns for datasets: repair every downstream card, Beast Mode, dataflow, dataset view, and pro-code app card that references a renamed or removed column, with the old column names discovered automatically from the broken content.
- Jupyter Workspaces are now detected when their settings dialog is open, so a workspace no longer needs to be running to act on it.
- Jupyter Workspaces now show their input datasets, output datasets, and accounts as tabs, with details and links for each.
- Update Person Details lets admins change a user's username (the login and SSO identity), with an option to keep the email in sync.
- Approval Center datasets now show a Template tab linking to the approval template that created them.
- Side panel views are now scoped to each Domo instance, so switching instances swaps to that instance's own view (in-progress operations included) instead of carrying one view everywhere.
- Get Card Pages now lists cards that aren't on any page under an Orphaned Cards group, instead of leaving them out of the results.
- Get Card Pages now always shows App Studio Apps, Dashboards, Report Builder Pages, and Worksheets, marking any with no cards as (0) instead of hiding the category.
- Get DataSets now always shows both Input DataSets and Output DataSets for dataflows, marking an empty side as (0) instead of hiding it.
- Get Cards now always shows Cards, Forms, and Queues for App Studio pages, marking an empty category as (0) instead of hiding it.
- The lineage view can now export its full upstream and downstream lineage (with each object's level relative to the root) as a CSV, Excel, or JSON file.
- The popup, side panel, and object details now show when the current object was created.
- Transferring ownership of a dataflow now shares its input datasets with the new owner if they don't already have access.
- Transfer Ownership can now email the Excel summary to yourself, the new owner, or both.
- An approval request now has a Transfer Approval button to reassign that single pending request to another user.
- Added Manage Tags for dataflows: add or remove tags on a dataflow and its output datasets together in one step.
- A dataflow's Inputs and Outputs JSON tabs now show each dataset's full details and links instead of just its name and ID.
- Admins can now switch a dataset to any compatible account in the instance, without first sharing that account with themselves.
- Added Get Beast Modes: list the Beast Modes tied to a dataset, dataflow, card, page, app, or worksheet, showing the cards, drills, and other Beast Modes each one is used on.
- The welcome screen now has a quick theme switcher to set System, Light, or Dark without opening settings.
- Every object in a list now has an activity log button that opens its log directly, or a menu to view the object's log or everything nested under it when it has nested items.
- Lists now offer a View Activity Log for all action in the header, covering every object in the list.
- The delete confirmation view now lets you share an affected object, or all affected objects, with yourself.

### Supported Types

- Approval templates are now recognized on the create-request page, not just when editing the template.
- The toolkit now recognizes the account you have open when its edit or sharing dialog is showing.
- A detected account now has a DataSets tab listing the datasets it feeds.
- Get DataSets now works on Jupyter Workspaces, listing their input and output datasets in separate groups.

## UI Improvements

- Renamed the "Worksheet Views" group to "Worksheets" in Get Card Pages.
- Get Card Pages now nests each report builder page under its report, matching how app studio pages nest under their app.
- Get Card Pages on a single card no longer repeats that card under every page where it appears.
- App Pages and Worksheet Views now show just the page's own name in the context footer, keeping the parent app or worksheet name in the browser tab title only.
- The browser tab title for App Pages and Worksheet Views now separates the app and page names with ">" instead of ":".
- The Activity Log's loading placeholder now reserves space for the source banner, so the layout no longer jumps when it finishes loading.
- Nested group headers in result lists are now slightly lighter than top-level headers, making the grouping hierarchy easier to read at a glance.
- The theme dropdown in settings now shows an icon next to each option.
- The favicon effect dropdown now shows an icon next to each option.
- The View Errors button now always shows at the top of the expanded actions, disabled with a 0 count when there are no errors, instead of appearing only when errors exist.
- Removed the Copy ID button from result list headers, since the same ID can be copied from the object's own action button.
- The delete confirmation view now presents the objects it affects as one list with "Will be deleted" and "Other dependencies" as expandable groups that start open.
- Side panel view headers now lead with an icon for the action, and views about a specific object show that object's type icon inline next to its name.
- More side panel views now have reload and refresh buttons in their header, matching the content lists.
- Object names in result lists now show a normal arrow cursor when the row can't be expanded, while expandable rows keep the pointer cursor to signal the name is clickable.
- Hovering an object in a result list now shows its type before the ID (for example "Page ID: 123" instead of just "ID: 123").
- An object's Share and Share All buttons in a result list are now a single share button with a dropdown to share just that object or it and everything nested under it.
- Errors on a result list group now appear in full inside a dismissable alert with a copy button, instead of being cut off after the first line.
- Datasets in the DataSets Used in View list now have a View Lineage button, matching the dataset lists elsewhere.
- Objects Owned now offers Share All with yourself on the App Studio Apps, Custom Apps, and Worksheets groups, not just Pages.
- Get Card Pages no longer includes the button to remove a card from a page.

- Migrating downstream content now shows its live progress on the Migrate button, instead of in a message that could sit off-screen below the column-mapping options.
- The Migrate Content view now has a reload button to restart it for whichever dataset you've since navigated to, matching the reload control on the other content lists.
- In the cross-input collision warning, the linked dataflow name now matches the warning's text color instead of appearing in the default dark color, and still turns the accent color on hover.
- The input datasets named in the cross-input collision warning are now clickable links to those datasets, matching the dataflow link in the same warning.

## Bug Fixes

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Side panel actions no longer intermittently fail to open when many tabs are open or after viewing very large objects, such as datasets with thousands of Beast Modes or pages with many cards.
- When an action fails while reading data from the Domo page, it now reports the actual reason instead of a misleading "Cannot read properties of null" message.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating a dataset view that appends (unions) inputs and has a calculated column built from those inputs now produces a working view, instead of one that errored when opened or queried.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Migrating downstream content now flags any dataflow that uses the dataset's columns inside a Python or R script tile for manual review, instead of migrating it with the script left pointing at the old column names.
- Approvals and Approval Templates no longer appear as failing rows in Objects Owned and Transfer Ownership on instances that don't have Approvals enabled.
- The Activity Log no longer briefly flashes scroll bars across the page while it loads.
- Nested Beast Modes now migrate correctly: the Beast Modes they rely on come along in the right order, and the nested references are repointed to the migrated copies on the target instead of breaking.
- Datasets with more than one saved Beast Mode now migrate their Beast Modes (and the cards that use them) correctly, instead of failing the whole batch.
- Beast Modes that live on a card (rather than being saved to the dataset) are no longer listed as separate items to migrate; they now travel with their card.
- When a migrating card has a Beast Mode whose name already exists as a Beast Mode on the target dataset, you can now choose to use the target's Beast Mode or rename the card's, instead of the migration failing.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.
- Deleting a page and all its cards no longer fails with a "Timeout while checking for page items" error.
- Get Child Pages now lists grandchild pages again for pages with more than 10 child pages, which previously returned no grandchildren at all.
- Expanding upstream or downstream in the lineage view now brings the newly revealed nodes into view instead of jumping the view back to the root.
- The API Errors view now shows each failed request's real method (DELETE, PUT, POST) instead of mislabeling some as GET.
- Searching for a dataset by name now matches against the dataset name only, instead of returning hundreds of unrelated datasets.
- Copy Filters no longer pins a page-wide filter to a single dataset, so a copied link keeps applying the filter across every dataset on the page.

### Other Fixes

- Refreshing a Domo page now retries fetching the object's name and details when an earlier attempt came up empty, instead of staying blank until you navigate away.
