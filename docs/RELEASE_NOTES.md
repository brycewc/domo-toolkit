# Domo Toolkit v1.6.0 Release Notes

## New Features and Improvements

- Added Delete Unused Beast Modes for datasets and people: find every Beast Mode and Variable with no active links to a card, drill, or other Beast Mode, then review the results, unselect anything you want to keep, and delete the rest in one pass. Beast Modes and Variables are grouped separately, locked ones are listed on their own and left unselected, and every selection is re-checked for usage right before it is deleted.
- Added Manage Card Owners for datasets, dataflows, pages, App Studio pages, report builder pages, and worksheets: see every owner across all of the object's cards, and add or remove users and groups on many cards at once. Each owner shows how many of the selected cards they own, with a list of exactly which ones.
- Cancelling a stuck dataset update now cancels every running update on the stream at once, not just the most recent.
- Opening an App Studio page by its page link now redirects you into its app automatically, instead of landing on Domo's "This content must be viewed within its app" page.
- The Stream tab for a connector-backed dataset now shows the latest published connector version next to the version it currently runs.
- Text cards can now be exported as Markdown or HTML from the Export button.
- Added a setting that lets Domo developers use the toolkit on a Domo instance running on their own machine.

### Supported Types

- Pro-code custom apps are now recognized as their own type instead of being treated as bricks.
- Custom app instances are now recognized as their own type, "Custom App".

### Update Action Versions

- Update Code Engine Versions is now called Update Action Versions, and it can bump the versions of a workflow's subflow actions as well as its Code Engine actions.
- Update Action Versions now blocks editing a workflow version that another user has locked, and automatically clears your own lock or any lock more than 24 hours old.
- A per-action override now offers a No Change option to keep that one action on its current version while the rest of the package updates.

### Column Mapping

- Remap Columns can now repair a dataset view that its source dataset broke by renaming or removing a column the view reads, either by pointing the view at a valid column or dropping that column from the view.
- Remap Columns can now drop a broken column outright instead of remapping it, when nothing but table cards uses it.
- Dropping a column now also removes the card's filters and slicers on that column, not just the column itself.
- Remap Columns now has an Auto Map button that fills in each broken column's closest-matching replacement in one click.
- Migrate Content's Auto Map now also matches columns that share the same words, not only names that are identical apart from case and separators.

### Delete

- Deleting a dataflow now also lists the alerts on its output datasets that will be deleted with it.
- Deleting a dataflow whose output datasets feed downstream dataset views is now blocked up front, with the offending views listed, instead of failing partway through.
- Deleting a page, App Studio page, or worksheet page now offers a "Delete Page and Cards that Only Live Here" action that removes the page along with only the cards that appear on no other page.
- Deleting an AppDB collection now offers a "Delete Datastore and All Collections" action that removes the entire datastore and every collection in it.

### Workflows

- Workflows now have a Triggers tab listing every trigger attached to them.
- Selecting a user task in a workflow now identifies its Task Center Queue in Current Context.

### Custom Apps

- A custom app card now links to the app instance behind it and the app design powering it in Current Context.
- A custom app design now lists its deployed instances and the cards that use it in Current Context.

### Lock Cards

- Locking cards now opens a list where you can review each card's current lock status and unselect any before applying the change.
- That same list has a Lock/Unlock toggle, so it unlocks cards as well as locking them.

### Swap Account

- The Switch Account feature is now called Swap Account.
- Swapping a dataset's account now offers a Save and Run button that applies the change and immediately runs the dataset, alongside the existing Save.

### People and Groups

- Get Card Pages now works on a person, listing every page their cards appear on.
- A person's profile page now has a View in Admin button, so you can move between the two views in one click.
- Get Owned Objects now works on a group, listing everything the group owns.
- Transfer Ownership now works on a group, moving the group's objects to another group.

## UI Improvements

- Hover tooltips throughout the extension now appear promptly instead of after a long pause.
- System pages (Overview, Favorites, or Shared) in a list now carry a "System" chip next to their name.
- FileSets are now labeled "Document Collections" throughout the extension.
- A long list that is a panel's only expandable section now fills the panel's full height.
- Every scrollable list now fades out at the top and bottom edges when there is more to scroll, instead of some fading and others showing a scrollbar.

### Copy

- Viewing a Code Engine action inside a workflow now lets you copy the workflow's ID and version from the Copy button's hold-for-more-options menu.
- Viewing a workflow execution now lets you copy the workflow's ID from the Copy button's hold-for-more-options menu.
- Copying an object from a JSON viewer now produces formatted, indented JSON in every view.

### Column Mapping

- The dropdown for picking a column or Beast Mode when mapping columns is now wider, so long names are easier to read.
- Remap Columns now lists the replacement columns alphabetically, matching Migrate Content.
- The Remap Columns header now uses the same tighter spacing as other views, and both of its screens match.

### API Errors

- The API Errors list now sorts newest first by default, with a header button to reverse the order.
- Hovering a failed request now shows its full URL, including the domain.

### Swap Account

- The Choose Account list now shows a count of matching accounts above the results.
- Swapping the account on a single-account dataset now lets you Save or Save and Run straight from the chosen account's detail screen, skipping the extra confirmation list.

### Multi-Select Lists

- The Select all checkbox now sits directly above the list instead of up in the header.
- Migrate Content now has a Select all checkbox for selecting or clearing all downstream content at once.

### Update Action Versions

- The expandable sections in Update Action Versions and Inspect DataFlow now have fully rounded corners.

### Inspect DataFlow

- The transform detail values now appear in input-style boxes.
- The expression, aggregate, column, and configuration boxes no longer have a border.

### Get Card Pages

- Get Card Pages now labels the page count on each App Studio app, report, and worksheet (for example "3 pages") instead of showing a bare number.
- Get Card Pages on a page, App Studio app, or worksheet now lists the cards that live only there under a "Cards that Only Live Here" category.

### Delete

- Delete now shows a type icon on each dependency category, such as a card icon on Cards on This Page.
- Deleting an AppDB collection now lists the datastore's other collections, the apps connected to it, and its synced dataset, instead of reporting that dependencies could not be checked.
- Alternate delete actions, such as Delete App and All Cards, now appear in soft red instead of gray.

### Generate Definition from JSDoc

- Each function is now listed directly as its own expandable row instead of nested inside a collapsible Manifest changes section.
- A changed simple property such as nullable or isList now appears on a single line instead of a taller stacked block.
- A function's output being added or removed no longer also shows a separate Return Value change alongside it.
- A nested output or input field that was added or removed now shows just that, instead of listing all of that field's properties.

### Current Context

- The readable timestamps and user/group names shown next to values in the Current Context JSON view now match the size of the item count shown next to objects and arrays.
- The Current Context detail tabs now show left and right scroll arrows when they overflow the panel width.

### Lineage

- Each node in a lineage now shows who owns its dataset or dataflow, with their avatar, and links to that person or group.
- Nodes in a lineage no longer show the object's ID.
- The data preview for a dataset in a lineage now shows the dataset's ID in its header.
- An exported lineage now has Owner, Owner ID, and Owner Type columns.

## Bug Fixes

- Update Trigger Versions now shows a message when a workflow has no alert triggers instead of opening a blank panel.
- The row of action buttons no longer briefly collapses and reopens when an action finds nothing to show and reports it with a message instead of opening a results panel.
- Get Card Pages now tells you when none of an object's cards appear on any page, instead of listing them under a lone Orphaned Cards category.
- Get View Inputs now lists the source datasets of union views (and other views that nest their inputs) instead of finding none.
- Inspect DataFlow now shows the output field name on each formula tile's expressions, which previously appeared blank.
- API Errors now captures failed requests from apps embedded on a page.
- The activity log button on a Code Engine package version now opens the parent package's activity instead of an empty log.
- Opening a person now keeps their name in the browser tab title instead of reverting to "People" a moment later.
- Copied values throughout the extension now appear in Windows clipboard history (Win+V).
- Transferring a user's objects now shows a green checkmark on each object type that finishes successfully, not only a red X on the ones that fail.
- Opening the settings page without a specific tab now lands on General Settings instead of a blank page with no tab selected.
- Viewing Objects Owned by someone who owns nothing now shows a brief message instead of a list of empty categories.
- Actions that fail on the server, such as deleting, sharing, changing ownership, or updating details, now report the error instead of showing a success message as if they worked.
- An approval request that was never given its own title now shows its template's name instead of an ID.
- Task Center tasks in Objects Owned and Transfer Ownership now show their names instead of their IDs.
- Lineage can now be expanded past the fourth level in either direction, instead of dead-ending with no expand option on the outermost objects. ([#97](https://github.com/brycewc/domo-toolkit/issues/97))
- Exporting a lineage now writes the whole pipeline instead of only the levels the graph loaded up front. ([#97](https://github.com/brycewc/domo-toolkit/issues/97))
- Set to Manual no longer shows up on dataset views.
- Objects Owned and Transfer Ownership for a person no longer list dashboards and App Studio apps the person only owns through one of their groups.
- AI models are recognized again on Domo's new model URL, so opening one is detected and links to it work.

### Update Action Versions

- Update Action Versions now warns when bumping an action to a version that makes an existing input required while that input has no value set, instead of silently leaving the action broken.
- Side panel actions on a very large workflow, such as Update Action Versions, now open instead of failing to load.
- Update Action Versions now updates the type of a variable nested inside an object variable when you opt in, not only top-level variables.

### Sharing

- Sharing a page now makes it appear in your navigation instead of only granting access by direct link.
- Sharing objects with yourself from a list now closes the row's actions menu and shows a progress toast immediately, instead of appearing to do nothing until every share finished.

### Delete

- When deleting a page in an App Studio app, each of the app's other pages now expands to list the cards on it.
- The delete confirmation now disables its delete buttons while the dependency check is still running, and keeps them disabled if that check fails.
- Deleting an object now sends you somewhere useful instead of leaving you on its broken page: an entire app and its cards to App Studio, a page to your Overview, a single App Studio or worksheet page to its app, and an AppDB collection to the AppDB list.
- Deleting an object no longer navigates your tab when you moved it off the object before confirming the delete.

### Migrate Content

- The Drop Column choice now appears for table cards, where it previously never offered itself on any card.
- Remapping or dropping a column no longer renames or deletes a card's Beast Mode that happens to share the column's name.
- Mapping a column onto one of the target dataset's Beast Modes now saves the affected cards successfully instead of erroring out.
- The cross-input collision warning now reads as a single flowing paragraph instead of breaking its text into misaligned, staggered columns.

### Current Context

- Viewing a Code Engine action inside a workflow again shows its parent Workflow and Workflow Version as tabs in Current Context.
- The Definition tab now shows a notebook/text card's content instead of failing to load.
- Opening a Task Center task with a reference-style ID (such as "15AUG25_TS551E") is now recognized instead of leaving Current Context empty.
- A Task Center task now shows its name in Current Context, which was previously blank for tasks in many queues.
- Expanding Current Context in the popup no longer stretches the popup taller or wider to fit the details, which now scroll within it instead.
- The Current Context detail tabs now scroll smoothly through a very large related list, such as a dataset's hundreds of columns.

### Generate Definition from JSDoc

- An optional output field that is made required again is now recognized, instead of reporting nothing to sync.
- Function inputs that have no nested fields are no longer flagged as changed when they aren't.
- An input is now marked optional when the JSDoc brackets its name, not only when it has a default value.
- A description or other field filled in for the first time now shows as a plain green addition instead of being paired with an empty red removed row.
- A description that wraps across multiple JSDoc lines is now combined into a single line, both in the diff and in the saved definition.
- A default value containing a backslash is now written correctly instead of breaking the saved definition.
