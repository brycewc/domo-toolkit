import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks';
import { ActionButtons } from '@/components';
import './App.css';

export default function App() {
  // Apply theme
  useTheme();

  const [currentObject, setCurrentObject] = useState(null);
  const [currentInstance, setCurrentInstance] = useState(null);
  const [isDomoPage, setIsDomoPage] = useState(false);
  const [isLoadingCurrentObject, setIsLoadingCurrentObject] = useState(true);
  const [currentTabId, setCurrentTabId] = useState(null);

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
          const context = response.context;
          setCurrentObject(context.domoObject);
          setCurrentInstance(context.instance);
          setCurrentTabId(context.tabId);
          setIsDomoPage(true);
        } else {
          setCurrentObject(null);
          setIsDomoPage(false);
        }
      } catch (error) {
        console.error('[Popup] Error getting tab context:', error);
        setCurrentObject(null);
        setIsDomoPage(false);
      } finally {
        setIsLoadingCurrentObject(false);
      }
    });
  }, []);

  return (
    <ActionButtons
      currentObject={currentObject}
      currentInstance={currentInstance}
      isDomoPage={isDomoPage}
      isLoadingCurrentObject={isLoadingCurrentObject}
    />
  );
}
