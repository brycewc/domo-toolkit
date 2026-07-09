# Domo Toolkit v1.6.0 Release Notes (WIP)

## New Features and Improvements

- The Update Code Engine Versions feature is now called Update Action Versions and can also bump the versions of subflow actions in a workflow, not just Code Engine actions.
- Update Action Versions now blocks editing a workflow version another user has locked, and clears your own or a stale (over 24 hours old) lock automatically so you can proceed.
- Delete Unused Beast Modes: a dataset or a user now has a button that finds every Beast Mode and Variable with no active usage and lets you review, adjust, and bulk-delete the selection in one pass.
- Remap Columns can now repair a view that a source dataset broke by renaming or removing a column it reads, either by pointing the view at a valid column or dropping that column from the view.
- Deleting a dataflow now also lists the alerts on its output datasets that will be deleted with it.
- Deleting a dataflow is now blocked, with the offending views listed, when its output datasets feed downstream dataset views, instead of failing partway through.
- Viewing a workflow now includes a Triggers tab listing every trigger attached to it.
- Selecting a user task in a workflow now identifies its Task Center Queue in Current Context.
- Locking cards now opens a list where you can review each card's current lock status and unselect any before applying the change.
- That same list now lets you unlock cards, not just lock them, via a Lock/Unlock toggle.
- Cancelling a stuck dataset update now cancels every running update on the stream at once, not just the most recent, clearing wedged states where several are stuck running.
- The Switch Account feature is now called Swap Account.
- Swapping a dataset's account now offers a Save and Run button that applies the change and immediately runs the dataset, alongside the existing Save.

## UI Improvements

- Viewing a Code Engine action inside a workflow now lets you copy the workflow's ID and version from the Copy button's hold-for-more-options menu.
- Hover tooltips throughout the extension now appear promptly instead of after a long pause.
- The dropdown for picking a column or Beast Mode when mapping columns is now wider, so long names are easier to read.
- Remap Columns now lists the replacement columns alphabetically, matching Migrate Content.
- The API Errors list now sorts newest first by default, with a header button to reverse the order.
- Hovering a failed request in API Errors now shows its full URL, including the domain.
- The Choose Account list when swapping a dataset's account now shows a count of matching accounts above the results.
- The in/not-in toggle in the owner filter now lines up with the search box beneath it instead of stretching to the panel edges.
- Swapping the account on a single-account dataset now lets you Save or Save and Run straight from the chosen account's detail screen, skipping the extra confirmation list.
- Side panel view headers now place the action icon next to the title and the Beta chip next to the subtitle, so each line starts flush left when its adornment is absent.
- The Select all checkbox in multi-select lists now sits directly above the list instead of up in the header.
- Migrate Content now has a Select all checkbox for selecting or clearing all downstream content at once.
- The expandable sections in Update Action Versions and Inspect DataFlow now have fully rounded corners.
- The transform detail values in Inspect DataFlow now appear in input-style boxes.
- Get Card Pages now labels the page count on each app studio app, report, and worksheet (e.g. "3 pages") instead of showing a bare number.

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
- When a grouped result list auto-opens its only populated category, it now also expands the single item inside that category instead of leaving it collapsed.
- When swapping a dataset's account, each account's owner now shows their full name instead of just their last name.
- A count of a single card or page now reads "1 card" or "1 page" instead of "1 cards" or "1 pages".
