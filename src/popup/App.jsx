import { useEffect, useState } from 'react';
import { ActionButtons, WelcomePage, shouldShowWelcomePage } from '@/components';
import { useTheme } from '@/hooks';
import { DomoContext } from '@/models';

export default function App() {
  useTheme();

  const [showWelcome, setShowWelcome] = useState(null); // null = loading, true/false = known
  const [currentContext, setCurrentContext] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const [currentTabId, setCurrentTabId] = useState(null);

  // Check if we should show welcome page
  useEffect(() => {
    shouldShowWelcomePage().then(setShowWelcome);
  }, []);

  // Get context from service worker
  useEffect(() => {
    chrome.windows.getCurrent(async (window) => {
      try {
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          windowId: window.id
        });
        if (response.success && response.context) {
          const context = DomoContext.fromJSON(response.context);
          setCurrentContext(context);
          setCurrentTabId(response.tabId);
        } else {
          setCurrentContext(null);
          setCurrentTabId(response.tabId);
        }
      } catch (error) {
        console.error('[Popup] Error getting tab context:', error);
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
          const context = DomoContext.fromJSON(message.context);
          setCurrentContext(context);
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

  // Still checking welcome status
  if (showWelcome === null) {
    return null;
  }

  // Show welcome page for new users
  if (showWelcome) {
    return <WelcomePage onDismiss={() => setShowWelcome(false)} />;
  }

  // Show main interface
  return (
    <div className="p-2">
      <ActionButtons
        currentContext={currentContext}
        isLoadingCurrentContext={isLoadingCurrentContext}
      />
    </div>
  );
}
