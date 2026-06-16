# Fix Migrate-Downstream-Content bugs reported by Landon

## Context

Landon Woollard stress-tested the **Migrate Downstream Content** feature (move all cards / views / dataflows / beast modes from one dataset to another, with column remapping) against a purpose-built set of test datasets and reported three distinct failures. Drill-path and card remapping work; the failures are in beast modes, fusion-view migration, and one Magic ETL sort reference.

Source of truth: his Teams chat (parsed from the `.msg` and the `landon.pdf` screenshots), which include the exact Domo error responses and a Kibana trace. This plan fixes all three.

All work is in `src/services/` (the migration engine). The migration UI lives in the side panel / options page, which has **no localhost dev route** (`local-testing.md`), so end-to-end verification requires the unpacked extension against a real Domo instance using Landon's test datasets.

---

## Bug 1 — Nested / dataset-saved beast modes fail to migrate (and cascade to cards)

### Evidence
- Beast Modes panel: `8 items failed: 3196: Created Beast Mode "bm1" not found on the target`.
- Cards panel: `PUT card HTTP 400: The following formula(s) are missing from the definition or datasource: calculation_d8e1f3cc-…, calculation_122628…`.
- Screenshots prove nesting: `bm3 = CONCAT(\`bm1\`, \`bm2\`)`. Rewriting `bm3` to `CONCAT('1','2')` (no beast-mode refs) made migration succeed. Origin also had duplicate-named beast modes (two `bm1`, two `bm3`).

### Root cause
In [migrateBeastModes()](src/services/migrateDownstreamContent.js#L1103-L1209):

1. **No inter-beast-mode id remap.** Each beast mode is column-rewritten ([rewriteBeastModeColumns](src/services/columnRewriter.js#L74-L78)) and has its origin *dataset* id swept to the target ([buildBeastModeEntry](src/services/migrateDownstreamContent.js#L988-L995)). Nothing rewrites references to **other beast modes**. A nested beast mode's definition still embeds the *origin* `calculation_<uuid>` of the beast mode it references, which does not exist on the target.
2. **No dependency ordering.** All creates go in one unordered batch via [createDatasetFunctions](src/services/functions.js#L18-L40) (`POST /functions/bulk/template`, `strict:false`). A dependent beast mode is created before (or alongside) the one it references, so its reference resolves to nothing → server drops/fails it.
3. **Name-based id resolution is ambiguous.** After create, the code re-reads target beast modes and matches **by name** into a `Map` ([lines 1192-1202](src/services/migrateDownstreamContent.js#L1192-L1202)). Duplicate names collapse in the `Map`, and any beast mode whose create failed is "not found on the target".
4. **Cascade.** A beast mode missing from `idRemap` means the card swap's `beastModeIdRemap` sweep ([swapCardInput lines 394-400](src/services/migrateDownstreamContent.js#L394-L400)) leaves the origin `calculation_<uuid>` in the card → Domo 400 "missing formula" for every card using that beast mode.

### Fix (all within `migrateBeastModes`)
Rework the create phase from a single batch into **dependency-ordered waves with an incrementally-built id remap**:

1. **Build a dependency graph among the selected beast modes.** For each selected beast mode, fetch its template (already cached in `definitionsByItemKey`), and detect references to *other selected* beast modes by scanning the template for their origin `legacyId` (`calculation_<uuid>`) and/or their backticked name. Edge `B → A` when `B` references `A`.
   - Reuse the existing reference walk in [columnReferences.js](src/services/columnReferences.js) as the scanning primitive; add a small helper that, given a template, returns the set of `calculation_<uuid>` tokens it contains (a regex over the stringified template is sufficient and collision-safe, mirroring the card-swap comment at [lines 391-393](src/services/migrateDownstreamContent.js#L391-L393)).
2. **Topologically sort** the `toCreate` list (Kahn's algorithm; on a cycle, fall back to original order and let the existing error path report it — Domo itself forbids true beast-mode cycles).
3. **Create wave by wave.** Maintain a growing `idRemap` (origin `calculation_<uuid>` → target `calculation_<uuid>`). Before building each beast mode's create entry, apply the accumulated remap to its definition with the same `JSON.stringify(...).replaceAll(from, to)` sweep the card swap uses, so its references point at the already-created target beast modes. After each wave's `createDatasetFunctions`, resolve the new `legacyId`s and extend `idRemap`.
4. **Resolve new ids reliably.** Prefer the **order-preserving create response** from `createDatasetFunctions` (it returns each created template's new `id`/`legacyId`; the function already returns the raw response, see its JSDoc) to map each origin beast mode → its target id positionally. Keep name-matching only as a fallback. This removes the duplicate-name ambiguity.
5. **Surface failures without silent card breakage.** When a beast mode fails to create, its origin `calculation_<uuid>` is absent from `idRemap`. Leave the existing per-card error reporting in place, but consider flagging (in the returned `errors`) cards that still reference an unresolved beast mode so the user understands the linkage.

`createDatasetFunctions`/`updateDatasetFunctions` already return the raw bulk response, so resolving ids from it requires no API change. Single-wave (no nesting) behavior is unchanged.

**Critical files:** [migrateDownstreamContent.js](src/services/migrateDownstreamContent.js) (`migrateBeastModes`, `buildBeastModeEntry`), with read-only reuse of [columnReferences.js](src/services/columnReferences.js) and [functions.js](src/services/functions.js).

---

## Bug 2 — Fusion-view migration aliases every column to the literal `mapping`

### Evidence
- Kibana: `Bad Request … Invalid alias 'mapping'` on `PUT …/datasources/<viewId>/…`.
- The fetched indexed schema shows `expression.table.name = "mapping"` for `order_id`, `first_name`, `last_name` — i.e. every column now references a table alias `mapping` that the view's FROM clause never defines.
- Landon's view ("View with Union and join") is a **data fusion** (`views[].mapping`); none of its column names are italicized in Domo's UI, so the breakage is not in the visible column config.

### Root cause
The recent "Added support for fusions" commit (HEAD `3f95797`) taught the **scanner** ([extractFusionViewColumnRefs](src/services/columnReferences.js#L164-L202)) and the **rewriter** ([rewriteFusionViewColumns](src/services/columnRewriter.js#L168-L186)) the indexed `views[].mapping` shape, but did **not** add a fusion PUT.

[swapDatasetViewInput()](src/services/migrateDownstreamContent.js#L503-L524) sends every dataset, fusion included, through [putDatasetViewInPage()](src/services/migrateDownstreamContent.js#L682-L807), which only understands the **template-view** shape: it runs `swapDatasetRecursive(payload.viewTemplate?.select?.selectBody, …)` and friends (all no-ops for a fusion, which has no `viewTemplate`), then builds the PUT body as `{ schema: cleaned, dataSourceName, trigger, dataProviderType }` from the **compiled `/schema/indexed`** response and PUTs it to `/api/query/v1/views/{viewId}`. That compiled schema references the fusion's internal projection step, aliased `mapping`, so round-tripping it through the view endpoint is invalid → `Invalid alias 'mapping'`.

### The real fusion edit API (captured live from Domo's UI)
A fusion is saved with its **own endpoint and model**, unrelated to the template-view or `/schema/indexed` shapes:

```
PUT /api/query/v1/fusions/{fusionId}          → 200 { dataSourceId, indexRequestKey }
```
```jsonc
{
  "dataSourceName": "F1",
  "dataSourceType": "datafusion",
  "responsibleUserId": 1286760875,
  "dataSourceId": "8e47e3b1-…-47f8c4a119ad",   // the fusion's own id
  "validate": false,
  "columnFuse": {
    "type": "inner",
    "leftDataSource":  "22542a59-…fc954",       // INPUT dataset id
    "rightDataSource": "ec075284-…40c9c",       // INPUT dataset id
    "predicates": [ { "leftColumn": "Value", "rightColumn": "Value" } ]
  },
  "columnList": [
    { "name": "Value", "type": "LONG", "color": "#559e38", "included": true,
      "fuseMapping": { "dataSource": "22542a59-…fc954", "columnName": "Value" } },
    // …one entry per output column; output `name` is the view's own and stays put
  ]
}
```

Input dataset ids and source column refs live in flat, well-defined places: `columnFuse.leftDataSource` / `rightDataSource`, `columnFuse.predicates[].leftColumn` / `rightColumn`, and each `columnList[].fuseMapping.{dataSource, columnName}`. Output column names (`columnList[].name`) are the view's own and must not be renamed.

### Fix
Add a dedicated fusion path, separate from the template-view path:

1. **Route fusions away from `putDatasetViewInPage`.** In [dispatchSwap](src/services/migrateDownstreamContent.js#L1047-L1088) / [swapDatasetViewInput](src/services/migrateDownstreamContent.js#L503-L524), detect a fusion and call a new **`swapFusionInput`** instead of the template-view swap. Detection: reuse [isFusionView](src/services/columnReferences.js#L212-L219) on the already-fetched scan definition, or the `dataSourceType === 'datafusion'` signal.
2. **Fetch the native fusion definition.** Add `fetchFusionDefinitionInPage(fusionId)` — confirm the GET is the symmetric `GET /api/query/v1/fusions/{fusionId}` returning the `{ columnFuse, columnList, dataSourceName, responsibleUserId, … }` shape above (capture it the same way the PUT was captured if it differs). The `/schema/indexed` fetch is only needed for the column-mismatch scan, not for this PUT.
3. **Rewrite on the native shape** (new `putFusionInPage`, mirroring `putDatasetViewInPage`'s structure):
   - **Repoint input ids** origin → target: `columnFuse.leftDataSource`, `columnFuse.rightDataSource`, and every `columnList[].fuseMapping.dataSource` equal to `originId`.
   - **Rewrite source columns** via `columnMap`, scoped to origin only: `columnList[].fuseMapping.columnName` where `fuseMapping.dataSource === originId`, and the origin side of `columnFuse.predicates[]` (`leftColumn` when `leftDataSource === originId`, else `rightColumn`). Leave the other input's columns untouched (mirrors the conservative origin-alias scoping in the template-view rewriter).
   - **Preserve** `columnList[].name` / `type` / `color` / `included`, `dataSourceName`, `dataSourceType`, `responsibleUserId`, `dataSourceId`; send `validate: false`.
   - Apply target column **types** (from `targetColumnTypes`) to `columnList[].type` for remapped origin columns when the remap crosses a type boundary, same rationale as `propagateColumnTypes` in the template path.
   - PUT to `/api/query/v1/fusions/{fusionId}`.
4. The existing `rewriteFusionViewColumns` (operating on indexed `views[].mapping`) stays as the **scan** rewriter only; the PUT uses the native shape above. Non-fusion template views keep the existing, working path untouched.

**Critical files:** [migrateDownstreamContent.js](src/services/migrateDownstreamContent.js) (`dispatchSwap`, new `swapFusionInput`, `fetchFusionDefinitionInPage`, `putFusionInPage`). Reuses [isFusionView](src/services/columnReferences.js#L212-L219).

---

## Bug 3 — One Magic ETL sort reference not remapped (minor)

### Evidence
- After migration the ETL shows `Column referenced but no longer found: 'order_date'` on an Order/sort tile; the rest of the ETL remapped `order_date → transaction_date` correctly. Landon: easy manual fix.

### Root cause (confirmed from the captured Order action config)
The Magic ETL **Order** action holds its sort columns at `orderBy[].expression.name`, where `expression` is a **structured Field node**:

```jsonc
{ "type": "Order",
  "orderBy": [
    { "expression": { "name": "CreatedDate", "type": "Field", "table": null }, "orderType": "ASCENDING" },
    { "expression": { "name": "Parent.CaseNumber", "type": "Field", "table": null }, "orderType": "ASCENDING" }
  ] }
```

`orderBy` **is** already in `COLUMN_LIST_FIELDS`, so [walkAndRewriteColumns](src/services/columnRewriter.js#L534-L600) enters the list branch, but: (a) the item-field probe `['column','columnName','inStreamName','name','field','id']` finds nothing on the `{expression, orderType}` item, so it recurses; (b) inside the `expression` object the column sits at key `name`, and the guard `if ((key === 'name' || key === 'id') && !isColumnListParent(parentKey)) continue;` ([columnRewriter.js#L585](src/services/columnRewriter.js#L585), mirrored in the scanner at [columnReferences.js#L564](src/services/columnReferences.js#L564)) skips it because the parent key is `expression`, which [isColumnListParent](src/services/columnFields.js#L123-L129) does not recognize. So the sort column is never rewritten. (It still works elsewhere because `order_date` was surfaced/mapped via other tiles; only this node is missed.)

### Fix
Teach both walkers to recognize the **Magic ETL structured Field node** as a column reference — a 5th shape alongside the existing four. In the object branch of [walkAndRewriteColumns](src/services/columnRewriter.js#L534-L600) and the scanner's `walkForColumnRefs`, when a node has `type === 'Field'` and a string `name`, rewrite/collect `name` as a column ref:

```js
// rewriter
if (node.type === 'Field' && typeof node.name === 'string') {
  node.name = rewriteColumnName(node.name, columnMap);
}
// scanner
if (node.type === 'Field' && typeof node.name === 'string') onColumnRef(stripBackticks(node.name));
```

`type === 'Field'` is unambiguous in Magic ETL expression trees (the action node is `type:'Order'`, constants are `type:'Constant'`, etc.), so this is precise, depth-agnostic (covers Field nodes nested inside `Operation` expressions used by Filter/calculators too), and keeps scanner and rewriter in lockstep. No registry-list change is needed; document the new shape in [columnFields.js](src/services/columnFields.js)'s header comment. The existing `name`/`id` gate stays as-is (it correctly guards the over-broad bare-`name` case); the Field-node check fires before/independently of it, so there is no double-rewrite.

**Critical files:** [columnRewriter.js](src/services/columnRewriter.js) (`walkAndRewriteColumns` object branch) and [columnReferences.js](src/services/columnReferences.js) (`walkForColumnRefs` object branch); doc note in [columnFields.js](src/services/columnFields.js).

**Adjacent (optional, out of migration scope):** the lineage parser's [Order case](src/lineage/services/dataflowParser.js#L351-L355) reads `action.fields`, but Order uses `action.orderBy` — so Order tiles show no sort columns in the lineage view. Worth a one-line fix while here, but it does not affect migration.

---

## Verification

1. **ESLint** after every edit: `npx eslint --no-warn-ignored <files>` (`code-style.md`).
2. **End-to-end against Landon's test datasets** (load unpacked `dist/` in Chrome, no dev route covers the migration view):
   - **Bug 1:** migrate a dataset whose dataset-saved beast modes include a nested chain (`bm3 = CONCAT(\`bm1\`, \`bm2\`)`) and duplicate names. Expect all beast modes created on the target with correct cross-references, `idRemap` complete, and cards that use them PUT cleanly (no "missing formula" 400).
   - **Bug 2:** migrate the "View with Union and join" fusion. Expect a 200 save, no `Invalid alias 'mapping'`, and the target fusion's columns resolving to real input tables (not `mapping`). Re-open the fusion in Domo and confirm column refs and join keys are intact and repointed to the target.
   - **Bug 3:** migrate the ETL with the Order-by-`order_date` tile. Expect no `Column referenced but no longer found` error and `order_date → transaction_date` applied in the sort tile.
3. **WIP release notes** (`wip-release-notes.md`): add one user-facing bullet per shipped fix under Bug Fixes, e.g. "Nested dataset beast modes now migrate in the right order so they and the cards that use them transfer cleanly", "Data fusions now migrate without breaking their column references", "Magic ETL sort columns now get renamed during migration". (All three are fixes to previously shipped behavior, so they pass the gate.)

## Appendix — source evidence (self-contained; originals can be deleted)

This captures everything needed from Landon's Teams chat (`.msg`) and the `landon.pdf` screenshots, plus Bryce's two live network captures, so the source files are no longer required.

### A. Landon's report (verbatim observations)
> Here are the test datasets with the simple column name remappings. Drill path, and card remapping looks great!
> Beastmodes seem to have some migration issues. Renaming dupes on one of the cards still doesn't resolve this. Could it be nested beast modes? The nesting issue resolved that.
> My thought is that the order of migration/creation matters when beast mode formulas are nested, and this may be a transient bug based on chance of which beastmodes are moved in which order. If BeastMode B references BeastMode A, then they must be moved in order BeastMode A THEN BeastMode B, or the creation of beastmode B will fail due to a missing reference.
> But, if that is true, then why did the beast mode migrations on THIS card fail? These don't have nested BM references. Did one beast mode failing to move prevent all cards with beast modes from moving?
> Migration of a View tried to alias a column as "Mapping", but none of the columns in the remapping process would have been given the name "mapping". Neither the union configuration nor the join configuration include "mapping". The join also seems to resolve (showing row matches) in the configuration UI. None of the column names in the view are italicized, indicating nothing has been renamed/aliased so I don't know where this error is coming from. Even the columns array in the error details on Kibana are empty. But it looks like behind the scenes most column names were swapped to "mapping". I suppose the remapping process took the name of the list/dict with the column remappings, instead of fetching the correct element from that list/dict?
> This .filter call on line 410/411 of migrateDownstreamContent.js looks like it might insert the string literal 'mapping', but this has nothing to do with views and should only come into play when migrating cards.
> The ETL had one old reference to an 'order_date' column fail to remap to a 'transaction_date' column. But that is an easy manual fix, and with the manual adjustment the rest of the ETL was correct and the outputs look valid with the remapped columns propagating through as expected.

### B. Exact error strings (from the PDF screenshots)
- **Cards panel:** `2 items failed: 830213169: PUT card HTTP 400: {"message":"The following formula(s) are missing from the definition or datasource: calculation_d8e1f3cc-bf7a-4aef-be86-fa2ddc7fd78a,calculation_122628I3c-2b43-4f05-ac6d-8da78o0a7e82","type":"InvalidSubscription"…}`
- **Beast Modes panel:** `8 items failed: 3196: Created Beast Mode "bm1" not found on the target…`
- **View migration (Kibana):** `Bad Request … Invalid alias 'mapping' … shouldExposeMessage=false … errorCode…=3198` on `GET/PUT …/api/query/v1/datasources/<viewId>/schema/indexed?options=…INCLUDE_DATA_CONTROL_COLUMN_DETAILS`. The indexed-schema response showed `SELECT_EXPRESSION_ITEM` entries whose `expression.table.name = "mapping"` for `order_id`, `first_name`, `last_name` (columnName correct, table alias wrong).
- **ETL:** red banner `Column referenced but no longer found: 'order_date'` on the Order tile.

### C. Beast mode test fixture (from screenshots)
Origin dataset `old_customers.csv` had beast modes: `bm1`, `bm1`, `bm2`, `bm3`, `bm3`, `bmsaved` (duplicate names present; some saved-to-card, some saved-to-dataset). Formulas:
- `bm1 = CONCAT(\`cust_id\`,\`territory\`,\`fname\`)` (columns only)
- `bm2 = CONCAT(\`email_address\`,\`fname\`,\`lname\`,\`territory\`)` (columns only)
- `bm3 (renamed) = CONCAT(\`bm1 (renamed)\`,\`bm2\`)` ← **nested: references other beast modes**
- `bmsaved = SUM(cust_id)`
- Control: `bm3 (renamed - no nesting) = CONCAT('1','2')` migrated successfully, proving nesting is the trigger.

### D. Fusion test fixture (from screenshots)
View "View with Union and join": union of `new_customers.csv` + `new_archive.csv`, joined to `new_orders.csv` on `customer_id = cust_id`. Output columns: customer_id, first_name, last_name, email, region, product, amount, order_id, order_date. Confirmed a **data fusion** (`dataSourceType: "datafusion"`).

### E. Live network captures (Bryce)
- **Fusion save:** `PUT /api/query/v1/fusions/{fusionId}` → `200 { dataSourceId, indexRequestKey }`; body = the `{ dataSourceName, dataSourceType:"datafusion", responsibleUserId, dataSourceId, validate:false, columnFuse, columnList }` shape reproduced in the Bug 2 section.
- **Order action config:** the `{ type:"Order", orderBy:[{ expression:{ name, type:"Field", table }, orderType }] }` shape reproduced in the Bug 3 section.

## Notes / open items to pin during implementation
- **Bug 2:** the fusion save request is captured (`PUT /api/query/v1/fusions/{id}` with `columnFuse` + `columnList`). The only thing to confirm during coding is the matching **GET** for the native fusion definition (expected `GET /api/query/v1/fusions/{id}`); capture it the same way if it differs.
- **Bug 3:** the Order action shape is confirmed (`orderBy[].expression`, a `type:'Field'` node) — no guessing needed.
- **Bug 1:** no external unknowns; whether to resolve new beast-mode ids from the create response vs. snapshot-diff is an internal implementation choice (prefer the order-preserving create response).
