import { Alert, Button, Card, CloseButton, Spinner } from '@heroui/react';
import { IconAlertTriangle, IconRefresh } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { DataListItem, DomoContext, DomoObject } from '@/models';
import {
  extractPageContentIds,
  getCardsForObject,
  getFormsForPage,
  getQueuesForPage
} from '@/services';
import { getValidTabForInstance, waitForCards } from '@/utils';

import { DataList } from './DataList';

export function GetCardsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [itemCounts, setItemCounts] = useState({
    cards: 0,
    forms: 0,
    queues: 0
  });
  const [viewData, setViewData] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadCardsData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCardsData = async (forceRefresh = false) => {
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

      if (!data || data.type !== 'getCards') {
        setError('No card data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const objectId = domoObject.id;
      const objectName =
        domoObject.metadata?.name || `${objectType} ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      const parentId = domoObject.parentId || null;

      // Extract widget IDs from metadata for refresh support
      const { formWidgetIds, queueWidgetIds } = extractPageContentIds(
        domoObject.metadata?.details
      );

      setViewData({
        formWidgetIds,
        instance,
        objectId,
        objectName,
        objectType,
        origin,
        parentId,
        queueWidgetIds
      });

      let cards = data.cards;
      let forms = data.forms || [];
      let queues = data.queues || [];

      if (!cards && !forceRefresh) {
        // No pre-fetched cards (popup handoff) -- fetch fresh
        if (objectType === 'DATAFLOW_TYPE') {
          const outputs = domoObject.metadata?.details?.outputs || [];
          if (outputs.length > 0) {
            const tabId = await getValidTabForInstance(instance);
            const result = await fetchCardsForOutputDatasets(outputs, tabId);
            data.outputDatasets = result.outputDatasets;
            cards = result.cards;
          }
        } else {
          const waitResult = await waitForCards(context);
          if (waitResult.success && waitResult.cards?.length) {
            cards = waitResult.cards;
            forms = waitResult.forms;
            queues = waitResult.queues;
          } else {
            const tabId = await getValidTabForInstance(instance);
            cards = await getCardsForObject({ objectId, objectType, tabId });
          }
        }
      }

      if (forceRefresh) {
        const tabId = await getValidTabForInstance(instance);
        if (objectType === 'DATAFLOW_TYPE') {
          const outputs =
            data.outputDatasets || domoObject.metadata?.details?.outputs || [];
          if (outputs.length > 0) {
            const result = await fetchCardsForOutputDatasets(outputs, tabId);
            data.outputDatasets = result.outputDatasets;
            cards = result.cards;
          }
        } else {
          const [refreshedCards, refreshedForms, refreshedQueues] =
            await Promise.all([
              getCardsForObject({ objectId, objectType, tabId }),
              formWidgetIds.length > 0
                ? getFormsForPage({ formWidgetIds, tabId })
                : Promise.resolve([]),
              queueWidgetIds.length > 0
                ? getQueuesForPage({ queueWidgetIds, tabId })
                : Promise.resolve([])
            ]);
          cards = refreshedCards;
          forms = refreshedForms;
          queues = refreshedQueues;
        }
      }

      if (!cards || !Array.isArray(cards)) {
        cards = [];
      }

      setItemCounts({
        cards: cards.length,
        forms: forms.length,
        queues: queues.length
      });

      const transformedItems =
        objectType === 'DATAFLOW_TYPE' && data.outputDatasets
          ? transformDataflowItems(data.outputDatasets, origin)
          : transformPageItems(
              cards,
              forms,
              queues,
              origin,
              objectType,
              objectId,
              parentId
            );
      setError(null);
      setItems(transformedItems);
    } catch (err) {
      console.error('Error loading cards:', err);
      setError(err.message || 'Failed to load cards');
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
      await loadCardsData(true);
      onStatusUpdate?.(
        'Refreshed',
        'Data updated successfully',
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

  const hasMultipleTypes =
    [itemCounts.cards > 0, itemCounts.forms > 0, itemCounts.queues > 0].filter(
      Boolean
    ).length > 1;

  const totalItems = itemCounts.cards + itemCounts.forms + itemCounts.queues;

  const renderTitle = () => {
    const titlePrefix = hasMultipleTypes ? 'Items for' : 'Cards for';
    return (
      <div className='flex flex-col gap-1'>
        <div className='line-clamp-2 min-w-0'>
          <span>{titlePrefix}</span>{' '}
          <span className='font-bold'>{viewData?.objectName}</span>
        </div>
        {totalItems > 0 && (
          <div className='flex flex-row items-center gap-1'>
            <span className='text-sm text-muted'>
              {hasMultipleTypes
                ? `${totalItems} item${totalItems === 1 ? '' : 's'}`
                : `${itemCounts.cards} card${itemCounts.cards === 1 ? '' : 's'}`}
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
          <p className='text-muted'>Loading cards...</p>
        </Card.Content>
      </Card>
    );
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadCardsData();
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
      closeLabel='Close Cards View'
      headerActions={['openAll', 'copy', 'refresh']}
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll']}
      itemLabel={hasMultipleTypes ? 'item' : 'card'}
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
 * Fetch cards for each output dataset of a dataflow.
 * @param {Array<{id?: string, dataSourceId?: string, name?: string, dataSourceName?: string}>} outputs
 * @param {number} tabId - Chrome tab ID
 * @returns {Promise<{outputDatasets: Array, cards: Array}>}
 */
async function fetchCardsForOutputDatasets(outputs, tabId) {
  const outputDatasets = [];
  const allCards = [];
  const seen = new Set();
  for (const output of outputs) {
    const dsId = output.id || output.dataSourceId;
    const dsName = output.name || output.dataSourceName || `Dataset ${dsId}`;
    const dsCards = await getCardsForObject({
      objectId: dsId,
      objectType: 'DATA_SOURCE',
      tabId
    });
    outputDatasets.push({ cards: dsCards, id: dsId, name: dsName });
    for (const card of dsCards) {
      if (!seen.has(card.id)) {
        seen.add(card.id);
        allCards.push(card);
      }
    }
  }
  return { cards: allCards, outputDatasets };
}

/**
 * Transform cards into DataListItem format
 * @param {Array} cards - Array of card objects
 * @param {string} origin - The base URL origin
 * @param {string} [objectType] - The parent object type (e.g., 'PAGE', 'DATA_APP_VIEW')
 * @param {string|number} [objectId] - The parent object ID (page or view ID)
 * @param {string|number} [parentId] - The grandparent ID (e.g., appId for DATA_APP_VIEW)
 * @returns {DataListItem[]}
 */
function transformCardsToItems(cards, origin, objectType, objectId, parentId) {
  return cards
    .sort((a, b) => {
      const nameA = (a.title || a.name || '').trim();
      const nameB = (b.title || b.name || '').trim();
      return nameA.localeCompare(nameB);
    })
    .map((card) => {
      const domoObject = new DomoObject('CARD', card.id, origin, {
        name: (card.title || card.name || '').trim()
      });
      // Override generic card URL with page-specific URL when on a page or app
      if (objectType === 'DATA_APP_VIEW' || objectType === 'WORKSHEET_VIEW') {
        domoObject.url = `${origin}/app-studio/${parentId}/pages/${objectId}/kpis/details/${card.id}`;
      } else if (objectType === 'PAGE') {
        domoObject.url = `${origin}/page/${objectId}/kpis/details/${card.id}`;
      }
      return DataListItem.fromDomoObject(domoObject);
    });
}

/**
 * Transform dataflow output datasets into grouped DataListItems.
 * Each output dataset becomes a navigable parent with its cards as children.
 * @param {Array<{id: string, name: string, cards: Array}>} outputDatasets
 * @param {string} origin - The base URL origin
 * @returns {DataListItem[]}
 */
function transformDataflowItems(outputDatasets, origin) {
  return outputDatasets
    .filter((ds) => ds.cards.length > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((ds) => {
      const cardChildren = ds.cards
        .sort((a, b) => {
          const nameA = (a.title || a.name || '').trim();
          const nameB = (b.title || b.name || '').trim();
          return nameA.localeCompare(nameB);
        })
        .map((card) => {
          const domoObject = new DomoObject('CARD', card.id, origin, {
            name: (card.title || card.name || '').trim()
          });
          return DataListItem.fromDomoObject(domoObject);
        });

      const dsDomoObject = new DomoObject('DATA_SOURCE', ds.id, origin, {
        name: ds.name
      });
      return DataListItem.fromDomoObject(dsDomoObject, {
        children: cardChildren,
        count: cardChildren.length,
        countLabel: 'cards'
      });
    });
}

/**
 * Transform cards, forms, and queues into DataListItems.
 * When only cards exist, returns a flat list. When forms or queues
 * are also present, groups items under disclosure headers.
 */
function transformPageItems(
  cards,
  forms,
  queues,
  origin,
  objectType,
  objectId,
  parentId
) {
  const hasMultipleTypes =
    [cards.length > 0, forms.length > 0, queues.length > 0].filter(Boolean)
      .length > 1;

  // Only cards: preserve flat list behavior
  if (!hasMultipleTypes && cards.length > 0) {
    return transformCardsToItems(cards, origin, objectType, objectId, parentId);
  }

  const items = [];

  if (cards.length > 0) {
    const cardItems = transformCardsToItems(
      cards,
      origin,
      objectType,
      objectId,
      parentId
    );
    items.push(
      DataListItem.createGroup({
        children: cardItems,
        id: 'cards_group',
        label: 'Cards',
        metadata: `${cards.length} card${cards.length !== 1 ? 's' : ''}`
      })
    );
  }

  if (forms.length > 0) {
    const formItems = forms
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
      .map((form) => {
        const domoObject = new DomoObject('ENIGMA_FORM', form.id, origin, {
          name: form.title
        });
        // Link to the workflow version that triggers this form
        if (form.workflowModelId && form.modelVersion) {
          domoObject.url = `${origin}/workflows/models/${form.workflowModelId}/${form.modelVersion}?_wfv=view`;
        }
        return DataListItem.fromDomoObject(domoObject);
      });
    items.push(
      DataListItem.createGroup({
        children: formItems,
        id: 'forms_group',
        label: 'Forms',
        metadata: `${forms.length} form${forms.length !== 1 ? 's' : ''}`
      })
    );
  }

  if (queues.length > 0) {
    const queueItems = queues
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((queue) => {
        const domoObject = new DomoObject('HOPPER_QUEUE', queue.id, origin, {
          name: queue.name
        });
        return DataListItem.fromDomoObject(domoObject);
      });
    items.push(
      DataListItem.createGroup({
        children: queueItems,
        id: 'queues_group',
        label: 'Queues',
        metadata: `${queues.length} queue${queues.length !== 1 ? 's' : ''}`
      })
    );
  }

  return items;
}
