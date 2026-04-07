import {
  Button,
  ButtonGroup,
  Card,
  Disclosure,
  DisclosureGroup,
  Tooltip
} from '@heroui/react';
import { IconClipboard, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import JsonView from 'react18-json-view';

import { AnimatedCheck } from '../AnimatedCheck';
import '@/assets/json-view-theme.css';
import { DomoContext } from '@/models';

export function CardErrorsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
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
      if (message.type === 'CARD_ERRORS_UPDATED' && message.tabId === tabId) {
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
    const result = await chrome.storage.session.get(['sidepanelDataList']);
    const data = result.sidepanelDataList;

    if (!data || data.type !== 'cardErrors') {
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
        type: 'GET_CARD_ERRORS'
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
      type: 'CLEAR_CARD_ERRORS'
    });
    onStatusUpdate?.('Cleared', 'All card errors cleared.', 'success', 2000);
    onBackToDefault?.();
  };

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header>
        <Card.Title className='flex items-start justify-between gap-2'>
          <div className='flex flex-col gap-0.5'>
            <span className='text-sm font-semibold'>Card Errors</span>
            <span className='text-xs text-muted'>
              {errors.length} error{errors.length === 1 ? '' : 's'}
            </span>
          </div>
          <ButtonGroup>
            <Tooltip closeDelay={0} delay={400}>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                onPress={handleClearAll}
              >
                <IconTrash size={16} stroke={1.5} />
              </Button>
              <Tooltip.Content>Clear all errors</Tooltip.Content>
            </Tooltip>
            <Tooltip closeDelay={0} delay={400}>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                onPress={() => onBackToDefault?.()}
              >
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

            return (
              <Disclosure key={error.id}>
                <Disclosure.Heading>
                  <Disclosure.Trigger className='border-danger-200 bg-danger-50 dark:border-danger-200/20 dark:bg-danger-50/10 flex w-full flex-col items-start gap-0.5 rounded-md border px-2.5 py-1.5 text-left text-xs'>
                    <div className='flex w-full items-center justify-between'>
                      <span className='font-semibold text-danger'>
                        {error.status} {error.statusText}
                      </span>
                      <span className='text-[10px] text-muted'>
                        {error.timestamp}
                      </span>
                    </div>
                    <span className='w-full truncate text-muted'>
                      {error.method} {error.url}
                    </span>
                  </Disclosure.Trigger>
                </Disclosure.Heading>
                <Disclosure.Content>
                  <div className='border-default-200 bg-default-50 dark:border-default-200/20 mt-0.5 rounded-md border p-2'>
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
                    ) : (
                      <pre className='max-h-48 overflow-y-auto text-[11px] break-all whitespace-pre-wrap'>
                        {error.response}
                      </pre>
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
