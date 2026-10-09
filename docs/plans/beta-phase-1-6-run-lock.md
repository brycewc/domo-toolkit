---
published: false
---

# Beta Phase 1.6: Run Lock

Status: planned, not started. Inventory done 2026-10-08 on branch `1.8.0`. Parent:
[beta-phase-1-shared-fixes.md](beta-phase-1-shared-fixes.md) section 1.6. Depends on nothing; the
interrupted-run notice it relies on comes from
[beta-phase-1-3-change-journal.md](beta-phase-1-3-change-journal.md) step 3.

## Context

A mutating run executes in the side panel document, through `executeInPage`, with no
`AbortController`. Once started it keeps going even after its view unmounts; per-item state updates
are dropped through each view's `mountedRef` check, so the user loses all progress and results.

The side panel has no view stack. `src/sidepanel/App.jsx` keeps one slot per Domo instance
(`instanceViews`, `:49`), and every launch is a `chrome.storage.session` write under
`sidepanelData_{windowId}_{instance}` that `applyViewData` (`:75`) turns into a new `viewKey`, which
remounts the view. Slots for other instances stay mounted but hidden, so switching tabs or
instances is already safe.

Paths that unmount a running view today:

| Path                                                   | Where                                                                                                    |
| ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| The view's own close button                            | `ViewHeader.jsx:104` (no disabled state), standalone `CloseButton` in a few views                        |
| Header Reload action                                   | `buildReloadAction` (`headerActions.jsx:81`), `DataList.jsx:304`                                         |
| Any action bar button in the side panel, same instance | `ActionButtons.jsx:125-240` via `launchView`                                                             |
| Any popup action, same instance and window             | `sidepanel.js:48`, picked up by the panel's `storage.onChanged` listener                                 |
| Navigate to Copied Object, same instance               | `NavigateToCopiedObject.jsx:236-251` (writes `loading`, then the view)                                   |
| Settings gear in the action bar                        | `ActionButtons.jsx:169` calls `window.close()` unconditionally _(unverified that this closes the panel)_ |
| Closing the side panel or the window                   | Chrome UI; cannot be blocked                                                                             |

Not a problem: tab activation, tab URL changes, `TAB_CONTEXT_UPDATED`, `SHOW_STATUS`, the release
toast, theme changes, Escape (only closes modals), and the `chrome.tabs.reload` calls views make
after a run. None of these unmount a view.

Two related defects the inventory turned up:

- **A late close hits the wrong view.** `handleBackToDefault` (`App.jsx:270`) is keyed by instance
  only. Several views call `onBackToDefault` after an `await` or a timer without a `mountedRef`
  check (`OwnershipView.jsx:952`, a 3 s `setTimeout`; `RemapColumnsView.jsx:790`;
  `MigrateDownstreamContentView.jsx:1778`, `:1790`; `MigrateBeastModeUsageView.jsx:786`;
  `UpdateWorkflowActionVersionsView.jsx:492`; `UpdateTriggerVersionsView.jsx:139`;
  `GeneratePackageDefinitionFromJSDocView.jsx:289`; `ManageCardLocksView.jsx:155`). If the user has
  launched another view in that instance by then, the old view closes the new one.
- **Refresh mid-run** re-fetches the list a running transfer is iterating over. Only Migrate
  Content disables it (`disabledReason`, `:1940`).

The three paged views (Remap Columns, Migrate Content, Migrate Beast Mode Usage) already disable
their Back button while transferring, and Back is local `setPage` state that never unmounts, so
Back needs nothing new.

## Design

### Lock state lives in the panel, per instance slot

`App.jsx` owns the lock, because every unmount path except the Chrome close goes through it:
`applyViewData` for launches, `handleBackToDefault` for closes.

- `runLocksRef`: `{ [instance]: { viewKey, label } }`, a ref so the `storage.onChanged` closure reads
  it synchronously, mirrored into state so the action bar re-renders.
- A `RunLockContext` provided per slot next to `ViewReadyContext` in `renderInstanceView`, carrying
  `{ isLocked, setLock(label | null) }` already bound to that slot's instance and `viewKey`.

### `useRunLock(isRunning, label)`

New hook, `src/hooks/useRunLock.js`. Views call it once with their existing run flag:

```javascript
useRunLock(isTransferring, 'Transfer Ownership');
```

It calls `setLock(label)` while `isRunning` is true and `setLock(null)` when it turns false or the
view unmounts. `setLock` ignores a release from a `viewKey` that no longer owns the slot. A second
hook, `useIsRunLocked()`, reads the context for shared components.

No view-level state changes: the hook only mirrors a flag each view already has.

### What the lock blocks

1. **Launches into a locked instance.** `applyViewData` drops any non-null write (views and
   `loading` alike) for an instance whose slot is locked and shows a warning toast through the
   existing `showStatus`: "Transfer Ownership is still running. Wait for it to finish before opening
   another view." This one check covers the action bar, the popup, Reload, Navigate to Copied
   Object and the Migrate Content toast action, with no change to any of them. Launches for other
   instances still go through and hide the running view, which keeps running.
2. **Close.** `ViewHeader` reads `useIsRunLocked()` and renders the close button disabled through
   `DisabledTooltip` with "Wait for the run to finish". `CloseButton.jsx` does the same, so views
   with their own close need no edit. `handleBackToDefault` also refuses while locked, as a backstop
   for any close path the UI misses.
3. **Reload and Refresh.** `ViewHeader` overrides `disabledReason` on header actions with key
   `reload` or `refresh` while locked. `DataList` passes its own reload and refresh through
   `ViewHeader`, so it inherits this.
4. **The action bar.** `ActionButtons` reads the active instance's lock (passed down from
   `App.jsx`, since the bar sits outside the slot contexts) and shows a one-line "Run in progress"
   hint over the bar. Buttons stay enabled; a launch is refused by (1) with a toast, which keeps
   per-button disabled wiring out of twenty components. Copy, Share With Self, Activity Log and
   Clear Cookies do not launch views and are unaffected.
5. **The settings gear.** Skip `window.close()` when `isSidepanel()`. It exists to dismiss the
   popup; in the panel it closes the panel, killing a run. Confirm the panel behavior in step 1 of
   Verification before changing it.

### Fix the late-close bug at the same time

Bind `backToDefault` in `renderInstanceView` to the slot's `viewKey` and have `handleBackToDefault`
ignore a call whose `viewKey` no longer matches the slot. This fixes every unguarded call site in
one place, so they need no per-view `mountedRef` edits. It matters more once the lock exists:
`OwnershipView`'s 3 s auto-close fires after the lock releases, exactly when a user is likely to
open the next view.

### Closing the side panel itself

Cannot be blocked. Two cheap additions, both checked in Verification before relying on them:

- `beforeunload` with `preventDefault()` while any slot is locked. Chrome may not show a prompt for
  a side panel document; if it does not, drop it rather than ship dead code.
- Nothing else. 1.3's Web Lock already marks the run interrupted when the document goes away, and
  its interrupted-run notice is what the user sees on the next open. 1.6 adds no second mechanism.

### Which views lock

Every view with a multi-step mutating run, not only Beta ones; the hook is one line per view.

| View                                         | Flag                 |
| -------------------------------------------- | -------------------- |
| `OwnershipView.jsx`                          | `isTransferring`     |
| `DuplicateView.jsx`                          | `isSubmitting`       |
| `RemapColumnsView.jsx`                       | `isTransferring`     |
| `MigrateDownstreamContentView.jsx`           | `isTransferring`     |
| `MigrateBeastModeUsageView.jsx`              | `isTransferring`     |
| `UpdateWorkflowActionVersionsView.jsx`       | `isSubmitting`       |
| `UpdateTriggerVersionsView.jsx`              | `isSubmitting`       |
| `GeneratePackageDefinitionFromJSDocView.jsx` | `isSubmitting`       |
| `DeleteObjectView.jsx`                       | `isDeleting`         |
| `DeleteUnusedBeastModesView.jsx`             | `isDeleting`         |
| `ManageCardOwnersView.jsx`                   | `isSubmitting`       |
| `ManageCardLocksView.jsx`                    | `isSubmitting`       |
| `ManageTagsView.jsx`                         | `isSubmitting`       |
| `SwapAccountView.jsx`                        | `!!submittingAction` |

Single-request saves (`UpdateDetailsView`, `GenerateSchemaView`) are left out: they finish in
under a second and already lock their fields.

## Work

1. `src/hooks/useRunLock.js`: `RunLockContext`, `useRunLock`, `useIsRunLocked`.
2. `App.jsx`: `runLocksRef` plus state, the per-slot provider, the guard in `applyViewData`, the
   `viewKey`-scoped `backToDefault`, the lock backstop in `handleBackToDefault`, `beforeunload` if
   step 1 of Verification shows it works, and the locked flag passed to `ActionButtons`.
3. `ViewHeader.jsx` and `CloseButton.jsx`: disabled close while locked; `ViewHeader` overrides
   `reload` and `refresh` actions.
4. `ActionButtons.jsx`: the run-in-progress hint and the `isSidepanel()` guard on `window.close()`.
5. Add `useRunLock` to each view in the table.
6. Document the lock in `.claude/rules/architecture.md` next to the view-slot description: a view
   with a multi-step write must call `useRunLock`, and `onBackToDefault` is now scoped to the view
   that received it.

## Verification

In the browser against the CRXJS dev extension, through direct CDP (`scripts/ext-shot.js --live`
for the panel).

1. Spike first: in the side panel console, confirm whether `window.close()` closes the panel and
   whether a `beforeunload` handler with `preventDefault()` prompts when the panel is closed.
2. Start Transfer Ownership on a handful of items. While it runs: the close, Reload and Refresh
   buttons are disabled with the reason tooltip; an action bar button and a popup button for the
   same instance each show the toast and leave the run on screen; the run finishes with its
   results intact.
3. During the same kind of run, switch to a tab on another instance and launch a view there. It
   opens; switching back shows the run still going or finished.
4. Let Transfer Ownership finish and immediately launch another view inside the 3 s auto-close
   window. The new view stays open.
5. Close the side panel mid-run, reopen it, open Transfer Ownership: the 1.3 interrupted-run notice
   appears (only once 1.3 has landed).

## Release notes

User-visible relative to 1.7.0, so log per `wip-release-notes.md` when it lands. Draft bullets:

- While a transfer, migration, delete or other bulk change is running, the side panel keeps its
  view open and refuses to replace it with another one.
- Opening a new view right after Transfer Ownership finishes no longer closes the new view a few
  seconds later.

## Open decisions

- **Q1. A launch into a locked instance.** Recommendation: refuse it with a toast. The alternative
  is to queue the latest launch and open it when the run finishes, which avoids a repeat click but
  opens a view the user may have forgotten asking for.
- **Q2. Action bar while locked.** Recommendation: a hint over the bar, buttons left enabled and
  refused by the guard. The alternative is disabling every launching button, which is clearer but
  touches each button component.
