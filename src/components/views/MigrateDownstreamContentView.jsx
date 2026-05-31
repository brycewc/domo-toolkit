import {
  Alert,
  AlertDialog,
  Autocomplete,
  Button,
  Card,
  Description,
  EmptyState,
  Label,
  Link,
  ListBox,
  Modal,
  ScrollShadow,
  SearchField,
  Separator,
  Spinner,
  Tooltip,
  useFilter
} from '@heroui/react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DatasetComboBox } from '@/components/DatasetComboBox';
import { ObjectTypeIcon } from '@/components/ObjectTypeIcon';
import { DataList } from '@/components/views/DataList';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { scanContentForColumns } from '@/services/columnReferences';
import { hasEffectiveMapping } from '@/services/columnRewriter';
import { getDatasetColumns } from '@/services/datasets';
import {
  compareDatasetSchemas,
  getDownstreamCards,
  getDownstreamLineage,
  MIGRATE_TYPES,
  migrateAllDownstreamContent
} from '@/services/migrateDownstreamContent';
import { getSidepanelData } from '@/utils/sidepanel';
import IconArrowsHorizontalBox from '@icons/arrows-horizontal-box.svg?react';
import IconCheckCircle from '@icons/check-circle.svg?react';
import IconCheck from '@icons/check.svg?react';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconWand from '@icons/wand.svg?react';
import IconX from '@icons/x.svg?react';

const TYPE_KEY_TO_DOMO_TYPE = {
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasetViews: 'DATA_SOURCE'
};

const UNMAPPED = '__unmapped__';

export function MigrateDownstreamContentView({ onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [datasetId, setDatasetId] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [origin, setOrigin] = useState('');
  const [tabId, setTabId] = useState(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pendingSelectAll, setPendingSelectAll] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // 'select' = pick what content to migrate; 'target' = pick the target dataset, remap, migrate.
  const [page, setPage] = useState('select');
  // { [typeKey]: { status, error?, succeeded?, failed?, count? } }
  const [transferStatus, setTransferStatus] = useState({});
  const [isTransferring, setIsTransferring] = useState(false);

  // Target-dataset selection + schema reconciliation state. Formerly lived in
  // MigrateDownstreamModal; now inline in the view (below the type groups).
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedDatasetName, setSelectedDatasetName] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState(null);
  const [targetColumns, setTargetColumns] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [columnMap, setColumnMap] = useState({});
  const [autoMapConfirmOpen, setAutoMapConfirmOpen] = useState(false);

  const mountedRef = useRef(true);
  const bailedRef = useRef(false);
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
        context.domoObject?.metadata?.name || context.domoObject?.metadata?.displayName || `Dataset ${context.domoObject.id}`
      );
      setOrigin(context.domoObject?.baseUrl || '');
      setTabId(context.tabId);
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
    loadedCount,
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

  const totalAvailable = useMemo(() => Object.values(totalsByType).reduce((a, b) => a + b, 0), [totalsByType]);

  // All three lineage fetches settled with zero downstream content: there's
  // nothing to migrate. Bail straight back to the default view with a warning
  // toast rather than painting an empty DataList (three "(0)" groups with no
  // selectable rows and a disabled migrate button). Gated on loadedCount, not
  // isFullyLoaded, because isFullyLoaded is also true in the pre-fetch window
  // when specs is empty. Skips when any fetch errored (loadedCount < total) so
  // the user can still see the failure and retry via refresh; a 0 total there
  // may just mean a fetch never returned.
  const nothingToMigrate = !isLoading && !isTransferring && loadedCount === MIGRATE_TYPES.length && totalAvailable === 0;

  // The render path short-circuits to the spinner on `nothingToMigrate` to
  // prevent a one-frame flash of the empty list before this effect navigates
  // away. The bailedRef guards against double-firing if a refresh re-settles
  // to another empty result.
  useEffect(() => {
    if (bailedRef.current) return;
    if (!nothingToMigrate) return;
    bailedRef.current = true;
    onStatusUpdate?.('Nothing to migrate', `**${datasetName}** has no downstream content to migrate`, 'warning');
    onBackToDefault?.();
  }, [nothingToMigrate, datasetName, onStatusUpdate, onBackToDefault]);

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

  // Full selected items array per type, used to scan each item's definition
  // for column references when a schema mismatch is detected. Distinct from
  // `selectedCounts` (numbers) and `selectedIds` (flat key Set).
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

  const excludeIds = useMemo(() => (datasetId ? new Set([datasetId]) : null), [datasetId]);

  // Run the schema check whenever a target dataset is picked. Clears any prior
  // comparison/scan/remap so stale results never leak across target changes.
  useEffect(() => {
    if (!selectedDatasetId || !datasetId) {
      setComparison(null);
      setComparisonError(null);
      return;
    }
    let cancelled = false;
    setIsComparing(true);
    setComparison(null);
    setComparisonError(null);
    setScanResult(null);
    setScanError(null);
    setColumnMap({});
    compareDatasetSchemas(datasetId, selectedDatasetId, tabId)
      .then((result) => {
        if (cancelled) return;
        setComparison(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setComparisonError(err?.message || 'Schema comparison failed');
      })
      .finally(() => {
        if (!cancelled) setIsComparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, selectedDatasetId, tabId]);

  // On schema mismatch, fetch the target's columns and scan the selected
  // content for column references in parallel. Both feed the remap UI.
  // Keyed on `page` (not selectedItemsByType) so it re-runs each time the user
  // lands on page 2, picking up any content-selection change made back on page
  // 1, while never firing during page-1 toggling (which would flash the remap).
  // handleMigrate still operates on the live selection regardless.
  useEffect(() => {
    if (page !== 'target') return;
    if (!comparison || comparison.compatible) return;
    if (!selectedDatasetId) return;
    let cancelled = false;
    setIsScanning(true);
    setScanError(null);

    Promise.all([
      getDatasetColumns({ datasetId: selectedDatasetId, tabId }),
      scanContentForColumns({ originId: datasetId, selectedItems: selectedItemsByType, tabId })
    ])
      .then(([cols, scan]) => {
        if (cancelled) return;
        setTargetColumns(cols ? [...cols].sort((a, b) => (a.name || '').localeCompare(b.name || '')) : []);
        setScanResult(scan);
      })
      .catch((err) => {
        if (cancelled) return;
        setScanError(err?.message || 'Failed to scan content for column references');
      })
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [comparison, datasetId, page, selectedDatasetId, tabId]);

  const hasMismatches = comparison && !comparison.compatible;

  // Columns that are BOTH used by selected content AND missing/changed in the
  // target schema. The intersection is what the user has to decide about;
  // anything outside it is either irrelevant or already compatible.
  const usedUnmappedColumns = useMemo(() => {
    if (!hasMismatches || !scanResult) return [];
    const missing = comparison?.missing || [];
    const mismatchedNames = new Set(missing.map((m) => m.name));
    // expectedType is the origin column's own type — surfaced so the user knows
    // the existing type when choosing a target column to remap onto.
    const typeByName = new Map(missing.map((m) => [m.name, m.expectedType]));
    const referenced = scanResult.byColumn || new Map();
    const out = [];
    for (const [colName, items] of referenced.entries()) {
      if (mismatchedNames.has(colName)) {
        out.push({ items, name: colName, type: typeByName.get(colName) ?? null });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [comparison, hasMismatches, scanResult]);

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
          status,
          // typeId drives the leading ObjectTypeIcon on the parent row,
          // matching the icon already shown on each leaf inside the group.
          typeId: TYPE_KEY_TO_DOMO_TYPE[t.key]
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
        const allSelected = items.every((item) => next.has(leafSelectionId(typeKey, item.id)));
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
      const inFlight = Object.values(transferStatus).filter((x) => x.status === 'transferring').length;
      const done = Object.values(transferStatus).filter((x) => x.status === 'transferred' || x.status === 'failed').length;
      const total = inFlight + done;
      return `Migrating… **${done}**/${total}`;
    }
    if (!isFullyLoaded) {
      return `Searching downstream content… (${MIGRATE_TYPES.length - loadingCount}/${MIGRATE_TYPES.length})`;
    }
    let text = `**${totalSelected}** of **${totalAvailable}** selected`;
    if (errorCount > 0) {
      text += ` (${errorCount} failed to load)`;
    }
    return text;
  }, [isTransferring, transferStatus, isFullyLoaded, loadingCount, totalAvailable, totalSelected, errorCount]);

  // The footer Migrate button stays disabled until: every fetch settled, at
  // least one item is selected, a target is chosen, and the schema check +
  // any content scan have finished without error. Mismatches do NOT disable
  // it (the user may knowingly proceed without a full remap).
  const migrateDisabled =
    !isFullyLoaded ||
    isTransferring ||
    totalSelected === 0 ||
    !selectedDatasetId ||
    isComparing ||
    isScanning ||
    comparisonError !== null ||
    scanError !== null;

  // CTA wording reflects the schema state: a clean migrate, a migrate that
  // will apply the user's column remap, or an explicit proceed-despite-mismatch.
  const migrateLabel = useMemo(() => {
    if (!hasMismatches) return 'Migrate';
    return hasEffectiveMapping(columnMap) ? 'Migrate with Remap' : 'Proceed Anyway';
  }, [columnMap, hasMismatches]);

  const handleColumnChoice = useCallback((originName, choice) => {
    setColumnMap((prev) => {
      const next = { ...prev };
      if (choice === UNMAPPED || choice == null) {
        next[originName] = null;
      } else {
        next[originName] = choice;
      }
      return next;
    });
  }, []);

  // Auto-map each origin column to the target column whose name matches once
  // both are normalized (lowercased, with spaces/hyphens/underscores stripped).
  // No normalized match leaves the column unmapped. This OVERWRITES every
  // existing choice, which is why handleAutoMapClick gates on a confirm dialog
  // when anything is already mapped.
  const runAutoMap = useCallback(() => {
    const normalize = (s) => (s || '').toLowerCase().replace(/[\s\-_]/g, '');
    const targetByNormalized = new Map();
    for (const col of targetColumns) {
      const key = normalize(col.name);
      // First match wins; targetColumns is sorted, so this is deterministic.
      if (key && !targetByNormalized.has(key)) targetByNormalized.set(key, col.name);
    }
    const next = {};
    for (const { name } of usedUnmappedColumns) {
      next[name] = targetByNormalized.get(normalize(name)) ?? null;
    }
    setColumnMap(next);
  }, [targetColumns, usedUnmappedColumns]);

  const handleAutoMapClick = useCallback(() => {
    const alreadyMapped = Object.values(columnMap).some((to) => to != null);
    if (alreadyMapped) {
      setAutoMapConfirmOpen(true);
    } else {
      runAutoMap();
    }
  }, [columnMap, runAutoMap]);

  // Confirmed migrate. Assembles the same payload the old modal submitted, then
  // drives migrateAllDownstreamContent and threads per-type progress into the
  // DataList rows (unchanged from the prior flow).
  const handleMigrate = useCallback(async () => {
    setConfirmOpen(false);

    const targetColumnTypes = {};
    for (const col of targetColumns) {
      if (col?.name && col?.type) targetColumnTypes[col.name] = col.type;
    }
    const definitionsByItemKey = scanResult?.byItem || new Map();
    const useFullPath = Boolean(hasMismatches);
    const targetId = selectedDatasetId;
    const targetName = selectedDatasetName;
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
  }, [
    columnMap,
    datasetId,
    hasMismatches,
    scanResult,
    selectedDatasetId,
    selectedDatasetName,
    selectedItemsByType,
    showStatus,
    tabId,
    targetColumns
  ]);

  if (isLoading || nothingToMigrate) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading...</p>
        </Card.Content>
      </Card>
    );
  }

  // Page 1: choose what downstream content to migrate. The type groups live in
  // the DataList; the only footer action is Next, which advances to page 2.
  if (page === 'select') {
    return (
      <DataList
        fillHeight={true}
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
        title={`Migrate Content of **${datasetName}**`}
        titleLineClamp={2}
        onClose={onBackToDefault}
        onRefresh={refreshFetches}
        onSelectionChange={handleSelectionChange}
        onStatusUpdate={onStatusUpdate}
        footer={
          <Button
            fullWidth
            isDisabled={!isFullyLoaded || isTransferring || totalSelected === 0}
            size='sm'
            variant='primary'
            onPress={() => setPage('target')}
          >
            Next
          </Button>
        }
      />
    );
  }

  // Page 2: pick the target dataset, reconcile schema (warn + remap), migrate.
  // Aggregate transfer progress, since the per-type rows live on page 1.
  const migratedDone = Object.values(transferStatus).filter(
    (x) => x.status === 'transferred' || x.status === 'failed'
  ).length;
  const migratedTotal = Object.values(transferStatus).length;

  return (
    <>
      <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
        <Card.Header className='gap-1'>
          <Card.Title className='line-clamp-2 min-w-0 pr-8'>
            Migrate Content of <strong>{datasetName}</strong>
          </Card.Title>
          <Tooltip closeDelay={0} delay={800}>
            <Button
              isIconOnly
              aria-label='Close'
              className='absolute top-1 right-2'
              size='sm'
              variant='ghost'
              onPress={onBackToDefault}
            >
              <IconX />
            </Button>
            <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
              Close
            </Tooltip.Content>
          </Tooltip>
        </Card.Header>
        <Separator />
        <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
          <Card.Content className='flex flex-col gap-2 py-2'>
            <DatasetComboBox
              className='min-w-0'
              excludeIds={excludeIds}
              instanceBaseUrl={origin}
              label='To Dataset'
              maxListHeight='max-h-120'
              selectedDisplayName={selectedDatasetName}
              selectedKey={selectedDatasetId}
              tabId={tabId}
              onSelectionChange={(key, name) => {
                setSelectedDatasetId(key);
                setSelectedDatasetName(name ?? null);
              }}
            />

            {isComparing && (
              <div className='flex items-center gap-2 text-xs text-muted'>
                <Spinner size='sm' />
                <span>Comparing schemas…</span>
              </div>
            )}

            {comparisonError && (
              <Alert className='w-full border border-border bg-transparent' status='danger'>
                <Alert.Indicator>
                  <IconExclamationPointCircle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>Schema check failed</Alert.Title>
                  <Alert.Description>{comparisonError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {hasMismatches && (
              <Alert className='w-full border border-border bg-transparent' status='warning'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {comparison.missing.length === 1
                      ? "1 column doesn't match"
                      : `${comparison.missing.length} columns don't match`}
                  </Alert.Title>
                  <Alert.Description>
                    Best practice is to align schemas before migrating content. Proceeding here is your responsibility;
                    broken column references can cause cards to render blank, dataflows to fail, and views to error. Validate
                    every result.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {comparison?.compatible && (
              <Alert className='w-full border border-border bg-transparent' status='success'>
                <Alert.Indicator>
                  <IconCheckCircle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>Schemas are compatible</Alert.Title>
                </Alert.Content>
              </Alert>
            )}

            {hasMismatches && isScanning && (
              <div className='flex items-center gap-2 text-xs text-muted'>
                <Spinner size='sm' />
                <span>Scanning content for column references…</span>
              </div>
            )}

            {hasMismatches && scanError && (
              <Alert className='w-full border border-border bg-transparent' status='danger'>
                <Alert.Indicator>
                  <IconExclamationPointCircle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>Column scan failed</Alert.Title>
                  <Alert.Description>{scanError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {hasMismatches && !isScanning && scanResult && usedUnmappedColumns.length > 0 && (
              <div className='flex flex-col gap-1'>
                <div className='flex items-center justify-between gap-2'>
                  <Label className='text-sm font-medium'>Column Remap</Label>
                  <Tooltip closeDelay={0} delay={800}>
                    <Button size='sm' startContent={<IconWand />} variant='secondary' onPress={handleAutoMapClick}>
                      Auto Map
                    </Button>
                    <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'>
                      Fills each column with the closest target column once names are normalized (case, spaces, hyphens, and
                      underscores). Columns with no match are left unmapped. Review before migrating.
                    </Tooltip.Content>
                  </Tooltip>
                </div>
                <Description className='text-xs'>
                  Map each origin column to a column on the target dataset, or leave it unmapped (you'll need to fix
                  references manually). Only columns actually referenced by the selected content are shown.
                </Description>
                <div className='flex flex-col divide-y divide-border'>
                  {usedUnmappedColumns.map(({ items, name, type }) => (
                    <ColumnMapRow
                      collisions={scanResult?.dataflowCollisions?.get?.(name) || null}
                      items={items}
                      key={name}
                      mappedTo={columnMap[name] ?? UNMAPPED}
                      origin={origin}
                      originName={name}
                      originType={type}
                      targetColumns={targetColumns}
                      totalSelected={totalSelected}
                      onChange={(choice) => handleColumnChoice(name, choice)}
                    />
                  ))}
                </div>
              </div>
            )}

            {hasMismatches && !isScanning && scanResult && usedUnmappedColumns.length === 0 && (
              <Alert className='w-full border border-border bg-transparent' status='default'>
                <Alert.Indicator>
                  <IconInfoCircle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Description>
                    None of the mismatched columns are referenced by the selected content. Safe to proceed without remapping,
                    but data may still be missing in the target.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {isTransferring && (
              <div className='flex items-center gap-2 text-xs text-muted'>
                <Spinner size='sm' />
                <span>
                  Migrating… <span className='font-medium text-foreground'>{migratedDone}</span>/{migratedTotal}
                </span>
              </div>
            )}
          </Card.Content>
        </ScrollShadow>
        <Separator className='mt-1.5' />
        <div className='flex shrink-0 gap-2 pt-2'>
          <Button isDisabled={isTransferring} size='sm' variant='tertiary' onPress={() => setPage('select')}>
            Back
          </Button>
          <Button
            fullWidth
            isDisabled={migrateDisabled}
            size='sm'
            startContent={<IconArrowsHorizontalBox />}
            variant='primary'
            onPress={() => setConfirmOpen(true)}
          >
            {migrateLabel}
          </Button>
        </div>
      </Card>
      <AlertDialog
        isOpen={confirmOpen}
        onOpenChange={(open) => {
          if (!open) setConfirmOpen(false);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-warning' />
              <AlertDialog.CloseTrigger className='absolute top-3 right-2' variant='ghost'>
                <IconX />
              </AlertDialog.CloseTrigger>
              <AlertDialog.Header>
                <AlertDialog.Heading className='flex items-center gap-2'>
                  <IconExclamationTriangle className='text-warning' />
                  Migrate downstream content?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className='flex flex-col gap-2 text-sm'>
                <p>
                  This repoints <span className='font-medium'>{totalSelected}</span> downstream item
                  {totalSelected === 1 ? '' : 's'} from <span className='font-medium'>{datasetName}</span> onto the selected
                  dataset.
                </p>
                {hasMismatches && (
                  <p className='text-warning'>
                    The schemas don't fully match
                    {hasEffectiveMapping(columnMap) ? ' and your remap will be applied' : ''}. Unmapped column references can
                    break cards, dataflows, and views. Validate every result.
                  </p>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button isDisabled={isTransferring} size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button
                  className='bg-warning text-warning-foreground hover:bg-warning-hover'
                  isDisabled={isTransferring}
                  size='sm'
                  variant='primary'
                  onPress={handleMigrate}
                >
                  {migrateLabel}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
      <AlertDialog
        isOpen={autoMapConfirmOpen}
        onOpenChange={(open) => {
          if (!open) setAutoMapConfirmOpen(false);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-warning' />
              <AlertDialog.CloseTrigger className='absolute top-3 right-2' variant='ghost'>
                <IconX />
              </AlertDialog.CloseTrigger>
              <AlertDialog.Header>
                <AlertDialog.Heading className='flex items-center gap-2'>
                  <IconExclamationTriangle className='text-warning' />
                  Overwrite existing mappings?
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className='text-sm'>
                <p>
                  Auto Map replaces every column you've already mapped with its closest normalized match and clears any
                  column it can't match. Mappings you've set manually will be overwritten.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button
                  size='sm'
                  startContent={<IconWand />}
                  variant='primary'
                  onPress={() => {
                    runAutoMap();
                    setAutoMapConfirmOpen(false);
                  }}
                >
                  Auto Map
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

function buildLeafItems(typeKey, items, origin) {
  return items.map(
    (item) =>
      new DataListItem({
        id: leafSelectionId(typeKey, item.id),
        label: item.name || String(item.id),
        originalId: item.id,
        typeId: TYPE_KEY_TO_DOMO_TYPE[typeKey],
        url: buildObjectUrl(typeKey, item, origin)
      })
  );
}

// Best-effort Domo object URL for a scanned content item. Mirrors the leaf-row
// link building so both the type groups and the usages modal point at the same
// place. Returns null when the type/origin is unknown or the URL can't be built.
function buildObjectUrl(typeKey, item, origin) {
  const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
  if (!domoTypeId || !origin) return null;
  try {
    return new DomoObject(domoTypeId, item.id, origin, { name: item.name }).url;
  } catch {
    return null;
  }
}

function ColumnMapRow({
  collisions,
  items,
  mappedTo,
  onChange,
  origin,
  originName,
  originType,
  targetColumns,
  totalSelected
}) {
  // Case-insensitive "contains" match for the Autocomplete's local filter, so
  // the user can type to narrow a long target-column list.
  const { contains } = useFilter({ sensitivity: 'base' });

  // Aggregate collisions by dataflow. Many other-inputs may share the same
  // column name; the user mostly cares which dataflows are affected.
  const collisionByDataflow = useMemo(() => {
    if (!collisions || collisions.length === 0) return [];
    const m = new Map();
    for (const c of collisions) {
      if (!m.has(c.dataflowId)) {
        m.set(c.dataflowId, { dataflowName: c.dataflowName, otherInputs: new Set() });
      }
      m.get(c.dataflowId).otherInputs.add(c.otherInputName);
    }
    return [...m.entries()].map(([id, v]) => ({
      dataflowId: id,
      dataflowName: v.dataflowName,
      otherInputs: [...v.otherInputs]
    }));
  }, [collisions]);

  return (
    <div className='flex flex-col gap-1 py-1.5'>
      {collisionByDataflow.length > 0 && (
        <Alert className='w-full border border-border bg-transparent' status='warning'>
          <Alert.Indicator>
            <IconExclamationTriangle data-slot='alert-default-icon' />
          </Alert.Indicator>
          <Alert.Content>
            <Alert.Title>
              Cross-input collision: <span className='font-mono font-bold'>{originName}</span> also exists on{' '}
              {collisionByDataflow.length === 1 ? (
                <>
                  another input of{' '}
                  <span className='inline-flex items-center gap-0.5 align-text-bottom'>
                    <ObjectTypeIcon className='size-3.5 shrink-0' typeId='DATAFLOW_TYPE' />
                    {collisionByDataflow[0].dataflowName}
                  </span>
                </>
              ) : (
                `other inputs of ${collisionByDataflow.length} dataflows`
              )}
            </Alert.Title>
            <Alert.Description>
              Remapping will rewrite every reference to <span className='font-mono font-medium'>{originName}</span> in the
              affected dataflow
              {collisionByDataflow.length === 1 ? '' : 's'}, including refs that came from{' '}
              {collisionByDataflow.length === 1
                ? collisionByDataflow[0].otherInputs.map((name, i) => (
                    <Fragment key={name}>
                      {i > 0 ? ', ' : ''}
                      <span className='inline-flex items-center gap-0.5 align-text-bottom'>
                        <ObjectTypeIcon className='size-3.5 shrink-0' typeId='DATA_SOURCE' />
                        <span className='font-medium'>{name}</span>
                      </span>
                    </Fragment>
                  ))
                : 'other inputs'}
              . Consider leaving this unmapped and fixing the dataflow manually.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <div className='flex items-center gap-2'>
        <div className='flex min-w-0 flex-1 flex-col'>
          <span className='truncate font-mono text-xs' title={originName}>
            {originName}
          </span>
          <span className='flex items-center gap-1 text-[10px] text-muted'>
            {originType && (
              <>
                <span className='font-mono'>{originType}</span>
                <span aria-hidden='true'>·</span>
              </>
            )}
            <span>
              {items.length} use{items.length === 1 ? '' : 's'}
            </span>
            <ColumnUsagesModal items={items} origin={origin} originName={originName} totalSelected={totalSelected} />
          </span>
        </div>
        <Autocomplete
          aria-label={`Map ${originName} to`}
          className='w-44'
          selectionMode='single'
          value={mappedTo}
          onChange={(key) => onChange(key)}
        >
          <Autocomplete.Trigger>
            {/* Render only the column name (not its type) so the selected value stays one
                line and the trigger doesn't grow taller than the "Leave unmapped" state. */}
            <Autocomplete.Value>
              {() =>
                mappedTo === UNMAPPED ? (
                  <span className='text-muted italic'>Leave unmapped</span>
                ) : (
                  <span className='truncate font-mono text-xs'>{mappedTo}</span>
                )
              }
            </Autocomplete.Value>
            <Autocomplete.ClearButton />
            <Autocomplete.Indicator />
          </Autocomplete.Trigger>
          <Autocomplete.Popover className='w-9/10' placement='bottom end'>
            <Autocomplete.Filter filter={contains}>
              <SearchField
                autoFocus
                aria-label={`Search columns for ${originName}`}
                name='column-search'
                variant='secondary'
              >
                <SearchField.Group>
                  <SearchField.SearchIcon />
                  <SearchField.Input placeholder='Search columns...' />
                  <SearchField.ClearButton />
                </SearchField.Group>
              </SearchField>
              <ListBox
                className='max-h-80 overflow-y-auto'
                renderEmptyState={() => <EmptyState>No columns found</EmptyState>}
              >
                <ListBox.Item id={UNMAPPED} textValue='Leave unmapped'>
                  <span className='text-muted italic'>Leave unmapped</span>
                  <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                </ListBox.Item>
                {targetColumns.map((col) => (
                  <ListBox.Item id={col.name} key={col.name} textValue={col.name}>
                    <div className='flex min-w-0 flex-col'>
                      <span className='truncate font-mono text-xs' title={col.name}>
                        {col.name}
                      </span>
                      {col.type && <span className='text-[10px] text-muted'>{col.type}</span>}
                    </div>
                    <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                  </ListBox.Item>
                ))}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      </div>
    </div>
  );
}

// Info-icon modal listing every selected piece of content that references the
// origin column, sectioned by content type. The info icon itself is the modal
// trigger (React Aria wires onPress through the Modal's DialogTrigger).
function ColumnUsagesModal({ items, origin, originName, totalSelected }) {
  return (
    <Modal>
      <Button
        isIconOnly
        aria-label={`Show where ${originName} is used`}
        className='size-4 min-h-0 p-0 text-muted hover:text-foreground'
        size='sm'
        variant='ghost'
      >
        <IconInfoCircle className='size-3.5' />
      </Button>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2 pt-3'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className='flex flex-col gap-1 truncate pr-6'>
                <span className='font-mono'>{originName}</span>
                <Description>
                  Referenced by {items.length} of {totalSelected} selected item{totalSelected === 1 ? '' : 's'}.
                </Description>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className='flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-foreground'>
              {MIGRATE_TYPES.map((t) => {
                const typeItems = items
                  .filter((it) => it.type === t.key)
                  .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                if (typeItems.length === 0) return null;
                return (
                  <div className='flex min-w-0 flex-col gap-1' key={t.key}>
                    <div className='flex items-center gap-1.5'>
                      <ObjectTypeIcon className='size-4 shrink-0' typeId={TYPE_KEY_TO_DOMO_TYPE[t.key]} />
                      <span className='font-bold'>{t.label}</span>
                      <span className='text-xs text-muted'>({typeItems.length})</span>
                    </div>
                    <ul className='flex min-w-0 flex-col gap-0.5 pl-1.5'>
                      {typeItems.map((it) => {
                        const url = buildObjectUrl(t.key, it, origin);
                        return (
                          <li className='flex min-w-0 items-baseline gap-1.5' key={`${it.type}:${it.id}`}>
                            <span aria-hidden='true' className='shrink-0 text-sm text-muted'>
                              •
                            </span>
                            {url ? (
                              <Link
                                className='min-w-0 truncate text-sm no-underline decoration-accent hover:text-accent hover:underline'
                                href={url}
                                target='_blank'
                                title={it.name}
                              >
                                {it.name}
                              </Link>
                            ) : (
                              <span className='min-w-0 truncate text-sm' title={it.name}>
                                {it.name}
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
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
