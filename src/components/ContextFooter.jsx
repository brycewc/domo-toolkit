import { Alert, Chip, Disclosure, Link, ScrollShadow, Skeleton, Spinner, Tabs, Tooltip } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';
import JsonView from 'react18-json-view';

import { useGroupLookup } from '@/hooks/useGroupLookup';
import { useUserLookup } from '@/hooks/useUserLookup';
import { useWheelHorizontalScroll } from '@/hooks/useWheelHorizontalScroll';
import { fetchObjectDetailsInPage, getObjectType } from '@/models/DomoObjectType';
import { getTemplateApprovals } from '@/services/approvals';
import { getDatasetColumns, getDatasetDetailsForList, getDatasetsForPage } from '@/services/datasets';
import { getJupyterWorkspaceAccounts, getJupyterWorkspaceDatasets } from '@/services/jupyterWorkspaces';
import { executeInPage } from '@/utils/executeInPage';
import { formatEpochTimestamp, formatTimestamp, isDateFieldName, isGroupFieldName, isUserFieldName } from '@/utils/general';
import IconClipboardCopy from '@icons/clipboard-copy.svg?react';

// Maps relatedData[].fetcher key → (params) => Promise<Array>. Lives here
// (not in DomoObjectType.js) so the type model stays import-free of services.
// Adding a new lazy-array fetcher = one entry here + one `fetcher: '<key>'` on
// the relatedData entry. Pair the entry with a `field` to gate the tab on (and
// seed its count from) an array already present in the object's details.
const LAZY_ARRAY_FETCHERS = {
  dataflowInputs: ({ details, tabId }) => getDatasetDetailsForList({ datasets: details?.inputs, tabId }),
  dataflowOutputs: ({ details, tabId }) => getDatasetDetailsForList({ datasets: details?.outputs, tabId }),
  datasetColumns: ({ objectId, tabId }) => getDatasetColumns({ datasetId: objectId, tabId }),
  datasetsForAccountDetails: ({ details, tabId }) => getDatasetDetailsForList({ datasets: details?.accountDatasets, tabId }),
  datasetsForPage: ({ objectId, tabId }) => getDatasetsForPage({ pageId: objectId, tabId }),
  jupyterWorkspaceAccounts: ({ details, tabId }) =>
    getJupyterWorkspaceAccounts({ entries: details?.accountConfiguration, tabId }),
  jupyterWorkspaceInputs: ({ details, tabId }) => getJupyterWorkspaceDatasets({ entries: details?.inputConfiguration, tabId }),
  jupyterWorkspaceOutputs: ({ details, tabId }) =>
    getJupyterWorkspaceDatasets({ entries: details?.outputConfiguration, tabId }),
  templateApprovals: ({ objectId, tabId }) => getTemplateApprovals(objectId, tabId)
};

import { AlertStatusIcon } from './AlertStatusIcon';
import { AnimatedCheck } from './AnimatedCheck';
import { GroupIdAnnotation } from './GroupIdAnnotation';
import { ObjectTypeIcon } from './ObjectTypeIcon';
import { TimestampAnnotation } from './TimestampAnnotation';
import '@/assets/json-view-theme.css';

import { UserIdAnnotation } from './UserIdAnnotation';

// Module-level cache for fetched related-tab data so it survives ContextFooter
// remounts and Chrome-tab switches while the sidepanel stays open. Keyed by
// Chrome tab id: switching Chrome tabs keeps each tab's data intact. Each
// Chrome-tab entry records the objectId it was cached against, so navigating to
// a different object in the same Chrome tab invalidates that tab's cache.
// Entries older than the TTL are treated as misses since related data (pending
// approvals and the like) goes stale as people act on it.
const RELATED_CACHE_TTL_MS = 300 * 1000; // 300 seconds
const relatedDataCache = new Map(); // chromeTabId -> { objectId, entries: Map<tabKey, { data, timestamp }> }

export function ContextFooter({ currentContext, isLoading, onStatusUpdate: _onStatusUpdate }) {
  const [developerMode, setDeveloperMode] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedCache, setRelatedCache] = useState({});
  const [loadingTabs, setLoadingTabs] = useState({});
  const [activeTabId, setActiveTabId] = useState(null);
  const disclosureRef = useRef(null);

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    chrome.storage.local.get(['developerMode'], (result) => {
      setDeveloperMode(result.developerMode ?? false);
    });

    const handleStorageChange = (changes, areaName) => {
      if (areaName === 'local' && changes.developerMode !== undefined) {
        setDeveloperMode(changes.developerMode.newValue ?? false);
      }
    };

    chrome.storage.onChanged.addListener(handleStorageChange);
    return () => chrome.storage.onChanged.removeListener(handleStorageChange);
  }, []);

  // Drop a Chrome tab's cached related data when the tab closes, so the
  // module-level cache doesn't accumulate entries for tabs gone for the session.
  useEffect(() => {
    const handleTabRemoved = (closedTabId) => {
      relatedDataCache.delete(closedTabId);
    };
    chrome.tabs.onRemoved.addListener(handleTabRemoved);
    return () => chrome.tabs.onRemoved.removeListener(handleTabRemoved);
  }, []);

  // Compute available tabs: current object + related objects
  const tabs = useMemo(() => {
    const domoObject = currentContext?.domoObject;
    if (!domoObject?.id) return [];

    const typeModel = getObjectType(domoObject.typeId);
    if (!typeModel) return [];

    // First tab: current object (use 'self' label override if configured)
    const selfLabel = typeModel.relatedData?.find((r) => r.source === 'self')?.label;
    const result = [
      {
        details: domoObject.metadata?.details || domoObject.metadata,
        id: domoObject.typeId,
        isCurrentObject: true,
        label: selfLabel || typeModel.name,
        objectId: domoObject.id
      }
    ];

    // Additional tabs from relatedData config
    if (typeModel.relatedData) {
      for (const related of typeModel.relatedData) {
        if (related.source === 'self') continue;
        if (related.isArray) {
          const arrayBase =
            related.fieldSource === 'context'
              ? domoObject.metadata?.context
              : related.fieldSource === 'parent'
                ? domoObject.metadata?.parent?.details
                : domoObject.metadata?.details;
          const arrayData = related.field ? arrayBase?.[related.field] : undefined;

          // Lazy: presence of `fetcher` defers the load until tab activation.
          // Data lands in relatedCache; count appended at render time. When a
          // `field` is also configured, the tab hides while that array is
          // empty and its length seeds the count before the fetch runs.
          if (related.fetcher) {
            if (related.field && !arrayData?.length) continue;
            result.push({
              fetcher: related.fetcher,
              id: related.field || related.fetcher,
              isArray: true,
              isCurrentObject: false,
              itemIdField: related.itemIdField,
              itemTypeField: related.itemTypeField,
              itemTypeId: related.itemTypeId,
              knownCount: related.field ? arrayData.length : undefined,
              label: related.label,
              parentId: resolveRelatedParentId(related, domoObject)
            });
            continue;
          }
          if (arrayData?.length > 0) {
            result.push({
              data: arrayData,
              id: related.field,
              isArray: true,
              isCurrentObject: false,
              itemIdField: related.itemIdField,
              itemTypeField: related.itemTypeField,
              itemTypeId: related.itemTypeId,
              label: `${related.label} (${arrayData.length})`,
              parentId: resolveRelatedParentId(related, domoObject)
            });
          }
          continue;
        }

        if (related.source === 'parent') {
          const parent = domoObject.metadata?.parent;
          if (parent && parent.objectType?.id === related.typeId) {
            result.push({
              id: related.source,
              isCurrentObject: false,
              label: related.label,
              objectId: parent.id,
              preloaded: parent.details,
              typeId: related.typeId
            });
          }
          continue;
        }

        let relatedId;
        if (related.source === 'parentId') {
          relatedId = domoObject.parentId;
        } else {
          const fieldBase =
            related.fieldSource === 'context'
              ? domoObject.metadata?.context
              : related.fieldSource === 'parent'
                ? domoObject.metadata?.parent?.details
                : domoObject.metadata?.details;
          relatedId = related.field.split('.').reduce((obj, key) => obj?.[key], fieldBase);
        }

        if (relatedId) {
          result.push({
            id: related.field || related.source || related.typeId,
            isCurrentObject: false,
            label: related.label,
            objectId: relatedId,
            parentId: resolveRelatedParentId(related, domoObject),
            typeId: related.typeId
          });
        }
      }
    }

    if (import.meta.env.DEV && developerMode) {
      result.push({
        id: '_full_context',
        isCurrentObject: false,
        isFullContext: true,
        label: 'Full Context'
      });
    }

    return result;
  }, [
    currentContext?.domoObject?.id,
    currentContext?.domoObject?.typeId,
    currentContext?.domoObject?.parentId,
    currentContext?.domoObject?.metadata,
    developerMode
  ]);

  // Reset related cache and active tab when the detected object changes. Seed
  // from the module-level cache so data cached for this Chrome tab and object
  // (within the TTL) survives Chrome-tab switches and footer remounts;
  // navigating to a different object in the same Chrome tab invalidates it.
  const objectId = currentContext?.domoObject?.id;
  const chromeTabId = currentContext?.tabId;
  const contextKeyRef = useRef(null);
  useEffect(() => {
    contextKeyRef.current = `${chromeTabId ?? ''}::${objectId ?? ''}`;
    setRelatedCache(readFreshRelatedCache(chromeTabId, objectId));
    setLoadingTabs({});
    setActiveTabId(tabs[0]?.id ?? null);
  }, [objectId, chromeTabId]);

  // Default activeTabId to first tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSrc = useMemo(() => {
    if (!activeTab) {
      return currentContext?.domoObject?.metadata?.details || currentContext?.domoObject?.metadata;
    }
    if (activeTab.isCurrentObject) {
      return currentContext?.domoObject?.metadata?.details || currentContext?.domoObject?.metadata;
    }
    if (activeTab.isArray) {
      return activeTab.fetcher ? relatedCache[activeTabId] : activeTab.data;
    }
    if (activeTab.isFullContext) return currentContext;
    return relatedCache[activeTabId] || null;
  }, [activeTab, activeTabId, currentContext, relatedCache]);
  const groupMap = useGroupLookup(activeSrc, currentContext?.tabId);
  const userMap = useUserLookup(activeSrc, currentContext?.tabId);
  const tabScrollRef = useWheelHorizontalScroll();

  // Lazy-load related object details when a tab is selected
  const handleTabChange = async (key) => {
    setActiveTabId(key);

    // Skip the current-object tab and anything already in flight.
    const tab = tabs.find((t) => t.id === key);
    if (!tab || tab.isCurrentObject || loadingTabs[key]) return;
    // Eager arrays carry their data on the tab — nothing to fetch
    if (tab.isArray && !tab.fetcher) return;

    // Fresh module-cache hit for this Chrome tab + object: mirror it into
    // render state without refetching.
    const cached = getFreshRelatedEntry(chromeTabId, objectId, key);
    if (cached !== undefined) {
      setRelatedCache((prev) => (key in prev ? prev : { ...prev, [key]: cached }));
      return;
    }

    // Seed cache from preloaded parent data (no fetch needed)
    if (tab.preloaded) {
      setRelatedCache((prev) => ({ ...prev, [key]: tab.preloaded }));
      return;
    }

    // Pin the context this fetch was issued for. A response that lands after
    // the user navigated to another object/Chrome tab still updates the cache
    // (keyed by the issuing context) but must not overwrite the current view.
    const reqKey = `${chromeTabId ?? ''}::${objectId ?? ''}`;
    setLoadingTabs((prev) => ({ ...prev, [key]: true }));

    try {
      if (tab.fetcher) {
        // Lazy array: dispatch to the registered fetcher, store the array in cache.
        const fetcher = LAZY_ARRAY_FETCHERS[tab.fetcher];
        if (!fetcher) throw new Error(`Unknown lazy array fetcher: ${tab.fetcher}`);
        const arr = await fetcher({
          details: currentContext?.domoObject?.metadata?.details,
          objectId,
          tabId: chromeTabId
        });
        const data = arr ?? [];
        writeRelatedCache(chromeTabId, objectId, key, data);
        if (contextKeyRef.current === reqKey) {
          setRelatedCache((prev) => ({ ...prev, [key]: data }));
        }
      } else {
        const relatedType = getObjectType(tab.typeId);
        if (!relatedType?.api) {
          setLoadingTabs((prev) => ({ ...prev, [key]: false }));
          return;
        }

        const params = {
          apiConfig: relatedType.api,
          baseUrl: currentContext?.domoObject?.baseUrl,
          objectId: tab.objectId,
          parentId: tab.parentId || null,
          requiresParent: relatedType.requiresParentForApi(),
          throwOnError: false,
          typeId: relatedType.id
        };

        const metadata = await executeInPage(fetchObjectDetailsInPage, [params], chromeTabId);

        if (metadata?.details) {
          writeRelatedCache(chromeTabId, objectId, key, metadata.details);
          if (contextKeyRef.current === reqKey) {
            setRelatedCache((prev) => ({ ...prev, [key]: metadata.details }));
          }
        } else if (contextKeyRef.current === reqKey) {
          setRelatedCache((prev) => ({
            ...prev,
            [key]: { error: 'No details available' }
          }));
        }
      }
    } catch (error) {
      console.error(`[ContextFooter] Error fetching ${key} details:`, error);
      if (contextKeyRef.current === reqKey) {
        setRelatedCache((prev) => ({
          ...prev,
          [key]: { error: error.message }
        }));
      }
    } finally {
      setLoadingTabs((prev) => ({ ...prev, [key]: false }));
    }
  };

  const baseUrl = currentContext?.domoObject?.baseUrl;

  const renderJsonContent = () => {
    if (!activeTab) return null;

    if (activeTab.isCurrentObject) {
      return (
        <MetadataJsonView
          groupMap={groupMap}
          src={currentContext?.domoObject?.metadata?.details || currentContext?.domoObject?.metadata}
          userMap={userMap}
        />
      );
    }

    if (activeTab.isArray) {
      const arrayData = activeTab.fetcher ? relatedCache[activeTabId] : activeTab.data;
      if (activeTab.fetcher) {
        if (loadingTabs[activeTabId]) {
          return (
            <div className='flex items-center justify-center py-4'>
              <Spinner size='sm' />
            </div>
          );
        }
        if (arrayData?.error) {
          return <p className='p-2 text-xs text-danger'>{arrayData.error}</p>;
        }
        if (!Array.isArray(arrayData)) return null;
      }
      const src = injectUrls(arrayData, {
        baseUrl,
        isArray: true,
        itemIdField: activeTab.itemIdField,
        itemTypeField: activeTab.itemTypeField,
        itemTypeId: activeTab.itemTypeId,
        parentId: activeTab.parentId
      });
      return <MetadataJsonView collapsed={2} groupMap={groupMap} src={src} userMap={userMap} />;
    }

    if (activeTab.isFullContext) {
      return <MetadataJsonView groupMap={groupMap} src={currentContext} userMap={userMap} />;
    }

    if (loadingTabs[activeTabId]) {
      return (
        <div className='flex items-center justify-center py-4'>
          <Spinner size='sm' />
        </div>
      );
    }

    if (relatedCache[activeTabId]) {
      const src = injectUrls(relatedCache[activeTabId], {
        baseUrl,
        objectId: activeTab.objectId,
        parentId: activeTab.parentId,
        typeId: activeTab.typeId
      });
      return <MetadataJsonView groupMap={groupMap} src={src} userMap={userMap} />;
    }

    return <p className='py-2 text-center text-sm text-muted'>Select this tab to load details</p>;
  };

  const alertContent = (
    <Alert className='min-h-22 w-full p-2' status={currentContext?.isDomoPage || isLoading ? 'accent' : 'warning'}>
      <Alert.Content className='flex min-w-0 flex-col items-start gap-2'>
        {isLoading ? (
          <div className='skeleton--shimmer relative flex w-full flex-col gap-2 overflow-hidden'>
            <div className='flex w-full items-center justify-between'>
              <div className='flex items-center gap-x-1'>
                <Skeleton animationType='none' className='h-4 w-24 rounded-md' />
                <Skeleton animationType='none' className='h-5 w-12 rounded-2xl' />
                <Skeleton animationType='none' className='h-5 w-12 rounded-2xl' />
              </div>
              <Skeleton animationType='none' className='h-5 w-5 rounded-full' />
            </div>
            <div className='flex items-center gap-x-1'>
              <Skeleton animationType='none' className='h-4 w-48 rounded-md' />
            </div>
          </div>
        ) : (
          <>
            <div className='alert__title flex w-full items-start justify-between gap-x-1' data-slot='alert-title'>
              {currentContext?.isDomoPage ? (
                <div className='flex min-w-0 flex-1 items-center gap-x-1'>
                  {/* Items truncate in priority order as the panel narrows so they never
                      collide with the status icon: the "Current Context" label gives up
                      space first (largest shrink), then the instance chip, then the
                      object-type chip. The icon stays shrink-0 and fully visible. */}
                  <Tooltip delay={700}>
                    <Tooltip.Trigger className='min-w-0 shrink-9999'>
                      <span className='block truncate'>Current Context</span>
                    </Tooltip.Trigger>
                    <Tooltip.Content className='max-w-60'>Current Context</Tooltip.Content>
                  </Tooltip>
                  <Tooltip>
                    <Tooltip.Trigger className='flex min-w-0 shrink-100 items-center'>
                      <Chip className='min-w-0 shrink lowercase' color='accent' size='sm' variant='soft'>
                        <Chip.Label className='min-w-0 truncate'>{currentContext?.instance}</Chip.Label>
                      </Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content className='max-w-60'>Instance: {currentContext?.instance}.domo.com</Tooltip.Content>
                  </Tooltip>
                  <Tooltip>
                    <Tooltip.Trigger className='flex min-w-0 shrink items-center'>
                      <Chip className='min-w-0 shrink lowercase' color='accent' size='sm' variant='soft'>
                        <ObjectTypeIcon className='shrink-0' typeId={currentContext?.domoObject?.typeId} />
                        <span className='min-w-0 truncate'>{currentContext?.domoObject?.typeName}</span>
                      </Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content className='max-w-60 rounded p-0 text-wrap'>
                      <Chip className='w-fit rounded-xl' color='accent' size='sm' variant='soft'>
                        {currentContext?.domoObject?.typeId}
                      </Chip>
                    </Tooltip.Content>
                  </Tooltip>
                </div>
              ) : (
                'Not a Domo Instance'
              )}
              <Tooltip delay={300} isDisabled={!currentContext?.domoObject?.id || !currentContext?.isDomoPage}>
                <Tooltip.Trigger className='shrink-0'>
                  <Alert.Indicator>
                    <AlertStatusIcon />
                  </Alert.Indicator>
                </Tooltip.Trigger>
                <Tooltip.Content className='max-w-60'>Click to toggle context JSON view</Tooltip.Content>
              </Tooltip>
            </div>
            <Alert.Description className='flex h-full w-full min-w-0 flex-col items-start justify-start gap-1 text-left'>
              <div className='flex w-full min-w-0 flex-col items-start justify-start text-left'>
                {currentContext?.isDomoPage ? (
                  !currentContext?.instance || !currentContext?.domoObject?.id ? (
                    <span className='w-full truncate text-left font-medium'>No object detected on this page</span>
                  ) : (
                    <>
                      <span className='w-full truncate text-left font-medium'>
                        {currentContext?.domoObject?.metadata?.name}
                      </span>
                      <span className='w-full truncate text-left'>ID: {currentContext?.domoObject?.id}</span>
                      {formatTimestamp(currentContext?.domoObject?.metadata?.created) && (
                        <span className='w-full truncate text-left text-muted'>
                          Created: {formatTimestamp(currentContext?.domoObject?.metadata?.created)}
                        </span>
                      )}
                    </>
                  )
                ) : (
                  <span className='w-full truncate text-left font-medium'>
                    Navigate to an instance to enable most features
                  </span>
                )}
              </div>
            </Alert.Description>
          </>
        )}
      </Alert.Content>
    </Alert>
  );

  // No disclosure when not on a Domo page or no object
  if (!currentContext?.isDomoPage || isLoading || !currentContext?.domoObject?.id) {
    return alertContent;
  }

  return (
    <Disclosure
      className={`w-full ${isExpanded ? 'flex min-h-0 flex-1 flex-col gap-1' : ''}`}
      isExpanded={isExpanded}
      ref={disclosureRef}
      onExpandedChange={setIsExpanded}
    >
      <Disclosure.Heading>
        <Disclosure.Trigger className='w-full cursor-pointer'>{alertContent}</Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content className={`card flex min-h-0 flex-1 flex-col bg-surface p-0 ${isExpanded ? '' : 'collapse'}`}>
        <div className='card__content flex min-h-0 w-full flex-1 flex-col gap-2 p-2'>
          {tabs.length > 1 && (
            <Tabs
              className='w-full shrink-0'
              key={tabs.map((t) => t.id).join(',')}
              selectedKey={activeTabId}
              onSelectionChange={handleTabChange}
            >
              <Tabs.ListContainer>
                <ScrollShadow
                  hideScrollBar
                  className='w-full flex-1'
                  offset={2}
                  orientation='horizontal'
                  ref={tabScrollRef}
                  size={40}
                >
                  <Tabs.List aria-label='Object details' className='w-fit min-w-full flex-nowrap'>
                    {tabs.map((tab) => {
                      const cached = relatedCache[tab.id];
                      const lazyCountSuffix = tab.fetcher
                        ? ` (${Array.isArray(cached) ? cached.length : (tab.knownCount ?? '...')})`
                        : '';
                      const displayLabel = `${tab.label}${lazyCountSuffix}`;
                      // h-12! overrides HeroUI's fixed 32px tab height so a
                      // line-clamp-2 label that wraps to two lines fits inside
                      // the tab instead of spilling past its border.
                      return (
                        <Tabs.Tab className='h-10! min-w-32 flex-1 capitalize' id={tab.id} key={tab.id}>
                          <span className='line-clamp-2 text-center' title={displayLabel}>
                            {displayLabel}
                          </span>
                          <Tabs.Indicator />
                        </Tabs.Tab>
                      );
                    })}
                  </Tabs.List>
                </ScrollShadow>
              </Tabs.ListContainer>
            </Tabs>
          )}
          <ScrollShadow
            hideScrollBar
            className='min-h-0 flex-1 overflow-y-auto overscroll-y-contain'
            offset={2}
            orientation='vertical'
          >
            {renderJsonContent()}
          </ScrollShadow>
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

function buildSimpleUrl(baseUrl, typeId, objectId, parentId) {
  const type = getObjectType(typeId);
  if (!type?.hasUrl()) return null;
  let path = type.urlPath.replace('{id}', objectId);
  if (parentId) path = path.replace('{parent}', parentId);
  if (path.includes('{')) return null;
  return `${baseUrl}${path}`;
}

function getFreshRelatedEntry(chromeTabId, objectId, key) {
  if (chromeTabId == null) return undefined;
  const tabCache = relatedDataCache.get(chromeTabId);
  if (!tabCache || tabCache.objectId !== objectId) return undefined;
  const entry = tabCache.entries.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.timestamp >= RELATED_CACHE_TTL_MS) {
    tabCache.entries.delete(key);
    return undefined;
  }
  return entry.data;
}

function injectUrls(src, { baseUrl, isArray, itemIdField, itemTypeField, itemTypeId, objectId, parentId, typeId }) {
  if (!src || !baseUrl) return src;

  if (isArray && Array.isArray(src)) {
    return src.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const resolvedType = itemTypeId || item[itemTypeField];
      const itemId = itemIdField ? item[itemIdField] : item.id;
      if (!resolvedType || !itemId) return item;
      const url = buildSimpleUrl(baseUrl, resolvedType, itemId, parentId);
      return url ? { url, ...item } : item;
    });
  }

  if (typeof src === 'object' && !Array.isArray(src) && typeId && objectId) {
    const url = buildSimpleUrl(baseUrl, typeId, objectId, parentId);
    return url ? { url, ...src } : src;
  }

  return src;
}

function MetadataJsonView({ collapsed = 1, groupMap = {}, src, userMap = {} }) {
  // Remount when lookup maps change — react18-json-view's JsonNode calls
  // useContext before customizeNode's early return but useState after it, so
  // switching a node between element/config return types across renders
  // breaks the Rules of Hooks. Remounting sidesteps the library bug.
  const jsonViewKey = `${Object.keys(userMap).sort().join(',')}|${Object.keys(groupMap).sort().join(',')}`;
  return (
    <JsonView
      displaySize
      className='text-sm'
      collapsed={collapsed}
      collapseStringMode='word'
      collapseStringsAfterLength={150}
      customizeCopy={(node) => (typeof node === 'object' ? JSON.stringify(node, null, 2) : String(node))}
      key={jsonViewKey}
      matchesURL={false}
      src={src}
      CopiedComponent={({ className, style }) => (
        <AnimatedCheck className={className + ' text-success'} size={16} stroke={1.5} style={style} />
      )}
      CopyComponent={({ className, onClick, style }) => (
        <IconClipboardCopy className={className} size={16} style={style} onClick={onClick} />
      )}
      customizeNode={(params) => {
        if (params.node === null || params.node === undefined) {
          return { enableClipboard: false };
        }
        if (typeof params.node === 'string' && params.node.startsWith('https://')) {
          return (
            <Link
              className='text-sm text-accent no-underline decoration-accent hover:underline'
              href={params.node}
              target='_blank'
            >
              {params.node}
            </Link>
          );
        }
        if (typeof params.node === 'number' && isDateFieldName(params?.indexOrName)) {
          const formatted = formatEpochTimestamp(params.node);
          if (formatted) {
            return <TimestampAnnotation formatted={formatted} value={params.node} />;
          }
        }
        if ((typeof params.node === 'number' || typeof params.node === 'string') && Object.keys(userMap).length > 0) {
          const numericValue = Number(params.node);
          if (userMap[numericValue] && (isUserFieldName(params?.indexOrName) || params?.indexOrName === 'id')) {
            return <UserIdAnnotation displayName={userMap[numericValue]} value={params.node} />;
          }
        }
        if ((typeof params.node === 'number' || typeof params.node === 'string') && Object.keys(groupMap).length > 0) {
          const numericValue = Number(params.node);
          if (
            groupMap[numericValue] &&
            (isGroupFieldName(params?.indexOrName) || isUserFieldName(params?.indexOrName) || params?.indexOrName === 'id')
          ) {
            return <GroupIdAnnotation displayName={groupMap[numericValue]} value={params.node} />;
          }
        }
        if (params?.indexOrName?.toLowerCase()?.includes('id')) {
          return { enableClipboard: true };
        } else if (
          (typeof params.node === 'number' || typeof params.node === 'string') &&
          params.node?.toString().length >= 7
        ) {
          return { enableClipboard: true };
        } else if (typeof params.node === 'object' && Object.keys(params.node).length > 0) {
          return { enableClipboard: true };
        } else if (Array.isArray(params.node) && params.node.length > 0) {
          return { enableClipboard: true };
        } else {
          return { enableClipboard: false };
        }
      }}
    />
  );
}

// Seed value for the reset effect: a plain { [tabKey]: data } of the Chrome
// tab's non-expired entries, but only when they were cached for this same
// object. Drops the whole tab entry on an object mismatch and prunes expired
// entries as a side effect.
function readFreshRelatedCache(chromeTabId, objectId) {
  if (chromeTabId == null) return {};
  const tabCache = relatedDataCache.get(chromeTabId);
  if (!tabCache) return {};
  if (tabCache.objectId !== objectId) {
    relatedDataCache.delete(chromeTabId);
    return {};
  }
  const now = Date.now();
  const fresh = {};
  for (const [key, entry] of tabCache.entries) {
    if (now - entry.timestamp < RELATED_CACHE_TTL_MS) {
      fresh[key] = entry.data;
    } else {
      tabCache.entries.delete(key);
    }
  }
  return fresh;
}

/**
 * Resolve the parent ID that a related object needs for its API call.
 * Uses explicit parentSource config when provided, otherwise auto-resolves
 * from the type hierarchy.
 */
function resolveRelatedParentId(related, domoObject) {
  if (related.parentSource) {
    if (related.parentSource === 'parentId') return domoObject.parentId;
    if (related.parentSource === 'objectId') return domoObject.id;
    const parentBase = related.parentFieldSource === 'context' ? domoObject.metadata?.context : domoObject.metadata?.details;
    return related.parentSource.split('.').reduce((obj, key) => obj?.[key], parentBase);
  }

  // Auto-resolve: infer from type hierarchy
  const relatedType = getObjectType(related.typeId || related.itemTypeId);
  if (relatedType?.requiresParentForApi()) {
    if (relatedType.parents?.includes(domoObject.typeId)) {
      return domoObject.id;
    }
    const currentTypeModel = getObjectType(domoObject.typeId);
    if (relatedType.parents?.some((p) => currentTypeModel?.parents?.includes(p))) {
      return domoObject.parentId;
    }
  }

  return null;
}

function writeRelatedCache(chromeTabId, objectId, key, data) {
  if (chromeTabId == null) return;
  let tabCache = relatedDataCache.get(chromeTabId);
  if (!tabCache || tabCache.objectId !== objectId) {
    tabCache = { entries: new Map(), objectId };
    relatedDataCache.set(chromeTabId, tabCache);
  }
  tabCache.entries.set(key, { data, timestamp: Date.now() });
}
