import { useState, useEffect } from 'react';
import {
  Autocomplete,
  Avatar,
  AvatarFallback,
  AvatarImage,
  Description,
  Button,
  EmptyState,
  Form,
  Label,
  ListBox,
  Modal,
  SearchField,
  Spinner,
  Tooltip
} from '@heroui/react';
import { IconUser, IconUserEdit } from '@tabler/icons-react';
import { updateOwner, getCurrentUserId, searchUsers } from '@/services';
import { executeInPage, isSidepanel } from '@/utils';

export function UpdateOwner({ currentContext, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentUserId, setCurrentUserId] = useState(null);
  const [owner, setOwner] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // Async user search state (replaces useAsyncList)
  const [filterText, setFilterText] = useState('');
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Fetch users when modal opens or filter text changes
  useEffect(() => {
    // Only fetch when modal is open
    if (!isOpen) return;

    const controller = new AbortController();

    async function fetchUsers() {
      setIsLoading(true);
      try {
        const fetchedUsers = await searchUsers(
          filterText,
          currentContext?.tabId
        );
        console.log('Fetched users:', fetchedUsers);
        // Only update if this request wasn't aborted
        if (!controller.signal.aborted) {
          setUsers(fetchedUsers);
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

  // Initialize form values when modal opens
  useEffect(() => {
    async function fetchCurrentUserId() {
      try {
        const userId = await executeInPage(
          getCurrentUserId,
          [],
          currentContext?.tabId
        );
        setCurrentUserId(userId);
      } catch (error) {
        console.error('Error fetching current user ID:', error);
      }
    }

    if (isOpen) {
      fetchCurrentUserId();
    }
  }, [isOpen, currentContext?.tabId]);

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
    await submitOwnerUpdate(owner);
  };

  const handleSetToSelf = async () => {
    setOwner(currentUserId);
    await submitOwnerUpdate(currentUserId);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button
        variant='tertiary'
        fullWidth
        isDisabled={
          currentContext?.domoObject.typeId !== 'ALERT' &&
          currentContext?.domoObject.typeId !== 'WORKFLOW_MODEL'
        }
      >
        <IconUserEdit size={4} />
        Update {currentContext?.domoObject.typeName} Owner
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll='outside' placement='top' className='p-1'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger className='absolute top-2 right-2' />
            <Form onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>
                  Update {currentContext?.domoObject.typeName} Owner
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex flex-col gap-2'>
                <Autocomplete
                  fullWidth
                  placeholder='Select owner'
                  selectionMode='single'
                  isRequired
                  variant='secondary'
                  value={owner}
                  onChange={setOwner}
                  aria-label='Owner'
                >
                  {/* <Label>Owner</Label> */}
                  <Autocomplete.Trigger>
                    <Autocomplete.Value />
                    <Autocomplete.ClearButton />
                    <Autocomplete.Indicator />
                  </Autocomplete.Trigger>
                  <Autocomplete.Popover className='overflow-y-hidden'>
                    <Autocomplete.Filter
                      inputValue={filterText}
                      onInputChange={setFilterText}
                    >
                      <SearchField
                        autoFocus
                        className='sticky top-0 z-10 w-full'
                        name='search'
                        aria-label='Search users'
                      >
                        <SearchField.Group>
                          <SearchField.SearchIcon />
                          <SearchField.Input placeholder='Search users...' />
                          {isLoading ? (
                            <Spinner
                              className='absolute top-1/2 right-2 -translate-y-1/2'
                              size='sm'
                            />
                          ) : (
                            <SearchField.ClearButton />
                          )}
                        </SearchField.Group>
                      </SearchField>
                      <ListBox
                        className={`overflow-y-auto ${isSidepanel() ? 'max-h-100' : 'max-h-30'}`}
                        renderEmptyState={() => (
                          <EmptyState>No users found</EmptyState>
                        )}
                        items={users}
                      >
                        {(user) => (
                          <ListBox.Item
                            id={user.id}
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
                      </ListBox>
                    </Autocomplete.Filter>
                  </Autocomplete.Popover>
                </Autocomplete>
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
                    <IconUser size={4} />
                  </Button>
                  <Tooltip.Content>Set to yourself</Tooltip.Content>
                </Tooltip>
                <div className='flex gap-1'>
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
