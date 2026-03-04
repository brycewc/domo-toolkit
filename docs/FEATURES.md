# Domo Toolkit Features

## Context Detection

Automatically detects the Domo object you're viewing — Pages, Cards, DataSets, DataFlows, App Studio Pages, Workflows, Alerts, and 100+ other object types. The extension:

- Identifies the object and fetches metadata from the Domo API
- Detects card modals and resolves parent objects for nested types (e.g. App Studio Pages)
- Updates the tab title with the object's name
- Provides one-click access to the object's full JSON definition

## Automatic 431 Error Resolving

Handles Domo's "Request Header Fields Too Large" errors with three cookie clearing modes:

- **Auto** (default) — Detects 431 errors, clears cookies (preserving your last 2 active instances), and refreshes the page automatically
- **Preserve** — One-click clearing that keeps your last 2 instances
- **All** — Clears all Domo cookies while leaving other sites and history intact

## Always Relevant Actions

- **Copy ID** — Copy the current object's ID. Long-press for related IDs like Stream ID (DataSets) or Studio App ID (App Studio Pages).
- **Share With Self** — Grant yourself access to Pages, Studio Apps, and Custom App designs.
- **Delete Current Object** — Delete Beast Modes, AppDB Collections, Workflows, and Pages/App Studio Pages including their Cards. Includes confirmation dialog and child Page safety checks.
- **Activity Log** — View activity log records for the current object. Long-press for advanced options: 1) View activity for all Cards on the current object. 2) View activity for all Pages containing Cards from the current object.
- **Clipboard Navigation** — Copy any Domo object ID — from a Card, DataSet, spreadsheet, Slack message, support ticket, or anywhere else — and navigate to it. The extension identifies the object type, fetches its name, and builds the URL. For objects that don't support navigation, detailed information is display in the side panel instead. Keyboard shortcut: `Ctrl+Shift+1` (`Cmd+Shift+1` on Mac).

## Data Discovery Actions

Opens in the side panel for persistent exploration without losing your place.

### Get Cards

Lists every Card on a Page, App Studio Page, Worksheet Page, Report Builder Page, or DataSet. Supports opening all in new tabs.

### Get Pages

Shows where objects are used:

- **Pages** — All child and grandchild Pages in a hierarchical tree
- **App Studio Pages** — All Pages within the app, grouped by parent
- **Cards** — Every Page, App Studio Page, and Report Builder Page where a Card appears
- **DataSets** — Full downstream trace: DataSet → Cards → Pages

### Get DataSets

Traces data lineage:

- **Pages / App Studio Pages** — Every DataSet powering Cards on the Page
- **DataFlows** — Input and output DataSets, grouped separately
- **DataSet Views / DataFusions** — Underlying source DataSets

All discovery lists support open all, copy ID, share all, and refresh. Items are grouped hierarchically with expand/collapse, counts, direct links, and IDs on hover.

## Object Specific Actions

- **Copy Filtered URL** — Copy URL with all applied filters on a Card, Page, or App Studio Page (Pfilters).
- **Data Repair** — Open the hidden data repair tab for any DataSet.
- **Update Owner** — Change ownership of Alerts and Workflows with a searchable user picker and a "Set to Self" shortcut.
- **Update DataFlow Details** — Edit DataFlow names and descriptions without creating a new version.

## Custom Favicons

Customize favicons per Domo instance using regex-based rules:

- **Instance Logo** — Use the instance's own logo as the favicon
- **Colored Domo Logo** — Custom background color on the Domo logo
- **Colored Stripes** — Add a colored stripe to the top, right, bottom, or left edge
- **Regex Patterns** — Match instance subdomains with flexible patterns
- **Priority Ordering** — Drag-and-drop rule ordering

## Side Panel & Popup

- **Popup** — Click the extension icon for quick access
- **Side Panel** — Persistent panel alongside the page for data discovery, with collapsible actions. Opens automatically from the popup when displaying discovery results.

Both show the current context (instance, object type, object ID) and update as you navigate.

## Extension Settings

- **Theme** — System, light, or dark mode
- **Default Domo Instance** — Set a default instance for clipboard navigation from non-Domo sites
- **Cookie Clearing Behavior** — Auto (default), preserve, or all
- **Favicon Rules** — Rule editor with pattern matching, effect selection, color picker, and drag-and-drop reordering

## Supported Object Types

Pages, Cards, DataSets, DataFlows, App Studio Apps/Pages, Worksheets, Report Builder, Users, Groups, Alerts, Workflows, Code Engine Packages, Pro-code Apps, Beast Modes, Variables, Access Tokens, AppDB Collections, Approvals, Approval Templates, Drill Paths, Jupyter Workspaces, FileSets, Files, Forms, and dozens more.

Each type supports URL pattern detection, ID validation, and API-based metadata enrichment.

## Privacy & Permissions

- Only runs on `.domo.com` domains
- Uses Domo's existing authenticated session — no additional login required
- No data leaves the browser; no external servers are contacted
- Settings sync via Chrome's built-in storage
- Domo data is never read, stored, or sent off-device
