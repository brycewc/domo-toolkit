import { Button, ButtonGroup, Tabs, Tooltip } from '@heroui/react';
import { IconBug, IconSparkles } from '@tabler/icons-react';
import { useEffect, useState } from 'react';

import {
  ActivityLogTable,
  FaviconSettings,
  LineageViewer,
  ReleaseNotesPage,
  Settings,
  ToastProvider,
  WelcomePage
} from '@/components';
import { useTheme } from '@/hooks';

const FULL_SCREEN_PAGES = new Map([
  [
    'activity-log',
    { component: ActivityLogTable, fullWidth: true, title: getActivityLogTitle }
  ],
  ['lineage', { component: LineageViewer, fullWidth: true, title: 'Lineage' }],
  [
    'release-notes',
    { component: ReleaseNotesPage, fullWidth: true, title: 'Release Notes' }
  ],
  ['welcome', { component: WelcomePage, fullWidth: true, title: 'Welcome' }]
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
          className={`flex h-full w-full flex-col px-4 pt-8 pb-4 ${fullScreenPage.fullWidth ? '' : 'max-w-4xl'}`}
        >
          <PageComponent />
        </div>
        <ToastProvider className='right-2 bottom-2' placement='bottom' />
      </div>
    );
  }

  const handleTabChange = (tabId) => {
    window.location.hash = tabId;
  };

  return (
    <div className='flex h-screen w-full justify-center'>
      <div className='fixed top-4 right-4 z-10'>
        <ButtonGroup>
          <Tooltip closeDelay={0} delay={400}>
            <Button
              isIconOnly
              variant='secondary'
              onPress={() => {
                window.open(
                  'https://github.com/brycewc/domo-toolkit/issues/new?template=bug-report.md',
                  '_blank'
                );
              }}
            >
              <IconBug stroke={1.5} />
            </Button>
            <Tooltip.Content className='w-fit text-center'>
              Report Bug
            </Tooltip.Content>
          </Tooltip>
          <Tooltip closeDelay={0} delay={400}>
            <Button
              isIconOnly
              variant='secondary'
              onPress={() => {
                window.open(
                  'https://github.com/brycewc/domo-toolkit/issues/new?template=feature-request.md',
                  '_blank'
                );
              }}
            >
              <IconSparkles stroke={1.5} />
            </Button>
            <Tooltip.Content className='w-fit text-center'>
              Request Feature
            </Tooltip.Content>
          </Tooltip>
        </ButtonGroup>
      </div>
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
          className='flex h-full max-w-3xl flex-col overflow-hidden px-4 pt-16'
          id='favicon'
        >
          <div className='w-full shrink-0 justify-start'>
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
      <ToastProvider className='right-2 bottom-2' placement='bottom' />
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
