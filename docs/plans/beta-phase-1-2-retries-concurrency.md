---
published: false
---

# Beta Phase 1.2: Retries and Concurrency

Status: planned, not started. Inventory done 2026-10-02 on branch `1.8.0`, after 1.1 landed
(`e6e18d8`). Parent: [beta-phase-1-shared-fixes.md](beta-phase-1-shared-fixes.md) section 1.2.
Review finding addressed: "Scale" in [beta-graduation-review.md](beta-graduation-review.md).

## Context

1.1 made injected-function errors reach the caller with `status`. Nothing uses that yet:

- No HTTP request is retried anywhere, nothing handles 429, and no code reads a response header,
  so `Retry-After` never leaves the page.
- Transfer Ownership runs about 30 types at once with no backoff, and several of them send every
  ID in one request.
- Most bulk writes are all-or-nothing. One bad card, group or Beast Mode fails its whole batch,
  and the log reports every item in it as failed.
- Only two places fall back to per-item calls today: `DeleteUnusedBeastModesView.jsx:221` and
  `approvals.js:437`. Both are the model for this work.
- There are 9 hand-rolled extension-side worker loops and 8 page-side ones. Every extension-side
  write loop is serial.

## Constraint that shapes everything: page-side code cannot import

Injected functions are serialized by source, so `withRetry` and `promisePool` only work
extension-side, wrapping whole `executeInPage` calls. Two consequences:

1. **A retry repeats the whole injected function**, so it is only safe when every request inside
   it is safe to repeat. An injected function that does a POST and then a PUT cannot be retried
   as a unit.
2. **Chunking and fallback move extension-side.** A bulk transfer that today loops over chunks
   inside one injected function becomes one `executeInPage` call per chunk, so each chunk can be
   retried, and a failed chunk can fall back to per-item calls.

The page-side pools (`datasets.js:353`, `:776`, `alerts.js:200`, `functions.js:245`,
`governanceToolkit.js:45`, `:178`, `appDb.js:176`, `:540`, `pages.js:744`) stay as they are in
1.2. All but `pages.js:744` are reads that already degrade per item, and that one is an idempotent
visibility PUT. See open decision Q1.

## Retry safety by response

A 429 means the server refused the request before acting on it, so repeating it is safe even for a
create. A 502, 504 or network error is ambiguous: the request may have been applied. That gives
two retry profiles, not one:

| Profile          | Retries on                        | Use for                                                      |
| ---------------- | --------------------------------- | ------------------------------------------------------------ |
| `RETRY_SAFE`     | 429, 502, 503, 504, network error | GETs, and writes that are idempotent (see table below)       |
| `RETRY_REJECTED` | 429 only                          | Writes that create something or are otherwise not repeatable |

No call gets retried without a profile chosen for it. There is no default-on retry.

Write classification (from the inventory):

| Write                                                                           | Profile          | Why                                                           |
| ------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------------------- |
| Card full PUT `content/v3/cards/kpi/{id}`                                       | `RETRY_SAFE`     | Replaces the whole definition                                 |
| View PUT `query/v1/views/{id}`, fusion PUT `query/v1/fusions/{id}`              | `RETRY_SAFE`     | Full replace                                                  |
| Jupyter workspace PUT                                                           | `RETRY_SAFE`     | Full replace                                                  |
| Beast Mode bulk `{update}`                                                      | `RETRY_SAFE`     | Replaces each template                                        |
| Owner add/remove, `bulk/owners`, `bulk/patch`, `bulk/reassign`, groups `access` | `RETRY_SAFE`     | Setting an owner twice leaves the same state                  |
| Share POSTs (`content/v1/share`, `dataapps/share`, `ui/bulk/share`)             | `RETRY_SAFE`     | Sharing twice leaves the same state                           |
| Dataflow PUT `dataflows/{id}`                                                   | `RETRY_REJECTED` | Each PUT creates a new dataflow version                       |
| Card fast-path datasource swap                                                  | `RETRY_REJECTED` | A repeat after success no longer finds the card on the origin |
| Beast Mode bulk `{create}`                                                      | `RETRY_REJECTED` | A repeat creates duplicates                                   |
| Alert move, pro-code app context POST, `createUser`                             | `RETRY_REJECTED` | Multi-step creates                                            |
| Deletes                                                                         | none             | A repeat 404s; not worth the special case                     |

## Work

### 1. Carry `retryAfter` through the envelope

- `runInPage` (`src/utils/executeInPage.js:227`) adds `retryAfter: error?.retryAfter` to the error
  envelope; `toError` copies it back.
- Page-side convention, extended from 1.1:
  `const e = new Error(...); e.status = r.status; e.retryAfter = r.headers.get('Retry-After'); throw e;`
- Apply it only on the paths 1.2 wraps (list in steps 4 to 6), not across all 158 status sites.
- On those same paths, fix the ones that lose `status`: about 44 sites throw `HTTP ${status}` with
  no `.status` (including `transferFunctions`, `bulk/patch`, `bulk/reassign`), and the migration
  put functions, `createDatasetFunctions`, `updateDatasetFunctions`, `shareContent` and the user
  and group helpers return `{ success: false, error }` or a boolean. Result-returning functions
  gain `status` and `retryAfter` fields rather than switching to throws; 1.4 reworks those
  callers anyway.
- `shareContent` (`share.js:33`) stops swallowing exceptions and returns a boolean only for the
  success case; failures throw with `status`.
- Document `retryAfter` next to `status` in `.claude/rules/architecture.md` under `executeInPage()`.

### 2. `src/utils/promisePool.js`

Move `promisePool` out of `ActivityLogTable.jsx:1686` and widen it:

```javascript
promisePool(tasks, { concurrency = 6, onSettled }) // -> PromiseSettledResult[] in input order
```

- Returns settled results, so one rejected task never stops the others and callers stop needing
  their own `try`/`catch` per thunk. The activity log callers already catch per thunk, so they
  just read `.value`.
- `onSettled(result, index, doneCount)` drives progress.
- Default concurrency stays `DEPENDENCY_FETCH_CONCURRENCY` (6).

Replace the extension-side loops with it:

| Loop                                                           | Today                          |
| -------------------------------------------------------------- | ------------------------------ |
| `columnReferences.js:732` (scan)                               | 5 workers, `queue.shift`       |
| `columnReferences.js:791` (collisions)                         | 3 workers                      |
| `functions.js:608` (`hydrateFunctionTemplates`)                | 5 workers                      |
| `lineage/services/lineage.js:304`                              | 5 workers                      |
| `lineage/hooks/useLineageCache.js:158`                         | 5 workers                      |
| `cards.js:354`, `objectSummaries.js:24`, `dependencies.js:438` | `DEPENDENCY_FETCH_CONCURRENCY` |
| `ActivityLogTable.jsx:582`, `:784`                             | local `promisePool`            |

Keep each loop's current concurrency number; this step changes structure, not load.

### 3. `src/utils/retry.js`

```javascript
withRetry(fn, { profile, attempts = 4, baseDelayMs = 500, maxDelayMs = 15000, getFailure, gate })
```

- `fn` is a thunk, normally `() => executeInPage(...)`.
- Backoff: exponential with full jitter, capped at `maxDelayMs`.
- `Retry-After` wins over the computed delay when present (seconds or HTTP date). Above 60 s, stop
  retrying and fail with a message naming the wait, rather than stalling a run for minutes.
- `getFailure(result)` lets result-returning calls (`{ success: false, status }`) be retried
  without converting them to throws.
- **Shared backoff gate.** A 429 on one request means the whole instance is throttling us, so
  every other request in flight should back off too, not just the one that saw it. A module-level
  gate holds a `resumeAt` timestamp; any 429 pushes it out, and every `withRetry` call waits on it
  before each attempt. Ten workers that all hit 429 then pause together instead of retrying in
  lockstep.
- Export `RETRY_SAFE` and `RETRY_REJECTED` alongside it.

### 4. Retries on reads

Wrap the tasks in every pool from step 2 with `RETRY_SAFE`. These are the long scans (column
references, lineage enrichment, owned-object listings) where one throttled request today silently
drops an item from the results.

### 5. Retries and concurrency on migration writes

Migrate Content (`migrateDownstreamContent.js:1610`), Remap Columns (`remapDatasetColumns.js:89`),
Migrate Beast Mode Usage (`migrateBeastModeUsage.js:265`) and Repair View Columns
(`repairViewColumns.js:168`):

- Wrap each per-item dispatch in `withRetry` with the profile from the table above. The dispatch
  for one item can span several `executeInPage` calls; retry the individual call, not the item.
- Replace the per-type serial loops, which today run in parallel across types under
  `Promise.allSettled` (up to 6 writes in flight with no cap), with one `promisePool` over all
  items of all types at concurrency 4. See Q2.
- Beast Mode phase ordering (`migrateBeastModes` waves) is unchanged: waves stay serial because
  later waves depend on earlier ones.

### 6. Bulk calls fall back to per-item

Add `src/utils/batchWithFallback.js`:

```javascript
batchWithFallback(items, { chunkSize, sendBatch, sendOne, profile, canFallBack });
// -> [{ item, ok, error, partial? }] in input order
```

- Sends each chunk through `withRetry`. If a chunk still fails and `canFallBack(error)` allows it,
  sends that chunk's items one at a time (also retried), so the bad item is reported alone.
- Default `canFallBack`: a definite 4xx other than 429. A 429 that exhausted retries, or a 5xx,
  means the instance is struggling, and firing 100 single calls at it makes that worse.
- Chunks run serially by default. Bulk endpoints are the heavy ones.

Callers:

| Call                                                              | Today                                                                      | Change                                                                                                                                                                               |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `updateDatasetFunctions` (mDC `:2337`, remap `:272`, mBMU `:340`) | One request, whole batch failed                                            | Chunk 50, per-item fallback                                                                                                                                                          |
| `createDatasetFunctions` waves (mDC `:2253`)                      | Wave failed, dependents blocked                                            | Per-item fallback only on a definite 4xx; before falling back, re-read the target's Beast Modes by name (the existing `:2231` lookup) and skip any that now exist. `RETRY_REJECTED`. |
| `transferFunctions` (`functions.js:635`)                          | Page-side chunks of 100, chunk failed                                      | Chunking moves extension-side, per-item fallback                                                                                                                                     |
| Cards `owners/add` + `remove` (`cards.js:728`)                    | Whole list, all failed                                                     | Chunk 100, fallback; add OK plus remove failed reports `partial`                                                                                                                     |
| Pages `bulk/owners` + `remove` (`pages.js:781`)                   | Same                                                                       | Same                                                                                                                                                                                 |
| App Studio `dataapps/bulk/owners` (`appStudio.js:401`)            | Same                                                                       | Same                                                                                                                                                                                 |
| Groups `access` PUT (`groups.js:142`)                             | Whole list                                                                 | Chunk 100, fallback                                                                                                                                                                  |
| Dataflows `bulk/patch` (`dataflows.js:614`)                       | Whole list                                                                 | Chunk 100, fallback                                                                                                                                                                  |
| Datasets `bulk/reassign` (`datasets.js:1159`)                     | Chunks of 50, chunk failed                                                 | Fallback added                                                                                                                                                                       |
| `sharePages`, `shareStudioApps`, `shareObjectsWithSelf`           | Chunks of 100, chunk failed                                                | Fallback added                                                                                                                                                                       |
| Duplicate User `shareBatched` (`duplicate.js:429`)                | One unshareable card fails 100; a throw leaves later batches logged SHARED | Fallback added; every batch is attempted and records its own outcome                                                                                                                 |
| Duplicate User `addUsersToGroups` (`groups.js:9`)                 | One PUT for all groups                                                     | Per-group fallback                                                                                                                                                                   |

`partial` is the status 1.3's journal adds; until 1.3 lands, the existing logs show it as failed
with an "added but not removed" message.

Not touched: `bulkDeleteFunctions` and approvals already fall back. Approvals' GraphQL errors on
HTTP 200 are a Phase 2 fix.

### 7. Transfer Ownership type fan-out

`transferOwnership.js:410` starts every enabled type at once (`Promise.allSettled` at `:534`). Run
the types through `promisePool` at concurrency 4. Combined with the shared gate this is what
actually stops a large transfer from tripping rate limits.

A whole-type failure still records `{ id: 'all', failed: 1 }` (`:520`); fixing that count is in
the Phase 2 Transfer Ownership list, not here.

### 8. Tests

Phase 1 has no test harness (it was dropped from the parent; Vitest arrives in Phase 3), so step 9
is the verification for 1.2. Cases to cover once the harness exists:

- `promisePool`: order preserved, concurrency never exceeded, a rejection does not stop others,
  `onSettled` counts.
- `withRetry` (fake timers): each profile retries exactly its statuses, `Retry-After` in seconds
  and as a date, the 60 s ceiling, `getFailure`, and the shared gate pausing a second caller.
- `batchWithFallback`: chunk success, chunk 4xx falling back, chunk 5xx not falling back, partial
  results, order preserved.
- `executeInPage` envelope: `retryAfter` round-trips.

### 9. Browser verification

Fake throttling on the real Domo tab through direct CDP (`playwriter session new --direct`), using
the `Fetch` domain to fulfill matching requests with a 429 and `Retry-After: 2`:

1. Throttle the first N card PUTs, run Remap Columns on a small selection, and confirm every card
   lands and the run paused rather than failing.
2. Throttle every request to one card's owner endpoint with a 403, run Transfer Ownership with a
   handful of cards, and confirm only that card is reported failed.
3. Throttle a dataflow PUT with a 504 and confirm it is **not** retried (no second version).

## Order

1. Steps 1 to 3: envelope field, pool, retry. No behavior change yet beyond
   structure.
2. Step 4, reads.
3. Step 6, bulk fallback, starting with Transfer Ownership and Duplicate User (shipped Beta
   features with the clearest user-visible failure).
4. Step 7, type fan-out.
5. Step 5, migration writes. Last, because 1.4 rewrites these write paths next and the two should
   land close together.
6. Step 9 verification at each user-visible step, not only at the end.

## Release notes

User-visible relative to the shipped Beta features, so log per `wip-release-notes.md` as each
lands. Draft bullets:

- Transfer Ownership and Duplicate User now report a single item that could not be transferred or
  shared on its own instead of failing every item in its batch.
- Bulk operations now wait and retry when Domo is rate limiting requests.

## Open decisions

- **Q1. Page-side retry.** Recommendation: none in 1.2. The alternative is installing a small
  `window.__dtk.fetch` helper in the page once per tab (a plain `executeScript`, no eval) that
  page-side loops call with `window.__dtk?.fetch ?? fetch`. It would cover the page-side pools and
  multi-step injected functions, at the cost of a global on the Domo page. Worth revisiting if
  step 9 shows the page-side pools hitting 429s.
- **Q2. Migration write concurrency.** Recommendation: one pool across all item types at 4. The
  alternative, a pool per type, keeps today's per-type parallelism but multiplies the cap by the
  number of types.
- **Q3. Fallback granularity.** Recommendation: one item at a time. Bisecting a failed chunk would
  find a bad item in fewer calls, but batches are at most 100, failures are rare, and per-item
  results are what the log needs anyway.
