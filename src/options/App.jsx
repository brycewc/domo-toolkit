import { Button, Link, Tabs, Toast } from '@heroui/react';
import { IconInbox } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import {
  ActivityLogTable,
  FaviconSettings,
  Settings,
  WelcomePage
} from '@/components';
import { useTheme } from '@/hooks';

const FULL_SCREEN_PAGES = new Map([
  [
    'activity-log',
    { component: ActivityLogTable, fullWidth: true, title: getActivityLogTitle }
  ],
  ['welcome', { component: WelcomePage, title: 'Welcome' }]
]);

const TAB_TITLES = {
  favicon: 'Favicon Preferences',
  settings: 'Settings'
};

export default function App() {
  const theme = useTheme();
  const [currentRoute, setCurrentRoute] = useState(getHashRoute);

  useEffect(() => {
    const handleHashChange = () => setCurrentRoute(getHashRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const fullScreenPage = FULL_SCREEN_PAGES.get(currentRoute);
    if (fullScreenPage) {
      const { title } = fullScreenPage;
      if (typeof title === 'function') {
        title().then((t) => {
          document.title = `${t} - Domo Toolkit`;
        });
      } else {
        document.title = `${title} - Domo Toolkit`;
      }
      return;
    }

    document.title = `${TAB_TITLES[currentRoute] || 'Options'} - Domo Toolkit`;
  }, [currentRoute]);

  const fullScreenPage = FULL_SCREEN_PAGES.get(currentRoute);

  if (fullScreenPage) {
    const PageComponent = fullScreenPage.component;
    return (
      <div className='flex h-screen w-full justify-center'>
        <div
          className={`flex h-full w-full flex-col px-4 py-8 ${fullScreenPage.fullWidth ? '' : 'max-w-3xl'}`}
        >
          <PageComponent />
        </div>
        <Toast.Provider className='right-2 bottom-2' placement='bottom' />
      </div>
    );
  }

  const handleTabChange = (tabId) => {
    window.location.hash = tabId;
  };

  return (
    <div className='flex h-screen w-full justify-center'>
      <Link
        className='fixed right-1 bottom-4 z-10 no-underline'
        href='https://github.com/brycewc/domo-toolkit/issues'
        target='_blank'
      >
        <Button>
          <IconInbox stroke={1.5} />
          Submit Feedback
        </Button>
      </Link>
      <Tabs
        className='h-full w-full items-center rounded-sm'
        selectedKey={currentRoute}
        variant='secondary'
        onSelectionChange={handleTabChange}
      >
        <Tabs.ListContainer className='fixed top-0 z-10 flex h-fit w-full max-w-3xl flex-row items-end justify-center bg-background pt-4'>
          <Tabs.List>
            <Tabs.Tab id='favicon'>
              Favicon Preferences
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id='settings'>
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel
          className='flex h-full max-w-3xl flex-col px-4 pt-16'
          id='favicon'
        >
          <div className='w-full justify-start'>
            <h3 className='mb-2 text-lg font-semibold'>Favicon Preferences</h3>
            <p className='text-sm text-muted'>
              Manage your favicon preferences. Patterns will automatically match
              against [subdomain].domo.com
            </p>
          </div>
          <FaviconSettings />
        </Tabs.Panel>
        <Tabs.Panel
          className='flex h-full max-w-3xl flex-col px-4 pt-16'
          id='settings'
        >
          <div className='w-full justify-start'>
            <h3 className='mb-2 text-lg font-semibold'>Settings</h3>
            <p className='text-sm text-muted'>
              Configure general extension settings.
            </p>
          </div>
          <Settings theme={theme} />
        </Tabs.Panel>
      </Tabs>
      <Toast.Provider className='right-2 bottom-2' placement='bottom' />
    </div>
  );
}

async function getActivityLogTitle() {
  try {
    const result = await chrome.storage.session.get([
      'activityLogObjects',
      'activityLogType'
    ]);
    const objects = result.activityLogObjects || [];
    const logType = result.activityLogType;
    let label;

    if (logType === 'single-object' && objects[0]) {
      label = objects[0].name || `${objects[0].type} ${objects[0].id}`;
    } else if (logType === 'child-cards') {
      label = `${objects.length} ${objects.length === 1 ? 'Card' : 'Cards'}`;
    } else if (logType === 'child-pages') {
      label = `${objects.length} ${objects.length === 1 ? 'Page' : 'Pages'}`;
    } else {
      label = `${objects.length} ${objects.length === 1 ? 'Object' : 'Objects'}`;
    }

    return `Activity Log: ${label}`;
  } catch {
    return 'Activity Log';
  }
}

function getHashRoute() {
  return window.location.hash.substring(1) || 'favicon';
}
