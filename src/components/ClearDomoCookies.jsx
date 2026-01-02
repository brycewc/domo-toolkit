import { useState } from 'react';

export default function ClearDomoCookies() {
	const [cookieStatus, setCookieStatus] = useState({
		message: '',
		type: '',
		visible: false
	});
	const [isClearingCookies, setIsClearingCookies] = useState(false);

	const clearDomoCookies = async () => {
		setIsClearingCookies(true);
		setCookieStatus({ message: '', type: '', visible: false });

		try {
			// Get the current active tab
			const [tab] = await chrome.tabs.query({
				active: true,
				currentWindow: true
			});

			if (!tab || !tab.url) {
				setCookieStatus({
					message: '✗ Could not get active tab',
					type: 'error',
					visible: true
				});
				setIsClearingCookies(false);
				return;
			}

			// Extract domain from URL
			const url = new URL(tab.url);
			const currentDomain = url.hostname;

			// Check if we're on a domo.com domain
			if (!currentDomain.includes('domo.com')) {
				setCookieStatus({
					message: `✗ Current tab is not a Domo instance\n(${currentDomain})`,
					type: 'error',
					visible: true
				});
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

			setCookieStatus({
				message: `Found ${domoCookies.length} cookies for ${currentDomain}...`,
				type: 'success',
				visible: true
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
				setCookieStatus({
					message: `✓ Cleared ${removedCount} cookie${removedCount !== 1 ? 's' : ''} for\n${currentDomain}`,
					type: 'success',
					visible: true
				});
			} else {
				setCookieStatus({
					message: `⚠ Cleared ${removedCount}, ${errors.length} errors:\n${errors.slice(0, 3).join('\n')}`,
					type: 'error',
					visible: true
				});
			}

			setIsClearingCookies(false);

			// Hide status after 3 seconds if successful
			if (errors.length === 0) {
				setTimeout(() => {
					setCookieStatus((prev) => ({ ...prev, visible: false }));
				}, 3000);
			}
		} catch (error) {
			setCookieStatus({
				message: `✗ Error: ${error.message}`,
				type: 'error',
				visible: true
			});
			setIsClearingCookies(false);
		}
	};

	return (
		<div className='flex flex-col gap-3'>
			<button
				onClick={clearDomoCookies}
				disabled={isClearingCookies}
				className='w-full px-4 py-2.5 rounded-md bg-[#fb9014] hover:bg-[#e8810f] active:bg-[#d5720a] text-white font-medium text-sm transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-[#fb9014] whitespace-nowrap'
			>
				{isClearingCookies ? 'Clearing...' : 'Clear Domo Cookies'}
			</button>
			{cookieStatus.visible && (
				<div
					className={`p-3 rounded-md text-sm whitespace-pre-wrap break-words ${
						cookieStatus.type === 'success'
							? 'bg-green-500 text-white'
							: 'bg-red-500 text-white'
					}`}
				>
					{cookieStatus.message}
				</div>
			)}
		</div>
	);
}

