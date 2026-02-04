import { useEffect, useState } from 'react';
import { ActionButtons } from '@/components';
import { useTheme } from '@/hooks';
import { DomoContext } from '@/models';

export default function App() {
  // Apply theme
  useTheme();

  const [currentContext, setCurrentContext] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const [currentTabId, setCurrentTabId] = useState(null);

  // Get context from service worker
  useEffect(() => {
    // Get current window and request context from service worker
    chrome.windows.getCurrent(async (window) => {
      try {
        // Request context for active tab in this window
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          windowId: window.id
        });
        if (response.success && response.context) {
          // Reconstruct DomoContext from plain object to get class instance with methods
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

  // Listen for context updates while popup is open
  useEffect(() => {
    const handleMessage = (message, sender, sendResponse) => {
      if (message.type === 'TAB_CONTEXT_UPDATED') {
        // Only update if this is for the tab we're currently showing
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

  return (
    <div className='h-fit min-w-xs p-1'>
      <ActionButtons
        currentContext={currentContext}
        isLoadingCurrentContext={isLoadingCurrentContext}
      />
    </div>
  );
}
