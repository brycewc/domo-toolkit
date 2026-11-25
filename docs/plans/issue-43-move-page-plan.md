---
published: false
---

# #43: Move a Page

Status: **decided**. This is the plan for [#43](https://github.com/brycewc/domo-toolkit/issues/43), written 2026-11-20 against branch `2.0.0`, with every open decision settled by the maintainer on 2026-11-23. Cross-issue decisions (`DX.*`), the shared infrastructure, the landing order across issues, and the pre-existing bugs found while planning live in [open-issues-plan.md](open-issues-plan.md).

API claims in this plan carry one of these tags: **VERIFIED-LIVE** (called on domo.domo.com and the response inspected), **VERIFIED-CODE** (already used the same way in `src/`), **SPEC-ONLY** (from the OpenAPI spec, not exercised), or **INFERRED**.

## Summary

The issue has a title and no body. I listed every plausible reading and checked each one against Domo's UI (frontend bundles fetched from `cdndomo.com`) and against the live instance:

| #   | Interpretation                                                                                                                      | What Domo offers today                                                                                                        | Planned?         |
| --- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| A   | Change a dashboard page's parent: make a top-level page a subpage, make a subpage top level, or move a subpage under another parent | Only a bulk **Move dashboard** action in Admin > Dashboards, which many users can't reach. Nothing on the dashboard itself.   | **Yes**          |
| B   | Reorder pages within one level of the nav                                                                                           | The **Manage dashboards** dialog: drag reorder per user, plus a company default order for admins                              | No, already easy |
| C   | Move an App Studio page from one App Studio App to another                                                                          | App Studio **Add page > Import app content** copies pages into the current app. Deleting the source is a separate, easy step. | No (D43.1)       |
| D   | Turn a dashboard into an App Studio page                                                                                            | App Studio **Import dashboard content**, a copy with an option to reference the original cards                                | No, already easy |
| E   | Turn an App Studio page into a dashboard                                                                                            | Nothing in Domo. App-only cards and layouts don't carry over.                                                                 | No, out of scope |
| F   | Move a page between collections                                                                                                     | Collections hold cards, not pages                                                                                             | N/A              |
| G   | Move a page to another instance                                                                                                     | Sandbox and content migration, which are separate products                                                                    | No, out of scope |

The plan covers **interpretation A**. It is for page owners and content admins who reorganize nav trees. Today they have to:

1. reach Admin > Dashboards, which needs an admin-area authority;
2. search for the page and tick it;
3. open Move and pick a parent from a dropdown that either ignores the depth rules (admins) or offers only top-level pages (everyone else);
4. choose a permission mode whose labels are misleading.

The toolkit does all of that from the page itself. It also shows three things Domo hides:

- the subpages move with the page;
- the permission mode changes who can see the page **and every page above its new location**;
- people who could see only a subpage can lose access to the moved page.

## Scope check

**Can a user already do this easily in Domo?** Only partly, and only from the admin area.

**Admin > Dashboards, bulk action "Move dashboard"** (bundle `admin-f0a6ba0eab00a3cb`, factory `pageActions`, key `ACTION_MOVE`, icon `icon-arrows-fourway`):

- **Reaching it is gated twice** (bundle `21226-04cf2b988d5838a0`). The `/admin/pages` route is registered only inside `ee.default.canSeeAdmin ? (...) : e.when("/admin", { title: "admin/not-authorized" })`. `canSeeAdmin` is true when the user holds any of 20 admin-area authorities: `developer.token.manage`, `developer.token.create`, `gateway.oauth.client.create`, `customer.edit`, `user.session.edit`, `user.edit`, `group.edit`, `authorization.roles`, `user.invite`, `audit`, `profile.achieve.assign`, `saasaas.edit`, `group.admin`, `ui.admin`, `tasks.admin`, `buzz.admin`, `approvalcenter.admin`, `content.admin`, `certifiedcontent.admin`, `entity.attribute.admin`. On top of that, the Pages tab shows only with `content.page.edit` or `content.admin`.
  - Whether a given owner gets in depends on role configuration. On domo.domo.com the default Editor and Participant roles both hold `gateway.oauth.client.create` (VERIFIED-LIVE, `GET /api/authorization/v1/roles/{3,4}/authorities`), so most users here can get in.
  - On an instance whose roles hold none of the 20, a page owner has **no move path in Domo at all**.
- **The modal** ("Confirm move dashboards") offers "Top level dashboard" or "Make subpage", and a required "Who should see this dashboard?" dropdown:
  - "Use permissions for this dashboard" (`ORIGINAL`)
  - "Inherit permissions from top dashboard" (`INHERIT`)
  - "Merge permissions" (`MERGE`)
  - "Remove permissions" (`OWNER_ONLY`)

  INHERIT and MERGE are disabled for a top-level move.

- **The draft got the ownership rule wrong. Move is not ownership-gated in the UI.**
  - The rule that applies is `e.disabled = e.disableForReadOnly ? r.isReadOnlySelected : !p && !!e.checkforPermission && ...`.
  - Move sets `disableForReadOnly: true`, so it is disabled only when a selected row has `subType === "container"`.
  - The owner check `r` (`ownerId !== USER_ID`) is never reached.
  - So the server alone decides who may move what.
- **The parent picker behaves differently for admins and everyone else** (`commonPageSelect`, bundle `62565-0bf011f93d8be6a0`):
  - **Content admins** get admin search (`getAllPagesForAdmin`, which is adminsummary). It lists any page and ignores `max-page-level`, so admins can pick parents the server then rejects with a bare "Bad Request".
  - **Everyone else** gets `getPagesForSearch(false, false, 1, true)`. Because its first argument is `false`, the level cap is 0, so the function keeps only **top-level** pages from the cached nav tree where `pageVisible && sharedView && pageId > 0`, `type !== 'dav'`, and `canMakeChanges()` is true. `canMakeChanges` is `content.page.edit` (or `content.admin`) and (`!locked` or owner). Non-admins therefore can never put a page at level 3 through Domo's UI, even though the server allows a leaf there.

**The dashboard has no move.**

- The page-menu i18n namespace still holds `move-page-title: "Move Page"` and `move-page-description`.
- No code in any of the 1,270 non-locale chunks references those keys.
- The admin chunk is the only caller of `/api/content/v1/pages/bulk/move`.

**Manage dashboards** (`managePagesTree`, a jQuery sortable with `axis: 'y'`) only reorders siblings, through `PUT /api/content/v1/pages/pageorder` (per user) or `/defaultpageorder` (admin). That is interpretation B, which is **cut**.

**App Studio import** (`PUT /api/content/v1/dataapps/{appId}/views/import`) already covers C and D as copies, so they are **cut**, and chaining copy and delete into "Move to App" is out too (D43.1).

What the toolkit adds for A, which Domo does not provide:

- an entry point on the page, for anyone the server lets move it, admin-area access or not;
- a destination picker that offers only legal parents, including level-2 parents for non-admins, which Domo's UI never offers;
- the subpages that move along with it;
- an access preview for each mode, covering the moved page, the new parent and the new top page;
- correct labels (Domo's "Inherit permissions from top dashboard" actually copies the **immediate** new parent's list);
- Move Back, plus a written record of the old location;
- an opt-in cleanup of the access the move leaves behind on the old parent and old top page, which Domo never offers.

**Overlap in this codebase** (all paths confirmed present):

- `src/services/pages.js`:
  - `getPageParentPageId` (`GET /content/v1/pages/{id}`, also the `pageParentPage` fetcher in `src/models/DomoObject.js:254`)
  - `getSubpageIds` (`/subpages`)
  - `getChildPages` (adminsummary, with grandchildren in batches of 10 parents, each a single `limit=100` page with no pagination)
  - `getOwnedPages` (paginated adminsummary)
  - `sharePages`
- `src/services/enrichments.js` entry `page-child-pages` fills `metadata.context.childPages`. `src/utils/pageHelpers.js` `waitForChildPages` reads it.
- `src/components/EntityPicker.jsx` is a master/detail picker, static or paginated. Its error state renders only `{error}` in red, with no retry. `src/components/pickers/accountPickerAdapter.jsx` is the only adapter.
- View templates:
  - `src/components/views/SwapAccountView.jsx` pairs a picker with one write and calls `chrome.tabs.reload`.
  - `UpdateDetailsView.jsx` is the write-then-reload template.
  - Side panel slots live in `instanceViews` in `src/sidepanel/App.jsx`, so a result screen survives a tab reload.
- `src/components/buttons/HoldToConfirmButton.jsx` and `src/components/buttons/GetChildPages.jsx` provide the hold control and the button shape (`useLaunchView` plus `preCheck`).
- `src/background.js` `computeIsOwner` sets PAGE `metadata.isOwner` from `details.page.isOwner` (the stacks response).
- The error pattern to copy is `src/services/alerts.js:861` (return `{ ok: false, error }`, with `toe` parsed out of the body).
- These don't help:
  - `Duplicate.jsx` and `duplicate.js` handle users and dataset color rules, not pages.
  - `deletePageAndAllCards` doesn't touch parents.
  - No code in `src/` calls `share/accesslist`, `share/bulk`, `bulk/move`, `pageorder` or `pages/navigation` (grep).

## API and platform findings

All calls went to domo.domo.com. Writes touched only scratch pages and groups created during this work, and all were deleted (see writesPerformed). Tags: VERIFIED-LIVE, VERIFIED-CODE, SPEC-ONLY or INFERRED. UI behavior read from Domo's bundles is cited as "bundle", and server behavior inferred from it is INFERRED.

**1. Move: `PUT /api/content/v1/pages/bulk/move`.** VERIFIED-LIVE.

```json
{ "pageIds": [961358916], "parentPageId": 773211338, "pagePermission": "ORIGINAL" }
```

- **To make a page top level, omit `parentPageId`.** Domo's UI sends `undefined`. Afterward the key is **absent** from `GET /pages/{id}`, not null (VERIFIED-LIVE).
- **`pagePermission`** is `ORIGINAL | INHERIT | MERGE | OWNER_ONLY`. Leaving it out also returns 200 and moves the page (VERIFIED-LIVE), but the toolkit always sends it.
- **Success** is `200` with an empty body.
- **Failure** is `400 {"status":400,"statusReason":"Bad Request","message":"Bad Request","toe":"81K9YG1000-FG227-45Z9E"}`, with no reason under a developer token. Domo's UI looks for `PG-MV0015` ("already a top-level dashboard") and `PG-MV0011` ("already contains a subpage") in `e.data.message`. Whether those codes appear under session auth is INFERRED.
- **Behavior seen live:**
  - The subtree moves with the page.
  - Depth is capped at 3 levels. A leaf can go under a level-2 page. A page with children under a level-2 page returns 400.
  - A top-level page sent to top level returns 400.
  - Moving a page under its own descendant returns 400.
  - A batch with one invalid page fails as a whole.
  - A subpage sent to top level with `INHERIT` returns 200.
- **The moved page lands last among its new siblings.** In the token user's nav, T's children went from `[x, y]` to `[x, y, src]` after the move, and a page moved to top level landed at the last top-level index, 231 of 232 (VERIFIED-LIVE, probe 6). Other users' saved orders are not checked (INFERRED same).
- **`PUT /content/v1/pages/{id}` is not a move path.** With a real parent ID it returns 200 and leaves the parent unset (VERIFIED-LIVE, critique probe).
- **Negative parent IDs are untested.** Whether bulk move accepts or clears a Business-in-a-Box parent (see 4) couldn't be tested without moving a pre-existing page. Not tested, so the view blocks those pages.
- **Permissions:**
  - A content admin moved their own scratch pages (VERIFIED-LIVE).
  - The server rule for non-admins is INFERRED to match Domo's `canMakeChanges`: `content.page.edit` and (unlocked or owner) on the moved page and the destination. It needs a non-admin token to confirm.

**2. What `pagePermission` does.** VERIFIED-LIVE unless marked otherwise. Each probe shared a memberless scratch group to each page.

| Mode         | Moved page S after the move                                                                    | Destination D        | D's top page (level-2 destination)                                                 | Old ancestors     |
| ------------ | ---------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------------------------- | ----------------- |
| `ORIGINAL`   | unchanged                                                                                      | gains S minus D      | **gains S minus top** (critique probe: TT went from `[rv-gt]` to `[rv-gs, rv-gt]`) | keep S's audience |
| `MERGE`      | S union D                                                                                      | gains S minus D      | gains S minus top (INFERRED, same propagation)                                     | keep S's audience |
| `INHERIT`    | **replaced by D's whole list**, which includes audiences propagated up from D's other subpages | unchanged            | unchanged                                                                          | keep S's audience |
| `OWNER_ONLY` | owners only                                                                                    | unchanged (INFERRED) | unchanged (INFERRED)                                                               | keep S's audience |

Supporting facts:

- **INHERIT copies the immediate parent's list, not the top page's.** In probe 4, S under level-2 page M got `[gb]`, not TT's `[ga, gb]`.
- **INHERIT pulls in audiences from D's other subpages.** In probe 6, T was `[gt, gx]`, where gx came up from T's child X. After S moved under T with INHERIT, S was `[gt, gx]`: it gained gx and lost its own gs. T stayed `[gt, gx]`.
- **INHERIT strips subpage-only audiences from the moved page.** P `[rv-gc, rv-gs]` became `[rv-gs, rv-gt]`, while its child C kept `[rv-gc]` (critique probe). People who could see only C can still see C but no longer P. OWNER_ONLY should do the same by definition (INFERRED).
- **Subpages keep their own lists in every mode.**
- **Sharing a subpage adds its audience to every ancestor's list, and moving it away removes nothing.** So the old parent and old top page keep the moved page's audience.
- **Move Back doesn't restore access.** After the INHERIT move, moving S back to top level with ORIGINAL left S at `[gt, gx]` (probe 6).
- **What propagated access lets people do is INFERRED.** Whether it also shows the ancestor in those people's navigation is uncertain. `sharePages` in `src/services/pages.js` notes that a share alone leaves a page hidden from the recipient's nav until it is marked visible. So "gets access" is the safe wording, not "appears in their nav".

**3. Read a page: `GET /api/content/v1/pages/{id}`.** VERIFIED-LIVE, and VERIFIED-CODE in `getPageParentPageId`.

```json
{
  "pageId": 2102826799,
  "parentPageId": 710730161,
  "owners": [{ "id": 484942694, "type": "USER", "displayName": "Tsuyoshi Fujii" }],
  "type": "page",
  "title": "[JP] Man-Hour Tracking",
  "locked": false,
  "sharedViewPage": true,
  "virtualPage": false,
  "isOwner": false,
  "customPermission": false
}
```

- `parentPageId` is absent on a top-level page.
- `isOwner` is top level here.
- It returned 200 for a page the token user can't open (`pageAccess: false`).

**4. `virtualPage` and Business-in-a-Box (BIB).** VERIFIED-LIVE. **`virtualPage: true` does not mean a Domo Everywhere subscriber page**, so the draft's claim is dropped.

- Of the 16 extra unique rows that `includeVirtual: true` adds to adminsummary, 7 are system or BIB folders (`-100001` Alerts, `-100002` Shared, `-100003` Favorites, `-100012`, `-100015`, `-100016`, `-100017`).
- The other 9 are personal positive-ID pages with `sharedViewPage: false`, for example `214595718` "Adam Favorites", `410252202` "Home" and `856901931` "Copy of Favorites". All return `virtualPage: true` from `GET /pages/{id}`.
- BIB folders (`-100006` "Business-in-a-Box", `-100018` to `-100025`) are `virtualPage: true` in the nav tree.
- Real pages sit under them with **negative parents**. `659772072` "SaaS CEO" has `parentPageId: -100018` and `virtualPage: false`, and adminsummary gives it `parentPageTitle: "SaaS CEO"` (wrong; the folder is "CEO"), `topPageId: -100006` and `topPageTitle: "Start"`. There are 20 such pages on this instance.

**5. Admin destination search: `POST /api/content/v1/pages/adminsummary?limit=50&skip=0`.** VERIFIED-LIVE, and VERIFIED-CODE in `getChildPages` and `getOwnedPages`.

```json
{
  "includePageTitleClause": true,
  "pageTitleSearchText": "Japan Support",
  "orderBy": "parentPageTitlePageTitle",
  "ascending": true,
  "includeDataAppViews": false,
  "includeVirtual": false
}
```

- **Response:** `{ pageAdminSummaries: [{ pageId, pageTitle, pageType, subType, parentPageId, parentPageTitle, topPageId, topPageTitle, owners, locked, cardCount, ... }], totalPageCount, nextOffset }`.
- **Level** is `topPageId ? 3 : parentPageId ? 2 : 1`. This held for all 6,682 rows: 3,422 level 1, 2,427 level 2, 833 level 3, with zero violations.
- **Limits:** `limit` above 100 returns 400.
- **`orderBy`** accepts only `pageTitle`, `parentPageTitlePageTitle`, `parentPageTitle`, `lastModified`, `cardCount` and `ownerName` of those probed; anything else (`pageId`, `id`, `created`, `pageType`, ...) returns a bare 400. Ties are broken by `pageId` ascending, so `parentPageTitle` with one parent yields pure `pageId` order (VERIFIED-LIVE on `942894016`). `getChildPages` uses that for stable pagination.
- **Pagination works with `parentPageIds`.** `limit=10&skip=30` on `[2042050119]` returned the last 6 of `totalPageCount: 36`.
- **Non-admin results are INFERRED.** Domo's UI never sends this search for non-admins.

**6. Non-admin destination source: `GET /api/content/v2/pages/navigation?includeStartPage=true&elevateSharedPage=true`.** VERIFIED-LIVE. This is the tree Domo's non-admin page select reads.

- It returned 231 top-level nodes and 542 in all.
- Each node carries `id`, `title`, `type`, `locked`, `sharedView`, `pageVisible`, `virtualPage`, `owners`, `isOwner`, `childCount`, `hasAccess`, `hierarchy` (0 to 2, so level = `hierarchy + 1`) and `children`.

```json
{ "id": "647407590", "title": "MajorDomo", "type": "page", "locked": true, "sharedView": true, "pageVisible": true,
  "owners": [{ "id": 1813188617, "type": "USER", "displayName": "Bryce Cindrich" }], "isOwner": true,
  "childCount": 2, "hasAccess": true, "hierarchy": 0, "children": [ ... ] }
```

- `children` holds only pages in the caller's nav, while `childCount` is the true total: `2042050119` has `childCount: 36` and `children: []` for the token user.
- Called from Node's `fetch` it returned 400. curl returned 200. The extension calls it with `fetch` from inside the Domo tab, as Domo does, so this only matters for probe scripts.

**7. Subtree.**

- **`GET /api/content/v1/pages/{id}/subpages` returns direct children only, complete.** All 36 for `2042050119` (VERIFIED-LIVE). The `getSubpageIds` JSDoc says "child and grandchild", which is wrong.
- **`getChildPages` truncates at 100 rows per request** (VERIFIED-CODE). Page `942894016` has 107 children on this instance (VERIFIED-LIVE), so Get Child Pages already drops 7 of them today. Paginating with `totalPageCount` fixes both Get Child Pages and the height check.

**8. Access lists: `GET /api/content/v1/share/accesslist/page/{id}?expandUsers=false`.** VERIFIED-LIVE, not yet used in `src/`.

- Response: `{ users: [{ id, displayName, ... }], groups: [{ id, name, userIds, ... }], resource: { id: "2042050119", type: "page" }, totalUserCount: 23 }` (17 user entries and 4 groups for that page).
- The list includes owners and audiences propagated up from subpages, and doesn't mark which entries came from where.
- Non-admin access to it is INFERRED.

**9. Ownership signals.**

- **`GET /api/content/v3/stacks/{id}`** returns `page.isOwner`, which was `true` on owned page `647407590` (VERIFIED-LIVE). The toolkit already reads it (VERIFIED-CODE).
- **The 404 the critique saw from stacks happens on pages the caller can't open.** `2102826799` returned 404 there, and `GET /pages/{id}/access` reported `pageAccess: false`. Owners always have access, so an owner never hits that fallback.
- **`GET /api/content/v1/pages/{id}/access`** returns `{ pageId, ownerId, pageName, owners, pageAccess }` (VERIFIED-LIVE). It is the PAGE detection fallback in `src/models/DomoObjectType.js:1366`, and it has no `isOwner`.

**10. Revoking access: `DELETE /api/content/v1/share/bulk/page/user/{userId}?resourceIds={id,id}` and `.../group/{groupId}?resourceIds=...`.** These are what Domo's admin "Remove access" calls (bundle, function `v` in `pageActions`). INFERRED and not exercised. The access cleanup (D43.4) depends on it, so implementation step 0 probes it on scratch pages before any UI work. The probe has to settle:

- that it removes the principal from exactly the pages in `resourceIds` and returns a success code (and which one);
- whether removing access from a parent also removes it from that parent's subpages, which would make the cleanup reach pages the user did not pick;
- whether access the principal still gets through a remaining subpage is re-added to the parent by propagation;
- what a principal that is an owner of the page, or that has no access there, returns;
- whether a non-admin owner with `content.page.edit` may call it (INFERRED until a non-admin token is available).

**11. Authorities.** VERIFIED-LIVE, from dataset `073c76f1-c846-48fd-876c-34d98d89a07b`, plus bundle.

- `content.admin`: "Manage all Cards, Pages, Apps...".
- `content.page.edit`: "Edit Pages". Domo's `canManagePages` is `["content.page.edit", "content.admin"]`, and its `canUpdateOwnership` is owner plus `canManagePages`, or content admin.
- There is no dedicated move authority.

**Side finding, for the delete flow:** `DELETE /api/content/v1/pages/{id}` cascades to subpages (VERIFIED-LIVE).

## Design

**Where it lives:**

- A **Move Page** button in `ActionButtons`, gated by a new `movePage` key in `getAvailableActions`.
- It launches the side panel view `movePage` from the popup or the side panel.
- No content script work and no options page.

**Enabled when** all of these hold:

- `typeId === 'PAGE'`.
- `Number(id) > 0`, the same check as the existing `getWorkspaces` and `migrateDownstreamContent` gates.
- `userRights.includes('content.admin')`, or `userRights.includes('content.page.edit')` and (`metadata.isOwner === true` or the page is unlocked) (D43.2). The second half is Domo's own `canMakeChanges`, which its non-admin page picker applies. The lock state is the stacks `page.locked` flag the context already carries next to `page.isOwner`.

When `isOwner` is `null` or the lock state is unknown, the non-admin half is false and the button stays hidden for non-admins. That only happens when no user is hydrated yet or the caller can't open the page (stacks 404s, see API 9), and neither case is someone who can edit it.

The server rule for a non-owner on an unlocked page is unverified (API 1). Domo's admin Move doesn't check ownership in the UI, so the server is the only judge, and a refusal shows the 403 copy.

DATA_APP_VIEW, WORKSHEET_VIEW and REPORT_BUILDER_PAGE never get the action. No feature-switch gating is needed.

**The view refuses two kinds of page with an inline alert:**

- `virtualPage: true` (system, BIB folder and personal pages);
- `parentPageId < 0` (pages inside a Business-in-a-Box folder, blocked in v1 per D43.5).

**Data flow.** Every API call runs through `executeInPage()` in the Domo tab (session auth).

1. **Button `preCheck`.** `waitForChildPages(currentContext)` gives `subtreeHeight`. A top-level page with grandchildren can't move anywhere, so it returns an `{ empty: true }` toast instead of opening the view.
2. **View mount**, in parallel:
   - `getPageForMove(pageId)` for the parent ID, owners, `virtualPage`, title and `isOwner`;
   - `getPageAccessList(pageId)`;
   - the breadcrumb: `getPageForMove(parentId)`, and its parent when present, giving real titles (adminsummary's BIB titles are wrong, see API 4);
   - the subtree from context.
3. **Destination source.**
   - Content admins get a paginated adminsummary search.
   - Everyone else gets a static list built once from `GET /content/v2/pages/navigation`, flattened and filtered with Domo's own rule: `pageVisible && sharedView && id > 0 && type === 'page' && !virtualPage && hasAccess && (isOwner || !locked)`. Levels come from `hierarchy + 1`.
   - In either mode, a query of only digits also looks the page up by ID through `getPageForMove`.
4. **Picking a row** loads `getPageAccessList` for the destination and, for a level-2 destination, its top page. The top page's ID is the row's `parentPageId`. Results are cached per page ID in a `Map`.
5. **Move.**
   - Call `movePage(...)`. It returns an envelope and never throws.
   - Check with `GET /pages/{id}` that `String(parentPageId ?? '') === String(targetId ?? '')`, where absent means top level. A 200 without the change counts as a failure.
   - Refetch the page's access list for the result screen.
   - Call `chrome.tabs.reload(tabId)`.
6. **Move Back** repeats the call with the original parent (or none) and `ORIGINAL`.
7. **Access cleanup** (D43.4), offered on the result screen after a successful move when the page left at least one ancestor (the old parent, and the old top page when the page was at level 3). An ancestor the page still sits under is not offered.
   - Load, in parallel: each old ancestor's access list and owners (`getPageAccessList`, `getPageForMove`), its remaining subpages (`getSubpageIds` for the old parent; `getChildPages` for the old top page, which includes grandchildren), and those subpages' access lists in a pool of 4. Past 25 remaining subpages, skip the per-subpage lists and say so.
   - Build the candidates with `cleanupCandidates`: every user and group that was on the moved page before the move (`S`, loaded at mount) and is on the old ancestor now, minus that ancestor's owners and the signed-in user. A candidate also on one of the ancestor's remaining subpages is marked with that subpage, since it may have reached the ancestor from there.
   - Nothing is preselected. The list can't tell a deliberate share on the ancestor from one propagated by the moved page.
   - On a hold, group the selected (ancestor, principal) pairs by principal and send one `revokePageAccess({ principal, pageIds })` per principal, in a pool of 3 (`promisePool` from #9). Each returns an envelope like `movePage`.
   - Afterwards, refetch the old ancestors' access lists and show the result per row. Move Back does not restore revoked access, and its tooltip says so once a cleanup has run.

**Error envelope (fixes the draft).** `executeInPage` carries back only `{ message, name, status }` (`src/utils/executeInPage.js:226-240`), so a thrown `toe` never arrives. On origins that block eval, a throw even reads as `null`. `movePage` therefore returns `{ ok: true }` or `{ ok: false, status, toe, message }`, built inside the injected function as in `alerts.js:861`. The read helpers keep the codebase's throw-with-status style.

**New pure helpers (`src/utils/pageMove.js`):**

- `pageLevel(row)`: `topPageId ? 3 : parentPageId ? 2 : 1` for adminsummary rows, `hierarchy + 1` for nav nodes.
- `subtreeHeight(pageId, childPages)`: 1, 2 or 3.
- `destinationVerdict(dest, { height, blockedIds, currentParentId })` returns `{ ok }` or `{ ok: false, reason }`, where `reason` is one of:
  - `self`: the page itself or one of its descendants;
  - `current`: the current parent;
  - `tooDeep`: `level + height > 3`;
  - `notPage`;
  - `special`: a negative ID, `virtualPage`, or a negative parent or top page.
- `PERMISSION_MODES`: an ordered array of `{ key, label, describe(names), availableAtTop }`.
- `previewAccess(mode, { source, ancestors, owners })`. `ancestors` is `[{ id, title, list }]` for D, plus the top page when D is level 2. It returns `{ pageAfter, gains, losses, ancestorGains: [{ id, title, added }], subpageOnlyWarning }`. Entries are keyed `user:<id>` and `group:<id>`.
  - **Keep:** `pageAfter = S`, and each ancestor A gains `S minus A`.
  - **Combine:** `pageAfter = S union D`, `gains = D minus S`, and each ancestor gains `S minus A`.
  - **Use parent's access:** `pageAfter = D`, `gains = D minus S`, `losses = S minus D minus owners`, no ancestor gains, and `subpageOnlyWarning` set.
  - **Owners only:** `pageAfter = owners`, `losses = S minus owners`, and `subpageOnlyWarning` set.
  - **Top-level target:** no ancestors. Keep changes nothing, and Owners only is the other option.
- `needsHold(preview, { listsMissing })` (D43.3): true when `gains`, `losses`, or any `ancestorGains[].added` is non-empty, or a needed access list failed to load.
- `cleanupCandidates({ before, ancestors, selfId })`. `ancestors` is `[{ id, title, list, owners, subpageLists: [{ id, title, list }] | null }]`. It returns `[{ ancestorId, ancestorTitle, key, principal: { id, name, type }, alsoOn: [{ id, title }] | null }]`, where `alsoOn: null` means the subpages weren't checked.
- `mapMoveError(envelope)`: maps status, `PG-MV` codes and `toe` to copy. It also maps a revoke envelope.

**State shape (MovePageView):**

```js
{
  page: { id, title, parentId, path: [{ id, title }], owners, height, subpages: [{ id, title, parentPageId }], blocked: null | 'special' | 'bib' },
  accessByPage: Map<pageId, { status: 'loading' | 'loaded' | 'error', users, groups }>,
  target: null | { kind: 'top' } | { kind: 'page', id, title, path, level, topId },
  mode: null | 'ORIGINAL' | 'INHERIT' | 'MERGE' | 'OWNER_ONLY',   // null until the user picks one (D43.6)
  screen: 'form' | 'picker' | 'result',
  run: null | { status: 'running' | 'done' | 'failed', error, previous: { parentId, path }, accessAfter },
  cleanup: null | {
    status: 'loading' | 'ready' | 'running' | 'done' | 'error',
    candidates: Candidate[],               // from cleanupCandidates
    selected: Set<string>,                 // `${ancestorId}:${type}:${principalId}`
    results: Map<string, { ok, error }>
  }
}
```

`mode` starts `null` and nothing in the access group is selected (D43.6). A change of destination keeps the chosen mode when it is still available there, and resets it to `null` when it is not (Use parent's access and Combine both don't exist for a top-level target).

**Concurrency and failure handling:**

- Each move is one write, and submit is disabled while it runs.
- The cleanup is one revoke per principal, in a pool of 3. Until 1.6 lands, its Back and Move Back are disabled while it runs; after, the view calls `useRunLock(isCleaning, 'Move Page')`. A failed revoke marks its rows and the rest continue.
- The picker's `detailGenRef` and `searchGenRef` guards already drop stale responses.
- **An access-list failure** never blocks the move. Its preview line shows the error with Retry. While any needed list is missing, the submit control requires the hold.
- **A 400 that gets past pre-validation** shows the mapped `PG-MV` copy, or else a generic message with `toe`.
- **A 401 or 403** maps to the permission copy.
- **The result screen survives the tab reload**, because the slot lives in `instanceViews`. It is lost only when the panel closes.

## UX

**Entry point:**

- **Move Page** (icon `src/assets/icons/folder-move.svg`), placed after **Update Details** in the mutating half of the grid.
- Tooltip: "Move this page and its subpages under another page, or make it a top-level page".

**Flow:**

1. Press Move Page. The view opens with a Beta chip.
2. The view shows the current location and the subpages that move with the page.
3. Pick **New location**: "Make it a top-level page", or "Put it under another page" then **Choose Page**.
4. Pick **Access**. No option is preselected (D43.6), and each shows a live preview.
5. Hold **Hold to Move Page** when anyone gains or loses access anywhere, or a needed list failed to load (D43.3); otherwise press **Move Page**.
6. The result screen shows the new location, the access that resulted, the old location in writing, **Move Back** and **Open Parent Page**.
7. When the page left an old parent or old top page, the result screen also offers **Clean Up Old Access**: an unselected checklist of the people and groups that could see the page and are still on those old ancestors (D43.4).

**Main screen, with a level-2 destination** (before an access option is picked):

```
+--------------------------------------------+
| [folder] Move  Q3 Pipeline            [x]  |
|          Beta  ID: 1234567890              |
|--------------------------------------------|
| Current location                           |
|   Sales > Q3 Pipeline                      |
|   Moves with it: 2 subpages            [v] |
|                                            |
| New location                               |
|   ( ) Make it a top-level page             |
|   (o) Put it under another page            |
|       Marketing > Campaigns     [Change]   |
|                                            |
| Access          Choose who can see it      |
|   ( ) Keep its current access              |
|       12 users and 3 groups keep access.   |
|       Also gets access: Campaigns (5 users |
|       and 1 group), Marketing (3 users).   |
|   ( ) Use Campaigns' access                |
|       7 users and 2 groups lose access.    |
|       4 users and 1 group gain access.     |
|   ( ) Combine both                         |
|       4 users and 1 group gain access.     |
|       Also gets access: Campaigns, Marketing|
|   ( ) Owners only                          |
|       11 users and 3 groups lose access.   |
|                                            |
| [            Move Page (disabled)        ] |
+--------------------------------------------+
```

Once an option is picked, the footer becomes **Hold to Move Page** whenever its preview shows a gain or loss anywhere, which under a parent is nearly every option.

**Result screen, with the cleanup checklist:**

```
+--------------------------------------------+
| Moved Q3 Pipeline under Campaigns          |
| Now at: Marketing > Campaigns > Q3 Pipeline|
| Was at: Sales > Q3 Pipeline                |
| [ Move Back ]   [ Open Parent Page ]       |
|--------------------------------------------|
| Clean Up Old Access                        |
| These could see Q3 Pipeline and still have |
| access to Sales. Domo can't tell which were|
| shared there on purpose, so none are       |
| selected.                                  |
|  Sales                                     |
|   [ ] Pat Lee                              |
|   [ ] Regional Managers (group)            |
|   [ ] Sam Ortiz     [Also through Q4 Plan] |
|                                            |
| [      Hold to Remove Access (disabled)  ] |
+--------------------------------------------+
```

**Picker** ("Choose Parent Page"):

```
+--------------------------------------------+
| <  Choose Parent Page                      |
| [ Search pages by name or ID...         ]  |
|--------------------------------------------|
| Campaigns                         Level 2  |
|   Marketing > Campaigns                    |
| Campaign Ops            Too deep  Level 3  |
|   Marketing > Campaigns > Ops              |
| Sales                   Current   Level 1  |
+--------------------------------------------+
```

- The page and its subpages are hidden (`excludeIds`).
- The current parent, too-deep pages and special pages render muted with a chip, through `renderRow`.
- Their detail panel shows the reason in place of Select, through the view's `renderDetailActions`.

**Every state, with exact copy:**

- **Loading:** a skeleton for the location block, and "Loading access..." on each preview line.
- **Pre-check dead end** (toast): title "Can't Move This Page", body "This page is already top level, and its two levels of subpages mean it can't go under another page."
- **Special page:** "This is a system or personal page, so it can't be moved." The submit button is hidden.
- **Business-in-a-Box page:** "This page sits in a Business-in-a-Box folder, so it can't be moved here." The submit button is hidden.
- **No subpages:** the "Moves with it" line is left out.
- **Has grandchildren:** "Put it under another page" is disabled, with "This page has two levels of subpages, so it can only be a top-level page."
- **Has children only:** the note under the picker title reads "This page has subpages, so it can only go under a top-level page."
- **Picker empty:** "No pages match your search". In non-admin mode, add: "Only pages you can edit are listed."
- **Picker error:** "Couldn't search pages", with a **Retry** button. This needs the EntityPicker change.
- **Detail reasons:**
  - `current`: "This is already the page's parent."
  - `tooDeep`, level-3 destination: "Level-3 pages can't have subpages."
  - `tooDeep`, otherwise: "This page has subpages, so it can only go under a top-level page."
  - `special`: "System, personal and Business-in-a-Box pages can't hold moved pages."
- **Access options** (label, then the description under it):
  - **Keep its current access**: "Keeps who can see this page. Everyone who can see it also gets access to {Ancestors}." `{Ancestors}` is "Campaigns" or "Campaigns and Marketing".
  - **Use {Parent}'s access**: "Replaces who can see this page with everyone who can see {Parent}." Page destinations only.
  - **Combine both**: "Adds {Parent}'s access to this page, and gives everyone who can see this page access to {Ancestors}." Page destinations only.
  - **Owners only**: "Removes everyone except the page's owners."
- **Under Use {Parent}'s access and Owners only:** "People who can see only its subpages keep those subpages but lose access to {Page}."
- **Under all options:** "Subpages keep their own access."
- **Preview error:** "Couldn't load access for {Page}", with Retry.
- **Submit:**
  - No destination: disabled, with the tooltip "Choose where to move this page".
  - No access option yet: disabled, with the tooltip "Choose who can see this page".
  - When `needsHold` is true (D43.3): `HoldToConfirmButton` (`HOLD_DURATION_FULL`, 5 s), labeled "Hold to Move Page".
  - Otherwise: a primary "Move Page".
- **Running:** "Moving {Page}..."
- **Success:**
  - Status bar: "Moved {Page} under {Parent}" or "Made {Page} a top-level page".
  - Result screen: "Now at: Marketing > Campaigns > Q3 Pipeline", "Access now: 12 users and 4 groups", and "Was at: Sales > Q3 Pipeline", with each crumb linked.
  - **Move Back** tooltip: "Move it back under {Old Parent}. Access changes aren't undone." When the page started top level: "Make it top level again. Access changes aren't undone." After a cleanup: "Move it back under {Old Parent}. Access changes, including removed access, aren't undone."
  - **Open Parent Page**.
- **Clean Up Old Access** (D43.4), on the result screen only when the page left an ancestor:
  - Heading **Clean Up Old Access**, then "These could see {Page} and still have access to {Old Ancestors}. Domo can't tell which were shared there on purpose, so none are selected."
  - Rows grouped by ancestor, labeled with the user's or group's name ("Regional Managers (group)"). Chip **Also through {Subpage}** with tooltip "Also has access to {Subpage}, which is still under {Ancestor}, so it may have reached {Ancestor} from there." When the subpages weren't checked: note "{Ancestor} has more than 25 subpages, so they weren't checked."
  - Loading: "Checking who still has access..." Load error: "Couldn't load access for {Ancestor}", with Retry.
  - Nobody to clean up: "Nobody from {Page} is left on {Old Ancestors}." and no button.
  - Button: `HoldToConfirmButton` (`HOLD_DURATION_FULL`) "Hold to Remove Access", disabled until a row is selected. Running: "Removing access 3 of 7..."
  - Success toast "Access Removed" / "Removed **7** people and groups from **Sales** and **Sales Home**."
  - Partial: "Some Access Not Removed" / "Removed **5**, **2** failed." Failed rows keep their checkbox and show the reason. Full failure: "Access Not Removed" / "{reason}"
  - 401/403 on a revoke: "You don't have permission to change who can see {Ancestor}."
- **Verify mismatch:** "Domo accepted the move but the page didn't change location. Try again, or move it from Admin > Dashboards."
- **400:**
  - `PG-MV0015`: "{Page} is already a top-level page."
  - `PG-MV0011`: "{Page} has subpages, so it can't go that deep."
  - Otherwise: "Domo rejected the move (Domo trace {toe})."
- **401/403:** "You don't have permission to move this page, or to add subpages to {Parent}."
- **Partial failure** can't happen: one request moves one subtree atomically.

## Implementation plan

0. **Revoke probe, before any UI work (D43.4).** On scratch pages and memberless scratch groups (named `domo-toolkit-probe-43-revoke-*`, deleted afterward): build a top page T with child P and grandchild C, share a scratch group to C (it propagates to P and T), share a second group directly to P, then call `DELETE /api/content/v1/share/bulk/page/group/{id}?resourceIds={P},{T}`. Record the status and body, whether C kept the group, whether the propagated entry came back on P or T, the response for a group with no access, and the response for an owner. If revoking from a parent also strips its subpages, the cleanup is limited to principals with no access on any remaining subpage, and the "Also through" rows become disabled.
1. **`src/services/pages.js`**
   - `getPageForMove({ pageId, tabId })` returns `{ id, title, parentId, owners, isOwner, virtualPage, locked }`.
   - `getPageAccessList({ pageId, tabId })` returns `{ users: [{ id, displayName }], groups: [{ id, name }], totalUserCount }`.
   - `searchPagesForMove({ query, offset, tabId })`: adminsummary with the body from API 5, `limit=50`, mapped to rows and returned as `{ items, totalCount: totalPageCount }`.
   - `getEditableNavPages({ tabId })`: the navigation tree, flattened and filtered as in Design step 3.
   - `movePage({ pageId, parentPageId, pagePermission, tabId })` returns the envelope.
   - `revokePageAccess({ pageIds, principal: { id, type }, tabId })`: one `DELETE /api/content/v1/share/bulk/page/{user|group}/{id}?resourceIds={csv}`, returning the same envelope shape as `movePage`.
   - The `getChildPages` pagination and the `getSubpageIds` JSDoc fix are done (pre-existing bug 3).
2. **`src/utils/pageMove.js`** (new): the pure helpers from the Design section, including `needsHold` and `cleanupCandidates`.
3. **`src/components/EntityPicker.jsx`**
   - Add a `retryNonce` state to the paginated search effect's dependencies.
   - Render a Retry button under the error text.
   - Document it in the JSDoc.
   - Account Swap gets the Retry too, which is harmless.
4. **`src/components/pickers/pagePickerAdapter.jsx`** (new):
   - `createPagePickerAdapter({ source: 'admin' | 'nav', navItems, verdict, baseUrl })`, following `accountPickerAdapter.jsx`.
   - Admin is `paginated: true`. Nav is static, with a `matchesQuery` on the title path and the ID.
   - `renderRow` shows the breadcrumb, a level chip and a reason chip. `renderDetail` shows the path, owners and card count. `getHref` points at `/page/{id}`.
5. **`src/components/views/MovePageView.jsx`** (new):
   - Follows `SwapAccountView`: `ViewHeader` with `beta`, `useViewReady`, `getSidepanelData`, `buildReloadAction`.
   - Reuses `EntityPicker`, `HoldToConfirmButton`, HeroUI `RadioGroup` (no initial value), `useStatusBar().showPromiseStatus` and `waitForChildPages`.
   - Reloads like `UpdateDetailsView`.
   - The result screen's Clean Up Old Access section: HeroUI `CheckboxGroup` rows grouped by ancestor, `Chip` for "Also through", the hold button, and the revoke run through `promisePool` (concurrency 3).
6. **`src/components/buttons/MovePage.jsx`** (new): the `GetChildPages.jsx` shape, with `type: 'movePage'`.
7. **`src/utils/availableActions.js`**: add the gate from the Design section next to the `updateDetails` blocks.
8. **`src/components/ActionButtons.jsx`**: render `MovePage` right after `UpdateDetails`.
9. **`src/sidepanel/App.jsx`**: add a `slot.type === 'movePage'` branch with the same props as `swapAccount`.
10. **Lint:** `npx eslint --no-warn-ignored` on every touched file.
11. **`docs/plans/beta-phase-1-6-run-lock.md`**: add `MovePageView.jsx` / `isCleaning` to "Which views lock".
12. **`docs/RELEASE_NOTES.md`**: the feature bullets below, under "New Features and Improvements". The child-page fix is already logged.
13. **Optional:** one line in `STORE_LISTING.txt`, staying under the 10,000-character cap.

**Shared work:**

- `pagePickerAdapter`, `getPageAccessList`, `revokePageAccess` and the EntityPicker Retry are generic.
- `promisePool` comes from #9 for the cleanup run.
- Move Page does not journal at first (DX.4). Move Back and the cleanup's revokes are the hook points if that is revisited after 1.3 ships.

## Edge cases and risks

- **Access widening is the main risk.** Keep and Combine add the page's audience to the new parent **and** its top page. Moving a broadly shared page under a sensitive section opens the parent and the top page to those people (VERIFIED-LIVE for ORIGINAL; whether they can also see the cards is INFERRED). The preview names every ancestor and counts what it gains.
- **Stale access on old ancestors.** Domo leaves the audience on the old parent and the old top page. The access list doesn't mark where entries came from, so the cleanup checklist starts empty and marks entries that may have come from another subpage (D43.4).
- **The cleanup can revoke a deliberate share.** Someone shared on the old parent on purpose looks the same as a propagated entry. Mitigations: nothing preselected, owners and the user excluded, the "Also through" chip, and a 5 s hold. Revoked access is not restored by Move Back.
- **Revoke semantics are unverified until step 0.** If revoking from a parent cascades to its subpages, or propagation re-adds the entry, the checklist rules change as step 0 says.
- **Non-owners on unlocked pages** (D43.2) see the button. If the server turns out to require ownership, they get the 403 copy on submit; the non-admin test settles it.
- **Preview accuracy.**
  - The preview uses verified rules on current lists. Ancestor gains under MERGE, and OWNER_ONLY's side effects, are INFERRED.
  - Counts are of entries, so a user who is also in a listed group counts in both.
  - The result screen shows the refetched list, so the user sees what actually happened.
- **The height check can come out low for non-admins.**
  - If adminsummary omits subpages a non-admin can't see (INFERRED), the client lets through a move the server rejects with a bare 400. The generic copy covers it.
  - `/subpages` is complete, so it serves as a cross-check that children exist.
- **Error opacity.** Pre-validation covers every rejection seen live, and anything else shows the `toe`.
- **Silent 200.** The follow-up GET catches it.
- **Nav position.** The page lands last among its new siblings in the caller's nav (VERIFIED-LIVE). Reordering stays in Domo's Manage dashboards.
- **Group-owned pages.** Whether `page.isOwner` is true for members of an owning group is INFERRED. A content admin can still move those pages.
- **Locked pages.** Locked destinations are excluded for non-owners in nav mode, matching `canMakeChanges`. Locking the moved page itself doesn't block a move (INFERRED).
- **Concurrent edits.** The GET check catches a move someone else made, and the result screen survives the reload.
- **Move Back and the cleanup are lost when the panel closes.** The "Was at" text and links remain until then, and after that the user moves the page back, or removes access, by hand.

## Testing and verification

**Where:** there is no `/dev-*` route for this. Use the CRXJS dev extension (`yarn dev`), then:

- `node scripts/ext-shot.js sidepanel --live` with a page open in the debug Edge profile;
- `node scripts/ext-shot.js popup --live` to check that the button renders after Update Details.

**Live matrix**, on scratch pages and memberless scratch groups (delete them afterward):

1. A leaf moves to top level. Only Keep and Owners only show, and Current Context loses the parent after the reload.
2. A top-level leaf moves under a level-1 page in each of the four modes. Compare the result screen and the preview with `accesslist` for the page and the destination.
3. **A level-2 destination with Keep.** The preview names both the parent and the top page, and both gain the page's audience.
4. **A source whose subpage has its own audience, under Use parent's access.** The warning shows, the page loses the subpage-only group, and the subpage keeps it.
5. **A destination with another shared subpage, under Use parent's access.** The preview counts the gain, and the page ends up with the sibling's group.
6. A page with children: level-2 rows show "Too deep", and a move under a level-1 page keeps the children.
7. A page with grandchildren: "Put it under another page" is disabled, and at top level the toast appears.
8. Picker: the page's own subpages are hidden, the current parent shows Current, an ID search works, and Retry works after cutting the network in DevTools.
9. Move Back restores the parent, and the "Was at" text matches the old location.
10. A virtual page and a BIB page (read-only, for example `659772072`) show the blocked alerts.
11. As a non-admin with `content.page.edit`: on a page they own, the button shows, the nav-mode picker lists level-1 and level-2 pages they can edit, and the move works. On an unlocked page they don't own, the button shows; record whether the server accepts the move or returns the 403 copy. On a locked page they don't own, the button is hidden. This needs a non-admin user.
12. Under session auth, record whether a 400 carries `PG-MV0011` or `PG-MV0015`.
13. The view opens with no access option selected and submit disabled; a move with no gains or losses (a top-level page under Keep) is a plain press, and any gain or loss turns it into the hold.
14. **Cleanup.** Move a page shared to a scratch group out from under a parent and top page. The checklist lists the group under both ancestors, unselected; a group also shared to a sibling subpage carries "Also through". Remove one row with the hold: the group leaves only that ancestor, the moved page and the siblings keep their access, and the refetched lists match.
15. Cleanup as a non-admin owner: record whether the revoke succeeds or shows the permission copy.

Run ESLint on every touched file.

## Design decisions made

- **Use `PUT /content/v1/pages/bulk/move`.** The page PUT ignores `parentPageId`, even with a real ID (VERIFIED-LIVE), and bulk move is what Domo calls (bundle).
- **Check depth, cycles and top-to-top on the client.** All three come back as a bare 400 (VERIFIED-LIVE).
- **Depth rule `level + height <= 3`.** Set by the leaf-under-level-2 and child-under-level-2 probes (VERIFIED-LIVE). The level formula held for all 6,682 rows.
- **Two destination sources.**
  - Admins get adminsummary, the same as Domo's admin select.
  - Everyone else gets the navigation tree with Domo's own `canMakeChanges` filter. Domo's non-admin picker reads that tree (bundle), it carries `isOwner`, `locked`, `hierarchy` and `childCount` (VERIFIED-LIVE), and adminsummary for non-admins is unverified.
  - Unlike Domo, the toolkit offers level-2 parents to non-admins. The server accepts a leaf at level 3 (VERIFIED-LIVE as admin; INFERRED for non-admins).
- **Label INHERIT "Use {Parent}'s access", and say it can add people.** It copies the immediate parent's whole list, including sibling-propagated entries (VERIFIED-LIVE, probe 6).
- **The preview covers every ancestor of the destination.** The top page gains under ORIGINAL (VERIFIED-LIVE).
- **Return an envelope from `movePage`.** `executeInPage` drops every error field except message, name and status (VERIFIED-CODE).
- **Gate the button on `content.admin`, or `content.page.edit` with ownership or an unlocked page** (D43.2). This is Domo's own `canMakeChanges` plus content admins. The draft's isOwner-fallback fetch stays dropped: `isOwner` is null only for callers who can't open the page (VERIFIED-LIVE: stacks 404 with `pageAccess: false`).
- **Hold whenever access changes anywhere** (D43.3), through `needsHold`. Widening a parent and its top page is the main risk, and holding only on losses would leave it at one press.
- **No preselected access option** (D43.6). Every option changes someone's access under a parent, so the user picks one after reading the previews.
- **Opt-in cleanup of old ancestors' access** (D43.4), unselected, behind its own 5 s hold, after a revoke probe on scratch pages.
- **Drop the draft's Domo Everywhere alert.** `virtualPage: true` marks system, BIB folder and personal pages (VERIFIED-LIVE). The view blocks those pages with neutral copy.
- **Block BIB pages in v1.** Negative parents give wrong titles in adminsummary (VERIFIED-LIVE), and a move into or out of a BIB folder can't be probed without touching pre-existing content.
- **The subtree always moves, and one page per run** (D43.7, with no multi-select follow-up). There is no API mode for anything else, and batches fail as a whole (VERIFIED-LIVE).
- **Show the actual access, refetched, after the move.** Some preview rules are INFERRED.
- **Move Back restores location only, and the result screen writes the old location out.** Access is not restored (VERIFIED-LIVE, probe 6), and the state is in memory only.
- **Reload the tab after success.** This is the existing pattern (VERIFIED-CODE), and the side panel slot survives it (VERIFIED-CODE, `instanceViews`).
- **Place the button after Update Details.** `ActionButtons` renders read-only actions first and mutating ones after `Navigate` (VERIFIED-CODE).
- **Add Retry to EntityPicker rather than drop it.** The component has no retry today (VERIFIED-CODE), and it is a small generic gain.
- **Paginate `getChildPages`.** Pagination works (VERIFIED-LIVE), and the current code truncates real trees (`942894016`, 107 children).
- **Ship with the Beta chip.** This is a choice, not a convention: SwapAccount, UpdateDetails and Delete have none. It fits a new write path that changes access on pages the user didn't pick.
- **Exclude App Studio, worksheet and report pages.** They live in other containers, and Domo's admin move is dashboards only (bundle).
- **Dropped critique point:** "non-admin owners can't reach Admin > Dashboards" holds only on instances whose roles lack all 20 admin-area authorities. On domo.domo.com, Editor and Participant can reach it (VERIFIED-LIVE roles). The scope case therefore rests on friction, the missing level-2 option for non-admins, and hidden access effects, not on impossibility.

## Decisions

IDs are `D43.<n>`. Each entry opens with the **Decision** and what it changes in the plan; the options, the planning recommendation, and its reasoning follow for the record. Where the decision differs from the recommendation, the plan sections follow the decision.

### D43.1. Should Move Page also cover moving an App Studio page to another App Studio App (or a dashboard into an app), by chaining Domo's App Studio import with a delete of the source?

**Decision:** Option 1. Dashboard pages only; App Studio moves stay with Domo's import.

1. No: reparent dashboard pages only
2. Add a later "Move to App" phase: import with the original cards referenced, then delete the source page
3. Include "Move to App" in the first version

**Planning recommendation:** No for now. Domo's import already does the copy, and deleting the source is one more easy step. A chained version creates new IDs, breaks links, and loses shares, subscriptions and scheduled reports, and each of those needs its own warning.

**Why it matters:** Including it adds a second service path (PUT /content/v1/dataapps/{appId}/views/import with its progress events, then a view delete), DATA_APP_VIEW and WORKSHEET_VIEW gating, and a much larger risk section and UX for what gets lost. That roughly doubles the effort, to L.

### D43.2. Who should see the Move Page button?

**Decision:** Option 2 plus content admins. The button shows for `content.admin`, or for `content.page.edit` when the user owns the page or the page is unlocked (Domo's `canMakeChanges`). Because the server rule for non-owners is unverified, the 403 copy matters more, and the non-admin test now covers a non-owner on an unlocked page.

1. Content admins, plus owners who hold content.page.edit (mirrors Domo's canUpdateOwnership)
2. Anyone Domo's own picker treats as able to change the page: content.page.edit and (page unlocked or owner)
3. content.admin only

**Planning recommendation:** Content admins plus owners with content.page.edit. Domo's admin Move turned out not to check ownership at all, so the server rule is unknown. Owners are the group most likely to succeed and least likely to cause surprise.

**Why it matters:** It changes the getAvailableActions condition and how often the 403 copy appears. The second option would show the button on many unlocked pages the user doesn't own, so a server rule that requires ownership would make the button fail often. Only a non-admin token can settle the server rule.

### D43.3. When should the submit control require a hold instead of a plain press?

**Decision:** Option 1. Hold whenever the preview shows anyone gaining or losing access on the page or any ancestor, or when a needed access list failed to load.

1. Whenever the preview shows anyone gaining or losing access on the page or any ancestor (or a needed list failed to load)
2. Only when someone loses access (the draft's rule)
3. Always hold, for every move
4. Never hold

**Planning recommendation:** Hold whenever anyone gains or loses access anywhere. Widening a parent and its top page is the main risk, and it is verified, so a rule that holds only on losses would leave the riskiest Keep moves at one press. Moves are rare, so the extra friction costs little.

**Why it matters:** It decides whether the control comes from previewAccess's gains plus ancestorGains plus losses, or from losses alone. In practice the first option holds almost every move under a parent, and the second leaves Keep and Combine at one press.

### D43.4. Should the toolkit offer to clean up the access the moved page leaves behind on its old parent and old top page?

**Decision:** Option 2. After a move, the result screen offers an opt-in checklist (nothing preselected) of users and groups to remove from the old parent and old top page, sent through `DELETE /api/content/v1/share/bulk/page/{user|group}/{id}?resourceIds=` behind its own hold. The revoke endpoint gets a scratch probe before any UI work, and the effort moves from M to L.

1. Inform only: name every old ancestor on the result screen
2. Offer an opt-in checklist that removes chosen users and groups from the old ancestors, using DELETE /api/content/v1/share/bulk/page/{user|group}/{id}?resourceIds=, behind its own hold
3. Neither inform nor clean up

**Planning recommendation:** Inform only in v1. The access list can't tell a deliberate share on the parent from one propagated by the moved page, so even a curated checklist can revoke something on purpose. The revoke endpoint is also unexercised.

**Why it matters:** The checklist adds a second write path, a revoke service, a confirmation screen, and a live probe of the revoke endpoint. That moves the effort toward L and adds a way for the feature to remove access.

### D43.5. Should pages inside Business-in-a-Box folders (negative parentPageId, 20 on this instance) be movable?

**Decision:** Option 1. Blocked in v1 with an inline note.

1. Block them in v1 with an inline note (current plan)
2. Allow moving them out to a real parent or the top level, but never back in, with Move Back hidden
3. Support them fully, including Move Back into the folder

**Planning recommendation:** Block them in v1. Whether bulk move accepts or clears a negative parent couldn't be tested without moving pre-existing content, and adminsummary reports wrong titles for them.

**Why it matters:** Allowing them requires a maintainer-approved probe on a real BIB page, breadcrumb code that reads folder names from the nav tree instead of adminsummary, and special handling for Move Back.

### D43.6. Which access option should be preselected when the view opens?

**Decision:** Option 2. No default. The access `RadioGroup` starts empty and submit stays disabled until an option is chosen.

1. Preselect "Keep its current access" (ORIGINAL)
2. No default: force an explicit choice, as Domo's dialog does
3. Preselect "Combine both" (MERGE)

**Planning recommendation:** No default. Keep never removes anyone from the page, but it is also the option that widens the new parent and top page. Forcing a choice makes the user read the ancestor lines once.

**Why it matters:** It sets the initial mode state and whether submit starts disabled, and decides how many moves widen parent access without the user reading the preview.

### D43.7. Should the first version also move several pages at once (for example, selected rows in Get Child Pages)?

**Decision:** Option 1. One page per run, with no multi-select follow-up planned.

1. One page per run
2. Also add a "Move Selected" action to the Get Child Pages list
3. One page now, with multi-select planned as a follow-up

**Planning recommendation:** One page now, with multi-select as a follow-up. Batches fail as a whole, and per-page access previews don't combine cleanly across several sources and their ancestors.

**Why it matters:** Multi-select needs a DataList row action, per-page depth checks against the shared destination, a combined preview, and a rule for a batch where one page is blocked (split it or refuse).

## Release notes draft

New Features and Improvements:

- Pages now have a Move Page button that moves a page and its subpages under another page or to the top level, previewing who gains or loses access. ([#43](https://github.com/brycewc/domo-toolkit/issues/43))
- After moving a page, you can remove the people and groups it left behind on its old parent pages. ([#43](https://github.com/brycewc/domo-toolkit/issues/43))

The Get Child Pages fix for pages with more than 100 subpages is already logged under Bug Fixes, without the issue link.

## Appendix: writes made on domo.domo.com during planning

Every write went to a scratch object the agent created for the probe (named `domo-toolkit-probe-43-*`), and every scratch object was deleted and confirmed gone.

- Draft probe 1 (move mechanics): created scratch pages 1147740868 (domo-toolkit-probe-43-a), 961358916 (domo-toolkit-probe-43-b), 348736127 (domo-toolkit-probe-43-c), 773211338 (domo-toolkit-probe-43-target), 1096991647 (domo-toolkit-probe-43-target-child) via POST /api/content/v1/pages. Moved them with PUT /api/content/v1/pages/bulk/move. Sent one PUT /api/content/v1/pages/1147740868 {parentPageId:0}, which was a no-op. Deleted all via DELETE /api/content/v1/pages/{id}, and all five verified 404.
- Draft probe 2 (permission modes): created closed, memberless groups 725125935 (domo-toolkit-probe-43-g1) and 292825995 (domo-toolkit-probe-43-g2), and scratch pages 1454182925, 968154496, 1991780633, 763716008 (domo-toolkit-probe-43-p1, -p2, -c, -d). Shared the scratch pages only with those groups (sendEmail=false) and ran bulk moves. Deleted all pages (verified 404) and both groups (Domo soft-deletes them).
- Draft probe 3 (permission matrix and edge cases): created scratch groups 164537448, 707073383, 714227434 (domo-toolkit-probe-43-gtop, -gsrc, -gsrcparent) and 15 scratch pages named domo-toolkit-probe-43-*. Shared with the scratch groups (sendEmail=false) and ran bulk moves. Deleted all 15 pages (0 remaining) and all 3 groups.
- Draft probe 4 (INHERIT under level 2): created scratch groups 1498723489, 297635029, 912394818 (domo-toolkit-probe-43-ga, -gb, -gs) and 3 scratch pages (domo-toolkit-probe-43-tt, -m, -s). Shared them (sendEmail=false) and ran one bulk move. Deleted all pages (0 remaining) and all 3 groups.
- Critique stage: created 3 closed, memberless scratch groups via POST /api/content/v2/groups: 377303730 (domo-toolkit-probe-43-rv-gt), 1792859137 (domo-toolkit-probe-43-rv-gs), 572302655 (domo-toolkit-probe-43-rv-gc). All deleted via DELETE /api/content/v2/groups/{id} (200).
- Critique stage: created 8 scratch pages domo-toolkit-probe-43-rv-{top, mid, leaf, src-INHERIT, child-INHERIT, src-OWNER_ONLY, child-OWNER_ONLY, ord}, IDs 526181513, 584788845, 107777398, 1931613322, 1199326967, 2113754213, 1868078523, 455591557. Shared them only with the scratch groups (sendEmail=false) and moved them with PUT /api/content/v1/pages/bulk/move. Sent one ignored PUT /api/content/v1/pages/455591557 {parentPageId: 526181513}. Deleted all 8 (all 404).
- Final stage probe 5 (aborted after setup by a script error in the nav read, so no moves ran): created closed, memberless groups 1173642886, 1563512158, 1792668837 (domo-toolkit-probe-43-p5-gt, -p5-gx, -p5-gs) and scratch pages 62889900 (domo-toolkit-probe-43-p5-top), 941711844 (-p5-x, under top), 1904508575 (-p5-y, under top), 753964943 (-p5-src). Shared top, x and src with their scratch groups via POST /api/content/v1/share?sendEmail=false. Deleted all 4 pages (200, 0 remaining) and all 3 groups (200).
- Final stage probe 6 (nav position and INHERIT gains): created closed, memberless groups 1093677080, 567946304, 297152180 (domo-toolkit-probe-43-p6-gt, -p6-gx, -p6-gs) and scratch pages 565177364 (domo-toolkit-probe-43-p6-top), 734640691 (-p6-x, under top), 1974747279 (-p6-y, under top), 1372185627 (-p6-src). Shared top, x and src with their scratch groups (sendEmail=false). Ran PUT /api/content/v1/pages/bulk/move twice (src under top with INHERIT, then src to top level with ORIGINAL). Deleted all 4 pages (200, 0 remaining) and all 3 groups (200).
- No pre-existing object, user setting, nav or pin setting, or instance setting was written at any stage. No emails were sent (sendEmail=false, and every group was empty). All other calls were read-only GETs or adminsummary POSTs.
