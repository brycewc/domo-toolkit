# Domo Toolkit v1.3.0 Release Notes (WIP)

> Version bumped from 1.2.1 → 1.3.0 due to scope of new features.

## New Features

### Migrate Downstream Content (Datasets)

- New "Migrate Downstream Content" action button on datasets — finds every card, dataset view, and dataflow that uses the in-scope dataset as an input and rewires their input to a new dataset
- Discovery uses Domo's lineage API (no DomoStats setup required) plus the dataset's cards endpoint
- Sidepanel view mirrors the Transfer Ownership UX: every found item is pre-selected, with checkboxes on both type groups and individual items so the user can deselect entire categories or cherry-pick
- Target dataset picker uses async typeahead search with paginated load-more
- Schema-compatibility check runs as soon as a target is picked — surfaces missing/type-mismatched columns inline; the Migrate button switches to "Proceed Anyway" so the user has to confirm before transferring through a known-incompatible target
- Per-type progress reported live in the sidepanel rows; failures expose the underlying error message
- Dataset-view input-swap recurses through SQL `selectBody` (joins, set operations), updates column `referenceDataSourceId` references, rewrites `formattedExpression` mappings, then does a final string sweep — the same hardened logic from the original CLI tool

### Off-boarding: Transfer Ownership

- Transfer ownership of all object types from one user to another
- Select which object types to include in the transfer
- Preview what needs to be (or can be) transferred beforehand, with object counts shown on mount
- Option to delete the user after a successful transfer
- Option to email the recipient with an Excel attachment listing everything transferred (types + IDs)
- Quick button to transfer ownership to the user's manager (uses `reportsTo` from user context)
- Clicking Transfer Ownership now opens the OwnershipView directly into selection mode (no modal popup) with every eligible type pre-checked; a Select all / Deselect all toggle button appears under the header actions for quick bulk-selection changes

### View Ownership by User

- View everything a given user owns, grouped by object type
- Shares much of its functionality with Transfer Ownership
- Virtualized list for fast rendering of large ownership results

### Duplicate (Clone) User

- Clone an existing user — copies all access, group membership, and user configuration
- Just change the name and email; everything else carries over
- (Consider renaming the button to "Clone")

### Direct Sign-On

- New Direct Sign-On button

### Update Object Details

- Generalized "Update Dataflow Details" into a generic component that works for any object type
- Newly supports datasets (used to update `userDefinedType`)
- Interface moved from a modal to a view

### Delete Object Improvements

- Lists the object's dependencies (child pages, output datasets, downstream cards) before confirming the delete — collapsible groups so even objects with many dependents stay scannable
- Dependencies are grouped into a "Will be deleted" section (items the primary delete also removes) and an "Other dependencies" section (items affected but not deleted) so the relationship is clear without per-item parentheticals
- All page types (regular pages, app pages, worksheet pages) list the cards that will be deleted with them; app and worksheet pages also list their sibling pages (deleted only via the cascade button) so the user can see the full impact of either path
- Pages with child pages are now hard-blocked from deletion (with the reason shown inline) instead of just warning after the fact
- Items in dependency lists are sorted alphabetically
- Status alerts (loading, error, no-deps, dependency-check-not-available) use proper Alert components for consistent styling
- Output datasets of a dataflow no longer show non-functional Share / Share-All buttons (those datasets have no account to share); group headers in the dependency list (e.g., "Output datasets", "Cards on this page", "Cards using these output datasets") also no longer show a non-functional Share-All since cards aren't shareable in the toolkit's share-with-self sense
- Output dataset rows in the dependency list now expose Lineage and Open in Views Explorer actions alongside Copy ID, so users can investigate before confirming the delete
- Interface moved from a modal to a view, consistent with Update Object Details
- Worksheet pages are now deletable (previously the primary delete button was disabled for them)
- The "Delete app and all cards" cascade option for app pages is now a visible button inside the view (previously hidden behind a long-press on the trigger)

### Object Details: Lazy Related-Data Tabs

- Context footer for PAGE / DATA_APP_VIEW / WORKSHEET_VIEW objects now includes a "Datasets" tab — loads on tab click, shows the raw `dataSources` API response for inspection and copy, with each dataset linked to its details page
- DATA_SOURCE objects now include a "Columns" tab — lazy-loads the dataset's column schema (id, name, type, etc.) for inspection and copy
- Tab label uses a `(...)` placeholder during fetch and updates to `(N)` once the count is known
- Renamed `relatedObjects` → `relatedData` on DomoObjectType to reflect that entries can now be plain data (e.g., dataset columns) without a navigable type/id
- General infrastructure supports lazy-loaded arrays as related data (any future tab can opt in by adding a `fetcher` key on its `relatedData` entry); items without `itemTypeId`/`itemIdField` render as plain JSON without URL injection

### Activity Log: DomoStats Dataset Source

- Activity Log can now pull records from a DomoStats "Activity Log" dataset, giving access beyond the audit API's ~1-year retention window
- Retention warning banner at the top of the Activity Log page communicates the API's retention limit and offers the DomoStats option inline
- "Use DomoStats" button auto-discovers the right dataset (queries all `dataProviderType=domostats` datasets, then bulk-checks stream configs for `report=audit`); the dataset ID is cached locally per instance so subsequent uses skip discovery
- Per-instance "Always use DomoStats Activity Log dataset" toggle in the source banner and the Settings page — when enabled, Activity Log opens in DomoStats mode by default for that instance
- Active-source banner is now an Alert in all states (warning on API, success on DomoStats, danger on dataset error) so the visual treatment doesn't shift when you flip sources
- Stale dataset ID (deleted or no longer accessible) shows a soft error with a one-click "Re-run discovery" recovery action
- New "Per-Instance Settings" section on the Settings page to view, manage, and clear stored per-Domo-instance values (currently just Activity Log dataset configuration)
- Multi-tab consistency: toggling the preference in any open Activity Log tab or on the Settings page updates everywhere via `chrome.storage.onChanged`
- Timestamp column sort is now server-side on DomoStats — toggling direction triggers a refetch from offset 0, so ascending sort starts with the oldest available events and pagination loads progressively newer ones. On the API source the timestamp column keeps its prior client-only sort (re-orders already-loaded rows), unchanged from previous releases
- Source-specific columns: on DomoStats the Description column is replaced with a "Source" column showing the actor's `Source_ID`, `Name`, and `Type` (USER / SYSTEM / ETL etc.) — the dataset has no Description equivalent but does carry actor info the audit API doesn't expose. The User column on DomoStats shows the underlying `User_ID` and the toolkit looks up the user's display name on demand via the bulk users API

## Newly Supported Object Types

- Certification Process (recognized objects + Navigate to Copied Object)
- AI Toolkits and AI Agents in the AI Library (registered objects + URL detection)
  - TODO: Navigate to Copied Object, Transfer Ownership, View Ownership

## API Error Tracking Expansion

- Expanded from just cards to all object types
- Also tracks non-object errors (e.g., list pages) — shows all errors
- ApiErrors count now rendered as a soft-danger chip
- General UI refinements to ApiErrorsView
- Not fully done yet, maybe some UI changes

## UI/UX Changes

- Dropped mobile breakpoints for the extension UI — buttons are smaller with less padding, overall more desktop-sized (side panel and popup were too large before because they inherited mobile styles)
- Activity Log: filter by multiple users _(not fully working yet)_
- New `ObjectTypeIcon` component renders in DataListView for visual object-type identification
- CopyFilteredUrl: count moved next to the label; button relabeled "Copy Filters"
- Toast messages now truncate at max-height (was growing unbounded for long text)
- Code Engine Package Version: default copy action now copies the parent Code Engine Package ID (via new `copyConfigs` on DomoObjectType)
- Tooltips added to all action buttons
- Current context header truncates when chips are too large
- Update Code Engine Versions: built-in Domo packages restricted to upgrade-to-latest only (no downgrades or intermediate versions); built-ins are labeled with a "Built-in" chip
- DataList components sort items alphabetically by default (no longer rely on source order)
- DataFlow icon swapped to `IconArrowFork` (rotated to a "merge into one" shape) — the previous icon was near-symmetric and looked the same with or without rotation
- Tabs opened from the popup or side panel (Activity Log, Lineage, Settings, Release Notes "View Details") now open immediately to the right of the launching tab instead of at the end of the tab strip
- View Ownership and Transfer Ownership are now a single Ownership view; clicking Transfer Ownership opens a destination-picker modal that floats on top of the underlying object list, so the source data stays visible during the transfer and per-type rows transition spinner → check/X as each transfer completes. Both side-panel buttons (Get Owned Objects / Transfer Ownership) launch the merged view; the latter auto-opens the modal
- Selection mode in DataList: a header toggle replaces row action slots with checkboxes for selectable items. First use is the new Ownership view's type picker; the same primitive will support future bulk-edit features (e.g. transferring cards between datasets) without re-implementing the pattern
- DataList header redesigned to surface primary actions inline instead of behind a three-dots Popover: close button is now an absolute-positioned sibling of the title (HeroUI canonical pattern), title is a single line, and subtext + action buttons share a second row. All actions render inline; the IconDots collapse is gone. Affects every DataList view (Pages, Cards, Datasets, Delete Object dependencies, View Inputs, Ownership)

## Bug Fixes and Improvements

- Removed duplicate icon in the alternate/additional actions menu for Copy
- Fixed side panel state not syncing when two separate browser windows were open (windows didn't share focus, so state wouldn't update on one and would overwrite on the other)
- Fixed detection issues caused by the URL-lowercasing change:
  - Code Engine route with capitalized "Engine" broke some detection logic
  - Card ID detection broke when "I" was capitalized
- Fixed Navigate to Copied Object incorrectly identifying Pages as App Studio apps
- Fixed Delete button not showing its normal tooltip for objects that have additional options (verified)
- ID validation added to current object detection
- Navigate to Copied Object: templates and certification processes (which share an API endpoint) are no longer mistaken for each other — discriminated by the response's `type` field (`AC` → Template, otherwise → Certification Process)
- Fixed `getOwnedGroups` returning items with `id: undefined` because the API payload uses `groupId` (not `id`); also fixed its strict-equals filter `o.id === userId` (string vs number) which was zeroing out every match — now compares as strings and requires `type === 'USER'`
- Fixed `getOwnedProjectsAndTasks` always returning empty: the `/api/content/v2/users/.../projects` endpoint now responds with `{_metadata, projects: [...]}` instead of a flat array, so `data.length` was always undefined
- Fixed Ownership view crash ("Could not determine key for item") via the architectural rewrite — the merged view uses TanStack Virtual through DataList instead of HeroUI's React-Aria-based ListBox. Project and task IDs are namespaced (`project-<id>` / `task-<id>`) at the leaf level via DataListItem's new `originalId` field so colliding numeric IDs no longer collide while clipboard copy still yields the canonical raw ID

## Security

- CodeQL remediation: tightened URL matching; scoped GitHub Actions permissions

## Docs / GitHub Pages Site

- Local development setup for the docs site
- Dark mode support on the GitHub Pages site

## Refactoring

- Various internal refactors for extensibility and code quality (not user-facing)
- Removed `allObjects.js`; dispatch functions moved to per-domain files (e.g., `share.js`) and domain logic extracted into service files
- `DomoObjectType` now uses an objects-object argument for cleaner configuration
- `DataList` shareability replaced with an allow-list (`SHAREABLE_TYPES`) plus a recursive `hasShareableChildren` check; group-level `unshareable: true` opt-outs in `dependencies.js` removed since the recursive rule subsumes them
- New `usePerInstanceSettings` hook for per-Domo-instance settings stored in `chrome.storage.local` — generic shape, reusable beyond Activity Log; subscribes to `chrome.storage.onChanged` so consumers stay in sync without re-reading
- New `useParallelFetches` hook consolidates the `Promise.allSettled` + per-key state machine that was open-coded in five-plus views (`GetOwnedObjects`, `TransferOwnership`, `SyncJSDocFromSource`, etc.). Returns `{ results, isFullyLoaded, errorCount, loadingCount, refresh }` with per-key streaming updates so progressive UI is the default. Used by the new Ownership view; future Get-All-Dependencies and similar parallel-fetch views slot in by passing a different spec list
- DataList items now support optional `status` (`'loading' | 'loaded' | 'transferring' | 'transferred' | 'error' | 'failed'`) and `error` fields on virtual parents — DataList renders a spinner / X icon in the count slot and surfaces the error inside the body when expanded. Same field powers both fetch progress and transfer progress; non-virtual-parent rows ignore it. New `originalId` field on DataListItem lets consumers namespace `id` for uniqueness while preserving the canonical id for clipboard copy
