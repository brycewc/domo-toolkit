import { useState, useEffect } from 'react';
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
  Collection,
  ComboBox,
  Description,
  Button,
  EmptyState,
  Form,
  Input,
  Label,
  ListBox,
  ListBoxLoadMoreItem,
  Modal,
  Spinner,
  Tooltip
} from '@heroui/react';
import {
  IconChevronDown,
  IconUser,
  IconUserEdit,
  IconX
} from '@tabler/icons-react';
import { updateOwner, searchUsers } from '@/services';
import { isSidepanel } from '@/utils';

export function UpdateOwner({ currentContext, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // Async user search state (replaces useAsyncList)
  const [filterText, setFilterText] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Pagination state
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  // Fetch users when modal opens or filter text changes (resets pagination)
  useEffect(() => {
    // Only fetch when modal is open
    if (!isOpen) return;

    const controller = new AbortController();

    async function fetchUsers() {
      setIsLoading(true);
      setOffset(0);
      try {
        const { users: fetchedUsers, totalCount } = await searchUsers(
          filterText,
          currentContext?.tabId,
          0
        );
        console.log('Fetched users:', fetchedUsers, 'Total:', totalCount);
        // Only update if this request wasn't aborted
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
          setHasMore(totalCount !== null && fetchedUsers.length < totalCount);
          setOffset(fetchedUsers.length);
        }
      } catch (error) {
        // Ignore abort errors, log others
        if (error.name !== 'AbortError') {
          console.error('Error fetching users:', error);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    }

    fetchUsers();

    // Cleanup: abort the request if filterText changes before completion
    return () => {
      controller.abort();
    };
  }, [isOpen, filterText, currentContext?.tabId]);

  // Load more users (pagination)
  const loadMore = async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);
    try {
      const { users: fetchedUsers, totalCount } = await searchUsers(
        filterText,
        currentContext?.tabId,
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

  // Set current user ID from context when modal opens
  useEffect(() => {
    if (isOpen && currentContext?.user?.id) {
      setCurrentUserId(currentContext.user.id);
    }
  }, [isOpen, currentContext?.user?.id]);

  // Core submit logic - accepts ownerId directly to avoid async state issues
  const submitOwnerUpdate = async (ownerId) => {
    if (!ownerId) {
      onStatusUpdate?.('Blank owner', 'Please enter an owner', 'warning', 2000);
      return;
    }

    setIsSubmitting(true);

    try {
      await updateOwner({
        object: currentContext?.domoObject,
        owner: ownerId,
        tabId: currentContext?.tabId
      });

      // Show success message in popup (popup stays open)
      onStatusUpdate?.(
        `${currentContext.domoObject.typeName} Owner Updated Successfully`,
        `Updated ${currentContext.domoObject.typeName.toLowerCase()} owner to ${ownerId}`,
        'success',
        3000
      );
      setIsOpen(false);
      chrome.tabs.reload(currentContext?.tabId);
    } catch (error) {
      console.error(
        `Error updating ${currentContext.domoObject.typeName}:`,
        error
      );
      onStatusUpdate?.(
        `Failed to Update ${currentContext.domoObject.typeName} Owner`,
        error.message || 'An error occurred',
        'danger',
        5000
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    console.log('Submitted value:', formData.get('owner')); // Will be the selected owner ID
    await submitOwnerUpdate(formData.get('owner'));
  };

  const handleSetToSelf = async () => {
    await submitOwnerUpdate(currentUserId);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
      <Tooltip delay={400} closeDelay={0}>
        <Button
          variant='tertiary'
          fullWidth
          isDisabled={
            currentContext?.domoObject.typeId !== 'ALERT' &&
            currentContext?.domoObject.typeId !== 'WORKFLOW_MODEL'
          }
          className='relative min-w-fit flex-1 basis-[48%] overflow-visible'
        >
          <IconUserEdit stroke={1.5} />
          Update Owner
        </Button>
        <Tooltip.Content>
          Update {currentContext?.domoObject.typeName} owner
        </Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container scroll='outside' placement='top' className='p-1'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger
              className='absolute top-2 right-2'
              variant='ghost'
            >
              <IconX stroke={1.5} />
            </Modal.CloseTrigger>
            <Form onSubmit={handleSubmit} id='update-owner-form'>
              <Modal.Header>
                <Modal.Heading>
                  Update {currentContext?.domoObject.typeName} Owner
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex justify-center'>
                <ComboBox
                  allowsEmptyCollection
                  autoFocus
                  isRequired
                  menuTrigger='input'
                  inputValue={filterText}
                  onInputChange={setFilterText}
                  defaultInputValue={null}
                  aria-label='Owner'
                  name='owner'
                  form='update-owner-form'
                  formValue='key'
                  className='w-[95%]'
                >
                  <ComboBox.InputGroup variant='secondary'>
                    <Input placeholder='Search users...' />
                    <ComboBox.Trigger>
                      <IconChevronDown stroke={1} />
                    </ComboBox.Trigger>
                  </ComboBox.InputGroup>
                  <ComboBox.Popover placement='bottom start'>
                    <ListBox
                      className={`overflow-y-auto ${isSidepanel() ? 'max-h-100' : 'max-h-30'}`}
                      renderEmptyState={() => (
                        <EmptyState>No users found</EmptyState>
                      )}
                    >
                      <Collection items={users}>
                        {(user) => (
                          <ListBox.Item
                            id={user.id}
                            key={user.id}
                            textValue={user.displayName}
                          >
                            <Avatar size='sm'>
                              <AvatarImage
                                src={`${currentContext?.domoObject?.baseUrl}/api/content/v1/avatar/USER/${user.id}?size=100`}
                              />
                              <AvatarFallback>
                                {user.displayName.charAt(0).toUpperCase()}
                              </AvatarFallback>
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
                            <span className='text-sm text-muted'>
                              Loading more...
                            </span>
                          </div>
                        </ListBoxLoadMoreItem>
                      )}
                    </ListBox>
                  </ComboBox.Popover>
                </ComboBox>
              </Modal.Body>
              <Modal.Footer className='flex items-center justify-between'>
                <Tooltip delay={200} closeDelay={0}>
                  <Button
                    variant='tertiary'
                    size='sm'
                    onPress={handleSetToSelf}
                    isDisabled={isSubmitting || !currentUserId}
                    isIconOnly
                  >
                    <IconUser stroke={1.5} />
                  </Button>
                  <Tooltip.Content>Update owner to yourself</Tooltip.Content>
                </Tooltip>
                <div className='flex gap-2'>
                  <Button
                    slot='close'
                    variant='tertiary'
                    size='sm'
                    isDisabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    variant='primary'
                    type='submit'
                    size='sm'
                    isDisabled={isSubmitting}
                    isPending={isSubmitting}
                    isIconOnly={isSubmitting}
                  >
                    {({ isPending }) =>
                      isPending ? (
                        <Spinner color='currentColor' size='sm' />
                      ) : (
                        'Save'
                      )
                    }
                  </Button>
                </div>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
