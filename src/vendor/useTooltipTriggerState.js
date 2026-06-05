// Patched copy of react-stately's useTooltipTriggerState.
//
// Why this exists: the stock hook keeps a single page-wide "warm-up" flag
// (globalWarmedUp) shared by every tooltip. Once any tooltip has shown, that
// flag stays true for a cooldown window, so hovering a *different* trigger
// during the window shows its tooltip instantly, skipping the configured
// `delay`. For clusters of closely-packed icon buttons whose tooltips are just
// labels, sweeping the cursor across them makes tooltips flash one after
// another. There is no prop to opt out: the flag is private module state.
//
// This version converts the three warm-up variables (warmedUp / warmUpTimeout
// / cooldownTimeout) from module globals to per-instance refs, so each tooltip
// warms up independently and always waits its own `delay` on first hover. The
// shared `tooltips` registry is kept untouched, so the original "only one
// tooltip open at a time" behavior still holds.
//
// Wired in via a Vite resolve.alias on 'react-stately/useTooltipTriggerState'
// (the specifier react-aria-components, and therefore HeroUI's Tooltip, imports
// from). See vite.config.js. Pinned against react-stately 3.46.0; revisit if
// that package upgrades and changes this hook.

import { useEffect, useMemo, useRef } from 'react';
import { useOverlayTriggerState } from 'react-stately';

const TOOLTIP_DELAY = 400;
const TOOLTIP_COOLDOWN = 100;

// Shared across instances on purpose: ensures opening one tooltip closes any
// other that is still open. This is not the annoying behavior, so it stays.
const tooltips = {};
let tooltipId = 0;

export function useTooltipTriggerState(props = {}) {
  const { closeDelay = TOOLTIP_COOLDOWN, delay = TOOLTIP_DELAY } = props;
  const { close, isOpen, open } = useOverlayTriggerState(props);
  const id = useMemo(() => `${++tooltipId}`, []);
  const closeTimeout = useRef(null);
  const closeCallback = useRef(close);

  // Per-instance replacements for the former module globals.
  const warmedUp = useRef(false);
  const warmUpTimeout = useRef(null);
  const cooldownTimeout = useRef(null);

  const ensureTooltipEntry = () => {
    tooltips[id] = hideTooltip;
  };

  const closeOpenTooltips = () => {
    for (const hideTooltipId in tooltips) {
      if (hideTooltipId !== id) {
        tooltips[hideTooltipId](true);
        delete tooltips[hideTooltipId];
      }
    }
  };

  const showTooltip = () => {
    if (closeTimeout.current) clearTimeout(closeTimeout.current);
    closeTimeout.current = null;
    closeOpenTooltips();
    ensureTooltipEntry();
    warmedUp.current = true;
    open();
    if (warmUpTimeout.current) {
      clearTimeout(warmUpTimeout.current);
      warmUpTimeout.current = null;
    }
    if (cooldownTimeout.current) {
      clearTimeout(cooldownTimeout.current);
      cooldownTimeout.current = null;
    }
  };

  const hideTooltip = (immediate) => {
    if (immediate || closeDelay <= 0) {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
      closeTimeout.current = null;
      closeCallback.current();
    } else if (!closeTimeout.current) {
      closeTimeout.current = setTimeout(() => {
        closeTimeout.current = null;
        closeCallback.current();
      }, closeDelay);
    }

    if (warmUpTimeout.current) {
      clearTimeout(warmUpTimeout.current);
      warmUpTimeout.current = null;
    }
    if (warmedUp.current) {
      if (cooldownTimeout.current) clearTimeout(cooldownTimeout.current);
      cooldownTimeout.current = setTimeout(
        () => {
          delete tooltips[id];
          cooldownTimeout.current = null;
          warmedUp.current = false;
        },
        Math.max(TOOLTIP_COOLDOWN, closeDelay)
      );
    }
  };

  const warmupTooltip = () => {
    closeOpenTooltips();
    ensureTooltipEntry();
    if (!isOpen && !warmedUp.current) {
      if (warmUpTimeout.current) clearTimeout(warmUpTimeout.current);
      warmUpTimeout.current = setTimeout(() => {
        warmUpTimeout.current = null;
        warmedUp.current = true;
        showTooltip();
      }, delay);
    } else if (!isOpen) {
      showTooltip();
    }
  };

  useEffect(() => {
    closeCallback.current = close;
  }, [close]);

  useEffect(() => {
    return () => {
      if (closeTimeout.current) clearTimeout(closeTimeout.current);
      const tooltip = tooltips[id];
      if (tooltip) delete tooltips[id];
    };
  }, [id]);

  return {
    close: hideTooltip,
    isOpen,
    open: (immediate) => {
      if (!immediate && delay > 0 && !closeTimeout.current) warmupTooltip();
      else showTooltip();
    }
  };
}
