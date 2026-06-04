import { Button, Description, Form, Input, Label, Modal, Switch, TextField, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { UserComboBox } from '@/components/UserComboBox';
import { getFullUserDetails, getUserDetails } from '@/services/users';
import IconPerson from '@icons/person.svg?react';
import IconX from '@icons/x.svg?react';

/**
 * Modal that collects the destination user, email/delete preferences, and
 * a confirmation submit. The parent owns the per-leaf selection state and
 * passes pre-computed summary counts (`selectedTypeCount`,
 * `selectedObjectCount`) so the modal stays leaf-id agnostic. On submit, the
 * modal closes immediately and hands form data to the parent's `onSubmit` —
 * the parent runs the transfer pipeline (transferAllOwnership +
 * email-new-owner + delete-user) and threads progress into DataList rows via
 * the parent's transferStatus state.
 *
 * @param {Object} props
 * @param {Object} props.currentContext - Active DomoContext (carries baseUrl, tabId, user.metadata.USER_RIGHTS, and the source user's reportsTo).
 * @param {boolean} props.isOpen
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(formData: { toUserId: number, toUserDisplayName: string|null, emailNewOwner: boolean, deleteAfterTransfer: boolean, targetUser: { displayName: string|null, email: string|null }|null }) => void} props.onSubmit
 * @param {number} props.selectedObjectCount - Number of individual leaves currently selected, summed across types. Drives the confirmation summary line.
 * @param {number} props.selectedTypeCount - Number of types with ≥1 leaf selected. Drives the summary line AND gates submit (0 ⇒ disabled).
 * @param {{ id: number|string, name: string }} props.sourceUser
 */
export function TransferOwnershipModal({
  currentContext,
  isOpen,
  onOpenChange,
  onSubmit,
  selectedObjectCount,
  selectedTypeCount,
  sourceUser
}) {
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState(null);
  const [emailNewOwner, setEmailNewOwner] = useState(false);
  const [deleteAfterTransfer, setDeleteAfterTransfer] = useState(false);
  const [targetUser, setTargetUser] = useState(null);
  const [manager, setManager] = useState(null);

  // Reset form whenever the modal opens fresh — stale picks from a previous
  // session shouldn't leak into the next attempt.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedUserId(null);
    setSelectedDisplayName(null);
    setEmailNewOwner(false);
    setDeleteAfterTransfer(false);
    setTargetUser(null);
  }, [isOpen]);

  // Resolve manager (reportsTo) for the manager-shortcut button. Only fires
  // while the modal is open so we don't waste lookups.
  useEffect(() => {
    if (!isOpen) return;
    const reportsTo = currentContext?.domoObject?.metadata?.context?.reportsTo;
    if (!reportsTo || !currentContext?.tabId) {
      setManager(null);
      return;
    }
    let cancelled = false;
    getUserDetails(reportsTo, currentContext.tabId)
      .then((details) => {
        if (cancelled || !details) return;
        setManager({
          active: details.active,
          id: details.id,
          name: details.displayName
        });
      })
      .catch(() => {
        if (!cancelled) setManager(null);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentContext?.domoObject?.metadata?.context?.reportsTo, currentContext?.tabId]);

  // Resolve email + displayName for the destination whenever it changes.
  // Powers the email-toggle's enable state and the attachment's "New Owner
  // Name" column when the parent emails the recipient post-transfer.
  useEffect(() => {
    if (!selectedUserId || !currentContext?.tabId) {
      setTargetUser(null);
      return;
    }
    setTargetUser(null);
    let cancelled = false;
    getFullUserDetails(selectedUserId, currentContext.tabId)
      .then((user) => {
        if (cancelled || !user) return;
        setTargetUser({
          displayName: user.displayName || null,
          email: user.emailAddress || user.email || null
        });
      })
      .catch(() => {
        if (!cancelled) setTargetUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedUserId, currentContext?.tabId]);

  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  const canDeleteUsers = userRights.includes('user.edit');

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!selectedUserId || selectedTypeCount === 0) return;

    const formData = {
      deleteAfterTransfer: deleteAfterTransfer && canDeleteUsers,
      emailNewOwner: emailNewOwner && !!targetUser?.email,
      targetUser,
      toUserDisplayName: selectedDisplayName ?? targetUser?.displayName ?? null,
      toUserId: selectedUserId
    };

    // Close modal immediately so per-row transfer progress is visible
    // underneath; the parent runs transferAllOwnership and updates DataList
    // rows via its transferStatus state.
    onOpenChange(false);
    onSubmit(formData);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='top' scroll='outside'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Form id='transfer-ownership-form' onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>Transfer Ownership</Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex flex-col gap-2'>
                <TextField isReadOnly className='pointer-events-none'>
                  <Label>Transfer From</Label>
                  <Input value={sourceUser?.name || 'Unknown User'} variant='secondary' />
                </TextField>

                <div className='flex items-end gap-1'>
                  <UserComboBox
                    avatarBaseUrl={currentContext?.domoObject?.baseUrl}
                    className='min-w-0 flex-1'
                    isActive={isOpen}
                    label='Transfer To'
                    selectedDisplayName={selectedDisplayName}
                    selectedKey={selectedUserId}
                    tabId={currentContext?.tabId}
                    onSelectionChange={(key) => {
                      setSelectedUserId(key);
                      setSelectedDisplayName(null);
                    }}
                  />
                  <Tooltip closeDelay={50} delay={800}>
                    <Button
                      isIconOnly
                      isDisabled={!manager || !manager.active}
                      size='md'
                      variant='tertiary'
                      onPress={() => {
                        if (!manager?.id) return;
                        setSelectedUserId(manager.id);
                        setSelectedDisplayName(manager.name);
                      }}
                    >
                      <IconPerson />
                    </Button>
                    <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-balance break-normal'>
                      {manager?.active
                        ? `Transfer to manager: ${manager.name}`
                        : manager
                          ? `Manager ${manager.name} is inactive`
                          : 'No manager assigned'}
                    </Tooltip.Content>
                  </Tooltip>
                </div>

                <Switch
                  isDisabled={!targetUser?.email}
                  isSelected={emailNewOwner && !!targetUser?.email}
                  onChange={setEmailNewOwner}
                >
                  <Switch.Control>
                    <Switch.Thumb />
                  </Switch.Control>
                  <Switch.Content>
                    <Label>Email new owner with summary</Label>
                    <Description>
                      {targetUser?.email
                        ? `Sends an Excel attachment to ${targetUser.email}`
                        : selectedUserId
                          ? 'Email unavailable for selected user'
                          : 'Select a destination user to enable'}
                    </Description>
                  </Switch.Content>
                </Switch>

                {canDeleteUsers && (
                  <Switch isSelected={deleteAfterTransfer} onChange={setDeleteAfterTransfer}>
                    {({ isSelected }) => (
                      <>
                        <Switch.Control className={isSelected ? 'bg-danger' : ''}>
                          <Switch.Thumb />
                        </Switch.Control>
                        <Switch.Content>
                          <Label>Delete user after transfer</Label>
                          <Description>Only if all transfers succeed</Description>
                        </Switch.Content>
                      </>
                    )}
                  </Switch>
                )}

                <p className='text-xs text-muted'>
                  <span className='font-medium text-foreground'>{selectedTypeCount}</span> type
                  {selectedTypeCount !== 1 ? 's' : ''},{' '}
                  <span className='font-medium text-foreground'>{selectedObjectCount}</span> object
                  {selectedObjectCount !== 1 ? 's' : ''} selected
                </p>
              </Modal.Body>
              <Modal.Footer className='flex justify-end gap-2'>
                <Button size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button isDisabled={!selectedUserId || selectedTypeCount === 0} size='sm' type='submit' variant='primary'>
                  Transfer
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
