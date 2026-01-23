import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks';
import {
  DataTableExample,
  DataListExample,
  GetPagesView,
  ActionButtons
} from '@/components';
import { DomoContext } from '@/models';

export default function App() {
  // Apply theme
  useTheme();

  const [activeView, setActiveView] = useState('default');
  const [lockedTabId, setLockedTabId] = useState(null); // Ephemeral lock for specific tab context
  const [currentObject, setCurrentObject] = useState(null);
  const [currentInstance, setCurrentInstance] = useState(null);
  const [currentTabId, setCurrentTabId] = useState(null);

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
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Check if there's already sidepanel data on mount
    chrome.storage.local.get(['sidepanelDataList'], (result) => {
      if (result.sidepanelDataList) {
        // Only use it if it's recent (within last 10 seconds)
        const age = Date.now() - (result.sidepanelDataList.timestamp || 0);
        if (age < 10000 && result.sidepanelDataList.type === 'getPages') {
          setActiveView('getPages');
          if (result.sidepanelDataList.tabId) {
            setLockedTabId(result.sidepanelDataList.tabId);
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
    async function fetchContext() {
      try {
        const window = lockedTabId ? null : await chrome.windows.getCurrent();

        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          ...(lockedTabId ? { tabId: lockedTabId } : { windowId: window.id })
        });

        if (response.success && response.context) {
          // Reconstruct DomoContext from plain object to get class instance with methods
          const context = DomoContext.fromJSON(response.context);
          console.log('[Sidepanel] Reconstructed context:', context);
          setCurrentObject(context.domoObject);
          setCurrentInstance(context.instance);
          if (!lockedTabId) {
            setCurrentTabId(response.tabId);
          } else {
            setCurrentTabId(lockedTabId);
          }
        }
      } catch (error) {
        console.error('[Sidepanel] Error fetching context:', error);
      }
    }

    fetchContext();
  }, [lockedTabId]);

  // Listen for context updates while sidepanel is open
  useEffect(() => {
    const handleMessage = (message, sender, sendResponse) => {
      if (message.type === 'TAB_CONTEXT_UPDATED') {
        // Update if this is for the tab we're currently tracking
        const targetTabId = lockedTabId || currentTabId;
        if (message.tabId === targetTabId) {
          console.log('[Sidepanel] Received context update:', message.context);
          const context = DomoContext.fromJSON(message.context);
          setCurrentObject(context.domoObject);
          setCurrentInstance(context.instance);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [lockedTabId, currentTabId]);

  // Render the appropriate view
  if (activeView === 'getPages') {
    return (
      <div className='flex min-h-screen w-full flex-col items-center gap-2 p-2'>
        <GetPagesView lockedTabId={lockedTabId} />
      </div>
    );
  }

  return (
    <div className='flex min-h-screen w-full flex-col items-center gap-2 p-2'>
      <ActionButtons
        currentObject={currentObject}
        currentInstance={currentInstance}
        showStatus={(title, description, status, timeout) => {
          // TODO: Implement status bar for sidepanel
          console.log(`[Sidepanel] ${title}: ${description}`);
        }}
      />
    </div>
  );
}
