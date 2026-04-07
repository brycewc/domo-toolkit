# Domo Toolkit

Power tools for Domo administrators. Stop wasting time navigating menus, managing hundreds of identical browser tabs, copying dataset IDs from the URL, and constantly clearing your cookies.

Domo Toolkit is a Chrome extension built for the people who live inside Domo every day - administrators managing hundreds of objects, consultants jumping between client instances, and power users building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations.

## Disclaimer

This extension is an independent, community-developed project. Domo, Inc. has no responsibility for its functionality or performance or for any consequences arising from its use.

## Installation

<p float="left">
<a href="https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj?utm_source=readme&utm_medium=badge&utm_campaign=readme&utm_id=readme" target="_blank"><img src="Chrome_Store_Badge.png" alt="https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj" height="50"/></a>
<a href="https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk" target="_blank"><img src="Microsoft_Edge_Add_Ons_Badge.png" alt="https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk" height="50"/></a>
</p>

## Features

### Context Detection

Automatically detects the Domo object you're viewing - pages, cards, datasets, dataflows, app studio pages, workflows, alerts, and 100+ other object types. The extension:

- Identifies the object and fetches metadata from the Domo API
- Detects card modals and resolves parent objects for nested types (e.g. app studio pages)
- Detects selected code engine and form actions inside workflow editors
- Updates the tab title with the object's name
- Provides one-click access to the object's full JSON definition, with epoch timestamps annotated as human-readable dates and user IDs annotated with display names

### Automatic 431 Error Resolving

Handles Domo's "Request Header Fields Too Large" errors with three cookie clearing modes:

- **Auto** (default) - Detects 431 errors, clears cookies (preserving your last 2 active instances), and refreshes the page automatically
- **Preserve** - One-click clearing that keeps your last 2 instances
- **All** - Clears all Domo cookies while leaving other sites and history intact

### One-Click Actions

- **Copy ID** - Copy the current object's ID. Long-press for related IDs like stream ID (datasets) or app ID (app studio pages). Keyboard shortcut: `Ctrl+Shift+1` (`Cmd+Shift+1` on Mac).
- **Share With Self** - Grant yourself access to pages, studio apps, and custom app designs.
- **Activity Log** - View activity log records for the current object. Long-press for advanced options: view activity for all cards on the current object, all pages containing those cards, or all child pages.
- **Clipboard Navigation** - Click this button to read your clipboard, identify the Domo object only by its ID on your clipboard, and navigate directly to it. Works with any Domo object ID copied from anywhere - a card, dataset, spreadsheet, Slack message, etc. For objects that don't support navigation, detailed information is displayed in the side panel instead.
- **Delete Current Object** - Delete beast modes, appdb collections, workflows, pages/app studio pages and all their cards, and dataflows and all their outputs. Includes confirmation dialog and child page safety checks.

### Data Discovery

Opens in the side panel for persistent exploration without losing your place.

- **Get Cards** - Lists every card on a page, app studio page, worksheet page, report builder page, dataset, or dataflow outputs. For pages, forms and queues are included and separated from cards.
- **Get Card Pages** - Shows where cards on an object live. For pages, shows all other pages not including the current page that contain cards that also exist on the current page. For datasets and dataflows, shows all pages and app studio pages containing cards that use the dataset or dataflow outputs as a source.
- **Get Child Pages** - For pages, shows all child and grandchild pages.
- **Get DataSets** - Shows datasets for an object, including inputs and outputs datasets for dataflows, dependent views for datasets, and all datasets used in cards on a page or app.
- **Get DataSets Used in View** - For dataset views and datafusions, see the underlying source datasets that feed into the view.

All discovery lists support applicable actions like open all, copy ID, share with self, open lineage, open in views explorer, and remove from page. Items are grouped hierarchically or categorically with expand/collapse, counts, direct links, and IDs on hover.

### Card Error Tracking

Card API errors are automatically captured as you browse. Click the Card Errors button to view them in the side panel with full response details. Errors are tracked per tab and cleared when you navigate away from a card. View error count at a glance, expand individual errors to see the full JSON response, and clear all errors with one click.

### Object-Specific Actions

- **Lineage** - Open a full-page lineage graph for datasets and dataflows. Traces upstream and downstream dependencies with dataset previews and dataflow tile operations directly in the graph. Supports dark mode.
- **Copy Filtered URL** - Copy URL with all applied filters on a card, page, or app studio page (Pfilters).
- **Export Data** - Export card data in CSV or Excel format, including applied filters (can be done from a card modal!). Export code engine package versions as JavaScript/Python files.
- **Data Repair** - Open the hidden data repair tab for any dataset.
- **Update Owner** - Change ownership of alerts and workflows with a searchable user picker and a "Set to Self" shortcut.
- **Update DataFlow Details** - Edit a dataflow's name and description without creating a new version.
- **Update Code Engine Versions** - Bulk update workflow code engine actions to the latest version in a single click, without unmapping inputs and outputs.
- **Lock Cards** - Lock all cards on a page, app studio page, dataset, worksheet, report builder report, or all dataflow outputs.
- **Set DataSet Schedule to Manual** - Set a dataset's schedule to manual.
- **Fix Empty String Filters** - Remove empty string default values from "contains" quick filters on cards, so null values display when no value is entered instead of being filtered out.

### Custom Favicons

Customize favicons per Domo instance using regex-based rules:

- **Instance Logo** - Use the instance's own logo as the favicon
- **Colored Domo Logo** - Custom background color on the Domo logo
- **Colored Stripes** - Add a colored stripe to the top, right, bottom, or left edge
- **Regex Patterns** - Match instance subdomains with flexible patterns
- **Priority Ordering** - Drag-and-drop rule ordering

### Side Panel & Popup

- **Popup** - Click the extension icon for quick access
- **Side Panel** - Persistent panel alongside the page for data discovery, with collapsible actions. Opens automatically from the popup when displaying discovery results.

Both show the current context (instance, object type, object ID) and update as you navigate.

### Settings

- **Theme** - System, light, or dark mode
- **Default Domo Instance** - Set your go-to instance for clipboard navigation from non-Domo sites
- **Cookie Clearing Behavior** - Choose between auto, preserve, or all modes
- **Favicon Rules** - Rule editor with pattern matching, effect selection, color picker, and drag-and-drop reordering

## Supported Object Types

Pages, cards, datasets, dataflows, app studio apps (and their pages), worksheets (and their pages), workspaces, users, groups, alerts, workflows (including versions, executions, triggers, and actions), code engine packages (and versions), pro-code apps, beast modes, variables, access tokens, appdb collections, approvals, approval templates, jupyter workspaces, filesets, files, forms, governance toolkit jobs and dozens more.

## Privacy

- Only runs on `.domo.com` domains
- Uses Domo's existing authenticated session - no additional login required
- No data leaves the browser; no external servers are contacted
- Settings sync via Chrome's built-in storage
- Domo data is never read, stored, or sent off-device

See the full [Privacy Policy](./PRIVACY_POLICY.md) for details.

## Contributing

Interested in contributing? See [CONTRIBUTING](./CONTRIBUTING.md) for the tech stack, architecture, development setup, code conventions, and key patterns.

## Issues & Feedback

Found a bug or have a feature request? [Open an issue](https://github.com/brycewc/domo-toolkit/issues).
