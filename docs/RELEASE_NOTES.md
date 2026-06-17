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
- Admins can now switch a dataset to any compatible account in the instance, without first sharing that account with themselves.

### Supported Types

- The toolkit now recognizes the account you have open when its edit or sharing dialog is showing.
- A detected account now has a DataSets tab listing the datasets it feeds.
- Get DataSets now works on Jupyter Workspaces, listing their input and output datasets in separate groups.

## UI Improvements

- Renamed the "Worksheet Views" group to "Worksheets" in Get Card Pages.
- App Pages and Worksheet Views now show just the page's own name in the context footer, keeping the parent app or worksheet name in the browser tab title only.
- The browser tab title for App Pages and Worksheet Views now separates the app and page names with ">" instead of ":".
- The Activity Log's loading placeholder now reserves space for the source banner, so the layout no longer jumps when it finishes loading.

## Bug Fixes

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Side panel actions no longer intermittently fail to open when many tabs are open or after viewing very large objects, such as datasets with thousands of Beast Modes or pages with many cards.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Approvals and Approval Templates no longer appear as failing rows in Objects Owned and Transfer Ownership on instances that don't have Approvals enabled.
- The Activity Log no longer briefly flashes scroll bars across the page while it loads.
- Nested dataset Beast Modes now migrate in the right order so they, and the cards that use them, transfer cleanly.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.

### Other Fixes

- Refreshing a Domo page now retries fetching the object's name and details when an earlier attempt came up empty, instead of staying blank until you navigate away.
