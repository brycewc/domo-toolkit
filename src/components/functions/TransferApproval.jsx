import { Button, Form, Input, Label, Modal, TextField, Tooltip } from '@heroui/react';
import { useEffect, useState } from 'react';

import { UserComboBox } from '@/components/UserComboBox';
import { useStatusBar } from '@/hooks/useStatusBar';
import { transferApprovals } from '@/services/approvals';
import { isSidepanel } from '@/utils/sidepanel';
import IconPerson from '@icons/person.svg?react';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';
import IconX from '@icons/x.svg?react';

export function TransferApproval({ currentContext, isDisabled, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showPromiseStatus } = useStatusBar();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedApproverId, setSelectedApproverId] = useState(null);

  // Clear the picked approver each time the modal opens so a stale selection
  // from a previous session can't leak into the next attempt.
  useEffect(() => {
    if (isOpen) setSelectedApproverId(null);
  }, [isOpen]);

  // Set current user ID from context when modal opens
  useEffect(() => {
    if (isOpen && currentContext?.user?.id) {
      setCurrentUserId(currentContext.user.id);
    }
  }, [isOpen, currentContext?.user?.id]);

  const submitTransfer = (toUserId) => {
    if (!toUserId) {
      onStatusUpdate?.('Blank approver', 'Please choose an approver', 'warning', 2000);
      return;
    }

    const object = currentContext?.domoObject;
    const details = object?.metadata?.details;

    // Block transfers that would place the chosen approver in the chain twice.
    // Domo replaces only the current step's approver, so reassigning to someone
    // already elsewhere in the chain leaves them listed more than once, and that
    // duplicate can't be cleanly removed afterward (the only mutation that can
    // reshape a chain requires being the pending approver and re-validates every
    // required field). Easier to stop it here than to clean it up later.
    const chain = details?.chain || [];
    const pendingIdx = details?.approvalChainIdx;
    const duplicateStep = chain.find(
      (step, i) => i !== pendingIdx && String(step?.approver?.id) === String(toUserId)
    );
    if (duplicateStep) {
      const who = duplicateStep.approver?.displayName || 'That user';
      onStatusUpdate?.(
        'Already in chain',
        `${who} is already an approver on this request. Transferring would list them in the chain more than once.`,
        'warning',
        5000
      );
      return;
    }

    setIsSubmitting(true);

    const promise = transferApprovals(
      [{ id: object?.id, version: details?.version }],
      details?.pendingApprover?.id ?? null,
      toUserId,
      currentContext?.tabId
    ).then((result) => {
      if (result.failed > 0) {
        throw new Error(result.errors?.[0]?.error || 'Transfer failed');
      }
      setIsOpen(false);
      chrome.tabs.reload(currentContext?.tabId);
      return toUserId;
    });

    showPromiseStatus(promise, {
      error: (err) => err.message || 'An error occurred',
      loading: 'Transferring approval…',
      success: (id) => `Transferred approval to **${id}**`
    });

    promise.finally(() => setIsSubmitting(false));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    await submitTransfer(selectedApproverId);
  };

  const handleSetToSelf = async () => {
    await submitTransfer(currentUserId);
  };

  const pendingApproverName =
    currentContext?.domoObject?.metadata?.details?.pendingApprover?.displayName || 'Unknown approver';

  return (
    <Modal isOpen={isOpen} onOpenChange={setIsOpen}>
      <Tooltip>
        <Button fullWidth className='min-w-36 flex-1 whitespace-normal' isDisabled={isDisabled} variant='tertiary'>
          <IconSwapHorizontal />
          Transfer Approval
        </Button>
        <Tooltip.Content className='max-w-60' offset={4}>
          Reassign this approval to another user
        </Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Form id='transfer-approval-form' onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>Transfer Approval</Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex flex-col gap-2'>
                <TextField isReadOnly className='pointer-events-none'>
                  <Label>Current Approver</Label>
                  <Input value={pendingApproverName} variant='secondary' />
                </TextField>
                <UserComboBox
                  autoFocus
                  isRequired
                  avatarBaseUrl={currentContext?.domoObject?.baseUrl}
                  isActive={isOpen}
                  label='New Approver'
                  maxListHeight={isSidepanel() ? 'max-h-100' : 'max-h-30'}
                  menuTrigger='input'
                  selectedKey={selectedApproverId}
                  tabId={currentContext?.tabId}
                  onSelectionChange={setSelectedApproverId}
                />
              </Modal.Body>
              <Modal.Footer className='flex items-center justify-between'>
                <Tooltip delay={200}>
                  <Button
                    isIconOnly
                    isDisabled={isSubmitting || !currentUserId}
                    size='sm'
                    variant='tertiary'
                    onPress={handleSetToSelf}
                  >
                    <IconPerson />
                  </Button>
                  <Tooltip.Content className='max-w-60' offset={4}>
                    Assign to me
                  </Tooltip.Content>
                </Tooltip>
                <div className='flex gap-2'>
                  <Button isDisabled={isSubmitting} size='sm' slot='close' variant='tertiary'>
                    Cancel
                  </Button>
                  <Button isDisabled={isSubmitting || !selectedApproverId} size='sm' type='submit' variant='primary'>
                    Transfer
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
