---
published: false
---

# Beta Graduation Review

Status: analysis complete (2026-10-01, branch 1.8.0). Phase 1 (shared problems) is being planned in
[beta-phase-1-shared-fixes.md](beta-phase-1-shared-fixes.md).

## Context

Seven views render the Beta chip (`beta` prop on `ViewHeader` / `DataList`):

| Feature                     | View                                                    | Main services                                                                         |
| --------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Migrate DataSet Content     | `MigrateDownstreamContentView.jsx`                      | `migrateDownstreamContent.js`, `columnRewriter.js`, `columnReferences.js`, `sqlColumns.js` |
| Migrate Beast Mode Usage    | `MigrateBeastModeUsageView.jsx`                         | `migrateBeastModeUsage.js`, `beastModes.js`, `columnRewriter.js`                      |
| Remap Columns               | `RemapColumnsView.jsx`                                  | `remapDatasetColumns.js`, `repairViewColumns.js`, `columnRewriter.js`                 |
| Transfer Ownership          | `OwnershipView.jsx`                                     | `transferOwnership.js` plus per-type services                                         |
| Duplicate User              | `DuplicateView.jsx`, `duplicators/user.jsx`             | `duplicate.js`, `userIndividualShares.js`, `share.js`                                 |
| Update Action Versions      | `UpdateWorkflowActionVersionsView.jsx`                  | `workflows.js`, `codeEngine.js`, `ceContractDiff.js`                                  |
| Generate Definition from JSDoc | `GeneratePackageDefinitionFromJSDocView.jsx`         | `domo-codeengine-manifest` package (`parseJSDoc.js`, `mergeManifest.js`)              |

The review was read-only and code-based. Nothing was exercised in a browser. Items marked
_plausible_ are inferred from the code and still need confirming. Line numbers are as of the
review and will drift.

Verdict: none of the seven is ready to drop Beta. Each has at least one way to silently damage
data or report success on a failure. Roughly half the per-feature items trace back to seven shared
problems, so those come first.

## Shared problems (Phase 1)

1. **Failures reported as success.**
   - `executeInPage` (`src/utils/executeInPage.js:170-177`) throws on `injection.error` but
     returns a `null` result as data. **Verified in Edge Dev 156:** Chrome never populates
     `error`; sync throws, async rejects and real `null` / `undefined` returns all come back as
     `{ result: null }`. Every service that throws inside the page (about 151 of 283 call sites)
     can report success or "nothing found" on a failure. Details and the fix are in
     [beta-phase-1-shared-fixes.md](beta-phase-1-shared-fixes.md) section 1.1.
   - Migrate Content: a failed column scan becomes "Safe to proceed".
   - Duplicate User: the log marks cards SHARED when their batch never ran.
   - Migrate Content: a failed Beast Mode overwrite still repoints cards.
2. **Stale cached definitions written back.** Remap Columns, Migrate Content and Generate
   Definition from JSDoc fetch definitions once and write them back much later, reverting edits
   made in between.
3. **No record of what changed, so no rollback.** Cards, views and Beast Modes have no version
   history in Domo. Pre-change definitions are already in memory. Transfer Ownership only builds
   its log in the email branch.
4. **Closing the panel mid-run.** No cancel. Close buttons stay enabled during runs. Closing the
   side panel abandons the run partway with no record.
5. **Re-running after a partial failure.** Selections and caches persist, so successes get saved
   again (each dataflow gets a no-op version with a misleading comment).
6. **Scale.** No HTTP 429 backoff anywhere. Several bulk calls are all-or-nothing (Beast Mode
   bulk save and create, card / group / dataflow transfers).
7. **No tests.** The column rewriter, SQL tokenizer and formula masking keep getting the same
   fixes (nesting depth, commented-out refs, view rebuilds), and are mostly pure functions.

## Feature findings

Order is roughly most to least ready.

### Generate Definition from JSDoc

Must fix:

- `resolveTargetVersion` (`mergeManifest.js:110`) always targets the latest version, ignoring
  the version open in the editor. Opening an old version while a newer unreleased draft exists
  overwrites the draft's code.
- Source is read once at load (`GeneratePackageDefinitionFromJSDocView.jsx:92`). Edits made after
  that are lost: the POST sends old text and `chrome.tabs.reload` discards newer unsaved edits
  (`:256`, `:274`). Re-read and compare at submit.
- Confirmed by running the parser: a nested function, a class method, and a JSDoc block above a
  top-level call (`setup();`) all become manifest functions with no warning. Cause: the catch-all
  `FN_DECL_PATTERNS` regex (`parseJSDoc.js:62`) with no top-level check. Contradicts
  JSDOC_FORMAT.md and the code-engine-jsdoc skill.
- `preserveNullableInEntry` (`mergeManifest.js:232`) keeps Domo's `nullable: true` whenever the
  derived value is false, so JSDoc can never make an optional input required again.

Should address:

- Functions deleted or renamed in source stay in the manifest with only a "Kept" chip.
- Inside a typedef, `@property {integer}` silently becomes `object` and a missing type becomes
  `text` (confirmed). Top-level unions, `Array<T>`, `Promise<T>` warn, then degrade to `object`.
- A signature param with no `@param` is only a warning; probably should be an error.
- A synchronous throw in `preparePackagePayload` leaves `isSubmitting` stuck (`:249-251`).
- A failed editor write only logs to the console (`:269`).
- An empty JSDoc description overwrites a description typed in Domo (visible in the diff).

Consider: `@param` descriptions are parsed but never written; no in-use warning
(`getCodeEngineUsage` exists); the view defaults language to JAVASCRIPT even though the button
rule blocks Python.

### Update Action Versions

Must fix:

- May report success when the save failed (shared problem 1). The contract lookups
  (`getSubflowContract`, `getFunctionContract`) can also receive `null` and build an empty
  contract, making the diff silently wrong.
- A failed contract diff (`:289`) leaves the action with no diff info, so it counts as "no review
  needed" and is still bumped.
- Entry from a Code Engine tile inside a workflow (`availableActions.js:168`) lacks the
  unreleased-version check that the workflow-version entry has (`:164`), so it can PUT onto a
  released version.
- `setReconciliations(defaults)` (`:313`) resets every action's remaps and toggles whenever the
  change set moves.

Should address:

- "Needs review" items (removed bound input, new required input, removed used output) don't block
  submit or require confirmation.
- `classifyEntries` in `ceContractDiff.js` pairs any removed and added entry of the same type as
  a rename, silently moving a binding to an unrelated input.
- The report from `reconcileTileForVersionBump` is discarded (`:466`).
- Lock handling clears locks but never re-takes one. Launching from the editor, the PUT plus tab
  reload discards unsaved editor changes without warning.
- Unreadable packages show a raw UUID and a disabled select with no explanation; mixed-version
  groups default to a null selection.
- An empty change set mid-diff (`:252`) leaves `isDiffing` true and the footer stuck on "Checking
  contract changes...".

Consider: nothing cascades into deeper subflows and the UI doesn't say so; downgrades to any
released version are allowed; Update Trigger Versions handles partial failure better but isn't
Beta; issue #80 (custom apps) needs a separate write path and is out of scope for graduation.

### Remap Columns

Must fix:

- Case-only renames are never detected: `indexColumnNames` / `resolveColumnName`
  (`src/utils/columnOrphans.js:29-37, 85-88`) match case-insensitively, so `sales` -> `Sales`
  shows "Nothing to Remap". Migrate Content handles it with `buildCanonicalCaseMap`
  (`migrateDownstreamContent.js:555`).
- `dispatchRemap` writes the scan-time `cachedDefinition` (`remapDatasetColumns.js:152`). After a
  partial failure, pressing Remap again re-saves successes.
- No undo. Only dataflows get a version comment.

Should address:

- Alerts and Jupyter Workspaces are not in `REMAP_TYPES`, though Migrate Content covers them
  (`migrateDownstreamContent.js:1452-1453`).
- `resp.droppedFilters` is never shown; only the first view-repair error is shown.
- Beast Modes go in one bulk save (`remapDatasetColumns.js:269`) with `strict:false` and only an
  HTTP status check (`functions.js:683-697`); _plausible_ that per-item rejections in a 200 count
  as success.
- A failed view repair doesn't stop the downstream remap.
- `detectBrokenViewColumns` returns `[]` for a data model (`repairViewColumns.js:60`) but the
  caller reads `detection.broken` (latent crash).

Consider: no type-mismatch warning; serial per type with no backoff or cancel.

### Migrate Beast Mode Usage

Must fix:

- Can delete the original while orphan drills still use it. `selectionIsComplete`
  (`MigrateBeastModeUsageView.jsx:435`) compares against `selectableIds`, which omits rows marked
  `unwritable` (orphan drills, `:267`, and card-saved nesting parents). Delete Original defaults
  on (`:125`) and the delete gate (`migrateBeastModeUsage.js:155-176`) ignores those rows too.
- Usage and nesting parents come from the stored context template (`:160`, `:183`;
  `beastModes.js:317`). Refresh re-reads the same stale links. `deleteOriginIfUnused` must fetch
  the template fresh and confirm no active links.
- Replacing an aggregating Beast Mode with a raw column changes results: aggregation is only
  re-applied to card value slots (`columnRewriter.js:657-662`); `DOMO_BEAST_MODE(o)/COUNT(y)`
  becomes `` `x`/COUNT(y) `` (`repointNestedBeastModeToColumn`, `columnRewriter.js:198`); filters
  on aggregated Beast Modes become row-level; the aggregation picker defaults to None with only a
  warning.

Should address: no warning when the aggregated flag differs between origin and target; nesting
parents labeled `Card ${hostId}`; `formulaDependencies` written onto dataset templates (possibly
stray); certified Beast Modes may lose certification or refuse delete (_plausible_); same rollback
and close-mid-run gaps.

### Transfer Ownership

Must fix:

- Delete-after-transfer (`OwnershipView.jsx:943`) deletes when `totalFailed === 0`, which counts
  only selected items. Types that failed to list, forbidden types, deselected items, and the 10
  types in the Not Checked banner (`:46`) are ignored. Require all types loaded, none forbidden,
  nothing deselected, and the banner acknowledged.
- The source can be chosen as the target (no `excludeKeys` on `OwnerComboBox`,
  `TransferOwnershipModal.jsx:219`), and deactivated users are allowed. Self-transfer breaks
  accounts (`accounts.js:263-283` grants OWNER then sets NONE) and cards (`cards.js:727-748`).
- No audit log unless email is on: `buildTransferLogRows` runs only in the email branch (`:900`)
  and only when `totalSucceeded > 0`.
- Projects and tasks: `getOwnedProjectsAndTasks` (`projects.js:48`) misses tasks in other
  people's projects; `transferProjectsAndTasks` (`:101-102`) appends the new owner without
  removing the source or deduping; log failure matching by `item.id` (`OwnershipView.jsx:1297`)
  ignores subType.

Should address:

- A whole-type failure records `failed: 1, count: 0` (`transferOwnership.js:517-521`); use
  `countOwned(owned)`.
- Add-then-remove types (cards, accounts) log FAILED when only the remove failed; add "partial".
- No refresh after a transfer, so re-entering selection reuses stale results.
- `transferCards`, `transferGroups`, `transferDataflows` send every ID in one request; ~30 types
  run in parallel with no 429 backoff.
- Target's rights to own each type are never checked (_plausible_ that APIs accept it anyway).
- Account credentials move with no notice.
- `userName` is put into the email HTML unescaped (`:1503`).

Consider: a per-type confirm step; Custom App Designs (commented out at
`transferOwnership.js:130`).

Coverage:

| Status                                     | Types                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Listed + transferred, user or group owner  | Accounts, App Studio Apps, Cards, DataSets, Goals, Groups, Pages, Worksheets, Workspaces                                                                                                                                                                                                                                           |
| Listed + transferred, user owner only      | AI Models, AI Projects, Alerts, AppDB Collections, Approvals, Approval Templates, Certification Processes, Code Engine Packages, DataFlows, Publications, Subscriptions, Document Collections, Functions, Governance Toolkit Jobs, Jupyter Workspaces, Metrics, Projects & Tasks (tasks partial), Reports, Sandbox Repositories, Scheduled Reports, Task Center Queues, Task Center Tasks, Workflows |
| In the Not Checked banner                  | AI Agents, AI Toolkits, API Clients, Buzz Channels, Cloud Integrations, Custom App Designs (disabled), Custom Connectors, Forms, Vector Indexes, Workbench Jobs                                                                                                                                                                      |
| In the type registry, never listed         | Access tokens, public embed links, PDP policies, dataset segments, sandbox deployments, Huddles, tag categories, data dictionaries, config apps, virtual/proxy users                                                                                                                                                                 |

Access tokens and public embed links are the riskiest gaps combined with delete-after-transfer.

### Duplicate User

Must fix:

- If `shareContent` throws partway through `shareBatched` (`duplicate.js:429`), unreached batches
  have no error entries and `buildDuplicationLogRows` (`user.jsx:380`) logs them SHARED.
- `DuplicateView.jsx:184` returns before `onComplete` when unmounted, so the log never downloads.
- `userIndividualShares.js:287` drops shares that come through a Workspace, but the new user is
  never added to that Workspace.
- `USER_PROFILE_FIELDS` (`duplicate.js:17`) copies `employeeId`, `employeeNumber`, `hireDate`,
  `phoneNumber` with no opt-out.
- Custom apps are listed and checked by default but logged SKIPPED (`duplicate.js:415`).

Should address:

- Role falls back via `source.roleId ?? source.role ?? 2` (`:170`); Admin is copied silently;
  preview shows "Role ID N".
- One unshareable card fails its whole batch of 100; `permissionMask` is captured but unused.
- Data App views are shared as `type: 'page'` (_plausible_ failure).
- Not duplicated: PDP policy membership, custom attributes, dataset / account / dataflow shares,
  group ownership, Workspace membership. Dynamic and system groups are dropped by
  `toAssignableGroups` without appearing in the preview.
- `createUser` sends the invite before access exists; returns null on a 2xx with no ID,
  orphaning a user.
- `getIndividualSharesForUser` runs an unbounded `Promise.all` (`:64`).

### Migrate DataSet Content

Furthest from ready. About 60 commits touch these files, with repeat fixes to Beast Mode nesting,
view and fusion round-trips, dataflow input collisions and commented-out refs.

Must fix:

- The target can be one of the migrated items. `dispatchDatasetSwap`
  (`migrateDownstreamContent.js:1885`) checks whether a view already reads the target, not whether
  it is the target. `findDataflowInputConflicts` (`:62-78`) checks inputs only, so a dataflow whose
  output is the target gets repointed to read its own output. Recursive dataflows: the blanket ID
  swap (`:1029`) also rewrites the output (_plausible_).
- `scanContentForColumns` (`columnReferences.js:701-709`) records a failed fetch as "uses no
  columns"; the view never reads `scanResult.errors` and can show "Safe to proceed"
  (`MigrateDownstreamContentView.jsx:2058-2075`).
- `mapIds` runs during classification (`:2196`); if the bulk overwrite then fails (`:2312-2319`)
  cards still move onto the target's different formula.
- Views the user can't read are dropped silently (`:273-276`).
- Definitions cached on page 2 (`view:668`) are written back at migrate time (`:505`, `:609`,
  `:719`, `:1592`).
- No change record. Reversing the migration is not a rollback because it also moves content
  native to the target.

Should address:

- `rewriteDataflowColumns` (`columnRewriter.js:307-311`) renames in every Magic ETL tile, not only
  the origin input's lineage.
- Bulk Beast Mode create (`:2263-2269`) is all-or-nothing per batch and blocks dependents.
- Phase 2 runs even when Beast Modes failed; no pre-flight edit-permission check.
- Page-2 close (`onClose={onBackToDefault}` near `:1959`) is enabled during a run.
- After a partial failure the list returns with migrated items still selected.
- Same-name Beast Modes default to Keep even when formulas differ.

Consider:

- Per-item progress, a small concurrency pool, retry.
- SQL edge cases (_plausible_): Redshift `x::date` with an origin column `date`; select items
  aliased without `AS`.
- Name what the tool doesn't migrate: workflows, Code Engine, App Studio and page saved filters
  and variables keyed by column name, publications.
- Cards moving onto a target with different PDP change who sees which rows. Fusions save with
  validation off (`:1381`). Created Beast Modes are owned by the operator.
- Lineage uses `maxDepth=4` (`:225`) but reads only direct children.
- Untested: federated, Cloud Amplifier, certified targets; case-only and whitespace differences.

## Cross-feature concerns

- **Define "out of Beta".** No telemetry, so the only signal is user reports. Link the Beta chip
  tooltip to GitHub issues and keep a written exit checklist (audit log, stale-write guard, cancel,
  rewriter tests).
- **Labels don't match.** README marks only Migrate DataSet Content and Generate Definition from
  JSDoc as Beta. Transfer Ownership was announced as Beta in 1.4.0 but its README entry isn't
  marked and describes delete-after-transfer without a warning.
- **Three column tools duplicate logic.** Remap Columns, Migrate Beast Mode Usage and Migrate
  Content each copy `handleSelectionChange`, `formatErrors`, `isParentKey`, the `onProgress`
  status reducer, the `UNMAPPED` / `DROP` sentinels, and the bulk-save failure handling. They have
  drifted (case handling, alert coverage, dropped-filter reporting) and run their pages in
  opposite orders.
- **Each migration tool should list what it doesn't touch**, like Delete does.
- **Issue #80** needs its own write path; keep it out of graduation scope.

## Tests worth writing

No suite exists. Vitest fits Vite. Highest value:

- `sqlColumns.js`: `tokenizeSql`, `rewriteStatement` (quoted and bare identifiers, comments,
  string literals holding column names, `UNION`, subqueries, `SELECT *`, `AS` preservation, `::`
  cast, implicit aliases).
- `columnFields.js`: `replaceExpressionRefs`, `maskExpressionNonCode` (backticks, `--`, `#`,
  escaped quotes, unterminated strings).
- `columnRewriter.js`: `rewriteCardColumns`, `rewriteBeastModeColumns`,
  `rewriteCardBeastModeToColumn`, `repointNestedBeastModeToColumn`, `removeCardColumns`,
  `dropDatasetViewColumns`, `rewriteDatasetViewColumns`, `rewriteDataflowSqlColumns`.
- `columnOrphans.js`, `columnDrops.js`, `columnMatching.js`, `beastModeLinks.js`.
- `migrateDownstreamContent.js`: `orderBeastModeCreateWaves`, `collapseDuplicateDataflowInput`,
  `applyCardBeastModeResolutions`, `collectOrphanedFormulaIds`, `dropValuelessCardFilters`,
  `buildCanonicalCaseMap`, `findDataflowInputConflicts`. The view rebuild helpers
  (`exprToString`, `rebuildProjectionFromTopSelect`, `regenerateTargetPalette`, `:1124-1256`) are
  inline in an injected function and need extracting first.
- `ceContractDiff.js` `classifyContractChanges`, `variableMatchesEntry`,
  `buildContractFromSchema`, `reconcileTileForVersionBump`, `groupActionTiles`.
- Transfer and duplicate: `filterOwnedToSelection`, `countOwned`, `flattenOwned`,
  `buildTransferLogRows`, `buildDuplicationLogRows` (batch-throw case), `toAssignableGroups`.
- Extracted delete-gate predicate for Migrate Beast Mode Usage.
- `domo-codeengine-manifest` (6 existing `node --test` cases): bracket and default forms, unions,
  `Array<T>`, `T[]`, `Promise<T>`, `{integer}`, `opts.x`, `rows[].id`, nested / class-method /
  call-site JSDoc that must be ignored, arrow / async / export forms, `appendModuleExports`
  idempotence, merge cases (kept, nullable both ways, curated `example`).

Browser fixture instance: a locked card, a view the tester can't read, a recursive dataflow, a
dataflow whose output is the target, a view as target, a Magic ETL join where inputs share a
column name, a two-level Beast Mode tree, 500+ cards.

## Suggested order

1. Phase 1: shared problems, starting with confirming the `null` result behavior.
2. Phase 2: silent data-destroying bugs (delete-after-transfer, self-transfer, deleting the
   original Beast Mode with orphan drills, target as a migrated item, failed scan read as safe,
   failed Beast Mode overwrite, wrong package version).
3. Phase 3: Vitest around the rewriter, SQL tokenizer, formula masking and JSDoc parser.
4. Phase 4: browser pass against the fixture instance.
