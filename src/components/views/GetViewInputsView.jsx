import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getDatasetsForView } from '@/services/datasets';
import { getValidTabForInstance } from '@/utils/currentObject';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCompass from '@icons/compass.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { DataList } from './DataList';

export function GetViewInputsView({ currentContext = null, instance: viewInstance = null, onBackToDefault = null, onStatusUpdate = null }) {
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
      const data = await getSidepanelData(viewInstance);

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

      if (!datasets || !Array.isArray(datasets) || datasets.length === 0) {
        onStatusUpdate?.('No DataSets Found', 'No underlying datasets found in this view.', 'warning', 3000);
        onBackToDefault?.();
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
      onStatusUpdate?.('Refreshed', 'Dataset data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderSubtext = () => {
    const totalCount = items.length;
    if (totalCount === 0) return null;
    return `${totalCount} dataset${totalCount === 1 ? '' : 's'}`;
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
          <IconExclamationTriangle data-slot='alert-default-icon' />
        </Alert.Indicator>
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
      feature='DataSets Used in View for'
      featureIcon={<IconCompass />}
      headerActions={['openAll', 'reload', 'refresh']}
      isRefreshing={isRefreshing}
      itemLabel='dataset'
      items={items}
      objectId={viewData?.objectId}
      objectType='DATA_SOURCE'
      showActions={true}
      showCounts={true}
      subject={viewData?.objectName}
      subtext={renderSubtext()}
      viewType='getViewInputs'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}
