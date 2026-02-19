Domo Toolkit — Power Tools for Domo Administrators
Stop wasting time navigating menus, managing hundreds of identical browser tabs, copying DataSet IDs from the URL, and constantly clearing your cookies. Domo Toolkit is designed for the people who live inside Domo every day — administrators managing hundreds of objects, consultants jumping between client instances, and power users building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations. Whether you're creating, updating, troubleshooting, auditing, or cleaning, Domo Toolkit puts the tools you need one click away.
DISCLAIMER: This extension is an independent, community-developed project. Domo, Inc. has no responsibility for its functionality or performance or for any consequences arising from its use.
INSTANT CONTEXT DETECTION
Domo Toolkit automatically detects what you're looking at. Navigate to any Page, card, DataSet, dataflow, App Studio Page, workflow, alert, or any of 100+ supported Domo object types — the extension immediately identifies it, enriches it with metadata from the Domo API, and makes relevant actions available. No manual input required. The extension even detects card modals, resolves parent objects for nested types like App Studio Pages, and updates your tab title with (or back to) the object's name for easier tab management. And with a click, you can explore the object's full JSON definition.
AUTOMATIC 431 ERROR RESOLVING
Domo's 431 "Request Header Fields Too Large" errors are a constant headache when working across multiple instances. Domo Toolkit offers three cookie clearing modes:
Auto (default): Automatically detects 431 errors, clears cookies (preserving your last 2 active instances), and refreshes your page instantaneously–it's like it never happened.
Preserve: One-click clearing that preserves your last 2 instances.
All: One-click clearing of all your Domo cookies, while maintaining all other websites and your history.
ONE-CLICK ACTIONS
A compact toolbar gives you instant access to the operations you use most:
Copy ID — Copy the current object's ID to your clipboard instantly. Long-press for additional IDs like Stream ID (for DataSets) or Studio App ID (for App Studio Pages).
Share With Self — Instantly grant yourself access to Pages, Studio Apps, and Custom App designs. No more navigating through admin content tables.
Delete Current Object — Delete Beast Modes, AppDB Collections, Workflows, Approval Templates, and Pages/App Studio Pages and all their Cards — with a confirmation dialog and child Page safety checks.
Copy Filtered URL - Copy URL with all applied filters on a Card, Page, or App Studio Page (Pfilters).
Data Repair — Open the hidden data repair tab for any DataSet with a single click.
Update Owner — Change the owner of Alerts and Workflows with a searchable user picker and a quick "Set to Self" button.
Update DataFlow Details — Edit DataFlow names and descriptions without creating a new version.
DATA DISCOVERY — SEE HOW EVERYTHING CONNECTS
Understanding dependencies across your Domo environment is critical. Domo Toolkit's discovery features open in a persistent side panel so you can explore relationships without losing your place:
Get Cards — See every card on a Page, App Studio Page, Worksheet Page, Report Builder Page, or DataSet. Open them all in new tabs with one click.
Get Pages — Discover where things are used:
For Pages: View all child Pages and grandchild Pages in a hierarchical tree and view the other pages cards live on.
For App Studio Pages: See all Pages within the app, grouped by parent app.
For Cards: Find every Page, App Studio Page, and Report Builder Page where a card lives.
For DataSets: Trace all the way from DataSet → Cards → Pages to see the full downstream impact.
Get DataSets — Trace data lineage:
For Pages and App Studio Pages: See every DataSet powering Cards on the Page.
For DataFlows: View input and output DataSets, grouped separately.
For DataSet Views and DataFusions: See the underlying source DataSets.
Every discovery list supports open all (open every item in new tabs), copy ID, share all (share all objects with yourself), and refresh. Items are grouped hierarchically with expand/collapse, counts, direct links, and IDs on hover.
CLIPBOARD-POWERED NAVIGATION
Copy any Domo object ID — from a Card, DataSet, spreadsheet, Slack message, support ticket, anywhere else — and navigate to it with one click. Domo Toolkit identifies the object type, fetches its name, and builds the URL to navigate to.
Keyboard shortcut: Ctrl+Shift+1 (Cmd+Shift+1 on Mac) to trigger clipboard detection.
ACTIVITY LOG INTEGRATION
View activity log records for the current object with the click of a button. Long-press for advanced options:
View activity for all Cards on the current object.
View activity for all Pages containing Cards from the current object.
CUSTOM FAVICONS FOR MULTI-INSTANCE MANAGEMENT
If you work across multiple Domo instances, tab management is a nightmare — every tab has the same Domo favicon and same "Domo" tab title. Domo Toolkit automatically sets the tab title to the right object and lets you customize favicons with regex rules:
Instance Logo: Use the instance's own logo as the favicon.
Colored Domo Logo: Change the background of the Domo logo with a custom color.
Colored Stripes: Add a colored stripe to the top, right, bottom, or left edge of the favicon.
Regex Patterns: Match instance subdomains with flexible patterns.
Priority Ordering: Drag and drop to set rule priority.
SIDE PANEL & POPUP
Access Domo Toolkit in two ways:
Popup: Click the extension icon–there when you need it, gone when you don't.
Side Panel: Open a persistent panel alongside your webpage for data discovery, with collapsible action buttons so the panel stays compact when you need more space. Opens automatically from popup for displaying data discovery features as a list.
Both interfaces show the current context (instance, object type, and object ID) and update automatically as you navigate.
SETTINGS
Theme: System, light, or dark mode.
Default Domo Instance: Set your go-to instance for clipboard navigation from non-Domo sites.
Cookie Clearing Behavior: Choose between auto, preserve, or all modes.
Favicon Rules: Full rule editor with pattern matching, effect selection, color picker, and drag-and-drop reordering.
100+ SUPPORTED OBJECT TYPES
Domo Toolkit recognizes and works with virtually every object type in Domo:
Pages, Cards, DataSets, DataFlows, App Studio Apps/Pages, Worksheets, Report Builder, Users, Groups, Alerts, Workflows, Code Engine Packages, Pro-code Apps, Beast Modes, Variables, Access Tokens, AppDB Collections, Approvals, Approval Templates, Drill Paths, Jupyter Workspaces, FileSets, Files, Forms, and dozens more.
Each type has URL pattern detection, ID validation, and API integration for metadata enrichment.
PRIVACY & PERMISSIONS
Domo Toolkit only runs on .domo.com domains. It uses Domo's existing authenticated session for API calls — no additional login required, no data leaves your browser, and no external servers are contacted. All extension settings sync via Chrome's built-in storage. And all your Domo data is never read, stored, or sent off your device.
