import { useEffect, useState } from 'react';
import { Button, Card, Spinner } from '@heroui/react';
import { DataList } from '@/components';
import { getCardsForObject } from '@/services';
import { DataListItem, DomoContext, DomoObject } from '@/models';
import { getValidTabForInstance, waitForCards } from '@/utils';

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
      const nameA = a.title || a.name || '';
      const nameB = b.title || b.name || '';
      return nameA.localeCompare(nameB);
    })
    .map((card) => {
      const domoObject = new DomoObject('CARD', card.id, origin, {
        name: card.title || card.name
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

export function GetCardsView({
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
    loadCardsData();
  }, []);

  const loadCardsData = async (forceRefresh = false) => {
    if (!forceRefresh) {
      setIsLoading(true);
      setShowSpinner(false);
    }
    setError(null);

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

      setViewData({
        objectId,
        objectType,
        objectName,
        origin,
        instance,
        parentId
      });

      let cards = data.cards;

      if (!cards && !forceRefresh) {
        // No pre-fetched cards (popup handoff) -- try background-cached context
        const waitResult = await waitForCards(context);
        if (waitResult.success && waitResult.cards?.length) {
          cards = waitResult.cards;
        } else {
          const tabId = await getValidTabForInstance(instance);
          cards = await getCardsForObject({ objectId, objectType, tabId });
        }
      }

      if (forceRefresh) {
        const tabId = await getValidTabForInstance(instance);
        cards = await getCardsForObject({ objectId, objectType, tabId });
      }

      if (!cards || !Array.isArray(cards)) {
        setError('Invalid card data received. Please try again.');
        return;
      }

      const transformedItems = transformCardsToItems(
        cards,
        origin,
        objectType,
        objectId,
        parentId
      );
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
        'Card data updated successfully',
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
    return (
      <div className='flex flex-col gap-1'>
        <div className='flex min-w-0 items-center justify-start gap-x-1'>
          <span className='truncate font-bold'>{viewData?.objectName}</span>
          <span className='shrink-0'>Cards</span>
        </div>
        {items.length > 0 && (
          <div className='flex flex-row items-center gap-1'>
            <span className='text-sm text-muted'>
              {items.length} card{items.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
      </div>
    );
  };

  if (isLoading && showSpinner) {
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading cards...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <p className='text-danger'>{error}</p>
          <Button onPress={loadCardsData}>Retry</Button>
        </Card.Content>
      </Card>
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
      closeLabel='Close Cards View'
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll']}
      showActions={true}
      showCounts={true}
      itemLabel='card'
    />
  );
}
