---
published: false
---

# Beta Phase 1: Shared Fixes

Status: planned, decisions made, not started. Investigation done 2026-10-01 against Edge Dev 156
(the Edge Dev Debug profile, direct CDP) on `domo.domo.com`. Parent review:
[beta-graduation-review.md](beta-graduation-review.md).

## Context

The Beta review found seven problems shared across the Beta features. Fixing them once, in shared
infrastructure, clears about half of the per-feature findings and gives Phase 2 (feature-specific
data-safety bugs) something to build on. The order below follows dependencies: 1.1 gives every
later item a reliable error with an HTTP status.

## 1.1 Injected-function errors are swallowed (verified, highest priority)

### Finding

Probed `chrome.scripting.executeScript` from the Toolkit service worker into the Domo tab:

| Injected function                    | What Chrome returned             |
| ------------------------------------ | -------------------------------- |
| sync `throw`                         | `[{ frameId: 0, result: null }]` |
| async reject after an `await`        | `[{ frameId: 0, result: null }]` |
| `fetch` that got a 4xx, then `throw` | `[{ frameId: 0, result: null }]` |
| `return null`                        | `[{ frameId: 0, result: null }]` |
| `return undefined`                   | `[{ frameId: 0, result: null }]` |

`error` is never populated, so:

- The `injection.error` branch in `executeInPage` (`src/utils/executeInPage.js:174`) is dead code.
- `injection.result !== undefined` is always true, so every thrown error is returned to the caller
  as a `null` result, and the "No result from script execution" guard never fires.
- `executeInAllFrames` drops `null` results, so its failures read as "no frames had data".

Scale: 283 `executeInPage` call sites in 56 files; about 151 contain a `throw` inside the injected
function (rough count). Every one of them can report success, or "nothing found", on a failure.
The services that already return structured results (`cards.js`, `accounts.js`, `customApps.js`)
are the ones whose authors hit this; the dev routes never show it because the dev path calls the
function directly, where a throw propagates normally.

### Fix (verified approach)

Run every injected function through a fixed runner that evals the function source in the page
and returns an envelope:

```javascript
const runInPage = async (source, args) => {
  let fn;
  try {
    fn = (0, eval)(`(${source})`);
  } catch (error) {
    return { __dtk: 'evalBlocked', message: String(error?.message ?? error) };
  }
  try {
    return { __dtk: 'ok', value: await fn(...args) };
  } catch (error) {
    return { __dtk: 'error', message: String(error?.message ?? error), name: error?.name, status: error?.status };
  }
};
```

`executeInPage` passes `func.toString()` and `args` to `runInPage`, then unpacks: `ok` returns
`value` (a real `null` stays `null`, `undefined` stays `undefined`), `error` throws an `Error` with
`status` attached, `evalBlocked` falls back to the current direct call with a one-time console
warning. Verified on `domo.domo.com`: sync throws, async rejects and `status` all came through, and
named functions and argument passing behave as before.

Approaches that do not work, so nobody retries them:

- Overriding `func.toString` on a shim: Chrome serializes with the built-in
  `Function.prototype.toString`, so the shim's own empty body ran.
- A closure wrapper: injected functions are serialized by source, so closures are lost.

Why eval is acceptable here: it runs in the MAIN world, so the Domo page's CSP governs it, not the
extension's. `domo.domo.com` enforces only `frame-ancestors`, and its report-only policy (the one
Domo appears to be moving toward) still includes `'unsafe-eval'`. The function source is our own
bundled code, never user input. The `evalBlocked` fallback keeps today's behavior if some instance
ever forbids eval.

### Work

1. Add `runInPage` and the envelope unpacking to `executeInPage` and `executeInAllFrames`. Keep
   the dev-mode direct call unchanged.
2. Attach `status` when services throw on a non-OK response
   (`const e = new Error(...); e.status = response.status`). Add a tiny page-side convention for
   it rather than a helper, since injected functions cannot import.
3. **Audit callers for the behavior change.** Calls that used to "succeed" with `null` will now
   throw. That is the point, but some callers rely on it, for example optional fetches inside
   owned-object listings that should degrade to "unavailable" rather than abort a whole view.
   Grep candidates: `?? []`, `|| []`, `if (!result)` after an `executeInPage` (about 23 obvious
   ones in `src/services`), and every `Promise.all` over `executeInPage` calls, which should become
   `Promise.allSettled` where one failure must not sink the rest.
4. Leave the existing structured-result services as they are; they keep working. Their
   "Chrome swallows a rejected promise" comments become wrong and should be updated.
5. Document the envelope in `.claude/rules/architecture.md` under `executeInPage()`, including the
   NUL-byte gotcha already noted in `migrateDownstreamContent.js:1213`.
6. Verify in the browser: force a 403 (an edit on an object the test user cannot edit) through
   Update Action Versions and confirm the error now surfaces.

## 1.2 Retries and concurrency

With 1.1 every failure carries `status`, so retries become possible on the extension side.
Detailed plan: [beta-phase-1-2-retries-concurrency.md](beta-phase-1-2-retries-concurrency.md).

- Move `promisePool` (`src/activityLog/ActivityLogTable.jsx:1686`) to `src/utils/` and use it in
  place of the hand-rolled worker loops (`columnReferences.js:724`, `lineage.js:301`, and the
  per-type serial loops in the migration services).
- Add `withRetry(fn, { retryOn: [429, 502, 503, 504], attempts, baseDelayMs })` honoring
  `Retry-After` when the page passes it back. Opt-in per call: only idempotent requests (GET, and
  PUTs that replace a whole definition). Never wrap a POST that creates something.
- Bulk calls that are all-or-nothing (Beast Mode bulk save and create, card / group / dataflow
  ownership transfers) fall back to per-item calls when the batch fails, so one bad item is
  reported alone instead of failing the batch.

## 1.3 Change journal (audit log and rollback record)

One shared journal for every mutating Beta feature.
Detailed plan: [beta-phase-1-3-change-journal.md](beta-phase-1-3-change-journal.md).

- `createRunJournal({ feature, subject })` returns a run with
  `record({ type, id, name, status, before, after, error })` and `finish()`.
- Entries are written as they happen, not built at the end, so a closed panel or a crash still
  leaves a record. Status is `success`, `partial` (for add-then-remove operations such as card and
  account owners), `failed`, `skipped`.
- Storage: IndexedDB in the extension origin (shared by the side panel and the service worker).
  `chrome.storage.local` is capped at 10 MB without the `unlimitedStorage` permission, and
  pre-change definitions for a thousand cards can exceed that.
- Download as JSON (full `before` definitions, enough to restore by hand or by a later Restore
  action). Transfer Ownership and Duplicate User keep their Excel export, built from the journal,
  and download it locally on every run, not only when emailing.
- A "Recent runs" list (side panel or options page) lists journals, flags runs that never called
  `finish()` as interrupted, and offers the download. Prune after N runs or N days.

Consumers in Phase 1: just the plumbing, plus wiring the existing logs (Transfer Ownership,
Duplicate User) through it. Each migration tool records `before` in Phase 2 as its writes are
reworked by 1.4.

## 1.4 Write from a fresh read, never from the scan cache

Remap Columns, Migrate Content (and Migrate Beast Mode Usage for templates) write back definitions
fetched when the user opened page 2.

- At write time, re-fetch each item, re-run the pure rewrite on the fresh definition, and write
  that. The cached definition is used only for the preview.
- If the fresh definition no longer contains the references being rewritten, record `skipped`
  ("already up to date") instead of writing. This also removes the no-op dataflow versions on
  re-runs.
- If the fresh rewrite would change different references than the preview showed, skip the item
  and record it as "changed since preview" (decision D2).
- The fresh `before` is what goes into the journal (1.3).
- Generate Definition from JSDoc: re-read the editor source at submit; if it differs from what was
  parsed, re-parse and re-show the diff instead of submitting.

## 1.5 Re-running after a partial failure

- After a run, refresh discovery (or prune successes from the cached results) and clear succeeded
  items from the selection. Shared through the selection handler the three column tools already
  copy, which this is a good moment to extract into one helper.
- Covered partly by 1.4 (fresh read skips items already done).

## 1.6 Closing the panel mid-run

- A shared `useRunLock` hook: while a run is active, disable the view's close and back buttons
  and any navigation that unmounts the view.
- The side panel cannot block its own closing. Closing it kills the run. 1.3 makes that
  recoverable: the journal shows exactly what finished, and the next open shows an "interrupted
  run" notice.
- Moving long runs into the service worker so they survive the panel closing is the real fix, but
  it is an architecture change and is deferred (decision D3).

## Order

1. 1.1 envelope plus caller audit, verified in the browser.
2. 1.2 pool and retry.
3. 1.3 journal, wired into Transfer Ownership and Duplicate User logs.
4. 1.4 fresh-read writes and 1.5 selection refresh, feature by feature.
5. 1.6 run lock.

Release notes: 1.1 is a user-visible bug fix to shipped behavior ("errors from Domo now surface
instead of being reported as success"), and the journal and run lock are user-facing. Log them per
`wip-release-notes.md` as they land.

## Decisions

Made with the user on 2026-10-01.

- **D1. Eval runner.** Use the eval-based envelope with the `evalBlocked` fallback, not a hand
  conversion of the ~151 throwing call sites.
- **D2. Fresh read differs from the preview.** Skip that item and report "changed since preview"
  in the results and the journal. Never write a change the user did not review.
- **D3. Long runs in the service worker.** Deferred. Phase 1 relies on the run lock plus the
  incrementally written journal.
- **D4. Journal storage.** IndexedDB in the extension origin. No new permission.
