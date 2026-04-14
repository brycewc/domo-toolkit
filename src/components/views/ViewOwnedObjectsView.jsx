import {
  Badge,
  Button,
  Card,
  Disclosure,
  DisclosureGroup,
  Link,
  ScrollShadow,
  Separator,
  Tooltip
} from '@heroui/react';
import {
  IconCheck,
  IconClipboard,
  IconLoader2,
  IconRefresh,
  IconX
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { DomoContext, DomoObject } from '@/models';
import { TRANSFER_TYPES } from '@/services';
import { getSidepanelData } from '@/utils';

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

export function ViewOwnedObjectsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState(null);
  const [origin, setOrigin] = useState('');
  const [tabId, setTabId] = useState(null);
  const [typeResults, setTypeResults] = useState(() =>
    Object.fromEntries(
      TRANSFER_TYPES.map((t) => [
        t.key,
        { count: 0, error: null, items: [], status: 'idle' }
      ])
    )
  );
  const mountedRef = useRef(true);

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

      if (!data || data.type !== 'viewOwnedObjects') {
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
      setIsLoading(false);

      if (uid) {
        fetchAllTypes(uid, context.tabId);
      }
    } catch (error) {
      console.error('[ViewOwnedObjectsView] Error loading data:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to load context',
        'danger'
      );
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const fetchAllTypes = async (uid, tid) => {
    // Reset all to loading
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

  const handleCopyId = async (id) => {
    try {
      await navigator.clipboard.writeText(String(id));
      onStatusUpdate?.('Copied', `ID ${id} copied to clipboard`, 'success');
    } catch {
      onStatusUpdate?.('Error', 'Failed to copy to clipboard', 'danger');
    }
  };

  const totalObjects = Object.values(typeResults).reduce(
    (sum, r) => sum + r.count,
    0
  );
  const loadedTypeCount = Object.values(typeResults).filter(
    (r) => r.status === 'loaded' && r.count > 0
  ).length;
  const loadingCount = Object.values(typeResults).filter(
    (r) => r.status === 'loading'
  ).length;
  const errorCount = Object.values(typeResults).filter(
    (r) => r.status === 'error'
  ).length;
  const isFullyLoaded = loadingCount === 0;

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
          <Badge size='sm' variant='flat'>
            0
          </Badge>
        </div>
      );
    }

    // Loaded with items — expandable
    return (
      <Disclosure key={type.key}>
        <div className='flex items-center justify-between py-1.5'>
          <div className='flex min-w-0 items-center gap-2'>
            <IconCheck className='shrink-0 text-success' size={18} />
            <span className='truncate text-sm'>{type.label}</span>
          </div>
          <Disclosure.Heading>
            <Button
              className='h-auto min-w-0 gap-1 px-1 py-0 text-xs'
              slot='trigger'
              variant='ghost'
            >
              <Badge color='primary' size='sm' variant='flat'>
                {result.count}
              </Badge>
              <Disclosure.Indicator />
            </Button>
          </Disclosure.Heading>
        </div>
        <Disclosure.Content>
          <Disclosure.Body className='pb-2 pl-7 pt-0'>
            <ul className='list-none space-y-0.5'>
              {result.items.map((item, i) => {
                const url = buildItemUrl(type.key, item, origin);
                return (
                  <li
                    className='flex items-center justify-between gap-1'
                    key={item.id ?? i}
                  >
                    <div className='min-w-0 flex-1'>
                      {url ? (
                        <Link
                          className='block truncate text-xs'
                          href={url}
                          rel='noopener noreferrer'
                          target='_blank'
                        >
                          {item.name || item.id}
                        </Link>
                      ) : (
                        <span className='block truncate text-xs'>
                          {item.subType ? `[${item.subType}] ` : ''}
                          {item.name || item.id}
                        </span>
                      )}
                    </div>
                    <Tooltip closeDelay={0} delay={400}>
                      <Button
                        isIconOnly
                        className='h-5 min-h-0 w-5 min-w-0'
                        size='sm'
                        variant='ghost'
                        onPress={() => handleCopyId(item.id)}
                      >
                        <IconClipboard size={12} />
                      </Button>
                      <Tooltip.Content className='text-xs'>
                        Copy ID
                      </Tooltip.Content>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
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
            <div className='truncate text-base font-semibold'>
              Owned Objects
            </div>
            <div className='truncate text-xs text-muted'>{userName}</div>
          </div>
          <div className='flex items-center gap-1'>
            <Tooltip closeDelay={0} delay={400}>
              <Button
                isIconOnly
                isDisabled={!isFullyLoaded}
                size='sm'
                variant='ghost'
                onPress={handleRefresh}
              >
                <IconRefresh size={16} stroke={1.5} />
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
          </div>
        </Card.Title>
        <Separator />
      </Card.Header>

      {/* Summary */}
      <div className='shrink-0 px-1 py-1 text-xs text-muted'>
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
              <span className='text-danger'>
                {' '}
                ({errorCount} failed)
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
      <Separator />

      {/* Type list */}
      <ScrollShadow
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto px-1'
        offset={5}
        orientation='vertical'
      >
        <DisclosureGroup allowsMultipleExpanded>
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
