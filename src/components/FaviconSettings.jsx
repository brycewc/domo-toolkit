import { useState, useEffect } from 'react';
import {
	Accordion,
	Button,
	Card,
	Input,
	Label,
	Select,
	ListBox,
	TextField,
	Form,
	Popover,
	Skeleton
} from '@heroui/react';
import { ColorPicker } from 'react-color-pikr';
import { clearFaviconCache } from '@/utils';
import { StatusBar } from '@/components';
import IconTrash from '@/assets/icons/trash.svg';
import IconGripVertical from '@/assets/icons/grip-vertical.svg';
import IconChevronDown from '@/assets/icons/chevron-down.svg';

export function FaviconSettings() {
	const [rules, setRules] = useState([]);
	const [isLoading, setIsLoading] = useState(true);
	const [draggedIndex, setDraggedIndex] = useState(null);
	const [activeColorPicker, setActiveColorPicker] = useState(null);
	const [tempColor, setTempColor] = useState('#000000');
	const [statusBar, setStatusBar] = useState({
		title: '',
		description: '',
		status: 'accent',
		timeout: 3000,
		visible: false
	});

	// Load settings from Chrome storage on component mount
	useEffect(() => {
		setIsLoading(true);
		chrome.storage.sync.get(['faviconRules'], (result) => {
			if (result.faviconRules && result.faviconRules.length > 0) {
				// Migrate old format if necessary
				const migratedRules = result.faviconRules.map((rule) => {
					if (rule.useInstanceLogo) {
						// Convert old format: useInstanceLogo: true -> effect: 'instance-logo'
						const { useInstanceLogo, ...rest } = rule;
						return { ...rest, effect: 'instance-logo' };
					}
					// Remove useInstanceLogo property if it exists
					const { useInstanceLogo, ...rest } = rule;
					return rest;
				});
				setRules(migratedRules);
			} else {
				// Set default rules if none exist (matches background.js default)
				setRules([
					{
						id: Date.now(),
						pattern: '.*',
						effect: 'instance-logo',
						color: '#000000'
					}
				]);
			}
			setIsLoading(false);
		});
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

	const onSave = async (e) => {
		e.preventDefault();

		// Clear favicon cache before saving new rules
		await clearFaviconCache();

		// Save to Chrome storage
		chrome.storage.sync.set(
			{
				faviconRules: rules
			},
			() => {
				showStatus('Saved', 'Settings saved successfully!', 'success');
			}
		);
	};

	const addRow = () => {
		setRules([
			...rules,
			{
				id: Date.now(),
				pattern: '.*',
				effect: 'instance-logo',
				color: '#000000'
			}
		]);
	};

	const removeRow = (id) => {
		setRules(rules.filter((rule) => rule.id !== id));
	};

	const updateRule = (id, field, value) => {
		setRules(
			rules.map((rule) => (rule.id === id ? { ...rule, [field]: value } : rule))
		);
	};

	const handleDragStart = (index) => {
		setDraggedIndex(index);
	};

	const handleDragOver = (e, index) => {
		e.preventDefault();
	};

	const handleDrop = (e, dropIndex) => {
		e.preventDefault();

		if (draggedIndex === null || draggedIndex === dropIndex) {
			return;
		}

		const newRules = [...rules];
		const [draggedRule] = newRules.splice(draggedIndex, 1);
		newRules.splice(dropIndex, 0, draggedRule);

		setRules(newRules);
		setDraggedIndex(null);
	};

	const handleDragEnd = () => {
		setDraggedIndex(null);
	};

	return (
		<div className='flex flex-col justify-between w-full pt-4'>
			<div className='flex flex-col gap-4 w-full'>
				<Form className='flex flex-col gap-4 w-full' onSubmit={onSave}>
					{isLoading ? (
						<div className='skeleton--shimmer relative flex flex-col gap-4 w-full overflow-hidden'>
							<Skeleton animationType='none' className='h-24 rounded-xl' />
							<Skeleton animationType='none' className='h-24 rounded-xl' />
							<Skeleton animationType='none' className='h-24 rounded-xl' />
						</div>
					) : (
						rules.map((rule, index) => (
							<Card
								key={rule.id}
								draggable
								onDragStart={() => handleDragStart(index)}
								onDragOver={(e) => handleDragOver(e, index)}
								onDrop={(e) => handleDrop(e, index)}
								onDragEnd={handleDragEnd}
								className={`cursor-move transition-opacity ${
									draggedIndex === index ? 'opacity-50' : ''
								}`}
							>
								<Card.Content className='flex flex-row items-center gap-3 justify-start'>
									<div className='flex items-center justify-center'>
										<img
											src={IconGripVertical}
											alt='Drag to reorder'
											className='w-5 h-5 mt-[1.5rem] text-fg-muted'
											draggable={false}
										/>
									</div>
									<div className='mt-[1.5rem] text-fg-muted font-semibold text-sm'>
										{index + 1}
									</div>

									<div className='flex-1 min-w-0'>
										<TextField
											className='w-full'
											name='pattern'
											onChange={(value) =>
												updateRule(rule.id, 'pattern', value)
											}
											value={rule.pattern}
										>
											<Label>Subdomain Pattern</Label>
											<Input />
										</TextField>
									</div>

									<div className='flex flex-col gap-1 w-50'>
										<Label>Effect</Label>
										<Select
											value={rule.effect}
											onChange={(value) => updateRule(rule.id, 'effect', value)}
											className='w-full'
										>
											<Label className='sr-only'>Effect</Label>
											<Select.Trigger>
												<Select.Value />
												<Select.Indicator />
											</Select.Trigger>
											<Select.Popover>
												<ListBox>
													<ListBox.Item id='instance-logo'>
														instance-logo
													</ListBox.Item>
													<ListBox.Item id='domo-logo-colored'>
														domo-logo-colored
													</ListBox.Item>
													<ListBox.Item id='top'>top</ListBox.Item>
													<ListBox.Item id='right'>right</ListBox.Item>
													<ListBox.Item id='bottom'>bottom</ListBox.Item>
													<ListBox.Item id='left'>left</ListBox.Item>
												</ListBox>
											</Select.Popover>
										</Select>
									</div>

									<div className='flex flex-col gap-1 w-20'>
										<Label>Color</Label>
										<Popover
											onOpenChange={(isOpen) => {
												if (isOpen) {
													setActiveColorPicker(rule.id);
													setTempColor(
														rule.effect !== 'instance-logo'
															? rule.color
															: '#000000'
													);
												} else {
													setActiveColorPicker(null);
												}
											}}
										>
											<Button
												className={
													rule.effect === 'instance-logo'
														? 'w-full select__trigger--on-surface'
														: 'w-full'
												}
												style={
													rule.effect !== 'instance-logo'
														? {
																backgroundColor:
																	activeColorPicker === rule.id
																		? tempColor
																		: rule.color
														  }
														: undefined
												}
												isDisabled={rule.effect === 'instance-logo'}
											/>
											<Popover.Content>
												<ColorPicker
													value={tempColor}
													onChange={(newColor) => {
														setTempColor(newColor);
														updateRule(rule.id, 'color', newColor);
													}}
													showAlpha={true}
												/>
											</Popover.Content>
										</Popover>
									</div>

									{rules.length > 1 && (
										<div className='flex items-center mt-[1.5rem]'>
											<Button
												variant='danger'
												size='sm'
												onPress={() => removeRow(rule.id)}
												isIconOnly
											>
												<img src={IconTrash} alt='Remove rule' />
											</Button>
										</div>
									)}
								</Card.Content>
							</Card>
						))
					)}

					<div className='flex flex-row gap-2'>
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

			<Accordion className='cursor-pointer'>
				<Accordion.Item key='rule-ordering'>
					<Accordion.Heading>
						<Accordion.Trigger>
							Rule Priority & Ordering
							<Accordion.Indicator>
								<img src={IconChevronDown} />
							</Accordion.Indicator>
						</Accordion.Trigger>
					</Accordion.Heading>
					<Accordion.Panel>
						<Accordion.Body>
							<p>
								<strong>Rule Priority:</strong> Rules are applied in order from
								top to bottom. The first matching rule for a domain will be
								used, and all lower rules will be ignored.
							</p>
							<p className='mt-2'>
								<strong>Reordering:</strong> Drag and drop rules using the grip
								icon (⋮⋮) to reorder them. Higher priority rules should be
								placed at the top.
							</p>
						</Accordion.Body>
					</Accordion.Panel>
				</Accordion.Item>
				<Accordion.Item key='effects-info'>
					<Accordion.Heading>
						<Accordion.Trigger>
							Effects
							<Accordion.Indicator>
								<img src={IconChevronDown} />
							</Accordion.Indicator>
						</Accordion.Trigger>
					</Accordion.Heading>
					<Accordion.Panel>
						<Accordion.Body>
							Effects are the way the favicon gets modified:
							<ul className='space-y-1 pl-4 list-disc list-inside'>
								<li>
									<strong>instance-logo:</strong> uses the Domo instance logo
									instead of a color (no color picker for this one)
								</li>
								<li>
									<strong>domo-logo-colored:</strong> Domo logo with colored
									background (color picker selects background color)
								</li>
								<li>
									<strong>top:</strong> puts a colored stripe over the top
									quarter
								</li>
								<li>
									<strong>right:</strong> puts a colored stripe over the right
									quarter
								</li>
								<li>
									<strong>bottom:</strong> puts a colored stripe over the bottom
									quarter
								</li>
								<li>
									<strong>left:</strong> puts a colored stripe over the left
									quarter
								</li>
							</ul>
						</Accordion.Body>
					</Accordion.Panel>
				</Accordion.Item>
				<Accordion.Item key='regex-info'>
					<Accordion.Heading>
						<Accordion.Trigger>
							Regex Pattern
							<Accordion.Indicator>
								<img src={IconChevronDown} />
							</Accordion.Indicator>
						</Accordion.Trigger>
					</Accordion.Heading>
					<Accordion.Panel>
						<Accordion.Body>
							<p>
								Use regular expressions to match Domo instance subdomains. The
								pattern will be tested against the subdomain/instance only
								(i.e., before .domo.com).
							</p>
							<p>
								Examples:
								<ul className='space-y-1 pl-4 list-disc list-inside'>
									<li>
										<strong>.*</strong> - matches all Domo instances
									</li>
									<li>
										<strong>^company$</strong> - matches only company.domo.com
									</li>
									<li>
										<strong>.*-dev</strong> - matches any Domo instance ending
										with -dev (e.g., company-dev.domo.com)
									</li>
									<li>
										<strong>(qa|test)</strong> - matches qa.domo.com or
										test.domo.com
									</li>
								</ul>
							</p>
						</Accordion.Body>
					</Accordion.Panel>
				</Accordion.Item>
			</Accordion>
		</div>
	);
}
