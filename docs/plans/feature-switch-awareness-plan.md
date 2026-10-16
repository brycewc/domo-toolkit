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

| Type(s)                       | Requirement                                     |
| ----------------------------- | ----------------------------------------------- |
| `APPROVAL`, `TEMPLATE`        | `approvalcenter`                                |
| `AI_MODEL`, `AI_PROJECT`      | `ai-services`                                   |
| `AI_TOOLKIT`                  | `ai-services` (see the stale-list note above)   |
| `CODEENGINE_PACKAGE`          | `code-engine`                                   |
| `DATA_MODEL`                  | `data-modeling`                                 |
| `DATA_SCIENCE_NOTEBOOK`       | `jupyter-notebooks` or `jupyter-notebooks-ga`   |
| `GOAL`                        | `goals-beta` or `goals-v1`                      |
| `METRIC`                      | `metrics`                                       |
| `PROJECT`, `PROJECT_TASK`     | `!no-projects-tasks`                            |
| `PUBLICATION`, `SUBSCRIPTION` | `publish-everywhere` or `publish-everywhere-v2` |
| `REPOSITORY`                  | `domo-versions-standard` or `domo-versions-ui`  |
| `WORKFLOW_MODEL`              | `workflows`                                     |

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

### The one wired consumer: Objects Owned / Transfer Ownership

`OwnershipView` maps its `TRANSFER_TYPES` keys to type IDs through its own `TYPE_KEY_TO_DOMO_TYPE`
(`approvals` -> `APPROVAL`, `approvalTemplates` -> `TEMPLATE`). Every body-level iteration (fetch specs,
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
- **The plan's note about Transfer Content no longer applies.** `MigrateDownstreamContentView` does not use
  `TRANSFER_TYPES`; it has its own type map in `views/migrateDownstream/contentTypes.js` (alerts, apps, Beast
  Modes, cards, dataflows, datasets, Jupyter Workspaces), none of which are gated today. If a gated type joins
  that list, it needs its own `isTypeFeatureEnabled` filter.
- **Group sources.** `OwnershipView` now also browses groups, and the `transferTypes` memo additionally keeps
  only `groupOwnable` types for a group source. The approval types are not group-ownable.

## Known limitations

- **The cached list is a session snapshot.** It reflects the instance's configured switches at load time, and
  does not track `?_f=` session overrides, which `features.getConfig()` may or may not reflect at read time.
  Anything that must follow an override should read live, the way `isFeatureSwitchOn` does.
- **A null list is cached as null.** If the page global is unreadable on the first read but the user's rights
  are present, the entry caches `featureSwitches: null` for up to the TTL. That is fail-open, so the cost is only
  the original failing-row behavior, not hidden features.

## Open follow-ups

- **Action gating.** No action button is gated by a type's switch yet; the investigation found none that
  needs it, since an action runs on an object whose own page already proves its feature is on. When one needs it, add
  `isTypeFeatureEnabled(typeId, currentContext)` to the relevant set in `getAvailableActions()`
  (`src/utils/availableActions.js`, which receives `currentContext`).
- **Wire `DATA_MODEL`** into whichever consumer first lists or fetches data models by type, or drop the
  `featureSwitch` if none ever does.
- **Default-on features left ungated:** Workspaces (`workspaces-v1`), Task Center (`hopper`), Report Builder
  (`report-builder`), Certified Content (`certified-content`), App Studio (`data-app`), Worksheets
  (`app-studio-worksheets`), Governance Toolkit (`governance-toolkit-ui`), AppDB (`appdb-admin`). Gating them is
  safe now that absence is known to mean off; they were skipped as low value.
- **Filesets** have no obvious base switch (only the `wf-fs-*` workflow tiles), so they stay ungated.
- **Confirm the missing-switch behavior on a customer instance.** Only an all-switches instance has been
  checked, which exercises the fail-open path, not the hiding.
- **Other per-view type maps.** `RemapColumnsView`, `MigrateBeastModeUsageView`, `ColumnUsagesModal`, and
  `migrateDownstream/contentTypes.js` each have their own `TYPE_KEY_TO_DOMO_TYPE`. None include gated types now;
  any that gain one should filter through the helper the same way `OwnershipView` does.

## Verification recipe (for new consumers)

1. ESLint every touched file: `npx eslint --no-warn-ignored <files>`.
2. Regression on an all-switches instance: the gated rows still appear and fetch normally (fail-open path).
3. Missing switch: on an instance without the switch, or with `getFeatureSwitches` temporarily stubbed to
   return a list that omits it, confirm the rows are absent, no fetch fires, and no failed row appears.
4. Side-panel views are not covered by the `/dev-*` routes. Use the CRXJS dev extension, and the direct-CDP
   Playwriter recipe in `.claude/rules/local-testing.md` for screenshots.
