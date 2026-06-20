---
## title: Release Notes
---

# Domo Toolkit v1.4.1 Release Notes (WIP)

## New Features and Improvements

- Copy Filters now copies the filtered URL as a clickable formatted link titled with the page name, instead of as plain text.
- Added a setting to strip the " - Domo" suffix from Domo tab titles.
- When migrating downstream content, navigating to another dataset now offers it as the migration target in one click, instead of having to copy and paste its ID.

### Supported Types

## UI Improvements

- Migrating downstream content now shows its live progress on the Migrate button, instead of in a message that could sit off-screen below the column-mapping options.
- The Migrate Content view now has a reload button to restart it for whichever dataset you've since navigated to, matching the reload control on the other content lists.
- In the cross-input collision warning, the linked dataflow name now matches the warning's text color instead of appearing in the default dark color, and still turns the accent color on hover.
- The input datasets named in the cross-input collision warning are now clickable links to those datasets, matching the dataflow link in the same warning.

## Bug Fixes

- Migrating downstream content now records a clearer note on each updated dataflow version, stating the input was remapped even when no column references needed renaming.
- Migrating downstream content no longer asks you to remap dataset-view columns the view doesn't actually use; only columns referenced in the view's query or output are flagged now.
- Side panel actions no longer intermittently fail to open when many tabs are open or a dataset has very large Beast Mode definitions.
- Migrating a dataset view's input now updates the view's available-columns list to the new dataset's columns instead of leaving the previous dataset's.
- Migrating a dataset view that appends (unions) inputs and has a calculated column built from those inputs now produces a working view, instead of one that errored when opened or queried.
- Migrating downstream content now remaps column references inside fused views (DataFusions) instead of leaving them pointing at the old dataset, and flags any fused view that uses the dataset in a calculated column for manual review.
- Migrating downstream content now flags any dataflow that uses the dataset's columns inside a Python or R script tile for manual review, instead of migrating it with the script left pointing at the old column names.
- Nested Beast Modes now migrate correctly: the Beast Modes they rely on come along in the right order, and the nested references are repointed to the migrated copies on the target instead of breaking.
- Datasets with more than one saved Beast Mode now migrate their Beast Modes (and the cards that use them) correctly, instead of failing the whole batch.
- Beast Modes that live on a card (rather than being saved to the dataset) are no longer listed as separate items to migrate; they now travel with their card.
- When a migrating card has a Beast Mode whose name already exists as a Beast Mode on the target dataset, you can now choose to use the target's Beast Mode or rename the card's, instead of the migration failing.
- Magic ETL sort columns now get renamed during migration along with the rest of the dataflow.

### Other Fixes

- Refreshing a Domo page now retries fetching the object's name and details when an earlier attempt came up empty, instead of staying blank until you navigate away.
