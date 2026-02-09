import { useEffect, useState, useRef } from 'react';
import { Card, Spinner } from '@heroui/react';
import {
  ActionButtons,
  GetCardsView,
  GetDatasetsView,
  GetPagesView,
  ObjectDetailsView
} from '@/components';
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

  // Listen for storage changes for sidepanel data
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'session' && changes.sidepanelDataList) {
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
        } else if (data?.type === 'getCards') {
          setActiveView('getCards');
        } else if (data?.type === 'getDatasets') {
          setActiveView('getDatasets');
        } else if (data?.type === 'viewObjectDetails') {
          setActiveView('viewObjectDetails');
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Check if there's already sidepanel data on mount
    chrome.storage.session.get(['sidepanelDataList'], (result) => {
      if (result.sidepanelDataList) {
        // Only use it if it's recent (within last 10 seconds)
        const age = Date.now() - (result.sidepanelDataList.timestamp || 0);
        if (age < 1000) {
          if (result.sidepanelDataList.type === 'getPages') {
            setActiveView('getPages');
          } else if (result.sidepanelDataList.type === 'childPagesWarning') {
            setActiveView('childPagesWarning');
          } else if (result.sidepanelDataList.type === 'getCards') {
            setActiveView('getCards');
          } else if (result.sidepanelDataList.type === 'getDatasets') {
            setActiveView('getDatasets');
          } else if (result.sidepanelDataList.type === 'viewObjectDetails') {
            setActiveView('viewObjectDetails');
          }
        }
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);

  // Get context on mount
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
    const handleMessage = (message, sender, sendResponse) => {
      if (message.type === 'TAB_CONTEXT_UPDATED') {
        if (message.tabId === currentTabId) {
          const context = message.context
            ? DomoContext.fromJSON(message.context)
            : null;
          setCurrentContext(context);
        }
        sendResponse({ received: true });
        return true;
      } else if (message.type === 'SHOW_STATUS') {
        if (statusCallbackRef.current) {
          statusCallbackRef.current(
            message.title,
            message.description,
            message.status || 'accent',
            message.timeout !== undefined ? message.timeout : 3000
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
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentTabId]);

  // Listen for tab activation changes
  useEffect(() => {
    const handleTabActivated = async (activeInfo) => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          tabId: activeInfo.tabId
        });

        if (response.success && response.context) {
          const context = DomoContext.fromJSON(response.context);
          setCurrentContext(context);
          setCurrentTabId(activeInfo.tabId);
        } else {
          setCurrentContext(null);
          setCurrentTabId(activeInfo.tabId);
        }
      } catch (error) {
        console.error('[Sidepanel] Error fetching context:', error);
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
    chrome.storage.session.remove(['sidepanelDataList']);
  };

  return (
    <div className='flex h-screen w-full flex-col space-y-1 overscroll-contain p-1'>
      <ActionButtons
        currentContext={currentContext}
        isLoadingCurrentContext={isLoadingCurrentContext}
        collapsable={true}
        onStatusCallbackReady={(callback) => {
          statusCallbackRef.current = callback;
        }}
      />

      {activeView === 'loading' && (
        <Card className='h-full w-full'>
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

      {activeView === 'getCards' && (
        <GetCardsView
          onBackToDefault={handleBackToDefault}
          onStatusUpdate={statusCallbackRef.current}
        />
      )}

      {activeView === 'getDatasets' && (
        <GetDatasetsView
          onBackToDefault={handleBackToDefault}
          onStatusUpdate={statusCallbackRef.current}
        />
      )}

      {activeView === 'viewObjectDetails' && (
        <ObjectDetailsView
          onBackToDefault={handleBackToDefault}
          onStatusUpdate={statusCallbackRef.current}
        />
      )}
    </div>
  );
}
