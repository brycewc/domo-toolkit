---
published: false
---

# Beta Phase 1.3: Change Journal

Status: planned, not started. Inventory done 2026-10-05 on branch `1.8.0`. Parent:
[beta-phase-1-shared-fixes.md](beta-phase-1-shared-fixes.md) section 1.3. Review finding addressed:
"No record of what changed, so no rollback" in [beta-graduation-review.md](beta-graduation-review.md).

## Context

No mutating feature keeps a durable record of what it did:

- Nothing in `src` uses IndexedDB, and nothing a run produces is written to storage while it runs.
  All run state is React state, so closing the side panel loses it.
- Transfer Ownership builds its log (`buildTransferLogRows`, `OwnershipView.jsx:1375`) only in the
  email branch (`:900`) and only when `totalSucceeded > 0`. It is uploaded and emailed, never
  downloaded. Delete-after-transfer (`:943`) is not in it at all, since the email goes first.
- Duplicate User builds its log (`buildDuplicationLogRows`, `duplicators/user.jsx:274`) after
  `run()` returns and downloads it from `onComplete`. `DuplicateView.jsx:184` returns before
  `onComplete` when the view has unmounted, so that run gets no log. A failed user creation gets no
  log either (`downloadAuditLog` returns early on `!result?.newUser`).
- Both builders duplicate the same row shape (Date, Object Type/ID/Name, Status, Notes), the same
  `{ attempted, errors: [{ id | 'all', error }] }` input and the same `'all'` sentinel. The only
  shared code is `src/utils/exportData.js` (`buildExcelBlob`, `exportToExcel`,
  `generateExportFilename`, private `downloadBlob`).
- Transfer Ownership matches failures to items by bare `id` (`OwnershipView.jsx:1381`), so a
  project and a task with the same ID can be mislabelled.

What exists to build on:

- The side panel, options page, popup and service worker are all pages of the
  `chrome-extension://gagcendhhghphglhcgjakkkocbliekaj` origin, so they share one IndexedDB. The
  content scripts do not, and do not need to.
- Manifest has `storage` but neither `unlimitedStorage` nor `downloads`. Neither is needed (D4).
- `background.js:547-561` (`MAX_ERRORS_PER_TAB`, oldest-first splice) is the model for pruning.
- `ApiErrorsView.jsx` (`DisclosureGroup` of cards) is the model for the list UI.

## Design

### Storage

Database `domo-toolkit`, version 1, opened through a small promise wrapper in
`src/utils/runJournal.js`. No dependency; the surface is two stores and four operations.

| Store     | Key            | Indexes                 | Holds                                       |
| --------- | -------------- | ----------------------- | ------------------------------------------- |
| `runs`    | `id` (UUID)    | `startedAt`, `instance` | One record per run, small                   |
| `entries` | `[runId, key]` | `runId`                 | One record per object touched, can be large |

Entries live apart from runs so the Recent runs list never loads `before` definitions, and so each
`record()` is a single small put instead of a rewrite of a growing run document.

Values are stored as structured clones, not JSON strings. Everything recorded comes from
`executeInPage` results or plain objects, so it is already cloneable.

**IndexedDB outlives the code.** The project rule of no backwards compatibility covers code, but
journals written by 1.8.0 are still on disk after an update. Every schema change bumps the DB
version with an `onupgradeneeded` step that keeps existing records; dropping stores is never the
upgrade path. Each run also stores `schemaVersion` so a later Restore action can tell what it is
reading.

### Run record

```javascript
{
  id, schemaVersion: 1, appVersion,
  feature: 'transferOwnership',          // stable key, not a label
  instance: 'domo.domo.com',
  subject: { type, id, name },           // what the run acted on or from
  params: { ... },                        // feature inputs worth keeping (target owner, options)
  actor: { id, name },                    // the signed-in user who ran it
  startedAt, finishedAt: null,
  outcome: null,                          // set by finish(): 'completed' | 'failed' | 'cancelled'
  counts: { success, partial, failed, skipped, pending }
}
```

`counts` is updated with each `record()` in the same transaction, so the list can show totals
without reading entries.

### Entry

```javascript
{
  (runId,
    key, // key = `${type}:${subType ?? ''}:${id}`, unique within a run
    type,
    subType,
    id,
    name,
    status, // 'pending' | 'success' | 'partial' | 'failed' | 'skipped'
    startedAt, // null until the request for this item is sent
    updatedAt,
    before,
    after, // optional; whatever is needed to restore by hand
    error, // { message, status } when failed or partial
    note); // optional free text for the log's Notes column
}
```

The composite `key` fixes the project/task ID collision for anything built from the journal.

### Write-ahead, not write-after

The parent plan says "written as they happen". For a record to be useful after a crash it must
also say what was **about to** happen, so writes go in two steps:

1. `plan(items)` at run start writes every selected item as `pending` with `startedAt: null`, in
   one transaction.
2. `start(keys)` sets `startedAt` just before the request(s) for those items are sent.
3. `record(entry)` sets the outcome.

An interrupted run then reads unambiguously per item: `pending` with no `startedAt` was never
reached, `pending` with a `startedAt` was in flight and its outcome is unknown, anything else is
final. This is also what fixes Duplicate User logging unreached batches as SHARED: they stay
`pending` and say so.

### Interrupted runs: Web Locks, not heartbeats

`createRunJournal` takes `navigator.locks.request('dtk-run:' + id, ...)` and holds it until
`finish()`. Web Locks are shared across every context of the origin and released by the browser
when the holding document closes, so a run whose lock is not in `navigator.locks.query().held` and
has no `finishedAt` was interrupted. No timers, and no false "interrupted" for a slow run in
another window.

### API

```javascript
const run = await createRunJournal({ feature, instance, subject, params, actor });
await run.plan(items); // [{ type, subType, id, name }]
await run.start(keys);
await run.record({ type, subType, id, name, status, before, after, error, note });
await run.finish(outcome); // releases the lock

listRuns({ limit, instance }); // newest first, run records only
getRun(id); // { run, entries }
isRunLive(id); // from navigator.locks.query()
(deleteRun(id), clearRuns());
pruneRuns();
```

- `record()` for a key that was never planned inserts it, so features with discovered-at-runtime
  items (Duplicate User's profile fields) do not need to plan first.
- Writes from one run go through a per-run promise queue so they land in call order.
- Callers `await` `record()`. One put per item is cheap next to the Domo request it records.

### When the journal itself fails

- **`createRunJournal` fails** (IndexedDB unavailable, quota): the run does not start, and the view
  shows why. A mutating Beta run without a record is the problem this item exists to fix. See Q1.
- **A later write fails**: the run continues, the failure is logged to the console once, and the
  run's in-memory state marks the record incomplete so the results view says the downloaded log
  may be missing items. The Excel and JSON downloads at the end are built from memory plus the
  journal, so they still carry everything.

### Pruning

`pruneRuns()` runs inside `createRunJournal`, before the new run is written. It keeps every run
from the last 90 days, and at most 200 runs overall, oldest dropped first. A run whose lock is held
is never pruned. See Q2.

Chrome treats extension IndexedDB without `unlimitedStorage` as best-effort storage, evictable
under disk pressure. Call `navigator.storage.persist()` once on first open and record whether it
was granted (unverified for extension origins); a refusal changes nothing else.

### Downloads

- **JSON**: `{ run, entries }` with `schemaVersion`, through `exportToJson`. Full `before` and
  `after`, enough to restore by hand.
- **Excel**: per feature, built from entries by a row mapper. `buildTransferLogRows` and
  `buildDuplicationLogRows` are rewritten to take `{ run, entries }` and keep their current
  `LOG_COLUMNS`, so the files users already know do not change shape. Status labels map from the
  journal status (`success` becomes TRANSFERRED / SHARED / ADDED / COPIED as today, `partial`
  becomes PARTIAL, `pending` becomes NOT STARTED or UNKNOWN by `startedAt`).
- Export `downloadBlob` from `exportData.js` and point the two copies at it (`Export.jsx:76`,
  `cards.js:154`) while in there.

## Work

### 1. `src/utils/runJournal.js`

The storage layer, API and pruning above. Nothing calls it yet.

### 2. Recent Runs page

A full-screen options page, `#recent-runs`, added to `FULL_SCREEN_PAGES` (`src/options/App.jsx:23`)
alongside the activity log and lineage. See Q3.

- One card per run, newest first, grouped by instance: feature label, subject, actor, started and
  finished times, counts as chips, and an **Interrupted** chip for runs that are not live and have
  no `finishedAt`.
- Expanding a run lists its entries, failed and partial first, with the error text.
- Actions per run: Download JSON, Download Excel (features that have a row mapper), Delete. Clear
  All at the top.
- Reached from a General Settings link, from a "View run record" link in each feature's results,
  and from the interrupted-run notice (below).
- Feature labels come from a small map in the page, keyed by `run.feature`.

### 3. Interrupted-run notice

When a view that writes a journal mounts, it checks for an interrupted run of its own `feature` on
the current instance and shows a dismissible alert linking to it. 1.6 reuses this notice.

### 4. Partial results from the transfer functions

Today the add-then-remove transfers return only `{ errors: [{ id, error }] }`, so "added but not
removed" is indistinguishable from "nothing happened". Add `partial: true` to the error object where
the add is known to have succeeded:

| Function                                                                                               | Partial when                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------- |
| `transferAccounts` (`accounts.js:264`)                                                                 | Grant succeeded, revoke failed (already says so in the message) |
| Workspaces (`workspaces.js:139`)                                                                       | Owner promoted or added, previous owner not removed             |
| Report Builder (`reportBuilder.js:268`)                                                                | Owner changed, a delivery view update failed                    |
| Cards (`cards.js:728`), pages (`pages.js:781`), App Studio and worksheets (`appStudio.js:299`, `:312`) | Bulk add succeeded, bulk remove failed                          |

1.2's `batchWithFallback` produces the same flag per item once it lands; this step only adds it to
the paths that exist now.

### 5. Transfer Ownership

- `handleTransferSubmit` (`OwnershipView.jsx:777`) creates the run before anything else, with
  `subject` the source user, `params` `{ toOwnerId, toOwnerType, toDisplayName, deleteAfterTransfer,
emailNewOwner, emailCurrentUser }`, and plans every selected item.
- `transferAllOwnership` (`transferOwnership.js:410`) takes the run as an option. Per type: `start`
  the type's selected keys before calling its transfer function, then `record` each attempted item
  from the result, with `before: { ownerId: fromUserId }` and `after: { ownerId, ownerType }`.
- A type that throws records every one of its attempted items as `failed` with the type's error,
  instead of one `'all'` row. (The on-screen `failed: 1` count is the Phase 2 fix and stays as is.)
- Delete-after-transfer is recorded as its own `USER` entry, planned at run start when the option
  is on and `skipped` when the delete gate holds it back.
- At the end: always download the Excel log locally, then email it when requested, both built from
  the journal. The `totalSucceeded > 0` gate stays on the email only.
- Not recorded in Phase 1: best-effort side effects (`From <name>` tags on datasets and dataflows,
  dataflow input shares, publication republish). They are not ownership and are not reversible
  from the log anyway.

### 6. Duplicate User

- `duplicators/user.jsx` `run` creates the run with `subject` the source user and `params` the
  mode (new or existing) and new-user fields, and plans the selected groups, cards, pages and apps.
- `duplicateUser` and `addAccessToExistingUser` (`duplicate.js:122`) take the run as an option and
  record as each step lands: the `USER` entry after create (or `failed`, which now still produces a
  log), profile fields, locale, groups.
- `shareBatched` (`duplicate.js:429`) calls `start` on a batch's keys before sending it and
  `record` on each item after. A batch that throws records its own items `failed`; later batches
  are still attempted (1.2 makes this per-item).
- Custom apps record `skipped` with the existing "Manual sharing required" note.
- Download moves out of `onComplete` to the end of the run itself, so an unmounted view still
  downloads the log while the panel is open. `DuplicateView.jsx:184` can keep its early return for
  state updates.
- Color Rules (the other duplicator) does not journal in Phase 1.

### 7. Document it

Add a "Run journal" section to `.claude/rules/architecture.md`: when a feature must journal (any
multi-item write), the write-ahead order, the composite key, and the schema-upgrade rule.

## Not in 1.3

- `before` definitions for the migration tools: Phase 2, recorded from 1.4's fresh read.
- A Restore action. The JSON is shaped for one, nothing more.
- Journaling non-Beta mutating features (Delete, Update Details, Manage Card Owners, Manage Tags,
  Swap Account, Update Trigger Versions, Delete Unused Beast Modes). The API fits them; adding them
  is a later, per-feature decision.
- Recording from the service worker. Runs live in the side panel until D3 is revisited, and the
  API needs no change when they move.

## Verification

No test harness exists (1.7 was dropped from the parent), so verification is in the browser
against the CRXJS dev extension, through direct CDP.

1. Transfer Ownership of a handful of items to a test user with email off: an Excel log downloads,
   and Recent Runs shows the run with matching counts.
2. Same, closing the side panel while types are still transferring: Recent Runs shows the run as
   Interrupted, finished types as final, in-flight items as outcome unknown, the rest as not
   started.
3. Open Transfer Ownership again on that instance: the interrupted-run notice links to that run.
4. Duplicate User into an existing user with one card the operator cannot share: its batch is
   failed, the other batches succeed, nothing unreached reads as SHARED.
5. Download JSON from Recent Runs and confirm `before` / `after` on transfer entries.
6. Open Recent Runs in a second window during a run: the run shows as live, not interrupted.

## Order

1. Steps 1 and 7: storage layer and docs.
2. Steps 2 and 3: Recent Runs page and notice, checked against a run written from the console.
3. Steps 4 and 5: Transfer Ownership, the feature with no local log today.
4. Step 6: Duplicate User.

## Release notes

User-visible relative to the shipped Beta features, so log per `wip-release-notes.md` as each
lands. Draft bullets:

- A new Recent Runs page keeps a record of every Transfer Ownership and Duplicate User run,
  including runs cut short by closing the side panel, with Excel and JSON downloads.
- Transfer Ownership now downloads its log on every run, not only when emailing it.
- Transfer Ownership logs now mark an owner who was added but whose previous owner could not be
  removed as partial instead of failed.
- Duplicate User now saves its log even when the run fails to create the user or the view is
  closed before it finishes.
- Duplicate User logs no longer mark cards and pages as shared when their batch was never sent.

## Open decisions

- **Q1. Run without a journal.** Recommendation: refuse to start a mutating Beta run if the
  journal cannot be opened. The alternative is a warning and a Continue Anyway button, which keeps
  the feature usable on a broken profile at the cost of the guarantee.
- **Q2. Retention.** Recommendation: 90 days and 200 runs, whichever keeps less. Migration runs
  with full card definitions are the large ones; a size budget from `navigator.storage.estimate()`
  could replace the run cap if that proves too coarse.
- **Q3. Where Recent Runs lives.** Recommendation: a full-screen options page, since the journal is
  cross-instance and should be readable with no Domo tab open. The alternative is a side panel
  view, closer to where runs happen but scoped to one instance's slot.
