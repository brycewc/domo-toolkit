---
published: false
---

# Actions Catalog: in-extension discoverability (deferred design plan)

Status: not started. Deferred to a later version. This is the agreed design, saved for pickup.

## Context

Today the only way to discover what Domo Toolkit can do from inside the extension is to navigate
to an object of a given type and see which action buttons appear. The full list of features
otherwise lives only on domotoolkit.com and the GitHub README, which most users never visit. This
is poor discoverability for the extension's whole reason to exist (doing things Domo's UI can't).

We will add an **Actions** catalog: a new tab in the options page that lists every on-demand
action, browsable both by object type and by action, with search. To make it stay correct as
actions are added, we first make the action infrastructure declarative: a single **action
registry** becomes the source of truth that both the live action buttons and the catalog read
from. This also removes an existing footgun, type-support is currently duplicated between
`src/utils/availableActions.js` and several components (for example `viewLineage`'s
`['DATA_SOURCE','DATAFLOW_TYPE']` list appears in both places, and `.claude/rules/architecture.md`
warns maintainers to keep them in sync by hand).

Decisions made with the user:

- **Registry = single source of truth.** The registry owns metadata plus `supportedTypes`;
  `getAvailableActions` is rewritten to derive its Set from the registry; `ActionButtons` keeps its
  explicit JSX render. (Fully data-driven rendering is out of scope, a possible future follow-up.)
- **Layout = both views behind a By Type / By Action toggle**, sharing one registry.
- **Placement = a Settings tab** named "Actions", plus cross-links from Welcome and the popup.
- **Scope = on-demand actions only** (the header plus expandable action buttons). Automatic
  features (favicons, tab titles, cookies) are out of scope for v1.

## Architecture: the action registry

New file `src/data/actionRegistry.js` (sits beside the existing `src/data/releases.js`). It exports
an array (or keyed object) of action descriptors. Each descriptor separates the three concerns that
are tangled together in `availableActions.js` today:

```js
{
  key: 'viewLineage',              // same string used in getAvailableActions/ActionButtons
  label: 'View Lineage',           // user-facing
  description: 'Open an interactive lineage graph for this object.',
  icon: 'Lineage',                 // STRING resolved via ACTION_ICON_MAP (mirrors ObjectTypeIcon)
  category: 'Discover',            // grouping for the catalog
  tier: 'expandable',              // 'header' | 'expandable'
  supportedTypes: ['DATA_SOURCE', 'DATAFLOW_TYPE'],   // static; or UNIVERSAL sentinel
  availability: (context) => true, // OPTIONAL runtime/permission gate (functions, import-time only)
  conditionNote: null              // OPTIONAL human-readable gate, shown as a chip on the catalog
}
```

Two layers, by design:

- **Metadata layer** (`key, label, description, icon, category, tier, supportedTypes,
conditionNote`) is plain serializable data, the only thing the catalog needs.
- **Wiring layer** (`availability` predicate) holds the runtime/permission gates lifted verbatim
  from `availableActions.js` (stream `currentExecutionState`, `userRights`, `permission.mask`,
  package language, and so on). Functions are fine here: the registry is imported only inside React
  contexts (options/popup/sidepanel), it never crosses `chrome.runtime` messaging, so no
  `toJSON`/`fromJSON` is required.

`UNIVERSAL` is a shared exported sentinel (for example `export const UNIVERSAL = '*'`) for actions
that apply to any detected object (Copy, NavigateToCopiedObject, ClearCookies, ApiErrors, base
ActivityLog).

Helper exports in the same file: `getAvailableActionKeys(context)` (the loop, see Part 2),
`getActionSupportedTypes(key)`, and `getCatalogActions()` (filters out `internal`/`dev` entries for
the page).

### Action categories (starter taxonomy, defined in the registry)

`Discover` (GetCards, GetDatasets, GetChildPages, GetCardPages, GetViewInputs, GetOwnedObjects,
ViewLineage, ActivityLog), `Copy & Share` (Copy, CopyColorRules, CopyFilteredUrl,
NavigateToCopiedObject, ShareWithSelf), `Modify` (UpdateDetails, UpdateOwner, TransferOwnership,
LockCards, RemoveEmptyStringsFromQuickFilters, DataRepair, SetStreamToManual, CancelStreamExecution,
UpdateCodeEngineVersions), `Create & Export` (Generate, Duplicate, Export, Sync,
MigrateDownstreamContent), `Manage` (DeleteObject, ClearCookies, DirectSignOn, ApiErrors).

## Implementation

### Part 1, build the registry (`src/data/actionRegistry.js`)

Populate one descriptor per user-facing action (all 32 components in `src/components/functions/`
except **DevMenu**, which is dev-only and flagged `dev: true`/excluded). Source each field:

- `supportedTypes` plus `availability` plus `conditionNote`: transcribe directly from the `if`
  blocks in `src/utils/availableActions.js`. Each `['...'].includes(typeId)` becomes
  `supportedTypes`; each nested condition becomes the `availability` predicate plus a human note.
  Examples: `lockCards` -> `conditionNote: 'Requires content admin'`; `cancelStreamExecution` ->
  `'Only while a stream execution is running'`; `generate` -> `'JavaScript packages only'`;
  `removeEmptyStrings` -> `'Not available on Domo App cards'`.
- Header-tier actions are NOT in `availableActions.js`, so lift their `supportedTypes` from the
  components: `DeleteObject.SUPPORTED_TYPES`, `ShareWithSelf`'s `isSupportedForShare` list,
  `ActivityLog`'s long-press type list. Mark near-universal ones (Copy, NavigateToCopiedObject,
  ClearCookies) `supportedTypes: UNIVERSAL`.
- The synthetic `ownership` key (added for USER, consumed only by DataList) gets a descriptor
  flagged `internal: true` so the catalog hides it but `getAvailableActionKeys` still emits it.
- `label`/`description`/`icon`: take the label and tooltip copy already in each component; pick the
  icon each component imports.

Add an `ACTION_ICON_MAP` in this file (or a small `ActionIcon` component, Part 4) mirroring
`ICON_MAP` in `src/components/ObjectTypeIcon.jsx`: import the action SVGs from `@icons/*.svg?react`
and map string to component.

### Part 2, rewrite `getAvailableActions` to derive from the registry (`src/utils/availableActions.js`)

Replace the hand-written `if` chain with a loop that preserves the **exact** existing Set contract
(both `ActionButtons.jsx` and `DataList.jsx`'s `reload` affordance depend on it):

```js
export function getAvailableActions(currentContext) {
  const actions = new Set();
  const typeId = currentContext?.domoObject?.typeId;
  for (const action of actionRegistry) {
    if (action.tier !== 'expandable' && !action.internal) continue; // header actions stay out of the Set
    const typeOk = action.supportedTypes === UNIVERSAL || action.supportedTypes.includes(typeId);
    if (!typeOk) continue;
    if (action.availability && !action.availability(currentContext)) continue;
    actions.add(action.key);
  }
  return actions;
}
```

Critical: filter so only `tier:'expandable'` (plus the `internal` `ownership`) keys land in the Set.
Header actions live in the registry as metadata for the catalog but must never enter this Set, or
`ActionButtons`/`DataList` behavior changes. `ApiErrors` stays rendered unconditionally in
`ActionButtons` (it self-hides on zero errors), so it does not need a Set entry; its registry
descriptor is for the catalog only.

### Part 3, reconcile duplicated type lists (pattern, a few files)

Where a component re-declares a static type list the registry now owns, import it from the registry
instead of duplicating. Keep complex per-type permission/runtime logic local.

- `src/components/functions/ViewLineage.jsx`: inline `['DATA_SOURCE','DATAFLOW_TYPE']` duplicates the
  registry, it only renders when already gated, so drop the redundant check.
- `src/components/functions/DeleteObject.jsx`: replace its `SUPPORTED_TYPES` array with
  `getActionSupportedTypes('deleteObject')`; keep the `isDeleteForbidden` permission logic.
- `src/components/functions/ShareWithSelf.jsx`: same, list from registry, keep admin checks.

### Part 4, `ActionIcon` renderer

Add a small `ActionIcon({ icon, className })` (in `actionRegistry.js` or
`src/components/ActionIcon.jsx`) that resolves the icon string via `ACTION_ICON_MAP`, exactly
parallel to `ObjectTypeIcon`. The catalog uses it for action cards; type rails reuse the existing
`ObjectTypeIcon`.

### Part 5, the catalog page (`src/components/options/ActionCatalog.jsx`)

A self-contained component reading `getCatalogActions()` plus `getAllObjectTypes()`/`getObjectType()`.
Reuse the visual language of `src/components/options/Welcome.jsx` (Card compound, Chip
`variant='soft'`, uppercase `text-sm font-medium tracking-wide` section headers, `motion/react`
staggered reveals with the per-item delay clamped so a 30-card list does not animate for seconds).

Structure:

- Top: a `SearchField` (filters via HeroUI `useFilter().contains` across action
  label/description/category and object-type name) plus a **By Type / By Action toggle** (HeroUI
  `Tabs` compact variant or a two-button toggle group).
- When the search query is non-empty: show a flat list of matching action cards regardless of view
  mode (each card lists its supported types as small `ObjectTypeIcon`s). This makes search the
  unified entry point.
- **By Type view:** landing grid of only the ~14 types that have actions, plus a pinned "Universal
  (any object)" entry, each showing `ObjectTypeIcon` plus name plus "N actions". Selecting one shows
  that type's actions grouped by category as cards.
- **By Action view:** all catalog actions as cards grouped by category, each listing supported types.
- Action card = `ActionIcon` (accent) plus label plus one-line description plus a `Chip` for category
  plus a muted `Chip` for any `conditionNote` (for example "Requires content admin"). One global
  disclaimer line near the top: availability also depends on your permissions and the object's state.
- Bottom: a collapsed `Disclosure` "Recognized but no toolkit actions" explaining the other ~100
  types still benefit from automatic features (tab titles, favicons, ID copy, navigation). Honest
  framing, never competes with the active types.

Scale is tiny (~31 actions, ~14 active types), no virtualization needed.

### Part 6, register the tab (`src/options/App.jsx`)

1. `import { ActionCatalog } from '@/components/options/ActionCatalog';`
2. Add `actions: 'Actions'` to `TAB_TITLES` (keys sort alphabetically, `actions` lands first).
3. Add `<Tabs.Tab id='actions'>Actions<Tabs.Indicator /></Tabs.Tab>` in `Tabs.List` (first, for
   prominence).
4. Add `<Tabs.Panel id='actions' className='flex h-full max-w-3xl flex-col px-4 pt-16'>` with a short
   header (`<h3>Actions</h3>` plus muted subtitle) and `<ActionCatalog />`. Routing is automatic via
   the existing `#hash` mechanism.

### Part 7, cross-links (discoverability)

- `src/components/options/Welcome.jsx`: add an in-app "Browse all actions" entry that navigates to
  `#actions` (plain `Link href='#actions'`, no `target`, like the existing `#favicon`/`#settings`
  links), and extend the Quick Start step about observing action buttons to mention the catalog.
- Popup/sidepanel empty state: in `src/components/ActionButtons.jsx`, when
  `availableActions.size === 0`, surface a subtle "No actions for this object. Browse the full
  catalog" link that opens `src/options/index.html#actions` (reuse the exact find-or-create-tab
  pattern already in `ActionButtons.jsx` for the settings gear). This is the highest-value hook: it
  appears precisely when a user wonders why nothing shows up.

### Part 8, drift guard (recommended, low cost)

Add a DEV-only `validateActionRegistry()` (gated by `import.meta.env.DEV`, the pattern used in
`DevMenu.jsx`) asserting every registry `key` resolves an icon and every `supportedTypes` id is a
real `getObjectType(id)`. Call it once on `ActionCatalog`/`ActionButtons` mount. With single-source
the expandable tier cannot drift; this catches typos and stale type ids.

## Files touched

- **New:** `src/data/actionRegistry.js`, `src/components/options/ActionCatalog.jsx` (and optionally
  `src/components/ActionIcon.jsx`).
- **Rewritten:** `src/utils/availableActions.js` (registry-driven loop, same Set contract).
- **Edited:** `src/options/App.jsx` (tab registration), `src/components/options/Welcome.jsx`
  (cross-link), `src/components/ActionButtons.jsx` (empty-state catalog link), and the few function
  components with duplicated type lists (`ViewLineage.jsx`, `DeleteObject.jsx`, `ShareWithSelf.jsx`,
  `ActivityLog.jsx`).

## Verification

- Run `npx eslint --no-warn-ignored <each changed/created file>` and fix all sorting/format errors
  (import order, JSX prop order, object-key sort, no trailing commas, module-level alpha order) per
  `.claude/rules/code-style.md`.
- Build sanity: `yarn build` succeeds.
- **Behavior parity for the live buttons (most important):** confirm the rewritten
  `getAvailableActions` returns the same Set as before for representative contexts (DATA_SOURCE with
  an active stream, DATAFLOW_TYPE with edit permission, USER, CARD non-domoapp,
  CODEENGINE_PACKAGE_VERSION, the `directSignOn` login URL). Spot-check in the popup/sidepanel
  against a real Domo instance that the same buttons appear/disappear as before.
- **Catalog:** load the unpacked `dist/` at `chrome://extensions`, open the options page, open the
  Actions tab. Verify the By Type landing grid lists the active types, drilling into DataSet shows
  its 9 actions grouped by category with the right condition chips, the By Action toggle lists all
  actions with supported-type icons, search filters across both, and the "recognized but no actions"
  disclosure is collapsed at the bottom. (The options page has no localhost dev route, so this step
  is browser-only.)
- Verify cross-links: Welcome "Browse all actions" navigates to `#actions`; the popup empty-state
  link opens the Actions tab.
- Add a WIP entry to `docs/RELEASE_NOTES.md` under New Features per `.claude/rules/wip-release-notes.md`:
  one sentence, for example "Added an Actions tab that lists every available action, browsable by
  object type or by action." (User-facing and a net difference from the last release, so it
  qualifies.)
