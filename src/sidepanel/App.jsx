import { Card, Spinner } from '@heroui/react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ActionButtons } from '@/components/ActionButtons';
import { ContextFooter } from '@/components/ContextFooter';
import { ToastProvider } from '@/components/ToastProvider';
import { ApiErrorsView } from '@/components/views/ApiErrorsView';
import { CopyColorRulesView } from '@/components/views/CopyColorRulesView';
import { DeleteObjectView } from '@/components/views/DeleteObjectView';
import { DuplicateView } from '@/components/views/DuplicateView';
import { GeneratePackageDefinitionFromJSDocView } from '@/components/views/GeneratePackageDefinitionFromJSDocView';
import { GenerateSchemaView } from '@/components/views/GenerateSchemaView';
import { GetBeastModesView } from '@/components/views/GetBeastModesView';
import { GetCardsView } from '@/components/views/GetCardsView';
import { GetDatasetsView } from '@/components/views/GetDatasetsView';
import { GetPagesView } from '@/components/views/GetPagesView';
import { GetViewInputsView } from '@/components/views/GetViewInputsView';
import { LinkPreview } from '@/components/views/LinkPreview';
import { ManageTagsView } from '@/components/views/ManageTagsView';
import { MigrateDownstreamContentView } from '@/components/views/MigrateDownstreamContentView';
import { ObjectDetailsView } from '@/components/views/ObjectDetailsView';
import { OwnershipView } from '@/components/views/OwnershipView';
import { SwitchAccountView } from '@/components/views/SwitchAccountView';
import { UpdateCodeEngineVersionsView } from '@/components/views/UpdateCodeEngineVersionsView';
import { UpdateDetailsView } from '@/components/views/UpdateDetailsView';
import { useReleaseNotification } from '@/hooks/useReleaseNotification';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useTheme } from '@/hooks/useTheme';
import { DomoContext } from '@/models/DomoContext';
import { resolvePrimaryCopy } from '@/models/DomoObjectType';
import { sidepanelStorageKey, sidepanelStorageKeyPrefix } from '@/utils/sidepanel';

export default function App() {
  useTheme();
  useReleaseNotification();

  // One view slot per Domo instance: { [instance]: { loadingMessage?, type, viewKey? } }.
  // Slots for inactive instances stay mounted (hidden) so in-flight operations,
  // results, scroll, and selections survive switching instances.
  const [instanceViews, setInstanceViews] = useState({});
  // Sticky: only a Domo page can change it, so non-Domo tabs keep the current view.
  const [activeInstance, setActiveInstance] = useState(null);
  const [currentContext, setCurrentContext] = useState(null);
  const [currentTabId, setCurrentTabId] = useState(null);
  const [isLoadingCurrentContext, setIsLoadingCurrentContext] = useState(true);
  const windowIdRef = useRef(null);
  // Mirror current context into a ref so the (rarely re-registered) message
  // listener can read the latest value without re-subscribing on every change.
  const currentContextRef = useRef(currentContext);
  const { showStatus } = useStatusBar();

  useEffect(() => {
    currentContextRef.current = currentContext;
  }, [currentContext]);

  // Route a context (or null) from any entry point: update context/tab state and
  // activate the context's instance. Gated on isDomoPage, not just instance, so
  // excluded hostnames (e.g. www.domo.com yields instance 'www') don't steal the
  // panel; null/non-Domo contexts leave the active instance, and its view, alone.
  const applyContext = useCallback((context, tabId) => {
    setCurrentContext(context);
    if (tabId !== undefined) setCurrentTabId(tabId);
    if (context?.isDomoPage && context.instance) {
      setActiveInstance(context.instance);
    }
  }, []);

  // Apply a stored sidepanel record (or its removal) to an instance's view slot.
  // A non-null write also activates its instance: a launch implies focus, and some
  // launches target an instance other than the active tab's (e.g. navigating to a
  // copied object from a non-Domo tab).
  const applyViewData = useCallback((instance, data) => {
    setInstanceViews((prev) => {
      if (!data) {
        return prev[instance] ? { ...prev, [instance]: { type: 'default' } } : prev;
      }
      if (data.type === 'loading') {
        return { ...prev, [instance]: { loadingMessage: data.message || 'Loading...', type: 'loading' } };
      }
      return { ...prev, [instance]: { type: data.type, viewKey: data.timestamp || Date.now() } };
    });
    if (data) setActiveInstance(instance);
  }, []);

  // Listen for storage changes for sidepanel data (scoped to this window)
  useEffect(() => {
    const handleStorageChange = (changes, areaName) => {
      if (areaName !== 'session' || !windowIdRef.current) return;
      const prefix = sidepanelStorageKeyPrefix(windowIdRef.current);
      for (const [key, change] of Object.entries(changes)) {
        if (key.startsWith(prefix)) {
          applyViewData(key.slice(prefix.length), change.newValue);
        }
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);

    // Check if there's already sidepanel data on mount.
    // Uses a generous threshold because the popup writes data before opening the
    // sidepanel, and the cold-start can take several seconds (missing the
    // storage.onChanged event that fires before the listener is registered).
    const checkExistingData = () => {
      if (!windowIdRef.current) return;
      const prefix = sidepanelStorageKeyPrefix(windowIdRef.current);
      chrome.storage.session.get(null, (result) => {
        const staleKeys = [];
        for (const [key, record] of Object.entries(result)) {
          if (!key.startsWith(prefix)) continue;
          const age = Date.now() - (record?.timestamp || 0);
          if (age < 10000) {
            applyViewData(key.slice(prefix.length), record);
          } else {
            // Stale records only exist when this window's panel was closed
            // mid-session; nothing reads them again, so reclaim the quota.
            staleKeys.push(key);
          }
        }
        if (staleKeys.length > 0) {
          chrome.storage.session.remove(staleKeys);
        }
      });
    };

    // windowIdRef is set in the mount effect, retry briefly if not yet available
    if (windowIdRef.current) {
      checkExistingData();
    } else {
      const timer = setTimeout(checkExistingData, 100);
      return () => {
        clearTimeout(timer);
        chrome.storage.onChanged.removeListener(handleStorageChange);
      };
    }

    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, [applyViewData]);

  // Get context on mount
  useEffect(() => {
    // Get current window and request context from service worker
    chrome.windows.getCurrent(async (window) => {
      windowIdRef.current = window.id;
      try {
        // Request context for active tab in this window
        const response = await chrome.runtime.sendMessage({
          type: 'GET_TAB_CONTEXT',
          windowId: window.id
        });

        if (response.success) {
          // Reconstruct DomoContext from plain object to get class instance with
          // methods; always pass the tab ID so we receive updates for this tab
          const context = response.context ? DomoContext.fromJSON(response.context) : null;
          applyContext(context, response.tabId);
        } else {
          applyContext(null, null);
        }
      } catch (error) {
        console.error('[Sidepanel] Error getting tab context:', error);
        applyContext(null);
      } finally {
        setIsLoadingCurrentContext(false);
      }
    });
  }, [applyContext]);

  // Listen for context updates while sidepanel is open
  useEffect(() => {
    const handleMessage = (message, sender, sendResponse) => {
      if (message.type === 'TAB_CONTEXT_UPDATED') {
        if (message.tabId === currentTabId) {
          const context = message.context ? DomoContext.fromJSON(message.context) : null;
          applyContext(context);
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

      // Don't respond to other message types - let them pass through to background
      return false;
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [applyContext, currentTabId, showStatus]);

  // Listen for tab activation changes (scoped to this window only)
  useEffect(() => {
    const fetchContextForTab = async (tabId) => {
      try {
        const response = await chrome.runtime.sendMessage({
          tabId,
          type: 'GET_TAB_CONTEXT'
        });

        if (response.success && response.context) {
          applyContext(DomoContext.fromJSON(response.context), tabId);
        } else {
          applyContext(null, tabId);
        }
      } catch (error) {
        console.error('[Sidepanel] Error fetching context:', error);
        applyContext(null);
      }
    };

    const handleTabActivated = (activeInfo) => {
      // Only respond to tab changes within this sidepanel's window
      if (activeInfo.windowId !== windowIdRef.current) return;
      fetchContextForTab(activeInfo.tabId);
    };

    const handleWindowFocused = async (windowId) => {
      // Ignore when all windows lose focus (e.g., switching to another app)
      if (windowId === chrome.windows.WINDOW_ID_NONE) return;
      // Only respond when this sidepanel's window gains focus
      if (windowId !== windowIdRef.current) return;

      const [tab] = await chrome.tabs.query({ active: true, windowId });
      if (tab) fetchContextForTab(tab.id);
    };

    chrome.tabs.onActivated.addListener(handleTabActivated);
    chrome.windows.onFocusChanged.addListener(handleWindowFocused);

    return () => {
      chrome.tabs.onActivated.removeListener(handleTabActivated);
      chrome.windows.onFocusChanged.removeListener(handleWindowFocused);
    };
  }, [applyContext]);

  const handleBackToDefault = (instance) => {
    applyViewData(instance, null);
    // Clear this window's record for the instance
    chrome.storage.session.remove([sidepanelStorageKey(windowIdRef.current, instance)]);
  };

  const renderInstanceView = (instance, slot) => {
    const isActive = instance === activeInstance;
    const backToDefault = () => handleBackToDefault(instance);

    return (
      <>
        {(slot.type === 'getChildPages' || slot.type === 'getCardPages' || slot.type === 'childPagesWarning') && (
          <GetPagesView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'getBeastModes' && (
          <GetBeastModesView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'getCards' && (
          <GetCardsView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'getDatasets' && (
          <GetDatasetsView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'getViewInputs' && (
          <GetViewInputsView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'viewObjectDetails' && (
          <ObjectDetailsView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'apiErrors' && (
          <ApiErrorsView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'duplicate' && (
          <DuplicateView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'updateCodeEngineVersions' && (
          <UpdateCodeEngineVersionsView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'generatePackageDefinitionFromJSDoc' && (
          <GeneratePackageDefinitionFromJSDocView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'generateSchema' && (
          <GenerateSchemaView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'updateDetails' && (
          <UpdateDetailsView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'copyColorRules' && (
          <CopyColorRulesView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'manageTags' && (
          <ManageTagsView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'deleteObject' && (
          <DeleteObjectView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'ownership' && (
          <OwnershipView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'migrateDownstreamContent' && (
          <MigrateDownstreamContentView
            currentContext={currentContext}
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}

        {slot.type === 'switchAccount' && (
          <SwitchAccountView
            instance={instance}
            isActive={isActive}
            key={slot.viewKey}
            liveContext={currentContext}
            onBackToDefault={backToDefault}
            onStatusUpdate={showStatus}
          />
        )}
      </>
    );
  };

  const activeType = (activeInstance && instanceViews[activeInstance]?.type) || 'default';
  const mountedEntries = Object.entries(instanceViews).filter(([, slot]) => slot.type !== 'default');

  return (
    <>
      <div className='flex h-full max-h-screen min-h-0 w-full flex-col items-start justify-start space-y-1 overflow-hidden overscroll-contain p-1'>
        <ActionButtons
          collapsable={true}
          currentContext={currentContext}
          defaultExpanded={activeType === 'default'}
          isLoading={isLoadingCurrentContext}
          onStatusUpdate={showStatus}
        />

        <ContextFooter currentContext={currentContext} isLoading={isLoadingCurrentContext} onStatusUpdate={showStatus} />

        {/* Every visited instance's view stays mounted, stacked, with inactive ones
            visibility-hidden. display:none would zero the scroll element, collapsing
            virtualized list measurements and scroll position; visibility keeps full
            layout so switching instances is a pure visibility toggle and in-flight
            operations, results, scroll, and selections survive. */}
        {mountedEntries.length > 0 && (
          <div className='relative min-h-0 w-full flex-1'>
            {mountedEntries.map(([instance, slot]) => (
              <div
                className={`absolute inset-0 flex min-h-0 flex-col${instance === activeInstance ? '' : ' invisible'}`}
                key={instance}
              >
                {slot.type === 'loading' ? (
                  <Card className='h-full w-full'>
                    <Card.Content className='flex flex-col items-center justify-center gap-2 py-8'>
                      <Spinner size='lg' />
                      <p className='text-sm text-muted'>{slot.loadingMessage}</p>
                    </Card.Content>
                  </Card>
                ) : (
                  renderInstanceView(instance, slot)
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <LinkPreview />
      <ToastProvider />
    </>
  );
}
