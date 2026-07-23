# Domo Toolkit v1.6.0 Release Notes (WIP)

## New Features and Improvements

- The Update Code Engine Versions feature is now called Update Action Versions and can also bump the versions of subflow actions in a workflow, not just Code Engine actions.
- Update Action Versions now blocks editing a workflow version another user has locked, and clears your own or a stale (over 24 hours old) lock automatically.
- Delete Unused Beast Modes: a dataset or a user now has a button that finds every Beast Mode and Variable with no active usage and lets you review, adjust, and bulk-delete the selection in one pass.
- Remap Columns can now repair a view that a source dataset broke by renaming or removing a column it reads, either by pointing the view at a valid column or dropping that column from the view.
- Remap Columns now has an Auto Map button that fills in each broken column's closest-matching replacement in one click.
- Migrate Content's Auto Map now matches columns that share the same words, not only names that are identical apart from case and separators.
- Deleting a dataflow now also lists the alerts on its output datasets that will be deleted with it.
- Deleting a dataflow is now blocked, with the offending views listed, when its output datasets feed downstream dataset views, instead of failing partway through.
- Deleting a page, app studio page, or worksheet page now offers a "Delete Page and Cards that Only Live Here" action that removes the page and only the cards that live on no other page.
- Deleting an AppDB collection now offers a "Delete Datastore and All Collections" action that removes the entire datastore and every collection in it.
- Viewing a workflow now includes a Triggers tab listing every trigger attached to it.
- Selecting a user task in a workflow now identifies its Task Center Queue in Current Context.
- Locking cards now opens a list where you can review each card's current lock status and unselect any before applying the change.
- That same list now lets you unlock cards, not just lock them, via a Lock/Unlock toggle.
- Manage Card Owners now shows every owner across all cards on a page, dataset, or app and lets you add or remove users and groups on many cards at once.
- Cancelling a stuck dataset update now cancels every running update on the stream at once, not just the most recent.
- The Switch Account feature is now called Swap Account.
- Swapping a dataset's account now offers a Save and Run button that applies the change and immediately runs the dataset, alongside the existing Save.
- Opening an App Studio page by its page link now redirects you into its app automatically, instead of landing on Domo's "This content must be viewed within its app" page.
- Get Card Pages now works on a person, listing every page their cards appear on.
- A person's profile page now has a View in Admin buttonn to quickly navigate between the two.
- Get Owned Objects now works on a group, listing everything the group owns.
- Transfer Ownership now works on a group, moving the group's objects to another group.
- The Stream tab for a connector-backed dataset now shows the latest published connector version next to the version it currently runs.
- Text cards can now be exported as Markdown or HTML.

## Newly Supported Object Types

- Pro-code custom apps are now recognized as their own type instead of being treated as bricks.

## UI Improvements

- Viewing a Code Engine action inside a workflow now lets you copy the workflow's ID and version from the Copy button's hold-for-more-options menu.
- Viewing a workflow execution now lets you copy the workflow's ID from the Copy button's hold-for-more-options menu.
- Hover tooltips throughout the extension now appear promptly instead of after a long pause.
- The dropdown for picking a column or Beast Mode when mapping columns is now wider, so long names are easier to read.
- Remap Columns now lists the replacement columns alphabetically, matching Migrate Content.
- The Remap Columns header now uses the same tighter spacing as other views, and both of its screens match.
- The API Errors list now sorts newest first by default, with a header button to reverse the order.
- Hovering a failed request in API Errors now shows its full URL, including the domain.
- The Choose Account list when swapping a dataset's account now shows a count of matching accounts above the results.
- The in/not-in toggle in the owner filter now lines up with the search box beneath it instead of stretching to the panel edges.
- Swapping the account on a single-account dataset now lets you Save or Save and Run straight from the chosen account's detail screen, skipping the extra confirmation list.
- Side panel view headers now place the action icon next to the title and the Beta chip next to the subtitle, so each line starts flush left when its adornment is absent.
- The Select all checkbox in multi-select lists now sits directly above the list instead of up in the header.
- Migrate Content now has a Select all checkbox for selecting or clearing all downstream content at once.
- The expandable sections in Update Action Versions and Inspect DataFlow now have fully rounded corners.
- A per-action override in Update Action Versions now offers a No Change option to keep that one action on its current version while the rest of the package updates.
- The transform detail values in Inspect DataFlow now appear in input-style boxes.
- The expression, aggregate, column, and configuration boxes in Inspect DataFlow no longer have a border.
- Get Card Pages now labels the page count on each app studio app, report, and worksheet (e.g. "3 pages") instead of showing a bare number.
- Get Card Pages on a page, app studio app, or worksheet now lists the cards that live only there under a "Cards that Only Live Here" category.
- The Update Details view now shows the object's type icon next to its name in the title instead of next to the ID below.
- Delete now shows a type icon on each dependency category, such as a card icon on Cards on This Page.
- Deleting an AppDB collection now lists the datastore's other collections and the app connected to it, instead of reporting that dependencies could not be checked.
- The activity log button's hold-for-more-options menu now aligns each option's icon with its title instead of the top of its description.
- Renamed the action button "Update <Object> Details" to "Update Details".
- System pages (Overview, Favorites, or Shared) in a list now carry a "System" chip next to their name.
- Copying an object from a JSON viewer now produces formatted, indented JSON in every view.
- Generate Definition from JSDoc now lists each function directly as its own expandable row instead of nesting them inside a collapsible Manifest changes section.
- Generate Definition from JSDoc now shows a changed simple property such as nullable or isList on a single line instead of a taller stacked block.
- Generate Definition from JSDoc no longer shows a separate Return Value change when a function's output is added or removed alongside it.
- Generate Definition from JSDoc now shows just that a nested output or input field was added or removed, instead of listing all of that field's properties.
- The readable timestamps and user/group names shown next to values in the context JSON view now match the size of the item count shown next to objects and arrays.
- The Current Context detail tabs now show left and right scroll arrows when they overflow the panel width.
- Copy Color Rules no longer lists the dataset you're copying from in its destination picker.
- The Update Owner dialog now opens at the top of the popup, while staying centered in the side panel.
- The dropdowns for searching a user, group, or dataset now size to their results instead of showing empty space below the list.
- Alternate delete actions, such as Delete App and All Cards, now appear in red instead of gray.
- FileSets are now labeled "Document Collections" throughout the extension.

## Performance

- The column picker when mapping columns now opens and filters instantly on datasets with hundreds of columns, instead of stalling.
- The context detail tabs now scroll smoothly through a very large related list, such as a dataset's hundreds of columns.

## Bug Fixes

- Update Trigger Versions now shows a message when a workflow has no alert triggers instead of opening a blank panel.
- Update Action Versions now warns when bumping an action to a version that makes an existing input required while that input has no value set, instead of silently leaving the action broken.
- Side panel actions on a very large workflow, such as Update Action Versions, now open instead of failing to load.
- Update Action Versions now updates the type of a variable nested inside an object variable when you opt in, not only top-level variables.
- The action buttons no longer briefly collapse and reopen when an action finds nothing to show and reports it with a message instead of opening a results panel.
- Sharing a page now makes it appear in your navigation instead of only granting access by direct link.
- Get Card Pages now tells you when none of an object's cards appear on any page, instead of listing them under a lone Orphaned Cards category.
- A category's count in a grouped list now reflects the total objects it contains rather than the number of subcategories beneath it.
- When deleting a page in an app studio app, each of the app's other pages now expands to list the cards on it.
- Get View Inputs now lists the source datasets of union views (and other views that nest their inputs) instead of finding none.
- Inspect DataFlow now shows the output field name on each formula tile's expressions, which previously appeared blank.
- Sharing objects with yourself from a list now closes the row's actions menu and shows a progress toast immediately, instead of appearing to do nothing until every share finished.
- Migrate Content: mapping a column onto one of the target dataset's Beast Modes now saves the affected cards successfully instead of erroring out.
- API Errors now captures failed requests from apps embedded on a page, which were previously missed.
- Viewing a Code Engine action inside a workflow again shows its parent Workflow and Workflow Version as tabs in Current Context.
- The activity log button on a Code Engine package version now opens the parent package's activity instead of an empty log.
- When a grouped result list auto-opens its only populated category, it now also expands the single item inside that category instead of leaving it collapsed.
- When swapping a dataset's account, each account's owner now shows their full name instead of just their last name.
- A count of a single card or page now reads "1 card" or "1 page" instead of "1 cards" or "1 pages".
- Opening a person now keeps their name in the browser tab instead of reverting to "People" a moment later.
- The Definition tab in Current Context now shows a text card's content instead of failing to load.
- The cross-input collision warning in Migrate Content now reads as a single flowing paragraph instead of breaking its text into misaligned, staggered columns.
- The row of action buttons at the top of the side panel no longer shows a stray hairline between two buttons at certain widths.
- Generate Definition from JSDoc now recognizes when an optional output field is made required again, instead of reporting nothing to sync.
- Generate Definition from JSDoc no longer flags function inputs that have no nested fields as changed when they aren't.
- Generate Definition from JSDoc now marks an input as optional when the JSDoc brackets its name, not only when it has a default value.
- Generate Definition from JSDoc now shows a description or other field filled in for the first time as a plain green addition instead of pairing it with an empty red removed row.
- Generate Definition from JSDoc now combines a description that wraps across multiple JSDoc lines into a single line, both in the diff and in the saved definition.
- Copied values throughout the extension now appear in Windows clipboard history (Win+V).
- Transferring a user's objects now shows a green checkmark on each object type that finishes successfully, not only a red X on the ones that fail.
- Opening a Task Center task with a reference-style ID (such as "15AUG25_TS551E") is now recognized instead of leaving the current context empty.
- Opening the settings page without a specific tab now lands on General Settings instead of a blank page with no tab selected.
- Deleting an entire app and all its cards now sends you to App Studio instead of leaving you on the deleted app's broken page.
- Deleting a page now sends you to your Overview instead of leaving you on the deleted page's broken URL.
- Deleting a single app studio or worksheet page now returns you to its app instead of leaving you on the deleted page's broken URL.
- Deleting an AppDB collection now sends you to the AppDB list instead of leaving you on the deleted collection's broken page.
- The delete confirmation now disables its delete buttons when the dependency check fails.
- The delete confirmation now disables its delete buttons while the dependency check is still running.
- Hovering an object's name in a list now underlines it.
- Viewing Objects Owned by someone who owns nothing now shows a brief message instead of a list of empty categories.
- Expanding Current Context in the popup no longer stretches the popup taller or wider to fit the details, which now scroll within it instead.
- Actions that fail on the server, such as deleting, sharing, changing ownership, or updating details, now report the error instead of showing a success message as if they worked.
