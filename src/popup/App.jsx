import { useEffect, useRef, useState } from 'react';

import { ActionButtons } from '@/components/ActionButtons';
import { ContextFooter } from '@/components/ContextFooter';
import { ToastProvider } from '@/components/ToastProvider';
import { useReleaseNotification } from '@/hooks/useReleaseNotification';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useTheme } from '@/hooks/useTheme';
import { DomoContext } from '@/models/DomoContext';
import { resolvePrimaryCopy } from '@/models/DomoObjectType';

export default function App() {
  useTheme();
  useReleaseNotification();

  const [currentContext, setCurrentContext] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const [currentTabId, setCurrentTabId] = useState(null);
  // Mirror current context into a ref so the message listener can read the
  // latest value without re-subscribing on every change.
  const currentContextRef = useRef(currentContext);
  const { showStatus } = useStatusBar();

  useEffect(() => {
    currentContextRef.current = currentContext;
  }, [currentContext]);

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
      } else if (message.type === 'COPY_ID_SHORTCUT') {
        // Only the focused surface copies: navigator.clipboard needs focus.
        // Staying silent when unfocused lets the focused surface (or the
        // background's in-page fallback) handle the shortcut instead.
        if (!document.hasFocus()) return false;
        (async () => {
          const copy = resolvePrimaryCopy(currentContextRef.current?.domoObject);
          if (!copy) {
            sendResponse({ copied: false });
            return;
          }
          try {
            await navigator.clipboard.writeText(copy.value);
            showStatus('Success', `Copied ${copy.label} **${copy.value}** to clipboard`, 'success', 2000);
            sendResponse({ copied: true });
          } catch {
            sendResponse({ copied: false });
          }
        })();
        return true;
      }
      return false;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [currentTabId, showStatus]);

  return (
    <div className='flex h-full max-h-[600px] max-w-[800px] min-w-100 flex-col items-start justify-start space-y-1 overflow-hidden overscroll-contain p-1'>
      <ActionButtons
        collapsable={false}
        currentContext={currentContext}
        isLoading={isLoadingCurrentContext}
        onStatusUpdate={showStatus}
      />
      <ContextFooter currentContext={currentContext} isLoading={isLoadingCurrentContext} onStatusUpdate={showStatus} />
      <ToastProvider className='right-2 bottom-2' placement='bottom' />
    </div>
  );
}
