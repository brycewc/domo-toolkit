import { useState, useMemo, useCallback, useEffect } from 'react';
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
import { searchUsers } from '@/services';

/**
 * UserFilterAutocomplete Component - FULL VERSION
 * With async user fetching
 */
export function UserFilterAutocomplete({
  value = [],
  onChange,
  tabId,
  domoInstance,
  placeholder = 'Filter by user...'
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchOffset, setSearchOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasFetchedInitial, setHasFetchedInitial] = useState(false);

  // Fetch initial users on mount
  useEffect(() => {
    if (!tabId || hasFetchedInitial) return;

    const controller = new AbortController();

    async function fetchInitialUsers() {
      setIsLoading(true);
      try {
        const { users: fetchedUsers, totalCount } = await searchUsers(
          '',
          tabId,
          0
        );
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
          setHasMore(totalCount !== null && fetchedUsers.length < totalCount);
          setSearchOffset(fetchedUsers.length);
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
    // Also skip if searchText is empty and we already have initial data
    if (searchText === '' && users.length > 0) return;

    const controller = new AbortController();
    const debounceTimer = setTimeout(async () => {
      setIsLoading(true);
      setSearchOffset(0);
      try {
        const { users: fetchedUsers, totalCount } = await searchUsers(
          searchText,
          tabId,
          0
        );
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
          setHasMore(totalCount !== null && fetchedUsers.length < totalCount);
          setSearchOffset(fetchedUsers.length);
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
      const { users: fetchedUsers, totalCount } = await searchUsers(
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
      placeholder={placeholder}
      selectionMode='multiple'
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      value={value}
      onChange={(keys) => onChange?.(keys || [])}
      aria-label='User'
      variant='secondary'
      className='w-full'
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
                size='sm'
                onRemove={onRemoveTags}
                aria-label='Selected users tags'
                variant='surface'
              >
                <TagGroup.List>
                  {selectedItemsKeys.map((selectedItemKey) => {
                    const user = users.find((u) => u.id === selectedItemKey);
                    if (!user) return null;
                    return (
                      <Tag
                        key={user.id}
                        id={user.id}
                        aria-label={`Selected user ${user.displayName}`}
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
              )
            }
          >
            {users?.map((user) => (
              <ListBox.Item
                key={user.id}
                id={user.id}
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
                onLoadMore={loadMoreUsers}
                isLoading={isLoadingMore}
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
