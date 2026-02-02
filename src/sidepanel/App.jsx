import { useEffect, useState, useRef } from 'react';
import { Card, Spinner } from '@heroui/react';
import { ActionButtons, GetPagesView, WelcomePage, shouldShowWelcomePage } from '@/components';
import { useTheme } from '@/hooks';
import { DomoContext } from '@/models';

export default function App() {
  useTheme();

  const [showWelcome, setShowWelcome] = useState(null);
  const [activeView, setActiveView] = useState('default');
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [currentContext, setCurrentContext] = useState(null);
  const [currentTabId, setCurrentTabId] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const statusCallbackRef = useRef(null);

  // Check if we should show welcome page
  useEffect(() => {
    shouldShowWelcomePage().then(setShowWelcome);
  }, []);

  // Listen for storage changes for sidepanel data
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.sidepanelDataList) {
        const data = changes.sidepanelDataList.newValue;
        if (!data) {
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

    chrome.storage.local.get(['sidepanelDataList'], (result) => {
      if (result.sidepanelDataList) {
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

  // Get context on mount
  useEffect(() => {
    chrome.windows.getCurrent(async (window) => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          windowId: window.id
        });

        if (response.success) {
          setCurrentTabId(response.tabId);
          if (response.context) {
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

  // Listen for context updates
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
        sendResponse({ received: true });
        return true;
      }
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
    chrome.storage.local.remove(['sidepanelDataList']);
  };

  // Still checking welcome status
  if (showWelcome === null) {
    return null;
  }

  // Show welcome page for new users
  if (showWelcome) {
    return (
      <div className="h-screen w-full overflow-y-auto">
        <WelcomePage onDismiss={() => setShowWelcome(false)} />
      </div>
    );
  }

  return (
    <div className="h-screen w-full overflow-y-auto overflow-x-hidden p-2">
      {activeView === 'default' && (
        <ActionButtons
          currentContext={currentContext}
          isLoadingCurrentContext={isLoadingCurrentContext}
          collapsable={true}
          onStatusCallbackReady={(callback) => {
            statusCallbackRef.current = callback;
          }}
        />
      )}

      {activeView === 'loading' && (
        <Card className="w-full">
          <Card.Content className="flex flex-col items-center justify-center gap-2 py-8">
            <Spinner size="lg" />
            <p className="text-sm text-muted">{loadingMessage}</p>
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
