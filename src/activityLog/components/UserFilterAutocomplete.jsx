import {
  Autocomplete,
  Avatar,
  Description,
  EmptyState,
  Label,
  ListBox,
  ListBoxLoadMoreItem,
  SearchField,
  Spinner
} from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getCustomAvatarUserIds, searchUsers } from '@/services';
import { getInitials } from '@/utils';

/**
 * UserFilterAutocomplete Component
 * Single-select autocomplete with async user fetching
 */
export function UserFilterAutocomplete({
  domoInstance,
  onChange,
  placeholder = 'Filter by user...',
  tabId,
  value = null
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
        const { totalCount, users: fetchedUsers } = await searchUsers(
          '',
          tabId,
          0
        );
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
        const { totalCount, users: fetchedUsers } = await searchUsers(
          searchText,
          tabId,
          0
        );
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
      const { totalCount, users: fetchedUsers } = await searchUsers(
        searchText,
        tabId,
        searchOffset
      );
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

  return (
    <Autocomplete
      aria-label='User'
      className='w-full sm:w-72'
      isOpen={isOpen}
      placeholder={placeholder}
      value={value}
      variant='secondary'
      onChange={(key) => onChange?.(key || null)}
      onOpenChange={setIsOpen}
    >
      <Autocomplete.Trigger aria-label='User autocomplete trigger'>
        <Autocomplete.Value aria-label='Selected user'>
          {({ defaultChildren, isPlaceholder, state }) => {
            if (isPlaceholder || state.selectedItems.length === 0) {
              return defaultChildren;
            }
            const selectedItem = state.selectedItems[0];
            const user = users.find((u) => u.id === selectedItem?.key);
            if (!user) return defaultChildren;
            return (
              <div className='flex items-center gap-2'>
                <span className='truncate text-sm'>{user.displayName}</span>
              </div>
            );
          }}
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover
        aria-label='User autocomplete popover'
        className='h-fit max-h-160'
        placement='bottom left'
      >
        <Autocomplete.Filter
          inputValue={searchText}
          onInputChange={setSearchText}
        >
          <SearchField
            autoFocus
            aria-label='Search user filter field'
            name='user-search'
            variant='secondary'
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input
                aria-label='Search users'
                placeholder='Search users...'
              />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <ListBox
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
              <ListBox.Item
                id={user.id}
                key={user.id}
                textValue={user.displayName}
              >
                <Avatar size='sm'>
                  {customAvatarIds.has(user.id) && (
                    <Avatar.Image src={getAvatarUrl(user.id)} />
                  )}
                  <Avatar.Fallback>
                    {getInitials(user.displayName)}
                  </Avatar.Fallback>
                </Avatar>
                <div className='flex flex-col'>
                  <Label>{user.displayName}</Label>
                  <Description>{user.emailAddress}</Description>
                </div>
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
            {hasMore && (
              <ListBoxLoadMoreItem
                isLoading={isLoadingMore}
                onLoadMore={loadMoreUsers}
              >
                Load more users...
              </ListBoxLoadMoreItem>
            )}
          </ListBox>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
