import {
  Button,
  Chip,
  Dropdown,
  Header,
  Label,
  Separator,
  Spinner,
  Tooltip
} from '@heroui/react';
import {
  IconAlertTriangle,
  IconClipboard,
  IconExternalLink,
  IconEye,
  IconLayoutSidebarRightExpand
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useLongPress } from '@/hooks';
import {
  DomoObject,
  getAllNavigableObjectTypes,
  getAllObjectTypesWithApiConfig
} from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import {
  executeInPage,
  isSidepanel,
  openSidepanel,
  storeSidepanelData
} from '@/utils';

const TYPE_PRIORITY = [
  'CARD',
  'DATA_SOURCE',
  'DATAFLOW_TYPE',
  'DATA_APP',
  'DATA_APP_VIEW',
  'PAGE',
  'USER',
  'GROUP',
  'ALERT',
  'BEAST_MODE_FORMULA',
  'WORKFLOW_MODEL'
];

export function NavigateToCopiedObject({ currentContext, onStatusUpdate }) {
  const [copiedId, setCopiedId] = useState(null);
  const [resolvedObject, setResolvedObject] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [defaultDomoInstance, setDefaultDomoInstance] = useState('');
  const abortRef = useRef(0);

  const allTypes = useMemo(() => {
    const seen = new Set();
    return getAllNavigableObjectTypes()
      .filter((type) => (type.hasUrl() ? !type.requiresParentForUrl() : true))
      .sort((a, b) => a.name.localeCompare(b.name))
      .filter((type) => {
        const key = type.urlPath || type.api?.endpoint;
        if (!key || !seen.has(key)) {
          if (key) seen.add(key);
          return true;
        }
        return false;
      });
  }, []);

  const filteredTypes = useMemo(
    () =>
      copiedId
        ? allTypes.filter((type) => type.isValidObjectId(copiedId))
        : allTypes,
    [allTypes, copiedId]
  );

  useEffect(() => {
    chrome.storage.sync.get(['defaultDomoInstance'], (result) => {
      setDefaultDomoInstance(result.defaultDomoInstance || '');
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'sync' && changes.defaultDomoInstance) {
        setDefaultDomoInstance(changes.defaultDomoInstance.newValue || '');
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  const getInstance = useCallback(() => {
    if (currentContext?.isDomoPage && currentContext?.instance) {
      return currentContext.instance;
    }
    return defaultDomoInstance || null;
  }, [
    currentContext?.isDomoPage,
    currentContext?.instance,
    defaultDomoInstance
  ]);

  const readAndResolve = useCallback(async () => {
    const instance = getInstance();
    if (!instance) return;

    setIsLoading(true);
    setResolvedObject(null);
    setError(null);
    setCopiedId(null);

    const runId = ++abortRef.current;

    let text;
    try {
      text = (await navigator.clipboard.readText()).trim();
    } catch {
      setError('Could not read clipboard');
      setIsLoading(false);
      return;
    }

    if (!isValidDomoId(text)) {
      setCopiedId(null);
      setError('Clipboard does not contain a valid Domo object ID');
      setIsLoading(false);
      return;
    }

    setCopiedId(text);

    const baseUrl = `https://${instance}.domo.com`;
    const typesToTry = getAllObjectTypesWithApiConfig()
      .filter((type) => type.isValidObjectId(text))
      .sort((a, b) => {
        const aIdx = TYPE_PRIORITY.indexOf(a.id);
        const bIdx = TYPE_PRIORITY.indexOf(b.id);
        if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
        if (aIdx !== -1) return -1;
        if (bIdx !== -1) return 1;
        return 0;
      });

    for (const typeConfig of typesToTry) {
      if (abortRef.current !== runId) return;

      try {
        const params = {
          apiConfig: typeConfig.api,
          baseUrl,
          objectId: text,
          parentId: null,
          requiresParent: typeConfig.requiresParentForApi(),
          throwOnError: false,
          typeId: typeConfig.id
        };

        if (typeConfig.requiresParentForApi()) {
          try {
            const obj = new DomoObject(typeConfig.id, text, baseUrl);
            params.parentId = await obj.getParent(
              false,
              null,
              currentContext?.tabId
            );
          } catch {
            continue;
          }
        }

        const metadata = await executeInPage(
          fetchObjectDetailsInPage,
          [params],
          currentContext?.tabId
        );

        if (abortRef.current !== runId) return;

        if (metadata?.details) {
          if (
            typeConfig.id === 'DATAFLOW_TYPE' &&
            metadata.details.deleted === true
          ) {
            continue;
          }

          const domoObject = new DomoObject(typeConfig.id, text, baseUrl, {
            details: metadata.details,
            name: metadata.name
          });

          setResolvedObject(domoObject);
          setError(null);
          setIsLoading(false);
          return;
        }
      } catch {
        continue;
      }
    }

    if (abortRef.current === runId) {
      setError('Could not determine object type');
      setIsLoading(false);
    }
  }, [currentContext?.tabId, getInstance]);

  const handleOpenChange = useCallback(
    (open) => {
      setIsOpen(open);
      if (open) {
        readAndResolve();
      }
    },
    [readAndResolve]
  );

  const handleNavigate = useCallback(
    async (domoObject) => {
      try {
        if (!domoObject.hasUrl()) {
          await storeSidepanelData({
            message: 'Loading object details...',
            timestamp: Date.now(),
            type: 'loading'
          });
          if (!isSidepanel()) {
            openSidepanel();
          }
          await storeSidepanelData({
            currentContext,
            domoObject: domoObject.toJSON(),
            type: 'viewObjectDetails'
          });
          return;
        }

        domoObject.navigateTo(currentContext?.tabId).catch((err) => {
          onStatusUpdate?.(
            'Navigation Failed',
            err.message || 'Error navigating to object',
            'danger',
            4000
          );
        });
      } catch (err) {
        onStatusUpdate?.(
          'Error',
          err.message || 'An error occurred',
          'danger',
          4000
        );
      }
    },
    [currentContext, onStatusUpdate]
  );

  const handleAction = useCallback(
    (key) => {
      setIsOpen(false);

      if (key === '_resolved' && resolvedObject) {
        handleNavigate(resolvedObject);
        return;
      }

      // Manual type selection
      if (!copiedId) return;

      const instance = getInstance();
      if (!instance) return;

      const baseUrl = `https://${instance}.domo.com`;
      const domoObject = new DomoObject(key, copiedId, baseUrl);
      handleNavigate(domoObject);
    },
    [copiedId, getInstance, handleNavigate, resolvedObject]
  );

  const needsDefaultInstance =
    !currentContext?.isDomoPage && !defaultDomoInstance;

  if (needsDefaultInstance) {
    return (
      <Tooltip className='h-fit' closeDelay={0} delay={200}>
        <Button
          fullWidth
          isIconOnly
          className='cursor-not-allowed opacity-50'
          variant='tertiary'
          onPress={() => {}}
        >
          <IconExternalLink stroke={1.5} />
        </Button>
        <Tooltip.Content placement='top'>
          Set a default Domo instance in settings
        </Tooltip.Content>
      </Tooltip>
    );
  }

  return (
    <Dropdown isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip closeDelay={0} delay={400}>
        <Button fullWidth isIconOnly variant='tertiary'>
          <IconExternalLink stroke={1.5} />
        </Button>
        <Tooltip.Content placement='top'>
          Navigate to copied object
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover
        className='flex max-h-80 w-80 min-w-80 flex-col overflow-hidden'
        placement='bottom'
      >
        {copiedId && (
          <div className='text-s pointer-events-none flex shrink-0 items-center gap-1 px-4 pt-2 font-mono text-muted select-none'>
            <IconClipboard size={12} stroke={1.5} />
            <p title='Current clipboard value'>{copiedId}</p>
          </div>
        )}
        <Dropdown.Menu
          className='min-h-0 flex-1 overflow-auto overscroll-contain'
          onAction={handleAction}
        >
          <Dropdown.Section>
            <Header>Auto-detected</Header>
            <Dropdown.Item
              className={isLoading ? '' : 'hidden'}
              id='_loading'
              textValue='Loading'
            >
              <Spinner color='currentColor' size='sm' />
              <Label>Resolving...</Label>
            </Dropdown.Item>
            <Dropdown.Item
              className={error && !isLoading ? 'pointer-events-none' : 'hidden'}
              id='_error'
              textValue={error || 'Error'}
            >
              <IconAlertTriangle className='size-5 shrink-0' stroke={1.5} />
              <Label className='text-muted'>{error}</Label>
            </Dropdown.Item>
            <Dropdown.Item
              id='_resolved'
              textValue='Navigate'
              className={
                resolvedObject && !isLoading ? 'items-start' : 'hidden'
              }
            >
              {resolvedObject?.hasUrl() ? (
                <IconExternalLink className='size-5 shrink-0' stroke={1.5} />
              ) : (
                <IconEye className='size-5 shrink-0' stroke={1.5} />
              )}
              <div className='flex flex-col gap-1'>
                <Chip
                  className='w-fit lowercase'
                  color='accent'
                  size='sm'
                  variant='soft'
                >
                  {resolvedObject?.typeName}
                </Chip>
                <Label className='font-medium'>
                  {resolvedObject?.metadata?.name || copiedId}
                </Label>
              </div>
            </Dropdown.Item>
          </Dropdown.Section>

          {filteredTypes.length > 0 && (
            <>
              <Separator />
              <Dropdown.Section>
                <Header>Manual selection</Header>
                {filteredTypes.map((type) => (
                  <Dropdown.Item
                    id={type.id}
                    key={type.id}
                    textValue={type.name}
                  >
                    {type.hasUrl() ? (
                      <IconExternalLink
                        className='size-5 shrink-0'
                        stroke={1.5}
                      />
                    ) : (
                      <IconLayoutSidebarRightExpand
                        className='size-5 shrink-0'
                        stroke={1.5}
                      />
                    )}
                    <Label>{type.name}</Label>
                  </Dropdown.Item>
                ))}
              </Dropdown.Section>
            </>
          )}
        </Dropdown.Menu>
      </Dropdown.Popover>
    </Dropdown>
  );
}

function isValidDomoId(text) {
  return (
    /^-?\d+$/.test(text) ||
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)
  );
}
