import { useState, useEffect, useRef } from 'react';
import { Button, Dropdown, Label, Tooltip, Chip } from '@heroui/react';
import { DomoObject, getAllObjectTypes } from '@/models';
import { detectAndFetchObject } from '@/services';
import IconBolt from '@/assets/icons/bolt.svg';

export function NavigateToCopiedObject() {
	const [copiedObjectId, setCopiedObjectId] = useState(null);
	const [objectDetails, setObjectDetails] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const [selectedType, setSelectedType] = useState(null);
	const [defaultDomoInstance, setDefaultDomoInstance] = useState('');
	const lastCheckedClipboard = useRef('');

	// Load default Domo instance from settings
	useEffect(() => {
		chrome.storage.sync.get(['defaultDomoInstance'], (result) => {
			setDefaultDomoInstance(result.defaultDomoInstance || '');
		});

		// Listen for changes to default instance
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'sync' && changes.defaultDomoInstance) {
				setDefaultDomoInstance(changes.defaultDomoInstance.newValue || '');
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);

		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	// Check clipboard periodically
	useEffect(() => {
		const checkClipboard = async () => {
			try {
				// Read clipboard
				const text = await navigator.clipboard.readText();

				// Skip if clipboard hasn't changed
				if (text === lastCheckedClipboard.current) {
					return;
				}

				lastCheckedClipboard.current = text;
				const trimmedText = text.trim();

				// Check if it looks like a Domo object ID (numeric including negative, or UUID)
				const isNumeric = /^-?\d+$/.test(trimmedText);
				const isUuid =
					/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
						trimmedText
					);

				if (isNumeric || isUuid) {
					setCopiedObjectId(trimmedText);
					setIsLoading(true);
					setError(null);
					setSelectedType(null);
					// Fetch object details
					try {
						const details = await detectAndFetchObject(trimmedText);
						setObjectDetails(details);
						setError(null);
					} catch (err) {
						console.error('Error fetching object details:', err);
						setError(err.message);
						setObjectDetails(null);
					} finally {
						setIsLoading(false);
					}
				} else {
					// Clear if clipboard doesn't contain a valid ID
					setCopiedObjectId(null);
					setObjectDetails(null);
					setError(null);
				}
			} catch (err) {
				// Clipboard access might be denied or fail
				console.error('Error reading clipboard:', err);
			}
		};

		// Check immediately
		checkClipboard();

		// Check every 2 seconds
		const interval = setInterval(checkClipboard, 2000);

		return () => clearInterval(interval);
	}, []);

	const handleClick = async () => {
		if (!copiedObjectId) return;

		// Check if object is unknown or if manual type selection is needed
		if (objectDetails?._unknownType && !selectedType) return;

		try {
			let domoObject;

			if (selectedType) {
				// User manually selected a type - create new DomoObject
				const [tab] = await chrome.tabs.query({
					active: true,
					currentWindow: true
				});

				let baseUrl;

				// Check if on a Domo page
				if (tab && tab.url && tab.url.includes('domo.com')) {
					// Use current Domo instance
					baseUrl = new URL(tab.url).origin;
				} else {
					// Use default Domo instance from settings
					if (!defaultDomoInstance) {
						alert(
							'Please set a default Domo instance in Settings or open a Domo page first'
						);
						return;
					}
					// Build the base URL from the instance name
					baseUrl = defaultDomoInstance.includes('://')
						? defaultDomoInstance.replace(/\/$/, '')
						: `https://${defaultDomoInstance}.domo.com`;
				}

				domoObject = new DomoObject(selectedType, copiedObjectId, baseUrl);
			} else {
				// Use the already detected DomoObject
				domoObject = objectDetails;
			}

			try {
				// If we're on a Domo page, navigate in the current tab
				// Otherwise, create a new tab or update the current one
				await domoObject.navigateTo();
			} catch (err) {
				console.error('Error navigating to object:', err);
				alert(`Error navigating to object: ${err.message}`);
			}
		} catch (err) {
			console.error('Error:', err);
			alert('Error: ' + err.message);
		}
	};

	// If object type is unknown, show dropdown for manual selection
	if (objectDetails?._unknownType && copiedObjectId) {
		const allTypes = getAllObjectTypes()
			.filter((type) => !type.requiresParent() && type.hasUrl())
			.sort((a, b) => a.name.localeCompare(b.name));

		return (
			<Dropdown>
				<Button className='w-full'>
					{selectedType
						? `Navigate to: ${
								getAllObjectTypes().find((t) => t.id === selectedType)?.id
						  }`
						: 'Navigate to: Select Object Type'}
				</Button>
				<Dropdown.Popover>
					<Dropdown.Menu
						onAction={(key) => {
							setSelectedType(key);
							setTimeout(() => handleClick(), 0);
						}}
					>
						{allTypes.map((type) => (
							<Dropdown.Item key={type.id} textValue={type.name}>
								<Label>{type.name}</Label>
							</Dropdown.Item>
						))}
					</Dropdown.Menu>
				</Dropdown.Popover>
			</Dropdown>
		);
	}

	return (
		<Tooltip delay={200}>
			<Button
				onPress={handleClick}
				isDisabled={!copiedObjectId || isLoading || !!error}
				className='w-full'
				isPending={isLoading}
			>
				Navigate from Clipboard
				<img src={IconBolt} alt='Bolt icon' className='w-4 h-4' />
			</Button>
			<Tooltip.Content showArrow placement='top'>
				<Tooltip.Arrow />
				{error ? (
					`Error: ${error}`
				) : copiedObjectId ? (
					objectDetails ? (
						<div className='flex items-center gap-2'>
							<span>
								Navigate to {objectDetails.metadata?.name || 'Unknown'}
							</span>
							<Chip size='sm' variant='soft' color='accent'>
								{objectDetails.metadata?.parent
									? `${objectDetails.metadata.parent.type} > ${objectDetails.typeId}`
									: objectDetails.typeId}
							</Chip>
						</div>
					) : (
						'Loading object details...'
					)
				) : (
					'No valid Domo object ID in clipboard'
				)}
			</Tooltip.Content>
		</Tooltip>
	);
}
