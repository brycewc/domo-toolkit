import { useEffect, useState } from 'react';
import { Button, Spinner } from '@heroui/react';
import { DataList } from '@/components';
import { getCardsForObject } from '@/services';
import { DataListItem, DomoContext } from '@/models';
import { getValidTabForInstance } from '@/utils';

/**
 * Transform cards into DataListItem format
 * @param {Array} cards - Array of card objects
 * @param {string} origin - The base URL origin
 * @returns {DataListItem[]}
 */
function transformCardsToItems(cards, origin) {
  return cards
    .sort((a, b) => {
      const nameA = a.title || a.name || '';
      const nameB = b.title || b.name || '';
      return nameA.localeCompare(nameB);
    })
    .map(
      (card) =>
        new DataListItem({
          id: card.id,
          label: card.title || card.name || `Card ${card.id}`,
          url: `${origin}/kpis/details/${card.id}`,
          typeId: 'CARD',
          metadata: `ID: ${card.id}`
        })
    );
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

      setViewData({
        objectId,
        objectType,
        objectName,
        origin,
        instance
      });

      let cards = data.cards;

      if (forceRefresh) {
        console.log(
          '[GetCardsView] Forcing refresh...',
          objectType,
          objectId
        );
        const tabId = await getValidTabForInstance(instance);
        cards = await getCardsForObject({
          objectId,
          objectType,
          tabId
        });
      }

      if (!cards || !Array.isArray(cards)) {
        setError('Invalid card data received. Please try again.');
        return;
      }

      const transformedItems = transformCardsToItems(cards, origin);
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
        <div className='flex flex-wrap items-center justify-start gap-x-1'>
          <span className='font-bold'>{viewData?.objectName}</span>
          Cards
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
      <div className='flex items-center justify-center'>
        <div className='flex flex-col items-center gap-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading cards...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex items-center justify-center p-4'>
        <div className='flex flex-col items-center gap-2 text-center'>
          <p className='text-danger'>{error}</p>
          <Button onPress={loadCardsData}>Retry</Button>
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
      closeLabel='Close Cards View'
      isRefreshing={isRefreshing}
      itemActions={['copy', 'openAll']}
      showActions={true}
      showCounts={true}
      itemLabel='card'
    />
  );
}
