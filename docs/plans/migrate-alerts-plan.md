# Migrate Alerts: implementation + resume notes

## Goal

Add Alerts as a migratable type in Migrate DataSet Content. A dataset alert's
dataset reference cannot be edited in place, so "move" means recreate the alert
on the target dataset and delete the original. PDP policies are dataset-specific,
so referenced policies are auto-matched to the target by name; unmatched ones
block the migration until the user maps or removes them.

## Status: mostly built, the recreate call is WRONG and must be rewritten

`moveAlertToTarget` POSTs the whole alert (with `actions` inline) to
`/api/social/v4/alerts`. That returns a 500. Verified against domo.domo.com that
the create endpoint does NOT accept actions inline and the body must be minimal.
The rest of the feature (discovery, PDP mapping UI, gating, dataset repoint) is
correct and verified.

### Already implemented and correct

- `src/services/alerts.js`
  - `getDownstreamAlerts(datasetId, tabId)` uses
    `/api/social/v4/alerts?dataSetId={id}&fields=all&limit=200` (server-side
    filter). Returns `[{filterGroups, id, name}]`. CORRECT.
  - `getRowPdpPolicies(datasetId, tabId)` GETs
    `/api/query/v1/data-control/{id}/filter-groups?options=load_associations,include_open_policy,load_filters,sort`.
    Returns the full filter-group objects (bare array; note there is NO
    `policySetId` field on these). CORRECT.
  - `extractAlertPdpPolicies(alertDefinition)` returns referenced groups
    `[{filterGroupId, name, type}]`. CORRECT.
  - `moveAlertToTarget({alertId, columnMap, originId, pdpMap, tabId, targetId})`
    NEEDS REWRITE (see below).
- `src/services/migrateDownstreamContent.js`: `MIGRATE_TYPES` includes
  `{key:'alerts'}`; `dispatchSwap` has an `alerts` branch calling
  `moveAlertToTarget`; `pdpMap` is threaded through `migrateAllDownstreamContent`.
  CORRECT.
- `src/components/views/MigrateDownstreamContentView.jsx`: `TYPE_KEY_TO_DOMO_TYPE`
  has `alerts:'ALERT'`; alerts `specs` entry; PDP mapping state/effects/`PdpMapRow`
  UI + gating (`pdpChoiceInvalid`); `selectedCounts`/`totalSelected` fixed to
  include alerts (was the "8 of 9, alert not counted" bug). CORRECT.
- `docs/RELEASE_NOTES.md`: bullet under Migrate Content. CORRECT.

## The correct create sequence (rewrite `moveAlertToTarget` to this)

Confirmed by reading the Domo UI network calls. The UI does a minimal base create,
then followup requests.

1. `POST /api/social/v4/alerts` with a MINIMAL body (no actions, no name, no
   owner, no subscriptions):

   ```json
   {
     "configurations": [
       {"name":"ANY_ROW_PRIMARY_KEYS","value":"account id"},
       {"name":"OPERATION","value":"ROWS_ADDED"},
       {"name":"NOTIFY_REPEATABLE_TRIGGER","value":true},
       {"name":"NOTIFY_TRIGGER","value":true}
     ],
     "type":"ANY_ROW",
     "resourceType":"DATASET",
     "resourceId":"<targetId>",
     "filterGroups":[{"filterGroupId":961114}]
   }
   ```

   Key points vs the current broken code:
   - `filterGroups` is just `[{filterGroupId}]` (the TARGET policy id only), NOT
     the full policy object the code currently sends.
   - No `actions` in the base create (sending any actions is what 500s).
   - `NOTIFY_*` values are booleans in the UI payload (the GET returns them as
     strings; strings appear to be accepted too, but prefer matching the UI).
   - Rewrite column names in `configurations` (`COLUMN_ID`, comma-joined
     `ANY_ROW_PRIMARY_KEYS`) via `columnMap` before sending.
   - Returns the new alert id.

2. Per action, `POST /api/social/v4/alerts/{newId}/actions` with the action
   metadata FLATTENED to the top level (not nested under `metadata`):

   ```json
   {"type":"WORKFLOW","modelId":"...","modelVersion":"1.0.0","modelStartName":"Run DataSet","paramMapping":"{\"dataset\":\"alertOwner\"}","constMapping":"{}","startMessageName":"Start Run DataSet"}
   ```

   The discovery list and the alert GET return each action with EMPTY `metadata`;
   the real metadata only comes from `GET /api/social/v4/alerts/{origId}/actions/{actionId}`.
   So fetch each action's detail, then flatten `{type, ...detail.metadata}`.

3. `PUT /api/social/v4/alerts/{newId}/message-template` to copy the custom
   message (when the alert has one):

   ```json
   {"body":"<p>...</p>","footer":"<p>...</p>","header":"<p>...</p>","formulas":{}}
   ```

4. `PUT /api/social/v4/alerts/{newId}/subscriptions` to copy subscribers.

5. Restore `name`/`owner` if they differ from the create defaults (PATCH
   `/api/social/v4/alerts/{newId}` is known to accept `{id, owner}`; name TBD).

6. `DELETE /api/social/v4/alerts/{origId}` ONLY after the base create succeeded.
   If create fails, leave the original untouched. Followup-step failures (actions,
   message, subscriptions) should still delete-or-not be decided: prefer to keep
   the original and flag for manual review if a followup fails, since a moved
   alert that lost its action/subscribers is worse than not moved.

## Open questions to verify next session (via Playwriter on domo.domo.com)

1. Is `name` settable via `PATCH /alerts/{id}`, or does it need the
   "Update Alert Rules" PUT? (Owner via PATCH `{id, owner}` is confirmed.) For
   ANY_ROW ROWS_ADDED the auto name is "Any row is added", which often already
   matches, so name restoration may be optional.
2. Exact request body shape for `PUT /alerts/{id}/subscriptions` (Postman shows
   the response is an array; confirm the request array element shape, and whether
   to strip the server `id` from each subscription).
3. How to GET the ORIGINAL's raw message template to copy it. Candidates:
   `GET /alerts/{id}/message-template` (raw) vs the alert's `message` field with
   `fields=all` vs `/message-template/render` (rendered, not what we want).
4. Confirm a mapped (non-open) PDP policy create works with just
   `filterGroups:[{filterGroupId: <targetPolicyId>}]`.
5. WORKFLOW-action alerts: confirm the followup `POST .../actions` actually
   re-provisions the workflow trigger on the new alert. If a WORKFLOW action
   cannot be recreated cleanly, detect that action type and route those alerts to
   manual review instead of moving them.

## Test fixtures (domo.domo.com)

- Instance: `https://domo.domo.com` (dev proxy target in `.env.development.local`).
- Origin dataset: `9b056ebc-776d-4dcb-8c57-7deaecbf01ab` (BETA PROGRAM Master
  Participant List).
- Target dataset: `9a49e7e5-78ac-4b3f-90d0-2384857fc7bb`.
- Test alert: `18485` ("Any row is added", a WORKFLOW-action alert, open/All-Rows
  PDP). Do NOT delete it while testing; only delete test copies you create.
- Target open ("All Rows") policy id: `961114`.

### Playwriter testing recipe

- `playwriter session new`, navigate `state.page` to `https://domo.domo.com`
  (user must click the Playwriter extension icon on a Domo tab first if the
  extension is disconnected).
- Run authenticated calls via `state.page.evaluate(async () => { await fetch(...) })`.
- After any create test, DELETE the alert you created (capture the returned id)
  and verify `GET /api/social/v4/alerts?dataSetId={targetId}&fields=all&limit=200`
  is clean. The 500s during this investigation created nothing; only successful
  creates need cleanup.

## Verification before claiming done

- `npx eslint --no-warn-ignored` on the edited files.
- End-to-end on a disposable alert: open Migrate DataSet Content on a dataset with
  alerts, run the migration, confirm a new alert exists on the target with the
  same rule/config/columns/PDP, message template, subscribers, and that the
  original was deleted; force a create failure and confirm the original survives.
