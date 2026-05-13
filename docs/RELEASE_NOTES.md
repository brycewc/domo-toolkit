# Domo Toolkit v1.3.0 Release Notes

## New Features

### Icon Update

- Replaced Tabler icons with Domo's official icon set across the entire extension for visual consistency with the Domo platform

### Off-boarding: Transfer Ownership

- Transfer ownership of all object types from one user to another
- Select which object types to include in the transfer
- Preview what needs to be (or can be) transferred beforehand, with object counts shown on mount
- Option to delete the user after a successful transfer
- Option to email the recipient with an Excel attachment listing everything transferred (types + IDs)
- Quick button to transfer ownership to the user's manager (uses `reportsTo` from user context)

### View Ownership by User

- View everything a given user owns, grouped by object type
- Shares much of its functionality with Transfer Ownership
- Virtualized list for fast rendering of large ownership results

### Duplicate (Clone) User

- Clone an existing user — copies all access, group membership, and user configuration
- Just change the name and email; everything else carries over

### Direct Sign-On

- New Direct Sign-On button makes it easy to jump to the manual password sign-in when it has been hidden

### Update DataSet Details

- Update a dataset's user defined type

### Delete Object Improvements

- Interface moved from a modal to a view, consistent with Update Object Details
- Lists the object's dependencies (child pages, output datasets, downstream cards) before confirming the delete — collapsible groups so even objects with many dependents stay scannable
- Dependencies are grouped into a "Will be deleted" section (items the primary delete also removes) and an "Other dependencies" section (items affected but not deleted) so the relationship is clear
- All page types (regular pages, app pages, worksheet pages) list the cards that will be deleted with them; app and worksheet pages also list their sibling pages (deleted only via the cascade button) so the user can see the full impact of either path
- Dataflow deletes list output datasets and cards built on those datasets
- Pages with child pages are now hard-blocked from deletion (with the reason shown inline) instead of just warning after the fact
- Worksheet pages are now deletable (previously the primary delete button was disabled for them)
- The "Delete app and all cards" cascade option for app pages is now a visible button inside the view (previously hidden behind a long-press on the trigger)

### Object Details: New Related-Data Tabs

- Context footer for page, app studio page, and worksheet page objects now includes a "Datasets" tab — loads on tab click, shows the raw `dataSources` API response for inspection and copy, with each dataset linked to its details page
- DataSet objects now include a "Columns" tab — lazy-loads the dataset's column schema (id, name, type, etc.) for inspection and copy

### Activity Log: DomoStats Dataset Source

- Activity Log can now pull records from a DomoStats Activity Log dataset, showing data beyond the audit API's \~1-year retention window
- Retention warning banner at the top of the Activity Log page communicates the API's retention limit and offers the DomoStats option inline
- "Use DomoStats" button auto-discovers the right dataset (queries all `dataProviderType=domostats` datasets, then bulk-checks stream configs for `report=audit`); the dataset ID is cached locally per instance so subsequent uses skip discovery
- Per-instance "Always use DomoStats Activity Log dataset" toggle in the source banner and the Settings page — when enabled, Activity Log opens in DomoStats mode by default for that instance
- New "Per-Instance Settings" section on the Settings page to view, manage, and clear stored per-Domo-instance values (currently just Activity Log dataset configuration)

### Activity Log: Multiple Users Filter (Issue #70)

- New multi-select user filter in the Activity Log. Select multiple users to see their combined activity in one view
- Thank you dlc3-personal for the suggestion

### Copy Color Rules (Conditional Formats)

- New action button on datasets — copy a dataset's color rules to another dataset in one click
- Per-rule column references are validated against the destination's schema; missing columns show as a warning but the user can still proceed
- Beast Mode (calculated column) references are name-matched between source and destination — when both datasets have a Beast Mode with the same name, the rule's `calculation_<uuid>` reference is rewritten to the destination's id at copy time so rules keep working across datasets that have equivalent calculations
- If the destination already has color rules, a warning callout makes it clear the existing rules will be replaced (PUT semantics)
- Saves the back-and-forth of recreating identical rule sets across datasets, which Domo's UI offers no copy path for

### Cancel Stuck Stream Update

- New "Cancel Run" action button on datasets — appears whenever the dataset's stream has an execution in `ACTIVE` state
- Fills a gap where Domo's UI shows the "Storing…" indicator indefinitely with no recovery affordance — previously a stuck connector run blocked every subsequent scheduled update with "there is already an update running", forcing a support ticket

### Sync JSDoc to Code Engine Package

- New action button on Code Engine packages: derives the package manifest (function names, parameter names, types, descriptions) from JSDoc in the source and updates the package definition to match
- Shows a structural diff against the current manifest before updating, so added, changed, and removed functions/parameters are explicit before you confirm
- Saves the manual work of keeping the manifest in sync with JSDoc — previously authors had to edit both surfaces and keep them aligned by hand
- Also serves as a quick way to update the package definition to match the code after edits, without needing to do all the tedious manual edits in the UI

### Cookie Clearing Settings

- Split the single cookie clearing behavior setting into three independent controls: auto-clear on 431 errors (on/off), show manual cookie button (on/off), and manual button behavior (preserve last 2 instances/clear all)
- Previously the three options were coupled, so users had to choose between automatic clearing OR a manual button — never both. Auto-clearing occasionally fails, and some users want to clear cookies when no 431 has occurred; both pain points are addressed by letting the auto behavior and the manual button coexist
- Existing users are migrated to settings that exactly preserve their prior behavior (Auto → auto on, button hidden; Preserve → auto off, button on, behavior preserve; All → auto off, button on, behavior all)

## Newly Supported Object Types

- Certification Processes
- AI Toolkits and AI Agents in the AI Library

## API Error Tracking Expansion

- Expanded from just cards to all API errors

## Behavior Changes

- Code Engine Package Version: default copy action now copies the parent Code Engine Package ID
- Card: long-press Copy menu now offers a "Copy DataSet ID" action when the card is powered by exactly one dataset
- Get Cards: long-press menu on app/worksheet pages now offers a "Get App Cards" / "Get Worksheet Cards" alternate action — lists every card, form, and queue across all views on the parent app/worksheet, grouped by page so the same card appearing on multiple pages shows under each
- Get Card Pages: long-press menu on app/worksheet pages now offers a "Get App Card Pages" / "Get Worksheet Card Pages" alternate action — aggregates every card across all views on the parent and lists the other pages those cards live on (pages inside the same app/worksheet are excluded since "other" is the point)
- Update Code Engine Versions: built-in Domo packages restricted to upgrade-to-latest only (no downgrades or intermediate versions); built-ins are labeled with a "Built-in" chip
- Tabs opened from the popup or side panel (Activity Log, Lineage, Settings, Release Notes "View Details") now open immediately to the right of the launching tab instead of at the end of the tab strip
- Navigate to Copied Object: a copied stream ID now resolves to (and navigates to) its associated dataset
- Share with Self (dataset): now shares all accounts wired to the dataset's stream in a single click (Domo recently added multi-account support to streams); falls back to the legacy single `accountId` on the dataset for unmigrated streams
- Copy → Account ID (dataset): prefers the stream's accounts list (single-account case only) with fallback to the dataset's legacy `accountId`; hidden when the stream pulls from more than one account (multi-account IDs are still inspectable via the JSON context footer)
- Dataset context footer: the "Account" related-data tab lists all accounts wired to the stream when present, otherwise renders the legacy single account from the dataset

## UI Changes

- Dropped mobile breakpoints for the extension UI — buttons are smaller with less padding, overall more desktop-sized (side panel and popup inherited mobile styles before because their screen size is too small for desktop style breakpoints)
- Added an object icon next to each item in data discovery views for visual object-type identification
- Copy Filtered Url: count moved next to the label; button relabeled "Copy Filters"
- Toast messages now truncate at max-height (was growing unbounded for long text)
- Tooltips added to all action buttons
- Current context header truncates when chips are too large
- Data discovery view header redesigned to surface primary actions inline instead of behind a three-dots popover
- New reload button in the data discovery view header to rerun the action for the current object (now different from the object the view was launched from)
- Get Pages (card → other pages) view now shows a subtext row with the total number of pages and the total number of distinct cards (from the source object) appearing on them
- Navigate to Copied Object's "Manual selection" list no longer shows "Goal" twice — the old `OBJECTIVE` type alias is now merged into `GOAL`
- Navigate to Copied Object dropdown items: each entry now leads with the object-type icon, and the action icon (external-link or sidepanel) is right-aligned after the label

## Bug Fixes and Improvements

- Removed duplicate icon in the alternate/additional actions menu for Copy
- Fixed side panel state not syncing when two separate browser windows were open (windows didn't share focus, so state wouldn't update on one and would overwrite on the other)
- Fixed detection issues caused by the URL-lowercasing change:
  - Code Engine route with capitalized "Engine" broke some detection logic
  - Card ID detection broke when "I" was capitalized
  - AppDb collection detection broke when "D" was capitalized
- Fixed Navigate to Copied Object incorrectly identifying Pages as App Studio apps
- Fixed Share with Self not refreshing the popup/side panel context after the share — the popup was closing before the tab reload finished, killing the listener that triggers the context refresh
- ID validation added to current object detection
- Navigate to Copied Object: templates and certification processes (which share an API endpoint) are no longer mistaken for each other — discriminated by the response's `type` field (`AC` → Template, otherwise → Certification Process)
- Navigate to Copied Object: manually picking a sidepanel-only type from the "Manual selection" list now fetches its details before opening the sidepanel, so the view actually shows data instead of an empty card
- Various internal refactors for extensibility and code quality (not user-facing)

## Docs / GitHub Pages Site

- Local development setup for the docs site
- Dark mode support on the GitHub Pages site
