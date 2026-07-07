# Domo Toolkit v1.6.0 Release Notes (WIP)

## New Features and Improvements

- Delete Unused Beast Modes: a dataset or a user now has a button that finds every Beast Mode and Variable with no active usage and lets you review, adjust, and bulk-delete the selection in one pass.
- Remap Columns can now repair a view that a source dataset broke by renaming or removing a column it reads, either by pointing the view at a valid column or dropping that column from the view.
- Deleting a dataflow now also lists the alerts on its output datasets that will be deleted with it.
- Deleting a dataflow is now blocked, with the offending views listed, when its output datasets feed downstream dataset views, instead of failing partway through.

## UI Improvements

- Viewing a Code Engine action inside a workflow now lets you copy the workflow's ID and version from the Copy button's hold-for-more-options menu.
- Hover tooltips throughout the extension now appear promptly instead of after a long pause.
- The dropdown for picking a column or Beast Mode when mapping columns is now wider, so long names are easier to read.
- Remap Columns now lists the replacement columns alphabetically, matching Migrate Content.

## Performance

- The column picker when mapping columns now opens and filters instantly on datasets with hundreds of columns, instead of stalling.

## Bug Fixes

- Sharing a page now makes it appear in your navigation instead of only granting access by direct link.
- Get Card Pages now tells you when none of an object's cards appear on any page, instead of listing them under a lone Orphaned Cards category.
- Get View Inputs now lists the source datasets of union views (and other views that nest their inputs) instead of finding none.
- Sharing objects with yourself from a list now closes the row's actions menu and shows a progress toast immediately, instead of appearing to do nothing until every share finished.
- Migrate Content: mapping a column onto one of the target dataset's Beast Modes now saves the affected cards successfully instead of erroring out.
