# Domo Toolkit v1.3.1 Release Notes (WIP)

## UI Improvements

- Removed pulsing effect on Copy Filters button, as it was distracting more than it added value
- Fixed action buttons growing vertically when their label wrapped onto two lines — buttons now stay at a consistent height and the label wraps inside
- Activity Log Source column (DomoStats path): `USER` chips stay accent and `GROUP` chips are now success-green; any other source type (`SYSTEM`, `ETL`, etc.) hashes to a stable color so each type is visually distinct but consistent across rows

## New Features

### Migrate Downstream Content (Datasets)

- New "Migrate Downstream Content" action button on datasets — finds every card, dataset view, and dataflow that uses the in-scope dataset as an input and rewires their input to a new dataset
- Discovery uses Domo's lineage API (no DomoStats setup required) plus the dataset's cards endpoint
- Sidepanel view mirrors the Transfer Ownership UX: every found item is pre-selected, with checkboxes on both type groups and individual items so the user can deselect entire categories or cherry-pick
- Target dataset picker uses async typeahead search with paginated load-more
- Schema-compatibility check runs as soon as a target is picked — surfaces missing/type-mismatched columns inline
- **Column remapper for incompatible schemas**: when the target's schema doesn't fully cover the origin, the modal scans every selected card / dataset view / dataflow for column references and surfaces only the columns that are BOTH actually used by the selected content AND missing from the target. Each surfaced column gets a per-row dropdown of target columns, defaulting to "Leave unmapped" — no auto-suggestions, the user picks each mapping deliberately. The same mapping applies consistently across every piece of content powered by the dataset.
- **Robust column-reference rewriter**: applies the user's column map at three levels — JSON object keys at known column-keyed paths (`columnFormats`, `columnInfo`), plain string values at known column-bearing fields (`column`, `leftColumn`, `groupBy`, etc., plus column-list arrays), and backtick-wrapped column refs inside expression strings (formulas, SQL clauses, `formattedExpression`). Card definitions that get column rewrites are PUT through the full card-update endpoint instead of the lightweight datasource-swap shortcut.
- Strong inline warnings throughout the schema-mismatch flow — best-practice text reminding the user to align schemas before migration, and that broken column references can cause cards to render blank, dataflows to fail, and views to error
- Per-type progress reported live in the sidepanel rows; failures expose the underlying error message
- Dataset-view input-swap recurses through SQL `selectBody` (joins, set operations), updates column `referenceDataSourceId` references, rewrites `formattedExpression` mappings, then does a final string sweep — the same hardened logic from the original CLI tool
- Drill cards on each parent card are also migrated when their content uses the in-scope dataset: discovered via the bulk `parts=drillPath,drillPathURNs` endpoint, fetched with their own datasource metadata, and rewired alongside the parent so drill-down paths don't break after the swap
