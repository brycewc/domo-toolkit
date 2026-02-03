import { useState, useEffect } from 'react';
import { Tabs } from '@heroui/react';
import { useTheme } from '@/hooks';
import { ActivityLogTable, FaviconSettings, AppSettings } from '@/components';

export default function App() {
  // Apply theme
  const theme = useTheme();

  // Get initial tab from URL hash (e.g., #activity)
  const getInitialTab = () => {
    const hash = window.location.hash.substring(1); // Remove the # symbol
    return hash || 'favicon'; // Default to 'favicon' if no hash
  };

  const [selectedTab, setSelectedTab] = useState(getInitialTab);

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

  return (
    <div className='flex h-screen justify-center p-4'>
      <Tabs
        className='h-[calc(100vh-4)] w-full items-center rounded-sm'
        selectedKey={selectedTab}
        onSelectionChange={handleTabChange}
        variant='secondary'
      >
        <Tabs.ListContainer className='flex w-full max-w-3xl flex-row justify-center'>
          <Tabs.List>
            <Tabs.Tab id='favicon'>
              Favicon
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
          className='flex h-full max-w-3xl flex-col px-4'
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
          className='flex h-full max-w-3xl flex-col px-4'
          id='settings'
        >
          <div className='w-full justify-start'>
            <h3 className='mb-2 text-lg font-semibold'>App Settings</h3>
            <p className='text-sm text-muted'>
              Configure general application settings.
            </p>
          </div>
          <AppSettings theme={theme} />
        </Tabs.Panel>
        <Tabs.Panel
          className='flex flex-col items-start px-4'
          id='activity-log'
        >
          {selectedTab === 'activity-log' && <ActivityLogTable />}
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
