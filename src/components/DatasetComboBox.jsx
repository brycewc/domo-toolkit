import {
  Collection,
  ComboBox,
  Description,
  EmptyState,
  Input,
  Label,
  ListBox,
  ListBoxLoadMoreItem,
  Spinner
} from '@heroui/react';
import { IconChevronDown, IconDatabase } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { searchDatasets } from '@/services';
import { isSidepanel } from '@/utils';

/**
 * Async paginated dataset search ComboBox. Mirrors `UserComboBox` for
 * dataset selection (used by the migrate-downstream-content target picker).
 *
 * @param {Object} props
 * @param {string} [props.className]
 * @param {boolean} [props.isActive=true] - Whether to fetch (false when inside a closed modal)
 * @param {string} [props.label='Dataset']
 * @param {string} [props.maxListHeight]
 * @param {string} [props.menuTrigger='focus']
 * @param {string} [props.selectedDisplayName]
 * @param {Set<string>} [props.excludeIds] - Dataset IDs to omit from results (e.g. the origin dataset)
 * @param {number|null} [props.tabId]
 */
export function DatasetComboBox({
  className,
  excludeIds,
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
        if (controller.signal.aborted || gen !== searchGenRef.current) return;
        const filtered = excludeIds ? fetched.filter((d) => !excludeIds.has(d.id)) : fetched;
        setDatasets(filtered);
        setHasMore(totalCount !== null && fetched.length < totalCount);
        setOffset(fetched.length);
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
      const merged = [...datasets, ...filtered];
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
    if (key != null) {
      const selected = datasets.find((d) => d.id === key);
      if (selected) {
        setSelectedName(selected.name);
        setInputValue(selected.name);
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
    onSelectionChange?.(key);
  };

  const listHeight = maxListHeight || (isSidepanel() ? 'max-h-60' : 'max-h-30');

  return (
    <ComboBox
      allowsEmptyCollection
      isRequired
      className={className}
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
        <Input placeholder='Search datasets...' />
        <ComboBox.Trigger>
          <IconChevronDown stroke={1} />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover placement='bottom start'>
        <ListBox
          className={`overflow-y-auto ${listHeight}`}
          renderEmptyState={() => <EmptyState>No datasets found</EmptyState>}
        >
          <Collection items={datasets}>
            {(dataset) => (
              <ListBox.Item id={dataset.id} key={dataset.id} textValue={dataset.name}>
                <IconDatabase size={20} stroke={1.5} />
                <div className='flex flex-col'>
                  <Label>{dataset.name}</Label>
                  <Description>{dataset.owner || dataset.id}</Description>
                </div>
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
