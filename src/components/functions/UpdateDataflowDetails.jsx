import {
  Button,
  Form,
  Input,
  Label,
  Modal,
  TextArea,
  TextField,
  Tooltip
} from '@heroui/react';
import { IconArrowFork, IconX } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import { useStatusBar } from '@/hooks';
import { updateDataflowDetails } from '@/services';

export function UpdateDataflowDetails({ currentContext, onStatusUpdate }) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { showPromiseStatus } = useStatusBar();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [originalValues, setOriginalValues] = useState({
    description: '',
    name: ''
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
        description: originalDescription,
        name: originalName
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
          metadataUpdates: updates,
          tabId: tab.id,
          type: 'UPDATE_CONTEXT_METADATA'
        });
        chrome.tabs.reload(tab.id);
      }

      return fields;
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'An error occurred',
      loading: `Updating DataFlow **${fields}**…`,
      success: (f) => `Updated ${f}`
    });

    promise.finally(() => setIsSubmitting(false));
  };

  return (
    <Modal onOpenChange={setIsOpen}>
      <Tooltip closeDelay={0} delay={400}>
        <Button
          fullWidth
          className='min-w-36 flex-1 whitespace-normal'
          isDisabled={currentContext?.domoObject.typeId !== 'DATAFLOW_TYPE'}
          variant='tertiary'
        >
          <IconArrowFork className='rotate-180' stroke={1.5} />
          Update DataFlow Details
        </Button>
        <Tooltip.Content>Update dataflow name and description</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='top' scroll='outside'>
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
                <TextField id='dataflow-name' name='name' variant='secondary'>
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
                    id='dataflow-description'
                    name='description'
                    resize='vertical'
                    rows={2}
                    value={description}
                    variant='secondary'
                    onChange={(e) => setDescription(e.target.value)}
                  />
                </div>
              </Modal.Body>
              <Modal.Footer>
                <Button
                  isDisabled={isSubmitting}
                  size='sm'
                  slot='close'
                  variant='tertiary'
                >
                  Cancel
                </Button>
                <Button
                  isDisabled={isSubmitting}
                  size='sm'
                  slot='close'
                  type='submit'
                  variant='primary'
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
