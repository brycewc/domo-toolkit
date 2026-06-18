---
## title: Release Notes
---

# Domo Toolkit v1.5.0 Release Notes (WIP)

## New Features and Improvements

- Copy Filters now copies the filtered URL as a clickable formatted link titled with the page name, instead of as plain text.
- Added a setting to strip the " - Domo" suffix from Domo tab titles.
- When migrating downstream content, navigating to another dataset now offers it as the migration target in one click, instead of having to copy and paste its ID.
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
- Added Manage Tags for dataflows: add or remove tags on a dataflow and its output datasets together in one step.
- A dataflow's Inputs and Outputs JSON tabs now show each dataset's full details and links instead of just its name and ID.
- Admins can now switch a dataset to any compatible account in the instance, without first sharing that account with themselves.
- Added Get Beast Modes: list the Beast Modes tied to a dataset, dataflow, card, page, app, or worksheet, showing the cards, drills, and other Beast Modes each one is used on.
- The welcome screen now has a quick theme switcher to set System, Light, or Dark without opening settings.
- Every object in a list now has a View Activity Log action that opens its activity log.
- Lists now offer a View Activity Log for all action, in the header and on any expandable item, covering that item and everything nested under it.

### Supported Types

- The toolkit now recognizes the account you have open when its edit or sharing dialog is showing.
- A detected account now has a DataSets tab listing the datasets it feeds.
- Get DataSets now works on Jupyter Workspaces, listing their input and output datasets in separate groups.

## UI Improvements

- Renamed the "Worksheet Views" group to "Worksheets" in Get Card Pages.
- App Pages and Worksheet Views now show just the page's own name in the context footer, keeping the parent app or worksheet name in the browser tab title only.
- The browser tab title for App Pages and Worksheet Views now separates the app and page names with ">" instead of ":".
- The Activity Log's loading placeholder now reserves space for the source banner, so the layout no longer jumps when it finishes loading.
- Nested group headers in result lists are now slightly lighter than top-level headers, making the grouping hierarchy easier to read at a glance.
- The theme dropdown in settings now shows an icon next to each option.
- The favicon effect dropdown now shows an icon next to each option.
- The View Errors button now always shows at the top of the expanded actions, disabled with a 0 count when there are no errors, instead of appearing only when errors exist.
- Removed the Copy ID button from result list headers, since the same ID can be copied from the object's own action button.
- The delete confirmation view now presents the objects it affects as one list with "Will be deleted" and "Other dependencies" as expandable groups that start open.

- Migrating downstream content now shows its live progress on the Migrate button, instead of in a message that could sit off-screen below the column-mapping options.
- The Migrate Content view now has a reload button to restart it for whichever dataset you've since navigated to, matching the reload control on the other content lists.
- In the cross-input collision warning, the linked dataflow name now matches the warning's text color instead of appearing in the default dark color, and still turns the accent color on hover.
- The input datasets named in the cross-input collision warning are now clickable links to those datasets, matching the dataflow link in the same warning.

## Bug Fixes

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Side panel actions no longer intermittently fail to open when many tabs are open or after viewing very large objects, such as datasets with thousands of Beast Modes or pages with many cards.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Approvals and Approval Templates no longer appear as failing rows in Objects Owned and Transfer Ownership on instances that don't have Approvals enabled.
- The Activity Log no longer briefly flashes scroll bars across the page while it loads.
- Nested Beast Modes now migrate correctly: the Beast Modes they rely on come along in the right order, and the nested references are repointed to the migrated copies on the target instead of breaking.
- Beast Modes that live on a card (rather than being saved to the dataset) are no longer listed as separate items to migrate; they now travel with their card.
- When a migrating card has a Beast Mode whose name already exists as a Beast Mode on the target dataset, you can now choose to use the target's Beast Mode or rename the card's, instead of the migration failing.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.
- Deleting a page and all its cards no longer fails with a "Timeout while checking for page items" error.

### Other Fixes

- Refreshing a Domo page now retries fetching the object's name and details when an earlier attempt came up empty, instead of staying blank until you navigate away.
