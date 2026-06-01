---

## title: Release Notes

# Domo Toolkit v1.3.1 Release Notes (WIP)

## New Features

### Migrate Downstream Content (Datasets)

- New "Migrate Downstream Content" action button on datasets. It finds every card, dataset view, and dataflow that uses the dataset as an input and repoints them to a different dataset in one pass.
- Finding downstream content needs no DomoStats or other setup.
- Works like the Transfer Ownership view: every found item starts selected, with checkboxes on both the type groups and the individual items, so you can deselect a whole category or cherry-pick.
- Pick the target dataset with a type-to-search box that loads more results as you scroll.
- As soon as you pick a target, a schema-compatibility check flags any columns that are missing or have a different type.
- **Column remapper for incompatible schemas:** when the target doesn't have every column the origin does, it scans the selected content and shows only the columns that are both actually used and missing from the target. Each one gets a type-to-search picker of the target's columns (sorted alphabetically), defaulting to "Leave unmapped". An optional Auto Map button fills in the closest match for each (ignoring differences in case, spaces, hyphens, and underscores), leaves anything with no match unmapped, and warns before overwriting mappings you've already set. The mapping you choose is applied consistently across every piece of content the dataset feeds.
- Your column mapping is applied everywhere a column can be referenced, including inside formulas and SQL expressions, so a renamed column doesn't leave a card, view, or dataflow pointing at one that no longer exists.
- Clear inline warnings throughout the schema-mismatch flow remind you to align schemas before migrating, and that broken column references can make cards render blank, dataflows fail, and views error.
- Progress is reported live per type as the migration runs, and any failure shows the error message for that item.
- Repointing a dataset view handles complex SQL, including joins and set operations (unions), and updates column references nested inside, not just the view's top-level input.
- Drill cards are migrated alongside their parent card when they use the dataset too, so drill-down paths keep working after the swap.
- Downstream dataflows show their real names instead of a generic "Dataflow {id}" label.
- Group checkboxes (Cards, Dataset Views, Dataflows) show the indeterminate dash when only some of their items are selected, instead of looking fully unchecked.
- When a dataset has no downstream content at all, you get a "Nothing to migrate" message and return to the default view instead of an empty list. If the lookup errored instead, the error stays on screen so you can retry.

### Transfer Ownership (per-item selection)

- Transfer Ownership is no longer all-or-nothing per object type. Each individual item (a single card, dataset, dataflow, and so on) now has its own checkbox, so you can transfer a subset within a type, for example moving 3 specific dashboards instead of every dashboard the source user owns.
- Type rows act as cascading toggles: checking a type checks all its items, deselecting any single item flips the type to the indeterminate dash, and "Select all" goes indeterminate whenever any individual item is deselected.
- The selection summary now reads "**N** types, **M** objects selected" based on the actual items chosen, and the "Transfer ownership to…" button enables as soon as a single item is selected (it no longer requires a whole type).
- Items appear pre-checked as each type finishes loading and streams in, instead of every item flipping checked together when the slowest type finally finishes.
- "Select all" no longer flickers between the dash and checked states while types are loading. It stays steadily checked during loading, then resumes its normal unchecked / indeterminate / checked behavior once everything has loaded.
- Group headers (Cards, Dataset Views, Dataflows, Pages, Datasets, and so on) now show the type's icon next to the label, matching the icon on every item inside the group.
- Tasks now nest under their parent project in the "Projects & Tasks" group instead of showing as a flat list. Checking a project checks every task under it; deselecting a single task flips the project to the indeterminate dash while keeping the project itself selected, so you keep fine-grained control. The old "[Project]" / "[Task]" label prefixes are gone, since the nesting and the Project icon now convey that.
- Project rows now show their real names instead of numeric IDs. _(pre-existing; was camouflaged by the old "[Project] 12345" label, and the new flat label exposed it)_
- Hovering a row now shows the clean object ID in the tooltip instead of an internal composite identifier. Most noticeable on the Projects & Tasks tree, where tasks previously showed a longer internal string.
- Nested rows now indent one level per level of nesting when selecting items, so children clearly read as belonging under their parent instead of sitting flush-left. Most visible on the Projects & Tasks tree, where tasks shift right under their project.
- Project and Task rows are now clickable links to their pages in Domo. They previously rendered as plain text, unlike every other transferable type, which already linked out.

### Inactive User Indicator (Activity Log)

- Deleted (inactive) users in the Activity Log table now get the same grey-and-white diagonally striped avatar that Domo uses in its own people list, so it's clear at a glance when an event was performed by a user who no longer exists.

### Supported Types

- Variables are now recognized as their own type instead of being treated as Beast Modes. The two were previously indistinguishable because Domo gives them the same URL, so they shared the Beast Mode label and icon. Variables now get their own icon and "Variable" label, and the Objects Owned and Transfer Ownership views (and the transfer audit log) label each item as a Variable or Beast Mode individually rather than lumping them all under Beast Mode.
- Added DataSet to the related objects for Approval Templates.
- Added an Approvals tab to the related objects for Approval Templates. It lists every active approval request created from the template (the full set, not just the first 30), and each row carries the context the Approval Center shows: status, last-modified time, version, the current pending approver, and the submitter, so the request is one click away.
- On an AppDB Collection, the "DataStore" related-object tab now populates automatically, without needing the parent DataStore to be identified ahead of time.
- New "Sync Datastore" action button on AppDB collections. It kicks off the same manual sync Domo's own UI fires, with progress, success, and failure feedback. It appears only when sync is enabled for the collection (collections without a schema yet won't show it, since the sync would have nothing to do). Using "Apply Schema and Sync" in the Generate Schema flow turns sync on, so a freshly generated schema can go straight to a running sync in one click.
- Renamed the Code Engine "Sync JSDoc to Package" button (and its view) to "Generate Definition from JSDoc". The action doesn't sync anything; it generates the package's function and version definition from the JSDoc in the IDE source, then writes it, so the new label matches what it does. It now shows only for JavaScript packages (and packages with no language set, which are treated as JavaScript); Python packages no longer show it, since JSDoc is JavaScript-specific.
- DataFlow executions are now recognized as their own type, "DataFlow Execution". On an execution's detail page the toolkit labels it "Run of {dataflow name} - {start time}", treats the parent DataFlow as its parent (so you can copy the parent DataFlow's ID), and links back to that DataFlow from the related-objects footer.
- New "Generate Schema" action button on AppDB collections. It looks at the 100 most recent documents in the collection, gathers every property seen across them (so a key that appears in only some documents still gets a column), and infers a type for each: LONG for whole numbers, DOUBLE for decimals, DATETIME for ISO timestamps, DATE for plain YYYY-MM-DD values, and STRING for everything else. The inferred list opens as an editable view where you can rename, retype (STRING, LONG, DOUBLE, DECIMAL, DATE, DATETIME), remove, or add columns. Two save options: **Apply Schema** saves the schema alone; **Apply Schema and Sync** saves it, turns sync on, and runs the sync, so a fresh DataSet with the new columns drops out in one click. Save is blocked if any column name is empty, two columns share a name, or the list is empty. If the collection has no documents, you get a warning instead of an empty view.

### Delete Approval Template (related dataset + combined delete)

- The Delete view now runs a dependency check for approval templates. Under "Other dependencies" it shows the template's related dataset by name with a badge for how many objects sit downstream of it (so "(0 dependencies)" means it's safe to delete), plus a single "Approvals (N requests)" row tallying the template's existing approval requests rather than listing each one.
- Added a second delete option, "Delete Template and DataSet", next to the existing "Delete Template" button. Like the two-option pattern data app views already use, it deletes the template and then its backing dataset in one pass.
- The combined option is disabled (with a tooltip explaining why) when the dataset has downstream dependents, so you can't orphan them. The plain "Delete Template" button stays enabled either way.
- The "Delete Template" confirmation now counts only the dependencies that delete actually removes, so it no longer implies the related dataset will be touched.

### Activity Log: app pages and worksheet views now include their parent

- Clicking Activity Log on an app page or worksheet view now opens a combined log covering both the view and its parent Studio App or Worksheet, so app-level events show up next to the page's. Use the log's object-type filter to narrow to just one when you want.
- The long-press dropdown also gains a dedicated "Studio App" / "Worksheet" option that opens just the parent's log on its own.
- Worksheet views now get the full long-press Activity Log dropdown (Cards, Card Pages, Child Pages, and the new parent option), matching app pages. Previously worksheet views had no Activity Log dropdown at all.

## UI Improvements

- Removed pulsing effect on Copy Filters button.
- In the Activity Log Source column, "USER" chips keep the accent color and "GROUP" chips are now green; any other source type (SYSTEM, ETL, and so on) gets its own stable color.
- The "Delete App and All Cards" confirmation now shows the page and card counts in parentheses (e.g. "all its pages (4), and all cards on those pages (37)").
- The Update Details view now shows the object's name and ID under the header title (hover for the full value), matching the subtitle already shown by the Delete and Object Details views.
- Scrolling inside an expanded group (for example a type's list in the Transfer Ownership or Objects Owned view) now continues scrolling the outer list once you reach the group's top or bottom, instead of stopping dead at the group's edge.
- Closing a tab the extension opened (Activity Log, Lineage, Settings, the release-notes page) now returns you to the tab you launched it from, instead of jumping to whatever tab was on its right.

## Bug Fixes

### Activity Log header: title now wraps as one sentence instead of staggering

- Fixed the Activity Log header title wrapping as staggered, misaligned blocks on narrow widths (the side panel). Each piece of the title (type, name, ID) used to wrap on its own, so they fell out of vertical alignment. It now flows as one continuous sentence that wraps word by word like normal prose, so the full object name (and the parent's name, in the combined app-and-page view) stays visible at any width. _(verify wording at release: the object-and-parent variant is new to 1.3.1; the single-object and count variants shipped in 1.3.0, so the narrow-width staggering was a visible regression there.)_

### Delete Beast Mode / Variable: actually deletes now (and reports real failures)

- Deleting a Beast Mode or Variable never actually reached Domo, yet the toast always reported success. The delete now actually takes effect, and a genuine failure surfaces as an error toast instead of a false success.

### Get Worksheet Pages: no longer times out with no results

- Fixed "Get Worksheet Pages" (and worksheet Child Pages generally) hanging and then erroring instead of listing the worksheet's pages. It now lists them.
- Also fixed a related case where clicking right after navigating to a page meant a page list that loaded a moment later was never picked up, which affected app pages too.

### Update Owner: user search no longer clears your selected owner when you click away

- Fixed the Update Owner (Alert/Workflow) user picker dropping the selected user's name from the search box the moment you clicked out (onto Save or elsewhere). It reverted to the empty, required state and blocked Save until you re-searched for the same user and clicked out a second time.
- Save now requires an actual selection, and the picked owner resets each time the dialog opens so a stale pick can't carry into the next use.

### Duplicate User: scoped sharing, itemized preview, audit-log download

- Fixed Duplicate User over-sharing, where the new user ended up with explicit shares on cards and pages the source user only reached indirectly (through group membership, PDP, dataset-derived visibility, org-wide content, or Workspace membership). Those resources' "Shared with" panels filled up with the new user even though the source user was never a direct grantee. Now only content the source user was directly shared on gets re-shared as a direct share. The new user's effective access is unchanged, because group memberships are still copied (and Workspace access flows from those groups).
- The preview now lists every individually-shared card, page, and custom app by name, each with its own checkbox (all selected by default) and a "Select all / Deselect all" toolbar so even a 500-item list stays usable. The aggregate sections (Role, Profile, Locale, Group memberships) still show compactly, expandable for long lists. A note under each selectable section reminds you that deselecting only suppresses the direct share, not group-inherited access, so you don't mistake it for locking the new user out of the resource entirely.
- Custom apps appear in the preview, but actually sharing them isn't automated yet, so any checked custom app is recorded in the audit log as "SKIPPED" with "Manual sharing required" in the notes, giving you an explicit follow-up record.
- Every duplication now auto-downloads an Excel audit log (named duplicated-user_YYYYMMDD_HHMMSS.xlsx) with one row per attempted item across all steps: the user creation itself, each copied profile field, locale, each group added, each attempted card/page share (marked SHARED or FAILED, with the error in the notes), and each checked custom app. Every row carries the source and new user's ID and name for cross-referencing.
- Updated the wording throughout: the action button tooltip now reads "Clone this user's role, profile, groups, and individually-shared content", the share steps now read "Share individually-shared cards / pages / apps", and the completion toast notes that the audit log was downloaded. This replaces the older "accessible cards/pages" phrasing, which implied the broader, group-inclusive sharing.

### Code Engine: JSDoc-synced functions now resolve in Workflows

- Fixed syncing JSDoc producing package versions whose functions Domo Workflows reported as missing at run time ("Function ... not found in package, is it private?"). The synced version was missing the block Domo's Code Engine editor normally adds when you save, which is what exposes the functions to the runtime, so every function came out unresolvable.
- If the toolkit can't safely read the editor's source, the sync is now blocked with an explanatory message rather than saving a version that would bring the bug back.

### Update Code Engine Versions: reconcile changed inputs and outputs instead of breaking the tile

- Bumping a Code Engine function version used to write only the new version number onto the tile and leave its inputs and outputs wired as before. If the new version changed the function's inputs or outputs (a new output, a renamed, added, or removed input, a type change), the tile silently went stale: new outputs never appeared and renamed inputs lost their binding. It now compares the old and new versions and reconciles the tile so the workflow keeps working.
- Reconciliation only appears when the inputs or outputs actually changed, so the common "bump to latest, nothing else changed" case stays one click. An affected action gets a collapsible panel tagged Auto (handled for you) or Review (needs a decision).
- Renamed inputs and outputs are automatically re-pointed to the **same** workflow variable, so every downstream tile that reads it keeps working with no further edits.
- New outputs are added to the tile and, by default, mapped to a newly created variable so they're usable downstream right away (opt out per output with a checkbox). New optional inputs are added quietly; new required inputs are flagged for you to set in Domo after updating.
- Removed or renamed inputs that carried a binding get a dropdown to map that binding to a new input or drop it. A type change warns you, naming the bound variable and every other tile that shares it, with an opt-in to update the variable's type. A removed output whose variable still feeds downstream tiles warns which tiles would break.
- The only hard block is a function that no longer exists in the target version: that one action is skipped (with a clear warning) while the rest still apply. Everything else warns but lets you proceed.

### Objects Owned view: the "Share all with yourself" button on type groups did nothing

- On the Objects Owned by {user} view, each type group (Pages, Datasets, Apps, Worksheets) showed a "Share all with yourself" button that silently did nothing when clicked: no request, no error, no feedback. (Shipped this way in v1.3.0.)
- The Pages group's button now works: it shares every page that user owns with you, with an "N pages shared with yourself" confirmation.
- The button is removed from the other type groups (Datasets, Apps, Worksheets), where share-all isn't supported.
- The same dead button has also been removed from the Migrate Downstream Content and Delete views, where it never did anything either.

### Copy ID shortcut: now works when the sidepanel or popup has focus

- The Copy-ID keyboard shortcut (Ctrl/Cmd+Shift+1) silently did nothing when the sidepanel or popup had focus, even though the badge still flashed its checkmark, because the copy only works when the Domo page itself is focused. The Copy button was unaffected, since it copies from the focused extension UI directly.
- The shortcut now works whether the focused surface is the sidepanel, the popup, or the Domo page itself, with no risk of copying twice.
