import { useState, useEffect } from 'react';
import {
  Modal,
  Button,
  Form,
  Input,
  Label,
  TextField,
  TextArea,
  Tooltip
} from '@heroui/react';
import { IconArrowFork, IconX } from '@tabler/icons-react';
import { updateDataflowDetails } from '@/services';
import { useStatusBar } from '@/hooks';

export function UpdateDataflowDetails({ currentContext, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showPromiseStatus } = useStatusBar();
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

    const fields = Object.keys(updates).join(' and ');

    const promise = (async () => {
      await updateDataflowDetails(currentContext?.domoObject?.id, updates);

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
        chrome.tabs.reload(tab.id);
      }

      return fields;
    })();

    showPromiseStatus(promise, {
      loading: `Updating DataFlow **${fields}**…`,
      success: (f) => `Updated ${f}`,
      error: (err) => err.message || 'An error occurred'
    });

    promise.finally(() => setIsSubmitting(false));
  };

  return (
    <Modal onOpenChange={setIsOpen}>
      <Tooltip delay={400} closeDelay={0}>
        <Button
          variant='tertiary'
          fullWidth
          isDisabled={currentContext?.domoObject.typeId !== 'DATAFLOW_TYPE'}
          className='relative min-w-fit flex-1 basis-[48%] overflow-visible'
        >
          <IconArrowFork stroke={1.5} className='rotate-180' />
          Update DataFlow Details
        </Button>
        <Tooltip.Content>Update dataflow name and description</Tooltip.Content>
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
                  Save
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
