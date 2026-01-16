import { useEffect, useState, useCallback, useRef } from 'react';
import { Button, ButtonGroup, Tabs, Tooltip } from '@heroui/react';
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
  DeleteCurrentObject,
  FilterActivityLog,
  GetPages,
  NavigateToCopiedObject,
  StatusBar,
  UpdateDataflowDetails,
  ShareWithSelf
} from '@/components';
import './App.css';
import { IconClipboard, IconSettings } from '@tabler/icons-react';

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
  const navigateToCopiedRef = useRef();

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
        let isDomo = false;
        try {
          const url = new URL(tabs[0].url);
          isDomo = url.hostname.endsWith('.domo.com');
          setIsDomoPage(isDomo);
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
        // Load initial currentInstance from storage
        // Only set instance state if we're on a Domo page
        getCurrentInstance().then((instance) => {
          if (isDomo) {
            setCurrentInstance(instance);
          } else {
            // Clear instance if not on a Domo page
            setCurrentInstance(null);
          }
        });
      } else {
        // No active tab, stop loading
        setIsLoadingCurrentObject(false);
        setIsDomoPage(false);
        setCurrentInstance(null);
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
      // Verify we're still on a Domo page before updating instance
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]?.url) {
          try {
            const url = new URL(tabs[0].url);
            const isDomo = url.hostname.endsWith('.domo.com');
            if (isDomo) {
              setCurrentInstance(instance);
              setIsDomoPage(true);
            } else {
              setCurrentInstance(null);
              setIsDomoPage(false);
            }
          } catch (error) {
            setCurrentInstance(null);
            setIsDomoPage(false);
          }
        }
      });
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
    <div className='flex w-auto min-w-xs flex-col gap-1 bg-background p-2'>
      <ButtonGroup fullWidth>
        <Tooltip delay={400} closeDelay={0}>
          <Button
            isDisabled={!isDomoPage || !currentObject?.id}
            onPress={() => {
              navigator.clipboard.writeText(currentObject?.id);
              showStatus(
                `Copied ${currentObject?.typeName} ID ${currentObject?.id} to clipboard`,
                '',
                'success',
                1500
              );
              // Trigger detection in NavigateToCopiedObject
              navigateToCopiedRef.current?.triggerDetection(currentObject?.id);
            }}
            isIconOnly
          >
            <IconClipboard className='h-4 w-4' />
          </Button>
          <Tooltip.Content>Copy ID</Tooltip.Content>
        </Tooltip>

        <ShareWithSelf
          currentObject={currentObject}
          onStatusUpdate={showStatus}
          isDisabled={!isDomoPage}
        />
        <ClearCookies onStatusUpdate={showStatus} isDisabled={!isDomoPage} />
        <DeleteCurrentObject
          currentObject={currentObject}
          onStatusUpdate={showStatus}
          isDisabled={!isDomoPage}
        />
        <Tooltip delay={400} closeDelay={0}>
          <Button
            onPress={() => {
              chrome.runtime.openOptionsPage();
            }}
            isIconOnly
          >
            <IconSettings className='h-4 w-4' />
          </Button>
          <Tooltip.Content>Extension settings</Tooltip.Content>
        </Tooltip>
      </ButtonGroup>
      {/* <ActivityLogCurrentObject
        currentObject={currentObject}
        onStatusUpdate={showStatus}
      /> */}
      <FilterActivityLog
        currentObject={currentObject}
        // isDisabled={!isDomoPage}
      />
      <NavigateToCopiedObject
        ref={navigateToCopiedRef}
        isDomoPage={isDomoPage}
        currentInstance={currentInstance}
      />
      {(currentObject?.typeId === 'PAGE' ||
        currentObject?.typeId === 'DATA_APP_VIEW') && (
        <GetPages
          currentObject={currentObject}
          currentInstance={currentInstance}
          onStatusUpdate={showStatus}
          isDisabled={!isDomoPage}
        />
      )}
      {currentObject?.typeId === 'DATAFLOW_TYPE' && (
        <UpdateDataflowDetails
          onStatusUpdate={showStatus}
          currentObject={currentObject}
        />
      )}

      <div className='relative min-h-[5rem] w-full'>
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
