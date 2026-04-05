import { Alert, Button, Card, CloseButton, Spinner } from '@heroui/react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { DataListItem, DomoContext, DomoObject } from '@/models';
import { getDatasetsForView } from '@/services';
import { getValidTabForInstance } from '@/utils';

import { DataList } from './DataList';

export function GetViewInputsView({
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
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async (forceRefresh = false) => {
    if (!forceRefresh && !isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    const spinnerTimer = !forceRefresh
      ? setTimeout(() => {
          setShowSpinner(true);
        }, 200)
      : null;

    try {
      const result = await chrome.storage.session.get(['sidepanelDataList']);
      const data = result.sidepanelDataList;

      if (!data || data.type !== 'getViewInputs') {
        setError('No dataset data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectId = domoObject.id;
      const objectName = domoObject.metadata?.name || `DataSet ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      setViewData({
        instance,
        objectId,
        objectName,
        origin
      });

      let datasets = data.datasets;

      if (!datasets || forceRefresh) {
        const tabId = await getValidTabForInstance(instance);
        datasets = await getDatasetsForView({ datasetId: objectId, tabId });
      }

      setError(null);

      if (!datasets || !Array.isArray(datasets)) {
        setError('Invalid dataset data received. Please try again.');
        return;
      }

      const transformedItems = datasets.map((ds) => {
        const id = ds.id || ds.datasetId || ds.dataSourceId;
        const name = ds.name || ds.datasetName || ds.dataSourceName;
        const domoObj = new DomoObject('DATA_SOURCE', id, origin, { name });
        return DataListItem.fromDomoObject(domoObj);
      });
      setItems(transformedItems);
    } catch (err) {
      console.error('Error loading datasets used in view:', err);
      setError(err.message || 'Failed to load datasets used in view');
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
      await loadData(true);
      onStatusUpdate?.(
        'Refreshed',
        'Dataset data updated successfully',
        'success',
        2000
      );
    } catch (err) {
      onStatusUpdate?.(
        'Refresh Failed',
        err.message || 'Failed to refresh data',
        'danger',
        3000
      );
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderTitle = () => {
    const totalCount = items.length;

    return (
      <div className='flex flex-col gap-1'>
        <div className='line-clamp-2 min-w-0'>
          <span>DataSets Used in View for</span>{' '}
          <span className='font-bold'>{viewData?.objectName}</span>
        </div>
        {totalCount > 0 && (
          <div className='flex flex-row items-center gap-1'>
            <span className='text-sm text-muted'>
              {totalCount} dataset{totalCount === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    if (!showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading datasets used in view...</p>
        </Card.Content>
      </Card>
    );
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadData();
    setIsRetrying(false);
  };

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator>
          <IconAlertTriangle data-slot='alert-default-icon' />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button isPending={isRetrying} size='sm' onPress={handleRetry}>
              {isRetrying ? (
                <Spinner color='currentColor' size='sm' />
              ) : (
                <IconRefresh stroke={1.5} />
              )}
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton
          className='rounded-full'
          variant='ghost'
          onPress={() => onBackToDefault?.()}
        />
      </Alert>
    );
  }

  return (
    <DataList
      closeLabel='Close DataSets Used in View'
      headerActions={['openAll', 'copy', 'refresh']}
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll', 'viewsExplorer']}
      itemLabel='dataset'
      items={items}
      objectId={viewData?.objectId}
      objectType='DATA_SOURCE'
      showActions={true}
      showCounts={true}
      title={renderTitle()}
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}
