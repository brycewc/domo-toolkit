import {
  Autocomplete,
  Avatar,
  Description,
  EmptyState,
  Label,
  ListBox,
  ListBoxLoadMoreItem,
  SearchField,
  Spinner,
  Tag,
  TagGroup,
  ToggleButton,
  ToggleButtonGroup
} from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getCustomAvatarUserIds, searchUsers } from '@/services/users';
import { getInitials } from '@/utils/general';

const MAX_VISIBLE_TAGS = 5;

/**
 * UserFilterAutocomplete Component
 * Multi-select autocomplete with async user fetching
 */
export function UserFilterAutocomplete({
  domoInstance,
  mode = 'include',
  onChange,
  onModeChange,
  placeholder = 'Filter by users...',
  tabId,
  value = []
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasFetchedInitial, setHasFetchedInitial] = useState(false);
  const [customAvatarIds, setCustomAvatarIds] = useState(new Set());
  const lastFetchedSearch = useRef(null);

  // Persist selected user objects across searches so tags always have names
  const selectedUsersRef = useRef(new Map());

  const checkAvatars = useCallback(
    (fetchedUsers) => {
      if (!tabId || fetchedUsers.length === 0) return;
      const ids = fetchedUsers.map((u) => u.id);
      getCustomAvatarUserIds(ids, tabId)
        .then((customIds) =>
          setCustomAvatarIds((prev) => {
            const next = new Set(prev);
            customIds.forEach((id) => next.add(id));
            return next;
          })
        )
        .catch(() => {});
    },
    [tabId]
  );

  // Fetch initial users on mount
  useEffect(() => {
    if (!tabId || hasFetchedInitial) return;

    const controller = new AbortController();

    async function fetchInitialUsers() {
      setIsLoading(true);
      try {
        const { totalCount, users: fetchedUsers } = await searchUsers('', tabId, 0);
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
          setHasMore(totalCount !== null && fetchedUsers.length < totalCount);
          setSearchOffset(fetchedUsers.length);
          lastFetchedSearch.current = '';
          setHasFetchedInitial(true);
          checkAvatars(fetchedUsers);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching initial users:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchInitialUsers();

    return () => {
      controller.abort();
    };
  }, [tabId, hasFetchedInitial]);

  // Refetch users when search text changes (debounced)
  useEffect(() => {
    // Skip if no tabId or if this is the initial empty search
    if (!tabId || !hasFetchedInitial) return;
    // Skip if we already fetched this exact search term
    if (searchText === lastFetchedSearch.current) return;

    const controller = new AbortController();
    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      setSearchOffset(0);
      try {
        const { totalCount, users: fetchedUsers } = await searchUsers(searchText, tabId, 0);
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
          setHasMore(totalCount !== null && fetchedUsers.length < totalCount);
          setSearchOffset(fetchedUsers.length);
          lastFetchedSearch.current = searchText;
          checkAvatars(fetchedUsers);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching users:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }, 300); // 300ms debounce

    return () => {
      clearTimeout(debounceTimer);
      controller.abort();
    };
  }, [searchText, tabId, hasFetchedInitial]);

  // Load more users for pagination
  const loadMoreUsers = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const { totalCount, users: fetchedUsers } = await searchUsers(searchText, tabId, searchOffset);
      const newUsers = [...users, ...fetchedUsers];
      setUsers(newUsers);
      setHasMore(totalCount !== null && newUsers.length < totalCount);
      setSearchOffset(newUsers.length);
      checkAvatars(fetchedUsers);
    } catch (error) {
      console.error('Error loading more users:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, searchText, tabId, searchOffset, users]);

  // Build avatar URL
  const getAvatarUrl = useCallback(
    (user) => {
      if (!domoInstance) return null;
      return `https://${domoInstance}.domo.com/api/content/v1/avatar/USER/${user}?size=100`;
    },
    [domoInstance]
  );

  // Handle selection changes — update ref map and notify parent
  const handleChange = useCallback(
    (keys) => {
      const selectedKeys = keys || [];
      // Add newly selected users to the ref map
      for (const key of selectedKeys) {
        if (!selectedUsersRef.current.has(key)) {
          const user = users.find((u) => u.id === key);
          if (user) {
            selectedUsersRef.current.set(key, user);
          }
        }
      }
      // Remove deselected users from the ref map
      for (const existingKey of selectedUsersRef.current.keys()) {
        if (!selectedKeys.includes(existingKey)) {
          selectedUsersRef.current.delete(existingKey);
        }
      }
      onChange?.(selectedKeys);
    },
    [onChange, users]
  );

  // Handle removing individual tags
  const handleRemoveTags = useCallback(
    (keys) => {
      const updated = value.filter((key) => !keys.has(key));
      for (const key of keys) {
        selectedUsersRef.current.delete(key);
      }
      onChange?.(updated);
    },
    [onChange, value]
  );

  // Resolve a user's display name from ref map or current users list
  const getUserName = useCallback(
    (userId) => {
      const fromRef = selectedUsersRef.current.get(userId);
      if (fromRef) return fromRef.displayName;
      const fromList = users.find((u) => u.id === userId);
      return fromList?.displayName || userId;
    },
    [users]
  );

  // Toggle between include ('in') and exclude ('not in') filter modes. Single
  // selection + disallowEmptySelection means the Set always has exactly one key.
  const handleModeChange = useCallback(
    (keys) => {
      const next = [...keys][0];
      if (next) onModeChange?.(next);
    },
    [onModeChange]
  );

  return (
    <Autocomplete
      aria-label='User'
      className='w-full sm:min-w-72 sm:flex-1'
      isOpen={isOpen}
      placeholder={placeholder}
      selectionMode='multiple'
      value={value}
      variant='secondary'
      onChange={handleChange}
      onOpenChange={setIsOpen}
    >
      <Autocomplete.Trigger aria-label='User autocomplete trigger'>
        <Autocomplete.Value aria-label='Selected users'>
          {({ defaultChildren }) => {
            if (value.length === 0) {
              return defaultChildren;
            }
            const visibleKeys = value.slice(0, MAX_VISIBLE_TAGS);
            const overflowCount = value.length - visibleKeys.length;
            return (
              <div className='flex min-w-0 flex-row items-center gap-1'>
                <span className='shrink-0 text-xs font-medium text-muted'>{mode === 'exclude' ? 'not in' : 'in'}</span>
                <TagGroup
                  className='flex min-w-0 flex-row items-center gap-1'
                  size='sm'
                  variant='surface'
                  onRemove={handleRemoveTags}
                >
                  <TagGroup.List className='flex-nowrap'>
                    {visibleKeys.map((key) => (
                      <Tag id={key} key={key}>
                        <span className='truncate text-xs'>{getUserName(key)}</span>
                      </Tag>
                    ))}
                  </TagGroup.List>
                  {overflowCount > 0 && <span className='shrink-0 text-xs text-muted'>+{overflowCount} more</span>}
                </TagGroup>
              </div>
            );
          }}
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover
        aria-label='User autocomplete popover'
        className='flex h-fit max-h-120! w-120! min-w-0! flex-col overflow-hidden!'
        placement='bottom left'
      >
        <Autocomplete.Filter inputValue={searchText} onInputChange={setSearchText}>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label='User filter mode'
            className='my-2 mb-2 w-full'
            selectedKeys={new Set([mode])}
            selectionMode='single'
            size='sm'
            onSelectionChange={handleModeChange}
          >
            <ToggleButton className='flex-1' id='include'>
              in
            </ToggleButton>
            <ToggleButton className='flex-1' id='exclude'>
              not in
            </ToggleButton>
          </ToggleButtonGroup>
          <SearchField autoFocus aria-label='Search user filter field' name='user-search' variant='secondary'>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input aria-label='Search users' placeholder='Search users...' />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
            className='min-h-0 flex-1 overflow-y-auto'
            items={users}
            renderEmptyState={() =>
              isLoading ? (
                <div className='flex items-center justify-center p-4'>
                  <Spinner size='sm' />
                </div>
              ) : (
                <EmptyState>No users found</EmptyState>
              )
            }
          >
            {users?.map((user) => (
              <ListBox.Item id={user.id} key={user.id} textValue={user.displayName}>
                <Avatar size='sm'>
                  {customAvatarIds.has(user.id) && <Avatar.Image src={getAvatarUrl(user.id)} />}
                  <Avatar.Fallback>{getInitials(user.displayName)}</Avatar.Fallback>
                </Avatar>
                <div className='flex flex-col'>
                  <Label>{user.displayName}</Label>
                  <Description>{user.emailAddress}</Description>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
            {hasMore && (
              <ListBoxLoadMoreItem isLoading={isLoadingMore} onLoadMore={loadMoreUsers}>
                <div className='flex items-center justify-center gap-2 py-2'>
                  <Spinner size='sm' />
                  <span className='muted text-sm'>Loading more users...</span>
                </div>
              </ListBoxLoadMoreItem>
            )}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
