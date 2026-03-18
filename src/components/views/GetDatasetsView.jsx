import { Alert, Button, Card, CloseButton, Spinner } from '@heroui/react';
import { IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { DataListItem, DomoContext, DomoObject } from '@/models';
import {
  getCardDatasets,
  getDatasetsForDataflow,
  getDatasetsForPage,
  getDependentDatasets
} from '@/services';
import { getValidTabForInstance } from '@/utils';

import { DataList } from './DataList';

export function GetDatasetsView({
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
    loadDatasetsData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadDatasetsData = async (forceRefresh = false) => {
    if (!forceRefresh && !isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    // Delay showing spinner to avoid flash on quick loads
    const spinnerTimer = !forceRefresh
      ? setTimeout(() => {
          setShowSpinner(true);
        }, 200)
      : null;

    try {
      // Get the stored data from session storage
      const result = await chrome.storage.session.get(['sidepanelDataList']);
      const data = result.sidepanelDataList;

      if (!data || data.type !== 'getDatasets') {
        setError('No dataset data found. Please try again.');
        setIsLoading(false);
        return;
      }

      // Derive values from currentContext
      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const objectId = domoObject.id;
      const objectName =
        domoObject.metadata?.name || `${objectType} ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      // Determine label based on object type
      let typeLabel = 'DataSets';
      if (objectType === 'DATAFLOW_TYPE') {
        typeLabel = 'DataFlow DataSets';
      } else if (objectType === 'DATA_SOURCE') {
        typeLabel = 'Dependent DataSets';
      }

      // Store view metadata
      setViewData({
        instance,
        objectId,
        objectName,
        objectType,
        origin,
        typeLabel
      });

      // Get datasets - either from stored data or fetch fresh
      let datasets = data.datasets;
      let dataflowInputs = data.dataflowInputs;
      let dataflowOutputs = data.dataflowOutputs;

      if ((!datasets && !dataflowInputs && !dataflowOutputs) || forceRefresh) {
        const refreshResult = await fetchFreshDatasets({
          details: domoObject.metadata?.details,
          instance,
          objectId,
          objectType
        });

        if (objectType === 'DATAFLOW_TYPE') {
          dataflowInputs = refreshResult.inputs;
          dataflowOutputs = refreshResult.outputs;
        } else {
          datasets = refreshResult;
        }
      }

      // Check for empty results
      const hasData =
        objectType === 'DATAFLOW_TYPE'
          ? (dataflowInputs?.length || 0) + (dataflowOutputs?.length || 0) > 0
          : datasets?.length > 0;

      if (!hasData) {
        if (!mountedRef.current) return;
        const message =
          objectType === 'DATAFLOW_TYPE'
            ? 'This dataflow has no input or output datasets.'
            : objectType === 'DATA_SOURCE'
              ? 'No dependent datasets found for this dataset.'
              : objectType === 'CARD'
                ? 'No datasets found for this card.'
                : 'No datasets found for this page.';
        onStatusUpdate?.('No Datasets Found', message, 'warning');
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      // Transform to items based on object type
      setError(null);
      if (objectType === 'DATAFLOW_TYPE') {
        const transformedItems = transformDataflowDatasetsToItems({
          inputs: dataflowInputs,
          origin,
          outputs: dataflowOutputs
        });
        setItems(transformedItems);
      } else {
        const transformedItems = transformDatasetsToItems(datasets, origin);
        setItems(transformedItems);
      }
    } catch (err) {
      console.error('Error loading datasets:', err);
      setError(err.message || 'Failed to load datasets');
    } finally {
      if (spinnerTimer) clearTimeout(spinnerTimer);
      if (!forceRefresh) {
        setIsLoading(false);
        setShowSpinner(false);
      }
    }
  };

  /**
   * Fetch fresh datasets from API
   */
  const fetchFreshDatasets = async ({
    details,
    instance,
    objectId,
    objectType
  }) => {
    if (objectType === 'CARD') {
      if (details?.datasources?.length > 0) {
        return details.datasources;
      }
      const tabId = await getValidTabForInstance(instance);
      return getCardDatasets({ cardId: objectId, tabId });
    }
    const tabId = await getValidTabForInstance(instance);
    if (objectType === 'PAGE' || objectType === 'DATA_APP_VIEW') {
      return getDatasetsForPage({ pageId: objectId, tabId });
    } else if (objectType === 'DATAFLOW_TYPE') {
      return getDatasetsForDataflow({ details });
    } else if (objectType === 'DATA_SOURCE') {
      return getDependentDatasets({ datasetId: objectId, tabId });
    }

    return [];
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDatasetsData(true);
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

  // Calculate total count (including nested items for dataflows)
  const getTotalCount = () => {
    if (viewData?.objectType === 'DATAFLOW_TYPE') {
      return items.reduce(
        (total, group) => total + (group.children?.length || 0),
        0
      );
    }
    return items.length;
  };

  // Build the title section
  const renderTitle = () => {
    const totalCount = getTotalCount();

    return (
      <div className='flex flex-col gap-1'>
        <div className='line-clamp-2 min-w-0'>
          <span>{viewData?.typeLabel} for</span>{' '}
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
          <p className='text-muted'>Loading datasets...</p>
        </Card.Content>
      </Card>
    );
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadDatasetsData();
    setIsRetrying(false);
  };

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator />
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
      closeLabel={`Close ${viewData?.typeLabel} View`}
      headerActions={['openAll', 'copy', 'refresh']}
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll', 'lineage', 'viewsExplorer']}
      itemLabel='dataset'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      title={renderTitle()}
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

/**
 * Transform dataflow inputs/outputs into grouped DataListItems
 * @param {Object} params
 * @param {Array} params.inputs - Input datasets
 * @param {Array} params.outputs - Output datasets
 * @param {string} params.origin - The base URL origin
 * @returns {DataListItem[]}
 */
function transformDataflowDatasetsToItems({ inputs, origin, outputs }) {
  const items = [];

  if (inputs && inputs.length > 0) {
    const inputChildren = transformDatasetsToItems(inputs, origin);
    items.push(
      DataListItem.createGroup({
        children: inputChildren,
        id: 'inputs_group',
        label: 'Input DataSets',
        metadata: `${inputs.length} dataset${inputs.length !== 1 ? 's' : ''}`
      })
    );
  }

  if (outputs && outputs.length > 0) {
    const outputChildren = transformDatasetsToItems(outputs, origin);
    items.push(
      DataListItem.createGroup({
        children: outputChildren,
        id: 'outputs_group',
        label: 'Output DataSets',
        metadata: `${outputs.length} dataset${outputs.length !== 1 ? 's' : ''}`
      })
    );
  }

  return items;
}

/**
 * Transform datasets into DataListItem format
 * @param {Array<{id: string, name: string}>} datasets - Array of dataset objects
 * @param {string} origin - The base URL origin
 * @returns {DataListItem[]}
 */
function transformDatasetsToItems(datasets, origin) {
  return datasets.map((ds) => {
    const id = ds.id || ds.datasetId || ds.dataSourceId;
    const name = ds.name || ds.datasetName || ds.dataSourceName;
    const domoObject = new DomoObject('DATA_SOURCE', id, origin, { name });
    return DataListItem.fromDomoObject(domoObject);
  });
}
