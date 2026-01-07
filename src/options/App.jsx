import { useState, useEffect } from 'react';
import { Tabs } from '@heroui/react';
import { useTheme } from '@/hooks';
import {
	ActivityLogSettings,
	FaviconSettings,
	AppSettings
} from '@/components';
import './App.css';

export default function App() {
	// Apply theme
	useTheme();

	// Get initial tab from URL hash (e.g., #activity)
	const getInitialTab = () => {
		const hash = window.location.hash.substring(1); // Remove the # symbol
		return hash || 'favicon'; // Default to 'favicon' if no hash
	};

	const [selectedTab, setSelectedTab] = useState(getInitialTab);

	// Update URL hash when tab changes
	const handleTabChange = (tabId) => {
		setSelectedTab(tabId);
		window.location.hash = tabId;
	};

	// Listen for hash changes (e.g., browser back/forward)
	useEffect(() => {
		const handleHashChange = () => {
			setSelectedTab(getInitialTab());
		};
		window.addEventListener('hashchange', handleHashChange);
		return () => window.removeEventListener('hashchange', handleHashChange);
	}, []);

	return (
		<div className='flex justify-center p-4 bg-background'>
			<Tabs
				className='w-full max-w-4xl rounded-sm justify-center'
				selectedKey={selectedTab}
				onSelectionChange={handleTabChange}
			>
				<Tabs.ListContainer>
					<Tabs.List aria-label='Vertical tabs'>
						<Tabs.Tab id='favicon'>
							Favicon
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id='activity'>
							Activity Log
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id='settings'>
							Settings
							<Tabs.Indicator />
						</Tabs.Tab>
					</Tabs.List>
				</Tabs.ListContainer>
				<Tabs.Panel className='flex flex-col items-start px-4' id='favicon'>
					<div className='justify-start w-full'>
						<h3 className='mb-2 text-lg font-semibold'>Favicon Preferences</h3>
						<p className='text-sm text-muted'>
							Manage your favicon preferences. Patterns will automatically match
							against [subdomain].domo.com
						</p>
					</div>
					<FaviconSettings />
				</Tabs.Panel>
				<Tabs.Panel className='flex flex-col items-start px-4' id='activity'>
					<div className='justify-start w-full'>
						<h3 className='mb-2 text-lg font-semibold'>Activity Log Setup</h3>
						<p className='text-sm text-muted'>
							Configure saved card information for activity log related
							functions.
						</p>
					</div>
					<ActivityLogSettings />
				</Tabs.Panel>
				<Tabs.Panel className='flex flex-col items-start px-4' id='settings'>
					<div className='justify-start w-full'>
						<h3 className='mb-2 text-lg font-semibold'>App Settings</h3>
						<p className='text-sm text-muted'>
							Configure general application settings.
						</p>
					</div>
					<AppSettings />
				</Tabs.Panel>
			</Tabs>
		</div>
	);
}
