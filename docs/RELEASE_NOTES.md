---
## title: Release Notes
---

# Domo Toolkit v1.4.0 Release Notes

## New Features and Imrovements

### Migrate DataSet Content (Beta)

- New "Migrate DataSet Content" action button: repoints every beast mode, card, drill path, dataflow, and dataset view that uses a dataset to a different dataset in one pass.
- Every found item has checkboxes on both type groups and individual items, so you can deselect a category or cherry-pick.
- Picking a target runs a schema-compatibility check that flags missing or type-mismatched columns, and allows you to remap them before applying the migration.
- Column remapping reaches references inside formulas and SQL expressions, not just top-level fields, so renamed columns don't break cards, views, or dataflows.

### Transfer Ownership (Beta)

- Transfer Ownership now has a checkbox on every individual item, so you can transfer a subset within a type instead of all-or-nothing per type.
- The selection summary now counts actual items ("**N** types, **M** objects selected"), and the transfer button enables as soon as one item is selected.
- Group headers now show the type's icon next to the label, matching the items inside.
- Tasks now nest under their parent project in the "Projects & Tasks" group instead of a flat list, with project checkboxes cascading to their tasks.
- Transferring datasets or dataflows now adds a "From [previous owner]" tag to each transferred object.

### Activity Log

- Deleted (inactive) users in the Activity Log now get the grey-and-white striped avatar that matches Domo.
- The Activity Log user filter now has an "in / not in" toggle, so you can exclude specific users, not just filter to them.
- Clicking Activity Log on an app page or worksheet view now opens a combined log of both the view and its parent Studio App or Worksheet.
- The long-press dropdown gains a "Studio App" / "Worksheet" option that opens just the parent's log.
- Worksheet views now get the full long-press Activity Log dropdown, matching app pages (i.e., cards, card pages).

### AppDB

- On an AppDB Collection, the "DataStore" related-object tab now populates automatically.
- New "Sync Datastore" action button on AppDB collections.
- New "Generate Schema" action button on AppDB collections that infers a column schema from the collection's recent documents, lets you edit it, and applies it (optionally turning on sync to produce a DataSet in one step).

### Approval Templates

- Deleting an approval template now shows a dependency check: its related dataset (with a downstream-object count) and a tally of its existing approval requests.
- Added a "Delete Template and DataSet" option that deletes the template and its backing dataset in one pass.

### Duplicate User

- The preview now lists every individually-shared card, page, and app by name with per-item checkboxes and select-all, so you choose exactly what to re-share.
- Every duplication now auto-downloads an Excel audit log with one row per attempted item (user, profile fields, groups, shares, apps) and its result.
- Fixed Duplicate User over-sharing the new user with content the source user only reached indirectly (through groups, PDP, org-wide content, or Workspaces); now only directly-shared content is re-shared.

### Supported Types

- Variables are now recognized as their own type instead of being treated as Beast Modes.
- Drill Paths are now properly recognized and have context filled.
- Added DataSet to the related objects for Approval Templates.
- Added an Approvals tab to Approval Templates' related objects, listing every active approval request from the template.
- Renamed the Code Engine "Sync JSDoc to Package" button to "Generate Definition from JSDoc", limited it to JavaScript packages, and moved to beta.
- DataFlow Executions are now recognized as their own type instead of just a DataFlow.

## UI Improvements

- The action buttons at the top of the side panel now re-expand when you close a view, instead of staying collapsed.
- Removed pulsing effect on Copy Filters button.
- In the Activity Log Source column, "GROUP" chips are now green and other source types each get their own stable color.
- The "Delete App and All Cards" confirmation now shows the page and card counts (e.g. "all its pages (4), and all cards on those pages (37)").
- The related-objects tabs now scroll sideways with a normal vertical mouse wheel while hovering them, not just a horizontal scroll wheel.
- Closing a tab the extension opened now returns you to the tab you launched it from, instead of the tab on its right.
- Tooltips no longer pop up instantly when you move between nearby buttons; each one now waits the normal hover delay.
- The Activity Log, Share with Self, and Delete buttons now show a tooltip explaining why they're unavailable when disabled.
- The Get Owned Objects, Update Code Engine Versions, and Generate Definition from JSDoc views now show a "Beta" label.
- Pop-up notifications now use Domo-style status icons, matching the rest of the extension.
- In Get Child Pages, child pages with no nested pages no longer show a stray "(0)", and the rest label the count "(N pages)" so it isn't mistaken for a card count.

## Bug Fixes

### Activity Log

- Fixed the Activity Log button staying disabled for users who do have access, on instances or page loads where it took a few seconds for your account to finish loading.
- Long names in the Activity Log table now truncate with a tooltip showing the full name, instead of overflowing into the next column.
- Fixed the Activity Log flickering to broken values, with the count disappearing and infinite scroll stalling, on instances set to always use the DomoStats dataset.
- Users who don't have a profile picture in the Activity Log now show their initials, instead of a generic grey placeholder.
- The whole page's horizontal and vertical scroll bars no longer flicker in while the Activity Log loads; scrolling stays on the table.

### Update Code Engine Versions (Beta)

- Bumping a Code Engine function version now reconciles the tile's inputs and outputs to the new version, instead of leaving them stale and silently breaking the tile.
- Renamed inputs and outputs are automatically re-pointed to the same workflow variable, so downstream tiles keep working.
- New outputs are added and mapped to a new variable by default; new required inputs are flagged for you to set.
- Removed or renamed inputs with a binding get a remap dropdown, and type changes or removed outputs warn which variables and downstream tiles are affected.

### Other Fixes

- Deleting a Beast Mode or Variable now actually takes effect (it previously did nothing while reporting success), and real failures surface as errors.
- Fixed "Get Worksheet Pages" hanging and then erroring instead of listing the worksheet's pages.
- Fixed the Update Owner (Alert/Workflow) user picker clearing your selected user when you clicked out, which blocked Save until you re-selected.
- In "Copy Color Rules", clicking into the destination dataset search and then clicking away without choosing a different dataset no longer wipes your selected dataset.
- Fixed Generate Package Definition from JSDoc producing package versions whose functions Domo Workflows reported as missing at run time.
- Fixed on the Objects Owned view, the type-group "Share all with yourself" button silently doing nothing when clicked.
- Fixed the Copy-ID shortcut (Ctrl/Cmd+Shift+1) silently doing nothing when the sidepanel or popup had focus.
- Returning from a Cloud Integration to its account list now clears the detected object, instead of still showing the integration you left.
- Long instance and object-type names in the Current Context header now shorten to fit instead of overlapping the info icon.
- Fixed the side panel's expand button staying disabled when viewing captured API errors was the only available action, which kept those errors out of reach.
