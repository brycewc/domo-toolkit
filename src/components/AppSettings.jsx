import { Button, Form, Label, ListBox, Select } from '@heroui/react';
import { useState, useEffect } from 'react';

export default function AppSettings({ onStatusUpdate }) {
	// Store all settings in a single state object for extensibility
	const [settings, setSettings] = useState({
		themePreference: 'system'
	});

	// Track original settings to detect changes
	const [originalSettings, setOriginalSettings] = useState({
		themePreference: 'system'
	});

	useEffect(() => {
		// Load all settings from storage
		chrome.storage.sync.get(['themePreference'], (result) => {
			const loadedSettings = {
				themePreference: result.themePreference || 'system'
			};
			setSettings(loadedSettings);
			setOriginalSettings(loadedSettings);
		});

		// Listen for storage changes
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'sync') {
				const updatedSettings = { ...settings };
				let hasChanges = false;

				if (changes.themePreference) {
					updatedSettings.themePreference = changes.themePreference.newValue;
					hasChanges = true;
				}

				if (hasChanges) {
					setSettings(updatedSettings);
					setOriginalSettings(updatedSettings);
				}
			}
		};

		chrome.storage.onChanged.addListener(handleStorageChange);

		return () => {
			chrome.storage.onChanged.removeListener(handleStorageChange);
		};
	}, []);

	const handleSubmit = (e) => {
		e.preventDefault();

		// Save all settings to storage
		chrome.storage.sync.set(settings, () => {
			setOriginalSettings(settings);
			onStatusUpdate?.(
				'Settings Saved',
				'Your preferences have been updated successfully.',
				'success'
			);
		});
	};

	const handleThemeChange = (value) => {
		setSettings((prev) => ({
			...prev,
			themePreference: value
		}));
	};

	// Check if settings have changed
	const hasChanges =
		JSON.stringify(settings) !== JSON.stringify(originalSettings);

	return (
		<Form onSubmit={handleSubmit} className='flex flex-col gap-4'>
			<Select
				value={settings.themePreference}
				onChange={handleThemeChange}
				className='w-[10rem]'
			>
				<Label>Theme</Label>
				<Select.Trigger>
					<Select.Value />
					<Select.Indicator />
				</Select.Trigger>
				<Select.Popover>
					<ListBox>
						<ListBox.Item id='system' textValue='System'>
							System
							<ListBox.ItemIndicator />
						</ListBox.Item>
						<ListBox.Item id='light' textValue='Light'>
							Light
							<ListBox.ItemIndicator />
						</ListBox.Item>
						<ListBox.Item id='dark' textValue='Dark'>
							Dark
							<ListBox.ItemIndicator />
						</ListBox.Item>
					</ListBox>
				</Select.Popover>
			</Select>
			<Button type='submit' variant='primary' isDisabled={!hasChanges}>
				Save Settings
			</Button>
		</Form>
	);
}
