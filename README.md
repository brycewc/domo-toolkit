# Domo Toolkit

Power tools for Domo administrators. Stop wasting time navigating menus, managing hundreds of identical browser tabs, copying DataSet IDs from the URL, and constantly clearing your cookies.

Domo Toolkit is a Chrome extension built for the people who live inside Domo every day -- administrators managing hundreds of objects, consultants jumping between client instances, and power users building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations.

## Installation

### Chrome Web Store

[https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj?authuser=0&hl=en](https://chromewebstore.google.com/detail/domo-toolkit/gagcendhhghphglhcgjakkkocbliekaj?authuser=0&hl=en)

### Edge Add-ons

[https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk](https://microsoftedge.microsoft.com/addons/detail/domo-toolkit/bkhnonmfkljenhejgboholmhginiiipk)

### Manual Install (from source)

Power tools for Domo administrators. Stop wasting time navigating menus, managing hundreds of identical browser tabs, copying DataSet IDs from the URL, and constantly clearing your cookies.

Domo Toolkit is a Chrome extension built for the people who live inside Domo every day -- administrators managing hundreds of objects, consultants jumping between client instances, and power users building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations.

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

git clone https://github.com/brycewc/domo-toolkit.git
cd domo-toolkit
yarn # or: npm install
yarn build # or: npm run build

```

1. Navigate to `chrome://extensions/` or `edge://extensions`
1. Navigate to `chrome://extensions/` or `edge://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist` directory

## Issues & Feedback

Found a bug or have a feature request? [Open an issue](https://github.com/brycewc/domo-toolkit/issues) on GitHub. An issue is just a post describing what bug you ran into or what you'd like to see -- no coding or technical knowledge required. You'll need a free GitHub account to create one. Include as much detail as you can (what you were doing, what happened, what you expected) and I'll take it from there.

## Features

### Context Detection

Automatically detects the Domo object you're viewing -- Pages, Cards, DataSets, DataFlows, App Studio Pages, Workflows, Alerts, and 100+ other object types. The extension:

- Identifies the object and fetches metadata from the Domo API
- Detects card modals and resolves parent objects for nested types (e.g. App Studio Pages)
- Updates the tab title with the object's name
- Provides one-click access to the object's full JSON definition

### Automatic 431 Error Resolving

Handles Domo's "Request Header Fields Too Large" errors with three cookie clearing modes:

- **Auto** (default) -- Detects 431 errors, clears cookies (preserving your last 2 active instances), and refreshes the page automatically
- **Preserve** -- One-click clearing that keeps your last 2 instances
- **All** -- Clears all Domo cookies while leaving other sites and history intact

### One-Click Actions

- **Copy ID** -- Copy the current object's ID. Long-press for related IDs like Stream ID (DataSets) or Studio App ID (App Studio Pages). Keyboard shortcut: `Ctrl+Shift+1` (`Cmd+Shift+1` on Mac).
- **Share With Self** -- Grant yourself access to Pages, Studio Apps, and Custom App designs.
- **Delete Current Object** -- Delete Beast Modes, AppDB Collections, Workflows, and Pages/App Studio Pages including their Cards. Includes confirmation dialog and child Page safety checks.
- **Activity Log** -- View activity log records for the current object. Long-press for advanced options: view activity for all Cards on the current object, or for all Pages containing those Cards.
- **Clipboard Navigation** -- Copy any Domo object ID from anywhere -- a Card, DataSet, spreadsheet, Slack message, or support ticket -- and navigate to it. The extension identifies the object type, fetches its name, and builds the URL. For objects that don't support navigation, detailed information is displayed in the side panel instead.

### Data Discovery

Opens in the side panel for persistent exploration without losing your place.

- **Get Cards** -- Lists every Card on a Page, App Studio Page, Worksheet Page, Report Builder Page, or DataSet. Supports opening all in new tabs.
- **Get Pages** -- Shows where objects are used. For Pages: child and grandchild Pages in a hierarchical tree. For App Studio Pages: all Pages within the app, grouped by parent. For Cards: every Page, App Studio Page, and Report Builder Page where the Card appears. For DataSets: full downstream trace from DataSet to Cards to Pages.
- **Get DataSets** -- Traces data lineage. For Pages: every DataSet powering Cards on the Page. For DataFlows: input and output DataSets. For DataSet Views and DataFusions: underlying source DataSets.

All discovery lists support open all, copy ID, share all, and refresh. Items are grouped hierarchically with expand/collapse, counts, direct links, and IDs on hover.

### Object-Specific Actions

- **Copy Filtered URL** -- Copy URL with all applied filters on a Card, Page, or App Studio Page (Pfilters).
- **Data Repair** -- Open the hidden data repair tab for any DataSet.
- **Update Owner** -- Change ownership of Alerts and Workflows with a searchable user picker and a "Set to Self" shortcut.
- **Update DataFlow Details** -- Edit DataFlow names and descriptions without creating a new version.

### Custom Favicons

Customize favicons per Domo instance using regex-based rules:

- **Instance Logo** -- Use the instance's own logo as the favicon
- **Colored Domo Logo** -- Custom background color on the Domo logo
- **Colored Stripes** -- Add a colored stripe to the top, right, bottom, or left edge
- **Regex Patterns** -- Match instance subdomains with flexible patterns
- **Priority Ordering** -- Drag-and-drop rule ordering

### Side Panel & Popup

- **Popup** -- Click the extension icon for quick access
- **Side Panel** -- Persistent panel alongside the page for data discovery, with collapsible actions. Opens automatically from the popup when displaying discovery results.

Both show the current context (instance, object type, object ID) and update as you navigate.

### Settings

- **Theme** -- System, light, or dark mode
- **Default Domo Instance** -- Set your go-to instance for clipboard navigation from non-Domo sites
- **Cookie Clearing Behavior** -- Choose between auto, preserve, or all modes
- **Card Error Detection** -- Toggle inline error notifications for card API failures
- **Favicon Rules** -- Rule editor with pattern matching, effect selection, color picker, and drag-and-drop reordering

## Supported Object Types

Pages, Cards, DataSets, DataFlows, App Studio Apps/Pages, Worksheets, Report Builder, Users, Groups, Alerts, Workflows, Code Engine Packages, Pro-code Apps, Beast Modes, Variables, Access Tokens, AppDB Collections, Approvals, Approval Templates, Drill Paths, Jupyter Workspaces, FileSets, Files, Forms, and dozens more. Each type supports URL pattern detection, ID validation, and API-based metadata enrichment.

## Privacy

- Only runs on `.domo.com` domains
- Uses Domo's existing authenticated session -- no additional login required
- No data leaves the browser; no external servers are contacted
- Settings sync via Chrome's built-in storage
- Domo data is never read, stored, or sent off-device

See the full [Privacy Policy](docs/PRIVACY_POLICY.md) for details.

## Contributing

Interested in contributing? See [CONTRIBUTING.md](CONTRIBUTING.md) for the tech stack, architecture, development setup, code conventions, and key patterns.
```
