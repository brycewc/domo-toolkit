import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getCardDatasets } from '@/services/cards';
import {
  getDatasetsForApp,
  getDatasetsForDataflow,
  getDatasetsForJupyterWorkspace,
  getDatasetsForPage,
  getDependentDatasets
} from '@/services/datasets';
import { getValidTabForInstance } from '@/utils/currentObject';
import { withCanonicalGroups } from '@/utils/dataListGroups';
import { getSidepanelData } from '@/utils/sidepanel';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { DataList } from './DataList';

export function GetDatasetsView({
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
      const data = await getSidepanelData(viewInstance);

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
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      // DataFlows and Jupyter workspaces both expose their datasets as separate
      // input and output sets, so they render as two grouped sections rather
      // than one flat list. Every branch below that differs for those types
      // keys off this flag.
      const isInputsOutputs = objectType === 'DATAFLOW_TYPE' || objectType === 'DATA_SCIENCE_NOTEBOOK';

      const objectName = data.appId
        ? domoObject.metadata?.parent?.name || `App ${data.appId}`
        : domoObject.metadata?.name || `${objectType} ${objectId}`;

      // Determine label based on object type and scope
      let typeLabel = 'DataSets';
      if (objectType === 'DATAFLOW_TYPE') {
        typeLabel = 'DataFlow DataSets';
      } else if (objectType === 'DATA_SOURCE') {
        typeLabel = 'Dependent Views';
      }

      // Store view metadata
      setViewData({
        appId: data.appId || null,
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
          appId: data.appId,
          details: domoObject.metadata?.details,
          instance,
          objectId,
          objectType
        });

        if (isInputsOutputs) {
          dataflowInputs = refreshResult.inputs;
          dataflowOutputs = refreshResult.outputs;
        } else {
          datasets = refreshResult;
        }
      }

      // Check for empty results
      const hasData = isInputsOutputs
        ? (dataflowInputs?.length || 0) + (dataflowOutputs?.length || 0) > 0
        : datasets?.length > 0;

      if (!hasData) {
        if (!mountedRef.current) return;
        const message = data.appId
          ? objectType === 'WORKSHEET_VIEW'
            ? 'No datasets found for this worksheet.'
            : 'No datasets found for this app.'
          : objectType === 'DATAFLOW_TYPE'
            ? 'This dataflow has no input or output datasets.'
            : objectType === 'DATA_SCIENCE_NOTEBOOK'
              ? 'This Jupyter workspace has no input or output datasets.'
              : objectType === 'DATA_SOURCE'
                ? 'No dependent dataset views found for this dataset.'
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
      if (isInputsOutputs) {
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
  const fetchFreshDatasets = async ({ appId, details, instance, objectId, objectType }) => {
    if (appId) {
      const tabId = await getValidTabForInstance(instance);
      return getDatasetsForApp({ appId, tabId });
    }
    if (objectType === 'CARD') {
      if (details?.datasources?.length > 0) {
        return details.datasources;
      }
      const tabId = await getValidTabForInstance(instance);
      return getCardDatasets({ cardId: objectId, tabId });
    }
    const tabId = await getValidTabForInstance(instance);
    if (objectType === 'PAGE' || objectType === 'DATA_APP_VIEW' || objectType === 'WORKSHEET_VIEW') {
      return getDatasetsForPage({ pageId: objectId, tabId });
    } else if (objectType === 'DATAFLOW_TYPE') {
      return getDatasetsForDataflow({ details });
    } else if (objectType === 'DATA_SCIENCE_NOTEBOOK') {
      return getDatasetsForJupyterWorkspace({ details, tabId });
    } else if (objectType === 'DATA_SOURCE') {
      return getDependentDatasets({ datasetId: objectId, tabId });
    }

    return [];
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadDatasetsData(true);
      onStatusUpdate?.('Refreshed', 'Dataset data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Calculate total count (including nested items for dataflows)
  const getTotalCount = () => {
    if (viewData?.objectType === 'DATAFLOW_TYPE' || viewData?.objectType === 'DATA_SCIENCE_NOTEBOOK') {
      return items.reduce((total, group) => total + (group.children?.length || 0), 0);
    }
    return items.length;
  };

  const renderTitle = () => `${viewData?.typeLabel} for **${viewData?.objectName}**`;

  const renderSubtext = () => {
    const totalCount = getTotalCount();
    if (totalCount === 0) return null;
    return `${totalCount} dataset${totalCount === 1 ? '' : 's'}`;
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
      headerActions={['openAll', 'copy', 'reload', 'refresh']}
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll', 'viewsExplorer', 'lineage']}
      itemLabel='dataset'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subtext={renderSubtext()}
      title={renderTitle()}
      viewType='getDatasets'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

// Canonical category set for dataflow/notebook inputs and outputs, in display
// order. A dataflow always conceptually has both sides, so an empty side still
// renders as a muted, non-expandable `(0)` row rather than vanishing.
const DATAFLOW_DATASET_GROUPS = [
  { id: 'inputs_group', label: 'Input DataSets' },
  { id: 'outputs_group', label: 'Output DataSets' }
];

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

  return withCanonicalGroups(items, DATAFLOW_DATASET_GROUPS);
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
