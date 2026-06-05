import { Button, Chip, Dropdown, Header, Label, Separator, Spinner, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DomoObject } from '@/models/DomoObject';
import {
  fetchObjectDetailsInPage,
  getAllNavigableObjectTypes,
  getAllObjectTypesWithApiConfig,
  getObjectType
} from '@/models/DomoObjectType';
import { executeInPage } from '@/utils/executeInPage';
import { isSidepanel, openSidepanel, storeSidepanelData } from '@/utils/sidepanel';
import IconArrowSquareOut from '@icons/arrow-square-out.svg?react';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconEye from '@icons/eye.svg?react';
import IconRightRailFill from '@icons/right-rail-fill.svg?react';

import { DisabledTooltip } from '../DisabledTooltip';
import { ObjectTypeIcon } from '../ObjectTypeIcon';

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
      .filter((type) => {
        // Types whose parent is resolvable from an ID alone (e.g. DATA_APP_VIEW)
        // are always navigable — `buildObjectUrl` / `fetchObjectMetadata` fill
        // the placeholder lazily via `DomoObject.getParent`.
        if (type.canResolveParentFromIdAlone()) return true;
        // Otherwise include only types that don't need a parent at all:
        // URL types must not require one in the URL, sidepanel-only types must
        // not require one in the API endpoint. Without this, manual picks
        // would route to an empty ObjectDetailsView with no metadata fetched.
        return type.hasUrl() ? !type.requiresParentForUrl() : !type.requiresParentForApi();
      })
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
    () => (copiedId ? allTypes.filter((type) => type.isValidObjectId(copiedId)) : allTypes),
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
  }, [currentContext?.isDomoPage, currentContext?.instance, defaultDomoInstance]);

  const fetchObjectMetadata = useCallback(
    async (typeConfig, objectId, baseUrl) => {
      const params = {
        apiConfig: typeConfig.api,
        baseUrl,
        objectId,
        parentId: null,
        requiresParent: typeConfig.requiresParentForApi(),
        throwOnError: false,
        typeId: typeConfig.id
      };

      if (typeConfig.requiresParentForApi()) {
        try {
          const obj = new DomoObject(typeConfig.id, objectId, baseUrl);
          params.parentId = await obj.getParent(false, null, currentContext?.tabId);
        } catch {
          return null;
        }
      }

      try {
        return await executeInPage(fetchObjectDetailsInPage, [params], currentContext?.tabId);
      } catch {
        return null;
      }
    },
    [currentContext?.tabId]
  );

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

      const metadata = await fetchObjectMetadata(typeConfig, text, baseUrl);

      if (abortRef.current !== runId) return;
      if (!metadata?.details) continue;

      if (typeConfig.id === 'DATAFLOW_TYPE' && metadata.details.deleted === true) {
        continue;
      }
      if (typeConfig.id === 'DATA_APP_VIEW' && metadata.details.type !== 'dav') {
        continue;
      }
      if (typeConfig.id === 'PAGE' && metadata.details.type !== 'page') {
        continue;
      }
      // TEMPLATE and CERTIFICATION_PROCESS share the same API endpoint —
      // discriminate by `details.type`: 'AC' → TEMPLATE, anything else → CERTIFICATION_PROCESS.
      if (typeConfig.id === 'TEMPLATE' && metadata.details.type !== 'AC') {
        continue;
      }
      if (typeConfig.id === 'CERTIFICATION_PROCESS' && (!metadata.details.type || metadata.details.type === 'AC')) {
        continue;
      }

      const domoObject = buildResolvedDomoObject(typeConfig, metadata, baseUrl, text);
      // STREAM without an associated dataset can't redirect — try next type.
      if (!domoObject) continue;

      setResolvedObject(domoObject);
      setError(null);
      setIsLoading(false);
      return;
    }

    if (abortRef.current === runId) {
      setError('Could not determine object type');
      setIsLoading(false);
    }
  }, [fetchObjectMetadata, getInstance]);

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
          onStatusUpdate?.('Navigation Failed', err.message || 'Error navigating to object', 'danger', 4000);
        });
      } catch (err) {
        onStatusUpdate?.('Error', err.message || 'An error occurred', 'danger', 4000);
      }
    },
    [currentContext, onStatusUpdate]
  );

  const handleAction = useCallback(
    async (key) => {
      setIsOpen(false);

      if (key === '_resolved' && resolvedObject) {
        handleNavigate(resolvedObject);
        return;
      }

      // Manual type selection
      if (!copiedId) return;

      const instance = getInstance();
      if (!instance) return;

      const typeConfig = getObjectType(key);
      if (!typeConfig) return;

      const baseUrl = `https://${instance}.domo.com`;

      // Sidepanel-bound types (no URL) fetch metadata up front so
      // ObjectDetailsView renders with data instead of an empty card; STREAM
      // also fetches because it redirects to its associated dataset.
      let domoObject;
      if (!typeConfig.hasUrl() && typeConfig.hasApiConfig()) {
        const metadata = await fetchObjectMetadata(typeConfig, copiedId, baseUrl);
        if (metadata?.details) {
          domoObject = buildResolvedDomoObject(typeConfig, metadata, baseUrl, copiedId);
        }
        if (!domoObject && typeConfig.id === 'STREAM') {
          onStatusUpdate?.('No DataSet Found', 'Could not find a dataset associated with this stream', 'warning', 4000);
          return;
        }
      }

      if (!domoObject) {
        domoObject = new DomoObject(key, copiedId, baseUrl);
      }
      handleNavigate(domoObject);
    },
    [copiedId, fetchObjectMetadata, getInstance, handleNavigate, onStatusUpdate, resolvedObject]
  );

  const needsDefaultInstance = !currentContext?.isDomoPage && !defaultDomoInstance;

  if (needsDefaultInstance) {
    return (
      <DisabledTooltip content='Set a default Domo instance in settings'>
        <Button fullWidth isIconOnly variant='tertiary'>
          <IconArrowSquareOut />
        </Button>
      </DisabledTooltip>
    );
  }

  return (
    <Dropdown isOpen={isOpen} onOpenChange={handleOpenChange}>
      <Tooltip delay={200}>
        <Button fullWidth isIconOnly variant='tertiary'>
          <IconArrowSquareOut />
        </Button>
        <Tooltip.Content
          className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-balance break-normal'
          offset={4}
        >
          Navigate to copied object
        </Tooltip.Content>
      </Tooltip>
      <Dropdown.Popover className='flex max-h-80 w-80 min-w-80 flex-col overflow-hidden' placement='bottom'>
        {copiedId && (
          <div className='pointer-events-none flex shrink-0 items-center gap-1 px-2 pt-2 font-mono text-xs text-muted select-none'>
            <IconClipboardCopy size={12} />
            <p title='Current clipboard value'>{copiedId}</p>
          </div>
        )}
        <Dropdown.Menu className='min-h-0 flex-1 overflow-auto overscroll-contain' onAction={handleAction}>
          <Dropdown.Section>
            <Header>Auto-detected</Header>
            <Dropdown.Item className={isLoading ? '' : 'hidden'} id='_loading' textValue='Loading'>
              <Spinner color='currentColor' size='sm' />
              <Label>Resolving...</Label>
            </Dropdown.Item>
            <Dropdown.Item
              className={error && !isLoading ? 'pointer-events-none' : 'hidden'}
              id='_error'
              textValue={error || 'Error'}
            >
              <IconExclamationTriangle className='size-5 shrink-0' />
              <Label className='text-muted'>{error}</Label>
            </Dropdown.Item>
            <Dropdown.Item
              className={resolvedObject && !isLoading ? 'items-start' : 'hidden'}
              id='_resolved'
              textValue='Navigate'
            >
              <ObjectTypeIcon className='size-5 shrink-0' typeId={resolvedObject?.typeId} />
              <div className='flex flex-col gap-1'>
                <Chip className='w-fit lowercase' color='accent' size='sm' variant='soft'>
                  {resolvedObject?.typeName}
                </Chip>
                <Label className='font-medium'>{resolvedObject?.metadata?.name || copiedId}</Label>
              </div>
              {resolvedObject?.hasUrl() ? (
                <IconArrowSquareOut className='ml-auto size-5 shrink-0' />
              ) : (
                <IconEye className='ml-auto size-5 shrink-0' />
              )}
            </Dropdown.Item>
          </Dropdown.Section>

          {filteredTypes.length > 0 && (
            <>
              <Separator />
              <Dropdown.Section>
                <Header>Manual selection</Header>
                {filteredTypes.map((type) => (
                  <Dropdown.Item id={type.id} key={type.id} textValue={type.name}>
                    <ObjectTypeIcon className='size-5 shrink-0' typeId={type.id} />
                    <Label>{type.name}</Label>
                    {type.hasUrl() || type.redirectsToType ? (
                      <IconArrowSquareOut className='ml-auto size-5 shrink-0' />
                    ) : (
                      <IconRightRailFill className='ml-auto size-5 shrink-0' />
                    )}
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

function buildDomoMetadata(typeConfig, metadata) {
  const domoMetadata = {
    details: metadata.details,
    name: metadata.name
  };
  // CERTIFICATION_PROCESS doesn't go through the page-detection pipeline, so
  // the clipboard flow has to add the context discriminator itself.
  if (typeConfig.id === 'CERTIFICATION_PROCESS' && metadata.details?.type) {
    domoMetadata.context = {
      certifiedType: metadata.details.type.startsWith('CC:CARD') ? 'certified-cards' : 'certified-datasets'
    };
  }
  return domoMetadata;
}

function buildResolvedDomoObject(typeConfig, metadata, baseUrl, fallbackId) {
  // STREAM has no UI of its own in Domo — redirect to its associated dataset.
  if (typeConfig.id === 'STREAM') {
    const datasetId = metadata.details?.dataSource?.id;
    if (!datasetId) return null;
    return new DomoObject('DATA_SOURCE', datasetId, baseUrl, {
      details: metadata.details.dataSource,
      name: metadata.details.dataSource.name
    });
  }
  return new DomoObject(typeConfig.id, fallbackId, baseUrl, buildDomoMetadata(typeConfig, metadata));
}

function isValidDomoId(text) {
  return /^-?\d+$/.test(text) || /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text);
}
