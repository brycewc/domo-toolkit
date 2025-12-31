import { useState, useEffect } from 'react';
import {
	Accordion,
	Button,
	Description,
	Input,
	Label,
	Select,
	ListBox,
	TextField,
	Form,
	Fieldset
} from '@heroui/react';
import IconChevronDown from '@/assets/icons/chevron-down.svg';
import IconX from '@/assets/icons/x.svg';
import { clearFaviconCache } from '@/utils/faviconModifier';

export default function FaviconSettings() {
	const [rules, setRules] = useState([]);
	const [saveStatus, setSaveStatus] = useState('');

	// Load settings from Chrome storage on component mount
	useEffect(() => {
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
		});
	}, []);

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
				setSaveStatus('Settings saved successfully!');
				setTimeout(() => setSaveStatus(''), 3000);
			}
		);
	};

	const addRow = () => {
		setRules([
			...rules,
			{
				id: Date.now(),
				pattern: '',
				effect: 'bottom',
				color: '#00ff00'
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

	return (
		<div className='flex flex-col justify-between w-full min-h-[85vh]'>
			<Form className='flex flex-col gap-4 p-4 w-full' onSubmit={onSave}>
				{rules.map((rule, index) => (
					<Fieldset>
						<div
							key={rule.id}
							className='flex items-start gap-3 justify-start h-20'
						>
							<div className='flex-1 min-w-0'>
								<TextField
									className='w-full'
									name='pattern'
									onChange={(value) => updateRule(rule.id, 'pattern', value)}
									value={rule.pattern}
								>
									<Label>Subdomain Pattern</Label>
									<Input placeholder='e.g., ^company$ or .*-dev' />
								</TextField>
							</div>

							<div className='flex flex-col gap-1 w-50'>
								<Label>Effect</Label>
								<Select
									value={rule.effect}
									onChange={(value) => updateRule(rule.id, 'effect', value)}
									className='w-full'
									placeholder='Select effect'
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
											<ListBox.Item id='cover'>cover</ListBox.Item>
											<ListBox.Item id='replace'>replace</ListBox.Item>
											<ListBox.Item id='background'>background</ListBox.Item>
											<ListBox.Item id='xor-top'>xor-top</ListBox.Item>
										</ListBox>
									</Select.Popover>
								</Select>
							</div>

							<div className='flex flex-col gap-1 w-20'>
								<Label>Color</Label>
								<Input
									type='color'
									value={rule.color}
									onChange={(e) => updateRule(rule.id, 'color', e.target.value)}
									className='w-full min-h-9 p-1'
									disabled={
										rule.effect === 'instance-logo' ||
										rule.effect === 'domo-logo-colored'
									}
								/>
							</div>

							{rules.length > 1 && (
								<div className='flex items-center h-20'>
									<Button
										variant='danger'
										size='sm'
										onPress={() => removeRow(rule.id)}
										isIconOnly
									>
										<img src={IconX} alt='Remove rule' />
									</Button>
								</div>
							)}
						</div>
					</Fieldset>
				))}

				<div className='flex flex-row gap-2'>
					<Button type='submit'>Save Settings</Button>
					<Button type='button' variant='secondary' onPress={addRow}>
						Add row
					</Button>
				</div>
				{saveStatus && (
					<div className='text-green-600 text-sm'>{saveStatus}</div>
				)}
			</Form>

			<Accordion className='cursor-pointer'>
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
								<li>
									<strong>cover:</strong> covers the whole area in
									semi-transparent color
								</li>
								<li>
									<strong>replace:</strong> replaces non-transparent parts of
									the icon with color
								</li>
								<li>
									<strong>background:</strong> color fill of the whole area
									behind the icon
								</li>
								<li>
									<strong>xor-top:</strong> like 'top', but whites out what gets
									covered
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
							Use regular expressions to match Domo instance subdomains. The
							pattern will be tested against the subdomain only (before
							.domo.com).
							<p className='font-mono bg-gray-100 p-2 rounded'>
								Examples:
								<br />
								- ^company$ (matches company.domo.com only)
								<br />
								- .*-dev (matches any Domo instance ending with -dev)
								<br />- (qa|test) (matches qa.domo.com or test.domo.com)
								<br />- .* (matches all Domo instances)
							</p>
						</Accordion.Body>
					</Accordion.Panel>
				</Accordion.Item>
			</Accordion>
		</div>
	);
}
