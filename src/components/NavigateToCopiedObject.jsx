import { Button } from '@heroui/react';
import { useState, useEffect, useRef } from 'react';
import { detectAndFetchObject } from '@/services/index';
import { DomoObject } from '@/models/DomoObject';

export default function NavigateToCopiedObject() {
	const [copiedObjectId, setCopiedObjectId] = useState(null);
	const [objectDetails, setObjectDetails] = useState(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState(null);
	const lastCheckedClipboard = useRef('');

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
		if (!objectDetails || !copiedObjectId) return;

		try {
			// Get active tab
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			if (!tab || !tab.url || !tab.url.includes('domo.com')) {
				alert('Please open a Domo page first');
				return;
			}

			// Build URL and navigate
			const baseUrl = new URL(tab.url).origin;

			// Create DomoObject instance
			const domoObject = new DomoObject(
				objectDetails.type,
				copiedObjectId,
				baseUrl
			);

			try {
				await domoObject.navigateTo(tab.id);
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

	return (
		<Button
			onPress={handleClick}
			isDisabled={!copiedObjectId || isLoading || !!error}
			className='w-full'
			isPending={isLoading}
		>
			{getButtonText()}
		</Button>
	);
}
