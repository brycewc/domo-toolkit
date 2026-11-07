---
published: false
---

# Feature Switch Awareness

Status: **implemented**, shipped in v1.5.0 (commit `b22758f`). This file started as the deferred design
plan; it now records the design as built, how it has grown since, and the follow-ups that remain open.

## Context

Domo instances are configured by feature switches (for example, `approvalcenter` enables Approvals and
everything related). The toolkit used to ignore them, because the main test instance is Domo's internal
instance, which has every switch on. On customer instances lacking a switch, features failed silently: Objects
Owned and Transfer Ownership fetched Approvals for every user, and on an instance without `approvalcenter`
those fetches errored and showed up as failed rows.

The fix is a shared mechanism that (a) loads the instance's switches once per session, (b) attaches them to
the `DomoContext` already passed everywhere, and (c) gates anything keyed to an object type, so a type whose
switch is absent is skipped (not fetched, not shown). The object-type registry is the source of truth.

Decisions that still hold:

- **Fail-open while unknown.** A gated item stays visible while `featureSwitches` is `null` (still loading,
  or the page global was unreadable), and is hidden only once a loaded list confirms the switch is absent.
- **Opt-in per type.** A type is gated by setting `featureSwitch` on its `DomoObjectType` definition. Every
  consumer that routes through `isTypeFeatureEnabled` respects it with no further wiring.

## Reading a switch (semantics)

`window.features.getConfig()` (MAIN world) returns an array like
`{ name: 'approvalcenter', enabled: true, type: 'STANDARD', purchased: false, ... }`. An absent switch is off,
and present entries always carry `enabled: true`; both are checked anyway. Only the `name` strings of entries
with `enabled === true` are stored, so membership in the stored array means "present and enabled."

Verified on domo.domo.com: the array lists default-on switches too (453 of the master list's 461 default-on
switches were present, the rest turned off there), and each entry carries `enabledDefault`. So absence means
off for default-on and default-off switches alike, and gating a default-on type is safe.

Switch names come from `apiContent`'s `contentidentity-app/src/main/resources/MasterFeatureList.json`, whose
`enabled` field is the default. That file can be stale: AI toolkits work on domo.domo.com without the
`ai-services-toolkits` switch it lists, so confirm a name against a real instance before gating on it.

### Requirement syntax

`featureSwitch` is a switch name, a `!`-prefixed name that must be absent (a switch that turns a feature off),
or an array met when any entry is. Arrays cover features with two candidate switches where it is unclear which
one actually governs the feature.

| Type(s)                                                        | Requirement                                     |
| -------------------------------------------------------------- | ----------------------------------------------- |
| `APPROVAL`, `TEMPLATE`                                         | `approvalcenter`                                |
| `AI_MODEL`, `AI_PROJECT`                                       | `ai-services`                                   |
| `AI_TOOLKIT`                                                   | `ai-services` (see the stale-list note above)   |
| `CERTIFICATION`, `CERTIFICATION_PROCESS`                       | `certified-content`                             |
| `CODEENGINE_PACKAGE`                                           | `code-engine`                                   |
| `DATA_APP`, `DATA_APP_VIEW`                                    | `data-app`                                      |
| `DATA_MODEL`                                                   | `data-modeling` (dormant, see below)            |
| `DATA_SCIENCE_NOTEBOOK`                                        | `jupyter-notebooks` or `jupyter-notebooks-ga`   |
| `EXECUTOR_JOB`                                                 | `executor-pipeline` or `governance-toolkit-ui`  |
| `GOAL`                                                         | `goals-beta` or `goals-v1`                      |
| `HOPPER_QUEUE`, `HOPPER_TASK`                                  | `hopper`                                        |
| `METRIC`                                                       | `metrics`                                       |
| `PROJECT`, `PROJECT_TASK`                                      | `!no-projects-tasks`                            |
| `PUBLICATION`, `SUBSCRIPTION`                                  | `publish-everywhere` or `publish-everywhere-v2` |
| `REPORT_BUILDER`, `REPORT_BUILDER_PAGE`, `REPORT_BUILDER_VIEW` | `report-builder`                                |
| `REPORT_SCHEDULE`                                              | `scheduled-reports`                             |
| `REPOSITORY`                                                   | `domo-versions-standard` or `domo-versions-ui`  |
| `WORKFLOW_MODEL`                                               | `workflows`                                     |
| `WORKSHEET`, `WORKSHEET_VIEW`                                  | `app-studio-worksheets`                         |
| `WORKSPACE`                                                    | `workspaces-react` or `workspaces-v1`           |

Every name in the table was confirmed present on domo.domo.com on 2026-11-02, and all of the default-on ones
carry `enabledDefault: true`. The "or" pairs on `EXECUTOR_JOB` and `WORKSPACE` hedge over which switch really
governs the feature, so the type hides only when every candidate is absent.

### Deliberately ungated

- **AppDB (`MAGNUM_COLLECTION`, `MAGNUM_DATASTORE`).** Objects Owned reads collections through
  `/api/datastores/v1/collections/query`, the same endpoint custom apps use. `appdb-admin` most likely governs
  only the admin UI, so gating on it could hide collections that work fine.
- **Filesets.** No base switch exists. The config's only candidate is `file-directories`, too uncertain to
  gate on; the `wf-fs-*` names the master list carries are workflow tiles and absent from the live config.
- **`DATA_MODEL` is gated but dormant.** A data model is only reached from its own page (which proves the
  switch is on) or as a dataset subtype, so nothing lists items by that type. The metadata is kept because it
  is accurate and costs nothing.

## As built

| File                                     | What it holds                                                                                                                                                                           |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/features.js`               | `getFeatureSwitches(tabId)`: polls `window.features.getConfig()` up to 30 x 250 ms, returns enabled names or `null`. Also `isFeatureSwitchOn(name, tabId)` (see below).                 |
| `src/utils/featureSwitches.js`           | `getTypeFeatureSwitch(typeId)`, `isFeatureSwitchEnabled(requirement, context)` (fail-open), `isTypeFeatureEnabled(typeId, context)`.                                                    |
| `src/models/DomoObjectType.js`           | Constructor stores `options.featureSwitch ?? null`. See the requirement table above for the gated types.                                                                                |
| `src/services/codeEngine.js`             | `getCodeEngineUsage` / `getCodeEngineUsageSummary` take `featureSwitches` and return an empty, non-error result for a kind whose type is off, so Delete and Get Usage don't fail on it. |
| `src/components/ContextFooter.jsx`       | A lazy array tab is skipped when `isTypeFeatureEnabled(itemTypeId, currentContext)` is false (the Code Engine usage tabs, among others).                                                |
| `src/models/DomoContext.js`              | `featureSwitches` in the constructor, `fromJSON`, and `toJSON`. `toStorageJSON` nulls it alongside `user`/`userGroups`, since those are per instance, not per tab.                      |
| `src/background.js`                      | `getInstanceUser` fetches groups and switches in parallel and caches them per instance. `applyInstanceUser` writes all three onto a context.                                            |
| `src/components/views/OwnershipView.jsx` | Memoized `transferTypes` filtered by `isTypeFeatureEnabled` (and `groupOwnable` for a group source). The `autoEnableSelectionMode` pre-selection applies the same filter to `context`.  |

### Loading and caching (`background.js`)

The plan folded switches into the per-instance user rail, and that rail has since grown several entry points.
All of them carry `featureSwitches` because they go through the same cache entry or `applyInstanceUser`:

- `getInstanceUser(instance, tabId)` returns `{ featureSwitches, user, userGroups }`, from cache when the cached
  user has `USER_RIGHTS`, otherwise fetching. The "only cache a user with non-empty `USER_RIGHTS`" gate is
  unchanged, so switches are cached and dropped together with the user. A failed switch read logs a warning and
  resolves to `null` (fail-open) without failing the user fetch.
- `applyInstanceUser(context, instanceUser)` replaced the inline assignments the plan described in
  `detectAndStoreContext`. It also recomputes `isOwner`.
- `backfillInstanceUser` pushes a freshly resolved entry onto other tabs on the same instance that are still
  missing a user, and `refreshTabUser` fills one tab in without redetecting. Both reuse `applyInstanceUser`.
- The instance-user backup (`instanceUsersBackup`) persists `featureSwitches` per instance with a 12-hour TTL
  (`INSTANCE_USER_TTL_MS`), and `restoreFromSession` rehydrates each tab's `featureSwitches` from that cache,
  because `toStorageJSON` strips it from the per-tab backup.
- `invalidateInstanceUser` (logout) clears the whole entry, switches included.

`getSidepanelData()` serializes with `toJSON`, not `toStorageJSON`, so views opened in the side panel receive
`featureSwitches` intact.

### Wired consumers

| Consumer                           | How it gates                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `OwnershipView`                    | Filters `TRANSFER_TYPES` by type (below). Covers most of the requirement table.                         |
| `MigrateDownstreamContentView`     | `jupyterEnabled` suppresses the Jupyter prompt, row, search, and the bail-out toast's search offer.     |
| `ContextFooter`                    | Skips a lazy array tab whose `itemTypeId` is off.                                                       |
| `GetUsageView`, `DeleteObjectView` | Pass `featureSwitches` to the Code Engine usage and delete-dependency services, which skip an off kind. |

### Objects Owned / Transfer Ownership

`OwnershipView` maps its `TRANSFER_TYPES` keys to type IDs through its own `TYPE_KEY_TO_DOMO_TYPE`, and every
gated type in the requirement table except `DATA_MODEL` appears there. Every body-level iteration (fetch specs,
forbidden set, counts, selection, rows, the submit handler's enabled types) uses the filtered `transferTypes`,
so a feature-disabled type never gets a fetch spec and never produces a row. The parse helpers at the bottom of
the file still reference the full `TRANSFER_TYPES`, which is harmless because hidden types never enter the
selection set.

`transferAllOwnership` (in `services/transferOwnership.js`) filters `TRANSFER_TYPES` by the `enabledTypes` set
the view passes, so it inherits the gate without checking switches itself.

## Changes since the original plan

- **`DATA_MODEL` is gated on `data-modeling`**, added with data model support (`73f1c58`). No consumer checks
  it yet: data models are not a transfer type, and nothing else calls `isTypeFeatureEnabled`. The metadata is
  dormant until a consumer for that type routes through the helper.
- **`isFeatureSwitchOn(name, tabId)`** was added to `services/features.js` for the Enable/Disable Dev Tools
  button on dataflows (`dataflows-dev`, in `components/buttons/Navigate.jsx`). It deliberately does **not** use
  the cached context list. It asks the page live via `window.features.on(name)`, falling back to the
  `domoFeatures` entry in `sessionStorage`, because the button toggles the switch for the session with a
  `?_f=` URL parameter (`setFeatureSwitch` in `utils/domoQueryParam.js`) and has to reflect the overridden
  state, not the instance's configured one.
- **Migrate Content gates Jupyter itself.** `MigrateDownstreamContentView` does not use `TRANSFER_TYPES`; its
  type map in `views/migrateDownstream/contentTypes.js` includes `DATA_SCIENCE_NOTEBOOK`, so the view derives
  `jupyterCheckStarted` from the user's request and `isTypeFeatureEnabled`. It is the only other per-view map
  with a gated type.
- **Default-on types gated (2026-11-02).** App Studio, Worksheets, Workspaces, Task Center, Report Builder,
  Scheduled Reports, Certified Content, and Governance Toolkit jobs, after confirming that absence means off.
- **Group sources.** `OwnershipView` now also browses groups, and the `transferTypes` memo additionally keeps
  only `groupOwnable` types for a group source. The approval types are not group-ownable.

## Known limitations

- **The cached list is a session snapshot.** It reflects the instance's configured switches at load time, and
  does not track `?_f=` session overrides, which `features.getConfig()` may or may not reflect at read time.
  Anything that must follow an override should read live, the way `isFeatureSwitchOn` does.
- **A null list is cached as null.** If the page global is unreadable on the first read but the user's rights
  are present, the entry caches `featureSwitches: null` for up to the TTL. That is fail-open, so the cost is only
  the original failing-row behavior, not hidden features.

## Hiding path verified (2026-11-02)

With `getFeatureSwitches` stubbed to drop `approvalcenter`, `app-studio-worksheets`, `hopper`, the two Jupyter
switches, and the two Workspaces switches, the real side panel on domo.domo.com showed Objects Owned without
Approvals, Approval Templates, Jupyter Workspaces, Workspaces, Task Center Queues/Tasks, or Worksheets, and no
failed rows. Migrate Content showed neither the Jupyter prompt nor its row. With the stub removed, all of them
returned. A real customer instance has still not been checked.

## Deferred by design

- **Action gating.** An action runs on an object whose own page already proves its feature is on, so none needs
  it. When one does, add `isTypeFeatureEnabled(typeId, currentContext)` to the relevant set in
  `getAvailableActions()` (`src/utils/availableActions.js`).
- **Per-view type maps.** `RemapColumnsView`, `MigrateBeastModeUsageView`, and `ColumnUsagesModal` hold no
  gated types. Any that gains one should filter through the helper the way `OwnershipView` does.
- **Revisit AppDB, Filesets, and `DATA_MODEL`** (see "Deliberately ungated") only if a customer report shows a
  failed row for one of them.

## Verification recipe (for new consumers)

1. ESLint every touched file: `npx eslint --no-warn-ignored <files>`.
2. Regression on an all-switches instance: the gated rows still appear and fetch normally (fail-open path).
3. Missing switch: on an instance without the switch, or with `getFeatureSwitches` temporarily stubbed to
   return a list that omits it, confirm the rows are absent, no fetch fires, and no failed row appears.
4. Side-panel views are not covered by the `/dev-*` routes. Use the CRXJS dev extension, and the direct-CDP
   Playwriter recipe in `.claude/rules/local-testing.md` for screenshots.
