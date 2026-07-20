import {
  Avatar,
  Collection,
  ComboBox,
  Description,
  EmptyState,
  Header,
  Input,
  Label,
  ListBox,
  ListBoxLoadMoreItem,
  Spinner
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { searchGroups } from '@/services/groups';
import { searchUsers } from '@/services/users';
import { getInitials } from '@/utils/general';
import { isSidepanel } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';

const SOURCE_LABELS = { GROUP: 'Groups', USER: 'Users' };

/**
 * Async paginated owner-search ComboBox. Consolidates the former UserComboBox
 * and GroupComboBox into one picker that can search users only, groups only, or
 * both, and select one owner or many.
 *
 * Search is server-side and debounced; each active source paginates
 * independently (its own "load more"). When both sources are shown they render
 * as two labeled sections. A user and a group can share a numeric id, so item
 * keys are namespaced `${type}:${id}` whenever more than one source is shown or
 * the picker is multi-select; single-source single-select keeps the bare id so
 * existing consumers' `selectedKey` / `onSelectionChange` contract is unchanged.
 *
 * Selection modes differ in how they control the field:
 * - `single` retains one selection via the controlled `selectedKey` / `inputValue`
 *   pair (unchanged from the old components).
 * - `multiple` never controls the selection. It emits each pick via `onSelect`
 *   and then remounts the field (bumping an internal key) to reset it. Pinning a
 *   controlled `selectedKey` here makes React Aria call `flushSync` during
 *   render in a loop, so remounting is used to reset instead.
 *
 * @param {Object} props
 * @param {string} [props.avatarBaseUrl] - Base URL for avatar images (e.g. "https://instance.domo.com")
 * @param {string} [props.className] - Additional CSS class for the ComboBox
 * @param {Set<string>} [props.excludeKeys] - Namespaced `${type}:${id}` keys to hide (already-picked owners)
 * @param {boolean} [props.isActive=true] - Whether to fetch (use false inside a closed modal)
 * @param {string} [props.label] - Visible field label; omit to rely on an aria-label
 * @param {number} [props.maxListHeight] - Max height (px) for the dropdown list
 * @param {(entity: {displayName: string, id: string, type: string}) => void} [props.onSelect]
 *   Fired on each pick in multi-select mode with the chosen owner
 * @param {string} [props.selectedDisplayName] - Display name for an externally-set selection (single mode)
 * @param {'single'|'multiple'} [props.selectionMode='single'] - Retain one selection, or emit each pick and reset
 * @param {Array<'USER'|'GROUP'>} [props.sources=['USER','GROUP']] - Which entity types to search
 * @param {number|null} [props.tabId=null] - Chrome tab ID for API calls
 * @param {Object} rest - Forwarded to the ComboBox (e.g. aria-label, autoFocus, isRequired, menuTrigger, selectedKey, onSelectionChange)
 */
export function OwnerComboBox({
  avatarBaseUrl,
  className,
  excludeKeys,
  isActive = true,
  label,
  maxListHeight,
  menuTrigger = 'focus',
  onSelect,
  selectedDisplayName,
  selectionMode = 'single',
  sources = ['USER', 'GROUP'],
  tabId = null,
  ...comboBoxProps
}) {
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [resetNonce, setResetNonce] = useState(0);
  const [state, setState] = useState({
    GROUP: { hasMore: false, items: [], loadingMore: false, offset: 0 },
    USER: { hasMore: false, items: [], loadingMore: false, offset: 0 }
  });

  const debounceRef = useRef(null);
  const isOpenRef = useRef(false);
  const searchGenRef = useRef(0);

  const isMultiple = selectionMode === 'multiple';
  const namespacedKeys = isMultiple || sources.length > 1;
  const both = sources.length > 1;
  const sourcesKey = sources.join(',');

  useEffect(() => {
    return () => clearTimeout(debounceRef.current);
  }, []);

  // Sync internal state when parent provides a display name for an external
  // selection (single mode only; multi-select never retains a value).
  useEffect(() => {
    if (!isMultiple && selectedDisplayName) {
      setSelectedName(selectedDisplayName);
      setInputValue(selectedDisplayName);
    }
  }, [isMultiple, selectedDisplayName]);

  // Fetch page 0 for each active source whenever the debounced query changes.
  useEffect(() => {
    if (!isActive) return;
    const controller = new AbortController();
    searchGenRef.current += 1;
    const gen = searchGenRef.current;
    for (const type of sourcesKey.split(',')) {
      (async () => {
        try {
          const { hasMore, items } = await searchOwners(type, searchQuery, tabId, 0);
          if (!controller.signal.aborted && gen === searchGenRef.current) {
            patch(type, { hasMore, items, offset: items.length });
          }
        } catch (error) {
          if (error.name !== 'AbortError') console.error(`Error fetching ${type}s:`, error);
        }
      })();
    }
    return () => controller.abort();
  }, [isActive, searchQuery, sourcesKey, tabId]);

  const patch = (type, changes) => setState((prev) => ({ ...prev, [type]: { ...prev[type], ...changes } }));

  const itemKey = (entity) => (namespacedKeys ? `${entity.type}:${entity.id}` : String(entity.id));

  const findEntity = (key) => sources.flatMap((type) => state[type].items).find((entity) => itemKey(entity) === key);

  const visibleItems = (type) =>
    state[type].items.filter((entity) => !(excludeKeys && excludeKeys.has(`${entity.type}:${entity.id}`)));

  const loadMore = async (type) => {
    const slice = state[type];
    if (slice.loadingMore || !slice.hasMore) return;
    patch(type, { loadingMore: true });
    const gen = searchGenRef.current;
    try {
      const { hasMore, items } = await searchOwners(type, searchQuery, tabId, slice.offset);
      if (gen !== searchGenRef.current) return;
      setState((prev) => ({
        ...prev,
        [type]: {
          hasMore,
          items: [...prev[type].items, ...items],
          loadingMore: false,
          offset: prev[type].offset + items.length
        }
      }));
    } catch (error) {
      console.error(`Error loading more ${type}s:`, error);
      patch(type, { loadingMore: false });
    }
  };

  // Debounce query updates — each keystroke would otherwise trigger an
  // executeInPage call per source, freezing the UI.
  const handleInputChange = (value) => {
    clearTimeout(debounceRef.current);
    if (!isMultiple) setInputValue(value);
    if (isMultiple || value !== selectedName) {
      debounceRef.current = setTimeout(() => {
        setSearchQuery(value);
      }, 300);
    }
  };

  // Dropdown opens → reset search to show everything; closes → restore the
  // selected name (single mode only).
  const handleOpenChange = (open) => {
    isOpenRef.current = open;
    clearTimeout(debounceRef.current);
    if (open) {
      setSearchQuery('');
    } else if (!isMultiple && selectedName) {
      setInputValue(selectedName);
    }
  };

  const { onSelectionChange, selectedKey, ...restComboBoxProps } = comboBoxProps;
  const handleSelectionChange = (key) => {
    clearTimeout(debounceRef.current);
    const entity = key != null ? findEntity(key) : null;

    if (isMultiple) {
      // Emit the pick, then remount to reset. The parent owns the chosen set
      // (rendered as chips) and hides picks via excludeKeys. Remounting avoids
      // the flushSync render loop a controlled `selectedKey` would cause here.
      if (entity) onSelect?.(entity);
      setSearchQuery('');
      setResetNonce((n) => n + 1);
      return;
    }

    if (key != null) {
      if (entity) {
        setSelectedName(entity.displayName);
        setInputValue(entity.displayName);
      }
    } else if (selectedName && !isOpenRef.current) {
      // Blur-triggered reset — the selection isn't in the current collection
      // (e.g. a search re-fetched a different page). Keep the existing value.
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

  // Passed to the popover's maxHeight so React Aria caps it to min(this, available space).
  const listHeight = maxListHeight ?? (isSidepanel() ? 240 : 120);
  const placeholder = both ? 'Search users and groups...' : sources[0] === 'GROUP' ? 'Search groups...' : 'Search users...';
  const emptyText = both ? 'No users or groups found' : sources[0] === 'GROUP' ? 'No groups found' : 'No users found';

  const renderItems = (type) => (
    <>
      <Collection items={visibleItems(type)}>
        {(entity) => (
          <ListBox.Item id={itemKey(entity)} key={itemKey(entity)} textValue={entity.displayName}>
            <Avatar size='sm'>
              <Avatar.Image
                src={avatarBaseUrl ? `${avatarBaseUrl}/api/content/v1/avatar/${entity.type}/${entity.id}?size=100` : undefined}
              />
              <Avatar.Fallback>{getInitials(entity.displayName)}</Avatar.Fallback>
            </Avatar>
            <div className='flex flex-col'>
              <Label>{entity.displayName}</Label>
              {entity.description && <Description>{entity.description}</Description>}
            </div>
            <ListBox.ItemIndicator />
          </ListBox.Item>
        )}
      </Collection>
      {state[type].hasMore && (
        <ListBoxLoadMoreItem isLoading={state[type].loadingMore} onLoadMore={() => loadMore(type)}>
          <div className='flex items-center justify-center gap-2 py-2'>
            <Spinner size='sm' />
            <span className='text-sm text-muted'>Loading more...</span>
          </div>
        </ListBoxLoadMoreItem>
      )}
    </>
  );

  return (
    <ComboBox
      allowsEmptyCollection
      className={className}
      isRequired={!isMultiple}
      key={isMultiple ? resetNonce : undefined}
      menuTrigger={menuTrigger}
      variant='secondary'
      onInputChange={handleInputChange}
      onOpenChange={handleOpenChange}
      onSelectionChange={handleSelectionChange}
      {...(isMultiple ? {} : { inputValue, selectedKey })}
      {...restComboBoxProps}
    >
      {label && <Label>{label}</Label>}
      <ComboBox.InputGroup>
        <Input placeholder={placeholder} />
        <ComboBox.Trigger>
          <IconChevronDown />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover maxHeight={listHeight} placement='bottom start'>
        <ListBox renderEmptyState={() => <EmptyState>{emptyText}</EmptyState>}>
          {both
            ? sources.map((type) => (
                <ListBox.Section key={type}>
                  <Header>{SOURCE_LABELS[type]}</Header>
                  {renderItems(type)}
                </ListBox.Section>
              ))
            : renderItems(sources[0])}
        </ListBox>
      </ComboBox.Popover>
    </ComboBox>
  );
}

// Fetch one page of owners of a given type, normalized to a common entity shape
// and a uniform `hasMore` flag (users paginate by total count, groups by their
// own hasMore signal).
async function searchOwners(type, query, tabId, offset) {
  if (type === 'GROUP') {
    const { groups, hasMore } = await searchGroups(query, tabId, offset);
    return {
      hasMore,
      items: groups.map((group) => ({
        description: group.memberCount != null ? `${group.memberCount} ${group.memberCount === 1 ? 'member' : 'members'}` : '',
        displayName: group.name,
        id: String(group.id),
        type: 'GROUP'
      }))
    };
  }
  const { totalCount, users } = await searchUsers(query, tabId, offset);
  const items = users.map((user) => ({
    description: user.emailAddress || '',
    displayName: user.displayName,
    id: String(user.id),
    type: 'USER'
  }));
  return { hasMore: totalCount != null && offset + items.length < totalCount, items };
}
