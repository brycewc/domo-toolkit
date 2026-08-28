import { Button, Card, Spinner } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { CloseButton } from '@/components/CloseButton';
import { useViewReady } from '@/hooks/useViewReady';
import { DomoContext } from '@/models/DomoContext';
import { getCodeEngineUsage } from '@/services/codeEngine';
import { fetchUserDisplayNames } from '@/services/users';
import { getWorkflowVersions } from '@/services/workflows';
import { buildUsageItems, USAGE_NOUNS } from '@/utils/codeEngineUsage';
import { getValidTabForInstance } from '@/utils/currentObject';
import { soleExpandedGroupIds } from '@/utils/dataListGroups';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheckCircleOutline from '@icons/check-circle-outline.svg?react';
import IconContentSearch from '@icons/content-search.svg?react';
import IconFunnel from '@icons/funnel.svg?react';
import IconSync from '@icons/sync.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

export function GetUsageView({
  currentContext = null,
  instance: viewInstance = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [usage, setUsage] = useState(null);
  const [viewData, setViewData] = useState(null);
  const [filterToCurrentVersion, setFilterToCurrentVersion] = useState(false);
  const [activeOnly, setActiveOnly] = useState(false);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadUsageData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const currentVersion = viewData?.currentVersion ?? null;
  const activeVersionFilter = filterToCurrentVersion ? currentVersion : null;

  const { counts, hidden, items } = useMemo(
    () =>
      usage
        ? buildUsageItems({ ...usage, activeOnly, filterToVersion: activeVersionFilter, origin: viewData?.origin })
        : { counts: {}, hidden: {}, items: [] },
    [activeOnly, activeVersionFilter, usage, viewData?.origin]
  );

  const loadUsageData = async (forceRefresh = false) => {
    if (!forceRefresh && !isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    // Delay showing the spinner to avoid a flash on quick loads.
    const spinnerTimer = !forceRefresh
      ? setTimeout(() => {
          setShowSpinner(true);
        }, 200)
      : null;

    try {
      const data = await getSidepanelData(viewInstance);

      if (!data || data.type !== 'getUsage') {
        setError('No usage data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const instance = context.instance;
      const origin = context.origin;

      const isVersion = objectType === 'CODEENGINE_PACKAGE_VERSION';
      const packageId = isVersion ? domoObject.parentId : domoObject.id;

      if (!packageId) {
        setError('Could not determine the Code Engine package for this object.');
        setIsLoading(false);
        return;
      }

      const packageName =
        (isVersion ? domoObject.metadata?.parent?.name : domoObject.metadata?.name) || `Package ${packageId}`;

      setViewData({
        currentVersion: isVersion ? domoObject.id : null,
        instance,
        objectId: domoObject.id,
        objectName: packageName,
        objectType,
        origin
      });

      const tabId = await getValidTabForInstance(instance);
      const [designs, instances, workflows] = await Promise.all([
        getCodeEngineUsage({ kind: 'designs', packageId, tabId }),
        getCodeEngineUsage({ kind: 'instances', packageId, tabId }),
        getCodeEngineUsage({ kind: 'workflows', packageId, tabId })
      ]);

      const nothingFound = [designs, instances, workflows].every((result) => !result.totalCount && !result.error);
      if (nothingFound) {
        if (!mountedRef.current) return;
        onStatusUpdate?.('No Usage Found', 'No workflows or custom apps use this package.', 'warning', 3000);
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      const [activeByModel, ownerNames] = await Promise.all([
        fetchActiveWorkflowVersions(workflows.items, tabId),
        fetchOwnerNames([designs, instances, workflows], tabId)
      ]);

      if (!mountedRef.current) return;
      setError(null);
      setUsage({ activeByModel, designs, instances, ownerNames, workflows });
    } catch (err) {
      console.error('Error loading Code Engine usage:', err);
      setError(err.message || 'Failed to load usage');
    } finally {
      if (spinnerTimer) clearTimeout(spinnerTimer);
      if (!forceRefresh) {
        setIsLoading(false);
        setShowSpinner(false);
      }
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadUsageData(true);
      onStatusUpdate?.('Refreshed', 'Usage data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadUsageData();
    setIsRetrying(false);
  };

  // The active filter only means anything when there are workflow versions to
  // judge; designs and app instances have no deployment state at all.
  const hasWorkflowRows = usage?.workflows?.items?.some((item) => item.entityId) ?? false;
  const customHeaderActions = [
    ...(hasWorkflowRows
      ? [
          {
            ariaLabel: 'Filter to active workflow versions',
            icon: <IconCheckCircleOutline />,
            isActive: activeOnly,
            key: 'activeOnly',
            onPress: () => setActiveOnly((on) => !on),
            tooltipText: activeOnly ? 'Click to show every workflow version' : 'Click to show only active workflow versions'
          }
        ]
      : []),
    ...(currentVersion
      ? [
          {
            ariaLabel: 'Filter to the current package version',
            icon: <IconFunnel />,
            isActive: filterToCurrentVersion,
            key: 'versionFilter',
            onPress: () => setFilterToCurrentVersion((on) => !on),
            tooltipText: filterToCurrentVersion
              ? 'Click to show every package version'
              : `Click to show only package version ${currentVersion}`
          }
        ]
      : [])
  ];

  const renderSubtext = () => {
    const parts = ['workflows', 'designs', 'instances']
      .map((key) => pluralize(counts[key], USAGE_NOUNS[key]))
      .filter(Boolean);
    const summary = parts.join(', ');
    const hiddenTotal = Object.values(hidden).reduce((total, n) => total + n, 0);
    const hiddenText = activeVersionFilter ? `${hiddenTotal} you can't see on any version` : `${hiddenTotal} you can't see`;
    const segments = [summary || null, hiddenTotal ? hiddenText : null];
    if (activeOnly) segments.push('active only');
    if (currentVersion) segments.push(activeVersionFilter ? `version ${activeVersionFilter}` : 'all versions');
    return segments.filter(Boolean).join(' · ') || null;
  };

  if (isLoading || holdContent) {
    if (isLoading && !showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading usage...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <AlertStatusIcon />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button isPending={isRetrying} size='sm' onPress={handleRetry}>
              {isRetrying ? <Spinner color='currentColor' size='sm' /> : <IconSync />}
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton className='rounded-full' variant='ghost' onPress={() => onBackToDefault?.()} />
      </Alert>
    );
  }

  return (
    <DataList
      currentContext={currentContext}
      customHeaderActions={customHeaderActions}
      defaultExpandedIds={soleExpandedGroupIds(items)}
      feature='Usage of'
      featureIcon={<IconContentSearch />}
      headerActions={['openAll', 'reload', 'refresh']}
      isRefreshing={isRefreshing}
      itemLabel='object'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subject={viewData?.objectName}
      subtext={renderSubtext()}
      viewType='getUsage'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

/**
 * Map each referenced workflow model to the set of its versions that are live.
 * A model whose lookup fails is omitted, which callers read as "unknown".
 * @param {Array<Object>} workflowItems - Raw items from the workflow usage endpoint
 * @param {number|null} tabId
 * @returns {Promise<Map<string, Set<string>>>}
 */
async function fetchActiveWorkflowVersions(workflowItems, tabId) {
  const modelIds = [...new Set(workflowItems.map((item) => item.entityId).filter(Boolean))];
  const entries = await Promise.all(
    modelIds.map((modelId) =>
      getWorkflowVersions(modelId, tabId)
        .then((versions) => [modelId, new Set(versions.filter((v) => v.active).map((v) => String(v.version)))])
        .catch(() => null)
    )
  );
  return new Map(entries.filter(Boolean));
}

/**
 * Resolve every distinct owner id across the usage results to a display name.
 * @param {Array<{items: Array<Object>}>} results
 * @param {number|null} tabId
 * @returns {Promise<Object<string, string>>}
 */
async function fetchOwnerNames(results, tabId) {
  const ownerIds = [
    ...new Set(results.flatMap((result) => result.items.map((item) => item.owner)).filter((id) => id != null))
  ];
  if (ownerIds.length === 0) return {};
  return fetchUserDisplayNames(ownerIds, tabId).catch(() => ({}));
}

/**
 * `N thing` / `N things`, or null at zero so callers can drop the segment.
 * @param {number} count
 * @param {string} noun
 * @returns {string|null}
 */
function pluralize(count, noun) {
  if (!count) return null;
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
