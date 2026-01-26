import { useEffect, useState, useRef } from 'react';
import { Button } from '@heroui/react';
import { GetPagesView, ActionButtons } from '@/components';
import { useTheme } from '@/hooks';
import { DomoContext } from '@/models';

export default function App() {
  // Apply theme
  useTheme();

  const [activeView, setActiveView] = useState('default');
  const [lockedTabId, setLockedTabId] = useState(null); // Ephemeral lock for specific tab context
  const [currentContext, setCurrentContext] = useState(null);
  const [currentTabId, setCurrentTabId] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const statusCallbackRef = useRef(null);

  // Listen for storage changes to detect when sidepanel data is set
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.sidepanelDataList) {
        const data = changes.sidepanelDataList.newValue;
        if (data?.type === 'getPages') {
          setActiveView('getPages');
          // Lock to the tab that triggered this view
          if (data.tabId) {
            setLockedTabId(data.tabId);
          }
        } else if (data?.type === 'childPagesWarning') {
          setActiveView('childPagesWarning');
          // Lock to the tab that triggered this view
          if (data.tabId) {
            setLockedTabId(data.tabId);
          }
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Check if there's already sidepanel data on mount
    chrome.storage.local.get(['sidepanelDataList'], (result) => {
      if (result.sidepanelDataList) {
        // Only use it if it's recent (within last 10 seconds)
        const age = Date.now() - (result.sidepanelDataList.timestamp || 0);
        if (age < 1000) {
          if (result.sidepanelDataList.type === 'getPages') {
            setActiveView('getPages');
            if (result.sidepanelDataList.tabId) {
              setLockedTabId(result.sidepanelDataList.tabId);
            }
          } else if (result.sidepanelDataList.type === 'childPagesWarning') {
            setActiveView('childPagesWarning');
            if (result.sidepanelDataList.tabId) {
              setLockedTabId(result.sidepanelDataList.tabId);
            }
          }
        }
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Fetch context on mount and when lock changes
  useEffect(() => {
    // Get current window and request context from service worker
    chrome.windows.getCurrent(async (window) => {
      try {
        // Request context for active tab in this window
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          ...(lockedTabId ? { tabId: lockedTabId } : { windowId: window.id })
        });

        if (response.success && response.context) {
          // Reconstruct DomoContext from plain object to get class instance with methods
          const context = DomoContext.fromJSON(response.context);
          console.log('[Sidepanel] Reconstructed context:', context);
          setCurrentContext(context);
          setCurrentTabId(response.tabId);
        } else {
          setCurrentContext(null);
          setCurrentTabId(lockedTabId);
        }
      } catch (error) {
        console.error('[Sidepanel] Error getting tab context:', error);
        setCurrentContext(null);
      } finally {
        setIsLoadingCurrentContext(false);
      }
    });
  }, [lockedTabId]);

  // Listen for context updates while sidepanel is open
  useEffect(() => {
    console.log('[Sidepanel] Setting up message listener');
    const handleMessage = (message, sender, sendResponse) => {
      console.log('[Sidepanel] Received message:', message.type, message);

      // Always send a response to keep the message channel open
      const response = { received: true };

      if (message.type === 'TAB_CONTEXT_UPDATED') {
        // Only update if we're not locked to a specific tab, or if it's for the locked tab
        // Read current lockedTabId value instead of using closure
        chrome.storage.local.get(['sidepanelDataList'], (result) => {
          const currentLockedTabId = result.sidepanelDataList?.tabId || null;

          if (!currentLockedTabId) {
            // In default view, update context if this is the active tab
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs[0] && message.tabId === tabs[0].id) {
                console.log(
                  '[Sidepanel] Received context update for active tab:',
                  message.context
                );
                const context = DomoContext.fromJSON(message.context);
                setCurrentContext(context);
                setCurrentTabId(message.tabId);
              }
            });
          } else if (message.tabId === currentLockedTabId) {
            // Locked to a specific tab, only update for that tab
            console.log(
              '[Sidepanel] Received context update for locked tab:',
              message.context
            );
            const context = DomoContext.fromJSON(message.context);
            setCurrentContext(context);
          }
        });
      } else if (message.type === 'SHOW_STATUS') {
        // Display status in the sidepanel's StatusBar
        console.log('[Sidepanel] Received SHOW_STATUS message:', message);
        console.log(
          '[Sidepanel] statusCallbackRef.current exists?',
          !!statusCallbackRef.current
        );
        if (statusCallbackRef.current) {
          console.log(
            '[Sidepanel] Calling statusCallbackRef.current with timeout:',
            message.timeout
          );
          statusCallbackRef.current(
            message.title,
            message.description,
            message.status || 'accent',
            message.timeout !== undefined ? message.timeout : 3000
          );
        } else {
          console.warn(
            '[Sidepanel] statusCallbackRef.current is null, cannot show status'
          );
        }
      }

      // Send response and return true to keep channel open
      sendResponse(response);
      return true;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    console.log('[Sidepanel] Message listener registered');
    return () => {
      console.log('[Sidepanel] Message listener removed');
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, []); // Remove lockedTabId from dependencies

  // Listen for tab activation changes (only when not locked)
  useEffect(() => {
    if (lockedTabId) {
      // Don't listen to tab changes when locked
      return;
    }

    const handleTabActivated = async (activeInfo) => {
      try {
        // Fetch context for the newly activated tab
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          tabId: activeInfo.tabId
        });

        if (response.success && response.context) {
          const context = DomoContext.fromJSON(response.context);
          console.log('[Sidepanel] Tab activated, updated context:', context);
          setCurrentContext(context);
          setCurrentTabId(activeInfo.tabId);
        } else {
          setCurrentContext(null);
          setCurrentTabId(activeInfo.tabId);
        }
      } catch (error) {
        console.error(
          '[Sidepanel] Error fetching context for activated tab:',
          error
        );
        setCurrentContext(null);
      }
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
    };
  }, [lockedTabId]);

  const handleBackToDefault = () => {
    setActiveView('default');
    setLockedTabId(null);
    // Clear the sidepanel data
    chrome.storage.local.remove(['sidepanelDataList']);
  };

  return (
    <div className='flex min-h-screen w-full flex-col items-center gap-2 p-2'>
      <ActionButtons
        currentContext={currentContext}
        isLoadingCurrentContext={isLoadingCurrentContext}
        collapsable={true}
        onStatusCallbackReady={(callback) => {
          statusCallbackRef.current = callback;
        }}
      />

      {activeView === 'default' ? null : (
        <GetPagesView
          lockedTabId={lockedTabId}
          onBackToDefault={handleBackToDefault}
          onStatusUpdate={statusCallbackRef.current}
        />
      )}
    </div>
  );
}
