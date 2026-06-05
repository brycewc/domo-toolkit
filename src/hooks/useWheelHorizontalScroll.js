import { useCallback, useRef } from 'react';

/**
 * Lets a horizontally scrolling element also scroll on vertical wheel input, so
 * users without a horizontal scroll wheel (or who don't know to use one) can
 * scroll it with a normal mouse wheel while hovering over it. Trackpad
 * horizontal swipes keep working natively. When there is no horizontal overflow
 * the event is left alone so the page scrolls as usual.
 *
 * Returns a callback ref (not a ref object) so the listener re-attaches across
 * conditional mounts and remounts: the target element here is rendered only
 * when there are multiple tabs and is remounted whenever the detected object
 * changes, which a one-time effect would miss. A native non-passive listener is
 * used because React's `onWheel` is registered passively and cannot
 * preventDefault.
 *
 * @returns {(node: HTMLElement | null) => void} callback ref for the scroll container
 */
export function useWheelHorizontalScroll() {
  const cleanupRef = useRef(null);

  return useCallback((node) => {
    // Detach from any previous node first. React calls this with null on
    // unmount, and with the new node (after a null) when the element remounts.
    if (cleanupRef.current) {
      cleanupRef.current();
      cleanupRef.current = null;
    }
    if (!node) return;

    const onWheel = (event) => {
      // Nothing to scroll horizontally: let the event bubble so the page scrolls.
      if (node.scrollWidth <= node.clientWidth) return;
      // Honor whichever axis the user actually moved, so a trackpad's horizontal
      // swipe still works while a vertical mouse wheel drives horizontal scroll.
      const delta = Math.abs(event.deltaY) > Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
      if (delta === 0) return;
      event.preventDefault();
      node.scrollLeft += delta;
    };

    node.addEventListener('wheel', onWheel, { passive: false });
    cleanupRef.current = () => node.removeEventListener('wheel', onWheel);
  }, []);
}
