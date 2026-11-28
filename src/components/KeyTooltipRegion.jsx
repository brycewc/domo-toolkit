import { Chip, Tooltip } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

const ANCHOR_SELECTOR = '[data-key-tooltip]';

/**
 * KeyTooltipRegion Component
 * One shared tooltip for every `[data-key-tooltip]` element inside it, showing the attribute's value in the
 * context footer's key chip, colored by `data-key-tooltip-color` (default `accent`). Hover is delegated so the anchors stay plain HTML, and the tooltip state lives
 * here so opening it never re-renders `children`.
 * @param {Object} props
 * @param {React.ReactNode} props.children - Content containing the tooltip anchors
 * @param {string} [props.className] - Class name for the wrapping div
 */
export function KeyTooltipRegion({ children, className }) {
  const anchorRef = useRef(null);
  const hoveredRef = useRef(null);
  const openTimer = useRef(null);
  const closeTimer = useRef(null);
  const [isOpen, setIsOpen] = useState(false);
  const [tooltip, setTooltip] = useState({ color: 'accent', key: null });

  useEffect(
    () => () => {
      clearTimeout(openTimer.current);
      clearTimeout(closeTimer.current);
    },
    []
  );

  const handlePointerOver = (event) => {
    const anchor = event.target.closest?.(ANCHOR_SELECTOR);
    if (!anchor) return;
    clearTimeout(closeTimer.current);
    if (anchor === hoveredRef.current) return;

    hoveredRef.current = anchor;
    clearTimeout(openTimer.current);
    // Each anchor waits its own delay, like the per-trigger warm-up in src/vendor/useTooltipTriggerState.js.
    setIsOpen(false);
    openTimer.current = setTimeout(() => {
      anchorRef.current = anchor;
      setTooltip({ color: anchor.dataset.keyTooltipColor || 'accent', key: anchor.dataset.keyTooltip });
      setIsOpen(true);
    }, readCSSTime('--tooltip-delay', 300));
  };

  const handlePointerOut = (event) => {
    const anchor = event.target.closest?.(ANCHOR_SELECTOR);
    if (!anchor || anchor.contains(event.relatedTarget)) return;

    hoveredRef.current = null;
    clearTimeout(openTimer.current);
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setIsOpen(false), readCSSTime('--tooltip-close-delay', 100));
  };

  const handleOpenChange = (open) => {
    if (open) return;
    hoveredRef.current = null;
    clearTimeout(openTimer.current);
    setIsOpen(false);
  };

  return (
    <div className={className} onPointerOut={handlePointerOut} onPointerOver={handlePointerOver}>
      {children}
      {/* isOpen must sit on the root: React Aria positions the content from the root's state, not the content's. */}
      <Tooltip isOpen={isOpen} onOpenChange={handleOpenChange}>
        <Tooltip.Content className='max-w-60 rounded p-0 text-wrap' triggerRef={anchorRef}>
          <Chip className='w-fit rounded-xl' color={tooltip.color} size='sm' variant='soft'>
            {tooltip.key}
          </Chip>
        </Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function readCSSTime(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) return fallback;
  if (value.endsWith('ms')) return parsed;
  if (value.endsWith('s')) return parsed * 1000;
  return parsed;
}
