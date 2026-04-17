import {
  Button,
  ButtonGroup,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  Link,
  ListBox,
  ListLayout,
  ScrollShadow,
  Separator,
  Tooltip,
  Virtualizer
} from '@heroui/react';
import {
  IconCheck,
  IconChevronDown,
  IconClipboard,
  IconLoader2,
  IconRefresh,
  IconUserUp,
  IconX
} from '@tabler/icons-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AnimatedCheck } from '@/components';
import { DomoContext, DomoObject } from '@/models';
import { TRANSFER_TYPES } from '@/services';
import { getSidepanelData, launchView } from '@/utils';

/**
 * Maps TRANSFER_TYPES keys to DomoObjectType IDs for URL construction.
 * Types mapped to null will render items without navigable links.
 */
const TYPE_KEY_TO_DOMO_TYPE = {
  accounts: 'ACCOUNT',
  aiModels: 'AI_MODEL',
  aiProjects: 'AI_PROJECT',
  alerts: 'ALERT',
  appDbCollections: 'MAGNUM_COLLECTION',
  approvals: 'APPROVAL',
  approvalTemplates: 'TEMPLATE',
  appStudioApps: 'DATA_APP',
  cards: 'CARD',
  codeEnginePackages: 'CODEENGINE_PACKAGE',
  customApps: 'APP',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE',
  filesets: 'FILESET',
  functions: 'BEAST_MODE_FORMULA',
  goals: null,
  groups: 'GROUP',
  jupyterWorkspaces: 'DATA_SCIENCE_NOTEBOOK',
  metrics: null,
  pages: 'PAGE',
  projectsAndTasks: null,
  repositories: 'REPOSITORY',
  subscriptions: null,
  taskCenterQueues: 'HOPPER_QUEUE',
  taskCenterTasks: null,
  workflows: 'WORKFLOW_MODEL'
};

const ITEM_HEIGHT = 24;
const MAX_VISIBLE_ITEMS = 12;

/**
 * Virtualized list for items inside an expanded disclosure.
 * Uses HeroUI ListBox + Virtualizer, capping the container at MAX_VISIBLE_ITEMS height.
 */
const VirtualizedItemList = memo(function VirtualizedItemList({
  items,
  onCopyId,
  origin,
  typeKey
}) {
  const [copiedId, setCopiedId] = useState(null);

  const containerHeight = Math.min(
    items.length * ITEM_HEIGHT,
    MAX_VISIBLE_ITEMS * ITEM_HEIGHT
  );

  return (
    <Virtualizer layout={ListLayout} layoutOptions={{ rowHeight: ITEM_HEIGHT }}>
      <ListBox
        aria-label='Owned objects'
        className='w-full overflow-x-hidden overflow-y-auto'
        items={items}
        selectionMode='none'
        style={{ height: containerHeight }}
      >
        {(item) => {
          const url = buildItemUrl(typeKey, item, origin);
          const displayName = item.name || item.id;

          return (
            <ListBox.Item
              className='min-h-0 cursor-default px-1 py-0'
              id={item.id}
              textValue={String(displayName)}
              title={item.name}
            >
              {url ? (
                <Link
                  className='truncate text-sm font-normal no-underline decoration-accent hover:text-accent hover:underline'
                  href={url}
                  rel='noopener noreferrer'
                  target='_blank'
                >
                  {displayName}
                </Link>
              ) : (
                <span className='truncate text-xs'>
                  {item.subType ? `[${item.subType}] ` : ''}
                  {displayName}
                </span>
              )}
              <div className='ms-auto shrink-0'>
                <Tooltip closeDelay={0} delay={400}>
                  <Button
                    isIconOnly
                    className='h-5 min-h-0 w-5 min-w-0'
                    size='sm'
                    variant='ghost'
                    onPress={() => {
                      setCopiedId(item.id);
                      setTimeout(() => setCopiedId(null), 1000);
                      onCopyId(item.id);
                    }}
                  >
                    {copiedId === item.id ? (
                      <AnimatedCheck size={12} stroke={1.5} />
                    ) : (
                      <IconClipboard size={12} stroke={1.5} />
                    )}
                  </Button>
                  <Tooltip.Content className='text-xs'>
                    {copiedId === item.id ? 'Copied!' : 'Copy ID'}
                  </Tooltip.Content>
                </Tooltip>
              </div>
            </ListBox.Item>
          );
        }}
      </ListBox>
    </Virtualizer>
  );
});

export function GetOwnedObjectsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState(null);
  const [origin, setOrigin] = useState('');
  const [tabId, setTabId] = useState(null);
  const [currentContext, setCurrentContext] = useState(null);
  const [typeResults, setTypeResults] = useState(() =>
    Object.fromEntries(
      TRANSFER_TYPES.map((t) => [
        t.key,
        { count: 0, error: null, items: [], status: 'idle' }
      ])
    )
  );
  const mountedRef = useRef(true);
  const rawOwnedRef = useRef({});

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async () => {
    try {
      const data = await getSidepanelData();

      if (!data || data.type !== 'getOwnedObjects') {
        onBackToDefault?.();
        return;
      }

      const context = data.currentContext
        ? DomoContext.fromJSON(data.currentContext)
        : null;

      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }

      const uid = context.domoObject?.id;
      const name =
        context.domoObject?.metadata?.name ||
        context.domoObject?.metadata?.displayName ||
        `User ${uid}`;
      const baseUrl = context.domoObject?.baseUrl || '';

      setUserId(uid);
      setUserName(name);
      setOrigin(baseUrl);
      setTabId(context.tabId);
      setCurrentContext(context);
      setIsLoading(false);

      if (uid) {
        fetchAllTypes(uid, context.tabId);
      }
    } catch (error) {
      console.error('[GetOwnedObjectsView] Error loading data:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to load context',
        'danger'
      );
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const fetchAllTypes = async (uid, tid) => {
    rawOwnedRef.current = {};
    setTypeResults(
      Object.fromEntries(
        TRANSFER_TYPES.map((t) => [
          t.key,
          { count: 0, error: null, items: [], status: 'loading' }
        ])
      )
    );

    const promises = TRANSFER_TYPES.map(async (type) => {
      try {
        const owned = await type.getOwned(uid, tid);
        if (!mountedRef.current) return;

        rawOwnedRef.current[type.key] = owned;

        const count = getItemCount(type.key, owned);
        const items = flattenItems(type.key, owned);

        setTypeResults((prev) => ({
          ...prev,
          [type.key]: { count, error: null, items, status: 'loaded' }
        }));
      } catch (error) {
        if (!mountedRef.current) return;
        setTypeResults((prev) => ({
          ...prev,
          [type.key]: {
            count: 0,
            error: error.message,
            items: [],
            status: 'error'
          }
        }));
      }
    });

    await Promise.allSettled(promises);
  };

  const handleRefresh = () => {
    if (userId) {
      fetchAllTypes(userId, tabId);
    }
  };

  const handleTransferHandoff = () => {
    launchView({
      currentContext,
      seededOwnedObjects: { ...rawOwnedRef.current },
      type: 'transferOwnership'
    });
  };

  const handleCopyId = useCallback(
    async (id) => {
      try {
        await navigator.clipboard.writeText(String(id));
        onStatusUpdate?.(
          'Copied',
          `ID **${id}** copied to clipboard`,
          'success'
        );
      } catch {
        onStatusUpdate?.('Error', 'Failed to copy to clipboard', 'danger');
      }
    },
    [onStatusUpdate]
  );

  const {
    errorCount,
    isFullyLoaded,
    loadedTypeCount,
    loadingCount,
    totalObjects
  } = useMemo(() => {
    const results = Object.values(typeResults);
    return {
      errorCount: results.filter((r) => r.status === 'error').length,
      isFullyLoaded: results.every((r) => r.status !== 'loading'),
      loadedTypeCount: results.filter(
        (r) => r.status === 'loaded' && r.count > 0
      ).length,
      loadingCount: results.filter((r) => r.status === 'loading').length,
      totalObjects: results.reduce((sum, r) => sum + r.count, 0)
    };
  }, [typeResults]);

  const { hasAnyTransferable, isUserSource } = useMemo(() => {
    const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
    const forbidden = new Set(
      TRANSFER_TYPES.filter(
        (t) => t.requiredAuthority && !userRights.includes(t.requiredAuthority)
      ).map((t) => t.key)
    );
    return {
      hasAnyTransferable: TRANSFER_TYPES.some(
        (t) => !forbidden.has(t.key) && (typeResults[t.key]?.count || 0) > 0
      ),
      isUserSource: currentContext?.domoObject?.typeId === 'USER'
    };
  }, [currentContext, typeResults]);

  const renderTypeRow = (type) => {
    const result = typeResults[type.key];

    // Loading
    if (result.status === 'loading' || result.status === 'idle') {
      return (
        <div
          className='flex items-center justify-between py-1.5'
          key={type.key}
        >
          <div className='flex items-center gap-2'>
            <IconLoader2
              className='shrink-0 animate-spin text-accent'
              size={18}
            />
            <span className='text-sm'>{type.label}</span>
          </div>
          <span className='shrink-0 text-xs text-muted'>Searching...</span>
        </div>
      );
    }

    // Error
    if (result.status === 'error') {
      return (
        <div
          className='flex items-center justify-between py-1.5'
          key={type.key}
        >
          <div className='flex items-center gap-2'>
            <IconX className='shrink-0 text-danger' size={18} />
            <span className='text-sm'>{type.label}</span>
          </div>
          <span className='shrink-0 text-xs text-danger'>Failed</span>
        </div>
      );
    }

    // Loaded with 0 items
    if (result.count === 0) {
      return (
        <div
          className='flex items-center justify-between py-1.5'
          key={type.key}
        >
          <div className='flex items-center gap-2'>
            <IconCheck className='shrink-0 text-muted' size={18} />
            <span className='text-sm text-muted'>{type.label}</span>
          </div>
          <div className='flex min-w-0 items-center gap-2'>
            <Chip size='sm' variant='soft'>
              0
            </Chip>
            <IconChevronDown className='text-surface' size={16} stroke={1.5} />
          </div>
        </div>
      );
    }

    // Loaded with items — expandable with virtualized list
    return (
      <Disclosure className='w-full' key={type.key}>
        <Disclosure.Heading className='w-full'>
          <Disclosure.Trigger className='w-full'>
            <div className='flex items-center justify-between py-1.5'>
              <div className='flex min-w-0 items-center gap-2'>
                <IconCheck className='shrink-0 text-success' size={18} />
                <span className='truncate text-sm'>{type.label}</span>
              </div>
              <div className='flex min-w-0 items-center gap-2'>
                <Chip color='accent' size='sm' variant='soft'>
                  {result.count}
                </Chip>
                <Disclosure.Indicator>
                  <IconChevronDown stroke={1.5} />
                </Disclosure.Indicator>
              </div>
            </div>
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body>
            <VirtualizedItemList
              items={result.items}
              origin={origin}
              typeKey={type.key}
              onCopyId={handleCopyId}
            />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    );
  };

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <IconLoader2 className='animate-spin text-accent' size={32} />
          <p className='text-sm text-muted'>Loading...</p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-2'>
        <Card.Title className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 pt-1'>
            <div className='flex flex-col gap-1'>
              <div className='line-clamp-2 min-w-0'>
                <span>Objects Owned by</span>{' '}
                <span className='font-bold'>{userName}</span>
              </div>
              <div className='shrink-0 text-xs text-muted'>
                {isFullyLoaded ? (
                  <>
                    <span className='font-medium text-foreground'>
                      {totalObjects}
                    </span>{' '}
                    object{totalObjects !== 1 ? 's' : ''} across{' '}
                    <span className='font-medium text-foreground'>
                      {loadedTypeCount}
                    </span>{' '}
                    type{loadedTypeCount !== 1 ? 's' : ''}
                    {errorCount > 0 && (
                      <span>
                        {' ('}
                        <span className='text-danger'>
                          {' '}
                          {errorCount} failed
                        </span>
                        {')'}
                      </span>
                    )}
                  </>
                ) : (
                  <>
                    Searching... ({TRANSFER_TYPES.length - loadingCount}/
                    {TRANSFER_TYPES.length} types)
                  </>
                )}
              </div>
            </div>
          </div>
          <ButtonGroup>
            {isUserSource && (
              <Tooltip closeDelay={0} delay={400}>
                <Button
                  isIconOnly
                  isDisabled={!isFullyLoaded || !hasAnyTransferable}
                  size='sm'
                  variant='ghost'
                  onPress={handleTransferHandoff}
                >
                  <IconUserUp stroke={1.5} />
                </Button>
                <Tooltip.Content className='text-xs'>
                  Transfer these to&hellip;
                </Tooltip.Content>
              </Tooltip>
            )}
            <Tooltip closeDelay={0} delay={400}>
              <Button
                isIconOnly
                isDisabled={!isFullyLoaded}
                size='sm'
                variant='ghost'
                onPress={handleRefresh}
              >
                <IconRefresh stroke={1.5} />
              </Button>
              <Tooltip.Content className='text-xs'>Refresh</Tooltip.Content>
            </Tooltip>
            {onBackToDefault && (
              <Tooltip closeDelay={0} delay={400}>
                <Button
                  isIconOnly
                  size='sm'
                  variant='ghost'
                  onPress={onBackToDefault}
                >
                  <IconX stroke={1.5} />
                </Button>
                <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
              </Tooltip>
            )}
          </ButtonGroup>
        </Card.Title>
      </Card.Header>

      <Separator />

      {/* Type list */}
      <ScrollShadow
        hideScrollBar
        className='min-h-0 w-full flex-1 overflow-y-auto px-1'
        offset={5}
        orientation='vertical'
      >
        <DisclosureGroup>
          {TRANSFER_TYPES.map((type) => renderTypeRow(type))}
        </DisclosureGroup>
      </ScrollShadow>
    </Card>
  );
}

function buildItemUrl(typeKey, item, origin) {
  const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
  if (!domoTypeId) return null;

  try {
    const obj = new DomoObject(
      domoTypeId,
      item.id,
      origin,
      { name: item.name },
      null,
      item.queueId || item.parentId || null
    );
    return obj.url;
  } catch {
    return null;
  }
}

function flattenItems(typeKey, owned) {
  if (typeKey === 'projectsAndTasks') {
    return [
      ...(owned.projects || []).map((p) => ({
        ...p,
        subType: 'Project'
      })),
      ...(owned.tasks || []).map((t) => ({
        ...t,
        subType: 'Task'
      }))
    ];
  }
  return owned;
}

function getItemCount(typeKey, owned) {
  if (typeKey === 'projectsAndTasks') {
    return (owned.projects?.length || 0) + (owned.tasks?.length || 0);
  }
  return owned.length;
}
