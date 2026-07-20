import { Button, Description, Form, Input, Label, Modal, Switch, TextField, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { OwnerComboBox } from '@/components/OwnerComboBox';
import { fetchGroupDisplayNames } from '@/services/groups';
import { getFullUserDetails, getUserDetails } from '@/services/users';
import IconPerson from '@icons/person.svg?react';
import IconX from '@icons/x.svg?react';

/**
 * Modal that collects the destination owner, email/delete preferences, and
 * a confirmation submit. The parent owns the per-leaf selection state and
 * passes pre-computed summary counts (`selectedTypeCount`,
 * `selectedObjectCount`) so the modal stays leaf-id agnostic. On submit, the
 * modal closes immediately and hands form data to the parent's `onSubmit` —
 * the parent runs the transfer pipeline (transferAllOwnership +
 * email-new-owner + delete-user) and threads progress into DataList rows via
 * the parent's transferStatus state.
 *
 * The source can be a user or a group (`ownerType`). A group source transfers
 * group→group: the destination picker lists groups, the manager shortcut and
 * "email new owner"/"delete after transfer" toggles (all user-only) are
 * hidden, and the destination has no email address.
 *
 * @param {Object} props
 * @param {Object} props.currentContext - Active DomoContext (carries baseUrl, tabId, user.metadata.USER_RIGHTS, and the source user's reportsTo).
 * @param {boolean} props.isOpen
 * @param {'USER'|'GROUP'} [props.ownerType='USER'] - Owner type of the source and destination.
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(formData: { toOwnerId: number, toOwnerType: 'USER'|'GROUP', toDisplayName: string|null, emailNewOwner: boolean, emailCurrentUser: boolean, deleteAfterTransfer: boolean, target: { displayName: string|null, email: string|null }|null, currentUser: { displayName: string|null, email: string|null }|null }) => void} props.onSubmit
 * @param {number} props.selectedObjectCount - Number of individual leaves currently selected, summed across types. Drives the confirmation summary line.
 * @param {number} props.selectedTypeCount - Number of types with ≥1 leaf selected. Drives the summary line AND gates submit (0 ⇒ disabled).
 * @param {{ id: number|string, name: string }} props.sourceUser
 */
export function TransferOwnershipModal({
  currentContext,
  isOpen,
  onOpenChange,
  onSubmit,
  ownerType = 'USER',
  selectedObjectCount,
  selectedTypeCount,
  sourceUser
}) {
  const isGroup = ownerType === 'GROUP';

  const [selectedOwnerId, setSelectedOwnerId] = useState(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState(null);
  const [emailNewOwner, setEmailNewOwner] = useState(false);
  const [emailCurrentUser, setEmailCurrentUser] = useState(true);
  const [deleteAfterTransfer, setDeleteAfterTransfer] = useState(false);
  const [target, setTarget] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [manager, setManager] = useState(null);

  // Reset the email/delete toggles whenever the modal opens fresh. The chosen
  // destination is intentionally NOT cleared here: the combobox keeps its own
  // displayed selection across close/reopen, so wiping selectedOwnerId would
  // desync the parent (the combobox shows a name while the form thinks nothing
  // is picked, which would also make Transfer silently no-op). Leaving it lets
  // the selection, its resolved email, and the switch description all persist
  // in lockstep with what the combobox still shows.
  useEffect(() => {
    if (!isOpen) return;
    setEmailNewOwner(false);
    setEmailCurrentUser(true);
    setDeleteAfterTransfer(false);
  }, [isOpen]);

  // Resolve manager (reportsTo) for the manager-shortcut button. User-only, so
  // skipped for a group source. Only fires while the modal is open so we don't
  // waste lookups.
  useEffect(() => {
    if (!isOpen || isGroup) return;
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
  }, [isGroup, isOpen, currentContext?.domoObject?.metadata?.context?.reportsTo, currentContext?.tabId]);

  // Resolve email + displayName for the destination whenever it changes.
  // Powers the email-toggle's description and the attachment's "New Owner
  // Name" column when the parent emails the recipient post-transfer. Groups
  // have no email, so the group branch resolves only a display name.
  useEffect(() => {
    if (!selectedOwnerId || !currentContext?.tabId) {
      setTarget(null);
      return;
    }
    setTarget(null);
    let cancelled = false;
    if (isGroup) {
      fetchGroupDisplayNames([selectedOwnerId], currentContext.tabId)
        .then((map) => {
          if (cancelled) return;
          setTarget({ displayName: map?.[selectedOwnerId] || null, email: null });
        })
        .catch(() => {
          if (!cancelled) setTarget(null);
        });
    } else {
      getFullUserDetails(selectedOwnerId, currentContext.tabId)
        .then((user) => {
          if (cancelled || !user) return;
          setTarget({
            displayName: user.displayName || null,
            email: user.emailAddress || user.email || null
          });
        })
        .catch(() => {
          if (!cancelled) setTarget(null);
        });
    }
    return () => {
      cancelled = true;
    };
  }, [isGroup, selectedOwnerId, currentContext?.tabId]);

  // Resolve the current (toolkit) user's email so the "email me" toggle can
  // show the address and the parent can add it to the post-transfer email's
  // recipient list. Unlike the destination lookup, this runs as soon as the
  // context is ready (not gated on isOpen) and is never cleared on reopen: the
  // toolkit user never changes within a session, so prefetching once and
  // caching the result means the address is already present the moment the
  // modal opens, with no flash of the generic "to you" fallback.
  useEffect(() => {
    const currentUserId = currentContext?.user?.id;
    if (!currentUserId || !currentContext?.tabId) {
      setCurrentUser(null);
      return;
    }
    let cancelled = false;
    getFullUserDetails(currentUserId, currentContext.tabId)
      .then((user) => {
        if (cancelled || !user) return;
        setCurrentUser({
          displayName: user.displayName || null,
          email: user.emailAddress || user.email || null
        });
      })
      .catch(() => {
        if (!cancelled) setCurrentUser(null);
      });
    return () => {
      cancelled = true;
    };
  }, [currentContext?.user?.id, currentContext?.tabId]);

  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  // Delete-after-transfer is a user-only affordance (there is no "delete this
  // group" step); hidden entirely for a group source.
  const canDeleteUsers = !isGroup && userRights.includes('user.edit');

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (!selectedOwnerId || selectedTypeCount === 0) return;

    const formData = {
      currentUser,
      deleteAfterTransfer: deleteAfterTransfer && canDeleteUsers,
      emailCurrentUser: emailCurrentUser && !!currentUser?.email,
      emailNewOwner: emailNewOwner && !!target?.email,
      target,
      toDisplayName: selectedDisplayName ?? target?.displayName ?? null,
      toOwnerId: selectedOwnerId,
      toOwnerType: ownerType
    };

    // Close modal immediately so per-row transfer progress is visible
    // underneath; the parent runs transferAllOwnership and updates DataList
    // rows via its transferStatus state.
    onOpenChange(false);
    onSubmit(formData);
  };

  const handleDestinationChange = (key) => {
    setSelectedOwnerId(key);
    setSelectedDisplayName(null);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
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
                  <Input value={sourceUser?.name || (isGroup ? 'Unknown Group' : 'Unknown User')} variant='secondary' />
                </TextField>

                <div className='flex items-end gap-1'>
                  <OwnerComboBox
                    avatarBaseUrl={currentContext?.domoObject?.baseUrl}
                    className='min-w-0 flex-1'
                    isActive={isOpen}
                    label='Transfer To'
                    selectedDisplayName={selectedDisplayName}
                    selectedKey={selectedOwnerId}
                    sources={[isGroup ? 'GROUP' : 'USER']}
                    tabId={currentContext?.tabId}
                    onSelectionChange={handleDestinationChange}
                  />
                  {!isGroup && (
                    <Tooltip>
                      <Button
                        isIconOnly
                        isDisabled={!manager || !manager.active}
                        size='md'
                        variant='tertiary'
                        onPress={() => {
                          if (!manager?.id) return;
                          setSelectedOwnerId(manager.id);
                          setSelectedDisplayName(manager.name);
                        }}
                      >
                        <IconPerson />
                      </Button>
                      <Tooltip.Content className='max-w-60'>
                        {manager?.active
                          ? `Transfer to manager: ${manager.name}`
                          : manager
                            ? `Manager ${manager.name} is inactive`
                            : 'No manager assigned'}
                      </Tooltip.Content>
                    </Tooltip>
                  )}
                </div>

                {!isGroup && (
                  <Switch isSelected={emailNewOwner} onChange={setEmailNewOwner}>
                    <Switch.Content>
                      <Switch.Control>
                        <Switch.Thumb />
                      </Switch.Control>
                      Email new owner with summary
                    </Switch.Content>
                    <Description>
                      {!selectedOwnerId
                        ? 'Sends an Excel attachment to the new owner'
                        : target?.email
                          ? `Sends an Excel attachment to ${target.email}`
                          : 'Email unavailable for selected user'}
                    </Description>
                  </Switch>
                )}

                <Switch isSelected={emailCurrentUser} onChange={setEmailCurrentUser}>
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    Email me with summary
                  </Switch.Content>
                  <Description>
                    {currentUser?.email
                      ? `Sends an Excel attachment to ${currentUser.email}`
                      : 'Sends an Excel attachment to you'}
                  </Description>
                </Switch>

                {canDeleteUsers && (
                  <Switch isSelected={deleteAfterTransfer} onChange={setDeleteAfterTransfer}>
                    {({ isSelected }) => (
                      <>
                        <Switch.Content>
                          <Switch.Control className={isSelected ? 'bg-danger' : ''}>
                            <Switch.Thumb />
                          </Switch.Control>
                          Delete user after transfer
                        </Switch.Content>
                        <Description>Only if all transfers succeed</Description>
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
                <Button isDisabled={!selectedOwnerId || selectedTypeCount === 0} size='sm' type='submit' variant='primary'>
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
