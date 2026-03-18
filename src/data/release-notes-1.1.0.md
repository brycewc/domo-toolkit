# Domo Toolkit v1.1.0 Release Notes

## Pipeline Lineage Viewer

A full-page interactive lineage visualization for datasets and dataflows. Trace upstream and downstream dependencies across your entire data pipeline.

- **Visual pipeline graph** with automatic layout using dagre, showing datasets and dataflows as connected nodes
- **Expandable depth** - start with 4 levels and expand frontiers on demand with prefetching for instant expansion
- **ETL Inspector** - click any dataflow node to inspect its Magic ETL tiles with search and virtual scrolling
- **Data Preview** - click any dataset node to preview its data in a resizable table with column sorting
- **Caching** - lineage data and dataset previews are cached across interactions so re-visiting nodes is instant
- **Launch from anywhere** - available as a button on datasets and dataflows, and as an inline action on every dataset row in Get DataSets and Get DataSets Used in View results

## Dataflow Support

Dataflows are now first-class citizens across all data discovery features:

- **Get Cards** - lists all cards powered by a dataflow's output datasets
- **Get Card Pages** - finds every page where cards from a dataflow's outputs appear
- **Get DataSets** - shows input and output datasets grouped separately
- **Activity Log** - view activity for a dataflow, its child cards, or the pages those cards live on
- **Delete** - delete a dataflow and its output datasets with confirmation
- **Update Details** - edit dataflow name and description without creating a new version

## Permission Gating

Actions are now enabled or disabled based on your actual permissions, so you only see what you can do:

- **Dataflow actions** gated by permission mask (view, execute, edit, share levels)
- **Share With Self** gated by `content.admin` (pages, cards, apps, worksheets), `account.admin` (data sources), or `app.admin` (custom apps)
- **Delete** gated by ownership, admin rights, or object-specific permissions (e.g. workflow ADMIN/DELETE permission)
- **Activity Log** gated by `audit` permission
- **Ownership detection** computed during context enrichment, supporting plain IDs, typed owners, group owners, and pre-computed booleans across all object types

## User and Group Caching

- Current user and group memberships are now cached per Domo instance for the session instead of re-fetched on every page navigation
- Cache automatically invalidates when navigating to auth pages (logout/login)
- Failed fetches are not cached, so the next navigation retries automatically
- User data is sourced exclusively from `window.bootstrap` to ensure `USER_RIGHTS` are always available for permission checks

## Robustness Improvements

- **Tab resilience** - lineage viewer, activity log, and data discovery views now recover gracefully when the original Domo tab is closed, automatically finding another open tab on the same instance via a new `useResolveTabId` hook
- **Get Card Pages from popup** - fixed CARD and DATAFLOW_TYPE failing when launched from the popup by eliminating the 10-second polling timeout in favor of direct API calls
- **Get Pages from popup** - fixed datasets not working when launched from popup
- **Worksheet support** - added WORKSHEET to Share With Self and permission gating
- **Variable support** - added VARIABLE to Delete Current Object (same behavior as beast modes)

## Other Changes

- **Set to Manual** for dataset streams
- **Refresh button** added to clipboard navigation alternate actions
- Filtered out negative page IDs from activity log child pages
- Fixed stale related objects in context footer when switching between objects
- Fixed lock icon display on lineage graph nodes
- Lazy loading of dagre library for lineage (reduces initial bundle)
- Removed `@tanstack/react-table` dependency in favor of HeroUI Table
