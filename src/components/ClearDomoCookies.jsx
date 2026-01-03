import { Button, Spinner } from '@heroui/react';
import { useState } from 'react';

export default function ClearDomoCookies({ onStatusUpdate, isDisabled }) {
	const [isClearingCookies, setIsClearingCookies] = useState(false);

	const clearDomoCookies = async () => {
		setIsClearingCookies(true);

		try {
			// Get the current active tab
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			if (!tab || !tab.url) {
				onStatusUpdate?.('Error', 'Could not get active tab', 'danger');
				setIsClearingCookies(false);
				return;
			}

			// Extract domain from URL
			const url = new URL(tab.url);
			const currentDomain = url.hostname;

			// Check if we're on a domo.com domain
			if (!currentDomain.includes('domo.com')) {
				onStatusUpdate?.(
					'Not a Domo Instance',
					`Current tab is not a Domo instance (${currentDomain})`,
					'danger'
				);
				setIsClearingCookies(false);
				return;
			}

			// Get all cookies
			const allCookies = await chrome.cookies.getAll({});

			// Filter for cookies matching the current Domo instance
			// This includes both exact match and wildcard (.customer.domo.com)
			const domoCookies = allCookies.filter((cookie) => {
				const cookieDomain = cookie.domain.startsWith('.')
					? cookie.domain.substring(1)
					: cookie.domain;
				return (
					cookieDomain === currentDomain || currentDomain.endsWith(cookieDomain)
				);
			});

			// Remove each cookie
			let removedCount = 0;
			const errors = [];

			const removePromises = domoCookies.map(async (cookie) => {
				try {
					// Clean up domain (remove leading dot if present)
					let domain = cookie.domain;
					if (domain.startsWith('.')) {
						domain = domain.substring(1);
					}

					// Construct proper URL
					const protocol = cookie.secure ? 'https:' : 'http:';
					const cookieUrl = `${protocol}//${domain}${cookie.path}`;

					const result = await chrome.cookies.remove({
						url: cookieUrl,
						name: cookie.name,
						storeId: cookie.storeId
					});

					if (result) {
						removedCount++;
					} else {
						errors.push(`Failed to remove: ${cookie.name}`);
					}
				} catch (err) {
					errors.push(`${cookie.name}: ${err.message}`);
				}
			});

			await Promise.all(removePromises);

			// Show result message
			if (errors.length === 0) {
				onStatusUpdate?.(
					'Cookies Cleared',
					`Successfully cleared ${removedCount} cookie${
						removedCount !== 1 ? 's' : ''
					} for ${currentDomain}`,
					'success'
				);
			} else {
				onStatusUpdate?.(
					'Partial Success',
					`Cleared ${removedCount} cookie${
						removedCount !== 1 ? 's' : ''
					}, but ${errors.length} error${
						errors.length !== 1 ? 's' : ''
					} occurred`,
					'warning'
				);
			}

			setIsClearingCookies(false);
		} catch (error) {
			onStatusUpdate?.('Error', error.message, 'danger');
			setIsClearingCookies(false);
		}
	};

	return (
		<Button
			fullWidth
			onPress={clearDomoCookies}
			isPending={isClearingCookies}
			isDisabled={isDisabled}
		>
			{({ isPending }) => (
				<>
					{isPending ? <Spinner color='current' size='sm' /> : null}
					{isPending ? 'Clearing...' : 'Clear Domo Cookies'}
				</>
			)}
		</Button>
	);
}
