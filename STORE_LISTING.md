Majordomo Toolkit — Power Tools for Domo Administrators
Stop wasting time navigating menus, hunting for object IDs, and manually clearing cookies. Majordomo Toolkit is a Chrome extension built specifically for Domo power users, administrators, and consultants who need faster, smarter ways to manage their Domo environment.
Whether you're troubleshooting a broken dashboard, auditing dataset usage, or managing multiple Domo instances, Majordomo Toolkit puts the tools you need one click away.
INSTANT CONTEXT DETECTION
Majordomo Toolkit automatically detects what you're looking at. Navigate to any page, card, dataset, dataflow, app studio page, workflow, alert, or any of 100+ supported Domo object types — the extension immediately identifies it, enriches it with metadata from the Domo API, and makes relevant actions available. No manual input required.
The extension even detects card modals, resolves parent objects for nested types like App Studio pages, and updates your tab title with the object's name for easier tab management.
ONE-CLICK ACTIONS
A compact toolbar gives you instant access to the operations you use most:
Copy ID — Copy the current object's ID to your clipboard instantly. Long-press for additional IDs like Stream ID (for datasets), App ID (for App Studio pages), or Worksheet ID.
Share With Self — Instantly grant yourself access to datasets, pages, apps, and custom app designs. No more navigating through share dialogs.
Delete Current Object — Delete pages (including all their cards), app studio pages, access tokens, beast mode formulas, AppDB collections, workflows, and more — with a confirmation dialog and child page safety checks.
Clear Cookies — Domo's 431 "Request Header Fields Too Large" errors are a constant headache when working across multiple instances. Majordomo Toolkit offers three cookie clearing modes:
Auto: Automatically detects 431 errors and clears cookies on the spot, preserving your last 2 active instances so you stay logged in where it matters.
Manual: One-click clearing that preserves your last 2 instances.
All: Nuclear option — clears every Domo cookie.
Data Repair — Open the hidden Data Repair page for any dataset with a single click.
Update Owner — Change the owner of Alerts and Workflows with a searchable user picker and a quick "Set to Self" button.
Update DataFlow Details — Edit DataFlow names and descriptions without navigating away.
DATA DISCOVERY — SEE HOW EVERYTHING CONNECTS
Understanding dependencies across your Domo environment is critical. Majordomo Toolkit's discovery features open in a persistent side panel so you can explore relationships without losing your place:
Get Cards — See every card on a page, app studio page, worksheet view, report builder view, or dataset. Open them all in new tabs with one click.
Get Pages — Discover where things are used:
For Pages: View all child pages and grandchild pages in a hierarchical tree.
For App Studio Pages: See all pages within the app, grouped by parent app.
For Cards: Find every page, app studio page, and report builder page where a card appears.
For Datasets: Trace all the way from dataset → cards → pages to see the full downstream impact.
Get Datasets — Trace data lineage:
For Pages and App Studio Pages: See every dataset powering cards on the page.
For DataFlows: View input and output datasets, grouped separately.
For Dataset Views and DataFusions: See the underlying source datasets.
Every discovery list supports Open All (open every item in new tabs), Copy ID, Share All (share all pages with yourself), and Refresh. Items are grouped hierarchically with expand/collapse, counts, and direct links.
CLIPBOARD-POWERED NAVIGATION
Copy any Domo object ID — from a spreadsheet, a Slack message, a support ticket, anywhere — and Majordomo Toolkit detects it automatically. It identifies the object type, fetches its name, and lets you navigate directly to it. Works across instances using your configured default instance, so you can jump to objects even from non-Domo websites.
Keyboard shortcut: Ctrl+Shift+1 (Cmd+Shift+1 on Mac) to trigger clipboard detection.
ACTIVITY LOG INTEGRATION
Jump straight to the activity log filtered by the current object. Long-press for advanced options:
View activity for all cards on the current page or dataset.
View activity for all pages containing cards from the current object.
The extension automatically applies the correct filters when the activity log page loads.
CUSTOM FAVICONS FOR MULTI-INSTANCE MANAGEMENT
If you work across multiple Domo instances, tab management is a nightmare — every tab has the same Domo favicon. Majordomo Toolkit lets you customize favicons per instance with configurable rules:
Instance Logo: Use the instance's own logo as the favicon.
Colored Domo Logo: Tint the Domo logo with a custom color.
Colored Stripes: Add a colored stripe to the top, right, bottom, or left edge of the favicon.
Regex Patterns: Match instance subdomains with flexible patterns.
Priority Ordering: Drag and drop to set rule priority.
Instantly distinguish between production, staging, and development instances at a glance.
SIDE PANEL & POPUP
Access Majordomo Toolkit two ways:
Popup: Click the extension icon for quick actions.
Side Panel: Open a persistent panel alongside any Domo page for data discovery, with collapsible action buttons so the panel stays compact when you need more space.
Both interfaces show the current context (instance, object type, object ID, and name) and update automatically as you navigate.
SETTINGS
Theme: System, Light, or Dark mode.
Default Domo Instance: Set your go-to instance for clipboard navigation from non-Domo sites.
Cookie Clearing Behavior: Choose between Auto, Manual, or All modes.
Favicon Rules: Full rule editor with pattern matching, effect selection, color picker, and drag-and-drop reordering.
100+ SUPPORTED OBJECT TYPES
Majordomo Toolkit recognizes and works with virtually every object type in Domo:
Pages, Cards, Datasets, DataFlows, App Studio Apps, App Studio Pages, Worksheet Views, Report Builder Views, Users, Groups, Alerts, Workflows, Custom Apps (Designs), Beast Mode Formulas, Access Tokens, AppDB Collections, Approvals, Approval Templates, Variables, Drill Paths, and dozens more.
Each type has URL pattern detection, ID validation, and API integration for metadata enrichment.
BUILT FOR POWER USERS
Majordomo Toolkit is designed for the people who live inside Domo every day — administrators managing hundreds of objects, consultants jumping between client instances, and developers building on the platform. Every feature is built to save clicks, reduce context-switching, and surface information that Domo's native UI buries behind multiple navigations.
PRIVACY & PERMISSIONS
Majordomo Toolkit only runs on .domo.com domains. It uses Domo's existing authenticated session for API calls — no additional login required, no data leaves your browser, and no external servers are contacted. All settings sync via Chrome's built-in storage.
