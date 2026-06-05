---
published: false
---

# Feature Switch Awareness (deferred design plan)

Status: not started. Deferred so it doesn't delay the current release. This is the agreed
implementation plan, saved for later pickup.

## Context

Domo instances are configured by feature switches (for example, `approvalcenter` enables
Approvals and everything related). The toolkit has so far ignored them, because the main test
instance is Domo's internal instance, which has every switch on. On customer instances that lack
a switch, toolkit features silently fail with no explanation: for example, OwnershipView and
Transfer Content proactively fetch Approvals for every user, and on an instance without
`approvalcenter` those fetches error out and Approvals appears in the list as a broken/failed row.

We want a holistic, extensible way to (a) load the instance's feature switches once per session,
(b) attach them to the context we already pass everywhere, and (c) gate any feature keyed to an
object type so that a type whose switch is absent is simply skipped (not fetched, not shown).
Feature switches map closely to object types (the `APPROVAL` type is gated by `approvalcenter`),
so the object-type registry is the natural source of truth.

Decisions made with the user:

- Fail-open while loading. A gated item stays visible while `featureSwitches` is unknown (still
  loading, or unreadable), and is hidden/skipped only once the loaded list confirms the switch is
  absent. Matches the existing "don't cache hollow data, retry" handling of `USER_RIGHTS`.
- Scope: Approvals as the proof case. Build the full shared infrastructure, then wire exactly one
  real consumer end to end (APPROVAL plus approval templates in Ownership/Transfer). Other types
  opt in later by setting `featureSwitch` on their type definition; no further wiring needed.

## Reading a switch (semantics)

`features.getConfig()` (run in the page) returns an array of objects like
`{ name: 'approvalcenter', enabled: true, type: 'STANDARD', purchased: false, ... }`. A switch
absent from the array is off, and `enabled` is always `true` for entries that are present. Per the
user, check both: keep only entries that are present and have `enabled === true`, and store just
their `name` strings. Membership in that stored array then means "present and enabled."

## Approach

Four small infra pieces, plus one type-metadata field, plus one wired consumer. The infra rides
the existing per-instance user-loading rail, so almost no new plumbing.

### 1. Service: read switches from the page, `src/services/features.js` (new)

`export async function getFeatureSwitches(tabId = null)`. Uses `executeInPage` (import from
`@/utils/executeInPage`, per the services pattern). Inside the page function, poll briefly for the
page global the same way `getCurrentUser` polls `window.bootstrap` (the config can hydrate after
first paint):

```js
for (let i = 0; i < 30; i++) {
  const fn = window.features?.getConfig;
  if (typeof fn === 'function') {
    const config = fn();
    if (Array.isArray(config)) {
      return config.filter((f) => f && f.enabled === true).map((f) => f.name);
    }
  }
  await new Promise((r) => setTimeout(r, 250));
}
return null; // unreadable, caller treats null as "unknown" (fail-open)
```

Returns `string[]` of enabled switch names, or `null` if it never became readable. Verify
in-browser that the global is reachable as `window.features.getConfig()` from the MAIN world (see
Verification).

### 2. Context field, `src/models/DomoContext.js`

Add `this.featureSwitches = null;` in the constructor (sibling of `this.userGroups = null;`).

- `fromJSON`: `context.featureSwitches = data.featureSwitches || null;` (next to the `userGroups`
  restore).
- `toJSON`: add `featureSwitches: this.featureSwitches || null` (alphabetical key order).

This guarantees it survives message passing and the `chrome.storage.session` round-trip, and that
`getSidepanelData()` (which serializes via `toJSON`) carries it into views like OwnershipView.
Store as an array (Sets don't serialize); consumers use `.includes()`.

### 3. Loader: fold into `getInstanceUser` in `src/background.js`

`getInstanceUser(instance, tabId)` already fetches user plus groups once per instance and caches
them. Extend it to also fetch switches in parallel:

- Import `getFeatureSwitches` from `@/services/features`.
- In the async body, fetch groups and switches together, for example:
  `const [richGroups, featureSwitches] = await Promise.all([getUserGroups(...).catch(() => []), getFeatureSwitches(tabId).catch(() => null)]);`
- Include `featureSwitches` in the cached object and in the resolved
  `{ user, userGroups, featureSwitches }`. Keep the existing "only cache when `USER_RIGHTS` is
  non-empty" gate as is; switches get cached/dropped alongside the user, and
  `invalidateInstanceUser` already clears the whole entry on logout.

Then in `detectAndStoreContext`, the existing user `.then()` block gains one line where it already
sets `currentContext.user` / `currentContext.userGroups`:

```js
currentContext.featureSwitches = featureSwitches;
```

No new `.then()`, no second broadcast, no new race. The `cached?.user...` early-return path in
`getInstanceUser` must also return the cached `featureSwitches`.

### 4. Central helper, `src/utils/featureSwitches.js` (new)

The single place every consumer calls. Source of truth is the object-type registry.

```js
import { getObjectType } from '@/models/DomoObjectType';

// The switch (if any) a given object type requires.
export function getTypeFeatureSwitch(typeId) {
  return getObjectType(typeId)?.featureSwitch ?? null;
}

// Fail-open: ungated -> true; not-yet-loaded (null) -> true; otherwise membership.
export function isFeatureSwitchEnabled(switchName, context) {
  if (!switchName) return true;
  const switches = context?.featureSwitches;
  if (!switches) return true;
  return switches.includes(switchName);
}

export function isTypeFeatureEnabled(typeId, context) {
  return isFeatureSwitchEnabled(getTypeFeatureSwitch(typeId), context);
}
```

### 5. Type metadata, `src/models/DomoObjectType.js`

- In the constructor, accept and store `this.featureSwitch = options.featureSwitch ?? null;`.
- Set `featureSwitch: 'approvalcenter'` on `APPROVAL` and on `TEMPLATE` (approval templates; in
  this codebase `TEMPLATE` is approval-specific: it's `APPROVAL`'s parent, has the "Approval
  Template ID" copy config, and `DeleteObject` gates it on `approvalcenter.admin`). Keep entries
  alphabetically-keyed per the type definition style.

This is the extensibility hook: a future gated type just adds `featureSwitch: '<name>'` and every
type-resolving consumer respects it automatically. Note: `DomoContext.toJSON` only serializes a
slim `objectType` (id/name/parents/urlPath), and that's fine, because the helper reads
`featureSwitch` from the live registry via `getObjectType(typeId)`, not from the serialized object.

### 6. Wire the proof consumer, `src/components/views/OwnershipView.jsx`

This view iterates `TRANSFER_TYPES` to build its parallel fetch specs and its rows; `approvals`
and `approvalTemplates` map to `APPROVAL`/`TEMPLATE` via the existing `TYPE_KEY_TO_DOMO_TYPE`.

- Add a memoized filtered list keyed on the frozen `launchContext`:
  ```js
  const transferTypes = useMemo(
    () => TRANSFER_TYPES.filter((t) => isTypeFeatureEnabled(TYPE_KEY_TO_DOMO_TYPE[t.key], launchContext)),
    [launchContext]
  );
  ```
- Replace the body-level `TRANSFER_TYPES` iterations that drive fetching, rendering, selection,
  and counts with `transferTypes`, specifically: `specs`, `forbidden`,
  `loadedTypeCount`/`totalObjects`, `hasAnyTransferable`, `eligibleTypeKeys`, the
  `pendingSelectAll` hydration effect, `dataListItems`, `selectedItemsByType`, and the
  `enabledTypes` loop in `handleTransferSubmit`. A feature-disabled type then never gets a fetch
  spec (no failing request) and never produces a row.
- Leave the bottom-of-file membership helpers (`isParentKey`, `parseLeafTypeKey`) referencing the
  full `TRANSFER_TYPES`; they're parse/validation guards, using the full set avoids false
  negatives and is harmless since hidden types never enter the selection set.
- Because of fail-open, on the all-switches internal instance `transferTypes === TRANSFER_TYPES`
  (nothing hidden) and behavior is unchanged. Only an instance whose loaded switch list omits
  `approvalcenter` drops the two approval rows.

The Transfer Content path (`MigrateDownstreamContentView` / `transferAllOwnership`) shares
`TRANSFER_TYPES` and the same `TYPE_KEY_TO_DOMO_TYPE` mapping; its current types
(beastModes/cards/dataflows/datasets) are ungated, so it needs no change now but inherits the
helper for free.

## Out of scope (extensibility notes, not built now)

- A `FEATURE_GATED_ACTIONS` map or inline gate in `getAvailableActions()`. No action button is
  feature-switched today. When one is, gate it with `isTypeFeatureEnabled(typeId, currentContext)`
  (the function already receives `currentContext`).
- Assigning `featureSwitch` to non-approval types. Deferred per the agreed scope.

## Critical files

| File | Change |
| --- | --- |
| `src/services/features.js` | New. `getFeatureSwitches(tabId)` via `executeInPage`, polls `window.features.getConfig()`, returns enabled names or `null`. |
| `src/utils/featureSwitches.js` | New. `getTypeFeatureSwitch`, `isFeatureSwitchEnabled` (fail-open), `isTypeFeatureEnabled`. |
| `src/models/DomoContext.js` | Add `featureSwitches` to constructor, `fromJSON`, `toJSON`. |
| `src/models/DomoObjectType.js` | Store `options.featureSwitch`; set `'approvalcenter'` on `APPROVAL` and `TEMPLATE`. |
| `src/background.js` | Fetch switches inside `getInstanceUser` (parallel with groups), return plus cache them, attach `currentContext.featureSwitches` in the existing user `.then()`. |
| `src/components/views/OwnershipView.jsx` | Memoized `transferTypes` filtered by `isTypeFeatureEnabled`; swap body-level `TRANSFER_TYPES` iterations for it. |

## Verification

1. Confirm the page global. Via the `playwriter` skill, drive the user's Chrome to a Domo page and
   evaluate `typeof window.features?.getConfig === 'function'` and inspect
   `window.features.getConfig()`. Confirm the array shape matches the expected
   `{ name, enabled }` objects. If the global lives elsewhere, adjust the service's accessor. This
   is the one genuinely unconfirmed assumption.
2. ESLint on every touched/new file: `npx eslint --no-warn-ignored src/services/features.js
   src/utils/featureSwitches.js src/models/DomoContext.js src/models/DomoObjectType.js
   src/background.js src/components/views/OwnershipView.jsx`. Fix import sort, key sort, prop
   order, and no-trailing-comma before finishing.
3. Behavior, internal instance (fail-open, nothing hidden): load the unpacked `dist/` build, open
   OwnershipView/Transfer on a user; confirm Approvals plus Approval Templates still appear and
   fetch normally (regression check, the internal instance has `approvalcenter`).
4. Behavior, missing switch: on (or simulating) an instance lacking `approvalcenter`, confirm the
   two approval rows are absent, no approval fetch fires, and no failed-row/error surfaces. If a
   real instance isn't handy, temporarily stub `getFeatureSwitches` to return a list without
   `approvalcenter` and confirm the rows drop.
5. OwnershipView is not covered by the `/dev-*` localhost routes (it's a side-panel view), so
   steps 3 and 4 require the loaded extension; the dev routes won't exercise this path.

## Release notes

Per `wip-release-notes.md`, add one user-facing bullet (this ships a real behavior change for
customer instances), something like: "Approvals no longer appear in ownership and content-transfer
lists on instances that don't have Approvals enabled." Skip the infra/loader internals.
