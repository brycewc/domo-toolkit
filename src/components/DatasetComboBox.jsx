import { Collection, ComboBox, EmptyState, Input, Label, ListBox, ListBoxLoadMoreItem, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { searchDatasets } from '@/services/datasets';
import { isSidepanel } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';

/**
 * Async paginated dataset search ComboBox.
 * Encapsulates search state, pagination, and dataset item rendering.
 *
 * Accepts a Domo dataset UUID pasted directly into the input — when the text
 * parses as a valid DATA_SOURCE id, the list collapses to that one dataset.
 *
 * @param {Object} props
 * @param {string} [props.instanceBaseUrl] - Base URL for the Domo instance (e.g. "https://instance.domo.com"), used for provider icons
 * @param {string} [props.className] - Additional CSS class for the ComboBox
 * @param {Set<string>} [props.excludeIds] - Dataset IDs to omit from results (e.g. the origin dataset)
 * @param {boolean} [props.isActive=true] - Whether to fetch datasets (use false when inside a closed modal)
 * @param {string} [props.maxListHeight] - Override max height class for the list
 * @param {number|null} [props.tabId] - Chrome tab ID for API calls
 * @param {Object} rest - All other props are forwarded to the ComboBox (e.g. aria-label, autoFocus, formValue, isRequired, name, selectedKey, onSelectionChange)
 */
export function DatasetComboBox({
  className,
  excludeIds,
  instanceBaseUrl,
  isActive = true,
  label = 'Dataset',
  maxListHeight,
  menuTrigger = 'focus',
  selectedDisplayName,
  tabId = null,
  ...comboBoxProps
}) {
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [datasets, setDatasets] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const debounceRef = useRef(null);
  const isOpenRef = useRef(false);
  const searchGenRef = useRef(0);

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  useEffect(() => {
    if (selectedDisplayName) {
      setSelectedName(selectedDisplayName);
      setInputValue(selectedDisplayName);
    }
  }, [selectedDisplayName]);

  useEffect(() => {
    if (!isActive) return;

    const controller = new AbortController();
    searchGenRef.current += 1;
    const gen = searchGenRef.current;

    async function fetchDatasets() {
      setOffset(0);
      try {
        const { datasets: fetched, totalCount } = await searchDatasets(searchQuery, tabId, 0);
        if (!controller.signal.aborted && gen === searchGenRef.current) {
          const filtered = excludeIds ? fetched.filter((d) => !excludeIds.has(d.id)) : fetched;
          setDatasets(filtered);
          setHasMore(totalCount !== null && fetched.length < totalCount);
          setOffset(fetched.length);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching datasets:', error);
        }
      }
    }

    fetchDatasets();

    return () => controller.abort();
  }, [isActive, searchQuery, tabId, excludeIds]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    const gen = searchGenRef.current;
    try {
      const { datasets: fetched, totalCount } = await searchDatasets(searchQuery, tabId, offset);
      if (gen !== searchGenRef.current) return;
      const filtered = excludeIds ? fetched.filter((d) => !excludeIds.has(d.id)) : fetched;
      // Dedupe by id when merging — Domo's search occasionally returns the
      // same row across pages, and React requires unique keys per item.
      const seen = new Set(datasets.map((d) => d.id));
      const merged = [...datasets];
      for (const d of filtered) {
        if (!seen.has(d.id)) {
          seen.add(d.id);
          merged.push(d);
        }
      }
      setDatasets(merged);
      setHasMore(totalCount !== null && merged.length < totalCount);
      setOffset(offset + fetched.length);
    } catch (error) {
      console.error('Error loading more datasets:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  const handleInputChange = (value) => {
    setInputValue(value);
    clearTimeout(debounceRef.current);
    if (value !== selectedName) {
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    }
  };

  const handleOpenChange = (open) => {
    isOpenRef.current = open;
    clearTimeout(debounceRef.current);
    if (open) {
      setSearchQuery('');
    } else if (selectedName) {
      setInputValue(selectedName);
    }
  };

  const { onSelectionChange, ...restComboBoxProps } = comboBoxProps;
  const handleSelectionChange = (key) => {
    clearTimeout(debounceRef.current);
    const selectedDataset = key != null ? datasets.find((d) => d.id === key) : null;
    if (key != null) {
      if (selectedDataset) {
        setSelectedName(selectedDataset.name);
        setInputValue(selectedDataset.name);
      }
    } else if (selectedName && !isOpenRef.current) {
      setInputValue(selectedName);
      setSearchQuery('');
      return;
    } else {
      setSelectedName('');
      setInputValue('');
    }
    setSearchQuery('');
    // Forward the resolved name too, so a parent can persist it and re-seed
    // `selectedDisplayName` after the picker unmounts and remounts.
    onSelectionChange?.(key, selectedDataset?.name ?? null);
  };

  const listHeight = maxListHeight || (isSidepanel() ? 'max-h-60' : 'max-h-30');

  // Results are filtered server-side by searchDatasets (by name OR id), so
  // disable the ComboBox's built-in client filter (a "contains" match against
  // each item's textValue, the dataset name). Without this, pasting an id hides
  // the server-matched result because the id isn't a substring of the name.
  return (
    <ComboBox
      allowsEmptyCollection
      isRequired
      className={className}
      defaultFilter={() => true}
      inputValue={inputValue}
      menuTrigger={menuTrigger}
      variant='secondary'
      onInputChange={handleInputChange}
      onOpenChange={handleOpenChange}
      onSelectionChange={handleSelectionChange}
      {...restComboBoxProps}
    >
      <Label>{label}</Label>
      <ComboBox.InputGroup>
        <Input placeholder='Search datasets by name or ID...' />
        <ComboBox.Trigger>
          <IconChevronDown />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover placement='bottom start'>
        <ListBox
          className={`overflow-y-auto ${listHeight}`}
          renderEmptyState={() => <EmptyState>No datasets found</EmptyState>}
        >
          <Collection items={datasets}>
            {(dataset) => (
              <ListBox.Item
                className='min-h-14'
                id={dataset.id}
                key={dataset.id}
                textValue={dataset.name}
                title={dataset.name}
              >
                <div className='size-8 shrink-0 overflow-hidden rounded-sm bg-surface-secondary'>
                  {dataset.dataProviderType && instanceBaseUrl ? (
                    <img
                      alt=''
                      className='size-full object-contain'
                      src={`${instanceBaseUrl}/api/data/v1/providers/${dataset.dataProviderType}/images/96.png`}
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                </div>
                <Label className='line-clamp-2 break-all'>{dataset.name}</Label>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            )}
          </Collection>
          {hasMore && (
            <ListBoxLoadMoreItem isLoading={isLoadingMore} onLoadMore={loadMore}>
              <div className='flex items-center justify-center gap-2 py-2'>
                <Spinner size='sm' />
                <span className='text-sm text-muted'>Loading more...</span>
              </div>
            </ListBoxLoadMoreItem>
          )}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}
