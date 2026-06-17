import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { extractPageContentIds, getFormsForPage, getQueuesForPage } from '@/services/appStudio';
import { getCardsForObject, getCardsForParent } from '@/services/cards';
import { waitForCards } from '@/utils/cardHelpers';
import { getValidTabForInstance } from '@/utils/currentObject';
import { withCanonicalGroups } from '@/utils/dataListGroups';
import { getSidepanelData } from '@/utils/sidepanel';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { DataList } from './DataList';

export function GetCardsView({ currentContext = null, instance: viewInstance = null, onBackToDefault = null, onStatusUpdate = null }) {
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
      const data = await getSidepanelData(viewInstance);

      if (!data || data.type !== 'getCards') {
        setError('No card data found. Please try again.');
        setIsLoading(false);
        return;
      }

      if (data.scope === 'parent') {
        await loadParentScopeData(data);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const objectId = domoObject.id;
      const objectName = domoObject.metadata?.name || `${objectType} ${objectId}`;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;

      const parentId = domoObject.parentId || null;

      // Extract widget IDs from metadata for refresh support
      const { formWidgetIds, queueWidgetIds } = extractPageContentIds(domoObject.metadata?.details);

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
          const outputs = data.outputDatasets || domoObject.metadata?.details?.outputs || [];
          if (outputs.length > 0) {
            const result = await fetchCardsForOutputDatasets(outputs, tabId);
            data.outputDatasets = result.outputDatasets;
            cards = result.cards;
          }
        } else {
          const [refreshedCards, refreshedForms, refreshedQueues] = await Promise.all([
            getCardsForObject({ objectId, objectType, tabId }),
            formWidgetIds.length > 0 ? getFormsForPage({ formWidgetIds, tabId }) : Promise.resolve([]),
            queueWidgetIds.length > 0 ? getQueuesForPage({ queueWidgetIds, tabId }) : Promise.resolve([])
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

      if (cards.length === 0 && forms.length === 0 && queues.length === 0) {
        const typeName = domoObject.typeName?.toLowerCase() || 'object';
        const hasFormsAndQueues = ['DATA_APP_VIEW', 'PAGE', 'REPORT_BUILDER_VIEW', 'WORKSHEET_VIEW'].includes(objectType);
        onStatusUpdate?.(
          hasFormsAndQueues ? 'No Items Found' : 'No Cards Found',
          hasFormsAndQueues
            ? `No cards, forms, or queues found on this ${typeName}.`
            : `No cards found on this ${typeName}.`,
          'warning',
          3000
        );
        onBackToDefault?.();
        return;
      }

      const transformedItems =
        objectType === 'DATAFLOW_TYPE' && data.outputDatasets
          ? transformDataflowItems(data.outputDatasets, origin)
          : transformPageItems(cards, forms, queues, origin, objectType, objectId, parentId);
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

  const loadParentScopeData = async (data) => {
    const context = DomoContext.fromJSON(data.currentContext);
    const childTypeId = context.domoObject.typeId;
    const parentTypeId = childTypeId === 'WORKSHEET_VIEW' ? 'WORKSHEET' : 'DATA_APP';
    const parentId = data.parentId || context.domoObject.parentId;
    const instance = context.instance;
    const origin = `https://${instance}.domo.com`;

    if (!parentId) {
      setError('Could not determine parent ID.');
      return;
    }

    const tabId = await getValidTabForInstance(instance);
    const { parentName, viewGroups } = await getCardsForParent({
      parentId,
      tabId
    });

    const totalCards = viewGroups.reduce((s, v) => s + v.cards.length, 0);
    const totalForms = viewGroups.reduce((s, v) => s + v.forms.length, 0);
    const totalQueues = viewGroups.reduce((s, v) => s + v.queues.length, 0);

    setViewData({
      instance,
      isParentScope: true,
      objectId: parentId,
      objectName: parentName,
      objectType: parentTypeId,
      origin,
      parentId: null,
      viewCount: viewGroups.length
    });

    setItemCounts({
      cards: totalCards,
      forms: totalForms,
      queues: totalQueues
    });

    if (viewGroups.length === 0) {
      const parentLabel = parentTypeId === 'WORKSHEET' ? 'worksheet' : 'app';
      onStatusUpdate?.(
        'No Items Found',
        `No cards, forms, or queues found across any view on this ${parentLabel}.`,
        'warning',
        3000
      );
      onBackToDefault?.();
      return;
    }

    const transformedItems = transformParentScopeItems(viewGroups, origin, parentId, childTypeId);
    setError(null);
    setItems(transformedItems);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadCardsData(true);
      onStatusUpdate?.('Refreshed', 'Data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const hasMultipleTypes = [itemCounts.cards > 0, itemCounts.forms > 0, itemCounts.queues > 0].filter(Boolean).length > 1;

  const totalItems = itemCounts.cards + itemCounts.forms + itemCounts.queues;

  const titlePrefix = hasMultipleTypes ? 'Items for' : 'Cards for';
  const renderTitle = () => `${titlePrefix} **${viewData?.objectName}**`;

  const renderSubtext = () => {
    if (totalItems === 0) return null;
    const base = hasMultipleTypes
      ? `${totalItems} item${totalItems === 1 ? '' : 's'}`
      : `${itemCounts.cards} card${itemCounts.cards === 1 ? '' : 's'}`;
    if (viewData?.isParentScope && viewData?.viewCount > 0) {
      const viewLabel = viewData.viewCount === 1 ? 'page' : 'pages';
      return `${base} across ${viewData.viewCount} ${viewLabel}`;
    }
    return base;
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
      headerActions={['openAll', 'reload', 'refresh']}
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll']}
      itemLabel={hasMultipleTypes ? 'item' : 'card'}
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subtext={renderSubtext()}
      title={renderTitle()}
      viewType='getCards'
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

// Canonical content categories for an App Studio page, in display order. Forms
// and queues only exist on App Studio pages, so each always renders -- empty
// ones as muted, non-expandable `(0)` rows.
const APP_PAGE_CONTENT_GROUPS = [
  { id: 'cards_group', label: 'Cards' },
  { id: 'forms_group', label: 'Forms' },
  { id: 'queues_group', label: 'Queues' }
];

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
 *
 * For App Studio pages (DATA_APP_VIEW) -- the only scope where forms and queues
 * apply -- always renders Cards, Forms, and Queues headers, with empty ones as
 * muted `(0)` rows so absence is explicit. For every other object type, only
 * cards apply: a single type stays a flat list, multiple types group under
 * disclosure headers (existing behavior).
 */
function transformPageItems(cards, forms, queues, origin, objectType, objectId, parentId) {
  const isAppStudioPage = objectType === 'DATA_APP_VIEW';
  const hasMultipleTypes = [cards.length > 0, forms.length > 0, queues.length > 0].filter(Boolean).length > 1;

  // Non-App-Studio with a single type: preserve flat list behavior. App Studio
  // pages skip the shortcut so the canonical Cards/Forms/Queues set always shows.
  if (!isAppStudioPage && !hasMultipleTypes && cards.length > 0) {
    return transformCardsToItems(cards, origin, objectType, objectId, parentId);
  }

  const items = [];

  if (cards.length > 0) {
    const cardItems = transformCardsToItems(cards, origin, objectType, objectId, parentId);
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

  return isAppStudioPage ? withCanonicalGroups(items, APP_PAGE_CONTENT_GROUPS) : items;
}

/**
 * Transform parent-scope view groups into DataListItems.
 * Each view becomes a navigable parent (clicking opens the view) with its
 * cards, forms, and queues as children. Same card appearing on multiple
 * views shows up under each view -- duplication is the point of the grouping.
 * @param {Array<{viewId: string, viewName: string, cards: Array, forms: Array, queues: Array}>} viewGroups
 * @param {string} origin - The base URL origin
 * @param {string|number} parentId - Parent DATA_APP or WORKSHEET ID (for view URLs)
 * @param {'DATA_APP_VIEW'|'WORKSHEET_VIEW'} childTypeId - Type of each view
 * @returns {DataListItem[]}
 */
function transformParentScopeItems(viewGroups, origin, parentId, childTypeId) {
  return viewGroups
    .sort((a, b) => (a.viewName || '').localeCompare(b.viewName || ''))
    .map((vg) => {
      const cardChildren = transformCardsToItems(vg.cards, origin, childTypeId, vg.viewId, parentId);

      const formChildren = vg.forms
        .slice()
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''))
        .map((form) => {
          const domoObject = new DomoObject('ENIGMA_FORM', form.id, origin, {
            name: form.title
          });
          if (form.workflowModelId && form.modelVersion) {
            domoObject.url = `${origin}/workflows/models/${form.workflowModelId}/${form.modelVersion}?_wfv=view`;
          }
          return DataListItem.fromDomoObject(domoObject);
        });

      const queueChildren = vg.queues
        .slice()
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
        .map((queue) => {
          const domoObject = new DomoObject('HOPPER_QUEUE', queue.id, origin, {
            name: queue.name
          });
          return DataListItem.fromDomoObject(domoObject);
        });

      const allChildren = [...cardChildren, ...formChildren, ...queueChildren];

      const viewDomoObject = new DomoObject(childTypeId, vg.viewId, origin, {
        name: vg.viewName
      });
      // Both DATA_APP_VIEW and WORKSHEET_VIEW use /app-studio/{parent}/pages/{id};
      // DomoObject can't fill {parent} on its own, so override the URL here.
      viewDomoObject.url = `${origin}/app-studio/${parentId}/pages/${vg.viewId}`;

      return DataListItem.fromDomoObject(viewDomoObject, {
        children: allChildren,
        count: allChildren.length,
        countLabel: allChildren.length === 1 ? 'item' : 'items'
      });
    });
}
