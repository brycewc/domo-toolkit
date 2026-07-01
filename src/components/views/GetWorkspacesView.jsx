import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getWorkspacesForEntity, workspaceEntityTypeFor } from '@/services/workspaces';
import { getValidTabForInstance } from '@/utils/currentObject';
import { getSidepanelData } from '@/utils/sidepanel';
import IconSync from '@icons/sync.svg?react';
import IconWorkspace from '@icons/workspace.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

// App pages and worksheet views carry their Workspace membership on the parent
// app/worksheet, so those types are looked up by parentId (see workspaces.js).
const PARENT_SCOPED_TYPES = ['DATA_APP_VIEW', 'WORKSHEET_VIEW'];

export function GetWorkspacesView({
  currentContext = null,
  instance: viewInstance = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [viewData, setViewData] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadWorkspacesData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadWorkspacesData = async (forceRefresh = false) => {
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

      if (!data || data.type !== 'getWorkspaces') {
        setError('No workspace data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      const entityType = workspaceEntityTypeFor(objectType);
      const isParentScoped = PARENT_SCOPED_TYPES.includes(objectType);
      const entityId = isParentScoped ? domoObject.parentId : domoObject.id;

      if (!entityType || entityId == null) {
        setError(
          isParentScoped
            ? 'Could not determine the parent app or worksheet for this page.'
            : 'This object type is not supported for workspaces.'
        );
        setIsLoading(false);
        return;
      }

      const subjectLabel = isParentScoped
        ? entityType === 'DATA_APP'
          ? 'app'
          : 'worksheet'
        : (domoObject.typeName || 'object').toLowerCase();

      const objectName = isParentScoped
        ? domoObject.metadata?.parent?.name || `${subjectLabel} ${entityId}`
        : domoObject.metadata?.name || `${objectType} ${entityId}`;

      setViewData({
        instance,
        objectId: domoObject.id,
        objectName,
        objectType
      });

      const tabId = await getValidTabForInstance(instance);
      const workspaces = await getWorkspacesForEntity({ entityId, entityType, tabId });

      if (!Array.isArray(workspaces) || workspaces.length === 0) {
        if (!mountedRef.current) return;
        onStatusUpdate?.('No Workspaces Found', `This ${subjectLabel} has not been added to any workspaces.`, 'warning');
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      setError(null);
      setItems(transformWorkspacesToItems(workspaces, origin));
    } catch (err) {
      console.error('Error loading workspaces:', err);
      setError(err.message || 'Failed to load workspaces');
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
      await loadWorkspacesData(true);
      onStatusUpdate?.('Refreshed', 'Workspace data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadWorkspacesData();
    setIsRetrying(false);
  };

  const renderSubtext = () => {
    if (items.length === 0) return null;
    return `${items.length} workspace${items.length === 1 ? '' : 's'}`;
  };

  if (isLoading) {
    if (!showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading workspaces...</p>
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
      feature='Workspaces for'
      featureIcon={<IconWorkspace />}
      headerActions={['openAll', 'reload', 'refresh']}
      isRefreshing={isRefreshing}
      itemLabel='workspace'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subject={viewData?.objectName}
      subtext={renderSubtext()}
      viewType='getWorkspaces'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

/**
 * Transform raw workspace objects into navigable DataListItems. DataList sorts
 * rows by label itself, so no ordering is applied here.
 * @param {Array<{guid: string, name: string}>} workspaces
 * @param {string} origin - The instance origin (https://<instance>.domo.com)
 * @returns {DataListItem[]}
 */
function transformWorkspacesToItems(workspaces, origin) {
  return workspaces.map((ws) => {
    const id = ws.guid || ws.id;
    const name = ws.name || `Workspace ${id}`;
    return DataListItem.fromDomoObject(new DomoObject('WORKSPACE', id, origin, { name }));
  });
}
