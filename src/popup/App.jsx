import { Tabs, Button } from '@heroui/react';
import './App.css';
import { useEffect, useRef, useState } from 'react';
import ClearDomoCookies from '@/components/ClearDomoCookies';

export default function App() {
	const currentObjectDefaults = {
		id: null,
		type: null,
		typeName: null,
		url: null,
		detectedAt: null
	};
	const [currentObject, setCurrentObject] = useState(currentObjectDefaults);
	const hasLoadedFromStorage = useRef(false);

	useEffect(() => {
		// Request fresh object type detection from content script when popup opens
		chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
			if (tabs[0]?.id) {
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

	return (
		<Tabs className='w-full max-w-lg' orientation='vertical'>
			<Tabs.ListContainer>
				<Tabs.List aria-label='Vertical tabs'>
					<Tabs.Tab id='account'>
						Account
						<Tabs.Indicator />
					</Tabs.Tab>
					<Tabs.Tab id='security'>
						Security
						<Tabs.Indicator />
					</Tabs.Tab>
					<Tabs.Tab id='notifications'>
						Notifications
						<Tabs.Indicator />
					</Tabs.Tab>
					<Tabs.Tab id='billing'>
						Billing
						<Tabs.Indicator />
					</Tabs.Tab>
				</Tabs.List>
			</Tabs.ListContainer>
			<Tabs.Panel className='px-4' id='account'>
				<div className='flex flex-col gap-3'>
					<Button>
						Activity Log Current{' '}
						{currentObject?.typeName && currentObject?.id
							? currentObject.typeName
							: 'Object'}
					</Button>
					<ClearDomoCookies />
				</div>
			</Tabs.Panel>
			<Tabs.Panel className='px-4' id='security'>
				<h3 className='mb-2 font-semibold'>Security Settings</h3>
				<p className='text-sm text-muted'>
					Configure two-factor authentication and password settings.
				</p>
			</Tabs.Panel>
			<Tabs.Panel className='px-4' id='notifications'>
				<h3 className='mb-2 font-semibold'>Notification Preferences</h3>
				<p className='text-sm text-muted'>
					Choose how and when you want to receive notifications.
				</p>
			</Tabs.Panel>
			<Tabs.Panel className='px-4' id='billing'>
				<h3 className='mb-2 font-semibold'>Billing Information</h3>
				<p className='text-sm text-muted'>
					View and manage your subscription and payment methods.
				</p>
			</Tabs.Panel>
		</Tabs>
	);
}
