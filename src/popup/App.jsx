import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks';
import { ActionButtons } from '@/components';
import './App.css';

export default function App() {
  // Apply theme
  useTheme();

  const [currentContext, setCurrentContext] = useState(null);
  const [isDomoPage, setIsDomoPage] = useState(false);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);

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
          // Response contains DomoContext
          setCurrentContext(response.context);
          setIsDomoPage(true);
        } else {
          setCurrentContext(null);
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

  return (
    <ActionButtons
      currentContext={currentContext}
      isDomoPage={isDomoPage}
      isLoadingCurrentContext={isLoadingCurrentContext}
    />
  );
}
