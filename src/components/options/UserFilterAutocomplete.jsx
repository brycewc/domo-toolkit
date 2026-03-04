import {
  Autocomplete,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Description,
  EmptyState,
  Label,
  ListBox,
  ListBoxLoadMoreItem,
  SearchField,
  Spinner,
  Tag,
  TagGroup
} from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { searchUsers } from '@/services';

/**
 * UserFilterAutocomplete Component - FULL VERSION
 * With async user fetching
 */
export function UserFilterAutocomplete({
  domoInstance,
  onChange,
  placeholder = 'Filter by user...',
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
  const lastFetchedSearch = useRef(null);

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
    } catch (error) {
      console.error('Error loading more users:', error);
    } finally {
      setIsLoadingMore(false);
    }
  }, [isLoadingMore, hasMore, searchText, tabId, searchOffset, users]);

  // Build avatar URL
  const getAvatarUrl = useCallback(
    (userId) => {
      if (!domoInstance) return null;
      return `https://${domoInstance}.domo.com/api/content/v1/avatar/USER/${userId}?size=100`;
    },
    [domoInstance]
  );

  // Handle removing tags from selection
  const onRemoveTags = useCallback(
    (keys) => {
      const keysArray = Array.from(keys);
      const newValue = value.filter((key) => !keysArray.includes(key));
      onChange?.(newValue);
    },
    [value, onChange]
  );

  return (
    <Autocomplete
      aria-label='User'
      className='w-full'
      isOpen={isOpen}
      placeholder={placeholder}
      selectionMode='multiple'
      value={value}
      variant='secondary'
      onChange={(keys) => onChange?.(keys || [])}
      onOpenChange={setIsOpen}
    >
      <Autocomplete.Trigger aria-label='User autocomplete trigger'>
        <Autocomplete.Value aria-label='Selected users'>
          {({ defaultChildren, isPlaceholder, state }) => {
            if (isPlaceholder || state.selectedItems.length === 0) {
              return defaultChildren;
            }
            const selectedItemsKeys = state.selectedItems.map(
              (item) => item.key
            );
            return (
              <TagGroup
                aria-label='Selected users tags'
                size='sm'
                variant='surface'
                onRemove={onRemoveTags}
              >
                <TagGroup.List>
                  {selectedItemsKeys.map((selectedItemKey) => {
                    const user = users.find((u) => u.id === selectedItemKey);
                    if (!user) return null;
                    return (
                      <Tag
                        aria-label={`Selected user ${user.displayName}`}
                        id={user.id}
                        key={user.id}
                        variant=''
                      >
                        {user.displayName}
                      </Tag>
                    );
                  })}
                </TagGroup.List>
              </TagGroup>
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
          <SearchField autoFocus name='user-search' variant='secondary'>
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder='Search users...' />
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
              )}
          >
            {users?.map((user) => (
              <ListBox.Item
                id={user.id}
                key={user.id}
                textValue={user.displayName}
              >
                <Avatar size='sm'>
                  <AvatarImage src={getAvatarUrl(user.id)} />
                  <AvatarFallback>
                    {user.displayName?.charAt(0).toUpperCase()}
                  </AvatarFallback>
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
