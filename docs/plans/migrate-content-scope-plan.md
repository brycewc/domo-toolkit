---
published: false
---

# Migrate Content: Scope by Page or App

Status: **planned**, not started. Tracks [#100](https://github.com/brycewc/domo-toolkit/issues/100).

## Context

Migrate Content repoints everything downstream of a dataset to a new dataset, all or nothing per item. The
request is to narrow that to the content on specific dashboards or apps, both as a filter when starting from a
dataset and as a starting point when launching from a dashboard or app. The use case is a single instance with no
Sandbox, where swapping a dashboard from one data source to another is the only way to promote or test.

Domo has no bulk repoint at all, so this is in scope.

Both asks are one concept: a **scope** on the existing Select step. Launching from a page is the same view with
the scope pre-filled and a step in front to pick the source dataset.

## Decisions

- A scope is a set of locations: dashboard pages, App Studio views, worksheet views, report pages, plus a "Not on
  Any Page" bucket.
- Under a scope, cards (with their drills) and pro-code apps (which are cards) are filtered to those locations.
  Beast Modes keep following the selected cards through the existing locks.
- Content not tied to a page is **hidden** under a scope and never migrated: dataflows, dataset views, Jupyter
  Workspaces, and dataset alerts. Asked the reporter on the issue whether hiding or showing unchecked is more
  useful; built as hide until she answers.
- One source dataset per run. A page launch offers "Migrate Another DataSet on This Page" afterward.
- Include Subpages is off by default.
- Cards that also live outside the scope get a warning plus an Exclude Shared Cards action. No card copying.

## Alerts

`GET /api/social/v4/alerts?dataSetId=` matches only alerts set directly on a dataset (`resource_type_id = 2`).
Card alerts (`resource_type_id = 1`) are keyed by card and never come back from it. The list endpoint's `ownerId`,
`cardId`, `pageId` and `dataSetId` filters are mutually exclusive; `pageId` resolves the page's cards server-side,
and there is no multi-card filter. Each alert carries `resourceType` and `resourceId`.

So the existing Alerts group is dataset alerts only, which have no page and fall in the hidden set. Card alerts
travel with their card and are handled by the migration itself (see `migrate-card-alerts-plan.md`); under a scope
they come along with whichever cards are selected.

## 1. Service layer

- New `getCardLocations(cardIds, tabId)` in `src/services/pages.js`, sharing the per-card `adminAllPages` parsing
  with `getPagesForCards` (extract a helper rather than copy it). Returns:
  - `locations`: `[{ id, kind: 'page' | 'appView' | 'worksheetView' | 'reportPage', name, parentId, parentName }]`
  - `locationIdsByCardId`: card ID to an array of location keys

  Key locations as `${kind}:${id}`, since page, app view and report page IDs are separate ID spaces. A drill takes
  its parent card's locations through `parentId`.

- One request per card, like `getPagesForCards`. If big dashboards are slow, batch `urns=` later.

## 2. Launch paths

- `availableActions.js` adds `migrateDownstreamContent` for PAGE, DATA_APP_VIEW, WORKSHEET_VIEW and
  REPORT_BUILDER_PAGE, skipping a PAGE with a negative ID (the `getWorkspaces` guard).
- Long-press on a DATA_APP_VIEW or WORKSHEET_VIEW offers the whole app or worksheet, the `appId` pattern GetDatasets
  and GetCards already use.
- Launch payload adds `scopeFrom: { kind, id, appId? }`. A dataset launch passes none.
- The button tooltip becomes context-aware ("Migrate the cards on this page from one dataset to another").

## 3. View: Source step

- `page` state goes from `'select' | 'target'` to `'source' | 'select' | 'target'`.
- `loadData` accepts page-like contexts when `scopeFrom` is set, leaving `datasetId` null and starting on
  `'source'`.
- The Source step lists candidate datasets from `getDatasetsForPage` / `getDatasetsForApp` with each one's card
  count on the location. One candidate auto-advances; zero bails with "Nothing to Migrate".
- Picking one sets `datasetId`, `datasetName` and `origin`; the `specs` memo already keys on `datasetId`.
- Back on the Select step returns to Source when there was one.
- The "use the dataset you're viewing" target suggestion stays off when the context isn't a dataset.

## 4. View: scope state and filtering

- State: `scope` (`null` for All Content, or `{ locationKeys: Set, includeSubpages }`), `cardLocations`
  (`{ status, locations, locationIdsByCardId }`), and `scopeRoots` for the launch location.
- Locations load immediately on a page launch, and on first opening the picker for a dataset launch.
- Include Subpages expands `scopeRoots` with `getChildPages({ includeGrandchildren: true })`, memoized, only for a
  PAGE root that has children.
- A `scopedResults` memo wraps `results`: cards whose locations intersect the scope, drills whose parent is kept,
  apps the same; Beast Modes unchanged; hidden types collapse to an empty loaded result; "Not on Any Page" matches
  cards with no locations.
- `buildFullSelection`, `selectedCounts`, `totalsByType`, `selectedItemsByType`, `handleSelectionChange` and the
  group render read `scopedResults`. `bmRefGraph` and `beastModeCardLinks` keep the raw `results`.
- A scope change rebuilds the selection (set `pendingSelectAll`), so a scope means "migrate what's here".
- Hidden groups don't render under a scope, and neither does Check Jupyter Workspaces.

## 5. View: scope UI

- New `migrateDownstream/ScopeSection.jsx` above the type groups: All Content, or a multi-select picker sectioned
  into Pages, Apps (views nested), Worksheets, Reports and "Not on Any Page", each with a card count and a spinner
  while loading.
- Scoped, it shows as a removable pill ("On: Sales Dashboard" or "On: 3 Locations") plus the Include Subpages
  switch where it applies. A page launch starts with the pill filled in.
- A muted line names what the scope left out, read off whatever got hidden.

## 6. Shared-card warnings

- A card is shared when its locations minus the scope is non-empty; a memo over `cardLocations` and `scope`.
- Card rows get an "Also on N Other Pages" warning chip in `buildCardItems`, with the other locations in its
  tooltip.
- The Cards group gets a summary Alert with an Exclude Shared Cards button, routed through `handleSelectionChange`
  so Beast Mode locks recompute.
- The confirm dialog restates the shared count.

## 7. After migrating

- On a page launch with other candidate datasets still on the scoped locations, the success state offers "Migrate
  Another DataSet on This Page": back to `'source'`, the finished dataset removed, the scope kept.
- The success toast notes that content outside the scope was left on the source dataset, so it doesn't read as a
  partial failure.

## 8. Verification

No `/dev-*` route covers this view, so use the CRXJS dev extension and `scripts/ext-shot.js sidepanel --live`:

- a dataset launch with a scope chosen
- a page launch with several candidate datasets
- an App Studio view, and the whole app via long-press
- a card shared with a page outside the scope
- a scope that leaves zero cards
- the location fetch failing (error with retry, All Content still works)

Release notes: "Migrate Content can now be scoped to specific pages and apps." and "Migrate Content is now
available on pages and App Studio views.", each linking #100.
