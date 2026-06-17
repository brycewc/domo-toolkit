import { Alert, Button, Card, Spinner } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getDatasetBeastModesWithUsage } from '@/services/beastModes';
import { getCardDatasets, getCardsForObject, getCardsForParent } from '@/services/cards';
import { getDatasetsForPage } from '@/services/datasets';
import { getValidTabForInstance } from '@/utils/currentObject';
import { withCanonicalGroups } from '@/utils/dataListGroups';
import { getSidepanelData } from '@/utils/sidepanel';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { DataList } from './DataList';

// Page-type object types share one orchestration: dataset -> Beast Mode -> the
// cards on that page using it.
const PAGE_TYPES = ['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'];

export function GetBeastModesView({
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
    loadBeastModesData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadBeastModesData = async () => {
    if (!isRetrying) {
      setIsLoading(true);
      setShowSpinner(false);
    }

    const spinnerTimer = setTimeout(() => {
      setShowSpinner(true);
    }, 200);

    try {
      const data = await getSidepanelData(viewInstance);

      if (!data || data.type !== 'getBeastModes') {
        setError('No Beast Mode data found. Please try again.');
        setIsLoading(false);
        return;
      }

      const context = DomoContext.fromJSON(data.currentContext);
      const domoObject = context.domoObject;
      const objectType = domoObject.typeId;
      const objectId = domoObject.id;
      const instance = context.instance;
      const origin = `https://${instance}.domo.com`;
      const tabId = await getValidTabForInstance(instance);

      let transformedItems = [];
      let objectName = domoObject.metadata?.name || `${objectType} ${objectId}`;
      let displayType = objectType;

      if (data.scope === 'parent') {
        const result = await buildParentScope({ context, origin, parentId: data.parentId, tabId });
        transformedItems = result.items;
        objectName = result.parentName;
        displayType = result.parentType;
      } else if (objectType === 'DATA_SOURCE') {
        const beastModes = await getDatasetBeastModesWithUsage(objectId, tabId);
        transformedItems = beastModes.map((bm) => buildUsageBeastModeItem(bm, origin));
      } else if (objectType === 'DATAFLOW_TYPE') {
        transformedItems = await buildDataflowScope({ details: domoObject.metadata?.details, origin, tabId });
      } else if (objectType === 'CARD') {
        transformedItems = await buildCardScope({ cardId: objectId, details: domoObject.metadata?.details, origin, tabId });
      } else if (PAGE_TYPES.includes(objectType)) {
        transformedItems = await buildPageDatasetGroups({ objectType, origin, pageCards: null, pageId: objectId, tabId });
      }

      if (!mountedRef.current) return;

      const total = countBeastModes(transformedItems);
      setViewData({ displayType, instance, objectId, objectName, origin, total });

      if (total === 0) {
        onStatusUpdate?.('No Beast Modes Found', emptyMessage(objectType, data.scope), 'warning', 3000);
        onBackToDefault?.();
        return;
      }

      setError(null);
      setItems(transformedItems);
    } catch (err) {
      console.error('Error loading Beast Modes:', err);
      setError(err.message || 'Failed to load Beast Modes');
    } finally {
      clearTimeout(spinnerTimer);
      setIsLoading(false);
      setShowSpinner(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadBeastModesData();
      onStatusUpdate?.('Refreshed', 'Data updated successfully', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh data', 'danger', 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleRetry = async () => {
    setIsRetrying(true);
    await loadBeastModesData();
    setIsRetrying(false);
  };

  const renderTitle = () => `Beast Modes for **${viewData?.objectName}**`;

  const renderSubtext = () => {
    const total = viewData?.total || 0;
    if (total === 0) return null;
    return `${total} Beast Mode${total === 1 ? '' : 's'}`;
  };

  if (isLoading) {
    if (!showSpinner) return null;
    return (
      <Card className='flex w-full items-center justify-center p-0'>
        <Card.Content className='flex flex-col items-center justify-center gap-2 p-2'>
          <Spinner size='lg' />
          <p className='text-muted'>Loading Beast Modes...</p>
        </Card.Content>
      </Card>
    );
  }

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
      itemActions={['copy', 'openAll']}
      itemLabel='Beast Mode'
      items={items}
      objectId={viewData?.objectId}
      objectType={viewData?.displayType}
      showActions={true}
      showCounts={true}
      subtext={renderSubtext()}
      title={renderTitle()}
      viewType='getBeastModes'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

/**
 * Build the used / not-used grouping for one dataset's Beast Modes relative to a
 * card. A Beast Mode is "used" when the card (or one of its drills) appears in
 * the Beast Mode's card list.
 */
function buildCardDatasetGroups(beastModes, cardId, origin, idPrefix = '') {
  const cid = String(cardId);
  const used = [];
  const notUsed = [];
  for (const bm of beastModes) {
    const isUsed = bm.cards.some((c) => String(c.id) === cid) || bm.drills.some((c) => String(c.id) === cid);
    (isUsed ? used : notUsed).push(buildUsageBeastModeItem(bm, origin));
  }

  const usedId = `${idPrefix}used`;
  const notUsedId = `${idPrefix}notUsed`;
  const groups = [];
  if (used.length) {
    groups.push(DataListItem.createGroup({ children: used, id: usedId, label: 'Used by this card' }));
  }
  if (notUsed.length) {
    groups.push(DataListItem.createGroup({ children: notUsed, id: notUsedId, label: 'Not used by this card' }));
  }
  return withCanonicalGroups(groups, [
    { id: usedId, label: 'Used by this card' },
    { id: notUsedId, label: 'Not used by this card' }
  ]);
}

/**
 * CARD scope: group by each source dataset, splitting each into used / not-used
 * by this card. A single-dataset card renders the two sections at top level; a
 * multi-dataset card wraps each dataset's sections under a dataset row.
 */
async function buildCardScope({ cardId, details, origin, tabId }) {
  const rawDatasets = details?.datasources?.length ? details.datasources : await getCardDatasets({ cardId, tabId });
  const datasets = (rawDatasets || []).map(datasetIdName).filter((ds) => ds.id);
  if (!datasets.length) return [];

  const withBeastModes = await Promise.all(
    datasets.map(async (ds) => ({ ...ds, beastModes: await getDatasetBeastModesWithUsage(ds.id, tabId) }))
  );

  if (withBeastModes.length === 1) {
    return buildCardDatasetGroups(withBeastModes[0].beastModes, cardId, origin);
  }

  return withBeastModes
    .filter((ds) => ds.beastModes.length > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((ds) => {
      const groups = buildCardDatasetGroups(ds.beastModes, cardId, origin, `${ds.id}_`);
      const dsObject = new DomoObject('DATA_SOURCE', ds.id, origin, { name: ds.name });
      return DataListItem.fromDomoObject(dsObject, {
        children: groups,
        count: ds.beastModes.length,
        countLabel: 'Beast Modes'
      });
    });
}

/**
 * DATAFLOW_TYPE scope: same per-Beast-Mode breakdown as a dataset, grouped under
 * each of the dataflow's output datasets.
 */
async function buildDataflowScope({ details, origin, tabId }) {
  const outputs = details?.outputs || [];
  const groups = await Promise.all(
    outputs.map(async (output) => {
      const id = output.id || output.dataSourceId;
      const name = output.name || output.dataSourceName || `Dataset ${id}`;
      const beastModes = await getDatasetBeastModesWithUsage(id, tabId);
      return { beastModes, id, name };
    })
  );

  return groups
    .filter((g) => g.beastModes.length > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((g) => {
      const dsObject = new DomoObject('DATA_SOURCE', g.id, origin, { name: g.name });
      return DataListItem.fromDomoObject(dsObject, {
        children: g.beastModes.map((bm) => buildUsageBeastModeItem(bm, origin)),
        count: g.beastModes.length,
        countLabel: 'Beast Modes'
      });
    });
}

/**
 * Build a page-scope Beast Mode row: only the cards on this page that use it,
 * with a dual "X of Y" count (on-page usages / total instance usages) to make
 * the gap between page-local and instance-wide usage explicit.
 */
function buildPageBeastModeItem(bm, onPageCards, origin) {
  const cardChildren = onPageCards
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((c) => DataListItem.fromDomoObject(new DomoObject('CARD', c.id, origin, { name: c.name })));
  const bmObject = new DomoObject('BEAST_MODE_FORMULA', bm.id, origin, { name: bm.name });
  return DataListItem.fromDomoObject(bmObject, {
    children: cardChildren,
    count: cardChildren.length,
    countLabel: `of ${bm.usageCount} ${bm.usageCount === 1 ? 'use' : 'uses'}`
  });
}

/**
 * PAGE scope (and each page within an app/worksheet): one dataset group per
 * dataset on the page, each listing the Beast Modes whose usage touches a card
 * on this page, with only those on-page cards beneath. `pageCards` may be passed
 * in (parent scope already has them) or fetched here when null.
 */
async function buildPageDatasetGroups({ objectType = 'PAGE', origin, pageCards, pageId, tabId }) {
  const [datasets, cards] = await Promise.all([
    getDatasetsForPage({ pageId, tabId }),
    pageCards ? Promise.resolve(pageCards) : getCardsForObject({ objectId: pageId, objectType, tabId })
  ]);
  const pageCardIds = new Set((cards || []).map((c) => String(c.id)));

  const groups = await Promise.all(
    (datasets || []).map(datasetIdName).map(async (ds) => {
      const beastModes = await getDatasetBeastModesWithUsage(ds.id, tabId);
      const bmItems = [];
      for (const bm of beastModes) {
        const onPageCards = [...bm.cards, ...bm.drills].filter((c) => pageCardIds.has(String(c.id)));
        if (!onPageCards.length) continue;
        bmItems.push(buildPageBeastModeItem(bm, onPageCards, origin));
      }
      return { ...ds, bmItems };
    })
  );

  return groups
    .filter((g) => g.bmItems.length > 0)
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((g) => {
      const dsObject = new DomoObject('DATA_SOURCE', g.id, origin, { name: g.name });
      return DataListItem.fromDomoObject(dsObject, {
        children: g.bmItems,
        count: g.bmItems.length,
        countLabel: 'Beast Modes'
      });
    });
}

/**
 * DATA_APP / WORKSHEET scope (alternative action): the page-style view with each
 * page in the app/worksheet as the top grouping level.
 */
async function buildParentScope({ context, origin, parentId, tabId }) {
  const childTypeId = context.domoObject.typeId;
  const parentType = childTypeId === 'WORKSHEET_VIEW' ? 'WORKSHEET' : 'DATA_APP';
  const resolvedParentId = parentId || context.domoObject.parentId;
  if (!resolvedParentId) throw new Error('Could not determine parent ID.');

  const { parentName, viewGroups } = await getCardsForParent({ parentId: resolvedParentId, tabId });

  const pages = await Promise.all(
    viewGroups.map(async (vg) => {
      const datasetGroups = await buildPageDatasetGroups({
        objectType: childTypeId,
        origin,
        pageCards: vg.cards,
        pageId: vg.viewId,
        tabId
      });
      return { datasetGroups, viewId: vg.viewId, viewName: vg.viewName };
    })
  );

  const items = pages
    .filter((p) => p.datasetGroups.length > 0)
    .sort((a, b) => (a.viewName || '').localeCompare(b.viewName || ''))
    .map((p) => {
      const viewObject = new DomoObject(childTypeId, p.viewId, origin, { name: p.viewName });
      viewObject.url = `${origin}/app-studio/${resolvedParentId}/pages/${p.viewId}`;
      const bmCount = countBeastModes(p.datasetGroups);
      return DataListItem.fromDomoObject(viewObject, {
        children: p.datasetGroups,
        count: bmCount,
        countLabel: 'Beast Modes'
      });
    });

  return { items, parentName, parentType };
}

/**
 * Build a dataset-scope Beast Mode row with its usage broken into Cards, Drills,
 * and Other Beast Modes category groups (only non-empty categories shown).
 */
function buildUsageBeastModeItem(bm, origin) {
  const groups = [];
  if (bm.cards.length) groups.push(makeCategoryGroup(`${bm.id}_cards`, 'Cards', bm.cards, 'CARD', origin));
  if (bm.drills.length) groups.push(makeCategoryGroup(`${bm.id}_drills`, 'Drills', bm.drills, 'CARD', origin));
  if (bm.otherBeastModes.length) {
    groups.push(makeCategoryGroup(`${bm.id}_other`, 'Other Beast Modes', bm.otherBeastModes, 'BEAST_MODE_FORMULA', origin));
  }
  const bmObject = new DomoObject('BEAST_MODE_FORMULA', bm.id, origin, { name: bm.name });
  return DataListItem.fromDomoObject(bmObject, {
    children: groups,
    count: bm.usageCount,
    countLabel: bm.usageCount === 1 ? 'use' : 'uses'
  });
}

/**
 * Count the Beast Mode rows (type BEAST_MODE_FORMULA) anywhere in a tree of
 * items, so the subtext can report a real total regardless of grouping depth.
 */
function countBeastModes(items) {
  let total = 0;
  for (const item of items || []) {
    if (item.typeId === 'BEAST_MODE_FORMULA') total += 1;
    else if (item.children?.length) total += countBeastModes(item.children);
  }
  return total;
}

/**
 * Normalize the various dataset id/name field shapes (card datasources, page
 * datasources, dataflow outputs) into a single { id, name }.
 */
function datasetIdName(ds) {
  const id = ds.id || ds.dataSourceId || ds.datasetId;
  const name = ds.name || ds.dataSourceName || ds.datasetName || `Dataset ${id}`;
  return { id, name };
}

function emptyMessage(objectType, scope) {
  if (scope === 'parent') {
    return objectType === 'WORKSHEET_VIEW'
      ? 'No Beast Modes are used by any card across this worksheet.'
      : 'No Beast Modes are used by any card across this app.';
  }
  if (objectType === 'CARD') return 'No Beast Modes found on the dataset(s) powering this card.';
  if (objectType === 'DATAFLOW_TYPE') return "No Beast Modes found on this dataflow's output datasets.";
  if (PAGE_TYPES.includes(objectType)) return 'No Beast Modes are used by any card on this page.';
  return 'No Beast Modes found on this dataset.';
}

function makeCategoryGroup(id, label, entries, typeId, origin) {
  const children = entries
    .slice()
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
    .map((e) => DataListItem.fromDomoObject(new DomoObject(typeId, e.id, origin, { name: e.name })));
  return DataListItem.createGroup({ children, id, label });
}
