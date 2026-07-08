# Add Subflow Version Updating to the Code Engine Versions View

## Context

`UpdateCodeEngineVersionsView` lets a user bump the version of every Code Engine
action tile inside a workflow and reconciles the input/output contract changes a
bump causes (renamed params keep their bindings, removed bindings prompt for
remap, type/schema changes offer to update the bound variable, etc.).

A **subflow** is a workflow action tile that kicks off another workflow. It has
the exact same problem: changing the referenced workflow's version can add,
remove, rename, or retype the subflow's declared inputs/outputs, which silently
unmaps the tile's bindings. Today this view ignores subflow tiles entirely (and
a workflow containing only subflows shows "No Code Engine Packages" and bails).

Goal: parse subflow tiles alongside Code Engine tiles in the same view, offer the
same version-bump + reconciliation flow, and write the change back safely.

Decisions (confirmed with the maintainer):
- User-facing name becomes **"Update Action Versions"** (internal file/component/
  view-type identifiers stay unchanged).
- Layout is a **unified list with a per-row type icon** (no separate sections).

## What a subflow tile looks like (verified live)

A subflow `designElement` is identified by `el.data._designNode === 'SUB_FLOW'`
(with `el.data.modelId` + `el.data.modelVersion` present). Unlike a Code Engine
tile it has **no** `taskType`/`metadata`; instead:

- `data.modelId` - the referenced workflow's model id (the "package" equivalent)
- `data.modelVersion` - the referenced version (the field a bump mutates, vs. CE's `data.metadata.version`)
- `data.input[]` / `data.output[]` - the tile's bound params, same param shape as CE tiles
- `data.execution` - a fixed execution-metadata output (id, modelName, startedBy, ...); NOT part of the versioned contract, left untouched
- `data.wait` - boolean, untouched

**The referenced workflow's contract** at a given version lives in that version's
definition under a top-level `schema` object:
`schema.inputs` and `schema.outputs`, each a map keyed by param id with shape
`{ name, type, subType, isList, isNullable, id, isChild, parent }`. The subflow
tile's input param `id`s match the referenced workflow's `schema.inputs` ids
exactly (stable across versions), so a newly added input must carry the schema id.

## Design: generalize the existing view and shared utils around a tile "kind"

Keep the same view, button, `updateCodeEngineVersions` view-type, and file names
(only user-facing text changes). Introduce a per-group `kind: 'codeengine' | 'subflow'`.
No detection or `availableActions` change is needed: selecting a subflow node
already resolves to `WORKFLOW_MODEL_VERSION`, which already shows this view's
button; the view simply needs to stop ignoring subflow tiles.

### New: subflow contract fetch + schema normalizer

`src/utils/subflowContract.js` (new):
- `getSubflowContract({ cache, modelId, tabId, version })` - mirrors
  `getFunctionContract` in `src/utils/ceContractDiff.js`: fetch the referenced
  version's definition via `getVersionDefinition(modelId, version, tabId)` (cache
  by `modelId@version`), then return a normalized contract.
- `buildContractFromSchema(schema)` - turn the flat `schema.inputs`/`schema.outputs`
  maps into `{ inputs: Entry[], outputs: Entry[] }` where each `Entry` matches the
  Code Engine manifest shape the diff/reconcile code expects:
  `{ id, name, type, entitySubType: subType, isList, nullable: isNullable, children: [] }`.
  Reconstruct nesting from `parent`/`isChild` (scalar inputs, the common case, have
  no children; nested-object I/O handled best-effort).

### New service: one-call name + versions

`getWorkflowModelInfo(modelId, tabId)` in `src/services/workflows.js` - a single
`GET /api/workflow/v1/models/{modelId}` returns both `name` and `versions[]` (each
entry has `version` + `deployedOn`, where `deployedOn != null` means released, the
equivalent of CE's `released != null`). Mirrors `getCodeEnginePackageInfo`.
(Avoids two calls via the existing `getWorkflowModelName` + `getWorkflowVersions`.)

### Generalize the shared diff/reconcile utils (small, non-breaking)

- `src/utils/ceContractDiff.js` `classifyContractChanges`: read outputs generically -
  `oldFn.outputs ?? (oldFn.output ? [oldFn.output] : [])` (and same for new). CE
  still passes a single `output`; subflow passes an `outputs` array. Everything
  downstream already diffs outputs as a list.
- `src/utils/workflowTileIO.js` `reconcileTileForVersionBump`: same generic output
  read for `manifestEntries`.
- `buildParamFromManifest` (and `manifestChildrenToParamChildren`): use
  `entry.id ?? generateTileId()` for the param id so a newly added subflow input
  keeps the referenced workflow's stable schema id. CE entries have no `id`, so
  behavior there is unchanged.

### Generalize the view: `src/components/views/UpdateCodeEngineVersionsView.jsx`

- **Parse**: replace `groupTilesByPackage` with a combined pass that also collects
  subflow tiles (`_designNode === 'SUB_FLOW'`), grouped by `modelId`, producing
  groups tagged `kind: 'subflow'` with `actions[{ actionName, currentVersion: modelVersion, elementId }]`.
- **Load**: for subflow groups, enrich with `getWorkflowModelInfo` (name +
  released versions sorted by `compareSemver`), in the same `Promise.all` as CE
  package enrichment. No "Built-in" concept for subflows. If a workflow has
  neither CE packages nor subflows, keep the bail; otherwise show whatever exists
  (fixes the subflow-only bail).
- **Diff** (the `changeSignature` effect): branch only on how the old/new contract
  is fetched - CE uses `getFunctionContract`, subflow uses `getSubflowContract`.
  Feed both into the existing `buildActionContractInfo({ change, definition, newFn, oldFn })`,
  which is already tile-kind-agnostic (uses `getTileParams`, `indexVariablesById`,
  `getVariableConsumers`, `variableMatchesEntry` on `data.input`/`data.output`).
- **Submit** (`handleSubmit`): branch the mutation by kind - CE sets
  `element.data.metadata.version`, subflow sets `element.data.modelVersion` - then
  both call the shared `reconcileTileForVersionBump`. `data.execution`, `modelId`,
  `wait` are left untouched.
- **Render**: reuse the same group card, version selects, and `ActionReconciliation`
  panels; branch by kind only for the link href (subflow -> `/workflows/models/{modelId}`),
  the "Built-in" chip (CE only), and the group label (referenced workflow name).
- **Type indicator (unified list)**: keep the single scrollable list; add a small
  per-group indicator (icon, and/or a soft chip) marking each group as Code Engine
  vs Subflow. Code Engine keeps `IconPackage`; subflows use a workflow icon from
  the icon set (reuse whatever `WORKFLOW_MODEL` uses in `DomoObjectType`). No
  section headers.
- **Text** (chosen name "Update Action Versions"):
  - Header feature: `Update Action Versions for {workflow}` / `Update Action Versions`.
  - Empty-state (when no CE packages AND no subflows): reword away from "No Code
    Engine Packages" to cover both (e.g. "This workflow version has no Code Engine
    actions or subflows.").
  - Subtext counts: generalize the `N packages | M actions` line so it reads
    naturally with mixed kinds (e.g. count total groups and total actions).

### Button text: `src/components/functions/UpdateCodeEngineVersions.jsx`

Button label -> "Update Action Versions"; tooltip reworded to mention both Code
Engine and subflow actions. (`IconPackage` stays as the button icon.)

## Files touched

- New: `src/utils/subflowContract.js`
- Edit: `src/services/workflows.js` (add `getWorkflowModelInfo`)
- Edit: `src/utils/ceContractDiff.js` (generic outputs)
- Edit: `src/utils/workflowTileIO.js` (generic outputs + stable param id)
- Edit: `src/components/views/UpdateCodeEngineVersionsView.jsx` (parse/load/diff/submit/render/text)
- Edit: `src/components/functions/UpdateCodeEngineVersions.jsx` (label/tooltip)
- Edit: `docs/RELEASE_NOTES.md` (WIP note)

## Verification

- `npx eslint --no-warn-ignored` on every edited/created file.
- End-to-end against the live workflow `14250d19-f3f7-49ce-a511-38a66cf8f393`
  (version `0.3.0`, subflow "6 Month Renewal Email" referencing model version
  `2.0.3`): the view should list the subflow group with its referenced-workflow
  name and a version dropdown of released versions; picking a different version
  should surface the correct contract diff (added/removed/renamed inputs) and, on
  submit, PUT a definition that sets `data.modelVersion` and re-maps
  `data.input`/`data.output` bindings without disturbing `data.execution`. Because
  the popup/side panel are not Playwriter-reachable, drive the parse/diff/reconcile
  logic directly in the page via the fetched definition to confirm the produced
  definition is well formed, then have the maintainer eyeball the panel via the
  loaded dev extension.
- Confirm a CE-only workflow still behaves exactly as before (regression check on
  the generic output handling and stable-id change).
