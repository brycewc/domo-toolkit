import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  Alert,
  Chip,
  Disclosure,
  Link,
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
      className='min-h-0 flex-1'
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
              className='text-(--json-boolean) no-underline decoration-(--json-boolean) hover:underline'
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
  const disclosureRef = useRef(null);

  // Directly set max-height on tab panels via DOM to bypass HeroUI internals
  const updatePanelMaxHeight = useCallback(() => {
    if (!disclosureRef.current) return;
    const viewportHeight = window.innerHeight;
    const alertEl = disclosureRef.current.querySelector('.disclosure__heading');
    const tabList = disclosureRef.current.querySelector(
      '.tabs__list-container'
    );
    const alertRect = alertEl?.getBoundingClientRect();
    const alertTop = Math.max(0, alertRect?.top || 0);
    const alertHeight = alertRect?.height || 0;
    const tabListHeight = tabList?.offsetHeight || 0;
    const buffer = 65;
    const available =
      viewportHeight - alertTop - alertHeight - tabListHeight - buffer;
    const maxH = `${Math.max(available, 100)}px`;

    // Apply directly to all tab panels and the single-view fallback
    disclosureRef.current
      .querySelectorAll('.tabs__panel, [data-json-scroll]')
      .forEach((el) => {
        el.style.maxHeight = maxH;
      });
  }, []);

  useEffect(() => {
    if (!isExpanded) return;

    // Measure after expansion animation settles
    const timer = setTimeout(updatePanelMaxHeight, 100);
    window.addEventListener('resize', updatePanelMaxHeight);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePanelMaxHeight);
    };
  }, [isExpanded, updatePanelMaxHeight]);

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

  // Lazy-load related object details when a tab is selected
  const handleTabChange = async (key) => {
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
            <Alert.Title className='flex w-full items-start justify-between'>
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
            </Alert.Title>
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
                'Navigate to an instance to enable most extension features'
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
      className='w-full'
    >
      <Disclosure.Heading>
        <Disclosure.Trigger className='w-full cursor-pointer'>
          {alertContent}
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content
        className={`card bg-surface p-0 ${isExpanded ? 'mt-1' : ''}`}
      >
        <Disclosure.Body className='card__content gap-1 p-0'>
          {tabs.length > 1 ? (
            <Tabs variant='secondary' onSelectionChange={handleTabChange}>
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
              {tabs.map((tab) => (
                <Tabs.Panel
                  key={tab.id}
                  id={tab.id}
                  className='overflow-y-auto overscroll-y-contain'
                >
                  {tab.isCurrentObject ? (
                    <MetadataJsonView
                      src={
                        currentContext?.domoObject?.metadata?.details ||
                        currentContext?.domoObject?.metadata
                      }
                    />
                  ) : tab.isFullContext ? (
                    <MetadataJsonView src={currentContext} />
                  ) : loadingTabs[tab.id] ? (
                    <div className='flex items-center justify-center py-4'>
                      <Spinner size='sm' />
                    </div>
                  ) : relatedCache[tab.id] ? (
                    <MetadataJsonView src={relatedCache[tab.id]} />
                  ) : (
                    <p className='py-2 text-center text-sm text-muted'>
                      Select this tab to load details
                    </p>
                  )}
                </Tabs.Panel>
              ))}
            </Tabs>
          ) : (
            <div
              data-json-scroll
              className='overflow-y-auto overscroll-y-contain'
            >
              <MetadataJsonView
                src={
                  currentContext?.domoObject?.metadata?.details ||
                  currentContext?.domoObject?.metadata
                }
              />
            </div>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
