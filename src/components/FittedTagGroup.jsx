import { Tag, TagGroup } from '@heroui/react';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

// Must match HeroUI's `.tag-group__list` gap-1.5 and the gap-1 set on the group below.
const LIST_GAP_PX = 6;
const OVERFLOW_GAP_PX = 4;

/**
 * FittedTagGroup Component
 * Removable tags on a single line that show as many whole tags as fit the available
 * width and count the rest as "+N more", re-fitting whenever the space changes. At least
 * one tag always shows, truncated if even it does not fit.
 * @param {Object} props
 * @param {string} props.ariaLabel - Accessible name for the tag group
 * @param {Array<{className?: string, id: string|number, label: string}>} props.items - Tags in display order
 * @param {Function} props.onRemove - Called with the Set of removed tag IDs
 */
export function FittedTagGroup({ ariaLabel, items, onRemove }) {
  const containerRef = useRef(null);
  const measureRef = useRef(null);
  const [visibleCount, setVisibleCount] = useState(items.length);

  const itemsKey = useMemo(() => items.map((item) => `${item.id}:${item.label}`).join('|'), [items]);

  const fit = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;

    const available = container.clientWidth;
    const tagWidths = [...measure.querySelectorAll('[data-measure-tag]')].map((el) => el.getBoundingClientRect().width);
    const overflowWidth = measure.querySelector('[data-measure-overflow]').getBoundingClientRect().width;

    let used = 0;
    let count = 0;
    for (let i = 0; i < tagWidths.length; i++) {
      const next = used + (i > 0 ? LIST_GAP_PX : 0) + tagWidths[i];
      const reserve = i < tagWidths.length - 1 ? OVERFLOW_GAP_PX + overflowWidth : 0;
      if (next + reserve > available) break;
      used = next;
      count = i + 1;
    }
    setVisibleCount(Math.max(1, count));
  }, []);

  useLayoutEffect(() => {
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [fit, itemsKey]);

  const visibleItems = items.slice(0, visibleCount);
  const overflowCount = items.length - visibleItems.length;

  return (
    <div className='relative min-w-0 flex-1' ref={containerRef}>
      <TagGroup
        aria-label={ariaLabel}
        className='flex min-w-0 flex-row items-center gap-1'
        size='sm'
        variant='surface'
        onRemove={onRemove}
      >
        <TagGroup.List className='min-w-0 flex-nowrap'>
          {visibleItems.map((item) => (
            <Tag className={`min-w-0 ${item.className ?? ''}`} id={item.id} key={item.id} textValue={item.label}>
              <span className='truncate text-xs'>{item.label}</span>
            </Tag>
          ))}
        </TagGroup.List>
        {overflowCount > 0 && <span className='shrink-0 text-xs text-muted'>+{overflowCount} more</span>}
      </TagGroup>
      {/* Every tag at its natural width, so fit() can tell how many would fit. */}
      <div
        aria-hidden='true'
        className='pointer-events-none invisible absolute top-0 left-0 flex gap-1.5 whitespace-nowrap'
        ref={measureRef}
      >
        {items.map((item) => (
          <span data-measure-tag className={`tag tag--sm tag--surface ${item.className ?? ''}`} key={item.id}>
            <span className='text-xs'>{item.label}</span>
            <span className='size-3 shrink-0' />
          </span>
        ))}
        <span data-measure-overflow className='text-xs'>
          +{items.length} more
        </span>
      </div>
    </div>
  );
}
