import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getCardDatasets, getCardsForObject } from '@/services/cards';
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
import IconDatabase from '@icons/database.svg?react';
import IconSync from '@icons/sync.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

// Page-type objects (a page, an App Studio page, or a worksheet page) get their
// datasets listed with the cards on that same page nested beneath each one.
const PAGE_TYPES = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'];

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

      // The page scope (a single page, App Studio page, or worksheet page, as
      // opposed to a whole app via long-press) is the one that nests each
      // dataset's on-page cards beneath it.
      const isPageScope = !data.appId && PAGE_TYPES.includes(objectType);

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
      } else if (isPageScope) {
        const tabId = await getValidTabForInstance(instance);
        const transformedItems = await buildPageDatasetCardGroups({
          datasets,
          objectType,
          origin,
          pageId: objectId,
          tabId
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

  const renderSubtext = () => {
    const totalCount = getTotalCount();
    if (totalCount === 0) return null;
    const datasetText = `${totalCount} dataset${totalCount === 1 ? '' : 's'}`;

    // Only the page scope nests cards under datasets, so only it gets the
    // "across N cards" clause. Count distinct cards: a card drawing from two
    // of the page's datasets is nested under both but is still one card.
    const isPageScope = !viewData?.appId && PAGE_TYPES.includes(viewData?.objectType);
    if (!isPageScope) return datasetText;

    const cardCount = countDistinctCards(items);
    return `${datasetText} across ${cardCount} card${cardCount === 1 ? '' : 's'}`;
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
      feature={`${viewData?.typeLabel} for`}
      featureIcon={<IconDatabase />}
      headerActions={['openAll', 'reload', 'refresh']}
      isRefreshing={isRefreshing}
      itemLabel='dataset'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subject={viewData?.objectName}
      subtext={renderSubtext()}
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
  { childTypeId: 'DATA_SOURCE', id: 'inputs_group', label: 'Input DataSets' },
  { childTypeId: 'DATA_SOURCE', id: 'outputs_group', label: 'Output DataSets' }
];

/**
 * Build the page-scope list: one row per dataset on the page, with the cards on
 * that same page that draw from it nested beneath. Datasets with no card on the
 * page still appear (they can back filters, variables, or other content), just
 * without children.
 *
 * The page's card list is fetched with each card's datasources attached, so the
 * card -> datasets relationship can be inverted locally into dataset -> cards
 * without a second request. A card that uses several datasets nests under each.
 *
 * @param {Object} params
 * @param {Array<{id: string, name: string}>} params.datasets - The page's datasets
 * @param {string} params.objectType - The page object type (PAGE | DATA_APP_VIEW | WORKSHEET_VIEW)
 * @param {string} params.origin - The base URL origin
 * @param {string} params.pageId - The page ID
 * @param {number|null} params.tabId - Target tab
 * @returns {Promise<DataListItem[]>}
 */
async function buildPageDatasetCardGroups({ datasets, objectType, origin, pageId, tabId }) {
  const cards = (await getCardsForObject({ objectId: pageId, objectType, parts: 'datasources', tabId })) || [];

  // Invert each card's datasources into dataset id -> cards on this page.
  const cardsByDataset = new Map();
  for (const card of cards) {
    for (const ds of card.datasources || []) {
      const dsId = ds.dataSourceId || ds.id || ds.datasetId;
      if (!dsId) continue;
      const key = String(dsId);
      if (!cardsByDataset.has(key)) cardsByDataset.set(key, []);
      cardsByDataset.get(key).push(card);
    }
  }

  return (datasets || []).map((ds) => {
    const id = ds.id || ds.datasetId || ds.dataSourceId;
    const name = ds.name || ds.datasetName || ds.dataSourceName;
    const dsObject = new DomoObject('DATA_SOURCE', id, origin, { name });

    const cardChildren = (cardsByDataset.get(String(id)) || [])
      .slice()
      .sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''))
      .map((c) => {
        const cardName = (c.title || c.name || '').trim() || `Card ${c.id}`;
        return DataListItem.fromDomoObject(new DomoObject('CARD', c.id, origin, { name: cardName }));
      });

    return DataListItem.fromDomoObject(dsObject, {
      children: cardChildren.length ? cardChildren : undefined,
      count: cardChildren.length,
      countLabel: cardChildren.length === 1 ? 'card' : 'cards'
    });
  });
}

/**
 * Count the distinct cards nested anywhere in a tree of dataset items, deduping
 * by id so a card that draws from several of the page's datasets (and is nested
 * under each) is only counted once.
 * @param {DataListItem[]} items
 * @returns {number}
 */
function countDistinctCards(items) {
  const ids = new Set();
  const walk = (list) => {
    for (const item of list || []) {
      if (item.typeId === 'CARD') ids.add(String(item.id));
      if (item.children?.length) walk(item.children);
    }
  };
  walk(items);
  return ids.size;
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
        childTypeId: 'DATA_SOURCE',
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
        childTypeId: 'DATA_SOURCE',
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
