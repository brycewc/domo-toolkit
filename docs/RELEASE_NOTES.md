---
## title: Release Notes
---

# Domo Toolkit v1.3.1 Release Notes (WIP)

## New Features

### Migrate Downstream Content (Datasets)

- New "Migrate Downstream Content" action button on datasets: repoints every card, dataset view, and dataflow that uses a dataset to a different dataset in one pass.
- Finding downstream content needs no DomoStats or other setup.
- Every found item starts selected, with checkboxes on both type groups and individual items, so you can deselect a category or cherry-pick.
- Pick the target dataset with a type-to-search box that loads more results as you scroll.
- Picking a target runs a schema-compatibility check that flags missing or type-mismatched columns.
- **Column remapper for incompatible schemas:** when the target is missing columns the content uses, map each one to a target column (with an optional Auto Map that matches by normalized name), applied consistently across all affected content.
- Column remapping reaches references inside formulas and SQL expressions, not just top-level fields, so renamed columns don't break cards, views, or dataflows.
- Inline warnings throughout the schema-mismatch flow remind you to align schemas first, since broken column references can break cards, dataflows, and views.
- Progress is reported live per type, and any failure shows that item's error message.
- Dataset-view repointing handles complex SQL (joins, unions) and column references nested inside, not just the top-level input.
- Drill cards that use the dataset are migrated alongside their parent, so drill-down paths keep working.
- Downstream dataflows show their real names instead of a generic "Dataflow {id}" label.
- Group checkboxes show the indeterminate dash when only some of their items are selected, instead of looking unchecked.
- A dataset with no downstream content shows a "Nothing to migrate" message instead of an empty list (a failed lookup keeps its error visible).

### Transfer Ownership (per-item selection)

- Transfer Ownership now has a checkbox on every individual item, so you can transfer a subset within a type instead of all-or-nothing per type.
- Checking a type checks all its items, and deselecting any single item flips both the type and "Select all" to the indeterminate dash.
- The selection summary now counts actual items ("**N** types, **M** objects selected"), and the transfer button enables as soon as one item is selected.
- Items appear pre-checked as each type finishes loading, instead of all flipping checked together when the slowest type finishes.
- "Select all" no longer flickers between states while types load; it stays steadily checked until loading finishes.
- Group headers now show the type's icon next to the label, matching the items inside.
- Tasks now nest under their parent project in the "Projects & Tasks" group instead of a flat list, with project checkboxes cascading to their tasks.
- Project rows now show their real names instead of numeric IDs. _(pre-existing; the old "[Project] 12345" label hid it)_
- Row tooltips now show the clean object ID instead of an internal composite identifier (most noticeable on the Projects & Tasks tree).
- Nested rows now indent per nesting level when selecting items, so children read as belonging under their parent (most visible on the Projects & Tasks tree).
- Project and Task rows are now clickable links to their Domo pages, instead of plain text.

### Inactive User Indicator (Activity Log)

- Deleted (inactive) users in the Activity Log now get the grey-and-white striped avatar Domo uses elsewhere, so it's clear at a glance the actor no longer exists.

### Exclude Users (Activity Log)

- The Activity Log user filter now has an "in / not in" toggle, so you can exclude specific users, not just filter to them.

### Supported Types

- Variables are now recognized as their own type instead of being treated as Beast Modes.
- Added DataSet to the related objects for Approval Templates.
- Added an Approvals tab to Approval Templates' related objects, listing every active approval request from the template with its key Approval Center context.
- On an AppDB Collection, the "DataStore" related-object tab now populates automatically.
- New "Sync Datastore" action button on AppDB collections that kicks off the same manual sync Domo's UI fires (shown only when the collection has sync enabled).
- Renamed the Code Engine "Sync JSDoc to Package" button to "Generate Definition from JSDoc", and limited it to JavaScript packages.
- DataFlow executions are now recognized as their own type, "DataFlow Execution", with the parent DataFlow as their parent.
- New "Generate Schema" action button on AppDB collections that infers a column schema from the collection's recent documents, lets you edit it, and applies it (optionally turning on sync to produce a DataSet in one step).

### Delete Approval Template (related dataset + combined delete)

- Deleting an approval template now shows a dependency check: its related dataset (with a downstream-object count) and a tally of its existing approval requests.
- Added a "Delete Template and DataSet" option that deletes the template and its backing dataset in one pass.
- The combined option is disabled when the dataset has downstream dependents; plain "Delete Template" stays enabled.
- The "Delete Template" confirmation now counts only what it actually removes, no longer implying the dataset will be touched.

### Activity Log: app pages and worksheet views now include their parent

- Clicking Activity Log on an app page or worksheet view now opens a combined log of both the view and its parent Studio App or Worksheet (filter by object type to narrow to one).
- The long-press dropdown gains a "Studio App" / "Worksheet" option that opens just the parent's log.
- Worksheet views now get the full long-press Activity Log dropdown, matching app pages (previously they had none).

## UI Improvements

- Removed pulsing effect on Copy Filters button.
- In the Activity Log Source column, "GROUP" chips are now green and other source types each get their own stable color.
- The "Delete App and All Cards" confirmation now shows the page and card counts (e.g. "all its pages (4), and all cards on those pages (37)").
- The Update Details view now shows the object's name and ID under the title, matching the Delete and Object Details views.
- Scrolling inside an expanded group now continues into the outer list at the group's edge, instead of stopping dead.
- Closing a tab the extension opened now returns you to the tab you launched it from, instead of the tab on its right.

## Bug Fixes

### Activity Log button: no longer stays greyed out for users who have access

- Fixed the Activity Log button staying disabled for users who do have access, on instances or page loads where it took a few seconds for your account to finish loading.

### Side panel: action buttons re-expand when you close a view

- The action buttons at the top of the side panel now re-expand when you close a view, instead of staying collapsed.

### Activity Log header: title now wraps as one sentence instead of staggering

- Fixed the Activity Log header title wrapping as staggered, misaligned blocks on narrow widths (the side panel); it now wraps as one continuous sentence. _(verify wording at release: the object-and-parent variant is new to 1.3.1; the single-object and count variants shipped in 1.3.0, so the staggering was a visible regression there.)_

### Activity Log: filtering to a user on the DomoStats source now returns all their activity

- On the DomoStats Activity Log dataset source, filtering to a user now returns all of that user's activity, including events like file downloads that were previously left out.

### Activity Log: long names truncate instead of overflowing into the next column

- Long names in the Activity Log table now truncate with a tooltip showing the full name, instead of overflowing into the next column.

### Activity Log: instances set to always use DomoStats now load cleanly

- Fixed the Activity Log flickering to broken values, with the count disappearing and infinite scroll stalling, on instances set to always use the DomoStats dataset.

### Delete Beast Mode / Variable: actually deletes now (and reports real failures)

- Deleting a Beast Mode or Variable now actually takes effect (it previously did nothing while reporting success), and real failures surface as errors.

### Get Worksheet Pages: no longer times out with no results

- Fixed "Get Worksheet Pages" hanging and then erroring instead of listing the worksheet's pages.
- Also fixed a page list that loaded a moment after you clicked (right after navigating) never being picked up, including for app pages.

### Update Owner: user search no longer clears your selected owner when you click away

- Fixed the Update Owner (Alert/Workflow) user picker clearing your selected user when you clicked out, which blocked Save until you re-selected.
- Save now requires an actual selection, and the picked owner resets each time the dialog opens.

### Duplicate User: scoped sharing, itemized preview, audit-log download

- Fixed Duplicate User over-sharing the new user with content the source user only reached indirectly (through groups, PDP, org-wide content, or Workspaces); now only directly-shared content is re-shared.
- The preview now lists every individually-shared card, page, and app by name with per-item checkboxes and select-all, so you choose exactly what to re-share.
- Custom apps appear in the preview but aren't auto-shared yet; checked ones are logged as "SKIPPED" for manual follow-up.
- Every duplication now auto-downloads an Excel audit log with one row per attempted item (user, profile fields, groups, shares, apps) and its result.
- Updated wording throughout to say "individually-shared" content, replacing the older "accessible" phrasing that implied broader, group-inclusive sharing.

### Code Engine: JSDoc-synced functions now resolve in Workflows

- Fixed syncing JSDoc producing package versions whose functions Domo Workflows reported as missing at run time.
- If the editor source can't be read safely, the sync is now blocked with a message rather than saving a version that would reintroduce the bug.

### Update Code Engine Versions: reconcile changed inputs and outputs instead of breaking the tile

- Bumping a Code Engine function version now reconciles the tile's inputs and outputs to the new version, instead of leaving them stale and silently breaking the tile.
- Reconciliation only appears when inputs or outputs actually changed, shown per affected action as an Auto (handled) or Review (needs a decision) panel.
- Renamed inputs and outputs are automatically re-pointed to the same workflow variable, so downstream tiles keep working.
- New outputs are added and mapped to a new variable by default; new required inputs are flagged for you to set.
- Removed or renamed inputs with a binding get a remap dropdown, and type changes or removed outputs warn which variables and downstream tiles are affected.
- The only hard block is a function missing from the target version, which is skipped with a warning while the rest still apply.

### Objects Owned view: the "Share all with yourself" button on type groups did nothing

- On the Objects Owned view, the type-group "Share all with yourself" button silently did nothing when clicked. (Shipped this way in v1.3.0.)
- The Pages group's button now works, sharing every page that user owns with you.
- The button is removed from the other type groups, where share-all isn't supported.
- The same dead button is also removed from the Migrate Downstream Content and Delete views.

### Copy ID shortcut: now works when the sidepanel or popup has focus

- The Copy-ID shortcut (Ctrl/Cmd+Shift+1) silently did nothing when the sidepanel or popup had focus, though the badge still flashed.
- It now works whichever surface has focus, the sidepanel, popup, or page.

### Cloud Integrations: toolkit clears the old account when you go back to the list

- Returning from a Cloud Integration to its account list now clears the detected object, instead of still showing the integration you left. _(verify this shipped in v1.3.0 before including; Cloud Integration support did.)_
