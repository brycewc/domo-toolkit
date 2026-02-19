import { useState, useEffect } from 'react';
import { Tabs } from '@heroui/react';
import { useTheme } from '@/hooks';
import {
  ActivityLogTable,
  Settings,
  FaviconSettings,
  shouldShowWelcomePage,
  WelcomePage
} from '@/components';

export default function App() {
  // Apply theme
  const theme = useTheme();

  // Get initial tab from URL hash (e.g., #activity)
  const getInitialTab = () => {
    const hash = window.location.hash.substring(1); // Remove the # symbol
    return hash || 'favicon'; // Default to 'favicon' if no hash
  };

  const [selectedTab, setSelectedTab] = useState(getInitialTab);
  const [showWelcome, setShowWelcome] = useState(null);

  // Check if we should show welcome page
  useEffect(() => {
    async function checkWelcome() {
      const shouldShow = await shouldShowWelcomePage();
      setShowWelcome(shouldShow);
    }
    checkWelcome();
  }, []);

  // Update URL hash when tab changes
  const handleTabChange = (tabId) => {
    setSelectedTab(tabId);
    window.location.hash = tabId;
  };

  // Listen for hash changes (e.g., browser back/forward)
  useEffect(() => {
    const handleHashChange = () => {
      setSelectedTab(getInitialTab());
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // Update document title based on selected tab
  useEffect(() => {
    const tabTitles = {
      welcome: 'Welcome',
      favicon: 'Favicon Preferences',
      settings: 'Settings'
    };

    if (selectedTab === 'activity-log') {
      chrome.storage.session
        .get(['activityLogObjects', 'activityLogType'])
        .then((result) => {
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

          document.title = `Activity Log: ${label} - Domo Toolkit`;
        })
        .catch(() => {
          document.title = 'Activity Log - Domo Toolkit';
        });
    } else {
      document.title = `${tabTitles[selectedTab] || 'Options'} - Domo Toolkit`;
    }
  }, [selectedTab]);

  return (
    <div className='flex h-screen w-full justify-center'>
      <Tabs
        className='h-full w-full items-center rounded-sm'
        selectedKey={selectedTab}
        onSelectionChange={handleTabChange}
        variant='secondary'
      >
        <Tabs.ListContainer className='fixed top-0 z-10 flex h-fit w-full max-w-3xl flex-row items-end justify-center bg-background pt-4'>
          <Tabs.List>
            {showWelcome && (
              <Tabs.Tab id='welcome'>
                Welcome
                <Tabs.Indicator />
              </Tabs.Tab>
            )}
            <Tabs.Tab id='favicon'>
              Favicon Preferences
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id='settings'>
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
            {selectedTab === 'activity-log' && (
              <Tabs.Tab id='activity-log'>
                Activity Log
                <Tabs.Indicator />
              </Tabs.Tab>
            )}
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel
          className='flex h-full max-w-3xl flex-col px-4 pt-16'
          id='welcome'
        >
          <WelcomePage />
        </Tabs.Panel>
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
        <Tabs.Panel
          className='flex flex-col items-start px-4 pt-16'
          id='activity-log'
        >
          {selectedTab === 'activity-log' && <ActivityLogTable />}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
