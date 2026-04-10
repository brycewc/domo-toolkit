import {
  Avatar,
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
import { IconChevronDown } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { searchUsers } from '@/services';
import { getInitials, isSidepanel } from '@/utils';

/**
 * Async paginated user search ComboBox.
 * Encapsulates search state, pagination, and user item rendering.
 *
 * @param {Object} props
 * @param {string} [props.avatarBaseUrl] - Base URL for avatar images (e.g. "https://instance.domo.com")
 * @param {string} [props.className] - Additional CSS class for the ComboBox
 * @param {boolean} [props.isActive=true] - Whether to fetch users (use false when inside a closed modal)
 * @param {string} [props.maxListHeight] - Override max height class for the list
 * @param {number|null} [props.tabId] - Chrome tab ID for API calls
 * @param {Object} rest - All other props are forwarded to the ComboBox (e.g. aria-label, autoFocus, formValue, isRequired, name, selectedKey, onSelectionChange)
 */
export function UserComboBox({
  avatarBaseUrl,
  className,
  isActive = true,
  label = 'User',
  maxListHeight,
  menuTrigger = 'focus',
  tabId = null,
  ...comboBoxProps
}) {
  const [inputValue, setInputValue] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedName, setSelectedName] = useState('');
  const [users, setUsers] = useState([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch users based on searchQuery (decoupled from inputValue)
  useEffect(() => {
    if (!isActive) return;

    const controller = new AbortController();

    async function fetchUsers() {
      setOffset(0);
      try {
        const { totalCount, users: fetchedUsers } = await searchUsers(
          searchQuery,
          tabId,
          0
        );
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
          setHasMore(totalCount !== null && fetchedUsers.length < totalCount);
          setOffset(fetchedUsers.length);
        }
      } catch (error) {
        if (error.name !== 'AbortError') {
          console.error('Error fetching users:', error);
        }
      }
    }

    fetchUsers();

    return () => controller.abort();
  }, [isActive, searchQuery, tabId]);

  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;
    setIsLoadingMore(true);
    try {
      const { totalCount, users: fetchedUsers } = await searchUsers(
        searchQuery,
        tabId,
        offset
      );
      const newUsers = [...users, ...fetchedUsers];
      setUsers(newUsers);
      setHasMore(totalCount !== null && newUsers.length < totalCount);
      setOffset(newUsers.length);
    } catch (error) {
      console.error('Error loading more users:', error);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // onInputChange fires for both user typing AND programmatic resets.
  // Only update searchQuery when the value differs from the current selection
  // — this prevents re-searching on the selected name when the dropdown opens.
  const handleInputChange = (value) => {
    setInputValue(value);
    if (value !== selectedName) {
      setSearchQuery(value);
    }
  };

  // Dropdown opens → reset search to show all users; closes → restore selected name
  const handleOpenChange = (open) => {
    if (open) {
      setSearchQuery('');
    } else if (selectedName) {
      setInputValue(selectedName);
    }
  };

  const { onSelectionChange, ...restComboBoxProps } = comboBoxProps;
  const handleSelectionChange = (key) => {
    if (key != null) {
      const selected = users.find((u) => u.id === key);
      if (selected) {
        setSelectedName(selected.displayName);
        setInputValue(selected.displayName);
      }
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
        <Input placeholder='Search users...' />
        <ComboBox.Trigger>
          <IconChevronDown stroke={1} />
        </ComboBox.Trigger>
      </ComboBox.InputGroup>
      <ComboBox.Popover placement='bottom start'>
        <ListBox
          className={`overflow-y-auto ${listHeight}`}
          renderEmptyState={() => <EmptyState>No users found</EmptyState>}
        >
          <Collection items={users}>
            {(user) => (
              <ListBox.Item
                id={user.id}
                key={user.id}
                textValue={user.displayName}
              >
                <Avatar size='sm'>
                  <Avatar.Image
                    src={
                      avatarBaseUrl
                        ? `${avatarBaseUrl}/api/content/v1/avatar/USER/${user.id}?size=100`
                        : undefined
                    }
                  />
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
            )}
          </Collection>
          {hasMore && (
            <ListBoxLoadMoreItem
              isLoading={isLoadingMore}
              onLoadMore={loadMore}
            >
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
