import { useEffect, useState } from 'react';
import { useTheme } from '@/hooks';
import { ActionButtons } from '@/components';
import { DomoContext } from '@/models';

export default function App() {
  // Apply theme
  useTheme();

  const [currentContext, setCurrentContext] = useState(null);
  const [isDomoPage, setIsDomoPage] = useState(true);
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
          // Reconstruct DomoContext from plain object to get class instance with methods
          const context = DomoContext.fromJSON(response.context);
          console.log('[Popup] Reconstructed context:', context);
          setCurrentContext(context);
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
    <div className='h-full min-h-36 w-full min-w-xs'>
      <ActionButtons
        currentContext={currentContext}
        isDomoPage={isDomoPage}
        isLoadingCurrentContext={isLoadingCurrentContext}
      />
    </div>
  );
}
