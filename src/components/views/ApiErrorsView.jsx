import { Card, Disclosure, DisclosureGroup, Separator } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';
import JsonView from 'react18-json-view';

import { DomoContext } from '@/models/DomoContext';
import { getSidepanelData } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconTrash from '@icons/trash.svg?react';
import '@/assets/json-view-theme.css';

import { AnimatedCheck } from '../AnimatedCheck';
import { ViewHeader } from './ViewHeader';

export function ApiErrorsView({ instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [errors, setErrors] = useState([]);
  const [tabId, setTabId] = useState(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    loadErrors();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Listen for live error updates
  useEffect(() => {
    if (!tabId) return;

    const handleMessage = (message) => {
      if (message.type === 'API_ERRORS_UPDATED' && message.tabId === tabId) {
        if (!mountedRef.current) return;
        if (message.errors?.length === 0) {
          onBackToDefault?.();
        } else {
          setErrors(message.errors);
        }
      }
    };

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [tabId, onBackToDefault]);

  const loadErrors = async () => {
    const data = await getSidepanelData(instance);

    if (!data || data.type !== 'apiErrors') {
      onBackToDefault?.();
      return;
    }

    const context = DomoContext.fromJSON(data.currentContext);
    setTabId(context.tabId);

    if (data.errors?.length) {
      setErrors(data.errors);
    } else {
      // Popup handoff: fetch from background
      const response = await chrome.runtime.sendMessage({
        tabId: context.tabId,
        type: 'GET_API_ERRORS'
      });
      if (response?.errors?.length) {
        setErrors(response.errors);
      } else {
        onBackToDefault?.();
      }
    }
  };

  const handleClearAll = async () => {
    if (!tabId) return;
    await chrome.runtime.sendMessage({
      tabId,
      type: 'CLEAR_API_ERRORS'
    });
    onStatusUpdate?.('Cleared', 'All errors cleared.', 'success', 2000);
    onBackToDefault?.();
  };

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        feature='API Errors'
        featureIcon={<IconExclamationTriangle />}
        subtext={`${errors.length} error${errors.length === 1 ? '' : 's'}`}
        onClose={onBackToDefault}
        actions={[
          {
            ariaLabel: 'Clear errors',
            icon: <IconTrash />,
            key: 'clear',
            onPress: handleClearAll,
            tooltip: 'Clear errors'
          }
        ]}
      />

      <Card.Content className='min-h-0 flex-1 overflow-y-auto'>
        <DisclosureGroup className='flex flex-col gap-1.5'>
          {errors.map((error) => {
            const parsed = parseResponse(error.response);
            const path = stripDomain(error.url);

            return (
              <Disclosure className='overflow-hidden rounded-lg border border-border' key={error.id}>
                <Disclosure.Heading>
                  <Disclosure.Trigger className='flex w-full items-center justify-between p-2 text-left text-xs'>
                    <div className='flex min-w-0 flex-1 flex-col gap-1'>
                      <div className='justify-left flex w-full items-center gap-2'>
                        <span className='shrink-0 font-semibold text-danger'>
                          {error.status} {error.statusText}
                        </span>
                        <Separator orientation='vertical' variant='secondary' />
                        <span className='shrink-0 text-muted'>{error.timestamp}</span>
                      </div>
                      <span
                        className='flex w-full min-w-0 flex-1 items-center gap-1 truncate'
                        title={`${error.method} ${path}`}
                      >
                        <span className='shrink-0 font-semibold'>{error.method}</span>
                        <span className='truncate'>{path}</span>
                      </span>
                    </div>
                    <Disclosure.Indicator>
                      <IconChevronDown />
                    </Disclosure.Indicator>
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <div className='px-4'>
                    <Separator variant='secondary' />
                  </div>
                  <div className='p-2'>
                    {parsed ? (
                      <JsonView
                        displaySize
                        className='text-sm'
                        collapsed={2}
                        collapseStringMode='word'
                        collapseStringsAfterLength={50}
                        matchesURL={false}
                        src={parsed}
                        CopiedComponent={({ className, style }) => (
                          <AnimatedCheck className={className + ' text-success'} size={16} stroke={1.5} style={style} />
                        )}
                        CopyComponent={({ className, onClick, style }) => (
                          <IconClipboardCopy className={className} size={16} style={style} onClick={onClick} />
                        )}
                      />
                    ) : error.response ? (
                      <pre className='text-sm break-normal whitespace-pre-wrap'>{error.response}</pre>
                    ) : (
                      <span className='text-sm text-muted italic'>No response body</span>
                    )}
                  </div>
                </Disclosure.Content>
              </Disclosure>
            );
          })}
        </DisclosureGroup>
      </Card.Content>
    </Card>
  );
}

function parseResponse(response) {
  if (!response) return null;
  try {
    return JSON.parse(response);
  } catch {
    return null;
  }
}

function stripDomain(url) {
  try {
    const { hash, pathname, search } = new URL(url);
    return `${pathname}${search}${hash}`;
  } catch {
    return url;
  }
}
