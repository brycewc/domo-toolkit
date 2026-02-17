import { useState, useMemo, useRef, useEffect } from 'react';
import {
  Alert,
  Chip,
  Disclosure,
  Link,
  ScrollShadow,
  Spinner,
  Tabs,
  Tooltip
} from '@heroui/react';
import { IconClipboard } from '@tabler/icons-react';
import { AnimatedCheck } from './AnimatedCheck';
import { getObjectType } from '@/models';
import { fetchObjectDetailsInPage } from '@/services';
import { executeInPage } from '@/utils';
import JsonView from 'react18-json-view';
import '@/assets/json-view-theme.css';

/**
 * Shared JsonView configuration used across all tabs
 */
function MetadataJsonView({ src }) {
  return (
    <JsonView
      src={src}
      collapsed={1}
      matchesURL={false}
      displaySize
      collapseStringMode='word'
      collapseStringsAfterLength={50}
      CopyComponent={({ onClick, className, style }) => (
        <IconClipboard
          onClick={onClick}
          className={className}
          style={style}
          size={16}
          stroke={1.5}
        />
      )}
      CopiedComponent={({ className, style }) => (
        <AnimatedCheck
          className={className}
          style={style}
          size={16}
          stroke={1.5}
        />
      )}
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
              href={params.node}
              target='_blank'
              className='text-sm text-accent no-underline decoration-accent hover:underline'
            >
              {params.node}
            </Link>
          );
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

export function ContextFooter({ currentContext, isLoading, onStatusUpdate }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [relatedCache, setRelatedCache] = useState({});
  const [loadingTabs, setLoadingTabs] = useState({});
  const [activeTabId, setActiveTabId] = useState(null);
  const disclosureRef = useRef(null);

  // Compute available tabs: current object + related objects
  const tabs = useMemo(() => {
    const domoObject = currentContext?.domoObject;
    if (!domoObject?.id) return [];

    const typeModel = getObjectType(domoObject.typeId);
    if (!typeModel) return [];

    // First tab: current object
    const result = [
      {
        id: domoObject.typeId,
        label: typeModel.name,
        details: domoObject.metadata?.details || domoObject.metadata,
        objectId: domoObject.id,
        isCurrentObject: true
      }
    ];

    // Additional tabs from relatedObjects config
    if (typeModel.relatedObjects) {
      for (const related of typeModel.relatedObjects) {
        let relatedId;
        if (related.source === 'parentId') {
          relatedId = domoObject.parentId;
        } else {
          relatedId = domoObject.metadata?.details?.[related.field];
        }

        if (relatedId) {
          result.push({
            id: related.typeId,
            label: related.label,
            objectId: relatedId,
            typeId: related.typeId,
            isCurrentObject: false
          });
        }
      }
    }

    // Dev-only tab: full context
    if (process.env.NODE_ENV === 'development') {
      result.push({
        id: '_full_context',
        label: 'Full Context',
        isFullContext: true,
        isCurrentObject: false
      });
    }

    return result;
  }, [
    currentContext?.domoObject?.id,
    currentContext?.domoObject?.typeId,
    currentContext?.domoObject?.parentId,
    currentContext?.domoObject?.metadata
  ]);

  // Default activeTabId to first tab when tabs change
  useEffect(() => {
    if (tabs.length > 0 && !tabs.find((t) => t.id === activeTabId)) {
      setActiveTabId(tabs[0].id);
    }
  }, [tabs, activeTabId]);

  // Lazy-load related object details when a tab is selected
  const handleTabChange = async (key) => {
    setActiveTabId(key);

    // Skip if it's the current object tab or already cached/loading
    const tab = tabs.find((t) => t.id === key);
    if (!tab || tab.isCurrentObject || relatedCache[key] || loadingTabs[key]) {
      return;
    }

    const relatedType = getObjectType(tab.typeId);
    if (!relatedType?.api) return;

    setLoadingTabs((prev) => ({ ...prev, [key]: true }));

    try {
      const params = {
        typeId: relatedType.id,
        objectId: tab.objectId,
        baseUrl: currentContext?.domoObject?.baseUrl,
        apiConfig: relatedType.api,
        requiresParent: relatedType.requiresParentForApi(),
        parentId: null,
        throwOnError: false
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

  // Derive the JSON source for the active tab
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const renderJsonContent = () => {
    if (!activeTab) return null;

    if (activeTab.isCurrentObject) {
      return (
        <MetadataJsonView
          src={
            currentContext?.domoObject?.metadata?.details ||
            currentContext?.domoObject?.metadata
          }
        />
      );
    }

    if (activeTab.isFullContext) {
      return <MetadataJsonView src={currentContext} />;
    }

    if (loadingTabs[activeTabId]) {
      return (
        <div className='flex items-center justify-center py-4'>
          <Spinner size='sm' />
        </div>
      );
    }

    if (relatedCache[activeTabId]) {
      return <MetadataJsonView src={relatedCache[activeTabId]} />;
    }

    return (
      <p className='py-2 text-center text-sm text-muted'>
        Select this tab to load details
      </p>
    );
  };

  const alertContent = (
    <Alert
      status={currentContext?.isDomoPage || isLoading ? 'accent' : 'warning'}
      className='min-h-20 w-full p-2'
    >
      <Alert.Content
        className={`flex flex-col gap-2 ${isLoading ? 'items-center justify-center' : 'items-start'}`}
      >
        {isLoading ? (
          <Spinner size='sm' color='accent' />
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
                  <Tooltip delay={400} closeDelay={0}>
                    <Tooltip.Trigger className='flex items-center'>
                      <Chip
                        color='accent'
                        variant='soft'
                        className='w-fit lowercase'
                        size='sm'
                      >
                        {currentContext?.instance}
                      </Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content>
                      Instance: {currentContext?.instance}.domo.com
                    </Tooltip.Content>
                  </Tooltip>
                  <Tooltip delay={400} closeDelay={0}>
                    <Tooltip.Trigger className='flex items-center'>
                      <Chip
                        color='accent'
                        variant='soft'
                        className='w-fit lowercase'
                        size='sm'
                      >
                        {currentContext?.domoObject?.typeName}
                      </Chip>
                    </Tooltip.Trigger>
                    <Tooltip.Content className='flex items-center rounded p-0'>
                      <Chip
                        color='accent'
                        variant='soft'
                        className='w-fit rounded'
                        size='sm'
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
                delay={400}
                closeDelay={0}
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
                isLoading ? (
                  <Spinner size='sm' color='accent' />
                ) : !currentContext?.instance ||
                  !currentContext?.domoObject?.id ? (
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
      ref={disclosureRef}
      isExpanded={isExpanded}
      onExpandedChange={setIsExpanded}
      className={`w-full ${isExpanded ? 'flex min-h-0 flex-1 flex-col gap-1' : ''}`}
    >
      <Disclosure.Heading>
        <Disclosure.Trigger className='w-full cursor-pointer'>
          {alertContent}
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content
        className={`card flex min-h-0 flex-1 flex-col bg-surface p-0 ${isExpanded ? '' : 'collapse'}`}
      >
        <div className='card__content flex min-h-0 flex-1 flex-col gap-2 p-2'>
          {tabs.length > 1 && (
            <Tabs
              variant='secondary'
              selectedKey={activeTabId}
              onSelectionChange={handleTabChange}
            >
              <Tabs.ListContainer>
                <Tabs.List aria-label='Object details'>
                  {tabs.map((tab) => (
                    <Tabs.Tab key={tab.id} id={tab.id} className='capitalize'>
                      {tab.label}
                      <Tabs.Indicator />
                    </Tabs.Tab>
                  ))}
                </Tabs.List>
              </Tabs.ListContainer>
            </Tabs>
          )}
          <ScrollShadow
            hideScrollBar
            offset={2}
            className='min-h-0 flex-1 overflow-y-auto overscroll-y-contain'
            orientation='vertical'
          >
            {renderJsonContent()}
          </ScrollShadow>
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}
