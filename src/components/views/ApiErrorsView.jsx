import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  DisclosureGroup,
  Separator,
  Tooltip
} from '@heroui/react';
import { IconChevronDown, IconClipboard, IconEraser, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import JsonView from 'react18-json-view';

import { DomoContext } from '@/models';
import { getSidepanelData } from '@/utils';
import '@/assets/json-view-theme.css';

import { AnimatedCheck } from '../AnimatedCheck';

export function ApiErrorsView({ onBackToDefault = null, onStatusUpdate = null }) {
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
    const data = await getSidepanelData();

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
      <Card.Header>
        <Card.Title className='flex items-start justify-between gap-2'>
          <div className='flex flex-col gap-0.5'>
            <span className='text-sm font-semibold'>API Errors</span>
            <span className='text-xs text-muted'>
              {errors.length} error{errors.length === 1 ? '' : 's'}
            </span>
          </div>
          <ButtonGroup>
            <Tooltip closeDelay={0} delay={400}>
              <Button isIconOnly size='sm' variant='tertiary' onPress={handleClearAll}>
                <IconEraser stroke={1.5} />
              </Button>
              <Tooltip.Content>Clear errors</Tooltip.Content>
            </Tooltip>
            <Tooltip closeDelay={0} delay={400}>
              <Button isIconOnly size='sm' variant='tertiary' onPress={() => onBackToDefault?.()}>
                <IconX stroke={1.5} />
              </Button>
              <Tooltip.Content>Close</Tooltip.Content>
            </Tooltip>
          </ButtonGroup>
        </Card.Title>
      </Card.Header>

      <Card.Content className='min-h-0 flex-1 overflow-y-auto'>
        <DisclosureGroup className='flex flex-col gap-1.5'>
          {errors.map((error) => {
            const parsed = parseResponse(error.response);
            const path = stripDomain(error.url);

            return (
              <Disclosure
                className='border-divider overflow-hidden rounded-lg border bg-surface-secondary'
                key={error.id}
              >
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
                      <IconChevronDown stroke={1.5} />
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
                          <AnimatedCheck
                            className={className + ' text-success'}
                            size={16}
                            stroke={1.5}
                            style={style}
                          />
                        )}
                        CopyComponent={({ className, onClick, style }) => (
                          <IconClipboard
                            className={className}
                            size={16}
                            stroke={1.5}
                            style={style}
                            onClick={onClick}
                          />
                        )}
                      />
                    ) : error.response ? (
                      <pre className='whitespace-pre-wrap break-words text-sm'>
                        {error.response}
                      </pre>
                    ) : (
                      <span className='text-sm italic text-muted'>No response body</span>
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
