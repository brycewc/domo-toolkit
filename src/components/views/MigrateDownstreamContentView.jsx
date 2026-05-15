import { Card, Spinner } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { MigrateDownstreamModal } from '@/components/modals/MigrateDownstreamModal';
import { DataList } from '@/components/views/DataList';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import {
  getDownstreamCards,
  getDownstreamLineage,
  MIGRATE_TYPES,
  migrateAllDownstreamContent
} from '@/services/migrateDownstreamContent';
import { getSidepanelData } from '@/utils/sidepanel';
import IconArrowRight from '@icons/arrow-right.svg?react';

const TYPE_KEY_TO_DOMO_TYPE = {
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasetViews: 'DATA_SOURCE'
};

export function MigrateDownstreamContentView({ onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [datasetId, setDatasetId] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [origin, setOrigin] = useState('');
  const [tabId, setTabId] = useState(null);
  const [currentContext, setCurrentContext] = useState(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pendingSelectAll, setPendingSelectAll] = useState(true);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  // { [typeKey]: { status, error?, succeeded?, failed?, count? } }
  const [transferStatus, setTransferStatus] = useState({});
  const [isTransferring, setIsTransferring] = useState(false);

  const mountedRef = useRef(true);
  const { showStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async () => {
    try {
      const data = await getSidepanelData();
      if (!data || data.type !== 'migrateDownstream') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context || context.domoObject?.typeId !== 'DATA_SOURCE') {
        onStatusUpdate?.('Error', 'Migrate requires a dataset in scope', 'danger');
        onBackToDefault?.();
        return;
      }

      setDatasetId(context.domoObject.id);
      setDatasetName(
        context.domoObject?.metadata?.name ||
          context.domoObject?.metadata?.displayName ||
          `Dataset ${context.domoObject.id}`
      );
      setOrigin(context.domoObject?.baseUrl || '');
      setTabId(context.tabId);
      setCurrentContext(context);
    } catch (error) {
      console.error('[MigrateDownstreamContentView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const specs = useMemo(() => {
    if (!datasetId) return [];
    // datasetViews and dataflows both come from the same lineage call. Share
    // one in-flight Promise so the API isn't hit twice. Re-created with the
    // specs array so a refresh refetches.
    let lineagePromise = null;
    const lineage = () => {
      if (!lineagePromise) lineagePromise = getDownstreamLineage(datasetId, tabId);
      return lineagePromise;
    };
    return [
      {
        fetch: async () => ({ items: await getDownstreamCards(datasetId, tabId) }),
        key: 'cards',
        label: 'Cards'
      },
      {
        fetch: async () => {
          const { datasetViews } = await lineage();
          return { items: datasetViews };
        },
        key: 'datasetViews',
        label: 'Dataset Views'
      },
      {
        fetch: async () => {
          const { dataflows } = await lineage();
          return { items: dataflows };
        },
        key: 'dataflows',
        label: 'Dataflows'
      }
    ];
  }, [datasetId, tabId]);

  const {
    errorCount,
    isFullyLoaded,
    loadingCount,
    refresh: refreshFetches,
    results
  } = useParallelFetches(specs);

  // Pre-select every loaded item once all fetches settle. We hold pending in
  // a flag so a partial early result doesn't snapshot empty children.
  useEffect(() => {
    if (!pendingSelectAll) return;
    if (Object.keys(results).length === 0) return;
    if (!isFullyLoaded) return;
    const next = new Set();
    for (const t of MIGRATE_TYPES) {
      const r = results[t.key];
      const items = r?.status === 'loaded' ? r.items?.items || [] : [];
      if (items.length > 0) {
        next.add(t.key);
        for (const item of items) {
          next.add(leafSelectionId(t.key, item.id));
        }
      }
    }
    setSelectedIds(next);
    setPendingSelectAll(false);
  }, [pendingSelectAll, isFullyLoaded, results]);

  const totalsByType = useMemo(() => {
    const totals = {};
    for (const t of MIGRATE_TYPES) {
      const r = results[t.key];
      totals[t.key] = r?.status === 'loaded' ? r.items?.items?.length || 0 : 0;
    }
    return totals;
  }, [results]);

  const totalAvailable = useMemo(
    () => Object.values(totalsByType).reduce((a, b) => a + b, 0),
    [totalsByType]
  );

  const selectedCounts = useMemo(() => {
    const counts = { cards: 0, dataflows: 0, datasetViews: 0 };
    for (const t of MIGRATE_TYPES) {
      const r = results[t.key];
      const items = r?.status === 'loaded' ? r.items?.items || [] : [];
      for (const item of items) {
        if (selectedIds.has(leafSelectionId(t.key, item.id))) {
          counts[t.key]++;
        }
      }
    }
    return counts;
  }, [results, selectedIds]);

  const totalSelected = selectedCounts.cards + selectedCounts.datasetViews + selectedCounts.dataflows;

  // Full selected items array per type — passed to the modal so it can scan
  // each item's definition for column references when a schema mismatch is
  // detected. Distinct from `selectedCounts` (numbers) and `selectedIds`
  // (flat key Set).
  const selectedItemsByType = useMemo(() => {
    const acc = { cards: [], dataflows: [], datasetViews: [] };
    for (const t of MIGRATE_TYPES) {
      const r = results[t.key];
      const items = r?.status === 'loaded' ? r.items?.items || [] : [];
      for (const item of items) {
        if (selectedIds.has(leafSelectionId(t.key, item.id))) {
          acc[t.key].push(item);
        }
      }
    }
    return acc;
  }, [results, selectedIds]);

  const dataListItems = useMemo(
    () =>
      MIGRATE_TYPES.map((t) => {
        const result = results[t.key];
        const xfer = transferStatus[t.key];
        const status = xfer?.status ?? result?.status ?? 'loading';

        let count;
        let error = null;
        let children;

        if (result?.status === 'loaded' && result.items?.items) {
          const items = result.items.items;
          count = items.length;
          children = buildLeafItems(t.key, items, origin);
        } else if (result?.status === 'error') {
          error = result.error;
        }

        if (xfer) {
          if (xfer.error) error = xfer.error;
          if (xfer.count !== undefined) count = xfer.count;
        }

        return new DataListItem({
          children,
          count,
          error,
          id: t.key,
          isVirtualParent: true,
          label: t.label,
          status
        });
      }),
    [results, transferStatus, origin]
  );

  // Both parents and leaves are selectable. Parents are only selectable when
  // they have ≥ 1 loaded child. Leaves are always selectable.
  const isSelectable = useCallback(
    (item) => {
      if (item.isVirtualParent) {
        const r = results[item.id];
        if (!r || r.status !== 'loaded') return false;
        return (r.items?.items?.length || 0) > 0;
      }
      return true;
    },
    [results]
  );

  // Propagate selection changes:
  //   - parent toggled → toggle all that parent's leaves
  //   - leaf toggled → keep parent in sync (checked iff every leaf checked)
  // CheckboxGroup hands us the full new Set, so we diff against the previous
  // selection to figure out what just toggled.
  const handleSelectionChange = useCallback(
    (incoming) => {
      const prev = selectedIds;
      const added = [...incoming].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !incoming.has(id));

      const next = new Set(incoming);

      const propagateParent = (typeKey, isAdding) => {
        const r = results[typeKey];
        const items = r?.status === 'loaded' ? r.items?.items || [] : [];
        for (const item of items) {
          const leafId = leafSelectionId(typeKey, item.id);
          if (isAdding) next.add(leafId);
          else next.delete(leafId);
        }
      };

      const reconcileLeafParent = (typeKey) => {
        const r = results[typeKey];
        const items = r?.status === 'loaded' ? r.items?.items || [] : [];
        if (items.length === 0) return;
        const allSelected = items.every((item) =>
          next.has(leafSelectionId(typeKey, item.id))
        );
        if (allSelected) next.add(typeKey);
        else next.delete(typeKey);
      };

      // Parent toggles cascade to children.
      for (const id of added) {
        if (isParentKey(id)) propagateParent(id, true);
      }
      for (const id of removed) {
        if (isParentKey(id)) propagateParent(id, false);
      }
      // Leaf toggles reconcile parent.
      const touchedTypes = new Set();
      for (const id of [...added, ...removed]) {
        const typeKey = parseLeafTypeKey(id);
        if (typeKey) touchedTypes.add(typeKey);
      }
      for (const typeKey of touchedTypes) reconcileLeafParent(typeKey);

      setSelectedIds(next);
    },
    [selectedIds, results]
  );

  const subtextNode = useMemo(() => {
    if (isTransferring) {
      const inFlight = Object.values(transferStatus).filter((x) => x.status === 'transferring')
        .length;
      const done = Object.values(transferStatus).filter(
        (x) => x.status === 'transferred' || x.status === 'failed'
      ).length;
      const total = inFlight + done;
      return (
        <>
          Migrating… <span className='font-medium text-foreground'>{done}</span>/{total}
        </>
      );
    }
    if (!isFullyLoaded) {
      return (
        <>
          Searching downstream content… ({MIGRATE_TYPES.length - loadingCount}/
          {MIGRATE_TYPES.length})
        </>
      );
    }
    return (
      <>
        <span className='font-medium text-foreground'>{totalSelected}</span> of{' '}
        <span className='font-medium text-foreground'>{totalAvailable}</span> selected
        {errorCount > 0 && (
          <span>
            {' ('}
            <span className='text-danger'>{errorCount} failed to load</span>
            {')'}
          </span>
        )}
      </>
    );
  }, [
    isTransferring,
    transferStatus,
    isFullyLoaded,
    loadingCount,
    totalAvailable,
    totalSelected,
    errorCount
  ]);

  const handleOpenModal = useCallback(() => setTransferModalOpen(true), []);

  const handleSubmit = useCallback(
    async ({
      columnMap,
      definitionsByItemKey,
      targetColumnTypes,
      targetId,
      targetName,
      useFullPath
    }) => {
      const selectedItems = selectedItemsByType;

      const initialStatus = {};
      for (const t of MIGRATE_TYPES) {
        if (selectedItems[t.key].length > 0) {
          initialStatus[t.key] = { count: selectedItems[t.key].length, status: 'transferring' };
        }
      }
      setTransferStatus(initialStatus);
      setIsTransferring(true);

      try {
        const transferResults = await migrateAllDownstreamContent({
          columnMap,
          definitionsByItemKey,
          onProgress: ({ count, result, status, typeKey }) => {
            if (!mountedRef.current) return;
            setTransferStatus((prev) => {
              const next = { ...prev };
              if (status === 'transferring') {
                next[typeKey] = { count, status: 'transferring' };
              } else if (status === 'done') {
                const failed = result?.failed ?? 0;
                const succeeded = result?.succeeded ?? 0;
                next[typeKey] = {
                  count: count ?? succeeded + failed,
                  error: failed > 0 ? formatErrors(result) : null,
                  failed,
                  status: failed > 0 ? 'failed' : 'transferred',
                  succeeded
                };
              }
              return next;
            });
          },
          originId: datasetId,
          selectedItems,
          tabId,
          targetColumnTypes,
          targetId,
          useFullPath
        });

        let totalSucceeded = 0;
        let totalFailed = 0;
        for (const [, r] of transferResults) {
          totalSucceeded += r.succeeded || 0;
          totalFailed += r.failed || 0;
        }

        const targetLabel = targetName ? `**${targetName}**` : `**${targetId}**`;
        if (totalFailed > 0) {
          showStatus(
            'Migration Partially Complete',
            `**${totalSucceeded}** succeeded, **${totalFailed}** failed migrating to ${targetLabel}`,
            'warning',
            7000
          );
        } else {
          showStatus(
            'Migration Complete',
            `Migrated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''} to ${targetLabel}`,
            'success',
            7000
          );
        }
      } catch (err) {
        showStatus('Migration Failed', err.message || 'An error occurred', 'danger', 7000);
      } finally {
        if (mountedRef.current) setIsTransferring(false);
      }
    },
    [datasetId, selectedItemsByType, showStatus, tabId]
  );

  const customHeaderActions = useMemo(
    () => [
      {
        icon: <IconArrowRight />,
        isDisabled: !isFullyLoaded || totalSelected === 0 || isTransferring,
        key: 'migrate',
        onPress: handleOpenModal,
        tooltipText: 'Migrate selected content to another dataset'
      }
    ],
    [handleOpenModal, isFullyLoaded, isTransferring, totalSelected]
  );

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading...</p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <>
      <DataList
        closeLabel='Close Migrate Downstream Content'
        customHeaderActions={customHeaderActions}
        headerActions={['refresh']}
        isRefreshing={loadingCount > 0}
        isSelectable={isSelectable}
        itemActions={['copy']}
        itemLabel='item'
        items={dataListItems}
        selectedIds={selectedIds}
        selectionMode={true}
        showActions={true}
        showCounts={true}
        subtext={subtextNode}
        onClose={onBackToDefault}
        onRefresh={refreshFetches}
        onSelectionChange={handleSelectionChange}
        onStatusUpdate={onStatusUpdate}
        title={
          <>
            <span>Downstream Content of</span> <span className='font-bold'>{datasetName}</span>
          </>
        }
      />
      <MigrateDownstreamModal
        currentContext={currentContext}
        isOpen={transferModalOpen}
        selectedCounts={selectedCounts}
        selectedItems={selectedItemsByType}
        sourceDataset={{ id: datasetId, name: datasetName }}
        onOpenChange={setTransferModalOpen}
        onSubmit={handleSubmit}
      />
    </>
  );
}

function buildLeafItems(typeKey, items, origin) {
  return items.map((item) => {
    const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
    let url = null;
    if (domoTypeId && origin) {
      try {
        url = new DomoObject(domoTypeId, item.id, origin, { name: item.name }).url;
      } catch {
        url = null;
      }
    }
    return new DataListItem({
      id: leafSelectionId(typeKey, item.id),
      label: item.name || String(item.id),
      originalId: item.id,
      typeId: domoTypeId,
      url
    });
  });
}

function formatErrors(result) {
  if (!result?.errors?.length) return null;
  if (result.errors.length === 1) {
    return `${result.errors[0].id}: ${result.errors[0].error}`;
  }
  return `${result.errors.length} item${result.errors.length === 1 ? '' : 's'} failed: ${result.errors[0].id}: ${result.errors[0].error}…`;
}

function isParentKey(id) {
  return MIGRATE_TYPES.some((t) => t.key === id);
}

// Leaf IDs are namespaced by type so a card and a dataflow can't collide on
// the same numeric ID. Parent IDs use the bare type key (`cards`, etc.) to
// match the DataListItem.id we set on the virtual parent rows.
function leafSelectionId(typeKey, itemId) {
  return `${typeKey}:${itemId}`;
}

function parseLeafTypeKey(id) {
  if (typeof id !== 'string') return null;
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  const candidate = id.slice(0, idx);
  return MIGRATE_TYPES.some((t) => t.key === candidate) ? candidate : null;
}
