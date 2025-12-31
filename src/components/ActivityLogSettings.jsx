import { useState, useEffect } from 'react';
import {
	Button,
	Description,
	FieldError,
	Form,
	Input,
	Label,
	TextField
} from '@heroui/react';

export default function ActivityLogSettings() {
	const [cardId, setCardId] = useState('');
	const [objectTypeColumnName, setObjectTypeColumnName] =
		useState('Object_Type');
	const [objectIdColumnName, setObjectIdColumnName] = useState('Object_ID');
	const [saveStatus, setSaveStatus] = useState('');

	// Store the initial/synced values for reset functionality
	const [initialCardId, setInitialCardId] = useState('');
	const [initialObjectTypeColumnName, setInitialObjectTypeColumnName] =
		useState('Object_Type');
	const [initialObjectIdColumnName, setInitialObjectIdColumnName] =
		useState('Object_ID');

	// Load settings from Chrome storage on component mount
	useEffect(() => {
		chrome.storage.sync.get(
			[
				'activityLogCardId',
				'activityLogObjectTypeColumn',
				'activityLogObjectIdColumn'
			],
			(result) => {
				const cardIdValue = result.activityLogCardId || '';
				const objectTypeValue =
					result.activityLogObjectTypeColumn || 'Object_Type';
				const objectIdValue = result.activityLogObjectIdColumn || 'Object_ID';

				setCardId(cardIdValue);
				setObjectTypeColumnName(objectTypeValue);
				setObjectIdColumnName(objectIdValue);

				setInitialCardId(cardIdValue);
				setInitialObjectTypeColumnName(objectTypeValue);
				setInitialObjectIdColumnName(objectIdValue);
			}
		);
	}, []);

	const onSubmit = (e) => {
		e.preventDefault();

		// Save to Chrome storage
		chrome.storage.sync.set(
			{
				activityLogCardId: cardId,
				activityLogObjectTypeColumn: objectTypeColumnName,
				activityLogObjectIdColumn: objectIdColumnName
			},
			() => {
				setSaveStatus('Settings saved successfully!');
				setTimeout(() => setSaveStatus(''), 3000);
			}
		);
	};

	const onReset = (e) => {
		e.preventDefault();
		// Reset to initial values
		setCardId(initialCardId);
		setObjectTypeColumnName(initialObjectTypeColumnName);
		setObjectIdColumnName(initialObjectIdColumnName);
	};

	const validateCardId = (value) => {
		if (!value || value.trim() === '') {
			return 'Card ID is required';
		}
		if (!/^\d+$/.test(value)) {
			return 'Card ID must contain only numbers';
		}
		return null;
	};

	const handleCardIdChange = (value) => {
		// Only allow digits
		const numericValue = value.replace(/\D/g, '');
		setCardId(numericValue);
	};

	return (
		<Form
			className='flex w-96 flex-col gap-4 p-4'
			onSubmit={onSubmit}
			onReset={onReset}
		>
			<TextField
				isRequired
				name='cardId'
				type='text'
				inputMode='numeric'
				value={cardId}
				onChange={handleCardIdChange}
				validate={validateCardId}
			>
				<Label>Card ID</Label>
				<Input placeholder='Enter card ID' />
				<Description>The Domo card ID for the activity log</Description>
				<FieldError />
			</TextField>
			<TextField
				isRequired
				name='objectIdColumnName'
				type='text'
				value={objectIdColumnName}
				onChange={setObjectIdColumnName}
			>
				<Label>Object ID Column Name</Label>
				<Input placeholder='Enter column name' />
				<Description>The column name that contains the object ID</Description>
				<FieldError>This field is required</FieldError>
			</TextField>
			<TextField
				isRequired
				name='objectTypeColumnName'
				type='text'
				value={objectTypeColumnName}
				onChange={setObjectTypeColumnName}
			>
				<Label>Object Type Column Name</Label>
				<Input placeholder='Enter column name' />
				<Description>The column name that contains the object type</Description>
				<FieldError>This field is required</FieldError>
			</TextField>

			<div className='flex gap-2'>
				<Button type='submit'>Save Settings</Button>
				<Button type='reset' variant='secondary'>
					Reset
				</Button>
			</div>
			{saveStatus && <div className='text-green-600 text-sm'>{saveStatus}</div>}
		</Form>
	);
}
