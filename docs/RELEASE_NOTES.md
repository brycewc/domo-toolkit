# Domo Toolkit v1.6.0 Release Notes (WIP)

## New Features and Improvements

- The Update Code Engine Versions feature is now called Update Action Versions and can also bump the versions of subflow actions in a workflow, not just Code Engine actions.
- Delete Unused Beast Modes: a dataset or a user now has a button that finds every Beast Mode and Variable with no active usage and lets you review, adjust, and bulk-delete the selection in one pass.
- Remap Columns can now repair a view that a source dataset broke by renaming or removing a column it reads, either by pointing the view at a valid column or dropping that column from the view.
- Deleting a dataflow now also lists the alerts on its output datasets that will be deleted with it.
- Deleting a dataflow is now blocked, with the offending views listed, when its output datasets feed downstream dataset views, instead of failing partway through.
- Viewing a workflow now includes a Triggers tab listing every trigger attached to it.
- Selecting a user task in a workflow now identifies its Task Center Queue in Current Context.
- Locking cards now opens a list where you can review each card's current lock status and unselect any before applying the change.
- That same list now lets you unlock cards, not just lock them, via a Lock/Unlock toggle.

## UI Improvements

- Viewing a Code Engine action inside a workflow now lets you copy the workflow's ID and version from the Copy button's hold-for-more-options menu.
- Hover tooltips throughout the extension now appear promptly instead of after a long pause.
- The dropdown for picking a column or Beast Mode when mapping columns is now wider, so long names are easier to read.
- Remap Columns now lists the replacement columns alphabetically, matching Migrate Content.
- The API Errors list now sorts newest first by default, with a header button to reverse the order.
- Hovering a failed request in API Errors now shows its full URL, including the domain.

## Performance

- The column picker when mapping columns now opens and filters instantly on datasets with hundreds of columns, instead of stalling.

## Bug Fixes

- The action buttons no longer briefly collapse and reopen when an action finds nothing to show and reports it with a message instead of opening a results panel.
- Sharing a page now makes it appear in your navigation instead of only granting access by direct link.
- Get Card Pages now tells you when none of an object's cards appear on any page, instead of listing them under a lone Orphaned Cards category.
- Get View Inputs now lists the source datasets of union views (and other views that nest their inputs) instead of finding none.
- Sharing objects with yourself from a list now closes the row's actions menu and shows a progress toast immediately, instead of appearing to do nothing until every share finished.
- Migrate Content: mapping a column onto one of the target dataset's Beast Modes now saves the affected cards successfully instead of erroring out.
- API Errors now captures failed requests from apps embedded on a page, which were previously missed.
- Viewing a Code Engine action inside a workflow again shows its parent Workflow and Workflow Version as tabs in Current Context.
