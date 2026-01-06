import { useEffect, useState } from 'react';
import { Button, Tabs } from '@heroui/react';
import { useTheme } from '@/hooks';
import {
	fetchCurrentObjectAsDomoObject,
	onCurrentObjectChange,
	getCurrentInstance,
	onCurrentInstanceChange
} from '@/utils';
import {
	ClearDomoCookies,
	ContextHeader,
	StatusBar,
	NavigateToCopiedObject,
	ActivityLogCurrentObject
} from '@/components';
import './App.css';

export default function App() {
	// Apply theme
	useTheme();

	const [currentObject, setCurrentObject] = useState();
	const [currentInstance, setCurrentInstance] = useState(null);
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

				// Request fresh detection from content script
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
		fetchCurrentObjectAsDomoObject().then((domoObject) => {
			setCurrentObject(domoObject);
		});

		// Load initial currentInstance from storage
		getCurrentInstance().then((instance) => {
			setCurrentInstance(instance);
		});

		// Listen for storage changes from other components
		const cleanupListener = onCurrentObjectChange((domoObject) => {
			setCurrentObject(domoObject);
		});

		// Listen for current instance changes
		const cleanupInstanceListener = onCurrentInstanceChange((instance) => {
			setCurrentInstance(instance);
		});

		// Cleanup listeners on unmount
		return () => {
			cleanupListener();
			cleanupInstanceListener();
		};
	}, []);

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
			<ContextHeader
				isDomoPage={isDomoPage}
				currentInstance={currentInstance}
				currentObject={currentObject}
			/>
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
					<ActivityLogCurrentObject
						currentObject={currentObject}
						onStatusUpdate={showStatus}
					/>
					<Button
						fullWidth
						isDisabled={!isDomoPage}
						onPress={() => {
							navigator.clipboard.writeText(currentObject?.id);
							showStatus(
								'Copied',
								`Copied ${currentObject?.id} to clipboard.`,
								'success'
							);
						}}
					>
						Copy Current{' '}
						{currentObject?.objectType && currentObject?.id
							? currentObject?.typeName
							: 'Object'}{' '}
						ID
					</Button>
					<NavigateToCopiedObject />
					<ClearDomoCookies
						onStatusUpdate={showStatus}
						isDisabled={!isDomoPage}
						currentInstance={currentInstance}
					/>
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
			<div className='min-w-sm min-h-[6rem]'>
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
