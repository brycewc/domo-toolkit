import { useEffect, useState, useCallback } from 'react';
import { Button, Tabs } from '@heroui/react';
import { useTheme } from '@/hooks';
import {
  fetchCurrentObjectAsDomoObject,
  onCurrentObjectChange,
  getCurrentInstance,
  onCurrentInstanceChange
} from '@/utils';
import {
  ActivityLogCurrentObject,
  ClearCookies,
  ContextFooter,
  GetPages,
  NavigateToCopiedObject,
  StatusBar,
  UpdateDataflowDetails
} from '@/components';
import './App.css';

export default function App() {
  // Apply theme
  useTheme();

  const [currentObject, setCurrentObject] = useState();
  const [currentInstance, setCurrentInstance] = useState(null);
  const [isDomoPage, setIsDomoPage] = useState(false);
  const [selectedTab, setSelectedTab] = useState('favorites');
  const [isLoadingCurrentObject, setIsLoadingCurrentObject] = useState(true);
  const [statusBar, setStatusBar] = useState({
    title: '',
    description: '',
    status: 'accent',
    timeout: 3000,
    visible: false
  });

  // Restore last selected tab if within 10 seconds
  useEffect(() => {
    chrome.storage.local.get(
      ['lastSelectedTab', 'lastTabTimestamp'],
      (result) => {
        const now = Date.now();
        const timeSinceLastTab = now - (result.lastTabTimestamp || 0);

        // If last tab was selected within 10 seconds, restore it
        if (result.lastSelectedTab && timeSinceLastTab < 10000) {
          setSelectedTab(result.lastSelectedTab);
        }
      }
    );
  }, []);

  useEffect(() => {
    // Request fresh object type detection from content script when popup opens
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.id && tabs[0]?.url) {
        // Check if current page is a Domo instance
        try {
          const url = new URL(tabs[0].url);
          setIsDomoPage(url.hostname.includes('domo.com'));
        } catch (error) {
          setIsDomoPage(false);
        }

        // Request fresh detection from content script
        chrome.tabs.sendMessage(
          tabs[0].id,
          { action: 'getObjectType' },
          (response) => {
            // Response will be received, but storage change listener will handle the update
            if (chrome.runtime.lastError) {
              // Content script might not be loaded on this page (e.g., chrome:// pages)
              console.log(
                'Could not detect object type:',
                chrome.runtime.lastError.message
              );
            }
            // Mark loading as complete after content script responds
            setIsLoadingCurrentObject(false);
          }
        );
      } else {
        // No active tab, stop loading
        setIsLoadingCurrentObject(false);
      }
    });

    // Load initial currentObject from storage
    fetchCurrentObjectAsDomoObject().then((domoObject) => {
      setCurrentObject(domoObject);
    });

    // Load initial currentInstance from storage
    getCurrentInstance().then((instance) => {
      setCurrentInstance(instance);
    });

    // Listen for storage changes from other components
    const cleanupListener = onCurrentObjectChange((domoObject) => {
      setCurrentObject(domoObject);
    });

    // Listen for current instance changes
    const cleanupInstanceListener = onCurrentInstanceChange((instance) => {
      setCurrentInstance(instance);
    });

    // Cleanup listeners on unmount
    return () => {
      cleanupListener();
      cleanupInstanceListener();
    };
  }, []);

  const showStatus = (
    title,
    description,
    status = 'accent',
    timeout = 3000
  ) => {
    setStatusBar({ title, description, status, timeout, visible: true });
  };

  const hideStatus = useCallback(() => {
    setStatusBar((prev) => ({ ...prev, visible: false }));
  }, []);

  const handleTabChange = (tabId) => {
    if (tabId === 'settings') {
      // Open options page instead of switching tabs
      chrome.runtime.openOptionsPage();
      return;
    }

    // Update selected tab state
    setSelectedTab(tabId);

    // Store the selected tab and timestamp
    chrome.storage.local.set({
      lastSelectedTab: tabId,
      lastTabTimestamp: Date.now()
    });
  };

  return (
    <div className='flex w-auto min-w-md flex-col gap-2 bg-background p-2'>
      <Tabs
        className='w-full'
        orientation='vertical'
        selectedKey={selectedTab}
        onSelectionChange={handleTabChange}
      >
        <Tabs.ListContainer>
          <Tabs.List aria-label='Vertical tabs'>
            <Tabs.Tab id='favorites'>
              Favorites
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id='delete' isDisabled={!isDomoPage}>
              Delete
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id='update' isDisabled={!isDomoPage}>
              Update
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id='other' isDisabled={!isDomoPage}>
              Other
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id='settings'>
              Settings
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
        <Tabs.Panel className='flex flex-col gap-1 px-4' id='favorites'>
          <ActivityLogCurrentObject
            currentObject={currentObject}
            onStatusUpdate={showStatus}
          />
          <Button
            fullWidth
            isDisabled={!isDomoPage || !currentObject?.id}
            onPress={() => {
              navigator.clipboard.writeText(currentObject?.id);
              showStatus(
                `Copied ${currentObject?.typeName} ID ${currentObject?.id} to clipboard`,
                '',
                'success',
                1500
              );
            }}
          >
            Copy ID
          </Button>
          <NavigateToCopiedObject
            isDomoPage={isDomoPage}
            currentInstance={currentInstance}
          />
          <ClearCookies onStatusUpdate={showStatus} isDisabled={!isDomoPage} />
        </Tabs.Panel>
        <Tabs.Panel
          className='flex flex-col gap-1 px-4'
          id='delete'
        ></Tabs.Panel>
        <Tabs.Panel className='flex flex-col gap-1 px-4' id='update'>
          {currentObject?.typeId === 'DATAFLOW_TYPE' && (
            <UpdateDataflowDetails
              onStatusUpdate={showStatus}
              currentObject={currentObject}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel className='flex flex-col gap-1 px-4' id='other'>
          {(currentObject?.typeId === 'PAGE' ||
            currentObject?.typeId === 'DATA_APP_VIEW') && (
            <GetPages
              currentObject={currentObject}
              currentInstance={currentInstance}
              onStatusUpdate={showStatus}
              isDisabled={!isDomoPage}
            />
          )}
        </Tabs.Panel>
        <Tabs.Panel id='settings'></Tabs.Panel>
      </Tabs>
      <div className='relative min-h-[5rem] w-full min-w-sm'>
        <div
          className={`transition-all duration-300 ease-in-out ${
            statusBar.visible
              ? '-translate-y-2 opacity-0'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <ContextFooter
            isDomoPage={isDomoPage}
            currentInstance={currentInstance}
            currentObject={currentObject}
            isLoading={isLoadingCurrentObject}
          />
        </div>
        {statusBar.visible && (
          <div className='absolute inset-0 translate-y-0 opacity-100 transition-all duration-300 ease-in-out'>
            <StatusBar
              title={statusBar.title}
              description={statusBar.description}
              status={statusBar.status}
              timeout={statusBar.timeout}
              onClose={hideStatus}
            />
          </div>
        )}
      </div>
    </div>
  );
}
