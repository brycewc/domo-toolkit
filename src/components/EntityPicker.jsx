import { Button, EmptyState, SearchField, Spinner } from '@heroui/react';
import { AnimatePresence, motion } from 'motion/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import IconArrowLeft from '@icons/arrow-left.svg?react';
import IconExternalLink from '@icons/arrow-square-out.svg?react';
import IconCheck from '@icons/check.svg?react';
import IconSearch from '@icons/search.svg?react';

const DEBOUNCE_MS = 300;

/**
 * Reusable master-detail picker. Shows a searchable list of items (master); pressing
 * a row slides in a detail panel (over the list) whose Select button is the confirming
 * second press. Built for the narrow side panel: the detail panel is a full-width
 * overlay rather than a side-by-side split.
 *
 * Behavior is driven entirely by an `adapter` config so the same component serves any
 * entity. Two data sources are supported:
 *   - static (adapter.paginated falsy): adapter.items is a pre-fetched list, filtered
 *     client-side by the search box.
 *   - paginated (adapter.paginated true): adapter.search({ query, offset, tabId }) is
 *     called with a debounced query and again to load more as the list scrolls.
 *
 * Adapter shape:
 *   paginated?: boolean
 *   items?: Array            // static source
 *   search?: ({ query, offset, tabId }) => Promise<{ items, totalCount }>  // paginated
 *   matchesQuery?: (item, loweredQuery) => boolean   // static filter override
 *   getKey(item) => string|number
 *   getTitle(item) => string
 *   getHref?: (item) => string       // optional; renders the detail title as an external link
 *   renderRow(item) => ReactNode
 *   renderDetail(item, detail) => ReactNode
 *   loadDetail?: (item, { tabId }) => Promise<any>   // optional async panel enrichment
 *   emptyLabel?: string
 *   searchPlaceholder?: string
 *
 * @param {Object} props
 * @param {Object} props.adapter - Entity adapter config (see above)
 * @param {Set<string|number>} [props.excludeIds] - Item keys to hide from the list
 * @param {ReactNode} [props.filterSlot] - Extra filter control rendered under the search box.
 *   The parent owns the filter state and pre-filters `adapter.items`; the picker just places it.
 * @param {() => void} [props.onCancel] - Back out of the picker without selecting
 * @param {(item: Object) => void} props.onSelect - Confirm callback (the second press)
 * @param {number|null} [props.tabId] - Chrome tab ID for adapter API calls
 * @param {string} [props.title] - Header label
 */
export function EntityPicker({ adapter, excludeIds, filterSlot, onCancel, onSelect, tabId, title }) {
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [items, setItems] = useState(() => (adapter.paginated ? [] : adapter.items || []));
  const [isLoading, setIsLoading] = useState(Boolean(adapter.paginated));
  const [error, setError] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [detail, setDetail] = useState(null);
  const [isLoadingDetail, setIsLoadingDetail] = useState(false);

  const debounceRef = useRef(null);
  const searchGenRef = useRef(0);
  const detailGenRef = useRef(0);

  useEffect(() => () => clearTimeout(debounceRef.current), []);

  // Static source: keep items in sync with whatever list the adapter carries.
  useEffect(() => {
    if (!adapter.paginated) setItems(adapter.items || []);
  }, [adapter]);

  // Paginated source: (re)load the first page when the debounced query changes.
  useEffect(() => {
    if (!adapter.paginated) return;
    const gen = (searchGenRef.current += 1);
    setIsLoading(true);
    setError(null);
    adapter
      .search({ offset: 0, query: searchQuery, tabId })
      .then(({ items: fetched, totalCount }) => {
        if (gen !== searchGenRef.current) return;
        setItems(fetched);
        setOffset(fetched.length);
        setHasMore(totalCount != null && fetched.length < totalCount);
      })
      .catch((e) => {
        if (gen === searchGenRef.current) setError(e?.message || 'Failed to load');
      })
      .finally(() => {
        if (gen === searchGenRef.current) setIsLoading(false);
      });
  }, [adapter, searchQuery, tabId]);

  const visibleItems = useMemo(() => {
    let list = items;
    if (excludeIds && excludeIds.size) list = list.filter((item) => !excludeIds.has(adapter.getKey(item)));
    if (!adapter.paginated) {
      const query = inputValue.trim().toLowerCase();
      if (query) {
        list = list.filter((item) =>
          adapter.matchesQuery
            ? adapter.matchesQuery(item, query)
            : String(adapter.getTitle(item) ?? '')
                .toLowerCase()
                .includes(query) || String(adapter.getKey(item)) === query
        );
      }
    }
    return list;
  }, [adapter, excludeIds, inputValue, items]);

  const handleInputChange = (value) => {
    setInputValue(value);
    if (adapter.paginated) {
      clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => setSearchQuery(value), DEBOUNCE_MS);
    }
  };

  const loadMore = async () => {
    if (isLoadingMore || !hasMore || !adapter.paginated) return;
    setIsLoadingMore(true);
    const gen = searchGenRef.current;
    try {
      const { items: fetched, totalCount } = await adapter.search({ offset, query: searchQuery, tabId });
      if (gen !== searchGenRef.current) return;
      const seen = new Set(items.map((item) => adapter.getKey(item)));
      const merged = [...items];
      for (const item of fetched) {
        const key = adapter.getKey(item);
        if (!seen.has(key)) {
          seen.add(key);
          merged.push(item);
        }
      }
      setItems(merged);
      setOffset(offset + fetched.length);
      setHasMore(totalCount != null && merged.length < totalCount);
    } catch {
      // Leave the already-loaded page in place; the user can retry by scrolling.
    } finally {
      setIsLoadingMore(false);
    }
  };

  const openDetail = (item) => {
    setSelectedItem(item);
    setDetail(null);
    if (!adapter.loadDetail) return;
    const gen = (detailGenRef.current += 1);
    setIsLoadingDetail(true);
    adapter
      .loadDetail(item, { tabId })
      .then((result) => {
        if (gen === detailGenRef.current) setDetail(result);
      })
      .catch(() => {})
      .finally(() => {
        if (gen === detailGenRef.current) setIsLoadingDetail(false);
      });
  };

  return (
    <div className='relative flex min-h-0 w-full flex-1 flex-col'>
      <div className='flex shrink-0 items-center gap-2 pb-2'>
        {onCancel && (
          <Button isIconOnly size='sm' variant='ghost' onPress={onCancel}>
            <IconArrowLeft />
          </Button>
        )}
        {title && <span className='min-w-0 flex-1 truncate text-sm font-medium'>{title}</span>}
      </div>

      <SearchField
        fullWidth
        aria-label='Search'
        className='shrink-0'
        value={inputValue}
        variant='secondary'
        onChange={handleInputChange}
      >
        <SearchField.Group className='h-8'>
          <SearchField.SearchIcon>
            <IconSearch />
          </SearchField.SearchIcon>
          <SearchField.Input placeholder={adapter.searchPlaceholder || 'Search...'} />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>

      {filterSlot && <div className='mt-2 flex shrink-0 items-center'>{filterSlot}</div>}

      <div className='mt-2 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto'>
        {isLoading ? (
          <div className='flex flex-1 items-center justify-center py-8'>
            <Spinner size='lg' />
          </div>
        ) : error ? (
          <div className='py-4 text-center text-sm text-danger'>{error}</div>
        ) : visibleItems.length === 0 ? (
          <EmptyState>{adapter.emptyLabel || 'No results'}</EmptyState>
        ) : (
          visibleItems.map((item) => (
            <PickerRow key={adapter.getKey(item)} onPress={() => openDetail(item)}>
              {adapter.renderRow(item)}
            </PickerRow>
          ))
        )}
        {adapter.paginated && hasMore && !isLoading && (
          <Button isDisabled={isLoadingMore} size='sm' variant='ghost' onPress={loadMore}>
            {isLoadingMore ? <Spinner size='sm' /> : 'Load more'}
          </Button>
        )}
      </div>

      <AnimatePresence>
        {selectedItem && (
          <motion.div
            animate={{ x: 0 }}
            className='absolute inset-0 flex min-h-0 flex-col bg-surface'
            exit={{ x: '100%' }}
            initial={{ x: '100%' }}
            transition={{ damping: 30, stiffness: 320, type: 'spring' }}
          >
            <div className='flex shrink-0 items-center gap-2 pb-2'>
              <Button isIconOnly size='sm' variant='ghost' onPress={() => setSelectedItem(null)}>
                <IconArrowLeft />
              </Button>
              {adapter.getHref?.(selectedItem) ? (
                <a
                  className='flex min-w-0 flex-1 items-center gap-1 text-sm font-medium hover:underline'
                  href={adapter.getHref(selectedItem)}
                  rel='noreferrer'
                  target='_blank'
                >
                  <span className='truncate'>{adapter.getTitle(selectedItem)}</span>
                  <IconExternalLink className='shrink-0 text-muted' size={14} />
                </a>
              ) : (
                <span className='min-w-0 flex-1 truncate text-sm font-medium'>{adapter.getTitle(selectedItem)}</span>
              )}
            </div>
            <div className='min-h-0 flex-1 overflow-y-auto'>
              {isLoadingDetail ? (
                <div className='flex flex-1 items-center justify-center py-8'>
                  <Spinner size='lg' />
                </div>
              ) : (
                adapter.renderDetail(selectedItem, detail)
              )}
            </div>
            <div className='shrink-0 pt-2'>
              <Button fullWidth variant='primary' onPress={() => onSelect(selectedItem)}>
                <IconCheck />
                Select
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PickerRow({ children, onPress }) {
  return (
    <button
      className='flex w-full items-center gap-2 rounded-md p-2 text-left transition-colors hover:bg-surface-secondary'
      type='button'
      onClick={onPress}
    >
      {children}
    </button>
  );
}
