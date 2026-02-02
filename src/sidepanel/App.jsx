import { useEffect, useState, useRef } from 'react';
import { Card, Spinner } from '@heroui/react';
import { GetPagesView, ActionButtons } from '@/components';
import { useTheme } from '@/hooks';
import { DomoContext } from '@/models';

export default function App() {
  // Apply theme
  useTheme();

  const [activeView, setActiveView] = useState('default');
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [currentContext, setCurrentContext] = useState(null);
  const [currentTabId, setCurrentTabId] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const statusCallbackRef = useRef(null);

  // Listen for storage changes to detect when sidepanel data is set
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.sidepanelDataList) {
        const data = changes.sidepanelDataList.newValue;
        if (!data) {
          // Data was cleared - return to default view
          setActiveView('default');
        } else if (data?.type === 'loading') {
          setActiveView('loading');
          setLoadingMessage(data.message || 'Loading...');
        } else if (data?.type === 'getPages') {
          setActiveView('getPages');
        } else if (data?.type === 'childPagesWarning') {
          setActiveView('childPagesWarning');
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
          } else if (result.sidepanelDataList.type === 'childPagesWarning') {
            setActiveView('childPagesWarning');
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
          windowId: window.id
        });

        if (response.success) {
          // Always set the tab ID so we receive updates for this tab
          setCurrentTabId(response.tabId);

          if (response.context) {
            // Reconstruct DomoContext from plain object to get class instance with methods
            const context = DomoContext.fromJSON(response.context);
            console.log('[Sidepanel] Reconstructed context:', context);
            setCurrentContext(context);
          } else {
            setCurrentContext(null);
          }
        } else {
          setCurrentContext(null);
          setCurrentTabId(null);
        }
      } catch (error) {
        console.error('[Sidepanel] Error getting tab context:', error);
        setCurrentContext(null);
      } finally {
        setIsLoadingCurrentContext(false);
      }
    });
  }, []);

  // Listen for context updates while sidepanel is open
  useEffect(() => {
    console.log('[Sidepanel] Setting up message listener');
    const handleMessage = (message, sender, sendResponse) => {
      console.log('[Sidepanel] Received message:', message.type, message);

      // Only handle messages meant for the sidepanel
      if (message.type === 'TAB_CONTEXT_UPDATED') {
        console.log(
          `[Sidepanel] TAB_CONTEXT_UPDATED: message.tabId=${message.tabId}, currentTabId=${currentTabId}`
        );

        // Update context if it's for the current tab
        if (message.tabId === currentTabId) {
          const context = message.context
            ? DomoContext.fromJSON(message.context)
            : null;
          setCurrentContext(context);
          console.log('[Sidepanel] Updated context:', context);
        }
        sendResponse({ received: true });
        return true;
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

        // Send response for this message type
        sendResponse({ received: true });
        return true;
      }

      // Don't respond to other message types - let them pass through to background
      return false;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    console.log('[Sidepanel] Message listener registered');
    return () => {
      console.log('[Sidepanel] Message listener removed');
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentTabId]);

  // Listen for tab activation changes (only when not locked)
  useEffect(() => {
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
  }, []);

  const handleBackToDefault = () => {
    setActiveView('default');
    // Clear the sidepanel data
    chrome.storage.local.remove(['sidepanelDataList']);
  };

  return (
    <div className='h-screen w-full space-y-1 overflow-hidden p-1'>
      <ActionButtons
        currentContext={currentContext}
        isLoadingCurrentContext={isLoadingCurrentContext}
        collapsable={true}
        onStatusCallbackReady={(callback) => {
          statusCallbackRef.current = callback;
        }}
      />

      {activeView === 'loading' && (
        <Card className='w-full'>
          <Card.Content className='flex flex-col items-center justify-center gap-2 py-8'>
            <Spinner size='lg' />
            <p className='text-sm text-muted'>{loadingMessage}</p>
          </Card.Content>
        </Card>
      )}

      {(activeView === 'getPages' || activeView === 'childPagesWarning') && (
        <GetPagesView
          onBackToDefault={handleBackToDefault}
          onStatusUpdate={statusCallbackRef.current}
        />
      )}
    </div>
  );
}
