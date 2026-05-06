# DatasetComboBox — shared async dataset picker

## Context

Several upcoming features will need the user to pick a dataset from their Domo instance. Domo instances commonly hold thousands of datasets, so any picker has to search asynchronously against the server rather than loading the full list. We already have a working pattern for this in [UserComboBox.jsx](../src/components/UserComboBox.jsx) (debounced server search + offset pagination + race-guarded fetches) — the goal here is to build a **dataset twin** of that component as shared infrastructure now, before any feature needs it.

The user explicitly asked for two affordances on top of name search:

1. **Paste-an-ID-to-filter** — if the user pastes a Domo dataset UUID, the list collapses to that one dataset.
2. **Provider icons** instead of avatars — `GET /api/data/v1/providers/{dataProviderType}/images/96.png`, rendered non-rounded (or barely rounded), since dataset icons are square logos rather than user portraits.

This phase is library-only: no consumers will be wired up. That comes in a later phase.

## Files to create / modify

| File | Change |
| --- | --- |
| [src/components/DatasetComboBox.jsx](../src/components/DatasetComboBox.jsx) | **NEW** — the component |
| [src/components/index.js](../src/components/index.js) | Add `export { DatasetComboBox } from './DatasetComboBox';` |
| [src/services/datasets.js](../src/services/datasets.js) | **NEW function** `searchDatasets(text, tabId, offset)` |
| [src/services/index.js](../src/services/index.js) | Re-export `searchDatasets` if not auto-barrelled |
| [docs/RELEASE_NOTES.md](RELEASE_NOTES.md) | Add WIP entry per `wip-release-notes.mdc` |

No new model class — datasets stay as plain `{id, name, dataProviderType, owner}` objects, matching the existing convention in [datasets.js](../src/services/datasets.js).

## Service: `searchDatasets(text, tabId, offset)`

Lives in [src/services/datasets.js](../src/services/datasets.js). Mirrors the signature/return shape of [`searchUsers`](../src/services/users.js) so the component can stay structurally identical to `UserComboBox`.

```js
async function searchDatasets(text, tabId = null, offset = 0)
// Returns: { totalCount: number|null, datasets: Array<{id, name, dataProviderType, owner}> }
```

Internal branching:

- **ID branch** — if `ObjectTypeRegistry.DATA_SOURCE.isValidObjectId(text)` is true ([DomoObjectType.js:618](../src/models/DomoObjectType.js#L618)), call `POST /api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true` with the body `[text]` (this matches existing usage in [datasets.js](../src/services/datasets.js)). Return `{ totalCount: 1, datasets: [...] }` on hit, or `{ totalCount: 0, datasets: [] }` on miss.
- **Text branch** — call Domo's dataset search endpoint, paginated with `offset` and a `PAGE_SIZE = 50` constant (mirrors `USERS_PAGE_SIZE`). Return `{ totalCount, datasets }`.

> **Endpoint to verify before coding:** the codebase has no existing dataset text-search call. The most likely endpoint is `POST /api/search/v1/query` (Domo's Phoenix-style global search, filtered to `entities: ['DATASET']`) or `POST /api/data/ui/v3/datasources/search`. **Per `.claude/rules/domo-apis.mdc`, look this up via the Postman MCP / `domo-api` skill before writing the call** — pick whichever endpoint Domo's own data-center page actually uses, and match its request/response shape. The component's contract above is independent of which endpoint we land on.

All requests go through `executeInPage(...)` exactly like the rest of [datasets.js](../src/services/datasets.js) — that keeps the Chrome extension sandbox boundary consistent and is also why we keep the 300ms debounce in the component.

## Component: `DatasetComboBox.jsx`

Structure is a near-copy of [UserComboBox.jsx](../src/components/UserComboBox.jsx) — same state shape, same effects, same race guard via `searchGenRef`, same debounce, same `handleOpenChange` / `handleSelectionChange` semantics. Diffs from UserComboBox:

**Props (rename only where the meaning changed):**

| UserComboBox prop | DatasetComboBox prop | Notes |
| --- | --- | --- |
| `avatarBaseUrl` | **`instanceBaseUrl`** | Same value at the call site (`currentContext.domoObject.baseUrl`), but the new name is honest — we use it for provider icons, not avatars. UserComboBox can be renamed in a future tidy-up; not in scope here. |
| `selectedDisplayName` | `selectedDisplayName` | Same purpose (external-selection sync). |
| (label default `'User'`) | (label default `'Dataset'`) | |
| (placeholder `'Search users...'`) | (placeholder `'Search datasets by name or ID...'`) | Hints at the ID affordance. |

Everything else (`className`, `isActive`, `maxListHeight`, `menuTrigger`, `tabId`, `...rest` forwarding, `onSelectionChange`) carries through unchanged.

**Render diffs inside the `<ListBox.Item>`:**

```jsx
<div className='size-8 shrink-0 overflow-hidden rounded-sm bg-default-100'>
  {dataset.dataProviderType && instanceBaseUrl ? (
    <img
      alt=''
      className='size-full object-contain'
      src={`${instanceBaseUrl}/api/data/v1/providers/${dataset.dataProviderType}/images/96.png`}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  ) : null}
</div>
<div className='flex flex-col'>
  <Label>{dataset.name}</Label>
  <Description>{dataset.dataProviderType}</Description>
</div>
<ListBox.ItemIndicator />
```

Notes on the icon block:

- A plain `<div><img></div>` (not HeroUI `Avatar`) gives us full control of border-radius — `Avatar` defaults to `rounded-full` and the user explicitly wants this not rounded.
- `rounded-sm` is a soft default; if you want fully square, drop the class. Marked as a design decision below.
- `object-contain` is important — provider logos have varying aspect ratios and we don't want to crop them.
- `onError` quietly hides broken images (rare provider keys without a 96.png), letting the empty `bg-default-100` square act as a fallback. No fancy fallback initials — datasets don't have that affordance the way users do.

**Selection-change behavior:** identical to the corresponding block in [UserComboBox.jsx](../src/components/UserComboBox.jsx) — when the user picks an item we set `selectedName` to `dataset.name` so the input re-anchors to the friendly name rather than leaving an ID in the textbox.

## Design decisions (callouts)

These are the spots where I picked a default; revisit any before implementation:

1. **Subtitle in each list item:** using `dataProviderType` (e.g. "MySQL", "Salesforce") rather than the dataset's owner name. Rationale: provider type disambiguates more usefully when names collide, and it pairs visually with the provider icon. Could swap to owner display name or show both.
2. **Icon shape:** `rounded-sm` (2px). Not fully square because Domo's own UI gives provider tiles a tiny radius, and not `rounded-md` because that competes with the dropdown chrome.
3. **Prop name `instanceBaseUrl`** instead of `avatarBaseUrl`. Diverges from UserComboBox's naming intentionally — see the table above.
4. **No new `Dataset` model class.** Plain objects only, matching existing service code.
5. **ID-paste short-circuits the debounce?** No — still go through the 300ms debounce. A paste is a single keystroke event, so the user only waits 300ms once, and keeping one code path is simpler. If that feels laggy in practice we can special-case `isValidObjectId` to fire immediately.

## Verification (when implementation phase starts)

- Add a temporary mount of `<DatasetComboBox instanceBaseUrl={...} tabId={...} isActive />` to one of the localhost dev routes per `.claude/rules/local-testing.mdc` (e.g. `/dev-lineage`).
- Type a partial name → confirm 300ms debounce, list populates, scroll triggers `loadMore`, race guard discards stale pages.
- Paste a known dataset UUID → confirm list collapses to that single dataset.
- Paste a UUID that doesn't exist → confirm empty state.
- Select an item → confirm input re-anchors to the dataset name, `onSelectionChange` fires with the ID.
- Open dropdown a second time → confirm `handleOpenChange` resets the search filter so all datasets show again.
- Run `npx eslint --no-warn-ignored src/components/DatasetComboBox.jsx src/services/datasets.js` per `code-style.mdc`.
- `yarn build` — no new warnings.
