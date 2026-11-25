---
published: false
---

# Open Issues: Index and Shared Infrastructure

Status: **decided**. Written 2026-11-20 against branch `2.0.0`; every open decision was settled by the maintainer on 2026-11-23, and each plan has been revised to match. Each open GitHub issue has its own plan, linked from [At a glance](#at-a-glance); this doc holds what spans them: the cross-issue decisions, the shared infrastructure and landing order, and the pre-existing bugs found while planning. The issues are [#9](https://github.com/brycewc/domo-toolkit/issues/9), [#8](https://github.com/brycewc/domo-toolkit/issues/8), [#6](https://github.com/brycewc/domo-toolkit/issues/6), [#80](https://github.com/brycewc/domo-toolkit/issues/80), [#43](https://github.com/brycewc/domo-toolkit/issues/43), [#10](https://github.com/brycewc/domo-toolkit/issues/10).

Each plan went through three passes: an investigator that read the code, the Domo API spec and Domo's own frontend bundles, and checked behavior against domo.domo.com; an independent critic that re-ran the checks and attacked the draft; and a reviser that settled every critique point. A final reconciliation pass merged the shared card infrastructure for #8 and #9 (and the batch helper #6 and #8 both need) into one design.

API claims in the plans carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

Everything that could be settled by investigation was settled, and is recorded in each plan's **Design decisions made** subsection. The product, UX, and scope calls that were left to the maintainer are recorded, each with its outcome, in each plan's **Decisions** section, and in [Decisions](#decisions) here for the cross-issue ones.

## At a glance

| Issue                                                                                                                                                                       | Effort | Decisions | Plan                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [#9](https://github.com/brycewc/domo-toolkit/issues/9) [Bulk Rename Cards](issue-9-rename-cards-plan.md)                                                                    | M      | 4         | Build a separate side panel Rename Cards view (find and replace with optional regex, add prefix, add suffix, live before/after preview, in-view undo) for pages, App Studio pages and apps, worksheets, Report Builder pages, datasets, and dataflows. Every run is confirmed with a 3 s hold. It sends one PUT per card to /api/content/v1/cards/{id}/title, with a payload rule that keeps dynamic text intact, and shares a card loader and one new DataList prop with #8. Titles only; descriptions are a quick follow-up. Medium effort.                                                                                                                                               |
| [#8](https://github.com/brycewc/domo-toolkit/issues/8) [Bulk Select Delete Cards on Dashboard](issue-8-remove-cards-plan.md)                                                | M      | 3         | Build a "Remove Cards" side panel view for pages, App Studio pages, and worksheet pages that removes the selected cards from the page in bulk. Nothing is deleted. Only cards that also live somewhere else (another page, app page, report page, or a system page) can be selected, so no card is ever left on no page, and every run is confirmed with a 3 s hold. It runs on the card loader and list wrapper it shares with #9 (see Shared infrastructure). Medium effort.                                                                                                                                                                                                              |
| [#6](https://github.com/brycewc/domo-toolkit/issues/6) [Find and Replace Columns in Beast Modes Bulk](issue-6-replace-beast-mode-columns-plan.md)                           | L      | 8         | Build a new Beta side panel view, Replace Columns in Beast Modes, launched from datasets and Beast Modes. It finds every non-archived dataset and card Beast Mode that references a column (on picked datasets or across the instance) with a paged search that filters inside the page, then rewrites those references in bulk through the existing column rewriter. It waits for beta phases 1.2, 1.3 and 1.6 and is built on them directly: 1.2's batchWithFallback and withRetry for the save, 1.3's change journal as the run's only record (no in-view Undo), and 1.6's useRunLock. Remap Columns and Migrate Beast Mode Usage get the same rights gate. Effort is L.                 |
| [#80](https://github.com/brycewc/domo-toolkit/issues/80) [Update Code Engine Functions in a Custom App to the Latest Version](issue-80-update-code-engine-versions-plan.md) | L      | 4         | Build a beta side panel view called "Update Code Engine Versions". It opens from an app card (one instance) or its app design (every carded instance), moves each card's own Code Engine pins to a chosen released version (latest by default), and reports each card's wiring against the target contract without changing it. Inherited pins are shown read-only, and a run that touches more than one card is confirmed with a hold. Effort is L: card scope first, design scope second; the package-side entry is a follow-up.                                                                                                                                                          |
| [#43](https://github.com/brycewc/domo-toolkit/issues/43) [Move a Page](issue-43-move-page-plan.md)                                                                          | L      | 7         | Build a Move Page side panel view for dashboard pages, for content admins and anyone with content.page.edit who owns the page or finds it unlocked. It moves a page and its subpages under a new parent or to the top level through Domo's own bulk move endpoint, checks the depth rules first, previews who gains and loses access on the page and on every ancestor, makes the user pick an access option, and holds whenever access changes. After the move, an opt-in checklist can remove chosen users and groups from the old parent and old top page. Effort is L because of that cleanup path. Reordering, App Studio moves, multi-page moves and Business-in-a-Box pages are cut. |
| [#10](https://github.com/brycewc/domo-toolkit/issues/10) [Pin Preconfigured Set of Features to Left Nav for a New Instance](issue-10-nav-pin-presets-plan.md)               | L      | 6         | Build a Nav Pins options tab that captures the portable part of your left nav from one instance into one of several named presets. Nothing is applied automatically: the first time you open the side panel or popup on an instance new to this browser whose nav is still at Domo's defaults, a toast offers to apply a preset in one click. Apply Now in options can Replace your pins or Add Missing ones, both with Undo. Large: a pure pin utility, a nav service, background seeding and apply handlers, an options tab, and an offer hook.                                                                                                                                           |

Cross-issue decisions: 4. Order of work and what each issue builds for the others: see [Landing order](#landing-order).

**Pre-existing bugs found along the way** are listed in [Pre-existing bugs found by the plans](#pre-existing-bugs-found-by-the-plans). The most serious is `swapAppColumns` (`src/services/proCodeApps.js:179-180`, shipped in v1.9.0): it reads `packageMapping` and `workflowMapping` from the top level of `GET /domoapps/apps/v2/{instanceId}`, but Domo returns them only under `context`, so Remap Columns and Migrate Content save both as `[]` (inherit the design) on every pro-code card they touch. Re-confirmed live on instance `80ec5d16-2494-4dc5-85c8-521ade4e15af`: top-level keys carry no `packageMapping`, while `context.packageMapping` holds 10 pins and `context.workflowMapping` holds 1 binding.

## Decisions

IDs are `D<issue>.<n>`, plus `DX.<n>` for decisions that span issues. Each issue's own decisions are in its plan; the cross-issue ones are below. The maintainer settled all 36 on 2026-11-23. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### Cross-issue (#6, #8, #9, #80)

#### DX.1. How should the bulk card actions be organized: separate Delete Cards and Rename Cards views, or one view with modes?

**Decision:** Option 1, two views, each with its own button, both on the shared `CardBatchList`. Since #8 became remove-only (DX.2, D8.1), the two views are Remove Cards (#8) and Rename Cards (#9).

1. Two views, Delete Cards (#8) and Rename Cards (#9), each with its own action button, both on the shared CardBatchList (as both plans are now written)
2. One Bulk Edit Cards view with Delete, Remove from Page, and Rename modes behind one button
3. Selection modes added to the existing Get Cards view, with Delete, Remove, and Rename in its footer
4. Delete Selected Cards inside the page's existing Delete view, with Rename Cards as its own view

**Planning recommendation:** Two views. Delete is a hold-to-confirm-then-close flow scoped to pages, while Rename is a stay-open, multi-pass flow with a transform panel, a live preview, and a wider set of sources. The shared loader, list wrapper, and DataList prop give the reuse without coupling their state, and Get Cards stays a read-only view with no destructive actions.

**Why it matters:** It sets how many action buttons appear in the page card block (two, or one), whether one view has to juggle three modes with different sources, selection defaults (none selected for delete, all editable for rename), and stay-open rules, and whether GetCardsView or DeleteObjectView gets retrofitted. The shared pieces (getCardsForContext, CardBatchList, renderItemDetail) are the same under every option.

#### DX.2. Which source contexts should each card tool support?

**Decision:** Option 1, with one change: #8 does not delete cards at all. It removes them from the page. So the #8 view is **Remove Cards**, on pages, App Studio pages, and worksheet pages. Report Builder pages drop out of #8, since they were included for Delete only and remove there is unverified. Rename Cards keeps the full set (those three plus Report Builder pages, datasets, dataflows, and app or worksheet parent scope). Neither tool appears on Beast Modes.

1. Different sets: Delete Cards on pages, App Studio pages, and worksheet pages, plus Report Builder pages in Delete mode only; Rename Cards on those plus datasets, dataflows, and app or worksheet parent scope; neither on Beast Modes
2. The same full set for both: Delete Cards also on datasets, dataflows, and parent scope, with Remove from Page only on single-page contexts
3. The same page-only set for both in v1: Rename Cards drops datasets, dataflows, and parent scope
4. Option 1, plus Rename Cards on Beast Modes (every card that uses the Beast Mode)

**Planning recommendation:** Option 1. Renaming a dataset's or an app's cards is the duplicate-cleanup case the rename issue names, while deleting every card built on a dataset is a much larger, cross-page blast radius than the dashboard cleanup the delete issue asks for, and Remove only has meaning on a single page. Report Builder pages get Delete only, because bulk delete is page-independent and getCardsForObject already loads them, while remove there is unverified. Beast Mode contexts have no shared naming context for a rename.

**Why it matters:** The shared getCardsForContext supports every source, so the answer is a gate change in availableActions.js (deleteCards inside the page card block versus its own block, plus the renameCards block), plus README and release-note wording. Under option 2, DeleteCardsView also needs parent-scope groups and a hydrate (the dataset source has no locked field), and its placement lookups would run across many pages. Under options 1 and 2, the Remove toggle hides on report pages.

#### DX.3. Who should see the new card write tools (Delete Cards, Rename Cards), given that Manage Card Locks and Manage Card Owners are content.admin only?

**Decision:** Option 1. Both Remove Cards and Rename Cards show for `content.admin` or `content.card.edit`, the group Domo's Admin > Cards lets run `remove_from_pages`. Rename keeps its per-row `canManageCard` check. Remove has no card-level check, because a card's lock governs edits to the card, not its placements; locked pages still limit Remove to owners and content admins (see #8 Design). Manage Card Locks and Manage Card Owners keep their `content.admin` gate.

1. content.admin or content.card.edit for both (Domo's canManageCards, the people who can reach Admin > Cards bulk actions), with per-row canManageCard checks
2. content.admin only for both, matching Manage Card Locks and Manage Card Owners
3. Rename on content.admin or content.card.edit, Delete on content.admin only
4. Option 1 now, and widen Manage Card Locks and Manage Card Owners to the same gate as a follow-up

**Planning recommendation:** Option 1. It matches who Domo already lets do this in Admin > Cards and in its own card menu (canManageKpi). The shared canManageCard helper disables rows the user can't manage, so a wider button gate does not produce lists of failures. #6 recommends the same right for Replace Columns in Beast Modes, so all three new write tools would match.

**Why it matters:** It sets two availableActions.js gates. For #8, it decides whether the fast adminsummary placement path is the normal case (adminsummary likely refuses users without either right, leaving the 30-second per-card fallback). It also decides whether the page card block ends up with mixed gates, since Locks and Owners stay content.admin only unless option 4 is chosen, which would need its own release note.

#### DX.4. Should the new multi-item write tools record their runs in the beta 1.3 change journal once it lands, even though 1.3 calls journaling non-Beta features a later per-feature decision?

**Decision:** Option 3. No new tool journals until 1.3 has shipped for Transfer Ownership and Duplicate User, and each one is revisited on its own afterward. #9 keeps its in-view Undo, #8 keeps no record, #80 and #43 keep their in-memory results. **#6 is the one exception**, already settled by D6.1 and D6.6: it is built after 1.3 lands and uses the journal as its only change record, so its per-feature decision is yes. The hook points (`onSend`/`onSettled`, the pool's `onSettled`, Move Back) stay documented for the later revisit.

1. Yes for every new multi-item write tool: Delete Cards (#8), Rename Cards (#9), Replace Columns in Beast Modes (#6), Update Code Engine Versions (#80), and Move Page's Move Back (#43)
2. Only the tools that ship as Beta (#6 and #80 are planned as Beta)
3. None until 1.3 has shipped for Transfer Ownership and Duplicate User; revisit per feature afterward

**Planning recommendation:** Option 1. Each of these tools already holds before and after values in memory, and the hook points are uniform (batchWithFallback's onSend and onSettled, promisePool's onSettled, one entry for a page move), so the cost is a few lines per view. A permanent bulk card delete is the case where a durable record of what was deleted matters most.

**Why it matters:** It decides whether #8 keeps each deleted card's ID, title, and placements for the record, whether #9's and #6's in-view Undo banners ('Undo lasts until you leave this view') can go once 1.3 lands, and whether 1.3's Recent Runs page needs feature labels and Excel row mappers for five more features.

## Shared infrastructure across issues

This section settles the pieces that #8 (Bulk Select Delete Cards on Dashboard, now the remove-only Remove Cards view) and #9 (Bulk Rename Cards) were meant to share, plus the overlaps found across all six plans (#6, #8, #9, #10, #43, #80). It is based on the plans and on the code they reference (`DataList.jsx`, `GetCardsView.jsx`, `ManageCardLocksView.jsx`, `DeleteObjectView.jsx`, `src/services/cards.js`, `src/utils/cardHelpers.js`, `src/hooks/*`, `src/utils/executeInPage.js`, and the beta-phase plans).

### What is shared, and who builds it

| Piece                                                                                      | File                                     | Built by                                         | Adopted by                                                                                                                                                                                             |
| ------------------------------------------------------------------------------------------ | ---------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `getCardsForContext`, plus `cardsOnly` and `parts` options on `getCardsForParent`          | `src/services/cards.js`                  | #9                                               | #8                                                                                                                                                                                                     |
| `cardUrlOnPage`, `canManageCard`                                                           | `src/utils/cardHelpers.js`               | #9                                               | #8 adopts `cardUrlOnPage` (Remove has no card-level check); `GetCardsView` adopts `cardUrlOnPage` in the same commit                                                                                   |
| `renderItemDetail` prop (the only DataList extension)                                      | `src/components/views/DataList.jsx`      | #9                                               | #8 (row detail line), #6 (expandable before and after formula)                                                                                                                                         |
| `CardBatchList` (the only card list wrapper)                                               | `src/components/views/CardBatchList.jsx` | #9                                               | #8                                                                                                                                                                                                     |
| `promisePool`, to beta 1.2 step 2's signature                                              | `src/utils/promisePool.js`               | #9                                               | #80                                                                                                                                                                                                    |
| `retryAfter` on the `executeInPage` error envelope (the envelope half of 1.2 step 1)       | `src/utils/executeInPage.js`             | already landed (pre-existing bug 5)              | #8's placement fast path, then 1.2                                                                                                                                                                     |
| `batchWithFallback`, to 1.2 section 6 as amended below                                     | `src/utils/batchWithFallback.js`         | #8 if it starts before 1.2 step 6, otherwise 1.2 | #6 (after 1.2), 1.2's caller retrofit                                                                                                                                                                  |
| `HOLD_DURATION_FULL` (5000), `HOLD_DURATION_SHORT` (2500), and `HOLD_DURATION_BULK` (3000) | `src/utils/constants.js`                 | #9 (the first feature to hold)                   | `HoldToConfirmButton`'s default (`FULL`) and `DeleteObjectView` (`FULL`, `SHORT`); `BULK` for every Rename Cards and Remove Cards run; every hold in #6, #10, #43 and #80 picks up `FULL` with no edit |
| `computeIsOwner` covers `WORKSHEET_VIEW`                                                   | `src/background.js`                      | done, as its own bug-fix commit                  | every worksheet page gate, including Remove Cards' page check                                                                                                                                          |
| A shared card-batch hook                                                                   | none                                     | not built (see below)                            |                                                                                                                                                                                                        |

`src/hooks/useCardBatch.js` (#8's proposal), `renderItemTrailing` (#8's hand-off to #9), #9's view-local apply pool, and `cardHostUrlForTab` (only needed to redirect a tab off a deleted card) are all dropped.

### Landing order

1. **#9, commit A: shared card plumbing.** `cardUrlOnPage` and `canManageCard` (with `GetCardsView.transformCardsToItems` switched to `cardUrlOnPage`), the `getCardsForParent` options, `getCardsForContext`, DataList `renderItemDetail`, and `CardBatchList`. No user-visible change, so no release note.
2. **#9, commit B: executors and holds.** `src/utils/promisePool.js`, recorded in `docs/plans/beta-phase-1-2-retries-concurrency.md` (amendments below), plus the three hold constants in `src/utils/constants.js` with `HoldToConfirmButton.jsx` and `DeleteObjectView.jsx` switched to them (no behavior change). Moving `ActivityLogTable.jsx`'s local `promisePool` stays with 1.2, as #80 also proposes. The envelope `retryAfter` field has already landed.
3. **#9 feature commits.**
4. **#8:** `batchWithFallback` in its own commit with the 1.2 doc amendment, unless 1.2 step 6 has landed it first. Then the feature, adopting everything from commits A and B. The `computeIsOwner` fix it once depended on is done.
5. **#80** imports `promisePool` from step 2. If #80 lands before #9, it builds `promisePool` to the 1.2 step 2 signature, not the `promisePool(taskFns, concurrency)` form #80's plan proposes.
6. **#6** starts only once beta 1.2, 1.3 and 1.6 have all landed (D6.1), and builds on `batchWithFallback`, `withRetry`, `createRunJournal` and `useRunLock` directly. The rights-gate change for Remap Columns and Migrate Beast Mode Usage (D6.4) is its own commit and can land any time.

#43 and #10 share nothing with this order and can land whenever.

**Why #9 goes first.** It is the smaller and the harder consumer of the shared list: grouped parent scope, one card under several views, row order pinned across renames, and live per-row status at concurrency 4. Shaping `CardBatchList` and `getCardsForContext` against that case first means #8 adopts them with no rework. And #9 does not need `batchWithFallback`, so the batch helper cannot hold it up. If the maintainer would rather ship #8 first, #8 builds commit A exactly as specified here (it needs all of it except `promisePool` and `canManageCard`) plus the hold constants, and #9 adopts them.

### Card loading: `getCardsForContext`

```js
export async function getCardsForContext({ context, hydrateParts = null, parentId = null, parts = null, scope = 'object', tabId = null })
// -> { cards, failedViews: [{ error, viewId, viewName }], groups: [{ cardIds, viewId, viewName }], missingIds: string[], parentName: string | null }
```

It goes between `getCardsByIds` and `getCardsForObject` (exports stay alphabetical).

- **Object scope:** `getCardsForObject({ metadata: context.domoObject.metadata, objectId, objectType, parts, tabId })`.
  - Pages, App Studio pages, worksheet pages, and Report Builder pages read stacks with `parts`, and keep the existing v1 page fallback on a 404.
  - Datasets read `datasources/{id}/cards`, which carries no `metadata` and no `locked`.
  - **Dataflows need nothing lifted from GetCardsView.** `getCardsForObject`'s `DATAFLOW_TYPE` branch already pools the outputs at `DEPENDENCY_FETCH_CONCURRENCY` and dedupes by card ID (`cards.js:361-389`, VERIFIED-CODE). `fetchCardsForOutputDatasets` stays in `GetCardsView`, because Get Cards groups cards by output.
- **Parent scope** (`scope: 'parent'`, `parentId` defaulting to `context.domoObject.parent?.id`): calls `getCardsForParent({ cardsOnly: true, parentId, parts, tabId })`.
  - Each view becomes `groups[]` (`cardIds` in load order).
  - A view whose card read failed goes to `failedViews` instead of disappearing.
  - `transformParentScopeItems` stays in `GetCardsView`. It builds DataListItems and mixes in forms, queues, and workflows, so it is a UI transform, not loader logic.
- **Hydrate** (only when `hydrateParts` is set): one `getCardsByIds({ cardIds, parts: hydrateParts })` call, merged onto the source card as `{ ...sourceCard, ...hydrated }`.
  - The merge keeps source-only fields, such as stacks' per-card `access` flag on App Studio views, which a v1 card read does not return.
  - IDs the hydrate does not return go to `missingIds` and drop out of `cards`.
- **Normalized output:**
  - `cards` holds each card once, with `id` as a string so Map and Set keys agree across sources.
  - Sorted by trimmed title, each card carries a `loadIndex`.
  - The raw `title` is kept untrimmed, since #9 needs the exact stored text.
- **Errors:** an object-scope source failure throws, with `status`. In parent scope, only a failed app read throws.
- **`getCardsForParent` options:** `cardsOnly` already exists (pre-existing bug 4): it skips `fetchViewDetails` and the forms, queues, and workflows reads and returns `{ cards: [], error, viewId, viewName }` for a failed view. #9 adds `parts = null`, passed to each view's card read.

| Consumer        | `parts`         | `hydrateParts`                                                                                                                   | Scope            |
| --------------- | --------------- | -------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| #8 Remove Cards | `'datasources'` | `null` (stacks already carries every row field, `access` included)                                                               | object           |
| #9 Rename Cards | `null`          | `'metadata,owners'` (the dataset source has no `locked` or `metadata`, and the payload rule needs `metadata.dynamicDescription`) | object or parent |

Follow-up, in neither issue: `GetCardsView`, `ManageCardLocksView` and `ManageCardOwnersView` can move onto this loader later. Manage Card Locks already works around the dataset source's missing `locked` (VERIFIED-CODE).

### Card list: `CardBatchList` and one DataList prop

**One DataList extension: `renderItemDetail: (item) => ReactNode | null`.** `renderItemTrailing` is dropped. Both features need a visible second line on a row, and DataList has none:

- DataList never renders `item.metadata`, although `DataListItem` documents it as display text.
- `annotation` is only an info icon plus hover text (VERIFIED-CODE, `DataList.jsx` around line 1450).

So #8's "Opportunities. Also on Q3 Review and 1 more" needs the same slot as #9's before and after diff. #6's review rows (an expandable before and after formula under each Beast Mode) fit the same slot, so DataList gains one prop instead of three. A trailing editor slot was only for per-row inline editing, which is out of #9 (D9.1).

The prop's contract:

- It renders on leaf rows at any depth, under the label, in a plain block outside any `Disclosure.Trigger` or pressable element, so interactive content there works.
- It is threaded through `childRenderProps` and both `VirtualizedItems` call sites.
- `arePropsEqualForRow` compares it by function identity, so consumers memoize it on the data it reads.
- When it is set, `VirtualizedItems` passes a taller `estimateSize` than `ROW_HEIGHT` (36), to avoid scroll jumps before rows are measured.
- It is documented in the props JSDoc. Fix the `DataListItem.metadata` JSDoc in the same edit, since nothing renders it.

**One list wrapper: `src/components/views/CardBatchList.jsx`.** It is a thin, stateless wrapper over `DataList` in selection mode. It loads nothing, sends nothing, and holds no run state.

| Prop                                                                                                   | Purpose                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cards`, `groups`                                                                                      | Rows come from the loader output. With `groups`, each view is a virtual parent (linking to the view) with its cards as leaf children.                                                                                  |
| `context`                                                                                              | Origin, object type and ID, and parent ID, for `cardUrlOnPage` row links.                                                                                                                                              |
| `selectedCardIds`, `onSelectedCardIdsChange`                                                           | Selection keyed by card ID.                                                                                                                                                                                            |
| `isSelectable(card)`, `unselectableReason(card)`                                                       | Mapped to DataList's `isSelectable` and `getUnselectableTooltip`.                                                                                                                                                      |
| `rowStatus: Map<cardId, { status: 'queued' \| 'running' \| 'done' \| 'failed' \| 'skipped', error? }>` | Per-card run state, owned by the view.                                                                                                                                                                                 |
| `statusLabels: { done, failed, running }`                                                              | Verb-specific tooltip text, for example `Removing...` / `Removed` / `Failed`.                                                                                                                                          |
| `renderDetail(card)`                                                                                   | Passed to `renderItemDetail`.                                                                                                                                                                                          |
| `chipFor(card)`, `mutedFor(card)`                                                                      | Map to the item's `chip` and `muted` fields.                                                                                                                                                                           |
| `isRunning`                                                                                            | Makes selection read-only and drops `reload` and `refresh` from the header actions (the interim run lock, see below).                                                                                                  |
| DataList pass-through                                                                                  | `banner`, `beta`, `currentContext`, `customHeaderActions`, `feature`, `featureIcon`, `footer`, `headerActions`, `isActive`, `isRefreshing`, `onClose`, `onRefresh`, `onStatusUpdate`, `subject`, `subtext`, `viewType` |

What it does internally:

- **Row IDs.** A row's ID is the card ID in object scope, and `${viewId}:${cardId}` with `originalId = cardId` in grouped scope. It translates between row IDs and card IDs in both directions. On a change, it diffs the new row ID set against the previous one: an added row adds its card, and a removed row removes its card. That way unchecking one instance of a card that appears under two views unselects the card everywhere, instead of the other instance re-adding it.
- **Order.** Each card gets `sortWeight` from `loadIndex`, pinned by card ID in a ref across refreshes, with new cards appended. Renames and post-run reloads therefore never reshuffle rows.
- **Select all.** It builds `selectAll` over the selectable unique card IDs.
- **Badges.** Run status wins over the lock badge:
  - `running` shows a `Spinner`.
  - `done` shows an `AnimatedCheck`.
  - `failed` shows an `AnimatedX` with the tooltip `${statusLabels.failed}: ${error}`.
  - `queued` and `skipped` show no badge (a consumer chip carries skip reasons).
  - With no status, a locked card shows the lock icon with the tooltip `Locked`.
  - Every state's tooltip is distinct, because `arePropsEqualForRow` compares badges by tooltip.
- **Fixed DataList settings.** Leaf rows use `typeId: 'CARD'`, with `itemActions={['copy']}`, `fillHeight`, `selectionMode`, and `showActivityLogAll={false}`.

### No shared card-batch hook

`useCardBatch` is not built. It was meant to own loading, selection, per-row status, and a `runBatch` around `batchWithFallback`, and that shape fits only #8:

- **The executors differ.** #8 writes through all-or-nothing bulk endpoints in serial chunks of 50 with per-item fallback. #9 has no bulk title endpoint (the only `cards/bulk*` routes are delete, duplicate, lock, and pages, VERIFIED-LIVE in #9). Its natural executor is one PUT per card in a pool of 4 with retries, preceded by a fresh re-read that skips changed or deleted cards. A `runBatch` that wraps `batchWithFallback` would force #9 into serial chunks of 1. A hook loose enough for both executors is just a `Map` in `useState`.
- **The selection rules differ.** #8's selectability depends on an async placement lookup per card. #9's depends on a live preview and on per-row validity, and it carries an undo stack. Neither belongs in a shared hook.
- **Loading is one service call.** Every view already does the `getSidepanelData` type check, `useViewReady`, and `mountedRef` in the same way. Wrapping `getCardsForContext` in a hook would hide the per-view type check and save a few lines.
- **What is actually shared** already has a home. Source resolution lives in `getCardsForContext`. Row IDs, selection mapping, pinned order, and the status badges live in `CardBatchList`. The run machinery lives in `batchWithFallback` and `promisePool`. The 1.6 run lock is a one-line `useRunLock` per view by design.

Each view keeps `selectedCardIds`, a `statusByCardId` Map in the `CardBatchList` vocabulary, `isRunning`, and its own progress count.

### Batch executors

**`batchWithFallback`**, the one signature for #6 and #8. It is 1.2 section 6 plus three options and one result field. #8 builds it if it starts before 1.2 step 6; #6 always gets it from 1.2:

```js
batchWithFallback(items, { canFallBack, chunkSize, onSend, onSettled, profile, sendBatch, sendOne, signal });
// -> Promise<Array<{ error, item, ok, notSent?, partial? }>> in input order
// onSend(items, { phase: 'chunk' | 'single' })                  just before each request
// onSettled(results, { doneCount, phase: 'chunk' | 'single', total })  after each request whose results are final
```

- `sendBatch(chunk)` and `sendOne(item)` are caller closures. #6 re-resolves the tab with `getValidTabForInstance` inside them, as its tab-change handling requires.
- **Chunks run serially.** The default `canFallBack` is a definite 4xx other than 429, which covers #8's one-bad-ID 404 and #6's atomic 400. A 5xx or an exhausted 429 marks the chunk failed without firing single calls.
- **`onSettled` firing rules.** It fires for a chunk that succeeded, for a chunk that failed and will not fall back, and for each single call. It does not fire for a chunk that falls back, because its results are not final yet. `doneCount` counts items with final results.
- **What the callbacks drive:**
  - #8's rows: `onSend` sets `running`, and `onSettled` sets `done` or `failed`.
  - #6's progress, "Saved 50 of 80": `doneCount` of `total`.
  - #6's 1.3 journal run: `onSend` calls `run.start(keys)`, and `onSettled` calls `run.record()`. The same hooks would serve #8 if its journal question is revisited.
  - This replaces #8's `onProgress({ items, phase, results })`, which had no hook before a request and so could not show a chunk as running or start a journal entry.
- **`signal` is an AbortSignal**, checked before each request. Unsent items come back `{ ok: false, notSent: true, error }`. That covers #6's stop when no Domo tab for the instance is left, and an unmounted view (each view aborts its controller on unmount).
- **`profile`** is passed to `withRetry` once `src/utils/retry.js` exists. Until then each send is called directly.
- **`partial`** stays reserved for the add-plus-remove callers in 1.2's table. #6 and #8 never set it.

| Caller                                                                                | Executor                     | Chunk | Profile                                                                                 |
| ------------------------------------------------------------------------------------- | ---------------------------- | ----- | --------------------------------------------------------------------------------------- |
| #6 Beast Mode save (`updateDatasetFunctions`, falling back to `saveFunctionTemplate`) | `batchWithFallback`          | 50    | `RETRY_SAFE`                                                                            |
| #8 Remove from Page (`removeCardsFromPage`)                                           | `batchWithFallback`          | 50    | `RETRY_SAFE` (removing a card that is not on the page returns 200, VERIFIED-LIVE in #8) |
| #9 rename (`renameCard`)                                                              | `promisePool`, concurrency 4 | none  | `RETRY_SAFE` (idempotent title PUT)                                                     |
| #80 card writes                                                                       | `promisePool`, concurrency 3 | none  | `RETRY_REJECTED` (pro-code context POST, per 1.2's table)                               |

**`promisePool`** is built by #9 to 1.2 step 2's signature, `promisePool(tasks, { concurrency = 6, onSettled })`. It returns `PromiseSettledResult[]` in input order, and `onSettled(result, index, doneCount)` drives #9's footer count. Tasks check the view's AbortSignal themselves before sending.

**`withRetry` is built by none of the six.** #9 wraps each task in a small local transient-retry function. It retries 429, 502, 503, and 504 twice, waiting `Retry-After` when present (failing past 60 s, as 1.2 specifies), otherwise 1 s and then 3 s. That makes the later swap to `withRetry(fn, { profile: RETRY_SAFE })` a one-line change. #6 lands after 1.2, so it passes `profile` and gets 1.2's retries from the start. #80 keeps "no automatic retry".

**The envelope `retryAfter` field** has already landed (pre-existing bug 5): `runInPage` carries `retryAfter` and `toError` copies it back, documented next to `status` in `.claude/rules/architecture.md`. New page-side throws in #8 and #9 set `e.retryAfter = r.headers.get('Retry-After')`. The rest of 1.2 step 1 (the roughly 44 status-less sites, `shareContent`) stays with 1.2; `updateDatasetFunctions` already carries `status`.

### Amendments to `docs/plans/beta-phase-1-2-retries-concurrency.md`

Make these in the commit that lands each piece:

1. **Section 6 signature.** Add `onSend`, `onSettled`, and `signal`, and the `notSent` result field, with the firing rules above.
2. **Section 6 callers table.** Add #6 Replace Columns in Beast Modes and #8 Remove from Page, with the chunks and profiles above.
3. **Write classification table.** Add `PUT content/v1/cards/{id}/title` as `RETRY_SAFE` (idempotent, VERIFIED-LIVE in #9) and `DELETE content/v1/cards/bulk/pages` as `RETRY_SAFE` (VERIFIED-LIVE in #8).
4. **Context and Order.** Note that `batchWithFallback` (from #8, if it starts first) and `promisePool` (from #9) may land before steps 1 to 3, and that the envelope `retryAfter` field already has. They call sends directly until `retry.js` exists. #6 waits for 1.2, 1.3 and 1.6. The `ActivityLogTable.jsx` call-site move and the step 2 loop replacements stay with 1.2.
5. **Section 8 tests.** Add `onSend` and `onSettled` order (no `onSettled` for a chunk that falls back), `doneCount`, and abort producing `notSent`.

### Run lock, change journal, and fresh reads

- **Run lock (1.6).** Every new view with a multi-step write adds a row to the "Which views lock" table in `docs/plans/beta-phase-1-6-run-lock.md` in its own commit:

  | View                                   | Flag                                     |
  | -------------------------------------- | ---------------------------------------- |
  | `RemoveCardsView.jsx` (#8)             | `isRunning`                              |
  | `RenameCardsView.jsx` (#9)             | `isRunning` (`run.phase === 'applying'`) |
  | `ReplaceBeastModeColumnsView.jsx` (#6) | scanning or applying                     |
  | Update Code Engine Versions (#80)      | `isSubmitting`                           |
  | `MovePageView.jsx` (#43)               | the access cleanup run (`isCleaning`)    |

  #43's move itself is a single bulk move request, so it falls under 1.6's single-request exception. Its access cleanup (D43.4) is one revoke per user or group, so that part locks.

  Until 1.6 lands, the interim lock for #8 and #9 is `CardBatchList`'s `isRunning`: read-only selection, with Reload and Refresh removed. #6 needs no interim lock, since it lands after 1.6 and calls `useRunLock` from the start.

  After a run, #8 closes the view through `onBackToDefault` once no cards are left on the page. Guard that call with `mountedRef` until 1.6's `viewKey`-scoped close lands.

- **Change journal (1.3).** Only #6 journals (DX.4). It lands after 1.3, records each Beast Mode through `createRunJournal({ feature: 'replaceBeastModeColumns', subject })` from `batchWithFallback`'s `onSend` and `onSettled`, and adds a feature label and Excel row mapper to Recent Runs. The other tools revisit journaling one at a time after 1.3 ships for Transfer Ownership and Duplicate User. Their hook points stay the same for that revisit:
  - `batchWithFallback`'s `onSend` and `onSettled` (#8, key `removeCards`).
  - `promisePool`'s `onSettled` (#9 `renameCards`, #80 `updateCodeEngineVersions`).
  - Move Back's single entry and the cleanup's per-principal revokes (#43 `movePage`).

- **Fresh reads (1.4 and D2).** #6 and #9 both re-read before writing, and skip changed or already-done items. #8 re-checks the selected cards' placements right before the run and skips any that now live only on this page, so the "never on no page" rule holds against edits made since loading. Its post-run refresh, which counts a card that vanished from the page as done, plays the same role for a chunk's 404.

### Permissions and confirmations

- **`canManageCard({ card, userRights })`** in `src/utils/cardHelpers.js` is Domo's own `canManageKpi` rule (bundle, VERIFIED-LIVE in #9): `content.admin || card.isCurrentUserOwner === true || (content.card.edit && !card.locked)`. `isCurrentUserOwner` counts group ownership.
  - #9 uses it for rename editability, and needs `owners` through `hydrateParts`. The server stays authoritative.
  - #8 does not use it. Removing a card from a page is a page edit, and a card's lock governs edits to the card itself (INFERRED, checked in #8's permission test).
- **Button gates** (DX.3, D6.4). #6, #8, and #9 all use `content.card.edit || content.admin`, and so do the shipped Remap Columns and Migrate Beast Mode Usage buttons once D6.4's commit lands. Manage Card Locks and Manage Card Owners stay `content.admin` only.
- **Holds.** `HOLD_DURATION_FULL` (5000) and `HOLD_DURATION_SHORT` (2500) replace the three duplicated literals: `DEFAULT_HOLD_DURATION` in `HoldToConfirmButton.jsx`, and `FULL_HOLD_DURATION` and `SHORT_HOLD_DURATION` in `DeleteObjectView.jsx`. `HOLD_DURATION_BULK` (3000) is new, for the two reversible bulk card tools. The settled rules:

  | Feature                           | Hold                                                                                                                     |
  | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | #9 Rename Cards                   | every run, `BULK` (D9.4)                                                                                                 |
  | #8 Remove Cards                   | every run, `BULK` (D8.3)                                                                                                 |
  | #6 Replace Columns in Beast Modes | `FULL` when certified or certification-requested rows are selected, otherwise a plain confirm (D6.3)                     |
  | #80 Update Code Engine Versions   | `FULL` when the run spans more than one card, otherwise plain (D80.3)                                                    |
  | #43 Move Page                     | `FULL` whenever access changes anywhere or a list failed to load (D43.3); the access cleanup always holds `FULL` (D43.4) |
  | #10 Nav Pins                      | `FULL` for Replace on a customized nav; Add Missing and the first-visit offer are plain (D10.2)                          |

### Other overlaps among the six plans

- **Admin summary endpoints.** #8 (card placements) and #43 (page search, `getChildPages`) both page through `adminsummary`. The plans found:
  - `limit` above 100 returns 400 (#9's title-search probe).
  - It returns 429 under concurrent load (#8, #9).
  - `getChildPages` never paginates (#43).

  Rule for every new loop: page at 100 using the total count, and retry a 429 once, honoring `Retry-After`. Retry inside the injected function, where the header is readable, or extension-side once the envelope field from #9 exists.

- **`src/utils/currentObject.js`.** #8 uses `reloadTabIfViewingObject`, #6 calls `getValidTabForInstance` per chunk, and #10 adds `listOpenDomoInstances()` next to it. These are additive and do not conflict.
- **#10 (Nav Pins)** is otherwise independent. It shares only `HoldToConfirmButton` (and through it the hold constants) and the `findStore()` pattern from `pageVariables.js`.
- **#43's access cleanup** adds the first share revoke service (`revokePageAccess`). Nothing else in the six plans revokes access, so it stays in `src/services/pages.js`.
- **#6's `searchFunctionsPage`** consolidates four copies of the paged Beast Mode search. No other plan needs it, now that #8 no longer deletes cards (and so no longer weighs counting their Beast Modes).
- **DataList consumers:**
  - #80's design scope uses DataList children (cards with rows nested under them) and needs no new prop.
  - #6's grouped review uses virtual parents, plus `renderItemDetail` for the expandable formulas. Its plan names no mechanism for those formulas today, so this is the one change #6 adopts from this section.
  - Every status badge in any of these views needs a distinct tooltip per state, because of `arePropsEqualForRow`.

### Pre-existing bugs found by the plans

Each of these lands as its own commit with its own release-note check, not under the feature's issue link:

1. **`computeIsOwner` skips `WORKSHEET_VIEW`** (`src/background.js:53`, found by #8). **Done.** Worksheet pages never got `metadata.isOwner`, so `DeleteObject.jsx`'s `isDeleteForbidden` (`!isOwner && !content.admin`) blocked a worksheet's owner without `content.admin` from deleting its pages. A worksheet page has no owner of its own, so the fix reads the parent worksheet's `owners` (from `/content/v1/dataapps/{id}`) rather than the page's stacks `page.isOwner`, and computes ownership after the parent loads. Logged under Bug Fixes (worksheet pages shipped in v1.9.0). The duplicated, unreachable second `TEMPLATE` branch was removed in the same change.
2. **`swapAppColumns` seeds the new context from the wrong level** (`src/services/proCodeApps.js`, shipped in v1.9.0, found by #80). **Done.** It likely reverted a pro-code card's Code Engine and workflow pins to the design's. Rather than reading `context` off the deprecated `GET /domoapps/apps/v2/{instanceId}`, `proCodeApps.js` now uses only `/api/apps/v1/instances/{instanceId}`, which carries all the wiring at the top level under plural names (`datasetsMapping`, `packagesMapping`, `workflowsMapping`, `collectionsMapping`, `accountsMapping`, `actionsMapping`; empty ones come back `null`). VERIFIED-LIVE on instance `80ec5d16-2494-4dc5-85c8-521ade4e15af`: each v1 array is identical to its v2 counterpart (`mapping`, `context.packageMapping`, `context.workflowMapping`, `collections`). The save is a single `PUT /api/apps/v1/instances/{instanceId}` with the full instance as read and `datasetsMapping` swapped, replacing POST context, PUT context, PUT instance. Verified on a temporary instance (created with `POST /api/apps/v1/instances?temporary=true`, then deleted):
   - The PUT is a full replace. A body that omits `packagesMapping` clears it, so sending only the changed mapping would recreate this same bug.
   - A full-body PUT keeps every other mapping and answers `{ instance, cardProperties }`.
   - It edits the instance's current context in place (same context id, new `lastModifiedDate`), so `GET /domoapps/apps/v2/{id}` and Domo's editor see the change. It creates no new context, unlike Domo's card editor, which still uses the v2 three-step save. Domo's own frontend only calls this PUT on temporary preview instances.

   VERIFIED-LIVE end to end on a scratch card (since deleted) bound to dataset `da91386d-779f-4fcc-b841-0b0814a3d8fc` with 2 Code Engine pins and 1 workflow, running the real `getDownstreamApps` and `swapAppColumns` against domo.domo.com:
   - The new code renamed the column with one GET and one PUT. Pins and workflow were unchanged, the context id stayed the same, and the v2 context showed the same wiring.
   - The v1.9.0 code, run the same way, renamed the column but left `packagesMapping` and `workflowsMapping` `null` (the v2 context showed `[]`). This confirms the shipped bug: the card falls back to the design's wiring.

   The `appDb.js` card lookups (`getCollectionsByIds`, `getCollectionConnectedApps`, `resolveAppInstanceCollections`) were compared against `POST /domoapps/apps/v2/card` on ACE Assistant's collections and returned the same owner cards. Logged under Bug Fixes.

3. **`getChildPages` truncates at 100 rows per request** (found by #43; page `942894016` has 107 children). **Done.** Both adminsummary loops (children, and each 10-parent grandchild batch) now page at 100 off `totalPageCount` and retry a 429 once with `Retry-After`. The `getSubpageIds` JSDoc now says direct children only. Logged under Bug Fixes without the #43 link.
4. **`getCardsForParent` turns a failed view into an empty one and then drops it** (found by #9), so Get App Cards silently omits a view it could not read. **Done.** Every read (cards, view details, forms, queues, workflows) now settles on its own, and a view with any failed read stays in `viewGroups` with what did load plus an `error` naming what did not ("Could not load this page's forms, workflows, and queues."). `fetchViewDetails` throws instead of returning null. `cardsOnly` landed with it (without `parts`, which stays with #9), returning `{ cards, error, viewId, viewName }`. Get App Cards marks a failed view with a "Failed to load" chip and the error as its annotation, counts it in the subtext, and shows a retryable error when nothing loaded. Get App Card Pages and Get App Beast Modes moved to `cardsOnly` and warn by toast, naming up to three pages (`describeFailedViews` in `cardHelpers.js`). There is no separate `failedViews` list: #9's `getCardsForContext` derives one from `vg.error`. Logged under Bug Fixes (both scopes shipped in v1.9.0).
5. **Errors that lose information.** **Done**, except `getCardsByIds`. None of these change what a user sees, so none is logged.
   - The envelope drops `Retry-After` (#8, #9, 1.2). **Done.** `runInPage` carries `retryAfter` and `toError` copies it back, documented next to `status` in `.claude/rules/architecture.md`. This is the envelope half of 1.2 step 1 that #9's commit B planned to land, so #9 no longer needs it.
   - `updateDatasetFunctions` throws without `status` (#6, 1.2). **Done.** Its error now carries `status` and `retryAfter`, and so does `getFunctionTemplate`'s. Messages are unchanged.
   - `hydrateFunctionTemplates` drops failed reads silently (#6). **Done.** It returns `{ failures, templates }`, with `failures` a map of id to the read's error (carrying `status`). The seven existing callers destructure `templates` and keep treating a missing template as before. #6's fresh read can now use it, reporting `failures` as "Couldn't read the current formula.".
   - `getCardsByIds` drops unresolved IDs (documented behavior, which #8 and #9 both work around through their missing-card handling). **Left as is.** Absence is the documented contract and its eight callers rely on the array shape; a caller that needs the misses diffs the requested IDs against the result, as #9's `getCardsForContext` does with `missingIds`.
6. **`DataListItem.metadata` is never rendered** (found in this reconciliation). **Deferred to #9 commit A.** It is documented as display text, and two shipped views write status text into it that users never see:
   - `ManageTagsView.jsx` sets "Tags unavailable" on unreadable objects (shipped in v1.5.0).
   - `ManageCardOwnersView.jsx` sets "N owners" or "Owners unavailable" on each card (shipped in v1.6.0). Unreadable cards are muted, so that case is partly signaled.

   The `fromDomoObject` (`ID: 123`) and `createGroup` (`N items`) defaults are never shown either. Once commit A adds `renderItemDetail`, both views pass it to render their status line, and the `DataListItem.metadata` and DataList `props.item.metadata` JSDoc is corrected in the same change. Unlike the rest of commit A this is user-visible, so it gets its own commit and a Bug Fixes note.

## Appendix: writes made on domo.domo.com during planning

Every write went to a scratch object the agent created for the probe (named `domo-toolkit-probe-<issue>-*`), and every scratch object was deleted and confirmed gone. No pre-existing object, user setting, nav pin, or instance setting was written, and no share emails were sent. A final search of pages, cards, datasets, groups, and Beast Modes for `domo-toolkit-probe` returned nothing.

Each issue plan lists the writes made for that issue in its own appendix.
