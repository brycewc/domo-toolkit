import { Tabs } from '@heroui/react';
import './App.css';

export default function App() {
	return (
		<Tabs className='w-full max-w-lg ronnded-sm'>
			<Tabs.ListContainer>
				<Tabs.List aria-label='Vertical tabs'>
					<Tabs.Tab id='favicon'>
						Favicon
						<Tabs.Indicator />
					</Tabs.Tab>
					<Tabs.Tab id='activity'>
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
			<Tabs.Panel className='px-4' id='favicon'>
				<h3 className='mb-2 font-semibold'>Favicon Settings</h3>
				<p className='text-sm text-muted'>Manage your favicon preferences.</p>
			</Tabs.Panel>
			<Tabs.Panel className='px-4' id='activity'>
				<h3 className='mb-2 font-semibold'>Activity Log Setup</h3>
				<p className='text-sm text-muted'>
					Configure saved card information for activity log related functions.
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
