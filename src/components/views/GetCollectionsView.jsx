import { Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { CloseButton } from '@/components/CloseButton';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import {
  getAppInstanceCollections,
  getCollectionsByIds,
  resolveAppInstanceCollections,
  resolveDesignCollections
} from '@/services/appDb';
import { getCardsByIds, getCardsForObject } from '@/services/cards';
import { getAppContentSummary } from '@/services/customApps';
import { getValidTabForInstance } from '@/utils/currentObject';
import { soleExpandedGroupIds } from '@/utils/dataListGroups';
import { getSidepanelData } from '@/utils/sidepanel';
import IconDataCollection from '@icons/data-collection.svg?react';
import IconSync from '@icons/sync.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

const PAGE_TYPES = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'];

const EMPTY_MESSAGES = {
  app: 'No app cards in this app use AppDB collections.',
  card: 'This app does not use any AppDB collections.',
  datastore: 'No collections found in this datastore.',
  design: 'No instance of this app design uses AppDB collections.',
  page: 'No app cards on this page use AppDB collections.',
  worksheet: 'No app cards in this worksheet use AppDB collections.',
  workspace: 'This Jupyter workspace has no AppDB collections attached.'
};

export function GetCollectionsView({
  currentContext = null,
  instance: viewInstance = null,
  isActive = true,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [showSpinner, setShowSpinner] = useState(false);
  const [error, setError] = useState(null);
  const [items, setItems] = useState([]);
  const [viewData, setViewData] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    loadCollectionsData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadCollectionsData = async (forceRefresh = false) => {
    if (!forceRefresh && !isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    const spinnerTimer = !forceRefresh ? setTimeout(() => setShowSpinner(true), 200) : null;

    try {
      const data = await getSidepanelData(viewInstance);
      if (!data || data.type !== 'getCollections') {
        setError('No collection data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const objectId = domoObject.id;
      const origin = context.origin;
      const scope = scopeFor(objectType, data.appId);

      setViewData({
        appId: data.appId || null,
        objectId,
        objectName: data.appId
          ? domoObject.metadata?.parent?.name || `App ${data.appId}`
          : domoObject.metadata?.name || `${objectType} ${objectId}`,
        objectType,
        scope
      });

      const tabId = await getValidTabForInstance(context.instance);
      const nextItems = await fetchCollectionItems({ appId: data.appId, domoObject, origin, scope, tabId });

      if (nextItems.length === 0) {
        if (!mountedRef.current) return;
        onStatusUpdate?.('No Collections Found', EMPTY_MESSAGES[scope], 'warning');
        onBackToDefault?.();
        setIsLoading(false);
        return;
      }

      setError(null);
      setItems(nextItems);
    } catch (err) {
      console.error('Error loading collections:', err);
      setError(err.message || 'Failed to load collections');
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
      await loadCollectionsData(true);
      onStatusUpdate?.('Refreshed', 'Collection data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const renderSubtext = () => {
    const collectionCount = countDistinctCollections(items);
    if (collectionCount === 0) return null;
    const collectionText = `${collectionCount} collection${collectionCount === 1 ? '' : 's'}`;
    if (!isGroupedScope(viewData?.scope)) return collectionText;
    const unit = viewData.scope === 'design' ? 'instance' : 'app card';
    return `${collectionText} across ${items.length} ${unit}${items.length === 1 ? '' : 's'}`;
  };

  if (isLoading || holdContent) {
    if (isLoading && !showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading collections...</p>
        </Card.Content>
      </Card>
    );
  }

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadCollectionsData();
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
            <Button fullWidth isPending={isRetrying} size='sm' onPress={handleRetry}>
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
      defaultExpandedIds={soleExpandedGroupIds(items)}
      feature='Collections for'
      featureIcon={<IconDataCollection />}
      headerActions={['openAll', 'reload', 'refresh']}
      isActive={isActive}
      isRefreshing={isRefreshing}
      itemLabel='collection'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.objectType}
      showActions={true}
      showCounts={true}
      subject={viewData?.objectName}
      subtext={renderSubtext()}
      viewType='getCollections'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

function appCardsOf(cards) {
  return (cards || []).filter((card) => card?.type === 'domoapp' && card.domoapp?.id);
}

/**
 * Card URL scoped to the page it sits on, so opening it keeps the page's filters.
 * @returns {string|null} null for a card outside any known page
 */
function appCardUrl({ cardId, objectId, objectType, origin, parentId }) {
  if (objectType === 'PAGE') return `${origin}/page/${objectId}/kpis/details/${cardId}`;
  if (parentId && (objectType === 'DATA_APP_VIEW' || objectType === 'WORKSHEET_VIEW')) {
    return `${origin}/app-studio/${parentId}/pages/${objectId}/kpis/details/${cardId}`;
  }
  return null;
}

/**
 * One row per app card that uses any collection, with its collections nested beneath.
 * Cards with no collections are left out.
 */
async function buildCardGroups({ cards, origin, tabId, urlFor }) {
  const byInstance = new Map();
  for (const card of cards) {
    if (!byInstance.has(card.domoapp.id)) byInstance.set(card.domoapp.id, []);
    byInstance.get(card.domoapp.id).push(card);
  }
  const resolved = await resolveAppInstanceCollections({ instanceIds: [...byInstance.keys()], tabId });

  const groups = [];
  for (const { collections, instanceId } of resolved) {
    if (collections.length === 0) continue;
    for (const card of byInstance.get(instanceId) || []) {
      const children = collections.map((c) => collectionItem(c, origin));
      const domoObject = new DomoObject('CARD', card.id, origin, { name: (card.title || '').trim() || `Card ${card.id}` });
      const url = urlFor(card);
      if (url) domoObject.url = url;
      groups.push(
        DataListItem.fromDomoObject(domoObject, {
          children,
          count: children.length,
          countLabel: children.length === 1 ? 'collection' : 'collections'
        })
      );
    }
  }
  return groups;
}

function collectionItem(collection, origin) {
  const item = DataListItem.fromDomoObject(
    new DomoObject('MAGNUM_COLLECTION', collection.id, origin, { name: collection.name })
  );
  if (collection.syncEnabled) item.chip = { label: 'Synced' };
  const notes = [];
  if (collection.borrowed) {
    notes.push(collection.ownerCard ? `From ${collection.ownerCard.title}.` : 'From another app.');
  }
  if (collection.alias && collection.alias !== collection.name) notes.push(`Used as "${collection.alias}".`);
  if (collection.inaccessible) notes.push("You don't have access to this collection.");
  item.annotation = notes.length > 0 ? notes.join(' ') : null;
  item.muted = !!collection.inaccessible;
  return item;
}

function countDistinctCollections(items) {
  const ids = new Set();
  const walk = (list) => {
    for (const item of list || []) {
      if (item.typeId === 'MAGNUM_COLLECTION') ids.add(String(item.id));
      if (item.children?.length) walk(item.children);
    }
  };
  walk(items);
  return ids.size;
}

async function fetchCollectionItems({ appId, domoObject, origin, scope, tabId }) {
  const details = domoObject.metadata?.details;
  const objectId = domoObject.id;
  const objectType = domoObject.typeId;

  switch (scope) {
    case 'app':
    case 'worksheet': {
      const summary = await getAppContentSummary({ appId, tabId });
      const viewByCard = new Map();
      for (const [viewId, viewCards] of Object.entries(summary?.cardsByView || {})) {
        for (const card of viewCards) {
          if (!viewByCard.has(card.id)) viewByCard.set(card.id, viewId);
        }
      }
      const cards = appCardsOf(await getCardsByIds({ cardIds: summary?.cardIds, parts: 'metadata,domoapp', tabId }));
      return buildCardGroups({
        cards,
        origin,
        tabId,
        urlFor: (card) =>
          viewByCard.has(card.id)
            ? `${origin}/app-studio/${appId}/pages/${viewByCard.get(card.id)}/kpis/details/${card.id}`
            : null
      });
    }

    case 'card': {
      let instanceId = details?.domoapp?.id;
      if (!instanceId) {
        const [card] = await getCardsByIds({ cardIds: [objectId], parts: 'domoapp', tabId });
        instanceId = card?.domoapp?.id;
      }
      if (!instanceId) return [];
      const [resolved] = await resolveAppInstanceCollections({ instanceIds: [instanceId], tabId });
      return (resolved?.collections || []).map((c) => collectionItem(c, origin));
    }

    case 'datastore': {
      const datastoreId = domoObject.parentId || details?.datastoreId;
      if (!datastoreId) return [];
      const collections = await getAppInstanceCollections({ appInstanceId: datastoreId, tabId });
      return collections.map((c) => {
        const item = collectionItem({ id: c.id, name: c.name || c.id, syncEnabled: !!c.syncEnabled }, origin);
        if (String(c.id) === String(objectId)) item.chip = { color: 'default', label: 'Current' };
        return item;
      });
    }

    case 'design': {
      const resolved = await resolveDesignCollections({ designId: objectId, tabId });
      return resolved
        .filter(({ collections }) => collections.length > 0)
        .map(({ card, collections, instanceId }) => {
          const children = collections.map((c) => collectionItem(c, origin));
          const countLabel = children.length === 1 ? 'collection' : 'collections';
          if (card) {
            return DataListItem.fromDomoObject(new DomoObject('CARD', card.id, origin, { name: card.title }), {
              children,
              count: children.length,
              countLabel
            });
          }
          return DataListItem.createGroup({
            children,
            childTypeId: 'MAGNUM_COLLECTION',
            countLabel,
            id: `instance_${instanceId}`,
            label: `Instance ${String(instanceId).slice(0, 8)}`,
            typeId: 'APP_INSTANCE'
          });
        });
    }

    case 'page': {
      const pageCards = await getCardsForObject({ objectId, objectType, parts: 'domoapp', tabId });
      if (!Array.isArray(pageCards)) throw new Error("Couldn't load the cards on this page.");
      return buildCardGroups({
        cards: appCardsOf(pageCards),
        origin,
        tabId,
        urlFor: (card) => appCardUrl({ cardId: card.id, objectId, objectType, origin, parentId: domoObject.parentId })
      });
    }

    case 'workspace': {
      // The entry shape is unconfirmed (every workspace seen so far had none), so read the likely keys.
      const entries = (details?.collectionConfiguration || []).map((entry) => ({
        alias: entry?.alias ?? entry?.name ?? null,
        id: entry?.collectionId ?? entry?.collection_id ?? entry?.id ?? null
      }));
      const collections = await getCollectionsByIds({ entries, tabId });
      return collections.map((c) => collectionItem({ ...c, borrowed: !!c.ownerCard }, origin));
    }

    default:
      return [];
  }
}

function isGroupedScope(scope) {
  return ['app', 'design', 'page', 'worksheet'].includes(scope);
}

function scopeFor(objectType, appId) {
  if (appId) return objectType === 'WORKSHEET_VIEW' ? 'worksheet' : 'app';
  if (PAGE_TYPES.includes(objectType)) return 'page';
  switch (objectType) {
    case 'APP':
    case 'RYUU_APP':
      return 'design';
    case 'CARD':
      return 'card';
    case 'DATA_SCIENCE_NOTEBOOK':
      return 'workspace';
    case 'MAGNUM_COLLECTION':
      return 'datastore';
    default:
      return null;
  }
}
