import {
  Alert,
  Chip,
  Disclosure,
  Link,
  ScrollShadow,
  Skeleton,
  Spinner,
  Tabs,
  Tooltip
} from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import JsonView from 'react18-json-view';

import { useGroupLookup, useUserLookup } from '@/hooks';
import { getObjectType } from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import {
  executeInPage,
  formatEpochTimestamp,
  isDateFieldName,
  isGroupFieldName,
  isUserFieldName
} from '@/utils';

import { AnimatedCheck } from './AnimatedCheck';
import { GroupIdAnnotation } from './GroupIdAnnotation';
import { TimestampAnnotation } from './TimestampAnnotation';
import { UserIdAnnotation } from './UserIdAnnotation';
import '@/assets/json-view-theme.css';

export function ContextFooter({
  currentContext,
  isLoading,
  onStatusUpdate: _onStatusUpdate
}) {
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

  // Compute available tabs: current object + related objects
  const tabs = useMemo(() => {
    const domoObject = currentContext?.domoObject;
    if (!domoObject?.id) return [];

    const typeModel = getObjectType(domoObject.typeId);
    if (!typeModel) return [];

    // First tab: current object
    const result = [
      {
        details: domoObject.metadata?.details || domoObject.metadata,
        id: domoObject.typeId,
        isCurrentObject: true,
        label: typeModel.name,
        objectId: domoObject.id
      }
    ];

    // Additional tabs from relatedObjects config
    if (typeModel.relatedObjects) {
      for (const related of typeModel.relatedObjects) {
        if (related.isArray) {
          const arrayData = domoObject.metadata?.details?.[related.field];
          if (arrayData?.length > 0) {
            result.push({
              data: arrayData,
              id: related.field,
              isArray: true,
              isCurrentObject: false,
              itemIdField: related.itemIdField,
              itemTypeField: related.itemTypeField,
              itemTypeId: related.itemTypeId,
              label: `${related.label} (${arrayData.length})`
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
          relatedId = related.field
            .split('.')
            .reduce((obj, key) => obj?.[key], domoObject.metadata?.details);
        }

        if (relatedId) {
          result.push({
            id: related.field || related.source || related.typeId,
            isCurrentObject: false,
            label: related.label,
            objectId: relatedId,
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

  // Reset related cache and active tab when the detected object changes
  const objectId = currentContext?.domoObject?.id;
  useEffect(() => {
    setRelatedCache({});
    setLoadingTabs({});
    setActiveTabId(tabs[0]?.id ?? null);
  }, [objectId]);

  // Default activeTabId to first tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  const activeTab = tabs.find((t) => t.id === activeTabId);
  const activeSrc = useMemo(() => {
    if (!activeTab) {
      return (
        currentContext?.domoObject?.metadata?.details ||
        currentContext?.domoObject?.metadata
      );
    }
    if (activeTab.isCurrentObject) {
      return (
        currentContext?.domoObject?.metadata?.details ||
        currentContext?.domoObject?.metadata
      );
    }
    if (activeTab.isArray) return activeTab.data;
    if (activeTab.isFullContext) return currentContext;
    return relatedCache[activeTabId] || null;
  }, [activeTab, activeTabId, currentContext, relatedCache]);
  const groupMap = useGroupLookup(activeSrc, currentContext?.tabId);
  const userMap = useUserLookup(activeSrc, currentContext?.tabId);

  // Lazy-load related object details when a tab is selected
  const handleTabChange = async (key) => {
    setActiveTabId(key);

    // Skip if it's the current object tab, an array tab, or already cached/loading
    const tab = tabs.find((t) => t.id === key);
    if (
      !tab ||
      tab.isCurrentObject ||
      tab.isArray ||
      relatedCache[key] ||
      loadingTabs[key]
    ) {
      return;
    }

    // Seed cache from preloaded parent data (no fetch needed)
    if (tab.preloaded) {
      setRelatedCache((prev) => ({ ...prev, [key]: tab.preloaded }));
      return;
    }

    const relatedType = getObjectType(tab.typeId);
    if (!relatedType?.api) return;

    setLoadingTabs((prev) => ({ ...prev, [key]: true }));

    try {
      const params = {
        apiConfig: relatedType.api,
        baseUrl: currentContext?.domoObject?.baseUrl,
        objectId: tab.objectId,
        parentId: null,
        requiresParent: relatedType.requiresParentForApi(),
        throwOnError: false,
        typeId: relatedType.id
      };

      const metadata = await executeInPage(
        fetchObjectDetailsInPage,
        [params],
        currentContext?.tabId
      );

      if (metadata?.details) {
        setRelatedCache((prev) => ({ ...prev, [key]: metadata.details }));
      } else {
        setRelatedCache((prev) => ({
          ...prev,
          [key]: { error: 'No details available' }
        }));
      }
    } catch (error) {
      console.error(`[ContextFooter] Error fetching ${key} details:`, error);
      setRelatedCache((prev) => ({
        ...prev,
        [key]: { error: error.message }
      }));
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
          userMap={userMap}
          src={
            currentContext?.domoObject?.metadata?.details ||
            currentContext?.domoObject?.metadata
          }
        />
      );
    }

    if (activeTab.isArray) {
      const src = injectUrls(activeTab.data, {
        baseUrl,
        isArray: true,
        itemIdField: activeTab.itemIdField,
        itemTypeField: activeTab.itemTypeField,
        itemTypeId: activeTab.itemTypeId
      });
      return (
        <MetadataJsonView
          collapsed={2}
          groupMap={groupMap}
          src={src}
          userMap={userMap}
        />
      );
    }

    if (activeTab.isFullContext) {
      return (
        <MetadataJsonView
          groupMap={groupMap}
          src={currentContext}
          userMap={userMap}
        />
      );
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
        typeId: activeTab.typeId
      });
      return (
        <MetadataJsonView groupMap={groupMap} src={src} userMap={userMap} />
      );
    }

    return (
      <p className='py-2 text-center text-sm text-muted'>
        Select this tab to load details
      </p>
    );
  };

  const alertContent = (
    <Alert
      className='min-h-20 w-full p-2'
      status={currentContext?.isDomoPage || isLoading ? 'accent' : 'warning'}
    >
      <Alert.Content className='flex flex-col items-start gap-2'>
        {isLoading ? (
          <div className='skeleton--shimmer relative flex w-full flex-col gap-2 overflow-hidden'>
            <div className='flex w-full items-center justify-between'>
              <div className='flex items-center gap-x-1'>
                <Skeleton
                  animationType='none'
                  className='h-4 w-24 rounded-md'
                />
                <Skeleton
                  animationType='none'
                  className='h-5 w-12 rounded-2xl'
                />
                <Skeleton
                  animationType='none'
                  className='h-5 w-12 rounded-2xl'
                />
              </div>
              <Skeleton animationType='none' className='h-5 w-5 rounded-full' />
            </div>
            <div className='flex items-center gap-x-1'>
              <Skeleton animationType='none' className='h-4 w-48 rounded-md' />
            </div>
          </div>
        ) : (
          <>
            <div
              className='alert__title flex w-full items-start justify-between'
              data-slot='alert-title'
            >
              {currentContext?.isDomoPage ? (
                <div className='flex flex-wrap items-center gap-x-1'>
                  <span className='flex flex-wrap items-center justify-start gap-x-1'>
                    Current Context
                  </span>
                  <Tooltip closeDelay={0} delay={400}>
                    <Tooltip.Trigger className='flex items-center'>
                      <Chip
                        className='w-fit lowercase'
                        color='accent'
                        size='sm'
                        variant='soft'
                      >
                        {currentContext?.instance}
                      </Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      Instance: {currentContext?.instance}.domo.com
                    </Tooltip.Content>
                  </Tooltip>
                  <Tooltip closeDelay={0} delay={400}>
                    <Tooltip.Trigger className='flex items-center'>
                      <Chip
                        className='w-fit lowercase'
                        color='accent'
                        size='sm'
                        variant='soft'
                      >
                        {currentContext?.domoObject?.typeName}
                      </Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content className='flex items-center rounded p-0'>
                      <Chip
                        className='w-fit rounded-xl'
                        color='accent'
                        size='sm'
                        variant='soft'
                      >
                        {currentContext?.domoObject?.typeId}
                      </Chip>
                    </Tooltip.Content>
                  </Tooltip>
                </div>
              ) : (
                'Not a Domo Instance'
              )}
              <Tooltip
                closeDelay={0}
                delay={400}
                isDisabled={
                  !currentContext?.domoObject?.id || !currentContext?.isDomoPage
                }
              >
                <Tooltip.Trigger>
                  <Alert.Indicator />
                </Tooltip.Trigger>
                <Tooltip.Content>
                  Click to toggle context JSON view
                </Tooltip.Content>
              </Tooltip>
            </div>
            <Alert.Description className='flex h-full flex-col flex-wrap items-start justify-center gap-1'>
              {currentContext?.isDomoPage ? (
                !currentContext?.instance || !currentContext?.domoObject?.id ? (
                  'No object detected on this page'
                ) : (
                  <div className='flex flex-wrap items-center justify-start gap-x-1'>
                    <span className='text-left font-medium'>
                      {currentContext?.domoObject?.metadata?.name}
                    </span>
                    <span>ID: {currentContext?.domoObject?.id}</span>
                  </div>
                )
              ) : (
                'Navigate to an instance to enable most features'
              )}
            </Alert.Description>
          </>
        )}
      </Alert.Content>
    </Alert>
  );

  // No disclosure when not on a Domo page or no object
  if (
    !currentContext?.isDomoPage ||
    isLoading ||
    !currentContext?.domoObject?.id
  ) {
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
        <Disclosure.Trigger className='w-full cursor-pointer'>
          {alertContent}
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content
        className={`card flex min-h-0 flex-1 flex-col bg-surface p-0 ${isExpanded ? '' : 'collapse'}`}
      >
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
                  size={40}
                >
                  <Tabs.List
                    aria-label='Object details'
                    className='w-fit min-w-full flex-nowrap'
                  >
                    {tabs.map((tab) => (
                      <Tabs.Tab
                        className='min-w-32 capitalize'
                        id={tab.id}
                        key={tab.id}
                      >
                        {tab.label}
                        <Tabs.Indicator />
                      </Tabs.Tab>
                    ))}
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

function buildSimpleUrl(baseUrl, typeId, objectId) {
  const type = getObjectType(typeId);
  if (!type?.hasUrl()) return null;
  const path = type.urlPath.replace('{id}', objectId);
  if (path.includes('{')) return null;
  return `${baseUrl}${path}`;
}

function injectUrls(
  src,
  { baseUrl, isArray, itemIdField, itemTypeField, itemTypeId, objectId, typeId }
) {
  if (!src || !baseUrl) return src;

  if (isArray && Array.isArray(src)) {
    return src.map((item) => {
      if (!item || typeof item !== 'object') return item;
      const resolvedType = itemTypeId || item[itemTypeField];
      const itemId = itemIdField ? item[itemIdField] : item.id;
      if (!resolvedType || !itemId) return item;
      const url = buildSimpleUrl(baseUrl, resolvedType, itemId);
      return url ? { url, ...item } : item;
    });
  }

  if (typeof src === 'object' && !Array.isArray(src) && typeId && objectId) {
    const url = buildSimpleUrl(baseUrl, typeId, objectId);
    return url ? { url, ...src } : src;
  }

  return src;
}

function MetadataJsonView({ collapsed = 1, groupMap = {}, src, userMap = {} }) {
  return (
    <JsonView
      displaySize
      className='text-sm'
      collapsed={collapsed}
      collapseStringMode='word'
      collapseStringsAfterLength={150}
      matchesURL={false}
      src={src}
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
      customizeCopy={(node) => {
        const stringValue =
          typeof node === 'object'
            ? JSON.stringify(node, null, 2)
            : String(node);
        const trimmed = stringValue.trim();
        const isDomoId =
          /^-?\d+$/.test(trimmed) ||
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            trimmed
          );
        if (isDomoId) {
          chrome.runtime
            .sendMessage({
              clipboardData: trimmed,
              type: 'CLIPBOARD_COPIED'
            })
            .catch(() => {});
        }
        return stringValue;
      }}
      customizeNode={(params) => {
        if (params.node === null || params.node === undefined) {
          return { enableClipboard: false };
        }
        if (
          typeof params.node === 'string' &&
          params.node.startsWith('https://')
        ) {
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
        if (
          typeof params.node === 'number' &&
          isDateFieldName(params.indexOrName)
        ) {
          const formatted = formatEpochTimestamp(params.node);
          if (formatted) {
            return (
              <TimestampAnnotation formatted={formatted} value={params.node} />
            );
          }
        }
        if (
          (typeof params.node === 'number' ||
            typeof params.node === 'string') &&
          Object.keys(userMap).length > 0
        ) {
          const numericValue = Number(params.node);
          if (
            userMap[numericValue] &&
            (isUserFieldName(params.indexOrName) || params.indexOrName === 'id')
          ) {
            return (
              <UserIdAnnotation
                displayName={userMap[numericValue]}
                value={params.node}
              />
            );
          }
        }
        if (
          (typeof params.node === 'number' ||
            typeof params.node === 'string') &&
          Object.keys(groupMap).length > 0
        ) {
          const numericValue = Number(params.node);
          if (
            groupMap[numericValue] &&
            (isGroupFieldName(params.indexOrName) ||
              isUserFieldName(params.indexOrName) ||
              params.indexOrName === 'id')
          ) {
            return (
              <GroupIdAnnotation
                displayName={groupMap[numericValue]}
                value={params.node}
              />
            );
          }
        }
        if (params.indexOrName?.toLowerCase().includes('id')) {
          return { enableClipboard: true };
        } else if (
          (typeof params.node === 'number' ||
            typeof params.node === 'string') &&
          params.node?.toString().length >= 7
        ) {
          return { enableClipboard: true };
        } else if (
          typeof params.node === 'object' &&
          Object.keys(params.node).length > 0
        ) {
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
