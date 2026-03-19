# Domo Toolkit v1.1.0 Release Notes

## Enhanced DataFlow Support

DataFlows now support:

- **Get Cards** - lists all cards powered by a dataflow's output datasets
- **Get Card Pages** - finds every page where cards from a dataflow's outputs appear
- **Activity Log** - view activity log for child cards or the pages those cards live on for dataflows
- **Delete** - delete a dataflow and its output datasets

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

## Robustness Improvements

- **Tab resilience** - lineage viewer, activity log, and data discovery views now recover gracefully when the original Domo tab is closed, automatically finding another open tab on the same instance
- **Get Card Pages from popup** - fixed Get Card Pages failing when launched from popup on cards and datasets
- **Worksheet support** - added worksheets to Share With Self
- **Variable support** - added variables to Delete Current Object (same behavior as Beast Modes)

## Other Changes

- Add a quick action to set dataset streams schedule to manual
- **Refresh button** added to clipboard navigation alternate actions
- Filtered out negative page IDs from activity log child pages
- Fixed stale related objects in context footer when switching between objects
