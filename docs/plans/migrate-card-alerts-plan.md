---
published: false
---

# Migrate Content: Repair Card Alerts

Status: **implemented and verified end to end** on domo.domo.com (scratch objects, since deleted). A card with a
filtered, scheduled summary-number alert was migrated through the side panel to a dataset where the filter column was
renamed, then back again. Both runs updated the alert on the first PUT, kept its schedule, subscriptions, name and
owner, and the alert evaluated successfully afterward. Recreating the pre-fix state made evaluation fail
(`errorCode: 100`).

On a non-PDP dataset a GET reports the open policy of whatever dataset the alerts service thinks the card is on, so
for up to a minute after a migration it can show the old dataset's policy even though the update landed. It settles
on its own.

## What the instance showed

- Policy names come back on card alerts, so name matching works. Nearly every card alert carries the "All Rows"
  policy, so the view fetches target policies whenever a selected card's alert has any policy, not only a named one.
  Without that, the open policy had no mapping and was dropped, turning a PDP alert contextual.
- Filters carry `dataSourceId: null`, so the data source repoint is a no-op in practice.
- A filter's `column` can be a dataset Beast Mode's legacyId (`calculation_<uuid>`). The rewrite runs it through the
  migration's legacyId remap (plus card-level `useTarget` resolutions) after the column map. The card's own scan
  already counts those IDs as refs, so merging alert refs adds no bogus remap rows.
- `schedule` is present only when set, and the rewrite carries it through untouched.

## The bug

Migrate Content repoints a card to the target dataset but leaves the card's alerts alone. A card alert is keyed to
the card, so it keeps evaluating, but three things on it still point at the origin dataset:

- **PDP policies** (`filterGroups`): origin policy IDs, which mean nothing on the target.
- **Alert filters** (`filters[]`): each carries the origin `dataSourceId` and an origin column name, which a column
  remap or drop leaves stale.
- **Beast Mode alerts** (`BEAST_MODE_ID` config): the numeric template ID of an origin Beast Mode, which changes when
  the Beast Mode is recreated on the target.

apiSocial does nothing to repair these on a card's dataset change (`DomainEventDataSourceHandler` only refreshes
owner permissions). The existing Alerts group can't help either: `?dataSetId=` matches only dataset alerts
(`resource_type_id = 2`), so card alerts (`resource_type_id = 1`) never appear in Migrate Content.

## How card alerts evaluate

`AlertEvalDataService` re-renders the card's chart through `CardService.getCardChartResponse`, passing the alert's
`filterGroupIds` as the PDP context and its `filters` as query overrides (`FilterService.toCardFilters`, which
forwards `column` and `dataSourceId`). `GROUP` / `ITEM` / `SERIES` configs hold chart values, not columns, so they
survive a repoint unchanged.

## API

- **Fetch:** `POST /api/social/v4/alerts/ids?type=card&fields=all` with a body of card IDs returns every alert on
  those cards, identity-filtered to what the caller can see. At most 500 IDs per request.
- **Write:** `PUT /api/social/v4/alerts/{id}` with the full `fields=all` body, edited.
  - PATCH can't do it: it skips empty collections, so it can't clear filters or policies.
  - PUT rewrites configurations (as a new version), the alert row, filters, and policy links. Actions are untouched
    and subscriptions are copied from the persisted alert, so neither needs resending.
  - **A PUT without `schedule` deletes the alert's schedule**, so the body must carry everything the GET returned.
  - Only the owner or an alert admin may update an alert.
- **Stale dataset lookup:** the alerts service resolves a card alert's dataset through two nested caches (`getCard`,
  `cardDataSetId`), each 30 seconds, so for up to about a minute after the card swap it may still validate policies
  against the origin dataset.

## Design

Card alerts are not a selectable group. They follow their card: a selected card's alerts are repaired after it
migrates, and an unselected card's are left alone.

### Services

- `getCardAlerts(cardIds, tabId)` in `services/alerts.js`: the batched POST, returning full alert definitions.
- `repointCardAlert({ alertId, beastModeTemplateRemap, columnMap, droppedColumns, originId, pdpMap, targetId })`:
  GET `fields=all`, then rewrite:
  - `filters`: drop those on a dropped column, remap columns, repoint `dataSourceId` from origin to target.
  - `filterGroups`: resolved through `pdpMap` exactly as `moveAlertToTarget` does; a contextual alert sends none.
  - `BEAST_MODE_ID`: translated through `beastModeTemplateRemap`.
  - `COLUMN_ID` and the `ANY_ROW_*` column lists: remapped the same way as dataset alerts, for safety.

  If nothing changed it reports `unchanged` and skips the PUT; otherwise it PUTs the edited body.

### Orchestrator (`migrateAllDownstreamContent`)

- The cards branch fetches the selected cards' alerts (drills included) before swapping.
- After the card loop, each successfully swapped card's alerts are repaired. The Beast Mode remap is the dataset
  Beast Mode `numericRemap` plus each `useTarget` card-level resolution's template IDs.
- A failed PUT is retried once, no sooner than 65 seconds after the last card swap, to outlast the stale lookup.
- Failures don't fail the card (it did move). They come back as `alertIssues` on the cards result, and each
  affected card joins `manualReview`.

### View

- After the cards list loads, fetch card alerts once, keyed by card ID. A failure here doesn't block the view; the
  orchestrator fetches its own copy at run time.
- PDP reconciliation (`selectedAlertsRefPdp`, `alertPdpReferences`, `pdpMap`) reads dataset alerts plus the card
  alerts on selected cards, so a card alert's policies get mapped like any other alert's.
- The column scan merges each selected card's alert filter columns into that card's used columns, so the remap step
  lists them.
- After the run, the cards row reports alert issues and the view stays open, the same as skipped items.

## Not covered

- Custom message templates on card alerts are left as they are.
- Card alerts on pro-code app cards: the apps path doesn't touch them.
