import { useState, useEffect } from 'react';
import {
	Accordion,
	Button,
	Description,
	Input,
	Label,
	Select,
	ListBox,
	Switch,
	TextField,
	Form,
	Fieldset
} from '@heroui/react';
import IconChevronDown from '@/assets/icons/chevron-down.svg';
import IconX from '@/assets/icons/x.svg';

export default function FaviconSettings() {
	const [rules, setRules] = useState([]);
	const [saveStatus, setSaveStatus] = useState('');

	// Load settings from Chrome storage on component mount
	useEffect(() => {
		chrome.storage.sync.get(['faviconRules'], (result) => {
			if (result.faviconRules && result.faviconRules.length > 0) {
				setRules(result.faviconRules);
			} else {
				// Set default rules if none exist
				setRules([
					{
						id: Date.now(),
						pattern: '',
						effect: 'bottom',
						color: '#00ff00',
						useInstanceLogo: false
					}
				]);
			}
		});
	}, []);

	const onSave = (e) => {
		e.preventDefault();

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
				color: '#00ff00',
				useInstanceLogo: false
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
		<Form className='flex flex-col gap-4 p-4' onSubmit={onSave}>
			<Fieldset>
				{rules.map((rule, index) => (
					<div key={rule.id} className='flex items-center gap-3'>
						<div className='flex-1 min-w-0'>
							<TextField
								className='w-full'
								onChange={(e) => updateRule(rule.id, 'pattern', e.target.value)}
							>
								<Label>Regex Pattern</Label>
								<Input
									value={rule.pattern}
									placeholder='e.g., domo-prod.domo.com'
								/>
							</TextField>
						</div>

						<div className='w-32'>
							<Label className='mb-1 block'>Effect</Label>
							<Select
								value={rule.effect}
								onChange={(value) => updateRule(rule.id, 'effect', value)}
								className='w-full'
								placeholder='Select effect'
								isDisabled={rule.useInstanceLogo}
							>
								<Label className='sr-only'>Effect</Label>
								<Select.Trigger>
									<Select.Value />
									<Select.Indicator />
								</Select.Trigger>
								<Select.Popover>
									<ListBox>
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

						<div className='w-20'>
							<Label className='mb-1 block'>Color</Label>
							<Input
								type='color'
								value={rule.color}
								onChange={(e) => updateRule(rule.id, 'color', e.target.value)}
								className='w-full h-10 rounded border border-gray-300 cursor-pointer'
								disabled={rule.useInstanceLogo}
							/>
						</div>

						<div className='flex-auto flex-col content-between self-auto justify-between justify-self-auto'>
							<Label className='mb-2 block'>Instance Logo</Label>
							<Switch
								isSelected={rule.useInstanceLogo || false}
								onChange={(checked) =>
									updateRule(rule.id, 'useInstanceLogo', checked)
								}
								size='lg'
							>
								<Switch.Control>
									<Switch.Thumb />
								</Switch.Control>
							</Switch>
						</div>

						{rules.length > 1 && (
							<Button
								variant='secondary'
								size='sm'
								onPress={() => removeRow(rule.id)}
								className='mt-5'
								isIconOnly
							>
								<img src={IconX} alt='Remove rule' />
							</Button>
						)}
					</div>
				))}
			</Fieldset>

			<div className='flex flex-row gap-2'>
				<Button type='button' variant='secondary' onPress={addRow}>
					Add row
				</Button>

				{saveStatus && (
					<div className='text-green-600 text-sm'>{saveStatus}</div>
				)}

				<Button type='submit'>Save Settings</Button>
			</div>

			<div className='mt-6 pt-6 border-t'>
				<Accordion className='cursor-pointer'>
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
								Use regular expressions to match Domo instance URLs. The pattern
								will be tested against the full URL.
								<p className='font-mono text-xs bg-gray-100 p-2 rounded'>
									Examples:
									<br />
									- domo-prod\.domo\.com (matches production)
									<br />
									- .*-dev\.domo\.com (matches any dev instance)
									<br />- (qa|test)\.domo\.com (matches qa or test)
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
								<ul className='text-xs space-y-1 pl-4 list-disc list-inside'>
									<li>
										<strong>top:</strong> puts a colored stripe over the top
										quarter
									</li>
									<li>
										<strong>right:</strong> puts a colored stripe over the right
										quarter
									</li>
									<li>
										<strong>bottom:</strong> puts a colored stripe over the
										bottom quarter
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
										<strong>xor-top:</strong> like 'top', but whites out what
										gets covered
									</li>
								</ul>
							</Accordion.Body>
						</Accordion.Panel>
					</Accordion.Item>
				</Accordion>
			</div>
		</Form>
	);
}
