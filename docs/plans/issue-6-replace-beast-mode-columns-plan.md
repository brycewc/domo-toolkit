---
published: false
---

# #6: Find and Replace Columns in Beast Modes Bulk

Status: **decided**. This is the plan for [#6](https://github.com/brycewc/domo-toolkit/issues/6), written 2026-11-20 against branch `2.0.0`, with every open decision settled by the maintainer on 2026-11-23. Cross-issue decisions (`DX.*`), the shared infrastructure, the landing order across issues, and the pre-existing bugs found while planning live in [open-issues-plan.md](open-issues-plan.md).

API claims in this plan carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

## Summary

**Problem.** When a column is renamed, retired or superseded (`Region` replaced by `Sales Region`, `Amount` by `Net Amount`), someone has to open and edit every Beast Mode formula that names the old column. A widely used column can sit in dozens of Beast Modes across many datasets and cards. On domo.domo.com a read-only scan found **84 Beast Modes on 24 datasets** that reference `Region`. **47 of the 84 are saved to a card** rather than to the dataset, and two spellings appear, `Region` (52) and `region` (32).

**Who benefits.** Dataset owners and admins who restructure schemas, people consolidating duplicate datasets, and anyone getting ready for an upstream column rename.

**Interpretations considered.**

1. **Replace the column reference in Beast Mode formulas, on one or many datasets or across the instance (chosen).** The user finds a column by name, optionally scoped to one or more datasets, and replaces every reference to it with another column name in the formulas of the Beast Modes that use it. Both dataset Beast Modes and card Beast Modes are covered.
2. **Rename the column on the dataset, then repair everything.** Not planned. Domo's UI already renames columns, and Remap Columns already repairs a dataset's downstream content once a rename leaves broken references.
3. **General text find and replace inside formulas** (function names, literals). Not planned. That is a different and riskier tool. The matcher stays token-based, so it could be added later.
4. **Also rewrite cards, dataflows and views across many datasets.** Not planned (D6.8). The issue names Beast Modes, and the per-dataset cross-type rewrite already exists in Remap Columns.

**Prerequisites** (D6.1). #6 starts once beta phases 1.2 (`batchWithFallback`, `withRetry`), 1.3 (`createRunJournal`, Recent Runs) and 1.6 (`useRunLock`) have all landed, and is built on them directly.

The issue says "a sidepanel function instead of in the floating button". The floating button is the popup: `ActionButtons` renders in both `src/popup/App.jsx:74` and `src/sidepanel/App.jsx:597`. The new button therefore shows in both, and a popup press opens the side panel through `launchView` (`src/utils/sidepanel.js`, which calls `openSidepanel()` right away to keep the user gesture). The view itself lives only in the side panel, as the issue asks.

## Scope check

**Can a user already do this easily in Domo's UI? No.** Confirmed from Domo's frontend bundle (`datacenter-dae408ae508144b9.chunk.built.js`, the Data Center Beast Mode Manager):

- **Search filters:** name, dataset, card, owner, type (dataset or card), active or inactive, locked, archived, invalid, nested, and "using calculation" (`templateDependencies`). None of them filters by the columns a formula references, and the bundle never sends the API's `column` filter.
- **Bulk actions** (`dcBeastModeBulkService`, gated on the `beast-mode-bulk-update` switch and Content Admin, capped at 100 selected): lock, unlock, change owner, duplicate to dataset, archive, unarchive, delete. None of them edits a formula.
- **Formula edits** happen one Beast Mode at a time, in the Beast Mode Manager editor or in Analyzer.

Both halves are new: finding the Beast Modes that use a column, and editing them all at once. Nothing is cut.

**What already exists in this codebase that overlaps** (re-checked for this pass):

| File                                                                                                                                                                 | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Gap or reuse                                                                                                                                                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/services/columnRewriter.js` `rewriteBeastModeColumns(template, columnMap)`                                                                                      | Deep-clones and walks the template. `expression` goes through `rewriteExpressionString` (BACKTICK_REF_RE via `replaceExpressionRefs`, so comments and string literals are skipped). `columnPositions[].columnName` is rewritten by the plain COLUMN_VALUE_FIELDS branch (case 3 of `walkAndRewriteColumns`), since `columnPositions` is not in COLUMN_LIST_FIELDS. `rewriteColumnName` handles the backticked form. The template's own top-level `name` is never touched (only `name` under a column-list parent). | Reused as is. Lookup is `columnMap[colName]`, an exact match, so the caller builds the map from the spellings it actually found.                                   |
| `src/services/columnFields.js` `eachExpressionRef`, `BACKTICK_REF_RE`, `QUALIFIED_REF_RE` (line 149)                                                                 | Comment- and string-aware reference iteration; the qualified pattern captures `` `table`.`col` ``.                                                                                                                                                                                                                                                                                                                                                                                                                 | Reused for matching. The qualified pattern detects data model refs.                                                                                                |
| `src/services/columnRewriter.js` `rewriteScopedExpressionString` (line 767, private)                                                                                 | Rewrites `` `alias`.`col` `` refs only for known aliases.                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Not used in v1, since data model Beast Modes are left out (see Design). It is the starting point if they come in later.                                            |
| `src/services/columnReferences.js` `fetchDatasetSchemaColumns`                                                                                                       | Reads `schemas/latest`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Reused to check targets. Returns 0 columns for a data model (VERIFIED-LIVE), one more reason data models are excluded.                                             |
| `src/utils/datasetTypes.js` `isDataModelType(details)`                                                                                                               | `dataProviderType === 'data-model'` on a datasources response.                                                                                                                                                                                                                                                                                                                                                                                                                                                     | Reused to flag data model datasets from the bulk details read.                                                                                                     |
| `src/utils/columnOrphans.js` `indexColumnNames`, `resolveColumnName`                                                                                                 | Case-insensitive column resolution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | Reused for target checks.                                                                                                                                          |
| `src/utils/columnMatching.js` `suggestReplacement`                                                                                                                   | Remap Columns' best-guess replacement.                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Reused to pin a suggested Replace option at the top of the list.                                                                                                   |
| `src/utils/beastModeLinks.js` `beastModeSaveTarget`, `datasetIdFromBeastModeLinks`                                                                                   | Card or drill save target; owning dataset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Reused for grouping and the starting scope.                                                                                                                        |
| `src/services/remapDatasetColumns.js` `remapBeastModes`, private `buildBeastModeUpdateEntry` (line 124)                                                              | Remap Columns' Beast Mode phase: one dataset, orphaned columns only, a single `updateDatasetFunctions` call (line 249).                                                                                                                                                                                                                                                                                                                                                                                            | Single dataset, repair only. Its save path is **not** changed by #6 (that is beta 1.2 step 6). Only its private four-field strip is swapped for the shared helper. |
| `src/services/migrateBeastModeUsage.js` `buildNestingUpdateEntry` (line 135), private `describeBeastModeUpdateError` (line 204), `updateDatasetFunctions` (line 351) | Repoints one Beast Mode's usage. Holds a second copy of the four-field strip, and translates `ILLEGAL_DEPTH` and "Function links cannot be updated" into user copy.                                                                                                                                                                                                                                                                                                                                                | The error translator moves to `functions.js` and is exported for reuse. Save path not changed.                                                                     |
| `src/services/migrateDownstreamContent.js` (line 2299)                                                                                                               | Writes Beast Modes in one `updateDatasetFunctions` call inside a try/catch that already pushes one error per write. Entries come from `buildBeastModeEntry(..., { overwriteOf })`.                                                                                                                                                                                                                                                                                                                                 | Not touched. Its fallback is beta 1.2's job.                                                                                                                       |
| `src/services/functions.js`                                                                                                                                          | `getDatasetFunctionsForDatasets` (dataset Beast Modes only), `getCardBeastModes` (line 372) and `getBeastModesSavedOnCard` (line 306) (card Beast Modes), `findUnusedFunctions`, `hydrateFunctionTemplates` (drops failed reads silently), `transferFunctions` (page-side chunks of 100), `updateDatasetFunctions` (throws for the whole batch, no `status`).                                                                                                                                                      | Four copies of the same paged `functions/search` loop already exist. #6 adds one general page function rather than a fifth copy (see Design).                      |
| `src/components/views/RemapColumnsView.jsx`, `src/components/buttons/RemapColumns.jsx`                                                                               | Dataset action that maps broken references. Uses `src/assets/icons/column-edit.svg`.                                                                                                                                                                                                                                                                                                                                                                                                                               | Cannot replace a column that still exists, cannot span datasets. The new button needs a different icon.                                                            |
| `GetBeastModesView.jsx`, `ColumnUsagesModal.jsx`                                                                                                                     | Read-only Beast Mode and column-usage lists.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | List patterns reused.                                                                                                                                              |
| `DeleteUnusedBeastModesView.jsx` (line 221)                                                                                                                          | Batches of 50, a failed batch retried one id at a time; locked rows start unselected.                                                                                                                                                                                                                                                                                                                                                                                                                              | The pattern beta 1.2 generalizes into `batchWithFallback`.                                                                                                         |
| `src/components/SqlBlock.jsx`                                                                                                                                        | Prism-highlighted SQL with a case-insensitive substring `query` highlight.                                                                                                                                                                                                                                                                                                                                                                                                                                         | Gets a small whole-identifier highlight prop (see Design).                                                                                                         |

## API and platform findings

All live calls went to domo.domo.com. Tags: VERIFIED-LIVE (called and saw the response), VERIFIED-CODE (already used in `src/` the same way), SPEC-ONLY, INFERRED.

**1. Search Beast Modes:** `POST /api/query/v1/functions/search`. VERIFIED-LIVE and VERIFIED-CODE.

```json
{
  "filters": [{ "field": "dataset", "idList": ["<uuid>"] }, { "field": "notvariable" }],
  "limit": 1000,
  "offset": 0,
  "sort": { "ascending": true, "field": "created" }
}
```

- Leave out `dataset` to search the whole instance: `totalHits: 94338`, `hasMore`, `degraded: false`. `limit: 1000` pages through all of it in 95 pages. The search returns nothing without a `sort` (documented in `findUnusedFunctions`, VERIFIED-CODE).
- Result keys (VERIFIED-LIVE): `activeLinks, archived, certificationStatus, created, dataType, global, id, lastModified, legacyId, links, locked, name, owner, status`. **No `expression`.** Each link carries `resource {type, id}`, `visible`, `active`, `valid`.
- Exactly one `DATA_SOURCE` link per result (5,000 sampled). On a card Beast Mode that link is `visible: false`, and the card or drill is the visible link (`beastModeSaveTarget`, VERIFIED-CODE).
- **No server-side column filter works.** Valid filter types (from a 400): `active, archived, beastmode, card, column, created, dataset, datatype, function, global, inactive, legacyid, legacyidList, link, locked, modified, name, nested, noowner, notNested, notarchived, notglobal, notvariable, owner, status, templateDependencies, unlocked, variable`. Sixteen payload shapes for `column` (`value`, `idList`, `name`, `columnList`, `resources[]`, `<dsid>:<col>`, wildcard and others) left `totalHits` unchanged. VERIFIED-LIVE. Matching has to happen on the client.
- `certificationStatus` instance distribution (full scan, VERIFIED-LIVE): absent 70,986, `PENDING` 11,989, `EXPIRED` 11,363, `CERTIFIED` 0. Domo's datacenter bundle builds `certification = e.certification || { state: e.certificationStatus }` and branches on `NOT_CERTIFIED`, `EXPIRED`, `CERTIFIED`, `PENDING` and `REQUESTED`, so all five are real states. 6 of the 84 `Region` hits are `PENDING`.
- `locked`: 116 Beast Modes instance-wide, 0 of the 84 `Region` hits.

**2. Bulk expression read:** `POST /api/query/v1/functions/template/expressions`, body `[177, 182, 183]`, response `[{ "id": 182, "expression": "case\n    when `last_touch_channel` = 'Organic Search' then '..." }]`. VERIFIED-LIVE: 1,000 ids in about 220 ms. Domo's datacenter bundle calls it. Not in the OpenAPI spec, not yet used in `src/`.

**Scan cost.** A serial run of 95 pages (search plus expressions, all expressions shipped to the caller) took 98 s in one measurement and 186 s in another that included process overhead. Plan for **one to three minutes** instance-wide. Filtering inside the page (Design) cuts the transfer to only the candidates.

**3. Full template:** `GET /api/query/v1/functions/template/{id}?hidden=true`. VERIFIED-CODE (`getFunctionTemplate`) and VERIFIED-LIVE. Keys: `aggregated, analytic, archived, cacheWindow, certificationStatus, checkSum, columnPositions, created, dataType, expression, functionTemplateDependencies, functions, global, hidden, id, lastModified, legacyId, links, locked, name, nonAggregatedColumns, owner, status, variable`.

**4. Save:** `POST /api/query/v1/functions/bulk/template`, body `{ "update": [template, ...], "links": {}, "strict": false }`. VERIFIED-CODE (`updateDatasetFunctions`) and VERIFIED-LIVE on scratch Beast Modes.

- Response: `{ "created": [], "updated": [<full template>], "deleted": [], "archived": [], "links": {} }`.
- **The server recomputes derived fields from the expression.** `columnPositions`: a stale array came back corrected (``[{columnName: '`New Col`', columnPosition: 7}]``), and a ref inside a `--` comment got no position. `nonAggregatedColumns`: a scratch ``SUM(`Amount`) * IFNULL(`Old Col`, 1)`` was created with `['Old Col']`, updated to `New Col` with the stale `['Old Col']` still in the body, and came back and re-read as `['New Col']`. The field is derived from the parse: template 551602 lists `ca_name`, which appears only in the Beast Mode it nests (551580). `nonAggregatedExpressions` shows up only in create and update responses (echoed stale there) and is absent from GET, so a template read through `getFunctionTemplate` never carries it. All VERIFIED-LIVE. The client maintains none of these.
- **The batch is atomic.** One bad entry (nonexistent id) failed the whole call with `400 "Templates being updated, archived, or deleted must have a valid ID"`, and the valid entry beside it was not saved. VERIFIED-LIVE.
- **Links go back unchanged**, and `functionTemplateDependencies` is dropped. Otherwise Domo rejects the update ("Function links cannot be updated using the update template endpoint") or a nested Beast Mode. VERIFIED-CODE (`migrateBeastModeUsage.js` comments; both builders strip `checkSum`, `created`, `lastModified`, `functionTemplateDependencies`).
- **A missing target column is saved, not rejected.** `` `Ghost Column` `` saved with `status: "VALID"`, and the `DATA_SOURCE` link came back `valid: "ILLEGAL_REFERENCE"`. VERIFIED-LIVE.
- **Every edit sets `certificationStatus: "EXPIRED"`**, even on a Beast Mode that was never certified. This was tested with no certification field, with `certification: { state: 'NOT_CERTIFIED' }`, and with `certificationStatus: 'NOT_CERTIFIED'`. EXPIRED came back every time. VERIFIED-LIVE. Domo's own editor does the same: a save sets `certification = { state: 'EXPIRED' }` whenever the current state is not `NOT_CERTIFIED`. So editing a `CERTIFIED` Beast Mode drops its certification, and editing a `PENDING` or `REQUESTED` one cancels the open request. The client cannot prevent either.
- **`checkSum` is not enforced.** A PUT with a made-up `checkSum` succeeded. VERIFIED-LIVE. There is no optimistic concurrency.
- **Error copy.** `ILLEGAL_DEPTH` and the links rejection are already translated by `describeBeastModeUpdateError` (VERIFIED-CODE).

**5. Single update (fallback):** `PUT /api/query/v1/functions/template/{id}`, full template as body. SPEC-ONLY (`updateFunction`) and VERIFIED-LIVE on a scratch Beast Mode. Returns the updated template.

**6. Dataset schema:** `GET /api/data/v2/datasources/{id}/schemas/latest`, reading `schema.columns[].name/type`. VERIFIED-CODE (`fetchDatasetSchemaColumns`). No bulk form: `part=schema` on `/data/v3/datasources/bulk` returns 400 (VERIFIED-LIVE). One call per affected dataset (24 in the `Region` example), pooled.

**7. Dataset details:** `POST /api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true`, body `[ids]`. VERIFIED-CODE (`getDatasetDetailsForList`). Gives `name` and `dataProviderType`. The three data model datasets (below) report `data-model` (VERIFIED-LIVE). **Card titles:** `getCardsByIds` (VERIFIED-CODE).

**8. Data model Beast Modes.** A full scan found 40 expressions with `` `table`.`column` `` refs. 38 of them sit on three data model datasets: `0bce01d1-f575-4922-923c-5ce93461917c`, `7ac75807-84dc-4b53-a976-ffa54a963886` and `77641ae4-6c61-48ea-a197-875b0564c64d`. Example, template 546295: ``DATEDIFF( `DateTrends_MultipleCalendars`.`COMMON_DATE`, `ProductKeyMetrics_Enriched_Final`.`Consumption Close Date` )``. A data model's `schemas/latest` returns **0 columns**. Its `GET /api/query/v1/datasources/{id}/schema/indexed` returns `tables[].columns[].name` in the qualified form `` `DateTrends_MultipleCalendars`.`COMMON_DATE` ``. All VERIFIED-LIVE. Two consequences: BACKTICK_REF_RE splits a qualified ref into two tokens, so whole-token matching would rewrite `` `orders`.`Region` `` and `` `customers`.`Region` `` alike, and a table named like the Find text too. And target validation through `schemas/latest` would flag every row as missing.

**9. Dataset search to narrow an instance-wide scan: rejected.** The free-text `query` on `/api/data/ui/v3/datasources/search` matches column names only loosely: for `Region`, 3 of the top 25 of 3,062 hits had the column. No column filter exists. VERIFIED-LIVE.

**10. Card Beast Modes update through the template endpoint.** INFERRED, strongly:

- A card's `kpi/definition` `formulas[]` entry carries `templateId` and a `formula` identical to the template `expression` (card `791190909`, template `391920`; VERIFIED-LIVE).
- The same entries carry `referenceCount` and `usedByOtherCards`, which aggregate across cards and cannot be stored per card. So the list is assembled from the template store when it is read. VERIFIED-LIVE observation, INFERRED conclusion.
- Five card Beast Modes (templates 551763, 552286, 552270, 551858 and 551738) have a template `lastModified` about seven months after their card's `modified`, and their card formulas still equal the template expressions. VERIFIED-LIVE, though `lastModified` may have moved for a non-formula change.
- Domo's Beast Mode Manager save `N(e)` routes a card Beast Mode (`!persistedOnDataSource`) into `saveUpdateBeastMode`, a template update with `{description, expression, id: templateId||id, name, owner, status, persistedOnDataSource, archived, certification}` (bundle).
- A scratch card to settle this beyond doubt could not be created in this pass. `PUT /api/content/v3/cards/kpi?pageId=-100000` (SPEC-ONLY `createCard`) returned an unexplained 400 three times against a scratch dataset that had a schema but no data. The dataset reported `cardCount: 0` before deletion, so nothing was created. That check moves to implementation step 0.

**11. Permissions.**

- Authority `content.card.edit`: "Create, edit and delete Cards, Drill views, and Beast Modes to which you have access" (authority dataset `073c76f1-c846-48fd-876c-34d98d89a07b`, VERIFIED-LIVE).
- Domo's Beast Mode Manager enables "Edit formula" via `disabled: !(p() || !g())`, with `p() = tb.default.on("dataset.admin") || r.data.owner === n` and `g()` returning `locked` (bundle). So a locked Beast Mode is editable only by its owner or a `dataset.admin` holder. The plan mirrors this, and the per-item save reports the server's verdict either way. Server enforcement for a non-owner was not testable with an admin token (INFERRED).
- `userRights` in `availableActions.js` is `currentContext.user.metadata.USER_RIGHTS` (VERIFIED-CODE).

**12. Matching semantics.** Domo resolves formula refs case-insensitively (`src/utils/columnOrphans.js` documents a `` `next step date` `` ref valid against `Next Step Date`; VERIFIED-CODE). A reference is one whole backticked token. Refs inside comments and strings are not references: `eachExpressionRef` masks them, and the server ignored a commented ref in `columnPositions` (VERIFIED-LIVE).

**13. Prism tokenization.** Prism's SQL grammar tokenizes `` `Region` `` as an `identifier` whose backticks are separate `punctuation` children (`node_modules/prismjs/components/prism-sql.js:18-24`, VERIFIED-CODE). So in `SqlBlock` the inner name is its own segment, while comments and strings are whole `comment`/`string` segments.

**14. Archived Beast Modes are unused** (VERIFIED-LIVE, read-only, for D6.5). All 24 archived Beast Modes on domo.domo.com have `activeLinks: {}` and every link `active: false`. 23 are card Beast Modes on two cards that still exist (`2045783621`, `1191823748`), and neither card's `kpi/definition` carries them in `formulas` or references their `legacyId`s. None is nested by another Beast Mode: `{ field: 'templateDependencies', value: '<id>' }` returned 0 for each (the filter shape is confirmed by `551580` returning its parent `551602`). So the scan adds `notarchived` and ignores them.

## Design

**Where it lives.** A new side panel view, `replaceBeastModeColumns`, launched by a new action button in the expandable action bar. The button renders in both the popup and the side panel, and both launch into the side panel.

**Enabled contexts** (`src/utils/availableActions.js`):

- Every dataset type except data models, inside the existing `if (isDataset)` block after `remapColumns`, skipped when `typeId === 'DATA_MODEL'`. Scope starts as that dataset.
- `BEAST_MODE_FORMULA`, next to `migrateBeastModeUsage`. Scope starts as the Beast Mode's dataset (`datasetIdFromBeastModeLinks`), and its referenced columns (`extractBeastModeColumnRefs`) are the first Find suggestions.
- Rights gate: `content.card.edit` or `content.admin` (D6.4). Remap Columns and Migrate Beast Mode Usage get the same gate in a separate commit, with a UI/UX Changes release note.
- Remap Columns' "Nothing to Remap" toast gains an action that opens this view on the same dataset (D6.7), shown only when the user passes this gate.
- No feature switch: `beast-mode-bulk-update` gates only Domo's own bulk UI, not the API.

**Data flow.** Everything runs in the side panel document and reaches the page through `executeInPage`, so the page's session authenticates each request. The background only does the usual `launchView` and `getSidepanelData` handoff.

```
Side panel view
  1. scan:   one executeInPage per search page: search (limit 1000) + template/expressions
             for that page + an in-page prefilter; returns candidates only. Pool of 2 pages.
             Exact match on the side panel with eachExpressionRef.
  2. enrich: dataset details (bulk: name, dataProviderType), schemas of affected datasets
             (pool 5), card titles (bulk)
  3. plan:   per match -> rewrite preview via rewriteBeastModeColumns, flags, default selection
  4. apply:  open a 1.3 journal run, fresh read of each selected template (pool 5), skip
             changed or done ones, rewrite from the fresh copy, save through 1.2's
             batchWithFallback (chunks of 50), journal each item from onSend / onSettled
  5. result: per-item outcome, Retry Failed, Find Again, a link to the run in Recent Runs
```

**In-page prefilter.** The injected page function receives the lowercased Find text and keeps an expression only when `expression.toLowerCase().includes('`' + find + '`')`. This needs no imports. It is a strict superset of the exact match, because every true ref (any case, qualified or not) contains that substring. Only candidates (`id`, `expression` and the search metadata) cross the `chrome.scripting` bridge. The side panel then runs the exact check: comment- and string-aware `eachExpressionRef`, case-insensitive whole-token comparison, and data model detection. This settles the earlier contradiction: one injected call per page, with a pool of 2 pages in flight. Offsets are known once page 1 returns `totalHits`.

**Shared search page function (in `src/services/functions.js`).**

```js
export async function searchFunctionsPage({ expressionFilter = null, filters, limit = 1000, offset, tabId })
// -> { degraded, hasMore, results: Array<searchResult & { expression? }>, scanned, totalHits }
```

With `expressionFilter` (a lowercased needle) it also reads `template/expressions` for the page and returns only the results whose expression contains it. Without it, it returns the plain search page. This is the general form of the loop that `getDatasetFunctionsForDatasets`, `getCardBeastModes`, `getBeastModesSavedOnCard` and `findUnusedFunctions` each copy. #6 does not migrate those four (follow-up), but it adds no fifth copy.

**New service: `src/services/beastModeColumnReplace.js`**

```js
export async function applyColumnReplacement({ column, onProgress, replacement, rows, run, tabId })
// `run` is the 1.3 journal handle from createRunJournal; each item is planned, started and recorded
// with { before, after } expressions.
// -> { changedSinceScan: [{ id }], failed: [{ error, id }], skippedDone: [{ id }], succeeded: [{ id }] }

export function planColumnReplacement({ column, currentUser, detailsByDatasetId, matches, replacement, schemasByDatasetId, userRights })
// -> PlanRow[] = Match & { canEdit, certification, defaultSelected, isCardBeastMode, isDataModel,
//                         newExpression, targetMissing, typeChange }

export async function scanBeastModesForColumn({ column, datasetIds = null, isCancelled, onProgress, tabId })
// -> { degraded, matches: Match[], scanned, stoppedEarly, total }
// Match = { activeLinkCount, certificationStatus, datasetId, expression, hasQualifiedRef, id, legacyId,
//           locked, name, owner, refCount, saveTarget, spellings: string[] }
```

- **Matching.** `eachExpressionRef(expression, BACKTICK_REF_RE, ...)`, keeping refs where `match[1].toLowerCase() === column.toLowerCase()`. Every distinct spelling goes into `spellings`. A second pass with `QUALIFIED_REF_RE` sets `hasQualifiedRef` when a match has a second group.
- **Rewrite.** `columnMap = Object.fromEntries(spellings.map((s) => [s, replacement]))`, then `rewriteBeastModeColumns`. Mapping each real spelling makes the exact-match rewriter case-insensitive in effect. No new rewriter.
- **Data models excluded** (D6.2): a row is `isDataModel` when `isDataModelType(details)` is true for its dataset, or when `hasQualifiedRef` is set. Such rows are listed but disabled.
- **`canEdit`.** `!locked || String(owner) === String(currentUser.id) || userRights.includes('dataset.admin')`.
- **`certification`.** `'certified'` for `CERTIFIED`, `'requested'` for `PENDING` or `REQUESTED`, otherwise null.
- **`targetMissing`.** `resolveColumnName(replacement, indexColumnNames(schemaNames))` is null on the row's dataset. A failed schema read gives `null` ("Couldn't check").
- **`typeChange`.** Both columns are on the schema and their `type` differs.
- **`defaultSelected`.** `canEdit && !isDataModel` and no warning flag (`certification`, `locked`, `targetMissing !== false`, `typeChange`). Informational chips (Card Beast Mode) do not deselect.
- **Archived.** The scan sends `notarchived` alongside `notvariable`, so archived Beast Modes are never read, counted, or listed (D6.5, API finding 14).

**Changes in `src/services/functions.js`** (exports kept alphabetical per `code-style.md`):

- `searchFunctionsPage` (above).
- `saveFunctionTemplate({ tabId, template })`: the single `PUT /template/{id}`, throwing with `error.status`.
- `updateDatasetFunctions` already attaches `status` to its thrown error (pre-existing bug 5), so `canFallBack` can branch on it.
- `toBeastModeUpdateEntry(template)`: deep clone, delete `checkSum`, `created`, `lastModified`, `functionTemplateDependencies`. `remapDatasetColumns.js`'s `buildBeastModeUpdateEntry` is identical and is replaced by it. `migrateBeastModeUsage.js`'s `buildNestingUpdateEntry` starts from it. This is a pure refactor and does not touch either save path.
- `describeBeastModeUpdateError(err)`: moved from `migrateBeastModeUsage.js`, exported, imported back there.

**Batch save through 1.2's `batchWithFallback`** (`src/utils/batchWithFallback.js`, landed by 1.2 step 6 or by #8, to the amended signature in Shared infrastructure across issues). #6 builds none of it:

- `sendBatch` is `updateDatasetFunctions`, `sendOne` is `saveFunctionTemplate`, `chunkSize` is 50, and `profile` is `RETRY_SAFE`, since 1.2 classes Beast Mode bulk `{update}` as safe to repeat. Each send goes through 1.2's `withRetry`.
- The default `canFallBack` falls back only on a definite 4xx other than 429. A 5xx or an exhausted 429 marks the whole chunk failed without firing single calls.
- `onSend` calls `run.start(keys)` and `onSettled` calls `run.record(...)` with `{ before, after }` expressions, and drives the "Saved 50 of 80" count.
- By the time #6 lands, 1.2 step 6 has also moved Remap Columns, Migrate Beast Mode Usage, Migrate Downstream Content and `transferFunctions` onto it, so #6 does not touch their save paths.

**Change record through the 1.3 journal** (D6.1, D6.6). Before the first write the view calls `createRunJournal({ feature: 'replaceBeastModeColumns', instance, subject, params: { column, replacement, scope } })` and `run.plan(items)` over the Beast Modes it will try. Each item's entry carries `{ before, after }` expressions plus its dataset and card. #6 adds the `replaceBeastModeColumns` feature label and an Excel row mapper (columns DataSet, Card, Beast Mode, ID, Before, After, Outcome) to Recent Runs. If `createRunJournal` fails, the run does not start, per 1.3. There is no Undo and no in-view log: reverting means editing each Beast Mode, using the run's `before` expressions from Recent Runs.

**`src/components/SqlBlock.jsx`: whole-identifier highlight.** Add an optional `identifiers` prop (an array of names). A segment is marked when its className contains `token identifier` but not `punctuation`, and its text matches a name case-insensitively. Comments and strings are separate token types, so they are never marked, and `Region Code` is a different identifier. The existing `query` substring behavior stays as it is for `DataflowInspector`.

**State shape (view):**

```js
{
  applyProgress: { done: 0, total: 0 },
  column: '',
  page: 'find' | 'scanning' | 'review' | 'applying' | 'results',
  replacement: '',
  results: null | { changedSinceScan, failed, runId, skippedDone, succeeded },
  rows: [],                        // PlanRow[]
  scan: { degraded: false, scanned: 0, stoppedEarly: false, total: 0 },
  scope: { datasets: [{ id, name }], mode: 'datasets' | 'all' },
  selectedIds: new Set()
}
```

**Concurrency and failure handling.**

- **Scan.** Pool of 2 page calls. A cancel flag is checked before each page is issued. A failed page is retried once, after re-resolving the tab with `getValidTabForInstance(instance)`, which covers a tab that navigated or reloaded. Then the scan stops and shows partial results. A `degraded: true` page raises a banner.
- **Enrich.** Schema reads in a pool of 5. A failed read leaves `targetMissing: null`.
- **Apply, fresh read (per beta 1.4 and D2).** Re-read each selected template with `getFunctionTemplate` in a pool of 5, recording a per-row failure "Couldn't read the current formula." for a failed read. `hydrateFunctionTemplates` does exactly this and now returns its `failures` (pre-existing bug 5), so it can be used here.
  - The fresh template has no ref to the Find column: record `skippedDone` ("Already up to date").
  - The fresh `expression` differs from the scanned one: skip as `changedSinceScan`. This is a strict equality check, so an edit that touched only a comment or whitespace is also skipped. That is acceptable, since it errs toward not writing an unreviewed change.
  - Otherwise rewrite the **fresh** template through `toBeastModeUpdateEntry` and `rewriteBeastModeColumns`, then hand it to `batchWithFallback`. The fresh expression is the journal entry's `before`.
- **Tab changes mid-run.** Before each chunk, `getValidTabForInstance(instance)` re-resolves the tab. If no tab on the instance is left, the run stops, the unsent rows are reported as "Not attempted: no Domo tab for this instance is open.", and Results lists them.
- **Panel closes mid-run.** `useRunLock` blocks closing the view while a run is active (1.6). If the side panel itself closes, unsent chunks are never sent, each item is atomic so nothing is half-written, and the journal keeps every started item, so Recent Runs shows the run as interrupted with what was written.
- **Run lock.** While scanning or applying, the view calls `useRunLock(isRunning, 'Replace Columns in Beast Modes')`, which covers close, Back, reload, popup launches and action bar launches, and is listed in 1.6's "Which views lock" table. The scan's Cancel stays available.
- **Validation.** Find is non-empty after trimming and differs from Replace (case-insensitive). Neither may contain a backtick. Replace may contain spaces and punctuation, since the rewriter re-wraps it in backticks.

## UX

**Entry point.** Button **Replace Columns in Beast Modes**, icon `src/assets/icons/column-arrows-in.svg` (present and unused in `src/`, so it doesn't clash with Remap Columns' `column-edit.svg` or Migrate Content's `swap-horizontal.svg` on the same bar). It sits right after Remap Columns in `ActionButtons.jsx`.

- Tooltip, with no trailing period to match Remap Columns: "Find a column in Beast Mode formulas and replace it with another column, on this dataset or across the instance"
- Remap Columns' tooltip stays as is, so the two read as repair versus replace.

**View title.** `DataList` feature string **Replace Columns in Beast Modes on**. The subject is the dataset name, "3 DataSets" with several, or "All DataSets" instance-wide. The view carries the `beta` chip.

**Flow.**

1. **Find.** Pick the scope, a Find column and a Replace column, then press **Find Beast Modes**.
2. **Scanning.** Progress bar and **Cancel**.
3. **Review.** Beast Modes grouped by dataset, with card Beast Modes nested under their card. Each row shows chips and an expandable before and after formula. Select rows, then press **Replace in N Beast Modes**.
4. **Confirm.** AlertDialog with **Replace**. It becomes a HoldToConfirmButton **Hold to Replace** when the selection includes a certified or certification-requested Beast Mode.
5. **Applying.** Progress bar, no cancel.
6. **Results.** Outcome per Beast Mode, plus **View in Recent Runs**, **Retry Failed** (when any failed), **Find Again** and **Done**.

**Find screen**

```
+----------------------------------------------------------+
| [icon] Replace Columns in Beast Modes on                 |
|        Sales Pipeline                     [Beta]   [x]   |
|----------------------------------------------------------|
| Search in                                                |
|  (o) These datasets                                      |
|      [Sales Pipeline  x] [Sales Pipeline (EMEA)  x]      |
|      [ Add a DataSet...                       v ]        |
|  ( ) All Beast Modes in this instance                    |
|      Scans every Beast Mode. This can take one to three  |
|      minutes on a large instance.                        |
|                                                          |
| Find column                                              |
|  [ Region                                     v ]        |
|  Matches any capitalization, like Domo does.             |
| Replace with                                             |
|  [ Sales Region                               v ]        |
|  Checked against each dataset's columns after the scan.  |
|                                                          |
|                         [ Find Beast Modes ]             |
+----------------------------------------------------------+
```

Both radio labels are sentence case. Find and Replace are Autocompletes over the sorted union of the scoped datasets' columns, with free text allowed. Replace pins `suggestReplacement(find, columns)` at the top when it returns one. In instance-wide mode both fields are free text.

**Scanning**

```
| Scanning Beast Modes...                                  |
| [###########...............]  41,000 of 94,338          |
| 37 Beast Modes found so far                   [ Cancel ] |
```

**Review**

```
+----------------------------------------------------------+
| 84 Beast Modes on 24 DataSets use `Region`               |
| (i) `Sales Region` is missing on 3 of these datasets.    |
|----------------------------------------------------------|
| [v] [db] Sales Pipeline                           12     |
|    [x] Region Rollup                                     |
|    [ ] Win Rate by Region       [Locked]                 |
|    [ ] Quota Region   [Certification requested]          |
|    [ ] Region Code    [Target missing]                   |
|    [v] [card] Pipeline by Region   [Card Beast Mode] 2   |
|        [x] Region Label                                  |
|  > Before  CASE WHEN `Region` = 'West' THEN ...          |
|    After   CASE WHEN `Sales Region` = 'West' THEN ...    |
| [>] [db] Date Trends Product Metrics   [Data model]  1   |
|----------------------------------------------------------|
| [ Back ]          [ Replace in 80 Beast Modes ]          |
+----------------------------------------------------------+
```

**Chips (exact copy, with tooltips):**

- `Card Beast Mode`: "Saved to this card, not to the dataset." Informational, the row stays selected.
- `Locked`: "Locked. You can edit it because you own it or manage datasets." When the user cannot edit it, the row is disabled and the tooltip reads "Locked by its owner. Only the owner or someone who can manage datasets can edit it."
- `Certified`: "Editing a certified Beast Mode expires its certification."
- `Certification requested`: "This Beast Mode has an open certification request. Editing it cancels the request."
- `Target missing`: "`Sales Region` isn't a column on this dataset. The Beast Mode will show an invalid reference until it is added."
- `Couldn't check`: "This dataset's columns couldn't be read, so the replacement column wasn't checked."
- `Type changes`: "`Region` is text and `Sales Region` is a number on this dataset. Check that the formula still makes sense."
- `Data model`: "Formulas on a data model name a table as well as a column. Edit this one in Domo." The row is disabled.

**Default selection.** One rule: an editable row starts selected unless it carries a warning chip (Locked, Certified, Certification requested, Target missing, Couldn't check, Type changes). Rows the user cannot edit and data model rows are disabled. Before and after formulas render in `SqlBlock` with `identifiers={[...row.spellings]}` (before) and `identifiers={[replacement]}` (after).

**Confirm dialog**

- Title: **Replace `Region` in 80 Beast Modes?**
- Body: "Each selected Beast Mode's formula will reference `Sales Region` instead. Cards using these Beast Modes pick up the change right away. This can't be undone here, but Recent Runs keeps every original formula."
- Added when any certified rows are selected: "**2** certified Beast Modes will lose their certification."
- Added when any certification-requested rows are selected: "**1** open certification request will be canceled."
- Buttons: **Cancel** and **Replace**, or **Cancel** and HoldToConfirmButton **Hold to Replace** when either line above applies.

**Applying**

```
| Replacing `Region` in Beast Modes...                     |
| [#############.............]  Saved 50 of 80            |
```

**Results**

```
| Replaced `Region` in 77 of 80 Beast Modes                |
| [ok] Sales Pipeline            11 replaced               |
| [!]  Sales Pipeline (EMEA)     8 replaced, 1 failed      |
|        Region Filter: You don't have permission to edit  |
|        this Beast Mode.                                  |
| [-]  Marketing Leads           1 skipped (edited after   |
|                                the scan), 1 already up   |
|                                to date                   |
|----------------------------------------------------------|
| (i) Recent Runs keeps every formula before and after.    |
| [ View in Recent Runs ] [ Retry Failed ] [ Find Again ]  |
|                                                [ Done ]  |
```

- **View in Recent Runs** opens the 1.3 Recent Runs page on this run, where its Excel and JSON downloads live.
- **Retry Failed** re-runs apply on the failed rows only (fresh read again), as a new journal run. Succeeded rows drop out of the selection, following beta 1.5.
- **Find Again** returns to Find with the same scope and fields, so a fresh scan shows what is left.
- Failure text goes through `describeBeastModeUpdateError`. A 403 maps to "You don't have permission to edit this Beast Mode." Any other error shows Domo's message.
- There is no Undo (D6.6). The confirm dialog says so: see below.

**States and copy.** Toast titles are Title Case. Descriptions end with a period.

- **Loading context:** the standard view spinner.
- **Empty result:** toast **No Beast Modes Found**, "No Beast Modes on **Sales Pipeline** reference `Region`." Instance-wide: "No Beast Modes in this instance reference `Region`." The view stays on Find.
- **Validation:** inline field errors "Enter the column to find.", "Choose a different column to replace it with." and "Column names can't contain backticks."
- **Scan cancelled:** Review shows what was found so far, with the banner "The scan was stopped after 41,000 of 94,338 Beast Modes. Results may be incomplete."
- **Scan failed:** ErrorAlert "Couldn't search Beast Modes: <message>." with **Try Again**.
- **Degraded search:** banner "Domo reported partial search results. Some Beast Modes may be missing."
- **Permission denied:** without the gating right the button does not render. Rows the user cannot edit are disabled. A 403 on save shows as that row's failure.
- **Partial failure:** toast **Some Beast Modes Not Updated**, "Replaced `Region` in 77 Beast Modes; 3 couldn't be updated.", warning.
- **Full failure:** toast **Beast Modes Not Updated**, "None of the selected Beast Modes could be updated.", danger.
- **Success:** toast **Beast Modes Updated**, "Replaced `Region` with `Sales Region` in 80 Beast Modes.", success.
- **Tab lost mid-run:** toast **Replacement Stopped**, "No Domo tab for this instance is open, so the remaining Beast Modes weren't updated.", warning.
- **Row notes:** "Skipped: edited after the scan.", "Already up to date.", "Couldn't read the current formula.", "Not attempted: no Domo tab for this instance is open."
- **Journal unavailable:** if `createRunJournal` fails, nothing is written and the confirm shows "Couldn't start a record of this run, so nothing was changed: <message>."

## Implementation plan

0. **Live check before UI work: card Beast Mode propagation (finding 10).** On a scratch dataset with a data version (create it with `POST /api/data/v1/streams` (`createStreamAndDataset`, SPEC-ONLY) and upload one CSV row, since a schema-only dataset rejected card create), create a scratch card through `PUT /api/content/v3/cards/kpi?pageId=-100000` with one card-level formula. Update that template through `bulk/template`, re-read `kpi/definition`, and confirm `formulas[].formula` changed. Then save the card once through the same PUT with the formulas it returned, and confirm the template keeps the new expression. Delete the card (`DELETE /api/content/v1/cards/bulk?cardIds=`, VERIFIED-CODE), the template and the dataset. If the card holds its own copy, card Beast Modes drop out of v1.
1. **Prerequisites (D6.1).** Confirm 1.2 (`src/utils/batchWithFallback.js`, `src/utils/retry.js`, and step 6's caller retrofit), 1.3 (`src/utils/runJournal.js` and Recent Runs) and 1.6 (`src/hooks/useRunLock.js`) have landed. #6 builds none of them.
2. **Gate the shipped siblings (D6.4), its own commit.** In `src/utils/availableActions.js`, gate `remapColumns` and `migrateBeastModeUsage` on `content.card.edit` or `content.admin`. Add a UI/UX Changes bullet to `docs/RELEASE_NOTES.md` (draft below). This can land before the rest of #6.
3. **`src/services/functions.js`.** Add `searchFunctionsPage`, `saveFunctionTemplate`, `toBeastModeUpdateEntry`, and `describeBeastModeUpdateError` (moved). Swap the private strips in `src/services/remapDatasetColumns.js` (`buildBeastModeUpdateEntry`, removed) and `src/services/migrateBeastModeUsage.js` (`buildNestingUpdateEntry`'s first five lines) for `toBeastModeUpdateEntry`, and import `describeBeastModeUpdateError` in `migrateBeastModeUsage.js`. No save-path change in either.
4. **`src/components/SqlBlock.jsx`.** Add the `identifiers` prop.
5. **`src/services/beastModeColumnReplace.js` (new).** `applyColumnReplacement`, `planColumnReplacement`, `scanBeastModesForColumn` (with `notarchived` in its filters). Reuses `eachExpressionRef`, `BACKTICK_REF_RE`, `QUALIFIED_REF_RE` (`columnFields.js`), `rewriteBeastModeColumns` (`columnRewriter.js`), `fetchDatasetSchemaColumns` (`columnReferences.js`), `isDataModelType` (`utils/datasetTypes.js`), `indexColumnNames`/`resolveColumnName` (`utils/columnOrphans.js`), `beastModeSaveTarget`/`datasetIdFromBeastModeLinks` (`utils/beastModeLinks.js`), `getFunctionTemplate`, `getDatasetDetailsForList`, `getCardsByIds`, `getValidTabForInstance` (`utils/currentObject.js`), `batchWithFallback` and the journal `run` handle.
6. **`src/components/buttons/ReplaceBeastModeColumns.jsx` (new).** Same shape as `RemapColumns.jsx`: `useLaunchView`, `type: 'replaceBeastModeColumns'`, the label, the tooltip and `IconColumnArrowsIn` from `@icons/column-arrows-in.svg?react`.
7. **`src/utils/availableActions.js`.** Add `replaceBeastModeColumns` in the `isDataset` block (skipped for `DATA_MODEL`) and in the `BEAST_MODE_FORMULA` branch, gated on `content.card.edit` or `content.admin`.
8. **`src/components/ActionButtons.jsx`.** Render the button right after the `remapColumns` block (lines 288-289) behind `availableActions.has('replaceBeastModeColumns')`.
9. **`src/components/views/ReplaceBeastModeColumnsView.jsx` (new).**
   - Find: RadioGroup, `DatasetComboBox` adding entries shown with `FittedTagGroup`, and one Autocomplete per column following `RemapColumnsView`'s virtualized `BrokenColumnRow` pattern.
   - Scanning and Applying: ProgressBar.
   - Review and Results: `DataList` with `selectionMode`, `beta`, `itemActions={['copy']}`, groups by dataset and card, `DataListItem`, `AlertStatusIcon`, and the `ViewHeader` banner.
   - Formulas: `SqlBlock` with `identifiers`.
   - Confirm: `AlertDialog`, with `HoldToConfirmButton` (`src/components/buttons/HoldToConfirmButton.jsx`) when certification is at stake.
   - Journal: `createRunJournal` before the first write, `run.finish(outcome)` after the last, and a **View in Recent Runs** button on Results.
   - Run lock: `useRunLock(isRunning, 'Replace Columns in Beast Modes')`, with `isRunning` true while scanning or applying.
   - Plumbing: `useStatusBar`, `useViewReady`, and `getSidepanelData` checking `data.type === 'replaceBeastModeColumns'` (as `RemapColumnsView` does).
   - Reload: `buildReloadAction({ viewType: 'replaceBeastModeColumns', ... })`. No `headerActions.jsx` change, since it resolves `viewType` through `getAvailableActions`.
10. **Recent Runs.** Add the `replaceBeastModeColumns` feature label and an Excel row mapper (DataSet, Card, Beast Mode, ID, Before, After, Outcome) where 1.3 keeps them.
11. **Remap Columns link (D6.7).** In `RemapColumnsView.jsx`, give the "Nothing to Remap" toast (around line 421) an action that launches `replaceBeastModeColumns` on the same dataset, when `availableActions.has('replaceBeastModeColumns')`.
12. **`src/sidepanel/App.jsx`.** Import the view and add `slot.type === 'replaceBeastModeColumns'` next to `remapColumns` (line 562). A grep for the sibling `deleteUnusedBeastModes` shows views are enumerated only in `App.jsx`, `availableActions.js`, `ActionButtons.jsx` and the button, so that list is complete.
13. **Docs.**
    - `docs/RELEASE_NOTES.md` WIP bullet (below).
    - `store-listing/STORE_LISTING.txt` at release time, per `store-listing.md`.
    - Add the view to the lock table in `docs/plans/beta-phase-1-6-run-lock.md`, and add #6 to the callers table in `docs/plans/beta-phase-1-2-retries-concurrency.md` section 6.
    - `docs/CONTRIBUTING.md` does not list views, so it needs no change.
14. **Lint.** `npx eslint --no-warn-ignored` on every touched file.

**Shared with other work.** #6 consumes 1.2's `batchWithFallback` and `withRetry`, 1.3's journal and Recent Runs, and 1.6's `useRunLock`, and builds none of them. The fresh-read and changed-since-scan rules follow 1.4/D2, and Retry Failed follows 1.5. `searchFunctionsPage` is the shared paged search the four existing loops can adopt later.

## Edge cases and risks

- **Case variants.** `` `region` `` and `` `Region` `` both match (32 and 52 in the real example). Each spelling is mapped explicitly.
- **Comments and string literals.** A `-- Region` comment or a `'Region'` literal is left alone, consistent with Domo's `columnPositions`. The prefilter may pass such an expression through, and the exact matcher drops it.
- **Partial-name collisions.** `` `Region Code` `` does not match `Region`, in the matcher or in the highlight.
- **Beast Mode named like the column.** It keeps its name, since the rewriter only touches `name` under column-list parents (VERIFIED-CODE).
- **Nested Beast Modes.** `DOMO_BEAST_MODE(<id>)` calls are untouched. A nested child that references the column is its own match. The parent's `nonAggregatedColumns` is recomputed by the server.
- **Data model Beast Modes** (40 expressions instance-wide) are listed but disabled. A data model dataset never gets the button.
- **Variables** are excluded (`notvariable`). **Archived** Beast Modes are excluded (`notarchived`): none was in use on domo.domo.com (finding 14). Restoring one later brings back its old reference, which this tool will not have rewritten.
- **Card Beast Modes** are 56% of real hits, and their propagation is settled in step 0 before UI work.
- **Drill Beast Modes** (saved to `dr:<drillId>:<rootId>`) take the same template path and group under their root card.
- **Target already in the formula.** Fine, the formula references it twice.
- **Type change** (STRING to LONG) can break a formula at query time while the server still saves it VALID. The chip warns and the row starts unselected.
- **Large instances.** One to three minutes for about 94k Beast Modes. The scan is cancellable with progress, and only candidates are held in memory.
- **Concurrent edits.** No `checkSum` enforcement, so the fresh read is the only guard. A short window between re-read and write remains, which is acceptable.
- **Certification.** Any edit sets EXPIRED. This was tried three ways and cannot be avoided from the client. Certified and requested rows are opt-in with a hold.
- **No Undo** (D6.6). A wrong replacement is reverted by hand, one Beast Mode at a time, from the `before` expressions in Recent Runs. The confirm says so, and the default selection leaves every warned row out.
- **Owner and lastModified.** `owner` survives because the full template goes back. `lastModified` shows the editor.
- **Shipped save paths.** #6 lands after 1.2 step 6 has retrofitted Remap Columns, Migrate Beast Mode Usage and Migrate Downstream Content, and touches them only through the identical field-strip swap and the moved error translator.
- **Sibling buttons lose some users** (D6.4). Users without `content.card.edit` or `content.admin` stop seeing Remap Columns and Migrate Beast Mode Usage. Logged as a UI/UX change.
- **Panel close mid-run.** `useRunLock` blocks the view's own close; a closed side panel stops unsent chunks, and the journal records what was written. Writes are per item, so nothing is half-written.

## Testing and verification

- **No `/dev-*` route.** Use the CRXJS dev extension while `yarn dev` runs, and `node scripts/ext-shot.js sidepanel --live` with a dataset page open to capture Find, Review, the confirm and Results in light and dark themes. Check the popup button with `node scripts/ext-shot.js popup --live`.
- **Step 0 card check** (above), before any UI work.
- **Live checks on a scratch dataset** named `domo-toolkit-probe-6-<purpose>`, created and deleted for the purpose:
  1. Beast Modes referencing `` `Old Col ``, one with a commented ref, one lowercase `` `old col` ``, one `` `Old Col Code` ``. Replace with `New Col`. The first two update, the comment stays, `Old Col Code` is untouched, and `columnPositions` and `nonAggregatedColumns` come back right.
  2. Replace with a missing column. The row shows Target missing and starts unselected. Opted in, it saves with `links[].valid === 'ILLEGAL_REFERENCE'`.
  3. Edit a Beast Mode in Domo between scan and apply: it is reported as edited after the scan.
  4. Delete one selected Beast Mode in Domo before apply: its chunk falls back on the 400, and the rest save.
  5. Recent Runs lists the run with each Beast Mode's `before` and `after`, and its Excel download has the DataSet, Card, Beast Mode, ID, Before, After and Outcome columns. Archive one scratch Beast Mode first and confirm the scan never lists it.
  6. Navigate the Domo tab to another page mid-apply: the run continues on the re-resolved tab. Close the tab: the run stops with the tab-lost toast, and Recent Runs shows the unsent items as not attempted.
- **Read-only instance-wide check** on domo.domo.com: progress reaches `totalHits`, Cancel stops between pages, and `Region` finds about 84 Beast Modes on about 24 datasets, with 6 showing Certification requested and the data model dataset rows disabled.
- **Highlight:** `Region Code`, a `'Region'` literal and a commented ref are not highlighted in the before formula.
- **Permission:** with a test user who has neither `content.card.edit` nor `content.admin`, none of Replace Columns in Beast Modes, Remap Columns and Migrate Beast Mode Usage shows. With `content.card.edit`, all three show, and a Beast Mode locked by someone else is disabled (or, when forced, fails with the permission row note).
- **Remap Columns link:** on a dataset with nothing to remap, the toast action opens Replace Columns in Beast Modes on that dataset.
- **Regression** for the refactor: Remap Columns on a dataset with orphaned Beast Mode refs, and Migrate Beast Mode Usage on a nesting parent, behave as before, including the `ILLEGAL_DEPTH` message.
- **Lint:** ESLint on every touched file.

## Design decisions made

- **Client-side matching with an in-page prefilter.** No server column filter works (16 shapes tried live). The superset prefilter needs no imports and keeps the bridge to candidates only.
- **One injected call per page, pool of 2.** This resolves the draft's overlap contradiction. Offsets are known after page 1.
- **Dataset search does not narrow an instance-wide scan.** Measured precision was 3 in 25 with unknown recall.
- **Card Beast Modes are included,** subject to step 0. They are 47 of 84 real hits, and three read-only signals plus Domo's own editor point to the template endpoint.
- **Whole-token, case-insensitive matching that ignores comments and strings,** which is how Domo resolves refs (`columnOrphans.js`). The server ignored commented refs in `columnPositions`.
- **Reuse `rewriteBeastModeColumns` with a spelling map.** No new rewriter, and scanner and rewriter stay in lockstep through `columnFields.js`.
- **Do not maintain `columnPositions` or `nonAggregatedColumns`.** Both were recomputed server-side from a stale body (VERIFIED-LIVE). `nonAggregatedExpressions` never appears on a GET template. So `toBeastModeUpdateEntry` strips only the four existing fields.
- **Wait for 1.2, 1.3 and 1.6 and build on them** (D6.1). No stand-ins to swap out later, and #6 stays off the shipped save paths, whose retrofit 1.2's caller table owns. It also drops the draft's mistaken claim that `migrateDownstreamContent.js:2299` callers expect a throw (they don't).
- **The 1.3 journal is the only change record, with no Undo** (D6.6). Recent Runs already carries JSON and Excel downloads, so an in-view log would duplicate it.
- **Ignore archived Beast Modes** (D6.5). All 24 on domo.domo.com were unused (finding 14).
- **One rights gate for all three Beast Mode write tools** (D6.4): `content.card.edit` or `content.admin`, the authority Domo names for Beast Mode edits.
- **Link from Remap Columns' "Nothing to Remap" toast** (D6.7), for users who reach for the wrong tool.
- **Fall back only on a definite 4xx.** That is 1.2's `canFallBack` default. Firing single calls at a 5xx makes a struggling instance worse.
- **Fresh read, strict changed-since-scan, and "already up to date" skip,** per 1.4/D2. `getFunctionTemplate` is used directly so a failed read becomes a row failure.
- **Certification-requested rows are treated like certified ones** (own chip, unselected, hold). An edit cancels the request, and on domo.domo.com requests outnumber certifications 11,989 to 0.
- **One default-selection rule:** a warning chip means unselected. That covers the draft's unspecified Couldn't check, Type changes and Review chips.
- **Detect data models with `isDataModelType(details)` plus `QUALIFIED_REF_RE`,** not `isDataModelDefinition`, which needs a view definition the plan never fetches.
- **Whole-identifier highlight in `SqlBlock`.** The existing substring `query` would mark `Region Code`, literals and comments, and Prism splits backticks off identifiers, so a backticked query would match nothing.
- **Distinct icon `column-arrows-in.svg`.** `column-edit.svg` is Remap Columns' icon, and `swap-horizontal.svg` is Migrate Content's.
- **Tooltip without a trailing period** to match Remap Columns. Radio labels in sentence case.
- **Run lock through 1.6's `useRunLock` from the start,** since #6 lands after 1.6.
- **Error copy through `describeBeastModeUpdateError`,** moved to `functions.js` and exported.
- **One find and replace pair per run in the UI,** though the service takes a map. It keeps the review readable.
- **The button shows in the popup too.** `ActionButtons` is shared, and a popup press opens the side panel through `launchView`.
- **No Remap Columns save-path release note in #6.** The atomic save did ship in v1.9.0 (`git show refs/tags/v1.9.0:src/services/remapDatasetColumns.js`, line 249). But #6 no longer changes it, so that bullet belongs to 1.2. The new rights gate on Remap Columns and Migrate Beast Mode Usage does get its own note (below).

## Decisions

IDs are `D6.<n>`. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### D6.1. Should #6 wait for beta phases 1.2 (batchWithFallback and withRetry), 1.3 (change journal) and 1.6 (useRunLock), or ship first with stand-ins?

**Decision:** Option 3. #6 starts after 1.2, 1.3 and 1.6 have all landed and is built on them directly. It builds no `batchWithFallback`, no interim `buildReloadAction` lock, and no in-session Undo or Change Log; the save uses 1.2's `batchWithFallback` and `withRetry`, the run is recorded through `createRunJournal`, and the view calls `useRunLock`.

1. Ship first: build a minimal batchWithFallback to the 1.2 spec, keep Undo and Change Log in-session, and use the reloadAction-based interim lock; adopt each phase as it lands
2. Wait for 1.2 step 6 only, and ship with in-session Undo and the interim lock
3. Wait for 1.2, 1.3 and 1.6 all to land, and build #6 on them directly

**Planning recommendation:** Option 1. The stand-ins are built to the planned signatures (batchWithFallback, createRunJournal, useRunLock), so adopting each phase is a small swap, and none of the three shipped save paths is touched.

**Why it matters:** Option 1 adds src/utils/batchWithFallback.js in #6 and a later one-line useRunLock call. Option 2 delays #6 behind the 1.2 retry work. Option 3 removes the in-session Undo and Change Log code entirely, since the journal provides both, but blocks #6 on three plans that have not started.

### D6.2. How should Beast Modes on data models be handled?

**Decision:** Option 1. Data model Beast Modes are listed disabled with a Data model chip, and data model datasets get no button.

1. Exclude in v1: list them disabled with a Data model chip, and give data model datasets no button
2. Include with table-qualified matching: Find picks a table plus a column from /schema/indexed, and the rewrite touches only refs qualified with that table
3. Include with unqualified matching and a warning chip

**Planning recommendation:** Option 1. Only 40 of 94,338 expressions on domo.domo.com are qualified, 38 of them on three data models. Their schemas/latest returns no columns, so target checks need a different read.

**Why it matters:** Option 2 adds a table picker to Find, a QUALIFIED_REF_RE-based rewrite (extending rewriteScopedExpressionString), and a /schema/indexed read for validation. Option 3 would rewrite the same column name on every table of the model, and any table alias that equals the Find text.

### D6.3. How should locked (but editable), certified and certification-requested Beast Modes be treated by default?

**Decision:** Option 2, as planned. They start unselected as an opt-in, and the confirm becomes a hold whenever certified or certification-requested rows are included.

1. Select them like any other editable Beast Mode
2. Show them unselected as an opt-in, with a hold to confirm whenever certified or certification-requested rows are included
3. Exclude certified and certification-requested Beast Modes entirely, with locked ones opt-in

**Planning recommendation:** Option 2. Any edit sets EXPIRED (tried three ways live), which drops a certification or cancels an open request. Locked rows follow DeleteUnusedBeastModesView's convention.

**Why it matters:** This sets the initial selection logic and whether the confirm step is an AlertDialog or a HoldToConfirmButton. Option 3 removes both certification chips and the hold path. On domo.domo.com, 11,989 Beast Modes have an open request.

### D6.4. Which rights should gate the button, given that Remap Columns and Migrate Beast Mode Usage have none?

**Decision:** Option 2. Replace Columns in Beast Modes, Remap Columns, and Migrate Beast Mode Usage are all gated on `content.card.edit` or `content.admin`. Gating the two shipped buttons is its own commit with a UI/UX Changes release note, since users without either right stop seeing them.

1. Gate this button on content.card.edit or content.admin, and leave the two siblings as they are
2. Gate all three Beast Mode write tools on the same content.card.edit or content.admin check
3. No gate on any of them; rely on per-row editability and server errors

**Planning recommendation:** Option 1 now, with option 2 as a follow-up. content.card.edit is the authority Domo names for Beast Mode edits, and the new tool can scan the whole instance, so showing it to someone who can edit nothing is costly.

**Why it matters:** It is one line in availableActions.js for #6, but option 2 also changes who sees two shipped buttons, which would need a release note.

### D6.5. Should archived Beast Modes that reference the column be editable?

**Decision:** Conditional on whether an archived Beast Mode can still be in use: if not, ignore them; if so, include them as an opt-out group. **Checked live: they are not in use, so option 3 applies.** The scan adds the `notarchived` filter, and the archived count, banner, and "only archived matches" toast are dropped. Evidence (VERIFIED-LIVE on domo.domo.com, 2026-11-23, read-only):

- The instance has 24 archived Beast Modes (`filters: [{ field: 'archived' }]`, the same count with or without `notvariable`). Every one has `activeLinks: {}` and every link `active: false`, although 23 of the 24 still carry a link that resolves (`valid: 'VALID'`).
- 23 of them are card Beast Modes on cards `2045783621` and `1191823748`, both of which still exist. Neither card's `kpi/definition` lists any of the 23 in `formulas`, and no subscription references their `legacyId`s, so the cards no longer use them.
- No Beast Mode nests any of the 24. The `templateDependencies` search filter takes `{ field: 'templateDependencies', value: '<id>' }` (confirmed: `551580` returns its known parent `551602`), and it returned 0 for each archived ID.

Archiving looks like what happens to a Beast Mode once nothing uses it, so editing one would change no content. A restore would bring back the old reference, which is now an accepted gap. The sample is one instance's 24, so "archived means unused" is observed rather than proven server-side.

1. Count and list them read-only (v1 as planned)
2. Include them as an opt-in group, unselected by default
3. Ignore them completely, with the notarchived filter and no count

**Planning recommendation:** Option 1. The count tells someone retiring a column that a restore would bring the old reference back, without editing content nobody uses. Saving an archived template was not tested.

**Why it matters:** Option 2 needs a scratch probe that an archived template accepts a bulk update, plus an Archived group in Review. Option 3 saves one banner but hides a real risk for the retire-a-column workflow.

### D6.6. Should the results screen offer an in-session Undo, or only a downloadable change log?

**Decision:** Option 3. Neither is built in the view. Because #6 waits for 1.3 (D6.1), the journal is the change log from day one: each run appears in Recent Runs with JSON and Excel downloads (#6 adds a feature label and an Excel row mapper there). There is no Undo; reverting means editing each Beast Mode, using the journal's `before` expressions. `revertColumnReplacement`, the Undo confirm, and the in-session log array are dropped.

1. Undo Changes plus Download Change Log
2. Download Change Log only
3. Neither until the change journal (beta 1.3) lands

**Planning recommendation:** Option 1. The before expressions are already in hand, the revert reuses the same fresh-read and batch path, and the 1.3 journal plans no Restore action, so this would be the only rollback.

**Why it matters:** Option 1 adds revertColumnReplacement, an Undo confirm and a progress state. Option 3 leaves users with no recovery path in v1 apart from editing each Beast Mode by hand.

### D6.7. Should this be a standalone action, or a mode inside Remap Columns?

**Decision:** Option 3. A standalone view and button, plus a link from Remap Columns' "Nothing to Remap" toast.

1. New standalone view and button next to Remap Columns
2. A 'Replace a column' mode inside Remap Columns (dataset only, but also covers cards and dataflows)
3. Standalone view, plus a link from Remap Columns' 'Nothing to Remap' toast

**Planning recommendation:** Option 3. The standalone view is needed to span datasets and the instance. A link from the bail toast catches users who reach for the wrong tool.

**Why it matters:** Option 2 reworks RemapColumnsView's orphan-based detection and drops the cross-dataset scope. Option 3 also touches the toast at RemapColumnsView.jsx:421.

### D6.8. Should the tool stay Beast Modes only, or also cover other content that references the column across datasets?

**Decision:** Option 1. Beast Modes only.

1. Beast Modes only (the issue as written)
2. Beast Modes, plus a read-only list of cards, dataflows and views that reference the column, each linking to Remap Columns on its dataset
3. Also rewrite card column references (chart bindings, filters, sorts) across datasets through the existing card rewrite

**Planning recommendation:** Option 1 for v1, with option 2 as a follow-up. Option 3 turns this into a cross-dataset Remap Columns with a much larger scan and write surface.

**Why it matters:** Option 2 adds per-dataset downstream scans to the review. Option 3 roughly doubles the work and moves the effort to XL, since it brings in the card rewrite executor and its drop and reshape rules.

## Release notes draft

- Added Replace Columns in Beast Modes, which finds every Beast Mode that uses a column on one or more datasets, or across the whole instance, and replaces it with another column in bulk. ([#6](https://github.com/brycewc/domo-toolkit/issues/6))

UI/UX Changes (its own commit, no issue link):

- Remap Columns and Migrate Beast Mode Usage now only show for users who can edit cards and Beast Modes.

## Appendix: writes made on domo.domo.com during planning

Every write went to a scratch object the agent created for the probe (named `domo-toolkit-probe-6-*`), and every scratch object was deleted and confirmed gone.

- Draft stage: created scratch dataset d12797c8-e569-4ac9-a03a-a94000bd9c7a ('domo-toolkit-probe-6-beastmode-rename') via POST /api/data/v2/datasources; deleted via DELETE /api/data/v3/datasources/d12797c8-e569-4ac9-a03a-a94000bd9c7a (confirmed 404 afterward).
- Draft stage: created scratch Beast Modes 576047 ('domo-toolkit-probe-6-bm-a') and 576048 ('domo-toolkit-probe-6-bm-b') via POST /api/query/v1/functions/bulk/template (create); updated both once via bulk/template update; tried one bulk update with 576047 plus a fake id 999999999 (rejected 400, nothing written); updated 576047 twice via PUT /api/query/v1/functions/template/576047; deleted both via DELETE /api/query/v1/functions/template/{id} (confirmed 404).
- Critic stage: created scratch dataset 2f909d46-0d36-47e4-aff9-294cb6ce6aca ('domo-toolkit-probe-6-review-cert') via POST /api/data/v2/datasources; deleted via DELETE /api/data/v3/datasources/2f909d46-0d36-47e4-aff9-294cb6ce6aca (confirmed 404).
- Critic stage: created scratch Beast Modes 576049 ('domo-toolkit-probe-6-review-a') and 576050 ('domo-toolkit-probe-6-review-b') via bulk/template create; updated 576049 once and 576050 twice via bulk/template update (certification probe); deleted both via DELETE /api/query/v1/functions/template/{id} (confirmed 404).
- Final stage: created scratch dataset fca2fce8-352b-468b-b0b9-d19b5112cead ('domo-toolkit-probe-6-final-cardbm') via POST /api/data/v2/datasources; deleted via DELETE /api/data/v3/datasources/fca2fce8-352b-468b-b0b9-d19b5112cead (confirmed 404 'does not exist').
- Final stage: created scratch Beast Mode 576051 ('domo-toolkit-probe-6-final-nonagg') on that dataset via bulk/template create; updated it once via bulk/template update (Old Col to New Col with stale nonAggregatedColumns) to confirm server recompute; deleted via DELETE /api/query/v1/functions/template/576051 (GET confirmed 404; dataset-filtered search totalHits 0).
- Final stage: three PUT /api/content/v3/cards/kpi?pageId=-100000 (and one without pageId) card-create attempts on the scratch dataset, all rejected with 400; the dataset reported cardCount 0 before deletion, so no card was created.
- All other calls in every stage were read-only (functions/search, functions/template/expressions, functions/template/{id} GET, cards/kpi/definition PUT reads, datasources bulk and schema reads, authority dataset query, frontend bundle fetch). Scratch files only under /tmp/open-issue-plans/. No pre-existing object, user setting, instance setting or repo file was written.
