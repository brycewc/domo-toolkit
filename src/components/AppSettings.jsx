import { useState, useEffect } from 'react';
import {
	Button,
	ComboBox,
	Description,
	Form,
	Input,
	Label,
	ListBox,
	Select
} from '@heroui/react';
import { StatusBar } from '@/components';

export function AppSettings() {
	// Store all settings in a single state object for extensibility
	const [settings, setSettings] = useState({
		themePreference: 'system',
		defaultDomoInstance: ''
	});

	// Track original settings to detect changes
	const [originalSettings, setOriginalSettings] = useState({
		themePreference: 'system',
		defaultDomoInstance: ''
	});

	// Track visited Domo instances for the ComboBox
	const [visitedInstances, setVisitedInstances] = useState([]);

	const [statusBar, setStatusBar] = useState({
		title: '',
		description: '',
		status: 'accent',
		timeout: 3000,
		visible: false
	});

	useEffect(() => {
		// Load all settings from storage
		chrome.storage.sync.get(
			['themePreference', 'defaultDomoInstance', 'visitedDomoInstances'],
			(result) => {
				const loadedSettings = {
					themePreference: result.themePreference || 'system',
					defaultDomoInstance: result.defaultDomoInstance || ''
				};
				setSettings(loadedSettings);
				setOriginalSettings(loadedSettings);
				setVisitedInstances(result.visitedDomoInstances || []);
			}
		);

		// Listen for storage changes
		const handleStorageChange = (changes, areaName) => {
			if (areaName === 'sync') {
				const updatedSettings = { ...settings };
				let hasChanges = false;

				if (changes.themePreference) {
					updatedSettings.themePreference = changes.themePreference.newValue;
					hasChanges = true;
				}

				if (changes.defaultDomoInstance) {
					updatedSettings.defaultDomoInstance =
						changes.defaultDomoInstance.newValue;
					hasChanges = true;
				}

				if (changes.visitedDomoInstances) {
					setVisitedInstances(changes.visitedDomoInstances.newValue || []);
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
			showStatus(
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

	const handleDefaultInstanceChange = (value) => {
		setSettings((prev) => ({
			...prev,
			defaultDomoInstance: value
		}));
	};

	// Check if settings have changed
	const hasChanges =
		JSON.stringify(settings) !== JSON.stringify(originalSettings);

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

	return (
		<div className='flex flex-col gap-4 p-4'>
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
				<ComboBox
					allowsCustomValue
					inputValue={settings.defaultDomoInstance}
					onInputChange={handleDefaultInstanceChange}
					className='w-[20rem]'
				>
					<Label>Default Domo Instance</Label>
					<ComboBox.InputGroup>
						<Input placeholder='Search or enter instance (e.g., company for company.domo.com)' />
						<ComboBox.Trigger />
					</ComboBox.InputGroup>
					<ComboBox.Popover>
						<ListBox>
							{visitedInstances.length === 0 ? (
								<ListBox.Item
									id='_no_instances'
									textValue='No instances visited yet'
								>
									No instances visited yet
								</ListBox.Item>
							) : (
								visitedInstances.map((instance) => (
									<ListBox.Item
										key={instance}
										id={instance}
										textValue={instance}
									>
										{instance}
										<ListBox.ItemIndicator />
									</ListBox.Item>
								))
							)}
						</ListBox>
					</ComboBox.Popover>
					<Description>
						Select a previously visited instance or enter a custom one. This
						will be used when navigating to copied objects from non-Domo
						websites.
					</Description>
				</ComboBox>
				<Button type='submit' variant='primary' isDisabled={!hasChanges}>
					Save Settings
				</Button>
			</Form>
			<div className='min-h-[5rem]'>
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
