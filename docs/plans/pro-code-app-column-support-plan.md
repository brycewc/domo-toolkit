---
published: false
---

# Pro-Code App Support for Remap Columns & Migrate Content (design plan)

Status: not started. This is the agreed implementation plan, saved for later pickup. All Domo API
shapes below were confirmed against a live broken app (read-only GETs, plus two PUTs captured from
the Domo app editor's own "save data binding" action), not guessed.

## Context

Remap Columns ([RemapColumnsView.jsx](../../src/components/views/RemapColumnsView.jsx)) and Migrate
Downstream Content ([MigrateDownstreamContentView.jsx](../../src/components/views/MigrateDownstreamContentView.jsx))
repair/repoint four downstream content types today: `beastModes`, `cards`, `dataflows`, `datasets`.
Pro-code apps (Domo custom apps / App Platform / "ryuu" apps) are not handled.

A pro-code app binds to a dataset and references its columns. When a dataset column is renamed, the
app's reference breaks. The motivating case: an app field `{ alias: "CyroStatus", columnName: "Cyro
Status" }` where the dataset column `Cyro Status` was renamed to `Cryo Status`, leaving the field
dangling. The app's own code references the stable `alias` (`CyroStatus`); only the `columnName` (the
bridge to the real dataset column) breaks, so the fix is to rewrite `columnName` and nothing else.

This is also a latent bug fix, not only a new feature: pro-code apps surface as `domoapp` cards and
already flow into both views inside the `cards` group, where `getCardDefinition` (POST
`/api/content/v3/cards/kpi/definition`) and the card PUT (`/api/content/v3/cards/kpi/{id}`) both
return **405 Method Not Allowed**. So today app cards land in the Cards group and silently error
during scan/rewrite.

## Key finding: the binding is card-scoped, not design-scoped

An initial concern was that the column mapping lived on the shared app **design version**
(`/api/apps/v1/designs/{id}?parts=versions` → `versions[].datasetsMapping`), which would mean one
fix affects every card built on that design. That turned out to be only the **seed template**. The
live mapping each placed app card actually uses lives on that card's **instance → context**, and
every placed card has its own instance and its own context. Verified: two `domoapp` cards on the
same dataset shared one design (`70c97d08…`) but had distinct instances/contexts:

| Card        | Instance (`domoapp.id`) | Context      |
| ----------- | ----------------------- | ------------ |
| 2097966701  | 870fcb1c…               | 29b126ae…    |
| 669488890   | f7e2aea3…               | 9ce8f455…    |

So a pro-code app behaves like a chart card: card-scoped, independently selectable, rewritten in
isolation. No design-level dedup, no "fixing one fixes all" caveat. This dissolves the only UX
decision that was open.

## Confirmed API model

### Discover apps consuming the dataset

The existing downstream-cards endpoint already returns app cards, tagged by `type`:

```
GET /api/content/v1/datasources/{datasetId}/cards?drill=true
```

Each entry carries `type`: `"domoapp"` for pro-code apps, `"kpi"` for chart cards. (App-card entries
have no `chartType`.) Split on `type === 'domoapp'`.

The list does NOT carry the instance id (`domoapp.id`), title, or fullpage flag. One batch metadata
call resolves them for all app cards:

```
GET /api/content/v1/cards?urns={id1,id2,...}&parts=metadata,domoapp,datasources&includeFiltered=true
```

Returns per card: `metadata.chartType === "domoapp"`, `metadata.fullpage`, `domoapp.id` (the app
**instance** id), `title`, and `datasources[].dataSourceId`.

### Read the live mapping (one call)

```
GET /domoapps/apps/v2/{instanceId}
```

Returns `{ id, context: { id, designId, designVersion, mapping: [...], collections, accountMapping,
actionMapping, workflowMapping, packageMapping, ... } }`. This gives both the current `contextId`
(`context.id`) and the full live mapping in a single request.

`context.mapping` is an array of dataset bindings:

```jsonc
{
  "alias": "GOLDMajorDomoDataSets",
  "dataSetId": "a40d44a7-c399-4949-9d16-6f9fccd331cc",
  "fields": [
    { "alias": "DataSetID", "columnName": "DataSet ID", "fieldType": null, "beastModeName": null },
    { "alias": "CyroStatus", "columnName": "Cryo Status", "fieldType": null, "beastModeName": null, "valid": true },
    // ...
  ],
  "dql": null,
  "valid": false
}
```

Find the `mapping[]` entry whose `dataSetId === datasetId`. Its `fields[].columnName` values are the
column references. The app code uses `alias`, so only `columnName` ever breaks. Fields that map to a
Beast Mode via `beastModeName` (instead of `columnName`) are OUT OF SCOPE for column remap (skip
them; possible future extension for Beast Mode renames).

NOTE: also available but NOT the right write target: the design version's declared
`datasetsMapping` at `GET /api/apps/v1/designs/{designId}?parts=versions`, and the v1 instance's
`datasetsMapping` at `GET /api/apps/v1/instances/{instanceId}` (was `null` here, with AppDB
`collectionsMapping` instead). The v2 context is the live source of truth.

### Write (the editor's exact two-PUT sequence)

Captured from the Domo app editor when it saved a corrected data binding:

```
1) PUT /domoapps/apps/v2/contexts/{contextId}
   body: the FULL context object, round-tripped, with only
         mapping[entry].fields[].columnName rewritten
         (and, for migrate, mapping[entry].dataSetId repointed origin -> target)

2) PUT /domoapps/apps/v2/{instanceId}?fullpage={fullpage}&cardTitle={encodedCardTitle}
   body: { "contextId": "{contextId}", "id": "{instanceId}" }
```

`fullpage` and `cardTitle` come from the card metadata. Leave the `valid` flags to the server
(it recomputes); round-trip everything else verbatim and mutate only `columnName` / `dataSetId`.

Open detail to settle while coding: whether to PUT the existing `contextId` in place (no orphaned
contexts) or mint a fresh context UUID like the editor did (observed-good, but leaks the old
context). Plan: try in-place first, fall back to mint-and-repoint only if Domo rejects it.

## Decisions made with the user

- Card-scoped, treated like chart cards (forced by the per-instance/per-context model above).
- `beastModeName`-mapped fields are out of scope (column remap only).
- Apps are TRUSTED for orphan auto-discovery (like cards and dataset Beast Modes), because a
  `context.mapping` entry is scoped to exactly one `dataSetId`, so a referenced `columnName` is
  unambiguously one of this dataset's columns.

## Approach

1. **New service `src/services/proCodeApps.js`** (all network via `executeInPage`):
   - `getDownstreamApps(datasetId, tabId)` — filter downstream cards to `type === 'domoapp'`,
     batch-resolve instance ids / titles / fullpage, read each instance's context, keep the
     `mapping` entry for `datasetId`. Returns rows
     `{ id: cardId, instanceId, contextId, name, fullpage, designId, fields }`.
   - `scanAppColumns(...)` — the `columnName` set from those fields (skip `beastModeName`-only),
     feeding the shared scan maps.
   - `remapAppColumns(...)` / `swapAppColumns(...)` — clone the context, rewrite `columnName`
     (+ `dataSetId` for migrate), run the two PUTs.

2. **Stop app cards 405-ing in the cards path.** Tag `getDownstreamCards`
   ([migrateDownstreamContent.js](../../src/services/migrateDownstreamContent.js)) results with
   `type` and EXCLUDE `domoapp` from the cards group. Share the single cards fetch between the
   cards spec and `getDownstreamApps` (the same way the lineage promise is shared today) so the
   endpoint isn't hit twice.

3. **Add the `apps` content type:**
   - Add `{ key: 'apps' }` to `REMAP_TYPES` ([RemapColumnsView.jsx](../../src/components/views/RemapColumnsView.jsx))
     and `MIGRATE_TYPES` ([migrateDownstreamContent.js](../../src/services/migrateDownstreamContent.js)).
   - Add `apps: 'RYUU_APP'` to both `TYPE_KEY_TO_DOMO_TYPE` maps (the existing `RYUU_APP`
     "Custom App (Pro-Code)" type provides icon + label, and an `/assetlibrary/{designId}/overview`
     link for the row).
   - Thread `apps: []` through the several `{ beastModes, cards, dataflows, datasets }` accumulator
     literals in both views.

4. **Wire apps into the scanner** ([columnReferences.js](../../src/services/columnReferences.js)):
   add an `apps` branch in `scanContentForColumns` so app field `columnName`s populate `byColumn` /
   `byItem` like card refs do; add `'apps'` to the trusted-source filter in `orphanCandidates`
   ([RemapColumnsView.jsx](../../src/components/views/RemapColumnsView.jsx), the
   `usages.some(u => u.type === 'beastModes' || u.type === 'cards')` gate).

5. **Remap Columns** (the confirmed `CyroStatus` / `Cryo Status` case): route `apps` through
   `remapAppColumns` in [remapDatasetColumns.js](../../src/services/remapDatasetColumns.js)
   (`dispatchRemap` branch). Same dataset, `columnName`-only rewrite.

6. **Migrate**: add an `apps` branch to `dispatchSwap`
   ([migrateDownstreamContent.js](../../src/services/migrateDownstreamContent.js)) that repoints
   `dataSetId` and remaps `columnName`s. Apps carry no Beast Modes, so they skip the Beast Mode
   reconciliation phases entirely.

7. **Verify + notes**: test the remap against a live app card via the side panel; add WIP
   release-note bullets (one per view), phrased for users, e.g. "Remap Columns now repairs pro-code
   app cards whose dataset column references break after a rename" and the migrate equivalent.

## Suggested build order

Remap Columns half first (the user's confirmed case) plus the shared `proCodeApps.js` service and
the cards-path 405 fix, then the Migrate branch.

## Reference IDs from the investigation (test instance: domo.domo.com)

- Dataset: `a40d44a7-c399-4949-9d16-6f9fccd331cc` ("GOLD | MajorDomo | DataSets")
- App design: `70c97d08-d68f-4e42-b708-033bdbe08c22` ("My Dataset Management Dashboard")
- App card 2097966701 → instance `870fcb1c-574c-498f-b75b-6c4b7c979e85` → context
  `29b126ae-2083-4b8f-ba1d-fb529acff05a`
- The renamed field: `{ alias: "CyroStatus", columnName: "Cyro Status" }` → fixed to
  `columnName: "Cryo Status"`.
