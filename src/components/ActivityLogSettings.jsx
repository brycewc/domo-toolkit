import { useState, useEffect } from 'react';
import {
	Button,
	ComboBox,
	Description,
	Fieldset,
	Form,
	Input,
	Label,
	ListBox,
	TextField
} from '@heroui/react';
import StatusBar from './StatusBar';
import IconX from '@/assets/icons/x.svg';

export default function ActivityLogSettings() {
	const [configs, setConfigs] = useState([]);
	const [visitedInstances, setVisitedInstances] = useState([]);
	const [statusBar, setStatusBar] = useState({
		title: '',
		description: '',
		status: 'accent',
		timeout: 3000,
		visible: false
	});

	// Load settings from Chrome storage on component mount
	useEffect(() => {
		chrome.storage.sync.get(
			['activityLogConfigs', 'visitedDomoInstances'],
			(result) => {
				// Migrate old single config to new array format
				if (
					!result.activityLogConfigs &&
					(result.activityLogCardId ||
						result.activityLogObjectTypeColumn ||
						result.activityLogObjectIdColumn)
				) {
					// Create a default config from old settings
					const migratedConfig = [
						{
							id: Date.now(),
							instance: '',
							cardId: result.activityLogCardId || '',
							objectTypeColumn:
								result.activityLogObjectTypeColumn || 'Object_Type',
							objectIdColumn: result.activityLogObjectIdColumn || 'Object_ID'
						}
					];
					setConfigs(migratedConfig);
				} else if (
					result.activityLogConfigs &&
					result.activityLogConfigs.length > 0
				) {
					setConfigs(result.activityLogConfigs);
				} else {
					// Set default empty config
					setConfigs([
						{
							id: Date.now(),
							instance: '',
							cardId: '',
							objectTypeColumn: 'Object_Type',
							objectIdColumn: 'Object_ID'
						}
					]);
				}

				setVisitedInstances(result.visitedDomoInstances || []);
			}
		);
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

	const onSubmit = (e) => {
		e.preventDefault();

		// Validate that all configs have required fields
		const invalidConfigs = configs.filter(
			(config) =>
				!config.instance ||
				!config.cardId ||
				!config.objectTypeColumn ||
				!config.objectIdColumn
		);

		if (invalidConfigs.length > 0) {
			showStatus(
				'Validation Error',
				'All fields are required for each configuration',
				'danger'
			);
			return;
		}

		// Save to Chrome storage
		chrome.storage.sync.set(
			{
				activityLogConfigs: configs
			},
			() => {
				showStatus(
					'Saved',
					'Activity log settings saved successfully!',
					'success'
				);
			}
		);
	};

	const addRow = () => {
		setConfigs([
			...configs,
			{
				id: Date.now(),
				instance: '',
				cardId: '',
				objectTypeColumn: 'Object_Type',
				objectIdColumn: 'Object_ID'
			}
		]);
	};

	const removeRow = (id) => {
		if (configs.length > 1) {
			setConfigs(configs.filter((config) => config.id !== id));
		}
	};

	const updateConfig = (id, field, value) => {
		setConfigs(
			configs.map((config) =>
				config.id === id ? { ...config, [field]: value } : config
			)
		);
	};

	const handleCardIdChange = (id, value) => {
		// Only allow digits
		const numericValue = value.replace(/\D/g, '');
		updateConfig(id, 'cardId', numericValue);
	};

	return (
		<div className='flex flex-col gap-4 p-4 w-full'>
			<Form className='flex flex-col gap-4 w-full' onSubmit={onSubmit}>
				{configs.map((config) => (
					<Fieldset key={config.id} className='flex flex-col gap-3'>
						<div className='flex items-start gap-3 justify-start h-20'>
							<ComboBox
								allowsCustomValue
								inputValue={config.instance}
								onInputChange={(value) =>
									updateConfig(config.id, 'instance', value)
								}
								className='flex-1'
								isRequired
							>
								<Label>Domo Instance</Label>
								<ComboBox.InputGroup>
									<Input placeholder='Select or enter instance' />
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
							</ComboBox>

							<TextField
								isRequired
								value={config.cardId}
								onChange={(value) => handleCardIdChange(config.id, value)}
								className='w-40'
							>
								<Label>Card ID</Label>
								<Input placeholder='Card ID' type='text' inputMode='numeric' />
							</TextField>

							<TextField
								isRequired
								value={config.objectTypeColumn}
								onChange={(value) =>
									updateConfig(config.id, 'objectTypeColumn', value)
								}
								className='flex-1'
							>
								<Label>Object Type Column</Label>
								<Input placeholder='Object_Type' />
							</TextField>

							<TextField
								isRequired
								value={config.objectIdColumn}
								onChange={(value) =>
									updateConfig(config.id, 'objectIdColumn', value)
								}
								className='flex-1'
							>
								<Label>Object ID Column</Label>
								<Input placeholder='Object_ID' />
							</TextField>
							{configs.length > 1 && (
								<div className='flex items-center h-20'>
									<Button
										variant='danger'
										size='sm'
										onPress={() => removeRow(config.id)}
										isIconOnly
									>
										<img src={IconX} alt='Remove configuration' />
									</Button>
								</div>
							)}
						</div>
					</Fieldset>
				))}

				<div className='flex gap-2'>
					<Button type='submit'>Save Settings</Button>
					<Button type='button' variant='secondary' onPress={addRow}>
						Add Row
					</Button>
				</div>
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
