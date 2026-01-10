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
import IconBolt from '@/assets/icons/bolt.svg';

export function UpdateDataflowDetails({ onStatusUpdate, currentObject }) {
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [isOpen, setIsOpen] = useState(false);

	// Initialize form values when modal opens
	useEffect(() => {
		if (isOpen) {
			setName(currentObject?.metadata?.details?.name || '');
			setDescription(currentObject?.metadata?.details?.description || '');
		}
	}, [isOpen, currentObject]);

	const handleSubmit = async (e) => {
		e.preventDefault();

		// Only include fields that have values
		const updates = {};
		if (name?.trim()) updates.name = name.trim();
		if (description?.trim()) updates.description = description.trim();

		if (Object.keys(updates).length === 0) {
			onStatusUpdate?.(
				'No changes to update',
				'Please enter a name or description',
				'warning',
				2000
			);
			return;
		}

		setIsSubmitting(true);

		try {
			await updateDataflowDetails(currentObject?.id, updates);

			// Refresh the page immediately to show the changes
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});
			if (tab?.id) {
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
				className='w-full'
				variant='primary'
				isDisabled={currentObject.typeId !== 'DATAFLOW_TYPE'}
			>
				Update DataFlow Details
				<img src={IconBolt} alt='Bolt icon' className='w-4 h-4' />
			</Button>
			<Modal.Backdrop>
				<Modal.Container scroll='outside' size='xs'>
					<Modal.Dialog className='max-w-[360px]'>
						<Modal.CloseTrigger />
						<Form onSubmit={handleSubmit}>
							<Modal.Header>
								<Modal.Heading>Update DataFlow Details</Modal.Heading>
							</Modal.Header>
							<Modal.Body className='flex flex-col gap-4 p-1'>
								<TextField className='w-full' name='name'>
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
										className='w-full max-h-[100px]'
										name='description'
										id='dataflow-description'
										rows={2}
										value={description}
										onChange={(e) => setDescription(e.target.value)}
									/>
								</div>
							</Modal.Body>
							<Modal.Footer>
								<Button
									slot='close'
									variant='tertiary'
									isDisabled={isSubmitting}
								>
									Cancel
								</Button>
								<Button
									slot='close'
									variant='primary'
									type='submit'
									isDisabled={isSubmitting}
								>
									{isSubmitting ? 'Updating...' : 'Confirm'}
								</Button>
							</Modal.Footer>
						</Form>
					</Modal.Dialog>
				</Modal.Container>
			</Modal.Backdrop>
		</Modal>
	);
}
