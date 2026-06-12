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

### Supported Types

## UI Improvements

## Bug Fixes

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Side panel actions no longer intermittently fail to open when many tabs are open or after viewing very large objects, such as datasets with thousands of Beast Modes or pages with many cards.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Approvals and Approval Templates no longer appear as failing rows in Objects Owned and Transfer Ownership on instances that don't have Approvals enabled.

### Other Fixes
