import { Button } from '@heroui/react';
import { useState, useEffect, useRef } from 'react';
import { detectAndFetchObject } from '@/services/allObjects';

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

			// Build URL based on object type
			const baseUrl = new URL(tab.url).origin;
			let targetUrl;

			switch (objectDetails.type) {
				case 'CARD':
					targetUrl = `${baseUrl}/kpis/details/${copiedObjectId}`;
					break;
				case 'DATA_SOURCE':
					targetUrl = `${baseUrl}/datasources/${copiedObjectId}`;
					break;
				case 'DATAFLOW_TYPE':
					targetUrl = `${baseUrl}/dataflows/${copiedObjectId}`;
					break;
				case 'PAGE':
					targetUrl = `${baseUrl}/page/${copiedObjectId}`;
					break;
				case 'USER':
					targetUrl = `${baseUrl}/people/${copiedObjectId}`;
					break;
				case 'GROUP':
					targetUrl = `${baseUrl}/groups/${copiedObjectId}`;
					break;
				case 'ALERT':
					targetUrl = `${baseUrl}/alerts/${copiedObjectId}`;
					break;
				case 'APP':
					targetUrl = `${baseUrl}/assetlibrary/${copiedObjectId}`;
					break;
				case 'PROJECT':
					targetUrl = `${baseUrl}/project/${copiedObjectId}`;
					break;
				default:
					alert(`Navigation not supported for type: ${objectDetails.type}`);
					return;
			}

			// Navigate to the URL
			await chrome.tabs.update(tab.id, { url: targetUrl });
		} catch (err) {
			console.error('Error navigating:', err);
			alert('Error navigating to object: ' + err.message);
		}
	};

	const getButtonText = () => {
		if (!copiedObjectId) {
			return 'Navigate to Copied: N/A';
		}
		if (isLoading) {
			return `Loading ${copiedObjectId}...`;
		}
		if (error) {
			return `Error: ${copiedObjectId}`;
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
