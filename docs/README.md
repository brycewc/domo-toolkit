---
---

# Domo Toolkit

Power tools for Domo administrators. Stop wasting time navigating menus, managing hundreds of identical browser tabs, copying dataset IDs from the URL, and constantly clearing your cookies.

Domo Toolkit is a Chrome extension built for the people who live inside Domo every day - administrators managing hundreds of objects, consultants jumping between client instances, and power users building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations.

## Disclaimer

This extension is an independent, community-developed project. Domo, Inc. has no responsibility for its functionality or performance or for any consequences arising from its use.

## Installation

<p float="left">
<a href="https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj?utm_source=readme&utm_medium=badge&utm_campaign=readme&utm_id=readme" target="_blank"><picture><source srcset="Chrome_Store_Badge_Dark.png" media="(prefers-color-scheme: dark)"><img src="Chrome_Store_Badge.png" alt="https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj" height="50"/></picture></a>
<a href="https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk" target="_blank"><img src="Microsoft_Edge_Add_Ons_Badge.png" alt="https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk" height="50"/></a>
</p>

## Features

### Context Detection

Automatically detects the Domo object you're viewing - pages, cards, datasets, dataflows, app studio pages, workflows, alerts, and 100+ other object types. The extension:

- Identifies the object and fetches metadata from the Domo API.
- Detects card modals and resolves parent objects for nested types (e.g. app studio pages).
- Detects selected code engine and form actions inside workflow editors.
- Updates the tab title with the object's name.
- Provides one-click access to the object's full JSON definition, with epoch timestamps annotated as human-readable dates and user IDs annotated with display names.
- Includes related-data tabs with the same full JSON exploration.

### Automatic 431 Error Resolving

Handles Domo's "Request Header Fields Too Large" errors with three independent cookie controls so the right cleanup happens automatically while still leaving a manual escape hatch:

- **Auto-clear on 431 errors** (default on) - Detects 431 errors, clears cookies (preserving your last 2 active instances), and refreshes the page automatically.
- **Manual cookie button** (default on) - A one-click clear button in the toolbar for the times auto-clear isn't triggered, or when you want to clear without a 431.
- **Button behavior** (default preserve) - Either preserve your last 2 instances or clear all Domo cookies (leaves other sites and history untouched either way).

### One-Click Actions

- **Copy ID** - Copy the current object's ID. Long-press for related IDs like stream ID (datasets), app ID (app studio pages), parent Code Engine Package ID (package versions), or DataSet ID (single-dataset cards). Keyboard shortcut: `Ctrl+Shift+1` (`Cmd+Shift+1` on Mac).
- **Share With Self** - Grant yourself access to pages, studio apps, and custom app designs.
- **Activity Log** - View activity log records for the current object. On app studio pages and worksheet views, the log combines the view's records with those of its parent Studio App or Worksheet. Long-press for advanced options: activity for all cards on the current object, all pages containing those cards, all child pages, or just the parent Studio App / Worksheet. Supports multi-user filtering with an include/exclude toggle, and can pull from a DomoStats Activity Log dataset to bypass the audit API's \~1-year retention limit (the dataset is auto-discovered and cached per instance; a per-instance toggle makes it the default).
- **Clipboard Navigation** - Click this button to read your clipboard, identify the Domo object only by its ID on your clipboard, and navigate directly to it. Works with any Domo object ID copied from anywhere - a card, dataset, spreadsheet, Slack message, etc. For objects that don't support navigation, detailed information is displayed in the side panel instead.
- **Delete Current Object** - Delete beast modes, appdb collections, workflows, pages/app studio pages and all their cards, dataflows and all their outputs, and approval templates (optionally including their backing dataset). Lists every dependency (child pages, output datasets, downstream cards) before you confirm, split into "Will be deleted" and "Other dependencies". Pages with child pages are hard-blocked from deletion.

### Data Discovery

Opens in the side panel for persistent exploration without losing your place.

- **Get Cards** - Lists every card on a page, app studio page, worksheet page, report builder page, dataset, or dataflow outputs. For pages, forms and queues are included and separated from cards.
- **Get Card Pages** - Shows where cards on an object live. For pages, shows all other pages not including the current page that contain cards that also exist on the current page. For datasets and dataflows, shows all pages and app studio pages containing cards that use the dataset or dataflow outputs as a source.
- **Get Child Pages** - For pages, shows all child and grandchild pages.
- **Get DataSets** - Shows datasets for an object, including inputs and outputs datasets for dataflows, dependent views for datasets, and all datasets used in cards on a page or app.
- **Get DataSets Used in View** - For dataset views and datafusions, see the underlying source datasets that feed into the view.

All discovery lists support applicable actions like open all, copy ID, share with self, open lineage, open in views explorer, and remove from page. Items are grouped hierarchically or categorically with expand/collapse, counts, direct links, object-type icons, and IDs on hover. A reload button reruns the action against the current object to quickly refresh the view.

### API Error Tracking

API errors are automatically captured as you browse. Click the API Errors button to view them in the side panel with full response details. View error count at a glance, expand individual errors to see the full JSON response, and clear all errors with one click.

### User Management

- **Transfer Ownership** - Reassign every object owned by a user to another user in one flow. Select which object types to include, preview counts before you commit, and optionally delete the user after a successful transfer. Quick button to transfer to the user's manager (uses `reportsTo` from user context). Optionally email the recipient an Excel attachment listing everything transferred.
- **View Ownership by User** - See everything a given user owns, grouped by object type. Virtualized list keeps large ownership results fast.
- **Duplicate (Clone) User** - Clone a user with all access, group membership, and configuration carried over - just change the name and email. Choose exactly which individually-shared cards, pages, and apps to re-share with per-item checkboxes, and get an Excel audit log of every item attempted and its result.

### Object-Specific Actions

- **Lineage** - Open a full-page lineage graph for datasets and dataflows. Traces upstream and downstream dependencies with dataset previews and dataflow tile operations directly in the graph. Supports dark mode.
- **Copy Filters** - Copy URL with all applied filters on a card, page, or app studio page (Pfilters).
- **Export Data** - Export card data in CSV or Excel format, including applied filters (can be done from a card modal!). Export code engine package versions as JavaScript/Python files.
- **Data Repair** - Open the hidden data repair tab for any dataset.
- **Update Owner** - Change ownership of alerts and workflows with a searchable user picker and a "Set to Self" shortcut.
- **Update DataFlow Details** - Edit a dataflow's name and description without creating a new version.
- **Update DataSet Details** - Update a dataset's user defined type.
- **Migrate DataSet Content** _(Beta)_ - Repoint every beast mode, card, drill path, dataflow, and dataset view that uses a dataset to a different dataset in one pass. Deselect a whole type or cherry-pick individual items, run a schema-compatibility check that flags missing or type-mismatched columns, and remap them (including references buried inside formulas and SQL expressions) before applying.
- **Sync Datastore** - Trigger a sync on an AppDB collection.
- **Generate Schema** - Infer a column schema for an AppDB collection from its recent documents, edit it, and apply it (optionally turning on sync to produce a dataset in one step).
- **Update Code Engine Versions** - Bulk update workflow code engine actions to the latest version in a single click, without unmapping inputs and outputs.
- **Copy Color Rules** - Copy a dataset's color rules (conditional formats) to another dataset in one click. Per-rule column references are validated against the destination's schema; Beast Mode references are name-matched between source and destination so rules keep working across datasets with equivalent calculations.
- **Cancel Stuck Stream Update** - Cancel a dataset stream execution stuck in a storing state with no option to cancel in the UI.
- **Generate Definition from JSDoc** _(Beta)_ - Derive a Code Engine package manifest (function names, parameters, types, descriptions) from JSDoc in a JavaScript package's source and update the package definition to match. Shows a structural diff before you confirm.
- **Lock Cards** - Lock all cards on a page, app studio page, dataset, worksheet, report builder report, or all dataflow outputs.
- **Set DataSet Schedule to Manual** - Set a dataset's schedule to manual.
- **Fix Empty String Filters** - Remove empty string default values from "contains" quick filters on cards, so null values display when no value is entered instead of being filtered out.

### Custom Favicons

Customize favicons per Domo instance using regex-based rules:

- **Instance Logo** - Use the instance's own logo as the favicon.
- **Colored Domo Logo** - Custom background color on the Domo logo.
- **Colored Stripes** - Add a colored stripe to the top, right, bottom, or left edge.
- **Regex Patterns** - Match instance subdomains with flexible patterns.
- **Priority Ordering** - Drag-and-drop rule ordering.

### Side Panel & Popup

- **Popup** - Click the extension icon for quick access.
- **Side Panel** - Persistent panel alongside the page for data discovery, with collapsible actions. Opens automatically from the popup when displaying discovery results.

Both show the current context (instance, object type, object ID) and update as you navigate.

### Settings

- **Theme** - System, light, or dark mode.
- **Extension Icon** - Choose between Domo Blue, Black, or White for the toolbar icon so it stays visible against any browser theme.
- **Default Domo Instance** - Set your go-to instance for clipboard navigation from non-Domo sites.
- **Cookie Clearing** - Three independent toggles: auto-clear on 431 errors, show manual cookie button, and manual button behavior (preserve last 2 instances or clear all).
- **Favicon Rules** - Rule editor with pattern matching, effect selection, color picker, and drag-and-drop reordering.
- **Per-Instance Settings** - View, manage, and clear values stored per Domo instance (e.g., the auto-discovered DomoStats Activity Log dataset and the per-instance "Always use DomoStats" toggle).

## Supported Object Types

Pages, cards, datasets, dataflows, app studio apps (and their pages), worksheets (and their pages), workspaces, users, groups, alerts, workflows (including versions, executions, triggers, and actions), code engine packages (and versions), pro-code apps, beast modes, variables, drill paths, access tokens, appdb collections, approvals, approval templates, jupyter workspaces, filesets, files, forms, governance toolkit jobs, certification processes, AI toolkits, AI agents, and dozens more.

## Privacy

- Only runs on `.domo.com` domains.
- Uses Domo's existing authenticated session - no additional login required.
- No data leaves the browser; no external servers are contacted.
- Settings sync via Chrome's built-in storage.
- Domo data is never read, stored, or sent off-device.

See the full [Privacy Policy](./PRIVACY_POLICY.md) for details.

## Contributing

Interested in contributing? See [CONTRIBUTING](./CONTRIBUTING.md) for the tech stack, architecture, development setup, code conventions, and key patterns.

## Issues & Feedback

Found a bug or have a feature request? [Open an issue](https://github.com/brycewc/domo-toolkit/issues).
