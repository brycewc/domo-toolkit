import { Tabs } from '@heroui/react';
import './App.css';
import { useEffect, useRef, useState } from 'react';

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
				<h3 className='mb-2 font-semibold'>Account Settings</h3>
				<p className='text-sm text-muted'>
					Manage your account information and preferences.
				</p>
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
