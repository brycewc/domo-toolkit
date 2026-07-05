# Repair a broken dataset view's missing columns

## Context

A dataset view can silently break when one of its **source** datasets renames or
drops a column that the view's definition still references. Domo's own UI shows
only `Invalid column(s) referenced` and gives no way to point the view at the
replacement column; the view is stuck erroring on every query-preview until
someone hand-edits its definition.

This is exactly the case in front of us. View `de3e6b29-b7c7-4126-a937-ac53249ee481`
is a UNION over two datasets. Its first branch reads column `ca_parentid` from
source `7b30c32a-931d-4fca-a648-e3128297b080`, but that source no longer has
`ca_parentid` (532 columns; nearest matches `l_utm_campid_parentid` /
`l_utm_campid_parentname`). Every `POST /api/query/v1/execute/query-preview`
returns `400 ib:4100` with `details.columns: ["ca_parentid"]`.

The extension already knows how to rewrite a view's column references (this powers
Remap Columns and Migrate Content), and the API Errors panel already captures the
missing-column list. What's missing is a path that repairs the **open view's own**
definition rather than the content downstream of a dataset.

Per the user's direction, this ships as an **extension of the existing Remap
Columns feature**, not a separate view: Remap Columns learns to (1) find broken
column references inside the open view itself, and (2) offer, per broken column,
either a **remap** to a valid source column or a **drop** of the column from the
view, using downstream usage to steer that choice.

## Confirmed facts (from live inspection of the broken view)

- The broken reference lives at `select.selectBody.fromItem.selectBody.selects[0].selectItems[319].expression.columnName === "ca_parentid"`, table alias `7b30c32a-...\_`, plus the mirrored copy under `viewTemplate.select...`. Branch 1 at the same position is `CAST(NULL AS STRING)` aliased `ca_parentid` (a null-fill; not broken).
- `ca_parentid` is **not** in the view's output (249 output columns; outer projection selects a subset of the 508 inner UNION columns and does not include it). So for this view, dropping it is safe. In the general case a broken column may be an output column, which is where downstream-usage steering matters.
- `findOriginAliases(def, "7b30c32a...")` resolves the branch alias `7b30c32a...\_`, so the existing conservative rewriter targets exactly the broken ref and leaves the output alias (`alias.name`) untouched (`alias.name` is not in the rewrite field registry). A remap therefore keeps the view's output columns stable.

## Approach

Extend `RemapColumnsView` so that when the open `DATA_SOURCE` is a view
(`isViewType`), it runs a **second detection axis** alongside the existing
downstream scan, and adds a per-column **remap-or-drop** choice that the apply
step routes to the right engine.

### 1. Detect the view's own broken input references (new)

Only when the open object is a view (`isViewType(context.domoObject.metadata)`, `src/services/datasets.js:629`):

- Fetch the view definition once via `fetchDatasetViewDefinition` (already used by the scanner; consider exporting it from `src/services/columnReferences.js:541`, or reuse `getDatasetColumns`'s fetch).
- Enumerate the view's source datasets with `getDatasetsForView` (`src/services/datasets.js:366`).
- For each source `S`:
  - Fetch `S`'s current columns via the existing `fetchDatasetSchemaColumns` helper (`src/services/columnReferences.js:526`; export it) - this is both the diff baseline and the replacement-candidate list for `S`.
  - Collect the view's references to `S`, **scoped by `S`'s aliases**, and diff against `S`'s live columns. The scoping must mirror the rewriter: reuse `findOriginAliases` (currently non-exported in `src/services/columnRewriter.js:257` - export it) plus a small alias-scoped collector modeled on `walkDatasetViewConservative` (`columnRewriter.js:611`) that records `columnName` only when the sibling `table.name` is an `S` alias, plus `referencedColumnName` and origin-scoped backticked refs. Fusion views use `extractFusionViewColumnRefs(def, S)` (`columnReferences.js:217`), which is already alias-scoped.
  - `brokenForSource(S)` = referenced-from-`S` columns not present in `S`'s live schema.

This yields, per broken column: the column name, the owning source `S` (drives the rewrite's `originId` and the candidate list), and the output column it produces (its `selectItems[].alias.name`, for downstream-usage steering).

### 2. Overlay the captured API errors (corroboration + seed)

Read the tab's captured errors with `chrome.runtime.sendMessage({ tabId, type: 'GET_API_ERRORS' })` (background store, `src/background.js:1516`). For each error, `JSON.parse(error.response)` and pull `details.columns` when `errorCode === 'ib:4100'` (also handle the `exceptions` shape). Cross-check `error.url`/current view id. Use these to pre-select the matching broken rows and to show a "Domo reported these as invalid" note, and to surface any column that appears only in a raw SQL expression string that the structured walk under-attributes. Detection does **not** depend on an error being present.

### 3. Steer remap vs drop with downstream usage

The existing downstream scan (`scanContentForColumns`, `columnReferences.js:297`) already runs on the open object and yields `byColumn` (who uses each of the view's output columns). For each broken column that is also an **output** column of the view, if downstream content uses that output column -> recommend **Remap** (dropping it would break that content); if unused, or the broken column is an internal-only UNION column (like `ca_parentid` here, never projected) -> **Drop** is safe and offered as the default.

### 4. Apply

- **Remap** a broken view column: call the existing executor with origin === target === the source dataset and `viewId` = the open view:
  - Template/SQL view: `swapDatasetViewInput({ viewId, columnMap: { [broken]: replacement }, originId: S, targetId: S, targetColumnTypes: <S's types>, cachedDefinition: <view def>, tabId })` (`src/services/migrateDownstreamContent.js:565`).
  - Fusion view: `swapFusionInput({ fusionId: viewId, columnMap, originId: S, targetId: S, targetColumnTypes, tabId })`.
  - This reuses `rewriteDatasetViewColumns` (`columnRewriter.js:136`) including UNION cast alignment and type propagation, then PUTs via `putDatasetViewInPage`/`putFusionInPage`. Group broken columns by source `S` and call once per `S`, since the rewrite is origin-scoped.
- **Drop** a broken view column: new service `dropDatasetViewColumns(viewDefinition, columnsToDrop)` in `src/services/columnRewriter.js` (sibling to the existing `removeCardColumns`, `columnRewriter.js:57`). It removes, by output name / alias, the matching `SELECT_EXPRESSION_ITEM` from **every** UNION branch at the same position (to keep branches position-aligned), from the outer projection `selectItems`, from `tables[].columns[]`, and from the `viewTemplate` mirror + `fromItemInfo` palette entry. For `ca_parentid` here that means removing `selectItems[319]` from both inner branches and the mirror (it is absent from the ledger/outer projection already). Write back with the same `putDatasetViewInPage` body shape (`{ dataProviderType: null, dataSourceName, schema, trigger: {} }`, `migrateDownstreamContent.js:991`). Fusion drop = remove the output key from each `views[].mapping`. A dropped column is skipped in the remap `columnMap`.

### 5. UI (within RemapColumnsView)

- Keep the existing two-page flow. On the map page, add a **"Repair this view"** section (rendered only for views with broken self-refs) listing one row per broken view column. Each row is either:
  - **Remap** - a `RemapRow`-style pair whose "new column" ComboBox lists the owning source `S`'s live columns (fuzzy-suggesting the nearest match, e.g. `l_utm_campid_parentid`), tagged with `S`'s name and a `broken` chip; or
  - **Drop** - a toggle/segmented control per row switching that column to drop, enabled with a safe/unsafe hint from step 3 (disabled with a tooltip when downstream content still needs the output column).
- Fix the early-bail so a broken view with no downstream content still opens: `nothingDownstream` (`RemapColumnsView.jsx:203`) must not bail when the open object is a view with broken self-refs.
- Apply runs both paths: the view self-repair (remaps grouped per source + drops via the new helper) and the existing downstream `remapDatasetColumns` for any downstream rows, reporting per-section progress through the existing `transferStatus`/`onProgress` plumbing.
- Header/labels: the view already carries a `beta` flag and `IconColumnEdit`; reuse them. Widen the intro copy so it covers "repair this view" as well as downstream remap.

## Files

- `src/components/views/RemapColumnsView.jsx` - add view self-repair detection, the "Repair this view" section, remap/drop rows, apply wiring, and the bail fix.
- `src/services/columnReferences.js` - export `fetchDatasetViewDefinition` and `fetchDatasetSchemaColumns`; add the alias-scoped per-source broken-ref collector for template views (fusion reuses `extractFusionViewColumnRefs`).
- `src/services/columnRewriter.js` - export `findOriginAliases`; add `dropDatasetViewColumns`.
- `src/services/datasets.js` - reuse `getDatasetsForView`, `getDatasetColumns`, `isViewType` (no change expected).
- New service for reading captured errors, or an inline `chrome.runtime.sendMessage({ type: 'GET_API_ERRORS' })` call plus an `ib:4100` parser (mirror the shape handled in `src/components/views/ApiErrorsView.jsx:171`).
- No change to `getAvailableActions` - `remapColumns` is already offered for every `DATA_SOURCE` (`src/utils/availableActions.js:66`).

## Verification

1. `npx eslint --no-warn-ignored` on every edited `.js`/`.jsx` file (required by `code-style.md`).
2. Dev loop per `local-testing.md`: the CRXJS dev extension (already running) hot-reloads the side panel. There is no `/dev-*` route for the side panel, so drive the real flow in the loaded extension.
3. End-to-end on the actual broken view (`de3e6b29-...`), reusing the current Playwriter session and the maintainer's authenticated Chrome:
   - Confirm detection surfaces exactly `ca_parentid` attributed to source `7b30c32a...`, with `l_utm_campid_parentid` suggested, and that the API-error overlay flags the same column.
   - **Remap path**: map `ca_parentid` -> `l_utm_campid_parentid`, apply, then re-run `POST /api/query/v1/execute/query-preview` for the view and confirm it returns `200` (no `ib:4100`), and that the view's output columns are unchanged.
   - **Drop path** (on a copy, since it is destructive): drop `ca_parentid`, re-run query-preview, confirm `200` and that the inner UNION no longer references the dropped column in `/schema/indexed`.
   - Because these PUTs edit live content and cannot be undone, do the first write against a throwaway duplicate of the view, verified via Playwriter, before running against the real one.
4. Update `docs/RELEASE_NOTES.md` per `wip-release-notes.md` with a user-facing bullet (e.g. "Remap Columns can now repair a view that is broken by a renamed or removed source column, either by pointing it at the new column or dropping it.").
