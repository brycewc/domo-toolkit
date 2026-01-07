import { useState, useEffect, useRef } from 'react';
import { Button, Dropdown, Label } from '@heroui/react';
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

				// Check if it looks like a Domo object ID (numeric or UUID)
				const isNumeric = /^\d+$/.test(trimmedText);
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

		// Use selectedType if available, otherwise use detected type
		const typeToUse = selectedType || objectDetails?.type;
		if (!typeToUse || typeToUse === 'UNKNOWN') return;

		try {
			// Get active tab
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			let baseUrl;
			let targetTabId = tab?.id;

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

			// Create DomoObject instance
			const domoObject = new DomoObject(typeToUse, copiedObjectId, baseUrl);

			try {
				// If we're on a Domo page, navigate in the current tab
				// Otherwise, create a new tab or update the current one
				if (targetTabId && tab.url && tab.url.includes('domo.com')) {
					await domoObject.navigateTo(targetTabId);
				} else {
					// Create a new tab with the object URL
					const url = domoObject.url || (await domoObject.buildUrl(baseUrl));
					await chrome.tabs.create({ url });
				}
			} catch (err) {
				console.error('Error navigating to object:', err);
				alert(`Error navigating to object: ${err.message}`);
			}
		} catch (err) {
			console.error('Error:', err);
			alert('Error: ' + err.message);
		}
	};

	const getButtonText = () => {
		if (!copiedObjectId) {
			return 'Navigate to Copied: N/A';
		}
		if (isLoading) {
			return `Loading...`;
		}
		if (error) {
			return `Error: ${error}`;
		}
		if (objectDetails) {
			return `Navigate to Copied: ${objectDetails.type}`;
		}
		return copiedObjectId;
	};

	// If object type is unknown, show dropdown for manual selection
	if (objectDetails?.type === 'UNKNOWN' && copiedObjectId) {
		const allTypes = getAllObjectTypes()
			.filter((type) => !type.requiresParent() && type.hasUrl())
			.sort((a, b) => a.name.localeCompare(b.name));

		return (
			<Dropdown>
				<Button className='w-full'>
					{selectedType
						? `Navigate to: ${
								getAllObjectTypes().find((t) => t.id === selectedType)?.name
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
		<Button
			onPress={handleClick}
			isDisabled={!copiedObjectId || isLoading || !!error}
			className='w-full'
			isPending={isLoading}
		>
			Navigate from Clipboard
			<img src={IconBolt} alt='Bolt icon' className='w-4 h-4' />
		</Button>
	);
}
