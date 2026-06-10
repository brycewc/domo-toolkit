---
## title: Release Notes
---

# Domo Toolkit v1.5.0 Release Notes (WIP)

## New Features and Improvements

- Copy Filters now copies the filtered URL as a clickable formatted link titled with the page name, instead of as plain text.
- Added a setting to strip the " - Domo" suffix from Domo tab titles.
- When migrating downstream content, navigating to another dataset now offers it as the migration target in one click, instead of having to copy and paste its ID.

### Supported Types

## UI Improvements

## Bug Fixes

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Side panel actions no longer intermittently fail to open when many tabs are open or a dataset has very large Beast Mode definitions.

### Other Fixes
