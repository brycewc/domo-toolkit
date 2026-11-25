---
published: false
---

# #8: Bulk Select Delete Cards on Dashboard

Status: **decided**. This is the plan for [#8](https://github.com/brycewc/domo-toolkit/issues/8), written 2026-11-20 against branch `2.0.0`, with every open decision settled by the maintainer on 2026-11-23. Cross-issue decisions (`DX.*`), the shared infrastructure, the landing order across issues, and the pre-existing bugs found while planning live in [open-issues-plan.md](open-issues-plan.md).

API claims in this plan carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

## Summary

**Problem.** Right now, cleaning up a dashboard or App Studio page means taking cards off it one at a time: open the card menu, confirm, repeat. A power user retiring half a page can't pick a set of cards in place and act on them together, and nothing shows which of those cards would end up on no page at all.

**Who benefits.** Content admins and card editors cleaning up dashboards and apps. The request came from a customer, OneMagnify. #9 (Bulk Rename Cards) is built on the same card loader and selectable card list (see Shared infrastructure across issues).

**What ships** (DX.2, D8.1). The issue asks for bulk delete. The maintainer chose remove only: the view takes the selected cards off this page and deletes nothing, and it only lets you select cards that also live somewhere else, so a run never leaves a card on no page. Bulk deletion stays with Domo's Admin > Cards and the toolkit's single-card and page deletes. The feature is called **Remove Cards**.

**Interpretations considered.**

1. _Bulk delete selected cards on the current page._ The literal ask. **Not planned** (DX.2).
2. _Bulk remove selected cards from the page without deleting them._ Domo treats these as separate actions, and "clean up a page" often means remove. **Planned**, restricted to cards that live elsewhere (D8.1).
3. _A general "cards on this page" table that shows datasets and opens cards in tabs in bulk._ This already exists. Get Cards lists the page's cards and has Open All, and Get DataSets lists the page's datasets. Not planned. The only part kept is the dataset name as row detail, because it comes free with the same request and tells apart cards with the same title.
4. _A modal_, as the issue suggests. This project puts work views in the side panel and keeps modals for read-only drill-ins (`BeastModeCardsModal`, `OwnerCardsModal`). So this is a side panel view.

## Scope check

**What Domo's UI already offers** (verified in Domo's frontend bundles and live):

- **Admin > Content > Cards** (`/admin/cards`) can filter by "Dashboards & Apps" (`pageIds` on `POST /api/content/v2/cards/adminsummary`).
  - Its bulk action menu calls `delete` (`DELETE /api/content/v1/cards/bulk`) and `remove_from_pages` (`DELETE /api/content/v1/cards/bulk/pages`). It also offers add to pages, owners, lock, and duplicate.
  - The nav entry shows for `content.card.edit` or `content.admin`. Bulk actions are allowed when `canManageCards || every selected card isCurrentUserOwner` (admin chunk `admin-f0a6ba0eab00a3cb`).
- **The page editor** removes cards in place, one at a time, then saves. The save calls `Page.moveDeleteCards`, which is `DELETE /api/content/v1/cards/bulk/pages?cardIds=:cardIds&destinationPageIds=:destinationPageIds` (chunk `48800-8cba4f7ec4bc66c6`). App Studio's layout save does the same with `contextType: DATA_APP` (chunk `50902-cd55aca14a489500`).

**Remove from Page is in scope, on the maintainer's call.** A user already on the page can remove cards in Domo's editor one at a time, and Admin > Cards can bulk remove, but only after leaving the page, finding it by title in a picker (titles are often duplicated), applying the filter, selecting cards, and picking an action: about eight steps. Neither path says which cards would be left on no page. What this view adds:

- many cards in one action, starting already scoped to the page
- where else each card lives, on its row
- a guarantee that no card ends up on no page: only cards with another location are selectable, and placements are re-checked right before the run
- per-row results when part of a batch fails, since Domo's bulk endpoint is all-or-nothing (verified below)

**Cut:**

- Bulk delete (DX.2). The alert, embed, drill, Card Beast Mode, and workspace lookups that existed only to show what a delete takes with it go with it.
- A standalone card viewer and a dataset viewer: Get Cards and Get DataSets cover them.
- Open Selected: Get Cards' Open All covers opening in bulk. Adding it here would also force a DataList refactor of the Open All confirm.
- Deleting the whole page with its cards: this stays in the existing Delete view (`deletersByType.PAGE`, including "Delete Page and Cards that Only Live Here").

**Overlap in this codebase:**

- `src/components/views/DataList.jsx`: selection mode, `selectAll`, `isSelectable`, `getUnselectableTooltip`, `getItemBadge` (leaf rows only), `banner`, `footer`, `fillHeight`, and virtualization. It renders neither `item.metadata` nor a visible annotation (an `annotation` is an info icon plus hover text, VERIFIED-CODE), so a visible second line on a row needs the shared `renderItemDetail` prop.
- `src/components/views/ManageCardLocksView.jsx` and `ManageCardOwnersView.jsx`: the closest pattern. Each is a page-scoped card list with a footer submit and `showPromiseStatus`.
- `src/services/cards.js`: `getCardsForObject` (stacks with `parts`, plus a v1 fallback on 404). Note that it returns only `page.cards` and drops the `page` object.
- `src/services/pages.js`: `getCardLocations` (kind-keyed `${kind}:${id}` placements, with parent names for views and report pages), `getPagesForCards`, `getOnlyHereCardIds`, `cardIdsOnlyOnPages` (compares by ID only, not by kind), and `fetchCardPlacements` (one request per card, 50 in flight).
- `src/components/views/DeleteObjectView.jsx`: `AlertDialog` plus `HoldToConfirmButton`, with `isOpen` gated on `isActive`.
- `src/components/views/DeleteUnusedBeastModesView.jsx`: chunked bulk call that falls back to per-item calls (around line 221), with a progress counter and `isActive`-gated dialog.
- `src/utils/currentObject.js`: `reloadTabIfViewingObject`.
- `docs/plans/beta-phase-1-2-retries-concurrency.md`: specifies `src/utils/batchWithFallback.js`. It is not built yet. #8 builds it to the amended signature if it starts before 1.2 step 6 (see Shared infrastructure across issues).

## API and platform findings

All live calls went to domo.domo.com with a token whose user has `content.admin`.

The numbering below is kept from the planning probes, which also covered delete. Rows 6 to 9 and 12 (alerts, embeds, workspaces, bulk delete, card Beast Mode search) informed the delete design that DX.2 dropped, and are left out.

| #   | Purpose                                                            | Method and path                                                                     | Tag                                                                                 |
| --- | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| 1   | Cards on a page, App Studio page, or worksheet page, with datasets | `GET /api/content/v3/stacks/{pageId}/cards?parts=datasources`                       | VERIFIED-LIVE, VERIFIED-CODE (probed with `parts=datasources,owners,drillPathURNs`) |
| 2   | Fallback when stacks 404s on a dashboard                           | `GET /api/content/v1/pages/{pageId}/cards?parts=datasources`                        | VERIFIED-LIVE, VERIFIED-CODE (probed with the same three parts)                     |
| 3   | Page owner and lock state when the v1 fallback is used             | `GET /api/content/v1/pages/{pageId}`                                                | VERIFIED-LIVE, VERIFIED-CODE                                                        |
| 4   | Where each card lives, one request per 100 cards                   | `POST /api/content/v2/cards/adminsummary?limit=100&skip={n}`                        | VERIFIED-LIVE                                                                       |
| 5   | Where each card lives, one request per card (fallback)             | `GET /api/content/v1/cards?urns={id}&parts=adminAllPages`                           | VERIFIED-LIVE, VERIFIED-CODE                                                        |
| 10  | Bulk remove from a page                                            | `DELETE /api/content/v1/cards/bulk/pages?cardIds={csv}&destinationPageIds={pageId}` | VERIFIED-LIVE (not in the bundled OpenAPI spec, which has only the PUT)             |
| 11  | Authority names                                                    | dataset `073c76f1-c846-48fd-876c-34d98d89a07b`                                      | VERIFIED-LIVE                                                                       |

**1. Stacks cards.** One call returns everything a row needs.

- **Card keys** with the probed parts: `active, allowTableDrill, badgeUpdated, created, creatorId, datasources, description?, drillPathURNs, id, isCurrentUserOwner, locked, metadata, ownerId, owners, title, type, urn`. The view reads `id`, `title`, `locked`, `datasources`, and `access`, so it asks for `parts=datasources` alone.
- **The `page` object** has `isOwner`, `locked`, and `type` (`page`, `dataappview`).
- **App Studio views** (`type: 'dav'`) also carry a per-card `access` flag. All 7 cards on view `1870561888` had `access: true`. The meaning of `false` is INFERRED.
- **`parts=permissions`** returns 400, so there is no per-card permission mask.

```json
{
  "id": 1609903184,
  "title": "Account Lookup",
  "type": "kpi",
  "locked": false,
  "isCurrentUserOwner": false,
  "drillPathURNs": ["dr:974098998:1609903184"],
  "owners": [{ "id": "1522882878", "type": "USER", "displayName": "Ben Schein" }],
  "datasources": [
    {
      "dataSourceId": "eac44ae6-6463-44ab-ad5a-6294977873ff",
      "dataSourceName": "GOLD | RevOps | Salesforce Opportunities Master"
    }
  ]
}
```

Page `888329385` returned 52 cards in 0.86 s, with `page: { isOwner: true, locked: false, type: 'page' }`.

**2 and 3. Pages where stacks 404s.** On page `106095392`:

- Bare `GET /api/content/v3/stacks/106095392` returns 404.
- The v1 cards route answered with all three parts (7 cards, `drillPathURNs` present). It has no page object.
- `GET /api/content/v1/pages/106095392` returns `isOwner: false, locked: false`.
- The detected context's fallback (`/content/v1/pages/{id}/access`) has only `pageId, ownerId, pageName, owners, pageAccess`, so `metadata.isOwner` is null on such pages.

**Worksheet pages.** A worksheet page has no owner of its own; the worksheet's owners own it. `computeIsOwner` in `src/background.js` only handled `PAGE` and `DATA_APP_VIEW`, so `metadata.isOwner` was never set for `WORKSHEET_VIEW` (VERIFIED-CODE, now fixed by reading the parent worksheet's `owners`). This is a shipped bug beyond this feature: `DeleteObject.jsx`'s `isDeleteForbidden` gates `WORKSHEET_VIEW` on `!isOwner && !content.admin`, so a worksheet page's owner without `content.admin` cannot delete it today (VERIFIED-CODE).

**4. Card admin summary.**

- **Request:** `{ "pageIds": [pageId], "includePageTitleClause": true }`. A `cardIds` field in the body is ignored and returns unrelated cards, so it must not be used.
- **Response:** `{ cardAdminSummaries: [{ id, title, type, locked, active, owners[], pageHierarchy: [{ pageId, title, parentPageId?, parentPageTitle? }] }], totalCardCount }`.
- **Speed:** page `888329385` (52 cards) took 0.47 to 0.55 s.
- **Report pages:** the filter returns `totalCardCount: 0` for report page `1535023132`.
- **App Studio views:** the filter works on view `1355224510`, but returned 0 for a freshly created scratch view whose card was placed through the bulk PUT. It is not reliable for views.
- **Classic pages:** it worked on the scratch classic page (2 of 2 cards).
- **No page kind:** `pageHierarchy` entries say nothing about the kind of page and carry no app or report ID. Page, view, and report page IDs are separate ID spaces (see the `getCardLocations` comment), so a fast-path placement can be named but not linked or typed.
- **Rate limiting:** it returned **429** twice in a row during this run (other agents were hitting the instance at the same time), then 200 ten seconds later.
- **Permissions:** Domo only shows Admin > Cards to `content.admin` or `content.card.edit`, so users without either likely get a 403 (INFERRED). With DX.3's button gate, every user of this view holds one of the two, so the fast path is the normal case.

**5. Per-card placements.** Same answer as #4 for page `888329385` (13 cards only here, 8 also on other real pages, 31 elsewhere only through system pages). It took **32 s at the code's 50 in flight**, against 0.47 s for #4. Report placements come back under `adminAllReportPages` (card `407736811`).

**System placements.** Both sources list `-100000` (Overview), `-100002` (Shared), and `-100003` (Favorites). On page `888329385` there were 35 cards on Shared, 4 on Favorites, and 4 on Overview. Card `889676853` lists `[-100002 Shared, 386665203 Data Curiosity Team]`.

The card access list (`GET /api/content/v1/share/accesslist/badge/{id}`) looked the same for `889676853` and for a page-mate that is not on Shared: 6 users, 5 with `invitorUserId`, 1 group. So a Shared placement cannot be tied to particular people from the client. The UI names it by its own title ("Shared") rather than reading meaning into it. Under D8.2 a system placement counts as "somewhere else", so a card on this page and on Shared is removable, and afterwards it lives on Shared only.

**10. Bulk remove.** All verified on scratch objects.

- **Layout dashboard** (previous run):
  - Removing cards A and B returned 200. A then lived on no page and still existed; B stayed on page B.
  - The layout's `content` dropped both cards, but `standard.template` **kept their slots**. Domo Admin's own remove does the same, since it is the same call.
- **Classic page** (this run, page `1365898974`, no `pageLayoutV4`): removing card `1200764577` returned 200. The card left both `cards` and `sizes`, nothing else changed, and it still existed on no page.
- **App Studio view** (this run, view `503426363` of scratch app `917641970`):
  - The card had been added with `PUT bulk/pages`, giving layout `content: [null, 1917125635]` and 3 template entries.
  - The remove returned 200. Afterwards `cards: []`, `content: []`, and both templates were `[]`, so no leftover slot.
  - The card still existed on its other page.
  - This upgrades the draft's INFERRED tag to VERIFIED-LIVE. The earlier run's view probe (view `1317878821`) was ambiguous, because its snapshot could not be placed in the write order.
- **Edge cases:** removing a card that is not on the page returned 200. A batch with one nonexistent card ID returned **404 for the whole batch**.

**11. Authorities** (from the dataset):

- `content.admin`: "View, create, edit, share and delete any Card, Page, App..."
- `content.card.edit`: "Create, edit and delete Cards, Drill views, and Beast Modes to which you have access." Depends on `ui.admin`.
- `content.page.edit`: pages, styles, templates, and layouts.
- `content.dataapp.edit`: depends on `content.page.edit`.
- `content.worksheet.edit`: edit worksheets.

Domo's admin UI computes `canManageCards = content.card.edit || content.admin` and `canManagePages = content.page.edit || content.admin`, and offers `remove_from_pages` to `canManageCards` (or to a selection the user owns entirely). Whether the server also requires page edit rights for a card editor is INFERRED, so the view treats the server as authoritative and checks it in testing.

**Not used:**

- `/kpis/removefrompage` (`Kpis.removeFromPage`): the legacy one-card route.
- `POST /kpis/{id}/remove?pageid=` from the spec: also legacy.
- The card access list: it doesn't say who gets a card through Shared.

## Design

**Where it lives.** A new side panel view, `RemoveCardsView`, launched by a new `RemoveCards` action button through `useLaunchView` with `type: 'removeCards'`. It works from the popup too, because `launchView` hands off to the side panel. It is its own view, separate from Rename Cards, on the shared list (DX.1).

**Enabled for:** `PAGE` with ID ≥ 0 (not system pages), `DATA_APP_VIEW`, and `WORKSHEET_VIEW` (DX.2). `REPORT_BUILDER_PAGE` is out: it was only proposed for Delete, and remove there is unverified. The gate in `getAvailableActions()` is `content.admin || content.card.edit` (DX.3), matching Rename Cards. It sits in the existing page card block next to `manageCardLocks`.

**Shared pieces adopted from #9** (full contract in Shared infrastructure across issues). If #8 lands first, it builds them to that contract unchanged.

1. **`getCardsForContext`** in `src/services/cards.js`, called as `getCardsForContext({ context, parts: 'datasources', tabId })` with no `hydrateParts`. Stacks (or its v1 fallback) already carries every field a row needs, including the per-card `access` flag that a v1 re-read would not return. Cards come back with string IDs and a `loadIndex`.
2. **`CardBatchList`** (`src/components/views/CardBatchList.jsx`). RemoveCardsView passes:
   - `renderDetail(card)` for the row's detail line (dataset name, then where else the card lives)
   - `chipFor(card)` returning "Only on This Page" for cards that can't be removed, and the skip reasons after a run
   - `statusLabels` of `Removing...` / `Removed` / `Failed`
   - `rowStatus`, `isSelectable`, `unselectableReason`, `isRunning`, `banner`, and `footer`

   Each card is a leaf row: badges render only on leaf rows, and Open All would otherwise walk child rows. Locked cards show the lock badge while idle.

3. **DataList `renderItemDetail`**, through `CardBatchList`. This is the only DataList change. #8's earlier `renderItemTrailing` hand-off is dropped.
4. **`cardUrlOnPage`** in `src/utils/cardHelpers.js`, for the row link to the card on this page.
5. **`HOLD_DURATION_BULK`** (3000) from `src/utils/constants.js`.

**No shared hook.** The earlier `useCardBatch` is dropped, because #9's per-card pool and preview-driven selection do not fit a `runBatch` built around bulk chunks (see Shared infrastructure across issues). RemoveCardsView owns its run state directly:

```js
selectedCardIds: Set<string>
placements: { status: 'loading' | 'loaded' | 'error', error?, locationIdsByCardId, locations, progress?: { done, total } }
pageEdit: { status: 'loading' | 'loaded' | 'error', isOwner, locked }
statusByCardId: Map<cardId, { error?: string, reason?: string, status: 'queued'|'running'|'done'|'failed'|'skipped' }>
progress: null | { done, total }
isRunning: boolean
```

**Built here** (unless already landed):

1. **`src/utils/batchWithFallback.js`**, to the amended beta 1.2 section 6 signature, if 1.2 step 6 has not landed it. #6 no longer builds it (D6.1):
   ```js
   batchWithFallback(items, { canFallBack, chunkSize, onSend, onSettled, profile, sendBatch, sendOne, signal });
   // -> [{ error, item, ok, notSent?, partial? }] in input order
   ```
   - Chunks run serially. A chunk that fails with a definite 4xx other than 429 is retried one item at a time. A 429 or 5xx chunk is not split: its items are marked failed with the error, and the run continues with the next chunk.
   - `onSend(items, { phase })` fires just before each request, and the view marks those rows `running`.
   - `onSettled(results, { doneCount, phase, total })` fires once per request whose results are final, and the view marks those rows `done` or `failed` and sets `progress`. It does not fire for a chunk that falls back.
   - `signal` comes from an AbortController the view aborts on unmount. Unsent chunks are never sent and come back `notSent`.
   - The commit that builds it also records the amendments in `docs/plans/beta-phase-1-2-retries-concurrency.md` (signature, the Remove from Page caller, and `DELETE content/v1/cards/bulk/pages` as `RETRY_SAFE`).

**New and changed services:**

- **`cards.js` `removeCardsFromPage({ cardIds, pageId, tabId })`.** Calls `DELETE /api/content/v1/cards/bulk/pages?cardIds={csv}&destinationPageIds={pageId}` (the CSV form `Page.moveDeleteCards` uses) and throws with `error.status`, like `deleteCards`. It goes before `renameCard` (#9) and `setCardsLocked` in export order.
- **`pages.js` `getPageEditState({ details, pageId, typeId, tabId })`.** Returns `{ isOwner, locked }`. It reads `details.page` when present, otherwise falls back to `GET /api/content/v1/pages/{pageId}`.
- **`pages.js` `getCardLocationsOnPage({ cardIds, onProgress, pageId, pageTypeId, tabId })`.** Returns the same shape as `getCardLocations` (`{ locationIdsByCardId, locations }`), with this page left out and each location carrying `system: Number(id) < 0`.
  - **Fast path:** page through `adminsummary` filtered by `pageIds: [pageId]`, at 100 per page using `totalCardCount`. Use it only when it returns every requested card on the page (it missed cards on a fresh App Studio view). Its locations have `kind: null` (unknown), or `'system'` for negative IDs. This page is left out by ID, since the source has no kind.
  - **Retry:** on a 429, wait 2 s, or `Retry-After` when present, and try once more. The retry runs inside the injected function, where the header is readable. The thrown error also sets `e.retryAfter` for the shared envelope field.
  - **Fallback:** call `getCardLocations` in chunks of 50 card IDs from the side panel, calling `onProgress(done, total)` after each chunk. This page is left out by its exact key (`${LOCATION_KIND_BY_TYPE[pageTypeId]}:${pageId}`).
  - The same function serves the pre-run re-check, called with only the selected card IDs.
- **`background.js` `computeIsOwner`.** Done: `WORKSHEET_VIEW` ownership now comes from the parent worksheet's `owners`, since worksheet pages have no owner of their own. The duplicated `TEMPLATE` branch is gone.

**Data flow** (all Domo calls go through `executeInPage` on the Domo tab, from the side panel):

1. On mount, `getSidepanelData(instance)` checks `type === 'removeCards'` and builds the `DomoContext`.
2. `getCardsForContext` loads the cards, and `CardBatchList` renders as soon as they arrive. `getPageEditState` runs alongside.
3. `getCardLocationsOnPage` runs over every card ID. Rows are unselectable until it settles, and each row's detail line fills in when it does. If it fails, no row becomes selectable and the banner offers Retry, since the view cannot tell which cards would be left on no page.
4. On confirm, the view re-checks placements for the selected cards with `getCardLocationsOnPage`. A card that now lives only on this page is not sent: its row gets `skipped` with the chip "Now Only on This Page". If the re-check fails, nothing is sent and the dialog shows the error.
5. The view calls `batchWithFallback` over the remaining card IDs, with `chunkSize: 50`, `profile: RETRY_SAFE`, and `sendBatch` / `sendOne` closing over `removeCardsFromPage`. The `onSend` and `onSettled` callbacks move rows through `running`, `done`, and `failed`.
6. Afterwards:
   - The view reloads through `getCardsForContext`, then re-runs the placements lookup for what is left. A failed card that is missing from the refreshed list counts as done, whatever error it got, since it is no longer on the page.
   - Succeeded rows drop out. Failed rows stay selected with their X badge.
   - `reloadTabIfViewingObject({ ids: [pageId] })` reloads the Domo tab when it is on this page. Nothing is deleted, so no tab needs redirecting off a card.
   - The view closes when no cards are left on the page, guarded by `mountedRef` until 1.6's view-scoped close lands. Otherwise it stays open on the cards that remain.

**Selection rules.** A row is selectable only when all of these hold:

- `access !== false` ("You don't have access to this card.").
- Placements have loaded, and the card has at least one other location (D8.1). Otherwise the row is disabled with the chip "Only on This Page" and the tooltip "This card isn't on any other page, so removing it would leave it on no page. Delete it or move it in Domo instead." While placements load, the tooltip reads "Checking where this card lives...".
- The page allows it: on a locked page (`pageEdit.locked`), only `content.admin` or `isOwner` qualify, matching Domo's page lock. Otherwise every row is disabled with "This page is locked. Only its owners and content admins can change its cards." On an unlocked page the DX.3 button gate is the whole check, following Admin > Cards, which offers `remove_from_pages` to `canManageCards`. The server stays authoritative, and anything it rejects shows as a per-row failure.

A card's own lock does not block removal: the lock governs edits to the card, not where it is placed (INFERRED, checked in the permission test). `canManageCard` is not used here.

Nothing is selected by default. **Select All** selects every selectable row; there are no quick selects, since "Also on Other Pages" is now the same set.

**What "somewhere else" means** (D8.2). A card's other locations are real pages, App Studio and worksheet pages, report pages, and the system pages Shared, Favorites, and Overview. System pages count, matching `cardIdsOnlyOnPages` and the page delete's "Cards that Only Live Here", which stay unchanged. Workspaces do not count, since they are not pages, and they are not looked up.

**Concurrency.** Write chunks run serially, and so does the per-card fallback. Placement reads keep their existing pool: 50 in flight inside each `getCardLocations` chunk.

**Run safety.** While a run is active, `CardBatchList`'s `isRunning` makes the selection read-only and drops Reload and Refresh from the header. Closing the view or the panel cannot be blocked yet: in-flight chunks finish, and the abort keeps the rest from being sent. When `docs/plans/beta-phase-1-6-run-lock.md` lands, the view calls `useRunLock(isRunning, 'Remove Cards')`, and this commit adds `RemoveCardsView.jsx` / `isRunning` to that plan's "Which views lock" table. Remove Cards does not journal (DX.4); `onSend` and `onSettled` are the hook points if that is revisited after 1.3 ships.

**Feature switches.** None needed. `WORKSHEET_VIEW` is already gated by `app-studio-worksheets`.

## UX

**Entry point.** In the expandable action section, after Manage Card Locks and Manage Card Owners:

- Button: **Remove Cards**, with the existing `row-remove.svg` icon.
- Tooltip: "Remove the cards you pick from this page. Each one stays on its other pages"

**Flow:**

1. Click **Remove Cards**. The side panel opens "Remove Cards from {page name}" with a spinner ("Loading cards...").
2. The list renders with nothing selected and every row disabled while placements load. The banner shows "Checking where these cards live..." with a spinner, or "Checking where these cards live (100 / 240)..." on the per-card path.
3. Rows that live somewhere else become selectable, and each detail line names where. Cards found only on this page stay disabled with an "Only on This Page" chip.
4. Select cards by hand or with Select All.
5. Press the footer button. A confirm dialog names where the cards will remain.
6. Hold **Hold to Remove** for 3 seconds (D8.3). The view re-checks the selected cards' placements, then sends.
7. Rows show a spinner per chunk, then a check or an X. The toast resolves. Failed rows stay selected with the reason on hover, and the Domo tab reloads if it is on this page.

**Mockup: list**

```
+-------------------------------------------------------+
| [x-row] Remove Cards from Sales Overview    [open][x] |
|         24 cards, 17 also live elsewhere              |
|-------------------------------------------------------|
|  [-] Select all (3 / 17)                              |
|-------------------------------------------------------|
|  [x] Pipeline by Region                          [L]  |
|      Opportunities. Also on Q3 Review and 1 more      |
|  [ ] Win Rate                                         |
|      Opportunities. Also on Shared                    |
|  [x] Bookings QTD                                     |
|      Bookings. Also on Finance (Board Pack app)       |
|  [/] Region Map              [Only on This Page]      |
|      Territories                                      |
|  ...                                                  |
|-------------------------------------------------------|
|  [       Remove 3 Cards from Page       ]             |
+-------------------------------------------------------+
```

**Mockup: confirm**

```
+--------------------------------------------------+
| Remove 3 Cards from Sales Overview?              |
|                                                  |
| Nothing is deleted. Each card stays on its other |
| pages: Q3 Review, Finance, and 2 more.           |
|                                                  |
| 1 of them will remain only on Shared.            |
|                                                  |
|            [Cancel]  [ Hold to Remove ]          |
+--------------------------------------------------+
```

**Mockup: during and after a run**

```
|  [x] (spin) Pipeline by Region                         |
|  [x] (ok)   Bookings QTD                               |
|  [x] (X)    Win Rate  <- "Failed: You don't have permission to remove this card from this page." |
```

**States and copy:**

| State               | What shows                                                                                                                                                                                                          |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Loading             | Spinner card, "Loading cards..." (after 200 ms, like Get Cards)                                                                                                                                                     |
| Empty               | Status "No cards found on this page.", then back to default                                                                                                                                                         |
| Load failure        | Warning Alert with the error text and a **Retry** button (GetCardsView pattern)                                                                                                                                     |
| Checking placements | Every row disabled, tooltip "Checking where this card lives..."; banner spinner with a counter on the per-card path                                                                                                 |
| Placements failed   | Banner: "Couldn't check where these cards live, so none can be removed yet." with **Retry**. Every row stays disabled                                                                                               |
| Nothing removable   | Subtext "None of these cards live anywhere else, so removing any would leave it on no page." Footer disabled                                                                                                        |
| Only on this page   | Disabled checkbox, chip "Only on This Page", tooltip "This card isn't on any other page, so removing it would leave it on no page. Delete it or move it in Domo instead."                                           |
| No access row       | Disabled checkbox, tooltip "You don't have access to this card."                                                                                                                                                    |
| Locked page         | Every row disabled, banner "This page is locked. Only its owners and content admins can change its cards."                                                                                                          |
| Nothing selected    | Footer button disabled                                                                                                                                                                                              |
| Skipped at run time | Row chip "Now Only on This Page", tooltip "This card's other placements were removed after the list loaded, so it was left here." Counts toward neither removed nor failed                                          |
| Loading toast       | "Removing **N** cards from **{page}**..."                                                                                                                                                                           |
| Success             | "Removed **N** cards from **{page}**." (singular "card"). Appends " **K** skipped." when any were skipped                                                                                                           |
| Partial failure     | "Removed **12** cards, **2** failed." The view stays open on the failed rows                                                                                                                                        |
| Full failure        | Danger toast "No cards were removed. {reason}"                                                                                                                                                                      |
| Per-row errors      | 403: "You don't have permission to remove this card from this page." 404 when the card is still listed: "Domo couldn't find this card." 429 or 5xx: "Domo was busy, try again." Other: "Failed with HTTP {status}." |

**Other copy:**

- **Footer:** `Remove {N} Card(s) from Page`, which opens the confirm.
- **Detail line** (through `renderItemDetail`): the dataset name, or "N datasets", then "Also on {name} and {n} more". A page inside an App Studio app or worksheet adds the parent in parentheses, as `getCardLocations` already names it. System pages are named by their own title ("Also on Shared").
- **Confirm:**
  - Title: "Remove **N** Cards from **{page}**?"
  - Body: "Nothing is deleted. Each card stays on its other pages: {first two names}, and {n} more."
  - When K > 0 cards have only system placements left, add: "**K** of them will remain only on {Shared, Favorites, or Overview}."
  - Button: `HoldToConfirmButton` **Hold to Remove**, `duration={HOLD_DURATION_BULK}`.

## Implementation plan

0. **Bug fix, its own commit.** Done: `computeIsOwner` derives `WORKSHEET_VIEW` ownership from the parent worksheet's `owners`, the duplicated `TEMPLATE` branch is removed, and the Bug Fixes note is in.
1. **Adopt the shared card pieces.** Import `getCardsForContext` (`src/services/cards.js`), `CardBatchList` (`src/components/views/CardBatchList.jsx`), `cardUrlOnPage` (`src/utils/cardHelpers.js`), and `HOLD_DURATION_BULK` (`src/utils/constants.js`). DataList's `renderItemDetail` comes through `CardBatchList`. If #9 has not landed, build them first, exactly to the contract in Shared infrastructure across issues.
2. **Services.**
   - In `src/services/cards.js`, add `removeCardsFromPage` (alphabetical position).
   - In `src/services/pages.js`, add `getCardLocationsOnPage` and `getPageEditState`. Mark `system` on the location entries returned by `getCardLocations`.
3. **Batch helper.** Import `src/utils/batchWithFallback.js` if 1.2 step 6 has landed it. Otherwise add it to the amended signature above in its own commit, and record the amendments in `docs/plans/beta-phase-1-2-retries-concurrency.md`.
4. **View.** Add `src/components/views/RemoveCardsView.jsx`:
   - `getSidepanelData` with a `'removeCards'` check, `useViewReady`, and `mountedRef`
   - loading through `getCardsForContext({ context, parts: 'datasources', tabId })`, with `getPageEditState` alongside
   - the placements lookup through `getCardLocationsOnPage`, with its progress counter and Retry, feeding a memoized `renderDetail`
   - the run state above (`selectedCardIds`, `placements`, `pageEdit`, `statusByCardId`, `progress`, `isRunning`) and an AbortController aborted on unmount
   - `CardBatchList` with `isSelectable` (access, another location, and the locked-page rule), `unselectableReason`, `chipFor`, `statusLabels`, `rowStatus`, and `isRunning`
   - the footer button
   - an `AlertDialog` with `isOpen={pending && isActive}`, whose confirm is a `HoldToConfirmButton` with `duration={HOLD_DURATION_BULK}`
   - on confirm, the placement re-check for the selected cards, then the run through `batchWithFallback` with `onSend` / `onSettled`, then the reload-and-reconcile step described in Data flow, step 6
   - toasts through `useStatusBar().showPromiseStatus`. The promise rejects only when every sent card failed.
   - the tab reload described in Data flow, step 6
5. **Button and wiring.**
   - Add `src/components/buttons/RemoveCards.jsx` (the ManageCardLocks pattern, `useLaunchView`, `@icons/row-remove.svg?react`).
   - Add the `removeCards` key in `src/utils/availableActions.js` inside the page card block, for `PAGE` (ID ≥ 0), `DATA_APP_VIEW`, and `WORKSHEET_VIEW`, gated on `content.admin || content.card.edit`.
   - Render it in `src/components/ActionButtons.jsx` after `ManageCardOwners`.
   - Add a `slot.type === 'removeCards'` case to `src/sidepanel/App.jsx`, passing `instance`, `isActive`, `liveContext`, `onBackToDefault`, and `onStatusUpdate`.
6. **Docs.**
   - Add a **Remove Cards** line to `docs/README.md` next to Lock Cards.
   - Add a short mention to `store-listing/STORE_LISTING.txt` and check it stays under 10,000 characters (`.claude/rules/store-listing.md`).
   - Add `RemoveCardsView.jsx` / `isRunning` to the "Which views lock" table in `docs/plans/beta-phase-1-6-run-lock.md`.
   - Add the release note bullet below to `docs/RELEASE_NOTES.md` under New Features and Improvements.
7. **Lint.** Run `npx eslint --no-warn-ignored` on every touched file.

## Edge cases and risks

- **System placements are common, and they count** (D8.2). 31 of 52 cards on one real page were elsewhere only through Shared, Favorites, or Overview, so under this rule they are all removable, and afterwards they live only there. Detail lines and the confirm always name system placements.
- **Placements gate everything.** Rows can't be selected until the lookup settles. Without `adminsummary` (some views, users it refuses, or a repeated 429), the per-card path took 32 s for 52 cards. The list is readable meanwhile and the banner shows a counter.
- **Placements going stale.** Someone could remove a card's other placement between load and run, which would leave it on no page. The pre-run re-check skips such cards; a window of a second or two between the re-check and the write remains, which is acceptable.
- **Fast-path placements have no kind**, so they are named but not linked. In theory a different-kind page could share this page's numeric ID and be dropped from the list, which could only make a card look like it lives on fewer pages, never more. The per-card path is exact.
- **Layout template leftovers on layout dashboards.** Bulk remove cleans `content` but leaves `template` slots there, the same as Domo Admin. Classic pages and App Studio views came out clean. This needs a visual check on a layout dashboard. If it leaves gaps, a follow-up could tidy the template through the layout writelock and `PUT /api/content/v4/pages/layouts/{id}`. That is out of scope unless the check fails.
- **Concurrent edit mode.** Someone saving a stale layout in Domo's editor could put removed cards back. No warning is shown, because there is no evidence this happens.
- **All-or-nothing endpoint.** One bad ID fails a whole chunk (verified). The per-card fallback isolates it. Cards that vanished from the page count as done after the refresh.
- **Locked cards and locked pages.** A card's lock is assumed not to block removal (INFERRED). A locked page limits the view to owners and content admins up front. The server may still refuse others, which shows as a row error.
- **Server rules for card editors.** Admin > Cards offers bulk remove to `content.card.edit`, but whether the server also wants page edit rights is unverified, so 403s are reported per row with page-specific copy.
- **Large pages.** Chunks of 50 keep the `cardIds` query string short, and `adminsummary` pages at 100.
- **Undo.** There is none. A removed card can be put back with Domo's Add Cards, and every removed card still exists elsewhere.
- **Panel closed mid-run.** Until 1.6 lands this cannot be blocked. In-flight chunks finish, the abort stops the rest, and reopening the view shows the current cards.

## Testing and verification

- **Baseline.** `yarn dev` is usually already running (`lsof -nP -iTCP:31573 -sTCP:LISTEN`). Watch the HMR output and run ESLint on each touched file. There is no `/dev-*` route for the side panel, so use the CRXJS dev extension loaded from `dist/`.
- **Visual.** Run `node scripts/ext-shot.js sidepanel --live` with a Domo dashboard open and Remove Cards showing. Check the loading state, detail lines, the Only on This Page rows, footer, the confirm and its hold, and the run badges, in light and dark.
- **Read-only live checks:**
  - **Page `888329385`:** fast-path placements; 13 cards show Only on This Page, and the 31 elsewhere only through system pages are selectable with the system page named.
  - **Page `106095392`:** the stacks 404 fallback builds rows through `getCardsForContext`, and `getPageEditState` reads `isOwner: false`.
  - **A worksheet page:** the button gate, and `isOwner` after the `computeIsOwner` fix.
  - **A Report Builder page:** no Remove Cards button.
- **Write checks, on scratch objects only:**
  1. Create a layout dashboard, a classic page, and a scratch App Studio app. Create four cards on a dataset you own. Put one card on two of the pages, and leave the others on one page each.
  2. The single-page cards show Only on This Page and can't be selected. Select All picks only the shared one.
  3. Remove the shared card on each surface. It leaves the page and stays on its other page, the tab reloads, and a layout dashboard shows no blank gap (this is the template check).
  4. Load the view, then remove the shared card's other placement in another tab, then hold Remove. The re-check skips it with Now Only on This Page, and nothing is sent for it.
  5. Remove a selected card from the page in another tab first. The chunk returns 200 (removing a card not on the page is a no-op) and the refresh counts it as done.
  6. Hold and release early: nothing is sent.
  7. Delete everything you created and confirm each object reads back as 404 or `[]`.
- **Permissions.** On a non-production instance, sign in as a `content.card.edit` user without `content.admin` or `content.page.edit`. Check the button gate, whether `adminsummary` answers (fast path or fallback), what the server does when they remove a card from an unlocked page they don't own, whether a locked card they don't own can be removed, and that a locked page they don't own disables every row.
- **Regression.** Hold durations elsewhere are unchanged after the constants move. Rename Cards still works if #9 landed first (shared `CardBatchList` and `getCardsForContext` unchanged by this issue).

## Design decisions made

- **Remove only, no delete** (DX.2, D8.1). Bulk deletion stays with Domo's Admin > Cards and the toolkit's single-card and page deletes. Everything that existed only to describe a delete's reach (alerts, embeds, drills, Card Beast Modes, workspaces, the mode toggle, the hold tiers) is gone.
- **Only cards with another location are selectable**, and placements are re-checked before the run (D8.1). That is how "never leave a card on no page" holds even against edits made after loading.
- **System pages count as another location** (D8.2), matching `cardIdsOnlyOnPages`, so the toolkit has one meaning of "only lives here".
- **Always a 3 s hold** (D8.3), shared with Rename Cards as `HOLD_DURATION_BULK`.
- **Button gate `content.admin || content.card.edit`** (DX.3), the group Admin > Cards offers bulk remove to. Locked pages narrow it to owners and content admins; a card's own lock does not.
- **Side panel view, not a modal.** Every action view lives there. The `*Modal.jsx` files are read-only drill-ins.
- **Use `DELETE /api/content/v1/cards/bulk/pages`.** It is Domo's own `Page.moveDeleteCards` and Admin `remove_from_pages`, and it was verified on layout, classic, and App Studio pages.
- **No child rows. Placements live in the detail line.** DataList renders badges only on leaf rows, and Open All walks child rows. Fast-path placements can't be linked anyway, because they have no kind.
- **The detail line uses the shared `renderItemDetail` prop.** DataList renders neither `item.metadata` nor a visible annotation, and #9's diff needs the same slot, so DataList gains one prop instead of two.
- **Cut Open Selected and the per-card viewer.** Get Cards' Open All and Get DataSets already cover them.
- **No shared hook. Run state and placements live in RemoveCardsView.** #9's executor is a per-card pool with a pre-run re-read, so a hook built around bulk chunks would not fit it. The shared loader and list carry the real reuse.
- **Load through `getCardsForContext` with stacks `parts=datasources` and no hydrate.** Stacks returns every row field, and a v1 re-read would drop the per-card `access` flag.
- **Placements: `adminsummary` first, per-card fallback, same shape as `getCardLocations`.** 0.47 s against 32 s at the code's real concurrency, with identical results on `888329385`. The fallback is required: it missed a fresh view, and it can 429.
- **After a run, a card missing from the refreshed list counts as done.** Removing a card that is no longer on the page returns 200 (verified), and the refresh is the ground truth either way.
- **Nothing selected by default.** A remove changes a page other people see, unlike Lock, which selects all.
- **Chunks of 50, run serially, with per-card fallback only on a 4xx other than 429.** The endpoint is all-or-nothing (verified). This follows phase 1.2's rule about not splitting under throttling.
- **Row progress through `batchWithFallback`'s `onSend` and `onSettled`, not an `onProgress` callback.** A chunk needs a "sending" signal to show its spinner, and the same two hooks serve #6's progress count and journal.
- **`access: false` rows can't be selected.** Stacks marks them per card on App Studio views. Better to block them up front than let them fail per row.
- **Reload the tab when it is on this page, no redirect.** Nothing is deleted, so there is no dead card to send the tab away from, and `cardHostUrlForTab` is no longer needed.
- **No Report Builder pages** (DX.2). They were proposed for Delete only, and remove on them is unverified.
- **Icon `row-remove.svg`.** It reads as removing a row, and the page's Delete button keeps the trash icon.
- **Dropped the "edit mode anywhere" warning.** The race it warned about is only inferred, and the warning would add noise to every confirm.
- **The `computeIsOwner` fix ships on its own.** It fixed a shipped Delete gate on worksheet pages, separate from this feature, and is done.

## Decisions

IDs are `D8.<n>`. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### D8.1. Should Remove from Page ship in #8?

**Decision:** Option 3, and with DX.2 it is the only action #8 ships. A card is selectable only when it also lives somewhere other than this page, so a run never leaves a card on no page. There is no Delete mode, no mode toggle, and none of the delete-only lookups (alerts, embeds, drills, workspaces).

1. Yes, both Delete and Remove from Page in one view
2. Delete only now, Remove later if asked for
3. Remove only for cards that also live on another page (never leaving a card on no page)

**Planning recommendation:** Ship both, as planned, if you see the batch remove plus the 'left on no page' warning as worth it. Otherwise Delete only. Domo's page editor already removes cards in place one at a time, so Remove is the weaker half of the scope case.

**Why it matters:** Remove adds removeCardsFromPage, getPageEditState, the mode toggle with selection pruning, its own quick select, a second confirm with its own copy, and the page-permission checks. Dropping it removes roughly a third of the view. The shared pieces (getCardsForContext, CardBatchList, batchWithFallback) are unaffected either way.

### D8.2. In Delete mode, do system pages (Shared, Favorites, Overview) count as 'living elsewhere' for Only Live Here?

**Decision:** Option 1, applied to Remove's eligibility rule. Shared, Favorites, and Overview count as other locations, matching `cardIdsOnlyOnPages`, which stays unchanged. A card on this page and on Shared is therefore removable; its detail line and the confirm name the system placement so the user sees where it will remain.

1. Count all of them, as the page delete's 'Cards that Only Live Here' does today
2. Count Shared and Favorites (other people lose the card) but not Overview
3. Count none of them

**Planning recommendation:** Count all of them for now, so 'only lives here' means the same thing across the extension, and name each system placement in the row detail line and confirm so the user sees why a card was left out. If you want a different rule, change cardIdsOnlyOnPages in pages.js at the same time.

**Why it matters:** On a real 52-card page this flips 31 cards in or out of the quick select. If the answer is not 'all', the shared page delete logic should change too, or the two features will disagree about the same card.

### D8.3. How strong should the confirmations be?

**Decision:** No delete, so only Remove needs a confirmation, and it is always a 3 second hold (`HOLD_DURATION_BULK`), whatever the selection. The confirm no longer waits on alert or embed lookups, only on the placements it already needs.

1. Match single card delete exactly: 5 s hold only when a selected card has embeds, otherwise a click
2. Always hold for bulk Delete (5 s when embeds exist or a lookup failed, 2.5 s otherwise); Remove is a click unless it leaves cards on no page (2.5 s)
3. Always a 5 s hold for Delete and for Remove

**Planning recommendation:** Always hold for bulk Delete with the two tiers (HOLD_DURATION_FULL and HOLD_DURATION_SHORT), and Remove a click unless it leaves cards on no page. A bulk delete has no undo and multiplies the reach of one press. The single-card rule (hold only for embeds) was set for one card at a time.

**Why it matters:** It decides the holdDuration function in DeleteCardsView, and whether the dialog's confirm must wait on the embeds lookup (it always waits on placements for the copy either way). Rename Cards asks its own confirmation question, since a reversible rename may reasonably get a lighter answer.

## Release notes draft

- Pages, App Studio pages, and worksheet pages have a new Remove Cards button that removes the cards you select from the page in bulk, as long as each one also lives somewhere else. ([#8](https://github.com/brycewc/domo-toolkit/issues/8))

## Appendix: writes made on domo.domo.com during planning

Every write went to a scratch object the agent created for the probe (named `domo-toolkit-probe-8-*`), and every scratch object was deleted and confirmed gone.

- Draft stage: POST /api/content/v1/pages created scratch page 1520547078 "domo-toolkit-probe-8-remove-page-a" (deleted)
- Draft stage: POST /api/content/v1/pages created scratch page 1932886529 "domo-toolkit-probe-8-remove-page-b" (deleted)
- Draft stage: PUT /api/content/v3/cards/kpi?pageId=1520547078 x3 created scratch cards 1800735888, 1670426394, 937508627 titled domo-toolkit-probe-8-card-a/b/c on dataset ea66147a-1fac-4891-befd-b16f81d7d06c (owned by the token user; dataset not modified) (deleted)
- Draft stage: POST /api/content/v4/pages/1520547078/layouts/convert/flowToLayout converted the scratch page to a layout, producing layout 2071060558 (first attempt with a JSON content type returned 400; deleted with the page)
- Draft stage: PUT /api/content/v1/cards/bulk/pages added scratch card 1670426394 to scratch page 1932886529
- Draft stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1800735888,1670426394&destinationPageIds=1520547078 -> 200 (remove probe)
- Draft stage: DELETE /api/content/v1/cards/bulk?cardIds=1800735888,1 -> 404, nothing deleted (all-or-nothing probe)
- Draft stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1800735888,1&destinationPageIds=1520547078 -> 404 (all-or-nothing probe)
- Draft stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1800735888&destinationPageIds=1520547078 -> 200 (idempotency probe)
- Draft stage: DELETE /api/content/v1/cards/bulk?cardIds=1800735888,1670426394,937508627 -> 200 (cleanup; cards confirmed gone)
- Draft stage: DELETE /api/content/v1/pages/1520547078 and /api/content/v1/pages/1932886529 -> 200 (cleanup; both 404 afterwards)
- Draft stage: confirmed by read-only GETs that objects from an earlier run (pages 934422488 and 2029455980, cards 1303788019 and 1403450342, app 642264579, view 1317878821) no longer exist
- Critique stage: none (read-only GETs and read-only POST searches only)
- Final stage: POST /api/content/v1/pages created scratch classic page 1365898974 "domo-toolkit-probe-8-classic-page" (deleted; GET returns 404)
- Final stage: PUT /api/content/v3/cards/kpi?pageId=1365898974 x3 created scratch cards 1200764577, 1331123134, 1917125635 titled domo-toolkit-probe-8-card-x/y/z on dataset ea66147a-1fac-4891-befd-b16f81d7d06c (dataset not modified) (all deleted; each reads back as [])
- Final stage: POST /api/content/v1/dataapps created scratch app 917641970 "domo-toolkit-probe-8-app" with landing view 503426363 (deleted; app and view both 404 afterwards)
- Final stage: PUT /api/content/v1/cards/bulk/pages added scratch card 1917125635 to scratch view 503426363 -> 200
- Final stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1200764577&destinationPageIds=1365898974 -> 200 (classic page remove probe)
- Final stage: DELETE /api/content/v1/cards/bulk/pages?cardIds=1917125635&destinationPageIds=503426363 -> 200 (App Studio view remove probe)
- Final stage: DELETE /api/content/v1/cards/bulk?cardIds=1200764577 -> 200, then the same call again -> 404 (already-deleted probe)
- Final stage: cleanup DELETE /api/content/v1/cards/bulk?cardIds=1331123134,1917125635 -> 200, DELETE /api/content/v1/dataapps/917641970 -> 200, DELETE /api/content/v1/pages/1365898974 -> 200
