---
permalink: /index.html
---

# Domo Toolkit

Power tools for Domo administrators. Stop wasting time navigating menus, managing hundreds of identical browser tabs, copying dataset IDs from the URL, and constantly clearing your cookies.

Domo Toolkit is a Chrome extension built for the people who live inside Domo every day - administrators managing hundreds of objects, consultants jumping between client instances, and power users building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations.

## Disclaimer

This extension is an independent, community-developed project. Domo, Inc. has no responsibility for its functionality or performance or for any consequences arising from its use.

## Installation

### Chrome Web Store

[https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj?authuser=0&hl=en](https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj?authuser=0&hl=en)

### Edge Add-ons

[https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk](https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk)

### Manual Install (from source)

```bash
git clone https://github.com/brycewc/domo-toolkit.git
cd domo-toolkit
yarn          # or: npm install
yarn build    # or: npm run build
```

1. Navigate to `chrome://extensions/` or `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

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

- **Copy ID** - Copy the current object's ID. Long-press for related IDs like stream ID (datasets) or studio app ID (app studio pages). Keyboard shortcut: `Ctrl+Shift+1` (`Cmd+Shift+1` on Mac).
- **Share With Self** - Grant yourself access to pages, studio apps, and custom app designs.
- **Delete Current Object** - Delete beast modes, appdb collections, workflows, and pages/app studio pages including their cards. Includes confirmation dialog and child page safety checks.
- **Activity Log** - View activity log records for the current object. Long-press for advanced options: view activity for all cards on the current object, or for all pages containing those cards.
- **Clipboard Navigation** - Copy any Domo object ID from anywhere - a card, dataset, spreadsheet, Slack message, or support ticket - and navigate to it. The extension identifies the object type, fetches its name, and builds the URL. For objects that don't support navigation, detailed information is displayed in the side panel instead.

### Data Discovery

Opens in the side panel for persistent exploration without losing your place.

- **Get Cards** - Lists every card, form, and queue on a page, app studio page, worksheet page, report builder page, or dataset. Items are grouped by type when a page contains multiple kinds. Supports opening all in new tabs.
- **Get Pages** - Shows where objects are used. For pages: child and grandchild pages in a hierarchical tree. For app studio pages: all pages within the app, grouped by parent. For cards: every page, app studio page, and report builder page where the card appears. For datasets: full downstream trace from dataset to cards to pages.
- **Get DataSets** - Traces data lineage. For pages: every dataset powering cards on the page. For dataflows: input and output datasets. For any dataset: all dependent datasets (views and fusions built on top of it) via the lineage API.
- **Get DataSets Used in View** - For dataset views and datafusions, see the underlying source datasets that feed into the view.

All discovery lists support open all, copy ID, share all, and refresh. Items are grouped hierarchically with expand/collapse, counts, direct links, and IDs on hover.

### Card Error Tracking

Card API errors are automatically captured as you browse and displayed in a dedicated side panel view with full response details. Errors are tracked per tab and cleared when you navigate away from a card. View error count at a glance, expand individual errors to see the full JSON response, and clear all errors with one click.

### Object-Specific Actions

- **Copy Filtered URL** - Copy URL with all applied filters on a card, page, or app studio page (Pfilters).
- **Export Data** - Export card data in CSV or Excel format, including applied filters. Export code engine packages as JavaScript/Python files.
- **Data Repair** - Open the hidden data repair tab for any dataset.
- **Update Owner** - Change ownership of alerts and workflows with a searchable user picker and a "Set to Self" shortcut.
- **Update DataFlow Details** - Edit dataflow names and descriptions without creating a new version.
- **Fix Empty String Filters** - Remove empty string default values from "contains" quick filters on cards, so null values display instead of being filtered out.

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

Pages, cards, datasets, dataflows, app studio apps/pages, worksheets, workspaces, report builder, users, groups, alerts, workflows, code engine packages, pro-code apps, beast modes, variables, access tokens, appdb collections, approvals, approval templates, drill paths, jupyter workspaces, filesets, files, forms, governance toolkit jobs and dozens more. Each type supports URL pattern detection, ID validation, and API-based metadata enrichment.

## Privacy

- Only runs on `.domo.com` domains
- Uses Domo's existing authenticated session - no additional login required
- No data leaves the browser; no external servers are contacted
- Settings sync via Chrome's built-in storage
- Domo data is never read, stored, or sent off-device

See the full [Privacy Policy](./PRIVACY_POLICY.md) for details.

## Contributing

Interested in contributing? See [CONTRIBUTING.md](./CONTRIBUTING.md) for the tech stack, architecture, development setup, code conventions, and key patterns.

## Issues & Feedback

Found a bug or have a feature request? [Open an issue](https://github.com/brycewc/domo-toolkit/issues).
