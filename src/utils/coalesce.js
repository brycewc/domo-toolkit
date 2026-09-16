/**
 * Collapse a burst of calls into as few runs of `task` as possible.
 *
 * Only valid for whole-state snapshot writes, where `task` rewrites everything
 * from live state: dropping intermediate runs is free, but a delta would lose
 * data. Timers do not keep an MV3 service worker alive and are dropped on
 * teardown, so only wrap state the next event can re-derive.
 *
 * `await flush()` means every mutation made before the call is durable.
 * @param {() => (Promise<void>|void)} task - The side effect to coalesce.
 * @param {Object} [options] - Coalescing options.
 * @param {number} [options.delayMs] - Trailing debounce window per call.
 * @param {string} [options.label] - Prefix for the failure log line.
 * @param {number} [options.maxWaitMs] - Cap between the first `schedule()` of a
 *   burst and the run it produces.
 * @returns {{ flush: () => Promise<void>, schedule: () => void }} Entry points.
 */
export function createCoalescedTask(task, { delayMs = 250, label = 'CoalescedTask', maxWaitMs = 1000 } = {}) {
  let deadline = 0;
  let dirty = false;
  let running = null;
  let timer = null;

  function flush() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (running) {
      dirty = true;
      return running;
    }
    // Cleared before the run, not after: task snapshots asynchronously, so a
    // mutation racing it is already captured and re-sets dirty. Clearing after
    // would let that mutation be both missed and forgotten.
    dirty = false;
    // Promise.resolve().then(task) so a synchronous throw becomes a rejection
    // rather than escaping to the caller, and the catch keeps a failed run from
    // rejecting an awaited flush() or leaving the queue stalled.
    running = Promise.resolve()
      .then(task)
      .catch((error) => {
        console.error(`[${label}] Coalesced task failed:`, error);
      })
      .then(() => {
        running = null;
        // Returning the replay chains it into the promise every caller holds,
        // which is what makes `await flush()` mean "durable" and not merely
        // "the write that happened to be in flight finished".
        return dirty ? flush() : undefined;
      });
    return running;
  }

  function schedule() {
    const now = Date.now();
    if (timer === null) {
      deadline = now + maxWaitMs;
    } else {
      clearTimeout(timer);
    }
    timer = setTimeout(flush, Math.max(0, Math.min(delayMs, deadline - now)));
  }

  return { flush, schedule };
}
