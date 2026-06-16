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
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Nested dataset Beast Modes now migrate in the right order so they, and the cards that use them, transfer cleanly.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.

### Other Fixes
