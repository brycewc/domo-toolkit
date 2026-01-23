import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks';
import { ActionButtons } from '@/components';
import { DomoContext } from '@/models';
import { Button, ButtonGroup } from '@heroui/react';

export default function App() {
  // Apply theme
  useTheme();

  const [currentContext, setCurrentContext] = useState(null);
  const [isDomoPage, setIsDomoPage] = useState(true);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const [currentTabId, setCurrentTabId] = useState(null);

  // Request initial context on mount
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
          console.log('[Popup] Reconstructed context:', context);
          setCurrentContext(context);
          setCurrentTabId(response.tabId);
          setIsDomoPage(true);
        } else {
          setCurrentContext(null);
          setCurrentTabId(response.tabId);
          setIsDomoPage(false);
        }
      } catch (error) {
        console.error('[Popup] Error getting tab context:', error);
        setCurrentContext(null);
        setIsDomoPage(false);
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
          console.log('[Popup] Received context update:', message.context);
          const context = DomoContext.fromJSON(message.context);
          setCurrentContext(context);
          setIsDomoPage(true);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentTabId]);

  return (
    <div className='h-full min-h-36 w-full min-w-xs'>
      <ActionButtons
        currentContext={currentContext}
        isDomoPage={isDomoPage}
        isLoadingCurrentContext={isLoadingCurrentContext}
      />
    </div>
  );
}
