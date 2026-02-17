import { useEffect, useState } from 'react';
import { Card, Spinner } from '@heroui/react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ActionButtons,
  ContextFooter,
  GetCardsView,
  GetDatasetsView,
  GetPagesView,
  LinkPreview,
  ObjectDetailsView,
  StatusBar
} from '@/components';
import { useStatusBar, useTheme } from '@/hooks';
import { DomoContext } from '@/models';

export default function App() {
  // Apply theme
  useTheme();

  const [activeView, setActiveView] = useState('default');
  const [loadingMessage, setLoadingMessage] = useState('Loading...');
  const [currentContext, setCurrentContext] = useState(null);
  const [currentTabId, setCurrentTabId] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const { statusBar, showStatus, hideStatus } = useStatusBar();

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
        } else if (data?.type === 'getOtherPages') {
          setActiveView('getOtherPages');
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
          } else if (result.sidepanelDataList.type === 'getOtherPages') {
            setActiveView('getOtherPages');
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
        showStatus(
          message.title,
          message.description,
          message.status || 'accent',
          message.timeout !== undefined ? message.timeout : 3000
        );
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
  }, [currentTabId, showStatus]);

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
    <>
      <div className='flex h-full max-h-screen min-h-0 w-full flex-col items-start justify-start space-y-1 overscroll-contain p-1'>
        <ActionButtons
          currentContext={currentContext}
          isLoadingCurrentContext={isLoadingCurrentContext}
          collapsable={true}
          onStatusUpdate={showStatus}
        />

        <div
          className={`relative flex max-h-fit min-h-0 w-full flex-1 flex-col`}
        >
          <ContextFooter
            currentContext={currentContext}
            isLoading={isLoadingCurrentContext}
            onStatusUpdate={showStatus}
          />
          <AnimatePresence>
            {statusBar.visible && (
              <motion.div
                key={statusBar.key}
                className='absolute inset-0 z-10'
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.15 }}
              >
                <StatusBar
                  title={statusBar.title}
                  description={statusBar.description}
                  status={statusBar.status}
                  timeout={statusBar.timeout}
                  onClose={hideStatus}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {activeView === 'loading' && (
          <Card className='h-full w-full'>
            <Card.Content className='flex flex-col items-center justify-center gap-2 py-8'>
              <Spinner size='lg' />
              <p className='text-sm text-muted'>{loadingMessage}</p>
            </Card.Content>
          </Card>
        )}

        {activeView !== 'default' && activeView !== 'loading' && (
          <div className='flex min-h-0 w-full flex-1 flex-col'>
            {(activeView === 'getPages' ||
              activeView === 'getOtherPages' ||
              activeView === 'childPagesWarning') && (
              <GetPagesView
                onBackToDefault={handleBackToDefault}
                onStatusUpdate={showStatus}
              />
            )}

            {activeView === 'getCards' && (
              <GetCardsView
                onBackToDefault={handleBackToDefault}
                onStatusUpdate={showStatus}
              />
            )}

            {activeView === 'getDatasets' && (
              <GetDatasetsView
                onBackToDefault={handleBackToDefault}
                onStatusUpdate={showStatus}
              />
            )}

            {activeView === 'viewObjectDetails' && (
              <ObjectDetailsView
                onBackToDefault={handleBackToDefault}
                onStatusUpdate={showStatus}
              />
            )}
          </div>
        )}
      </div>
      <LinkPreview />
    </>
  );
}
