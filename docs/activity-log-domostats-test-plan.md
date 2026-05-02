# Activity Log → DomoStats Dataset Source: Test Plan & Change Summary

A walkthrough of every file touched in Phases 1-5 plus a structured test plan for verifying the feature against a real Domo instance.

---

## Context

**The problem.** Domo's audit API (`/api/audit/v1/user-audits`) silently caps at one year of retention. Users with longer historical needs typically pull the **Activity Log** report from the **DomoStats** connector, which then accumulates from the day it was connected.

**The change.** Two things, shipped together:

1. A **retention warning** banner on the Activity Log page so users know about the API's one-year limit.
2. A **DomoStats data source** that swaps the audit-API rows for dataset-query rows — same UI, same filters, same table — with auto-discovery of the right DomoStats dataset, per-instance dataset-ID caching, and a per-instance "always prefer dataset" preference.

---

## What changed

### New files (5)

| File | Purpose |
|---|---|
| [src/activityLog/services/activityLogDataset.js](../src/activityLog/services/activityLogDataset.js) | DomoStats dataset fetcher. Issues count + page queries in parallel against `POST /api/query/v1/execute/{datasetId}`, adapts positional rows into the audit-API record shape so the existing column renderers work unchanged. |
| [src/activityLog/services/findActivityLogDataset.js](../src/activityLog/services/findActivityLogDataset.js) | Two-step discovery service. (1) Lists `dataProviderType=domostats` datasets via `/api/data/v3/datasources`, paginating by `_metadata.totalCount`; (2) bulk-fetches stream configs in batches of 50 via `/api/data/v1/streams/bulk` and returns the dataset whose `configuration` has `name=report,value=audit`. Returns `null` if not found. |
| [src/activityLog/utils/datasetFilterMapper.js](../src/activityLog/utils/datasetFilterMapper.js) | UI filters → dataset-query `where` tree translator. `IN(...)` for objectIds / objectTypes / actions / userIds; `BETWEEN` for date range with `'YYYY-MM-DD HH:mm:ss'`-formatted bounds. Multiple filters compose as left-folded `AND`. |
| [src/activityLog/utils/datasetRowAdapter.js](../src/activityLog/utils/datasetRowAdapter.js) | Maps a positional dataset row into the audit-API record shape (`{ time, userId, userName, actionType, objectId, objectType, objectName, ... }`) keyed off a fixed column-index map. |
| [src/hooks/usePerInstanceSettings.js](../src/hooks/usePerInstanceSettings.js) | Reactive per-Domo-instance settings hook over `chrome.storage.local` (`{ perInstance: { [instance]: { ... } } }`). Subscribes to `chrome.storage.onChanged`, returns `{ settings, isLoading, update, clear }`. Reusable beyond Activity Log. |

### Modified files (4)

| File | What changed |
|---|---|
| [src/activityLog/ActivityLogTable.jsx](../src/activityLog/ActivityLogTable.jsx) | New `source` state (`'api'` \| `'dataset'`), `datasetState` for dataset pagination, `isDiscovering` / `discoveryError` / `datasetFetchError` UI states, `prevSourceRef` for source-swap skeleton detection. New `handleUseDomoStats({forceDiscovery})` callback. Mount-time effect pre-selects source from `preferActivityLogDataset` flag. `fetchEvents` and `fetchMoreEvents` branch on `source`. Header useMemo now renders retention banner / source chip / stale-ID recovery alert depending on state. |
| [src/components/options/Settings.jsx](../src/components/options/Settings.jsx) | New "Per-Instance Settings" section that lists every instance with stored settings: shows the cached Activity Log dataset ID, an "Always use DomoStats Activity Log dataset" Switch, and a Clear button. Uses `usePerInstanceSettings`. |
| [src/hooks/index.js](../src/hooks/index.js) | Adds `usePerInstanceSettings` to the barrel. |
| [docs/RELEASE_NOTES.md](RELEASE_NOTES.md) | New "Activity Log: DomoStats Dataset Source" subsection under New Features; new `usePerInstanceSettings` entry under Refactoring. |

---

## Setup before testing

1. **Build and load the unpacked extension:**

   ```bash
   yarn build
   ```

   Then in Chrome at `chrome://extensions` → "Load unpacked" → select `dist/`.

2. **Pick a Domo instance to test against.** You'll need at least one instance where:
   - You have access to the audit API (the existing path).
   - The DomoStats Activity Log report is connected as a dataset (for the new path).

3. **Open the Activity Log page.** From the popup or sidepanel on a Domo tab, find an object with activity (a card, page, dataflow, etc.) and click the "Activity Log" action.

> **Tip:** Open the options page DevTools (right-click on the extension icon → "Inspect popup" then navigate, or open the Activity Log tab and use F12) — useful for inspecting `chrome.storage.local.get(['perInstance'])` between tests.

---

## Test plan

Each flow lists steps, expected behavior, and what to verify. Run them roughly in order; later flows reuse state from earlier ones.

### Flow 1: First-time DomoStats discovery (happy path)

**Pre-state:** No `perInstance[<instance>]` entry in `chrome.storage.local` (clear it via DevTools if needed, or test on a fresh instance).

1. Open Activity Log on any Domo object.
2. **Expect:** Yellow retention warning banner above the filter toolbar: *"Activity Log API only retains the past year"* with a "Use DomoStats" button.
3. Click **"Use DomoStats"**.
4. **Expect:** Button becomes "Searching for dataset…" with a pending spinner.
5. **Expect** (within a few seconds): Banner disappears, source confirmation chip appears: `[Source: DomoStats dataset] [☐ Always for this instance] [Switch to API]`. Table reloads with DomoStats data.

**Verify:**

- DevTools → `await chrome.storage.local.get(['perInstance'])` shows `perInstance[<instance>].activityLogDatasetId` = the discovered UUID.
- Records older than ~1 year ago appear in the table (sort by timestamp descending; scroll to the bottom or filter to a date older than a year).
- Filtering by date / user / action all still work.

### Flow 2: No DomoStats Activity Log dataset in the instance (zero-match)

**Pre-state:** Test on an instance that does NOT have the DomoStats Activity Log report connected. Clear any cached `activityLogDatasetId` for it first.

1. Open Activity Log → click "Use DomoStats".
2. **Expect:** Brief pending state, then the banner stays in place. A red error line appears inside the banner: *"No DomoStats Activity Log dataset found in this instance. Add the Activity Log report from the DomoStats connector to use this option."*
3. Source remains `'api'`. Audit-API rows are still rendered.

**Verify:**

- `chrome.storage.local.perInstance[<instance>]` still has no `activityLogDatasetId` (we don't persist on no-match).
- Clicking "Use DomoStats" again re-runs discovery (no caching of the negative result).

### Flow 3: Cached dataset ID — hot path skip

**Pre-state:** Flow 1 succeeded; `perInstance[<instance>].activityLogDatasetId` is populated.

1. Reload the Activity Log page (or open it fresh).
2. **Expect:** Retention banner appears (source default is still `'api'` until the preference flag is set — see Flow 4).
3. Click **"Use DomoStats"**.
4. **Expect:** Source flips immediately — no pending state, no discovery roundtrip.

**Verify:**

- Network tab shows no calls to `/api/data/v3/datasources` or `/api/data/v1/streams/bulk` — only the dataset query itself.

### Flow 4: Mount-time preference pre-select

**Pre-state:** Cached dataset ID exists; `preferActivityLogDataset` is **not** set.

1. In the source chip, toggle on **"Always for this instance"**.
2. **Expect:** Switch turns on instantly. `chrome.storage.local.perInstance[<instance>].preferActivityLogDataset === true`.
3. **Close and reopen** the Activity Log page (close the tab, then click Activity Log again from the popup).
4. **Expect:** Page opens directly in DomoStats mode — source chip visible from the first frame, retention banner does NOT appear, no "Use DomoStats" click required.

**Verify:**

- The mount-time effect ran exactly once: the source did not flicker `'api'` → `'dataset'` mid-render. (Watch the page closely on reload; if there's a flash of the banner, log a bug.)

### Flow 5: Toggle "Always for this instance" off

**Pre-state:** From Flow 4 — preference is on, source is `'dataset'`.

1. In the source chip, toggle **"Always for this instance"** off.
2. **Expect:** Switch turns off. Source stays on `'dataset'` for this session.
3. Close and reopen Activity Log.
4. **Expect:** Page opens in `'api'` mode (banner shown again) since the preference is now off.

**Verify:**

- `chrome.storage.local.perInstance[<instance>].activityLogDatasetId` is **still set** (only the preference was toggled, the cached ID stays).
- Subsequent "Use DomoStats" click is still instant (hot path).

### Flow 6: Switch to API mid-session

**Pre-state:** Source is `'dataset'`, preference is on.

1. Click **"Switch to API"** in the source chip.
2. **Expect:** Source flips to `'api'`. Retention banner reappears. Loading skeleton briefly shows, then audit-API rows render.

**Verify:**

- `preferActivityLogDataset` is **still `true`** in storage — switching mid-session does NOT un-set the persistent preference.
- Closing and reopening Activity Log opens in `'dataset'` mode (per the preference). Confirms ad-hoc API choice doesn't override the preference.

### Flow 7: Source-swap loading skeleton

**Pre-state:** You've loaded data once (in either source).

1. Click "Use DomoStats" or "Switch to API" to swap source mid-session.
2. **Expect:** The full initial-load skeleton appears (the same one shown on first page open) — NOT just the subtle "(searching...)" suffix in the header.
3. Rows from the previous source are cleared before the swap completes.

**Verify:**

- No mixed/stale rows are visible during the swap.
- Skeleton remains until the new source's first page returns.

### Flow 8: Settings page management

1. Open the extension's options page → Settings tab.
2. Scroll to the new **"Per-Instance Settings"** section.
3. **Expect:** A bordered card per instance with stored settings. Each card shows:
   - Instance name (`<instance>.domo.com`)
   - "Activity Log Dataset ID" with the UUID below it (truncated with hover-tooltip showing the full ID)
   - "Always use DomoStats Activity Log dataset" Switch reflecting the current preference
   - "Clear" button (top-right of the card)
4. Toggle the Switch for an instance.
5. **Expect:** Storage updates instantly. (Verify with DevTools.)
6. Click **Clear** for an instance.
7. **Expect:** That instance's card disappears. Storage reflects the deletion.

**Verify:**

- After Clear, opening Activity Log on that instance shows the API banner again (no cached ID, no preference). Clicking "Use DomoStats" re-runs discovery.

### Flow 9: Multi-tab consistency

1. Open Activity Log on instance A in tab 1.
2. Open the Settings page in tab 2.
3. In tab 2, toggle "Always use DomoStats Activity Log dataset" for instance A.
4. **Expect:** Tab 1's source chip Switch updates within a moment to reflect the new value (without a manual refresh).

**Verify:**

- This works in either direction — toggling in tab 1's chip should also update tab 2's Settings page.
- Toggling in tab 2 then closing/reopening tab 1's Activity Log respects the new preference (Flow 4 again, but with a different mutation source).

### Flow 10: Stale-ID recovery

**Setup:** Cause a stale-ID failure. Easiest way:

- DevTools console: `chrome.storage.local.set({perInstance: {'<instance>': {activityLogDatasetId: '00000000-0000-0000-0000-000000000000'}}})`
- Or rename the actual DomoStats Activity Log dataset's connector to a different report (so it no longer matches `report=audit`) — actually, a fake UUID is faster.

1. Open Activity Log → click "Use DomoStats" (it'll hot-path with the bogus ID and try to query it).
2. **Expect:** A **danger-colored Alert** appears above the filter toolbar: *"Couldn't load from the DomoStats dataset"* with the underlying error message and a small explanation. Two action buttons below: **"Re-run discovery"** and **"Switch to API"**.
3. The source chip is **not** shown while this alert is visible.
4. Click **"Re-run discovery"**.
5. **Expect:** Pending state, then discovery runs (forced — bypasses the cached bogus ID). On success, the danger alert disappears, the source chip reappears, the new (correct) dataset ID is persisted, and the table reloads.

**Verify:**

- After recovery, `chrome.storage.local.perInstance[<instance>].activityLogDatasetId` is the new UUID, not the bogus one.
- "Switch to API" from the danger alert also works — flips source to `'api'` and the alert disappears.

### Flow 11: Filter translation correctness

Run these checks in DomoStats source mode (`source === 'dataset'`):

| UI filter | Expected dataset-query effect | Verify by |
|---|---|---|
| Single object (page open for one card) | `Object_ID IN (<id>) AND Object_Type IN ('CARD')` | Open Activity Log on a single card; only that card's events appear. |
| Multi-object (e.g., page → child cards) | `Object_ID IN (<id1>, <id2>, ...)` | Open Activity Log on a page; events for all child cards appear. |
| Action filter | `Action IN ('VIEWED', ...)` | Pick "Viewed" in Action dropdown; only VIEWED rows. |
| User filter | `Source_ID IN ('<userId>')` | Add a user via the user filter autocomplete; only their events. |
| Date range | `Event_Time BETWEEN '2020-01-01 00:00:00' AND '2020-12-31 23:59:59'` | Pick a date range; only events inside it. |
| Multiple filters combined | Left-folded `AND` of all of the above | Stack a date range + action filter + user; result respects all. |

**Verify:**

- Network tab → POST to `/api/query/v1/execute/{datasetId}` → request body's `where` field. Confirm the structure matches the table above. The date format must be `'YYYY-MM-DD HH:mm:ss'` (space, not 'T') wrapped in `STRING_VALUE`.

### Flow 12: Pagination through many pages

1. In DomoStats mode, find a wide query (e.g., open Activity Log on a heavily-used dataset; date range = "last 5 years"; no other filters).
2. **Expect:** First page of 100 rows loads.
3. Scroll to the bottom of the table.
4. **Expect:** Next 100 rows fetch automatically; "(loading more...)" hint in the header.
5. Repeat scrolling several times.

**Verify:**

- Each `fetchMore` triggers exactly one POST to `/api/query/v1/execute/{datasetId}` with `limit: { limit: 100, offset: <growing> }`.
- No duplicate rows (the `deduplicateEvents` post-process catches any overlap).
- "Showing X of Y events" updates correctly. Y matches the count query result.
- Eventually the "(loading more...)" hint stops appearing — `hasMore` correctly transitions to `false`.

### Flow 13: Comparison — old vs new history

1. Open Activity Log on an object you know has activity older than 1 year.
2. In API mode: scroll to the bottom (or filter `Event_Time >= 2 years ago`). The API returns nothing or sparse data.
3. Switch to DomoStats. Apply the same date filter.
4. **Expect:** Pre-1-year rows now appear, since the dataset retains them.

This is the primary "why this feature exists" sanity check.

### Flow 14: Refresh button

1. While in DomoStats mode, click the table's Refresh button (top-right of the table header).
2. **Expect:** Re-fetch fires, rows update, pagination resets to offset 0.

Repeat for API mode to confirm both work.

### Flow 15: Export

1. In DomoStats mode, click the export button (Excel/CSV).
2. **Expect:** Export proceeds using the API path (note: the export path was NOT branched on source in this implementation — it always uses the audit API).

> **Known limitation:** Phase 2 didn't branch `fetchAllDataForExport` on source. Export from DomoStats mode currently runs against the audit API. If this is important to you, flag it and we'll plug the dataset path into export in a follow-up.

---

## Cross-cutting checks

### Performance

- Discovery: should complete in 1-3 seconds for an instance with ~10-100 datasets, longer for ~1000+. The bulk-streams loop short-circuits at the first match.
- Dataset queries: count + page run in parallel, total round-trip should be similar to the audit API.

### Accessibility / keyboard

- The "Use DomoStats" button, the "Always for this instance" Switch, the "Switch to API" button, the "Re-run discovery" button — all should be keyboard-reachable.

### Error/edge cases

- Open the Activity Log on an object whose data flows but the user lacks permission for. Both API and dataset paths should surface a meaningful error.
- Network failure mid-discovery: should surface the error in `discoveryError`, not crash. Source remains `'api'`.
- `chrome.storage.local` quota: well under any limits at our scale, but worth knowing — clear settings if needed via the Settings page Clear button.

### Browser/extension state

- Reload the extension at `chrome://extensions`. Cached `perInstance` values should persist (it's `chrome.storage.local`, not session storage).
- Clear extension storage. Should reset to fresh-install behavior on next use.

---

## Quick smoke-test checklist (5 minutes)

If you only have time for the bare minimum:

- [ ] Open Activity Log → see the yellow retention banner.
- [ ] Click "Use DomoStats" → discovery runs → source flips → DomoStats rows render.
- [ ] Toggle "Always for this instance" → reload → opens directly in DomoStats mode.
- [ ] Toggle "Always for this instance" off in Settings page → reload → opens in API mode.
- [ ] Apply a date range that goes back >1 year in DomoStats mode → older records appear.
- [ ] Set a bogus dataset ID via DevTools → click "Use DomoStats" → see the danger alert with "Re-run discovery" → click it → recovers correctly.

If all six pass, the feature is working end-to-end.

---

## Out of scope (for this version)

- Cross-session caching of dataset query result rows (the dataset query is fast enough; we cache only the dataset ID).
- Auto-fallback API → dataset on error (the user opts in explicitly; we surface errors, don't auto-switch).
- Writing to the dataset.
- A "merged" view that combines API recent + dataset historical (single source per render, swappable).
- Branching the export path on source (currently always uses the audit API).

---

## Files at-a-glance for code review

```text
src/activityLog/services/activityLogDataset.js     [NEW]  Dataset fetcher (count + page)
src/activityLog/services/findActivityLogDataset.js [NEW]  Two-step discovery
src/activityLog/utils/datasetFilterMapper.js       [NEW]  Filter → WHERE translator
src/activityLog/utils/datasetRowAdapter.js         [NEW]  Row adapter
src/hooks/usePerInstanceSettings.js                [NEW]  Reactive per-instance storage hook

src/activityLog/ActivityLogTable.jsx               [MOD]  Source state, banner, chip, branched fetch, recovery
src/components/options/Settings.jsx                [MOD]  Per-Instance Settings section
src/hooks/index.js                                 [MOD]  Hook export
docs/RELEASE_NOTES.md                              [MOD]  WIP entries
```
