import { useEffect, useState } from 'react';
import { Button, Separator, Spinner } from '@heroui/react';
import { DataList } from '@/components';
import {
  getDatasetsForPage,
  getDatasetsForDataflow,
  getDatasetsForView
} from '@/services';
import { DataListItem, DomoContext } from '@/models';
import { getValidTabForInstance } from '@/utils';

/**
 * Transform datasets into DataListItem format
 * @param {Array<{id: string, name: string}>} datasets - Array of dataset objects
 * @param {string} origin - The base URL origin
 * @returns {DataListItem[]}
 */
function transformDatasetsToItems(datasets, origin) {
  return datasets.map(
    (ds) =>
      new DataListItem({
        id: ds.id || ds.datasetId || ds.dataSourceId,
        label:
          ds.name ||
          ds.datasetName ||
          ds.dataSourceName ||
          `Dataset ${ds.id || ds.datasetId || ds.dataSourceId}`,
        url: `${origin}/datasources/${ds.id}/details/overview`,
        typeId: 'DATA_SOURCE',
        metadata: `ID: ${ds.id || ds.datasetId || ds.dataSourceId}`
      })
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
function transformDataflowDatasetsToItems({ inputs, outputs, origin }) {
  const items = [];

  if (inputs && inputs.length > 0) {
    const inputChildren = transformDatasetsToItems(inputs, origin);
    items.push(
      DataListItem.createGroup({
        id: 'inputs_group',
        label: 'Input DataSets',
        children: inputChildren,
        metadata: `${inputs.length} dataset${inputs.length !== 1 ? 's' : ''}`
      })
    );
  }

  if (outputs && outputs.length > 0) {
    const outputChildren = transformDatasetsToItems(outputs, origin);
    items.push(
      DataListItem.createGroup({
        id: 'outputs_group',
        label: 'Output DataSets',
        children: outputChildren,
        metadata: `${outputs.length} dataset${outputs.length !== 1 ? 's' : ''}`
      })
    );
  }

  return items;
}

export function GetDatasetsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [viewData, setViewData] = useState(null);

  // Load data on mount
  useEffect(() => {
    loadDatasetsData();
  }, []);

  const loadDatasetsData = async (forceRefresh = false) => {
    if (!forceRefresh) {
      setIsLoading(true);
      setShowSpinner(false);
    }
    setError(null);

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
        typeLabel = 'DataSets Used in View';
      }

      // Store view metadata
      setViewData({
        objectId,
        objectType,
        objectName,
        origin,
        instance,
        typeLabel
      });

      // Get datasets - either from stored data or fetch fresh
      let datasets = data.datasets;
      let dataflowInputs = data.dataflowInputs;
      let dataflowOutputs = data.dataflowOutputs;

      console.log('[GetDatasetsView] Loaded data from storage:', {
        type: data.type,
        datasets,
        dataflowInputs,
        dataflowOutputs,
        objectType
      });

      if (forceRefresh) {
        console.log('[GetDatasetsView] Forcing refresh...');
        const refreshResult = await fetchFreshDatasets({
          objectId,
          objectType,
          instance,
          details: domoObject.metadata?.details
        });
        console.log('[GetDatasetsView] Fresh data:', refreshResult);

        if (objectType === 'DATAFLOW_TYPE') {
          dataflowInputs = refreshResult.inputs;
          dataflowOutputs = refreshResult.outputs;
        } else {
          datasets = refreshResult;
        }
      }

      // Transform to items based on object type
      if (objectType === 'DATAFLOW_TYPE') {
        const transformedItems = transformDataflowDatasetsToItems({
          inputs: dataflowInputs,
          outputs: dataflowOutputs,
          origin
        });
        setItems(transformedItems);
      } else {
        console.log('[GetDatasetsView] Transforming datasets:', datasets);
        // Defensive check - ensure datasets is an array
        if (!datasets || !Array.isArray(datasets)) {
          console.error(
            '[GetDatasetsView] datasets is not an array:',
            datasets
          );
          setError('Invalid dataset data received. Please try again.');
          return;
        }
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
    objectId,
    objectType,
    instance,
    details
  }) => {
    const tabId = await getValidTabForInstance(instance);

    if (objectType === 'PAGE' || objectType === 'DATA_APP_VIEW') {
      return getDatasetsForPage({ pageId: objectId, tabId });
    } else if (objectType === 'DATAFLOW_TYPE') {
      return getDatasetsForDataflow({ details });
    } else if (objectType === 'DATA_SOURCE') {
      return getDatasetsForView({ datasetId: objectId, tabId });
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
      <div className='flex min-w-0 flex-col items-start justify-start'>
        <div className='truncate font-bold'>{viewData?.objectName}</div>
        <div className='shrink-0'>{viewData?.typeLabel}</div>
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

  if (isLoading && showSpinner) {
    return (
      <div className='flex items-center justify-center'>
        <div className='flex flex-col items-center gap-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading datasets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center p-4'>
        <div className='flex flex-col items-center gap-2 text-center'>
          <p className='text-danger'>{error}</p>
          <Button onPress={loadDatasetsData}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <DataList
      items={items}
      objectType={viewData?.objectType}
      objectId={viewData?.objectId}
      onStatusUpdate={onStatusUpdate}
      title={renderTitle()}
      headerActions={['openAll', 'copy', 'refresh']}
      onRefresh={handleRefresh}
      onClose={onBackToDefault}
      closeLabel={`Close ${viewData?.typeLabel} View`}
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll']}
      showActions={true}
      showCounts={true}
      itemLabel='dataset'
    />
  );
}
