import { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Form,
  Input,
  Label,
  TextField,
  TextArea
} from '@heroui/react';
import { updateDataflowDetails } from '@/services';
import { IconArrowFork, IconX } from '@tabler/icons-react';

export function UpdateDataflowDetails({ currentContext, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [originalValues, setOriginalValues] = useState({
    name: '',
    description: ''
  });

  // Initialize form values when modal opens
  useEffect(() => {
    if (isOpen) {
      const originalName =
        currentContext?.domoObject?.metadata?.details?.name || '';
      const originalDescription =
        currentContext?.domoObject?.metadata?.details?.description || '';
      setName(originalName);
      setDescription(originalDescription);
      setOriginalValues({
        name: originalName,
        description: originalDescription
      });
    }
  }, [isOpen, currentContext?.domoObject]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Only include fields that actually changed
    const updates = {};
    const trimmedName = name?.trim() || '';
    const trimmedDescription = description?.trim() || '';

    if (trimmedName !== originalValues.name) {
      updates.name = trimmedName;
    }
    if (trimmedDescription !== originalValues.description) {
      updates.description = trimmedDescription;
    }

    if (Object.keys(updates).length === 0) {
      onStatusUpdate?.(
        'No changes to update',
        'No fields were modified',
        'warning',
        2000
      );
      return;
    }

    setIsSubmitting(true);

    try {
      await updateDataflowDetails(currentContext?.domoObject?.id, updates);

      // Update the cached context in background so popup shows new values
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true
      });
      if (tab?.id) {
        await chrome.runtime.sendMessage({
          type: 'UPDATE_CONTEXT_METADATA',
          tabId: tab.id,
          metadataUpdates: updates
        });

        // Refresh the page to show the changes
        chrome.tabs.reload(tab.id);
      }

      // Show success message in popup (popup stays open)
      onStatusUpdate?.(
        `DataFlow Details Updated Successfully`,
        `Updated ${Object.keys(updates).join(' and ')}`,
        'success',
        3000
      );
    } catch (error) {
      console.error('Error updating DataFlow:', error);
      onStatusUpdate?.(
        'Failed to Update DataFlow',
        error.message || 'An error occurred',
        'danger',
        5000
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Modal onOpenChange={setIsOpen}>
      <Button
        variant='tertiary'
        fullWidth
        isDisabled={currentContext?.domoObject.typeId !== 'DATAFLOW_TYPE'}
      >
        <IconArrowFork stroke={1.5} className='rotate-180' />
        Update DataFlow Details
      </Button>
      <Modal.Backdrop>
        <Modal.Container scroll='outside' placement='top' className='p-1'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger
              className='absolute top-2 right-2'
              variant='ghost'
            >
              <IconX stroke={1.5} />
            </Modal.CloseTrigger>
            <Form onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>Update DataFlow Details</Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex flex-col gap-2'>
                <TextField variant='secondary' name='name' id='dataflow-name'>
                  <Label>DataFlow Name</Label>
                  <Input
                    className='h-8'
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </TextField>
                <div className='flex flex-col gap-2'>
                  <Label>DataFlow Description</Label>
                  <TextArea
                    variant='secondary'
                    name='description'
                    id='dataflow-description'
                    rows={2}
                    resize='vertical'
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  slot='close'
                  variant='tertiary'
                  size='sm'
                  isDisabled={isSubmitting}
                >
                  Cancel
                </Button>
                <Button
                  slot='close'
                  variant='primary'
                  size='sm'
                  type='submit'
                  isDisabled={isSubmitting}
                >
                  {isSubmitting ? 'Updating...' : 'Save'}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
