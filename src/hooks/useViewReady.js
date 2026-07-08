import { createContext, useContext, useEffect, useRef, useState } from 'react';

// Event the action bar fires when its collapse animation finishes. Held content is
// revealed then, so a heavy list mounts into the settled (final-height) layout.
export const ACTION_BAR_COLLAPSED_EVENT = 'domo:actionbar-collapsed';

// Safety net for the cases where no collapse animation ever signals its end (the
// bar was already collapsed on a reload, or the event was missed). The normal path
// releases as soon as the bar reports its collapse finished, well before this.
const COLLAPSE_FALLBACK_MS = 500;

// Per-instance reporter: a mounted side-panel view calls this once its content is
// confirmed (loaded and not a toast), so the panel collapses the action bar. Kept
// null outside a provider (e.g. standalone dev routes) so the hook no-ops.
export const ViewReadyContext = createContext(null);

/**
 * Coordinate the action-bar collapse with a view's content so the close stays smooth
 * AND the content measures the final layout.
 *
 * Views call `useViewReady(!isLoading)` (or their own "content is confirmed"
 * condition). The moment that flips true, the bar collapses. The hook returns a
 * `holdContent` flag that stays true until the bar's collapse animation finishes: a
 * view that renders a heavy (virtualized) list gates its loading spinner on it
 * (`if (isLoading || holdContent) return <spinner>`) so the list mounts only into
 * the settled layout, instead of being reflowed on every collapse frame or measured
 * at a mid-collapse height. Lightweight views can ignore the return value.
 *
 * Holding starts synchronously in the render where content first becomes ready, so
 * the heavy content is never mounted before the collapse (React discards that first
 * render pass). An action that resolves to a toast returns to default first, so the
 * collapse reporter is a no-op and nothing collapses.
 *
 * @param {boolean} isReady - True once the view's content is confirmed and ready to show.
 * @returns {boolean} holdContent - Keep showing the loading spinner while true.
 */
export function useViewReady(isReady) {
  const reportReady = useContext(ViewReadyContext);
  const reportRef = useRef(reportReady);
  reportRef.current = reportReady;

  const [holding, setHolding] = useState(false);
  const wasReady = useRef(false);

  // Begin holding the moment content becomes ready, before it can mount. React
  // re-renders immediately (discarding this pass), so the view shows its spinner
  // instead until the bar signals its collapse finished (see the release effect).
  if (isReady && !wasReady.current && !holding) {
    setHolding(true);
  }
  wasReady.current = isReady;

  // Collapse the bar as soon as content is confirmed (over the spinner if holding).
  useEffect(() => {
    if (isReady) reportRef.current?.();
  }, [isReady]);

  // Reveal held content when the bar reports its collapse finished, so the list
  // mounts into the final-height layout. The fallback covers a bar that never
  // animates (already collapsed on reload).
  useEffect(() => {
    if (!holding) return undefined;
    const release = () => setHolding(false);
    document.addEventListener(ACTION_BAR_COLLAPSED_EVENT, release);
    const timer = setTimeout(release, COLLAPSE_FALLBACK_MS);
    return () => {
      document.removeEventListener(ACTION_BAR_COLLAPSED_EVENT, release);
      clearTimeout(timer);
    };
  }, [holding]);

  return holding;
}
