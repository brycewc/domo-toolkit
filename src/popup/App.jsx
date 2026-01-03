import { Button, Tabs } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import ClearDomoCookies from '@/components/ClearDomoCookies';
import StatusBar from '@/components/StatusBar';
import { useTheme } from '@/hooks/useTheme';
import './App.css';
import NavigateToCopiedObject from '../components/NavigateToCopiedObject';

export default function App() {
	// Apply theme
	useTheme();

	const currentObjectDefaults = {
		id: null,
		type: null,
		typeName: null,
		url: null,
		detectedAt: null
	};
	const [currentObject, setCurrentObject] = useState(currentObjectDefaults);
	const hasLoadedFromStorage = useRef(false);
	const [isDomoPage, setIsDomoPage] = useState(false);
	const [statusBar, setStatusBar] = useState({
		title: '',
		description: '',
		status: 'accent',
		timeout: 3000,
		visible: false
	});

	useEffect(() => {
		// Request fresh object type detection from content script when popup opens
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id && tabs[0]?.url) {
				// Check if current page is a Domo instance
				try {
					const url = new URL(tabs[0].url);
					setIsDomoPage(url.hostname.includes('domo.com'));
				} catch (error) {
					setIsDomoPage(false);
				}

				chrome.tabs.sendMessage(
					tabs[0].id,
					{ action: 'getObjectType' },
					(response) => {
						// Response will be received, but storage change listener will handle the update
						if (chrome.runtime.lastError) {
							// Content script might not be loaded on this page (e.g., chrome:// pages)
							console.log(
								'Could not detect object type:',
								chrome.runtime.lastError.message
							);
						}
					}
				);
			}
		});

		// Load initial currentObject from storage
		chrome.storage.local.get(['currentObject'], (result) => {
			setCurrentObject(result.currentObject || currentObjectDefaults);
			hasLoadedFromStorage.current = true;
		});

		// Listen for storage changes from other components
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'local' && changes.currentObject) {
				setCurrentObject(changes.currentObject.newValue);
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);

		// Cleanup listener on unmount
		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	useEffect(() => {
		// Only save after we've loaded the initial value from storage
		if (!hasLoadedFromStorage.current) {
			return;
		}

		// Save currentObject to storage when it changes
		chrome.storage.local.set({ currentObject });
		// chrome.runtime.sendMessage({ type: 'COUNT', currentObject });
	}, [currentObject]);

	const showStatus = (
		title,
		description,
		status = 'accent',
		timeout = 3000
	) => {
		setStatusBar({ title, description, status, timeout, visible: true });
	};

	const hideStatus = () => {
		setStatusBar((prev) => ({ ...prev, visible: false }));
	};

	const handleTabChange = (tabId) => {
		if (tabId === 'settings') {
			// Open options page instead of switching tabs
			chrome.runtime.openOptionsPage();
			return;
		}
		// For other tabs, allow normal behavior (controlled by Tabs component)
	};

	return (
		<div className='flex flex-col gap-2 w-auto min-w-md p-2'>
			<Tabs
				className='w-full'
				orientation='vertical'
				onSelectionChange={handleTabChange}
			>
				<Tabs.ListContainer>
					<Tabs.List aria-label='Vertical tabs'>
						<Tabs.Tab id='favorites'>
							Favorites
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id='delete' isDisabled={!isDomoPage}>
							Delete
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id='update' isDisabled={!isDomoPage}>
							Update
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id='other' isDisabled={!isDomoPage}>
							Other
							<Tabs.Indicator />
						</Tabs.Tab>
						<Tabs.Tab id='settings'>
							Settings
							<Tabs.Indicator />
						</Tabs.Tab>
					</Tabs.List>
				</Tabs.ListContainer>
				<Tabs.Panel className='px-4 flex flex-col gap-1' id='favorites'>
					<Button fullWidth isDisabled={!isDomoPage}>
						Activity Log Current{' '}
						{currentObject?.typeName && currentObject?.id
							? currentObject.typeName
							: 'Object'}
					</Button>
					<Button
						fullWidth
						isDisabled={!isDomoPage}
						onPress={() => {
							navigator.clipboard.writeText(currentObject.id);
							showStatus('Copied', `Copied ${currentObject.id} to clipboard.`);
						}}
					>
						Copy Current{' '}
						{currentObject?.typeName && currentObject?.id
							? currentObject.typeName
							: 'Object'}{' '}
						ID
					</Button>
					<NavigateToCopiedObject />
					<ClearDomoCookies
						onStatusUpdate={showStatus}
						isDisabled={!isDomoPage}
					/>
					<Button
						fullWidth
						onPress={() => showStatus('Test', 'This is a test message')}
					>
						Test
					</Button>
				</Tabs.Panel>
				<Tabs.Panel
					className='px-4 flex flex-col gap-1'
					id='delete'
				></Tabs.Panel>
				<Tabs.Panel
					className='px-4 flex flex-col gap-1'
					id='update'
				></Tabs.Panel>
				<Tabs.Panel
					className='px-4 flex flex-col gap-1'
					id='other'
				></Tabs.Panel>
				<Tabs.Panel id='settings'></Tabs.Panel>
			</Tabs>
			<div className='min-w-sm min-h-[5rem]'>
				{statusBar.visible && (
					<StatusBar
						title={statusBar.title}
						description={statusBar.description}
						status={statusBar.status}
						timeout={statusBar.timeout}
						onClose={hideStatus}
					/>
				)}
			</div>
		</div>
	);
}
