---
published: false
---

# #9: Bulk Rename Cards

Status: **decided**. This is the plan for [#9](https://github.com/brycewc/domo-toolkit/issues/9), written 2026-11-20 against branch `2.0.0`, with every open decision settled by the maintainer on 2026-11-23. Cross-issue decisions (`DX.*`), the shared infrastructure, the landing order across issues, and the pre-existing bugs found while planning live in [open-issues-plan.md](open-issues-plan.md).

API claims in this plan carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

## Summary

**Problem.** Domo renames cards one at a time: open the card, open Edit Title, save, then repeat for the next card. This hurts most after Domo's own duplicate flows. Duplicating an App Studio app, a page, or a card adds "Duplicate of " (or "Copy of ", or a localized prefix such as "次の複製：") to every card title, and the cleanup is manual. On domo.domo.com, `POST /api/content/v2/cards/adminsummary` with `cardTitleSearchText: "Duplicate of"` returns `totalCardCount: 8255` (VERIFIED-LIVE). Real example: App Studio view `2095795725` ("Certification", in app `324258972`) has 16 cards, and 15 of them start with "Duplicate of " (VERIFIED-LIVE). Period rollovers ("FY25" to "FY26") and naming-convention fixes across a whole dashboard hit the same wall.

**Who benefits.** Builders who duplicate apps or pages as templates, admins cleaning up after a migration, and anyone doing a rollover or terminology change across a dashboard, app, or dataset's cards.

**Interpretations considered.**

1. Rename the cards on the current page or App Studio page in bulk. This is the core ask. **Planned.**
2. The same for a dataset's cards ("Could also add that ability to datasets"). **Planned.** It is the same view with a different card source, and dataflows (cards on every output) come free from `getCardsForObject`.
3. Rename across a whole App Studio app or worksheet (every view). **Planned**, through the long-press parent scope that Get Cards already has.
4. Rename across many unrelated datasets and pages at once, from the side panel or options page ("across multiple datasets/pages"). **Not planned** (D9.3). Rename Cards stays scoped to the current object or App Studio app; the dataset, dataflow, and app scopes cover the cleanup cases the issue names.
5. Also rewrite card descriptions. **Quick follow-up after v1** (D9.2). The engine and endpoint already handle descriptions; see Implementation plan step 12.
6. Also rewrite chart-level titles (axis titles, legend title). **Out of scope.** They are chart properties (`title_x`, `title_y`, `legend_title_text` in the chart-type options), not card titles, and only a full definition rewrite can change them.
7. Per-row inline title editing. **Not planned** (D9.1). Domo's Edit Title modal already does single-card edits well.

## Scope check

**Can a user already do this easily in Domo's UI?** No, with one narrow exception.

- The only card-title write in Domo's frontend is per card. The Edit Title modal (bundle chunk `47252-74903fdf9114224c`) calls `dmCardService.updateTitle(urn, { dynamicTitle, dynamicDescription, title, description })`. The legacy `editKpiTitle` (chunk `98736-1b8ed1506751a95a`) sends `{ title }` only. The service (chunk `68072-2892a61ec3c48142`) is `updateTitle: (e, n) => t.put('/api/content/v1/cards/${e}/title', n)`. Analyzer saves the title inside the full card definition. No bulk title route exists in the bundles: the only `cards/bulk*` routes are `bulk` (delete), `bulk/duplicate`, `bulk/lock`, and `bulk/pages` (all VERIFIED-LIVE in the bundles).
- Admin > Content > Cards offers bulk owner, lock, and delete style operations, but no bulk rename.
- **The exception:** Domo's "Import options" dialog (importing a dashboard into an App Studio app with "Duplicate Cards" on) has a "Choose card prefix" input bound to `cardTitlePrefix` (chunk `48425-c2dd82cd37688216`, i18n keys `page/choose-card-prefix` and `page/add-prefix`, VERIFIED-LIVE). So on that one path a user can set the prefix at duplicate time. It only applies before the copy exists, and only on that path. Duplicating an app, a page, or a card still produces "Duplicate of " titles, and nothing in Domo renames existing cards in bulk.
- So the feature batches an operation Domo only offers one at a time, which CLAUDE.md lists as a good sign. The duplicate cleanup is a strong use case but not the only one: rollovers and find and replace across a dashboard stand on their own.

**What is cut because Domo already does it.**

- Single-card rename: Domo's Edit Title modal handles it, so there is no Rename button on a `CARD` context. Per-row inline editing is left out for the same reason (D9.1).
- Chart axis and legend titles: these are not card titles and need a definition rewrite.

**What already exists in this codebase that overlaps.**

- `src/services/cards.js`:
  - `getCardsForObject` (page, App Studio view, worksheet view, Report Builder page, dataset, dataflow, Beast Mode). Its `DATAFLOW_TYPE` branch already pools the outputs and dedupes by card ID (VERIFIED-CODE).
  - `getCardsForParent` (every view of an App Studio app or worksheet). It also fetches forms, queues, and workflows unless `cardsOnly` is set, and keeps a failed view with an `error`.
  - `getCardsByIds` (batched hydrate with `parts`, which silently drops IDs that do not resolve).
  - `setCardsLocked` / `updateCardOwners` (the batched bulk-write and partial-failure pattern).
  - No title write exists today (VERIFIED-CODE).
- `src/components/views/ManageCardLocksView.jsx` and `ManageCardOwnersView.jsx`: the closest pattern, a selection-mode `DataList` over a context's cards, with select-all, disabled rows with tooltips, a banner, and a footer action.
- `src/components/views/GetCardsView.jsx`: parent-scope grouping into DataListItems (`transformParentScopeItems`), the page-scoped card URL rule (`transformCardsToItems`), and a per-output dataflow loop kept for its grouped display (`fetchCardsForOutputDatasets`). `src/components/buttons/GetCards.jsx` has the long-press "Get App Cards" / "Get Worksheet Cards" menu.
- `src/components/views/DataList.jsx`: selection, `selectAll`, `isSelectable`, `getUnselectableTooltip`, `getItemBadge`, per-item `chip`, `banner`, `footer`, `sortWeight`, and virtualization (rows are measured, so taller rows work). It has **no** per-row secondary line, which the before/after diff needs. `item.metadata` is documented on `DataListItem` but never rendered, and `annotation` is hover-only.
- `src/models/DataListItem.js`: `originalId` for namespaced row IDs, and `status` / `error` / `errorDetail`. DataList only renders the error body for virtual parents (`isErrorState = item.isVirtualParent && ...`, `DataList.jsx:1006`), so leaf-row errors go through `getItemBadge`.
- `src/activityLog/ActivityLogTable.jsx:1846` has a local `promisePool(taskFns, concurrency)`. `docs/plans/beta-phase-1-2-retries-concurrency.md` step 2 specifies the shared one.
- #8 (Remove Cards) is built on the same card loader, card list, DataList prop, and hold constant. This issue builds them first (see Shared infrastructure across issues).

## API and platform findings

**1. Rename a card: `PUT /api/content/v1/cards/{cardId}/title`.** VERIFIED-LIVE on scratch cards. It is not in the OpenAPI spec. It is the call behind Domo's Edit Title modal.

The body accepts `title`, `dynamicTitle`, `description`, and `dynamicDescription`. `dynamicTitle` and `dynamicDescription` are sent as **objects**, while `metadata` stores them as JSON strings. The response is `200` with an empty body.

How the server treats each field (all VERIFIED-LIVE on scratch cards `2066953017` and `1586037476`):

| Sent                                                           | Stored                                                                                                                                                                                                                                                  |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{ title }` only, on a card with dynamic text                  | Title updated. **`metadata.dynamicTitle` and `metadata.dynamicDescription` are both deleted**: the date-range pill is lost and `displayOnCardDetails` reverts to its default. A static `description` with no dynamic description is kept.               |
| `{ title, dynamicTitle }`                                      | **`title` is ignored and re-derived** from `dynamicTitle` (TEXT parts joined, pills contributing nothing, then trimmed). A static `description` is kept, but an existing `dynamicDescription` is deleted.                                               |
| `{ ..., description, dynamicDescription }`                     | **`description` is ignored and re-derived** from `dynamicDescription`. Sending static `description: "probe static desc"` with `dynamicDescription: { text: [] }` stored no description. Sending a mismatched static description stored the dynamic one. |
| `title` with outer and inner extra spaces, with `dynamicTitle` | Outer spaces trimmed, inner runs kept (`"  probe9   spaced   title  "` stored as `"probe9   spaced   title"`).                                                                                                                                          |
| `title` with extra spaces, title only                          | Stored exactly as sent, untrimmed.                                                                                                                                                                                                                      |
| `dynamicTitle` with 51 segments                                | Accepted with `200`, but **silently truncated to 50 segments** (the trailing pill was dropped).                                                                                                                                                         |
| `title: ""`                                                    | Accepted. Server stores the title `"Title"`.                                                                                                                                                                                                            |
| 1,026-character title                                          | Accepted. Server truncates `title` to 255 characters but keeps the full `dynamicTitle` text.                                                                                                                                                            |
| Locked card, caller is owner                                   | Accepted.                                                                                                                                                                                                                                               |
| Locked card, caller is a content admin but not an owner        | Accepted.                                                                                                                                                                                                                                               |
| Card deleted before the PUT                                    | `404`.                                                                                                                                                                                                                                                  |
| Notebook (`type: "Text"`) card `1501266072`, `{ title }`       | Works.                                                                                                                                                                                                                                                  |

Domo's own client limits match: the modal enables Save only when `convertToStaticText(title).trim().length > 0` and `text.length <= 50` for both title and description (chunk `47252-74903fdf9114224c`, VERIFIED-LIVE).

`convertToStaticText` (chunk `48800-8cba4f7ec4bc66c6`, VERIFIED-LIVE):

```js
static convertToStaticText(e){return(e?.text||[]).reduce((e,t)=>{let a="";return"text"in t?a=(t.prefix||"")+t.text+(t.suffix||""):"defaultText"in t&&(a=t.defaultText),e+a},"")}
```

So a segment with a `text` key contributes `prefix + text + suffix`, and a pill with `defaultText` (FILTER and VARIABLE_VALUE pills can carry one) contributes that `defaultText`. The draft's claim that pills never add to the static title was wrong for those pills, and the server's own derivation matched this function in every probe.

How Domo's modal seeds the fields when a card has none (chunk `48800-8cba4f7ec4bc66c6`, VERIFIED-LIVE): `getDynamicTitle()` returns the parsed `dynamicTitle` when its `text` is non-empty, else `{ text: [{ type: 'TEXT', text: title }] }`. `getDynamicDescription()` returns the parsed `dynamicDescription` when present, else `{ text: [{ type: 'TEXT', text: description }] }` or `{ text: [] }`. The modal therefore always sends all four fields, which creates dynamic fields on cards that had none. This plan does not copy that, because it would add a `dynamicDescription` to every plain card it touches.

**Payload rule this sets** (settled by the probes above). The service reads the card fresh, then:

| Fresh card has                                        | Send                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No `dynamicTitle` and no `dynamicDescription`         | `{ title }`, with `title` already trimmed client-side (the server does not trim on this path).                                                                                                                                                                                                                                                                                                                                    |
| `dynamicTitle`, no `dynamicDescription`               | `{ title, dynamicTitle }`.                                                                                                                                                                                                                                                                                                                                                                                                        |
| `dynamicDescription` (with or without `dynamicTitle`) | `{ title, dynamicTitle, description, dynamicDescription }`. `dynamicTitle` is the edited one, or is synthesized as `{ text: [{ type: 'TEXT', text: newTitle }] }` when the card had none (as Domo's `getDynamicTitle` does). `dynamicDescription` is the parsed stored object echoed back byte for byte, `displayOnCardDetails` included or absent exactly as stored. `description` is `convertToStaticText(dynamicDescription)`. |

In every case `title = convertToStaticText(dynamicTitle).trim()` when a `dynamicTitle` is sent, which is what the server stores anyway.

**How often each shape occurs** (VERIFIED-LIVE survey of 595 cards from adminsummary pages and title searches, hydrated with `parts=metadata`):

| Static description | `dynamicDescription`                                                                   | `dynamicTitle` | Cards |
| ------------------ | -------------------------------------------------------------------------------------- | -------------- | ----- |
| none               | present, empty text                                                                    | present        | 260   |
| none               | absent                                                                                 | absent         | 122   |
| present            | absent                                                                                 | absent         | 90    |
| present            | present, with text                                                                     | present        | 69    |
| none               | present, with text (for example `{"text":[{"text":"","type":"TEXT"}]}` on `102709301`) | present        | 27    |
| none               | absent                                                                                 | present        | 27    |

No card had a static description alongside an empty `dynamicDescription`. That fits the server behavior above, since the server derives `description` from `dynamicDescription` whenever both are sent. So the critique's worry about wiping a static description in that state does not arise for cards saved through Domo. The rule still handles it: such a card has a `dynamicDescription`, so it is echoed back unchanged and the server keeps what it already derives. `description` may be absent (no key), `""` (card `1930279349`), or text. `dynamicDescription` may lack `displayOnCardDetails` (card `1612304386`). The builder never assumes any of those keys exist.

Other side effects (VERIFIED-LIVE in the draft stage): `badgeUpdated` and the definition's `modified` move. No card version is created. The audit log records the rename (`GET /api/audit/v1/user-audits?objectType=CARD&objectId=2066953017`):

```
actionType: UPDATED, additionalComment: "Bryce Cindrich updated card domo-toolkit-probe-9-kpi Renamed C. domo-toolkit-probe-9-kpi Renamed C previous display name domo-toolkit-probe-9-kpi Renamed B."
```

**Permissions.** The authority names come from dataset `073c76f1-c846-48fd-876c-34d98d89a07b` (VERIFIED-LIVE): `content.card.edit` ("Create, edit and delete Cards, Drill views, and Beast Modes to which you have access") and `content.admin`. Domo's client rule (chunk `48800-8cba4f7ec4bc66c6`, VERIFIED-LIVE):

```js
canManageKpi(){var e=this.locked(),t=E.default.on("content.card.edit"),a=this.isCurrentUserOwner()||E.default.isContentAdmin;return t&&!e||a}
```

`isCurrentUserOwner` **counts group ownership** (VERIFIED-LIVE). On a scratch card owned only by scratch group `163222655`, it was `true` while the token user was a member and `false` after the user left the group. It is also `false` for a content admin who is not an owner, so it is pure ownership. It is only present when `owners` is in `parts`.

**2. Hydrate cards: `GET /api/content/v1/cards?urns=...&parts=metadata,owners&includeFiltered=true`.** VERIFIED-CODE as `getCardsByIds`. Fields VERIFIED-LIVE. `description` comes back with `parts=metadata` only when the card has one, and the key is absent otherwise.

```json
{
  "id": 1011747248,
  "type": "kpi",
  "title": "Duplicate of Issued Credly Badges",
  "locked": false,
  "isCurrentUserOwner": false,
  "owners": [],
  "metadata": {
    "dynamicTitle": "{\"text\":[{\"text\":\"Duplicate of \",\"type\":\"TEXT\"},{\"text\":\"Issued Credly Badges \",\"type\":\"TEXT\"},{\"type\":\"DATE_RANGE_FILTER_DATE_TIME_RANGE\"},{\"text\":\" \",\"type\":\"TEXT\"}]}",
    "dynamicDescription": "{\"text\":[],\"displayOnCardDetails\":true}"
  }
}
```

Card `1011747248` really has `owners: []`. Ownerless cards exist, and for them only the rights check applies.

**3. Card sources.** All are VERIFIED-CODE in `getCardsForObject` / `getCardsForParent`, and their shapes are VERIFIED-LIVE.

- `GET /api/content/v3/stacks/{id}/cards`: `cards[]` with `title`, `locked`, `metadata.dynamicTitle`. View `2095795725` returned 16 cards.
- `GET /api/content/v1/datasources/{id}/cards`: only `id, urn, type, chartType, title, ownerId, owners, access, datasourceId`. It has **no `metadata` and no `locked`**, so every source is re-hydrated through call 2.
- `GET /api/content/v1/dataapps/{id}` lists the views of an App Studio app or worksheet. `getCardsForParent` then calls `fetchViewDetails` plus the forms, queues, and workflows lookups for every view (skipped with `cardsOnly`), and it keeps a failed view with an `error`.

**4. Pill types.** Domo's insert menu (chunk `47252-74903fdf9114224c`, VERIFIED-LIVE) offers `DATE_RANGE_FILTER_DATE_TIME_RANGE`, `DATE_RANGE_FILTER_PERIODS`, `DATE_RANGE_FILTER_COLUMN`, `DATE_GRAIN`, `FILTER`, `DATA_SOURCE_NAME`, `DATA_SOURCE_OWNER`, `DATA_SOURCE_DATA_LAST_UPDATED` (these three carry `dataSourceId`), `SEGMENT_NAME`, `SEGMENT_DESCRIPTION`, and `VARIABLE_VALUE` (carries `variables`). Pills can also carry `prefix`, `suffix`, and `defaultText`. In a draft-stage survey of 1,326 real cards (VERIFIED-LIVE), 948 had a `dynamicTitle` and 85 of those had pills (`DATE_RANGE_FILTER_DATE_TIME_RANGE` 85, `FILTER` 4, `DATE_GRAIN` 3, `DATE_RANGE_FILTER_PERIODS` 2). Pills are therefore stored and restored as **whole opaque objects**, never rebuilt from `type`.

**5. Document cards.** The displayed title is the card `title`. `metadata.title` holds the file name and already differs from the title on 9 real cards (for example `1023751247`: title `"次の複製：Reseller partner survey.pptx"`, `metadata.title` `"Reseller partner survey.pptx"`, VERIFIED-LIVE). So `/title` is the right call for them too (INFERRED). The spec's `PUT /content/v1/cards/{id}` with `{ metadata: { title } }` is not used (SPEC-ONLY).

**6. Drill views are left alone.** Across 174 sampled root cards with drill paths, duplicated roots carry the "次の複製：" prefix while their drill views keep the original title (for example `1057834066`, VERIFIED-LIVE). The card sources return root cards only.

**7. Certification.** Analyzer expires certification on the client: on save, if the card is `CERTIFIED` it opens the "You've edited a certified Card" modal (i18n `badges/youve-edited-a-certified-card`) and calls `setCertificationState("EXPIRED")` on the definition it saves (chunk `3666-8d3fa44fd8aaf2b7`, VERIFIED-LIVE). The draft's quoted "expires the certification" string does not exist, and that claim is dropped. The Edit Title modal sends no certification field, so a title PUT most likely leaves certification alone (INFERRED). Probing it would need a certification process, which a scratch run cannot set up safely, so it becomes a live verification step.

**8. Not used: title search through `POST /api/content/v2/cards/adminsummary?limit=&skip=`.** Probed for the instance-wide phase that D9.3 dropped, and kept because #8 and #43 page through the same endpoint. Body `{ cardTitleSearchText, includeCardTitleClause: true, ascending, orderBy: "cardTitle" }` (VERIFIED-LIVE). It returns `cardAdminSummaries[] { id, type, title, locked, owners[], pageHierarchy[], badgeUpdated, active }` and `totalCardCount`. **`limit` above 100 returns 400** (VERIFIED-LIVE: 100 works, 200 fails), and the endpoint 429s under concurrent load.

## Design

**Where it lives.** A side panel view, `RenameCardsView`, launched from a new `Rename Cards` action button in the shared `ActionButtons` grid. That grid works from both the popup and the side panel through `useLaunchView`. On an App Studio view or worksheet view, a long-press menu offers "Rename App Cards" or "Rename Worksheet Cards", which switch to parent scope, as Get Cards does. It is a separate view from #8's Remove Cards (DX.1), on the same shared list.

**Contexts that enable it.** `getAvailableActions()` gets its own `renameCards` block for every dataset type (`isDatasetTypeId`), `DATA_APP_VIEW`, `DATAFLOW_TYPE`, `PAGE`, `REPORT_BUILDER_PAGE`, and `WORKSHEET_VIEW`, but only when `USER_RIGHTS` includes `content.card.edit` or `content.admin`. `BEAST_MODE_FORMULA` is excluded. That context set and gate are DX.2 and DX.3. Users who own cards but lack both rights do not get the button. Domo's role defaults rarely produce such users, and showing the button to every viewer would mostly produce lists of disabled rows.

**Per-row editability** uses the shared `canManageCard({ card, userRights })` in `src/utils/cardHelpers.js`, a port of `canManageKpi`, so it agrees with the button gate:

```js
export function canManageCard({ card, userRights }) {
  return (
    userRights.includes('content.admin') ||
    card.isCurrentUserOwner === true ||
    (userRights.includes('content.card.edit') && !card.locked)
  );
}
```

Group owners are covered, because `isCurrentUserOwner` includes group membership (VERIFIED-LIVE).

**Data flow.**

1. The button calls `launch({ currentContext, onStatusUpdate, type: 'renameCards', scope?, parentId? })`, which writes sidepanel session storage like the other views.
2. The view reads `getSidepanelData(instance)`, then calls the shared loader `getCardsForContext({ context, hydrateParts: 'metadata,owners', parentId, scope, tabId })` in `src/services/cards.js` (full contract in Shared infrastructure across issues):
   - **Object scope** uses `getCardsForObject` with the context's metadata. Its existing `DATAFLOW_TYPE` branch already pools the outputs and dedupes by card ID, so nothing is lifted from `GetCardsView`.
   - **Parent scope** uses `getCardsForParent({ cardsOnly: true, parentId })`. The `cardsOnly` option skips `fetchViewDetails` and the forms, queues, and workflows lookups, and reports per-view card errors.
   - **Hydrate:** every card ID goes through one `getCardsByIds({ cardIds, parts: 'metadata,owners' })` call, merged onto the source card.
   - The loader returns `{ cards, failedViews, groups, missingIds, parentName }`. Cards have string IDs and a `loadIndex`. `missingIds` lists source IDs the hydrate did not return.
3. **Rows come from the shared `CardBatchList`.**
   - It owns the row IDs (`${viewId}:${cardId}` with `originalId = cardId` in parent scope, the card ID otherwise) and maps the selection to card IDs, so every instance of a card toggles together.
   - It pins `sortWeight` from `loadIndex` by card ID across reloads, so DataList's label sort does not reshuffle rows when titles change.
   - The view derives per-card data keyed by card ID: editability from `canManageCard`, and the parsed editable title from `toEditable`.
4. **Preview** is pure and runs extension-side. It is recomputed (debounced 150 ms) whenever the transform or the selection changes. No requests are made.
5. **Apply:**
   1. Dedupe the selected rows to unique card IDs. (The selection is already keyed by card ID.)
   2. Re-read those cards with one `getCardsByIds` call. A card missing from the result is skipped as "No longer exists". A card whose `title` or raw `metadata.dynamicTitle` string differs from the snapshot is skipped as "Changed in Domo".
   3. Rebuild each payload from the fresh card with `buildTitlePayload`, so a description edited in Domo since the load is never overwritten.
   4. Run the shared `promisePool` (`src/utils/promisePool.js`, built here to beta 1.2 step 2's signature `promisePool(tasks, { concurrency, onSettled })`) at concurrency 4. Each task first checks the view's AbortSignal, then marks its row `running` and makes one `renameCard()` call (one `executeInPage`), so rows update live. `onSettled` drives the footer count.
   5. A small local transient-retry wrapper retries 429, 502, 503, or 504 up to twice. It waits `Retry-After` when the error carries one, and fails the row naming the wait past 60 s, as 1.2 specifies. Otherwise it waits a fixed 1 s, then 3 s. The PUT is idempotent, which matches the `RETRY_SAFE` class in `docs/plans/beta-phase-1-2-retries-concurrency.md`. `Retry-After` reaches the extension because this issue lands the envelope half of 1.2 step 1: `retryAfter` in the `executeInPage` error envelope (`src/utils/executeInPage.js:227-240`). Once 1.2 step 3 lands, the wrapper becomes `withRetry(fn, { profile: RETRY_SAFE })`.
   6. Any other failure is recorded on the row, with `error.status`, and the run continues.
   7. After the run, reload the rows from Domo through the same loader. `CardBatchList` keeps each card's pinned order.
6. **Undo** is a stack of passes held in view state: `undoStack = [{ passId, entries: [{ cardId, before: { title, dynamicTitle }, after: { title, dynamicTitle } }] }]`. "Undo Rename" pops the latest pass, re-reads those cards, skips any whose current title no longer equals `after.title` ("Changed in Domo"), and rebuilds each payload from the fresh card plus the stored `before` title text. The fresh card's `dynamicDescription` is echoed back unchanged. It uses the same pool and retry.
7. **Run safety while applying.** The view passes `isRunning` to `CardBatchList`, which makes the selection read-only and drops Reload and Refresh from the header. The view also disables the transform panel until the run settles. The view's close button and closing the side panel cannot be blocked today: requests already in flight finish, the abort keeps the rest from starting, and `mountedRef` drops state updates. When `docs/plans/beta-phase-1-6-run-lock.md` lands, the view calls `useRunLock(isRunning, 'Rename Cards')`, and this issue adds `RenameCardsView.jsx` / `isRunning` to that plan's "Which views lock" table. Rename Cards does not journal (DX.4); the banner says undo lasts only as long as the view. Whether it should record into `docs/plans/beta-phase-1-3-change-journal.md` is revisited after 1.3 ships, and the pool's `onSettled` is the hook point if so.

**New service functions** (`src/services/cards.js`, alphabetical per `sort-modules`):

```js
export async function getCardsForContext({ context, hydrateParts = null, parentId = null, parts = null, scope = 'object', tabId = null })
// Between getCardsByIds and getCardsForObject. Returns { cards, failedViews, groups, missingIds, parentName }.
// Shared with #8, which calls it with stacks parts and no hydrate.

export async function renameCard({ cardId, payload, tabId = null })
// After getPageCards (and after #8's removeCardsFromPage once it exists), before setCardsLocked.
// executeInPage: PUT /api/content/v1/cards/${cardId}/title with JSON payload.
// Inside the injected function: on !response.ok, build an Error whose message includes the response text,
// set error.status = response.status and error.retryAfter = response.headers.get('Retry-After'), and throw.
// Returns undefined on success.
```

`getCardsForParent` gains `parts = null`. Its existing `cardsOnly` (pre-existing bug 4) already returns each view group as `{ cards, error, viewId, viewName }` and fetches nothing else.

**New pure module** `src/utils/cardTitles.js`. It has no imports, so a throwaway node script can exercise it.

- `parseDynamicText(jsonString)` returns the parsed object or null. A `dynamicTitle` whose `text` is empty counts as null. A `dynamicDescription` is kept even when empty, because it is present for the payload rule.
- `convertToStaticText(dynamicText)` is an exact port of Domo's function above.
- `isEditableSegment(seg)` is true when `seg.type === 'TEXT'` and the segment has no `prefix` and no `suffix`. Every other segment is an opaque pill.
- `toEditable(card)` returns `{ lead, display, trail, pills, segmentsBefore }`. `display` joins editable TEXT segments and puts a sentinel from the Unicode private-use range (U+E000 + pill index) in place of each pill. `lead` and `trail` are the outer whitespace, split off so that `^` and `$` patterns match what the user sees (`" (Q4) ACV..."` matches `^\(Q4\)`). A card without a dynamic title uses `display = title`. If the title already contains a private-use character, the row is marked unsafe.
- `fromEditable({ lead, display, trail, pills })` splits on the sentinels, re-attaches `lead` and `trail`, merges adjacent TEXT runs, drops empty TEXT runs, and returns `{ dynamicTitle, title }`, with `title = convertToStaticText(dynamicTitle).trim()`.
- `compileFind(transform)` returns `{ regex }` or `{ error }`. Literal mode escapes the find text and uses a function replacer, so `$1` stays literal.
- `applyTransform(display, transform)` handles the modes `replace` (literal or regex, match case, all matches), `prefix`, and `suffix` (each with `skipIfPresent`).
- `validateResult({ before, after, pills, segmentCount })` returns one of `ok`, `unchanged`, `empty` (trimmed static text is empty), `tooLong` (static title over 255), `tooManyParts` (over 50 segments, which the server would silently cut), `removesDynamicText` (a sentinel is missing, duplicated, or reordered), or `unsafe`.
- `buildTitlePayload(freshCard, nextEditable)` implements the payload rule table above.
- `diffSpans(before, after)` does a common prefix and suffix diff for highlighting, sentinel-aware, so a conflicting pill is marked in place.
- `pillLabel(seg)` returns `Date Range`, `Comparison Period`, `Date Column`, `Date Grain`, `Filter`, `DataSet Name`, `DataSet Owner`, `DataSet Last Updated`, `Segment Name`, `Segment Description`, `Variable`, or `Dynamic Text` as the fallback.
- Constants: `MAX_CARD_TITLE_LENGTH = 255`, `MAX_DYNAMIC_TEXT_SEGMENTS = 50`, `DUPLICATE_PREFIX_PATTERN = '^(?:(?:Duplicate|Copy) of )+'`.

**State shape** (in the view):

```js
cards: Array<Card>                    // from getCardsForContext: string id, loadIndex, title, locked, isCurrentUserOwner, metadata
groups: Array<{ cardIds, viewId, viewName }>                        // parent scope only; CardBatchList builds the rows
editableById: Map<cardId, { editable, uneditableReason }>           // derived from cards and USER_RIGHTS via canManageCard
parsedById: Map<cardId, { lead, display, trail, pills, rawDynamicTitle, dynamicDescription }>   // derived once per load
selectedCardIds: Set<string>          // keyed by card ID, so every instance of a card toggles together
transform: { find, matchCase, mode: 'prefix' | 'replace' | 'suffix', prefix, replace, skipIfPresent, suffix, useRegex }
preview: Map<cardId, { next, nextEditable, validity }>   // derived, memoized
run: { phase: 'idle' | 'applying' | 'done', statusByCardId: Map<cardId, { error, reason, status: 'queued' | 'running' | 'done' | 'failed' | 'skipped' }> }
undoStack: Array<{ passId, entries }>
loadIssues: { failedViews, missingIds }
```

`statusByCardId` uses `CardBatchList`'s status vocabulary. `CardBatchList` renders the badges (spinner, check, or X with `Failed: {message}`). The view's `chipFor` renders the `skipped` reasons and invalid states as chips.

**Shared with #8.** This issue builds the shared card pieces first, and #8 adopts them. The full contract is in Shared infrastructure across issues.

1. **`getCardsForContext`**, plus `cardsOnly` and `parts` on `getCardsForParent` (above).
2. **`cardUrlOnPage({ cardId, objectId, objectType, origin, parentId })`** and **`canManageCard`** in `src/utils/cardHelpers.js`. `cardUrlOnPage` is lifted from `GetCardsView.transformCardsToItems`, which uses it from then on.
3. **One new DataList prop, `renderItemDetail: (item) => ReactNode | null`.**
   - It renders a secondary block under the label of a leaf row at any depth, outside the disclosure trigger and any pressable element.
   - It is threaded through `childRenderProps`, compared by function identity in `arePropsEqualForRow`, and paired with a taller virtualizer `estimateSize`.
   - It is documented in the DataList JSDoc block, and the never-rendered `DataListItem.metadata` doc is fixed at the same time.
   - #9 uses it for the before/after diff, #8 for its placements line, and #6 for its expandable formulas. Row labels stay plain strings, because `sortItemsByLabel` calls `.toString()` on them.
4. **`CardBatchList`** (`src/components/views/CardBatchList.jsx`): the one selectable card list wrapper. It handles row IDs, card-ID selection mapping (diffing row sets so unchecking one instance unselects the card), pinned order, group virtual parents, select-all, status and lock badges, and the `isRunning` interim lock.
5. **`promisePool`** (1.2 step 2 signature), in its own commit, recorded in the 1.2 plan. #80 adopts it.
6. **Hold constants** `HOLD_DURATION_FULL` (5000), `HOLD_DURATION_SHORT` (2500), and the new `HOLD_DURATION_BULK` (3000) in `src/utils/constants.js`, with `HoldToConfirmButton.jsx` and `DeleteObjectView.jsx` switched to them in the same commit. #8 uses `HOLD_DURATION_BULK` too.

#9 does not use `batchWithFallback`. There is no bulk title endpoint, so a per-card pool is the right executor. There is also no shared hook: #9's selection depends on the live preview, and its run includes a fresh re-read and an undo stack, so a hook built around #8's bulk chunks would not fit.

Everything else #9 needs already exists in DataList: controlled selection with `selectAll`, `isSelectable`, `getUnselectableTooltip`, `getItemBadge` for per-row status, item `chip` for row states, `banner`, `footer`, `sortWeight`, and virtualization. "Only show cards that change" filters the `cards` passed to `CardBatchList`, so no filter prop is needed.

Find and replace, prefix and suffix, and the diff stay in #9's `TitleTransformPanel`, `TitleDiff`, and `cardTitles.js`. #8 has no use for them.

**Feature switches.** None. The `dynamic-text` switch only changes how Domo renders and edits titles, and the payload rule is correct with it on or off.

## UX

**Entry point.** The action button is `Rename Cards`, with icon `@icons/datatype-text.svg` (currently unused, VERIFIED-CODE). `pencil.svg` is already used by Update Details and Update Owner, and both would sit in the same grid on a dataflow. Tooltip: "Rename cards on this object in bulk. Titles change everywhere the cards appear." On an App Studio view or worksheet view the tooltip adds the italic line "Hold for more options", and long-press offers "Rename App Cards" or "Rename Worksheet Cards". The copy is the same in the popup and the side panel: from the popup, `useLaunchView` opens the side panel on this view.

**Flow.**

1. Open: a spinner, then the view titled `Rename Cards for <object name>`. Every editable card is selected, and the mode is Replace with an empty Find field.
2. Type in Find (and optionally Replace), or switch to Add Prefix or Add Suffix. Each row shows its current title and, under it, the new title with the changed span highlighted.
3. Optionally uncheck rows, or turn on "Only show cards that change".
4. Hold `Hold to Rename N Cards` for 3 seconds. Rows tick over live, and the footer counts progress.
5. When done, a toast with an Undo action appears. The view stays open on the fresh titles, so another pass is possible, and the footer offers `Undo Rename`.

**Key screen (side panel), object scope:**

```
+------------------------------------------------+
| [Aa] Rename Cards for                          |
|      [app] Certification            (R) (x)    |
|      **15** of **16** cards will change        |
+------------------------------------------------+
| ( Replace | Add Prefix | Add Suffix )          |
| Find     [Duplicate of             ] [.*] [Aa] |
| Replace  [                         ]           |
| (Remove "Duplicate of" / "Copy of")            |
| (i) Titles change everywhere these cards       |
|     appear. Undo lasts until you leave this    |
|     view.                                      |
| [x] Only show cards that change                |
| [-] Select all (15 / 16)                       |
+------------------------------------------------+
| [x] Duplicate of All Certifications            |
|     All Certifications                         |
| [x] Duplicate of Issued Credly Badges [Date Ra.|
|     Issued Credly Badges [Date Range]          |
| [ ] Domo Certifications           (No Change)  |
| [~] Duplicate of Badge Acceptance Rate  (lock) |
+------------------------------------------------+
| [        Hold to Rename 15 Cards         ]     |
+------------------------------------------------+
```

The current title (the row label) renders as usual. The detail line, through `renderItemDetail`, renders the new title, with inserted text in an accent tint and removed text struck through in a muted tint. Pills render as small inline chips labeled by `pillLabel` (with the pill's `defaultText` in the chip tooltip when it has one), in place in both lines. When a regex would swallow a pill, the detail line shows the pill chip with a danger outline at its position.

**Parent scope** groups rows by view (virtual parents labeled with the view name, with group-level select). The subtext reads "**42** of **118** cards will change across **9** pages". The footer reads `Hold to Rename 42 Cards on 9 Pages`, so the size of the run is visible on the button.

**Applying and results:**

```
| [*] Duplicate of All Certifications    (spin)  |
| [v] All Certifications                 (check) |
| [!] Duplicate of Certifications        (X)     |
+------------------------------------------------+
| [         Renaming 6 of 15...          ]       |    while running
| [ Retry 1 Failed ] [ Undo Rename ]             |    after a partial failure
| [            Undo Rename             ]         |    after a clean run
```

**States and copy.** Toasts use `showStatus(title, description, status, timeout, { actionProps })` directly, because `showPromiseStatus` has no `actionProps` and always uses the 3 s success timeout (`src/hooks/useStatusBar.jsx`, VERIFIED-CODE). Toast descriptions end with a period per code-style.md.

| State                                    | Behavior and copy                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading                                  | Centered `Spinner`, as in Manage Card Locks.                                                                                                                                                                                                                                                                                                                                                                                                |
| Empty                                    | Subtext "No cards found on this object." The footer button is disabled.                                                                                                                                                                                                                                                                                                                                                                     |
| Nothing entered                          | Subtext "**16** cards. Enter text to find, or add a prefix or suffix."                                                                                                                                                                                                                                                                                                                                                                      |
| Preview                                  | Subtext "**15** of **16** cards will change". Footer `HoldToConfirmButton` "Hold to Rename 15 Cards" (singular "Hold to Rename 1 Card").                                                                                                                                                                                                                                                                                                    |
| No matches                               | Subtext "No titles match." The footer is disabled.                                                                                                                                                                                                                                                                                                                                                                                          |
| Invalid regex                            | Inline error under Find: "Invalid regular expression: {message}". Previews are cleared.                                                                                                                                                                                                                                                                                                                                                     |
| Some views failed to load (parent scope) | Warning `Alert` in the banner: "**2** pages couldn't be loaded, so their cards aren't listed." Hovering the count lists the page names and errors.                                                                                                                                                                                                                                                                                          |
| Some cards failed to hydrate             | Warning `Alert`: "**3** cards couldn't be read and aren't listed."                                                                                                                                                                                                                                                                                                                                                                          |
| Row can't be renamed (locked)            | Disabled checkbox with the tooltip "This card is locked. Only its owners and content admins can rename it."                                                                                                                                                                                                                                                                                                                                 |
| Row can't be renamed (rights)            | Tooltip "You don't have permission to edit this card."                                                                                                                                                                                                                                                                                                                                                                                      |
| Row result invalid                       | Unselectable row with a chip and tooltip: "Empty Title" ("Domo would save this card as \"Title\"."), "Over 255 Characters" ("Domo would cut this title at 255 characters."), "Too Many Parts" ("Domo allows at most 50 text and dynamic parts in a title."), "Removes Dynamic Text" ("This change would delete or move the title's dynamic text."), or "Can't Edit Safely" ("This title contains characters Rename Cards can't preserve."). |
| No change                                | Row chip "No Change", unselected.                                                                                                                                                                                                                                                                                                                                                                                                           |
| Add Prefix / Add Suffix                  | Input placeholders "Text to add before each title" / "Text to add after each title". Checkbox "Skip cards that already start with it" / "Skip cards that already end with it" (on by default).                                                                                                                                                                                                                                              |
| Applying                                 | Footer "Renaming 6 of 15..." (disabled). Transform panel, selection, Reload, and Refresh are disabled. No loading toast.                                                                                                                                                                                                                                                                                                                    |
| Success                                  | Toast title "Cards Renamed", description "Renamed **15** cards.", `success`, 15000 ms, with an `Undo` action. Rows reload from Domo and the transform resets. Footer "Undo Rename".                                                                                                                                                                                                                                                         |
| Partial failure                          | Toast title "Rename Partially Failed", description "Renamed **12** cards. **3** failed.", `warning`, 15000 ms, with an `Undo` action. Failed rows get an X badge whose tooltip shows "Failed: {message}". Footer "Retry 3 Failed" plus "Undo Rename".                                                                                                                                                                                       |
| Skipped                                  | Row chip "Changed in Domo" (tooltip "This title changed after the list loaded, so it was skipped. Refresh to try again.") or "No Longer Exists" (tooltip "This card was deleted after the list loaded."). Skipped rows count toward neither renamed nor failed, and the toast description appends " **1** skipped."                                                                                                                         |
| Full failure                             | Toast title "Rename Failed", description "Failed to rename cards: {message}.", `danger`. The view stays open with every row's error.                                                                                                                                                                                                                                                                                                        |
| Permission denied (every row 403)        | Same as full failure, with the row tooltip "You don't have permission to edit this card."                                                                                                                                                                                                                                                                                                                                                   |
| Undo                                     | Footer "Restoring 6 of 15...". Success toast "Rename Undone" / "Restored **15** card titles.". Partial "Undo Partially Failed" / "Restored **12** card titles. **3** failed.".                                                                                                                                                                                                                                                              |

**Confirmation style** (D9.4). Every run starts from a `HoldToConfirmButton` with `duration={HOLD_DURATION_BULK}` (3 s), whatever the card count or scope. The hold is short because renaming is reversible (in-view Undo, plus the audit log's "previous display name") and every exact change is previewed; it is there so a mistyped regex cannot fire on a stray click. In parent scope, the run size is in the button label. **Undo Rename** and **Retry N Failed** stay plain buttons, since they only reverse or replay a run that was already held for, and the toast's Undo action cannot hold anyway.

**Quick fill.** The chip `Remove "Duplicate of" / "Copy of"` switches to Replace with regex on, Find `^(?:(?:Duplicate|Copy) of )+`, and Replace empty. It also removes stacked prefixes such as "Duplicate of Duplicate of " (dataset card `627918209`). It covers Domo's English strings only (i18n keys `duplicate-of` and `copy-of`). Localized prefixes such as "次の複製：" use plain Find.

## Implementation plan

1. **Pure helpers.** Add `src/utils/cardTitles.js` with `applyTransform`, `buildTitlePayload`, `compileFind`, `convertToStaticText`, `diffSpans`, `fromEditable`, `isEditableSegment`, `parseDynamicText`, `pillLabel`, `toEditable`, `validateResult`, and the constants `DUPLICATE_PREFIX_PATTERN`, `MAX_CARD_TITLE_LENGTH`, `MAX_DYNAMIC_TEXT_SEGMENTS`. No imports. Exports alphabetical.
2. **Shared card plumbing, one commit with no user-visible change** (the contract in Shared infrastructure across issues; #8 adopts all of it):
   - `src/utils/cardHelpers.js`: add `canManageCard` and `cardUrlOnPage`. Switch `GetCardsView.transformCardsToItems` to `cardUrlOnPage`.
   - `src/services/cards.js`: add `cardsOnly` and `parts` to `getCardsForParent`, and add `getCardsForContext` between `getCardsByIds` and `getCardsForObject`. Nothing is lifted from `GetCardsView`: the dataflow dedupe already lives in `getCardsForObject`, and `transformParentScopeItems` stays as the Get Cards UI transform.
   - `src/components/views/DataList.jsx`: add `renderItemDetail` (leaf rows at any depth, through `childRenderProps` and both `VirtualizedItems` call sites, compared by identity in `arePropsEqualForRow`, taller `estimateSize` when set). Document it in the props JSDoc, and fix the `DataListItem.metadata` doc in `src/models/DataListItem.js`.
   - `src/components/views/CardBatchList.jsx`: the wrapper, with the props listed in Shared infrastructure across issues.
3. **Executors and holds, one commit.**
   - Add `src/utils/promisePool.js` to 1.2 step 2's signature (`promisePool(tasks, { concurrency = 6, onSettled })`, settled results in input order). Leave `ActivityLogTable.jsx`'s local copy to 1.2.
   - The envelope `retryAfter` field has already landed (pre-existing bug 5), so this step needs no `executeInPage.js` change.
   - Record `promisePool`, plus the title PUT as `RETRY_SAFE`, in `docs/plans/beta-phase-1-2-retries-concurrency.md` (amendments in Shared infrastructure across issues).
   - In `src/utils/constants.js`, add `HOLD_DURATION_BULK = 3000`, `HOLD_DURATION_FULL = 5000`, and `HOLD_DURATION_SHORT = 2500`. Replace `DEFAULT_HOLD_DURATION` in `HoldToConfirmButton.jsx` and `FULL_HOLD_DURATION` / `SHORT_HOLD_DURATION` in `DeleteObjectView.jsx` with them. No hold changes length.
4. **Services** in `src/services/cards.js`: add `renameCard({ cardId, payload, tabId })` after `getPageCards` (and after #8's `removeCardsFromPage` if it exists), before `setCardsLocked`. Its JSDoc notes that leaving out `dynamicTitle` or `dynamicDescription` deletes them, and that the server derives `title` and `description` from them. It sets `error.status` and `error.retryAfter`.
5. **Transform panel and diff.** Add `src/components/views/renameCards/TitleTransformPanel.jsx`: HeroUI `ToggleButtonGroup` for the mode, `Input`s, `ToggleButton`s for regex and match case, the quick-fill `Chip`, the scope note, and the "Only show cards that change" checkbox. Add `src/components/views/renameCards/TitleDiff.jsx`, which renders the new title with highlighted spans and pill chips.
6. **View.** Add `src/components/views/RenameCardsView.jsx`, modeled on `ManageCardLocksView.jsx`:
   - `getSidepanelData` with a `'renameCards'` type check, `useViewReady`, and `mountedRef`.
   - Loading through `getCardsForContext({ context, hydrateParts: 'metadata,owners', parentId, scope, tabId })`.
   - `useStatusBar().showStatus` with `actionProps` for Undo at a 15000 ms timeout (model: `GetPagesView.jsx:449`).
   - `CardBatchList` with `headerActions={['reload', 'refresh']}`, `isRunning`, `viewType='renameCards'`, `feature='Rename Cards for'`, `featureIcon` from `datatype-text.svg`, `renderDetail` (memoized `TitleDiff`), `chipFor` for the skip and invalid states, `isSelectable` / `unselectableReason` from `canManageCard` plus preview validity, `rowStatus` from `run.statusByCardId`, and `statusLabels` of `Renaming...` / `Renamed` / `Failed`.
   - The footer is a `HoldToConfirmButton` (`duration={HOLD_DURATION_BULK}`) for every run; Undo Rename and Retry Failed are plain `Button`s.
   - The view owns the apply run through `promisePool` (concurrency 4) and the local transient-retry wrapper, the conflict re-read, Retry Failed, the undo stack, and an AbortController aborted on unmount.
7. **Button.** Add `src/components/buttons/RenameCards.jsx`, modeled on `GetCards.jsx`: long-press `Dropdown` with "Rename App Cards" / "Rename Worksheet Cards", `useLongPress`, and `useLaunchView`.
8. **Wiring.**
   - `src/utils/availableActions.js`: a new `renameCards` block (dataset types, `DATA_APP_VIEW`, `DATAFLOW_TYPE`, `PAGE`, `REPORT_BUILDER_PAGE`, `WORKSHEET_VIEW`), gated on `content.card.edit` or `content.admin` (DX.3). It cannot ride inside the `getCards` block because that block includes `BEAST_MODE_FORMULA`.
   - `src/components/ActionButtons.jsx`: render `RenameCards` next to `ManageCardLocks` and `ManageCardOwners`.
   - `src/sidepanel/App.jsx`: add the `slot.type === 'renameCards'` route, with the same props as `ManageCardLocksView`.
   - `docs/plans/beta-phase-1-6-run-lock.md`: add `RenameCardsView.jsx` / `isRunning` to "Which views lock".
   - `docs/CONTRIBUTING.md` has no per-action list (VERIFIED-CODE), so it needs no change. The actions-catalog registry is not built yet, so `availableActions.js` stays the only gate.
9. **Docs.** In `docs/README.md`, add a line next to "Lock Cards": "**Rename Cards** - Find and replace, add a prefix, or add a suffix across every card on a page, App Studio page or app, worksheet, Report Builder report, dataset, or dataflow, with a live preview and undo." Add the WIP bullets to `docs/RELEASE_NOTES.md` under "New Features and Improvements".
10. **Lint.** Run `npx eslint --no-warn-ignored` on every touched `.js` / `.jsx` file.
11. **Later hooks (not blockers).**
    - When beta 1.2 step 3 lands, swap the local transient-retry wrapper for `withRetry(fn, { profile: RETRY_SAFE })`.
    - When 1.6 lands, call `useRunLock(isRunning, 'Rename Cards')`.
    - After 1.3 ships for Transfer Ownership and Duplicate User, revisit whether Rename Cards journals (DX.4). If yes, record each pass and each undo from the pool's `onSettled`, and the in-view undo banner's lifetime caveat can go.
12. **Follow-up: descriptions (D9.2), a separate change after v1 ships.**
    - Add an **Apply to: Title | Description** `ToggleButtonGroup` above the mode control. The transform, preview, and validation run on the chosen field only.
    - `toEditable` and `fromEditable` take the field. For descriptions they read `metadata.dynamicDescription` (pills behind sentinels as for titles) or the static `description` when there is none.
    - `buildTitlePayload` becomes `buildCardTextPayload(freshCard, { field, nextEditable })`. A description edit echoes `dynamicTitle` back unchanged and edits `dynamicDescription` (keeping `displayOnCardDetails` exactly as stored), or sends `description` alone on a card with no dynamic fields. It never creates a `dynamicDescription`.
    - Descriptions keep the 50-segment limit from Domo's modal. An empty description is allowed, since the modal's non-empty check reads the title only (INFERRED from the bundle line above). The pre-apply re-read and Undo compare the edited field.
    - Re-run the payload survey cases from API finding 1 with a description edit before shipping.

## Edge cases and risks

- **Dynamic text loss.** This is the largest correctness risk, and the live probes settle it: a title-only PUT deletes both dynamic fields, and `{ title, dynamicTitle }` deletes `dynamicDescription`. `buildTitlePayload` sends exactly the fields the fresh card has, echoes `dynamicDescription` unchanged, and never creates dynamic fields on a plain card.
- **The server re-derives `title` and `description`.** The plan never relies on a sent `title` when `dynamicTitle` is present, and always computes `title` with the ported `convertToStaticText` plus trim. The preview therefore shows exactly what Domo will store.
- **Silent server truncation.** Titles over 255 characters and dynamic text over 50 segments are cut without an error. Both are blocked client-side. Prefix and suffix next to a pill add a TEXT segment, so a title at 50 parts can be pushed over the limit.
- **Empty result.** The server would store "Title", so empty results are blocked.
- **Pills inside a match.** A regex such as `.*` can swallow a sentinel. `validateResult` rejects that row as "Removes Dynamic Text", and the diff marks the pill, so pills are never deleted or reordered. Pill `prefix`, `suffix`, and `defaultText` are not editable by the transform.
- **Leading or trailing spaces in stored text.** These are split off as `lead` / `trail` before matching, so anchored patterns match the visible title.
- **Titles are global.** A card on several pages or apps is renamed everywhere. The banner and the button tooltip say so. Per-row placement counts are not fetched.
- **Parent-scope duplicates.** The same card under several views toggles as one (`CardBatchList` diffs row sets, so unchecking one instance unselects every instance), is renamed once, and gets one result shown on every instance.
- **Locked cards.** Rows are disabled unless the user is a content admin or an owner (group ownership included). A 403 is still possible where server rules differ from `canManageKpi`, and it shows per row.
- **Concurrent edits.** The pre-apply re-read skips changed or deleted cards. Undo skips cards whose title moved again, and rebuilds payloads from a fresh read so it does not clobber a description edited in Domo meanwhile.
- **Side panel closed mid-run.** In-flight requests finish and the rest are not sent. Reopening shows current titles, and the audit log shows what changed. The in-memory undo stack is lost on close, on another launch, or on Reload/Refresh after the run. The banner states this. The 1.3 journal would remove the limitation if the DX.4 revisit says yes.
- **Rate limits.** One PUT per card at concurrency 4, with retries that honor `Retry-After`.
- **Certified cards.** A title PUT most likely does not expire certification, because Analyzer expires it client-side and the title path sends no certification field (INFERRED). This is verified live before release. If it does expire, add a "Certified" chip and a banner note.
- **Card types.** `kpi` and `Text` are VERIFIED-LIVE. `document`, `domoapp`, `rooster`, and `supertable` are INFERRED, since Domo's card details use the same call for every type. Verify a `domoapp` and a document card live.
- **Private-use characters already in a title** (very unlikely): the row is marked "Can't Edit Safely".
- **Regex cost.** Titles are short (255 characters, dynamic text about 1 KB at most), and the preview is debounced.
- **Drill views** keep their titles, which matches what duplication does.
- **Domo's import prefix option** means some imported apps already have clean titles. The feature is still needed for every other duplicate path and for non-duplicate renames.
- **Shared-piece regressions.** `renderItemDetail` and the `getCardsForParent` options are additive, and every existing consumer keeps its current path. The envelope's new `retryAfter` field is `undefined` wherever nothing sets it.

## Testing and verification

- **Pure helpers.** Write a throwaway script under `/tmp` that imports `src/utils/cardTitles.js` and asserts:
  - "Duplicate of " removal on the real view `2095795725` titles, including the stacked `Duplicate of Duplicate of` case from dataset card `627918209`.
  - Pill preservation for `[TEXT, DATE_RANGE_FILTER_DATE_TIME_RANGE, TEXT]`, plus a `FILTER` pill with `defaultText` and a `VARIABLE_VALUE` pill with `variables` (the whole object round-trips).
  - `convertToStaticText` parity on `prefix` / `suffix` / `defaultText` segments.
  - Rejection when a regex eats a sentinel.
  - `^` anchoring past leading whitespace.
  - Prefix and suffix with skip-if-present.
  - Literal `$1` in non-regex mode.
  - The 255-character, 50-segment, and empty guards.
  - The payload rule for all six shapes in the survey table.
- **Compile and HMR.** `yarn dev` is usually already running on 31573, so check `lsof -nP -iTCP:31573 -sTCP:LISTEN` first and watch its output for compile errors. There is no `/dev-*` route for this view.
- **CRXJS dev extension.** In the debug profile, build a scratch dashboard named `domo-toolkit-test-rename-...` with a few duplicated cards (one with a date-range pill, one with a dynamic description and `displayOnCardDetails: false`, one plain card with a static description, one locked). Open the side panel and run Rename Cards. Exercise:
  - Replace, regex, match case, quick fill, prefix, suffix, and the "Removes Dynamic Text" block.
  - Select-all and "Only show cards that change".
  - The 3 s hold on the footer: releasing early starts nothing, and Undo and Retry Failed apply on a single press.
  - Apply, then Undo, then a second pass and Undo again (only the latest pass reverts).
  - Conflict skip (rename one card in Domo after loading) and "No Longer Exists" (delete one card in another tab after loading).
  - Retry Failed.
  - Parent scope from an App Studio view with the same card on two views: unchecking it under one view unchecks it under the other, and row order holds after the rename.
  - That Reload and Refresh disappear while applying.
- **Screenshots.** Run `node scripts/ext-shot.js sidepanel --live` with the view open, in light and dark, for the preview, applying, and results states. Also run `node scripts/ext-shot.js popup --live` to check the button and tooltip.
- **Live checks after a run** (scratch cards only):
  - `GET /api/content/v1/cards?urns=...&parts=metadata,owners` shows `metadata.dynamicTitle` still containing the pill object unchanged, and `dynamicDescription` byte-identical, `displayOnCardDetails` included.
  - The plain card's static `description` survives.
  - The audit log shows "previous display name" for each card.
  - Card details in Domo show the new title with the date range still rendering, and Domo's Edit Title modal opens with the pill intact.
  - A `domoapp` card and a document card rename correctly.
  - On a certified card the tester owns, `certificationState` is unchanged after a rename.
  - A locked card shows a disabled row for a non-admin, non-owner test user, and an enabled row for a member of an owning group.
- **Gating.** A user without `content.card.edit` does not see the button. A content admin sees locked cards enabled. A Beast Mode context shows no button.
- **Regression for the shared commits.** Get Cards' card URLs are unchanged after `cardUrlOnPage` moves. Get App Cards still lists forms, queues, and workflows (default `getCardsForParent` path). Manage Card Locks, Get Cards, and the Delete view's dependency list render as before (no `renderItemDetail`). The activity log is unaffected (its local `promisePool` is not moved).
- Run ESLint on every touched file.

## Design decisions made

- **Endpoint: `PUT /api/content/v1/cards/{id}/title`, not the full definition PUT.** It is Domo's Edit Title call, touches nothing else on the card, and works on non-`kpi` cards. Evidence: frontend bundle and live probes.
- **Payload rule: send exactly the dynamic fields the fresh card has, echo `dynamicDescription` unchanged, never synthesize a description.** Live probes showed title-only deletes both dynamic fields, `{ title, dynamicTitle }` deletes `dynamicDescription` but keeps a static description, and the server derives `title`/`description` from the dynamic fields. Mirroring Domo's modal exactly would add a `dynamicDescription` to every plain card.
- **The critique's static-description-with-empty-dynamic-description case is not a real stored state.** It was absent in a 595-card survey, and the server makes it impossible by deriving `description` from `dynamicDescription`. The rule still handles it safely.
- **Static title computed as `convertToStaticText(...).trim()`, client-side.** This is Domo's function ported verbatim. The server trims only when deriving from `dynamicTitle`, keeps inner spaces, and stores a title-only `title` untrimmed (live). The draft's "collapses doubled spaces" inference was wrong and is dropped.
- **Enforce 255 characters, 50 segments, and non-empty client-side.** The server silently truncates the first two and turns empty into "Title" (live), and Domo's modal enforces the 50-segment and non-empty rules itself (bundle).
- **Pills are opaque whole objects behind private-use sentinels, and results that drop or move them are rejected.** The full pill catalog includes types carrying `dataSourceId`, `variables`, and `defaultText` (bundle), and a "Duplicate of " match spans TEXT segments on real cards.
- **Button gate `content.card.edit || content.admin`, with per-row editability from the shared `canManageCard`.** Domo's own rule (bundle), and the maintainer's DX.3 answer. `isCurrentUserOwner` covers group owners (live probe with scratch group `163222655`), so group owners of locked cards are correctly enabled. Users who own cards without either right are excluded on purpose, as stated in Design.
- **Separate Rename Cards button and view rather than a mode in #8's view** (DX.1). #8 is a remove-then-close flow scoped to pages and App Studio pages. Rename needs a transform panel, multi-pass stay-open behavior, and dataset and dataflow sources. Sharing the loader, the list, and one DataList prop gets the reuse without coupling the two views' state.
- **A 3 s hold on every run, plain Undo and Retry** (D9.4). One shared `HOLD_DURATION_BULK` with Remove Cards, short because the change is reversible.
- **#9 builds the shared card pieces, and #8 adopts them.** #9 is the smaller issue and the harder consumer (grouped parent scope, duplicate instances, pinned order, live per-card status), so the shared list is shaped against it first. A fixed order replaces the earlier whichever-lands-first rule, which is how the two plans diverged.
- **Shared loader `getCardsForContext` over `getCardsForObject` and `getCardsForParent`, with an optional merged hydrate.** The dataflow dedupe already lives in `getCardsForObject` (code), so nothing is lifted from GetCardsView except the card URL rule (`cardUrlOnPage`). Merging instead of replacing keeps source-only fields #8 needs.
- **One DataList prop, `renderItemDetail`.** #8's visible placements line and #6's expandable formulas need the same slot as this diff, so DataList gains one prop instead of three. The row filter stays in the view because DataList needs no new prop for it.
- **No shared hook.** The run here is a per-card pool with a fresh re-read and an undo stack, and selection follows the live preview, so a hook built around bulk chunks would not fit. `CardBatchList` carries the shared list behavior.
- **`cardsOnly` option on `getCardsForParent`.** Rename only needs cards, and the default call fetches view details, forms, queues, and workflows for every view (code). It landed with pre-existing bug 4.
- **Row IDs `${viewId}:${cardId}` with `originalId`, and `sortWeight` pinned from the first load, both owned by `CardBatchList`.** DataList IDs must be unique, and its label sort would reshuffle rows after every rename (code). Owning them in the shared list means #8 gets the same behavior.
- **Leaf-row status through `getItemBadge` and `chip`, not `status`/`error`.** DataList renders the error body only for virtual parents (`DataList.jsx:1006`).
- **Manual `showStatus` toasts with a 15000 ms Undo action, and no loading toast.** `showPromiseStatus` has no `actionProps` and a 3 s success timeout (code). Progress lives in the footer.
- **`promisePool` built to beta 1.2 step 2's signature rather than a view-local pool.** The shared helper is already specified, and #80 needs one too, so building it once to the spec avoids a third copy.
- **Retries honor `Retry-After`, falling back to a fixed 1 s / 3 s, on 429/502/503/504.** This issue lands the envelope field that carries `Retry-After` (1.2 step 1's envelope half, three lines). The PUT is idempotent. The wrapper swaps for `withRetry` when 1.2 step 3 lands.
- **Pre-apply re-read, dedupe, and conflict or missing skip.** `getCardsByIds` silently drops deleted cards (code), so "No Longer Exists" is reported from the re-read rather than by expecting a 404.
- **In-memory undo stack (latest pass first), payloads rebuilt from a fresh read, with a stated lifetime.** It is cheap, honest about its limits, and the only rollback while Rename Cards does not journal (DX.4).
- **Reload and Refresh removed while applying, through `CardBatchList`'s `isRunning`; 1.6 run lock adopted later.** Parent-scope runs are long enough that an accidental reload is plausible, and #8 gets the same interim lock from the shared list.
- **Icon `datatype-text.svg`.** It is unused, and `pencil.svg` would collide with Update Details on dataflows (code).
- **Card titles only in v1; drill views, axis titles, and legend titles excluded.** Duplication does not prefix drill views (live sample of 174 roots), and axis and legend titles need a definition rewrite. Descriptions follow as a quick follow-up (D9.2).
- **The view stays open after success.** Multi-pass edits are common (strip a prefix, then add a suffix), unlike lock/unlock, which closes.
- **Quick-fill regex for Domo's English duplicate prefixes.** Domo's i18n has `duplicate-of` / `copy-of`, and 8,255 "Duplicate of" cards exist on domo.domo.com.

## Decisions

IDs are `D9.<n>`. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### D9.1. Should v1 include per-row inline title editing?

**Decision:** Option 1. No inline editing. `renderItemDetail` renders a read-only diff, and single-card edits stay in Domo's Edit Title modal.

1. No: find and replace, prefix, suffix, and unselecting rows only; single-card edits stay in Domo's Edit Title modal
2. Yes: a pencil on each row opens an input (disabled on titles with dynamic text)
3. A per-row 'Override' field in an expandable row body

**Planning recommendation:** Option 1 for v1. It is the part closest to re-skinning Domo's own Edit Title modal, and it would be disabled on titles with dynamic text anyway.

**Why it matters:** With option 1, renderItemDetail only renders a read-only diff. The shared renderItemDetail slot is already specified to sit outside the row's press handling (so #6 can put an expandable formula there), so options 2 or 3 no longer need DataList work. They still need an overrides map in the view state, override-wins-over-transform logic in the preview, and per-row validation of the typed title.

### D9.2. Should v1 also rename card descriptions, or only titles?

**Decision:** Option 3. Titles in v1, descriptions as a quick follow-up. v1 echoes `dynamicDescription` back unchanged; the follow-up is sketched in #9's Implementation plan.

1. Titles only (dynamicDescription is always echoed back unchanged)
2. Add an 'Apply to: Title / Description' toggle using the same engine and endpoint
3. Titles in v1, descriptions as a quick follow-up

**Planning recommendation:** Titles only in v1. The engine, payload builder, and endpoint are field-agnostic, so adding descriptions later is small.

**Why it matters:** The issue asks only for titles, and CLAUDE.md says to confirm before broadening scope. Descriptions add a second diff line per row, a mode control in the panel, and pill handling on descriptions with dynamic text. The PUT already carries descriptions, so the API side costs nothing either way.

### D9.3. Should a phase 2 add renaming across unrelated pages and datasets, and if so, how should cards be chosen?

**Decision:** Option 1. Rename Cards stays scoped to the current object or App Studio app. The instance-wide title search phase is dropped from the plan, along with its adminsummary source and context-free entry point.

1. No, keep it scoped to the current object or App Studio app
2. Instance-wide 'find cards by title' source over adminsummary title search, for content admins only, opened from the options page
3. An 'Add Cards From...' picker inside the view that merges more pages or datasets into the working set
4. Both of the last two

**Planning recommendation:** Ship v1 context-scoped, then add the instance-wide title search for content admins. adminsummary already does server-side title search (8,255 'Duplicate of' cards on domo.domo.com), which matches the real cross-object need.

**Why it matters:** It decides whether the view needs a context-free entry point (an options page tab or a side panel launcher with no object), a paginated search source (adminsummary caps at 100 per page and 429s under load), and content.admin gating separate from the per-object button. It also sets the blast radius, which feeds the confirmation question.

### D9.4. How strong should the confirmation be before renaming?

**Decision:** Option 2, with a 3 second hold. Every rename run goes through `HoldToConfirmButton` at the new `HOLD_DURATION_BULK` (3000), which Remove Cards (#8) shares. No threshold logic. Undo and Retry Failed stay plain presses, since they only reverse or replay a run that was already held for.

1. Plain 'Rename N Cards' button, relying on the full preview, in-view Undo, and the audit log
2. HoldToConfirmButton for every run
3. Plain button, switching to HoldToConfirmButton above a threshold (for example 50 cards), in parent scope, or for the instance-wide source

**Planning recommendation:** Plain button for object scope. Use a hold above 50 cards, which covers most parent-scope runs, and always for a phase 2 instance-wide source.

**Why it matters:** Renames are reversible and fully previewed, so a hold mostly adds friction to the common 15-card cleanup. But a mistyped regex across hundreds of cards in an App Studio app is tedious to audit, and the in-view undo disappears if the panel closes. The answer changes the footer component, its copy, and whether threshold logic exists.

## Release notes draft

- Pages, App Studio pages, worksheets, Report Builder pages, datasets, and dataflows now have a Rename Cards button that renames their cards in bulk with find and replace, a prefix, or a suffix. ([#9](https://github.com/brycewc/domo-toolkit/issues/9))
- Rename Cards previews every new title before it runs and can undo the rename afterward. ([#9](https://github.com/brycewc/domo-toolkit/issues/9))

## Appendix: writes made on domo.domo.com during planning

Every write went to a scratch object the agent created for the probe (named `domo-toolkit-probe-9-*`), and every scratch object was deleted and confirmed gone.

- Draft stage: created scratch page 1888016056 'domo-toolkit-probe-9-rename-page' (POST /api/content/v1/pages)
- Draft stage: created scratch card 2066953017 'domo-toolkit-probe-9-kpi Badges' via POST /api/content/v2/cards/1011747248/saveas onto page 1888016056 (source card 1011747248 not modified)
- Draft stage: six title PUTs on scratch card 2066953017 via PUT /api/content/v1/cards/2066953017/title (title only, all four fields, title plus dynamicTitle, empty title, 1026-character title, rename while locked)
- Draft stage: locked then unlocked scratch card 2066953017 (PUT and DELETE /api/content/v1/cards/bulk/lock)
- Draft stage: created scratch notebook card 1501266072 'domo-toolkit-probe-9-notebook' on page 1888016056 (POST /api/content/v1/cards/notebook) and renamed it once via PUT /api/content/v1/cards/1501266072/title
- Draft stage cleanup: deleted cards 2066953017 and 1501266072 (DELETE /api/content/v1/cards/bulk) and page 1888016056 (DELETE /api/content/v1/pages/1888016056); an earlier aborted run's page 20707722 and cards 1529212597 and 371030348 were confirmed already gone
- Critic stage: none to Domo (read-only GETs and read-only POSTs to adminsummary, search/v1/query and query/v1/execute only); confirmed the draft cleanup read-only
- Final stage: created scratch page 947765872 'domo-toolkit-probe-9-final-page' (POST /api/content/v1/pages)
- Final stage: created scratch card 1586037476 'domo-toolkit-probe-9-final' via POST /api/content/v2/cards/1011747248/saveas onto page 947765872 (source card 1011747248 not modified)
- Final stage: 20 title PUTs on scratch card 1586037476 via PUT /api/content/v1/cards/1586037476/title (description and dynamicDescription combinations, whitespace handling, 51-segment dynamicTitle, title-only with static description, rename while locked as a non-owner admin)
- Final stage: created scratch group 163222655 'domo-toolkit-probe-9-owner-group' (POST /api/content/v2/groups), added then removed the token user as its only member (PUT /api/content/v2/groups/access)
- Final stage: added scratch group 163222655 as owner of scratch card 1586037476 and removed the token user as owner (POST /api/content/v1/cards/owners/add with sendEmail false, POST /api/content/v1/cards/owners/remove)
- Final stage: locked then unlocked scratch card 1586037476 (PUT /api/content/v1/cards/bulk/lock, DELETE /api/content/v1/cards/bulk/lock)
- Final stage cleanup: deleted card 1586037476 (DELETE /api/content/v1/cards/bulk), page 947765872 (DELETE /api/content/v1/pages/947765872), and group 163222655 (DELETE /api/content/v2/groups/163222655, now active:false); confirmed the card no longer resolves, the page returns 404, and an adminsummary search for 'domo-toolkit-probe-9' returns 0 cards
- Final stage: one PUT /api/content/v1/cards/1586037476/title after deletion to observe the deleted-card response (404, no object exists)
- No writes to any pre-existing object, user setting, or instance setting in any stage. No repo files modified; scratch files only under /tmp/open-issue-plans/9f/
