import { Button, Form, Modal, Tooltip } from '@heroui/react';
import { IconUser, IconUserEdit, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { UserComboBox } from '@/components';
import { useStatusBar } from '@/hooks';
import { updateAlertOwner, updateWorkflowOwner } from '@/services';
import { isSidepanel } from '@/utils';

export function UpdateOwner({ currentContext, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showPromiseStatus } = useStatusBar();
  const [currentUserId, setCurrentUserId] = useState(null);
  const [isOpen, setIsOpen] = useState(false);

  // Set current user ID from context when modal opens
  useEffect(() => {
    if (isOpen && currentContext?.user?.id) {
      setCurrentUserId(currentContext.user.id);
    }
  }, [isOpen, currentContext?.user?.id]);

  const submitOwnerUpdate = (ownerId) => {
    if (!ownerId) {
      onStatusUpdate?.('Blank owner', 'Please enter an owner', 'warning', 2000);
      return;
    }

    setIsSubmitting(true);

    const typeName = currentContext?.domoObject?.typeName;

    const promise = updateOwnerForObject({
      newOwnerId: ownerId,
      object: currentContext?.domoObject,
      tabId: currentContext?.tabId
    }).then(() => {
      setIsOpen(false);
      chrome.tabs.reload(currentContext?.tabId);
      return ownerId;
    });

    showPromiseStatus(promise, {
      error: (err) => err.message || 'An error occurred',
      loading: `Updating **${typeName}** owner…`,
      success: (id) => `Updated ${typeName?.toLowerCase()} owner to **${id}**`
    });

    promise.finally(() => setIsSubmitting(false));
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
      <Tooltip closeDelay={100} delay={400}>
        <Button
          fullWidth
          className='min-w-36 flex-1 whitespace-normal'
          variant='tertiary'
          isDisabled={
            currentContext?.domoObject.typeId !== 'ALERT' &&
            currentContext?.domoObject.typeId !== 'WORKFLOW_MODEL'
          }
        >
          <IconUserEdit stroke={1.5} />
          Update Owner
        </Button>
        <Tooltip.Content className='flex flex-col items-center text-wrap break-normal'>
          Update {currentContext?.domoObject.typeName} owner
        </Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='top' scroll='outside'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX stroke={1.5} />
            </Modal.CloseTrigger>
            <Form id='update-owner-form' onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>
                  {/* Update {currentContext?.domoObject.typeName} Owner */}
                </Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex justify-center'>
                <UserComboBox
                  autoFocus
                  isRequired
                  avatarBaseUrl={currentContext?.domoObject?.baseUrl}
                  className='w-[95%]'
                  defaultInputValue={null}
                  form='update-owner-form'
                  formValue='key'
                  isActive={isOpen}
                  label='Owner'
                  maxListHeight={isSidepanel() ? 'max-h-100' : 'max-h-30'}
                  menuTrigger='input'
                  name='owner'
                  tabId={currentContext?.tabId}
                />
              </Modal.Body>
              <Modal.Footer className='flex items-center justify-between'>
                <Tooltip closeDelay={0} delay={200}>
                  <Button
                    isIconOnly
                    isDisabled={isSubmitting || !currentUserId}
                    size='sm'
                    variant='tertiary'
                    onPress={handleSetToSelf}
                  >
                    <IconUser stroke={1.5} />
                  </Button>
                  <Tooltip.Content>Update owner to yourself</Tooltip.Content>
                </Tooltip>
                <div className='flex gap-2'>
                  <Button isDisabled={isSubmitting} size='sm' slot='close' variant='tertiary'>
                    Cancel
                  </Button>
                  <Button isDisabled={isSubmitting} size='sm' type='submit' variant='primary'>
                    Save
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

async function updateOwnerForObject({ newOwnerId, object, tabId }) {
  switch (object?.typeId) {
    case 'ALERT':
      return updateAlertOwner({ alertId: object.id, newOwnerId, tabId });
    case 'WORKFLOW_MODEL':
      return updateWorkflowOwner({ modelId: object.id, newOwnerId, tabId });
    default:
      throw new Error(`Update owner not supported for object type: ${object?.typeId}`);
  }
}
