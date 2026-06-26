import {
  Alert,
  AlertDialog,
  Button,
  Card,
  Chip,
  ComboBox,
  EmptyState,
  Input,
  ListBox,
  ScrollShadow,
  Separator,
  Spinner,
  Tooltip
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { ColumnUsagesModal } from '@/components/views/ColumnUsagesModal';
import { DataList } from '@/components/views/DataList';
import { ViewHeader } from '@/components/views/ViewHeader';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getObjectType } from '@/models/DomoObjectType';
import { scanContentForColumns } from '@/services/columnReferences';
import { getDatasetColumns } from '@/services/datasets';
import { getDatasetFunctions } from '@/services/functions';
import { getDownstreamCards, getDownstreamCardsRaw, getDownstreamLineage } from '@/services/migrateDownstreamContent';
import { findAppColumnCollisions, getDownstreamApps } from '@/services/proCodeApps';
import { remapDatasetColumns } from '@/services/remapDatasetColumns';
import { buildRefreshAction, buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconColumnEdit from '@icons/column-edit.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconPlus from '@icons/plus.svg?react';
import IconTrash from '@icons/trash.svg?react';
import IconX from '@icons/x.svg?react';

const REMAP_TYPES = [
  { key: 'beastModes' },
  { key: 'cards' },
  { key: 'dataflows' },
  { key: 'datasets' },
  { key: 'apps' }
];

const TYPE_KEY_TO_DOMO_TYPE = {
  apps: 'RYUU_APP',
  beastModes: 'BEAST_MODE_FORMULA',
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE'
};

export function RemapColumnsView({ currentContext = null, instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [datasetId, setDatasetId] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [origin, setOrigin] = useState('');
  const [tabId, setTabId] = useState(null);

  const [schemaColumns, setSchemaColumns] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);

  // Each row maps one old column name to a new one. `key` is a stable client id
  // so React can track rows as the user adds/removes them. Orphan-discovered rows
  // seed `oldName`; the user fills `newName`.
  const [rows, setRows] = useState([]);
  const [seededOrphans, setSeededOrphans] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferStatus, setTransferStatus] = useState({});
  const [isTransferring, setIsTransferring] = useState(false);
  // 'map' = build the old -> new column mappings; 'select' = pick which affected
  // content to rewrite, then apply. Opposite order from Migrate Content, whose
  // first page is the selection and whose second is the column work.
  const [page, setPage] = useState('map');

  const mountedRef = useRef(true);
  const rowKeyRef = useRef(0);
  const { showStatus } = useStatusBar(onStatusUpdate);

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'remapColumns') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context || context.domoObject?.typeId !== 'DATA_SOURCE') {
        onStatusUpdate?.('Error', 'Remap Columns requires a dataset in scope', 'danger');
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
      console.error('[RemapColumnsView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // Current dataset schema — the source of valid "new" column names and the
  // reference set that makes a downstream column reference count as "orphaned"
  // (referenced but no longer present).
  useEffect(() => {
    if (!datasetId) return;
    let cancelled = false;
    getDatasetColumns({ datasetId, tabId })
      .then((cols) => {
        if (!cancelled) setSchemaColumns(Array.isArray(cols) ? cols : []);
      })
      .catch(() => {
        if (!cancelled) setSchemaColumns([]);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, tabId]);

  const specs = useMemo(() => {
    if (!datasetId) return [];
    let lineagePromise = null;
    const lineage = () => {
      if (!lineagePromise) lineagePromise = getDownstreamLineage(datasetId, tabId);
      return lineagePromise;
    };
    // Cards and pro-code apps both come from the dataset → cards endpoint. Share
    // one in-flight fetch so it isn't hit twice (mirrors the lineage promise).
    let cardsRawPromise = null;
    const cardsRaw = () => {
      if (!cardsRawPromise) cardsRawPromise = getDownstreamCardsRaw(datasetId, tabId);
      return cardsRawPromise;
    };
    return [
      { fetch: async () => ({ items: await getDatasetFunctions(datasetId, tabId) }), key: 'beastModes' },
      { fetch: async () => ({ items: await getDownstreamCards(datasetId, tabId, await cardsRaw()) }), key: 'cards' },
      { fetch: async () => ({ items: await getDownstreamApps(datasetId, tabId, await cardsRaw()) }), key: 'apps' },
      {
        fetch: async () => {
          const { datasets } = await lineage();
          return { items: datasets };
        },
        key: 'datasets'
      },
      {
        fetch: async () => {
          const { dataflows } = await lineage();
          return { items: dataflows };
        },
        key: 'dataflows'
      }
    ];
  }, [datasetId, tabId]);

  const { isFullyLoaded, loadedCount, loadingCount, refresh, results } = useParallelFetches(specs);

  // Every loaded downstream item, by type, used both to scan for column
  // references and to resolve a usage back to its full record (for the card urn,
  // names, links).
  const allItemsByType = useMemo(() => {
    const acc = { apps: [], beastModes: [], cards: [], dataflows: [], datasets: [] };
    for (const t of REMAP_TYPES) {
      const r = results[t.key];
      acc[t.key] = r?.status === 'loaded' ? r.items?.items || [] : [];
    }
    return acc;
  }, [results]);

  const totalAvailable = useMemo(
    () => REMAP_TYPES.reduce((sum, t) => sum + allItemsByType[t.key].length, 0),
    [allItemsByType]
  );

  // Every downstream card (parents and drills) keyed by id, so the column-usages
  // modal can resolve a drill's parent card and nest it correctly.
  const cardsById = useMemo(() => {
    const m = new Map();
    for (const c of allItemsByType.cards) m.set(String(c.id), c);
    return m;
  }, [allItemsByType]);

  // Nothing references this dataset: there is nothing to repair. Bail back to the
  // default view with a note rather than painting empty tables.
  const bailedRef = useRef(false);
  const nothingDownstream = !isLoading && !isTransferring && loadedCount === REMAP_TYPES.length && totalAvailable === 0;
  useEffect(() => {
    if (bailedRef.current || !nothingDownstream) return;
    bailedRef.current = true;
    onStatusUpdate?.('Nothing to remap', `**${datasetName}** has no downstream content`, 'warning');
    onBackToDefault?.();
  }, [datasetName, nothingDownstream, onBackToDefault, onStatusUpdate]);

  // Scan all downstream content once it has loaded. The scan caches each item's
  // definition (reused at apply time) and tells us which columns each references,
  // which is how orphaned (now-missing) columns are discovered.
  useEffect(() => {
    if (!isFullyLoaded || !datasetId || totalAvailable === 0) return;
    let cancelled = false;
    setIsScanning(true);
    setScanError(null);
    scanContentForColumns({ originId: datasetId, selectedItems: allItemsByType, tabId })
      .then((result) => {
        if (!cancelled) setScanResult(result);
      })
      .catch((err) => {
        if (!cancelled) setScanError(err?.message || 'Failed to scan downstream content');
      })
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [allItemsByType, datasetId, isFullyLoaded, tabId, totalAvailable]);

  const schemaColumnNames = useMemo(() => new Set(schemaColumns.map((c) => c.name)), [schemaColumns]);
  const schemaTypeByName = useMemo(() => {
    const m = new Map();
    for (const c of schemaColumns) if (c?.name) m.set(c.name, c.type || null);
    return m;
  }, [schemaColumns]);

  // Columns referenced by downstream content that are no longer on the dataset:
  // the broken references a direct rename leaves behind, and the prime candidates
  // for an old -> new mapping.
  const orphanCandidates = useMemo(() => {
    if (!scanResult?.byColumn) return [];
    const out = [];
    for (const [name, usages] of scanResult.byColumn.entries()) {
      // Still on the dataset, so not a broken reference.
      if (schemaColumnNames.has(name)) continue;
      // Skip references that were never user columns (Beast Mode ids, object
      // ids, system columns) so they don't masquerade as renamed columns.
      if (!isLikelyRenamedColumn(name)) continue;
      // Only trust cards, dataset Beast Modes, and pro-code apps for discovery:
      // each is bound to this dataset alone, so every column they reference is
      // one of its columns. Dataflows and dataset views join other datasets, so
      // a name missing here may simply be another input's column, not a renamed
      // one. (Such columns are still rewritten if the user maps them, and can
      // always be entered by hand.)
      if (!usages.some((u) => u.type === 'apps' || u.type === 'beastModes' || u.type === 'cards')) continue;
      out.push(name);
    }
    return out.sort((a, b) => a.localeCompare(b));
  }, [scanResult, schemaColumnNames]);

  // Seed one remap row per discovered orphan the first time a scan resolves, so
  // the common "I renamed a column and broke everything" case is pre-filled.
  useEffect(() => {
    if (seededOrphans || !scanResult) return;
    setSeededOrphans(true);
    if (orphanCandidates.length === 0) {
      setRows([{ key: `r${rowKeyRef.current++}`, newName: '', oldName: '' }]);
      return;
    }
    setRows(orphanCandidates.map((name) => ({ key: `r${rowKeyRef.current++}`, newName: '', oldName: name })));
  }, [orphanCandidates, scanResult, seededOrphans]);

  // Old -> new map for rows the user has fully filled in (and that actually
  // change something). Skips blank and self-mapping rows.
  const columnMap = useMemo(() => {
    const map = {};
    for (const row of rows) {
      const oldName = row.oldName?.trim();
      const newName = row.newName?.trim();
      if (oldName && newName && oldName !== newName) map[oldName] = newName;
    }
    return map;
  }, [rows]);

  // Downstream items that reference one of the mapped old columns, by type, with
  // the full loaded record (carrying the card urn for drills). Deduped by id
  // across columns. This is exactly what a remap will rewrite.
  const affectedByType = useMemo(() => {
    const acc = { apps: [], beastModes: [], cards: [], dataflows: [], datasets: [] };
    if (!scanResult?.byColumn) return acc;
    const itemsById = {};
    for (const t of REMAP_TYPES) {
      itemsById[t.key] = new Map(allItemsByType[t.key].map((i) => [String(i.id), i]));
    }
    const seen = { apps: new Set(), beastModes: new Set(), cards: new Set(), dataflows: new Set(), datasets: new Set() };
    for (const oldName of Object.keys(columnMap)) {
      for (const usage of scanResult.byColumn.get(oldName) || []) {
        const { id, type } = usage;
        if (!acc[type] || seen[type].has(String(id))) continue;
        seen[type].add(String(id));
        acc[type].push(itemsById[type]?.get(String(id)) || { id, name: usage.name });
      }
    }
    return acc;
  }, [allItemsByType, columnMap, scanResult]);

  const affectedLeafIds = useMemo(() => {
    const ids = new Set();
    for (const t of REMAP_TYPES) {
      for (const item of affectedByType[t.key]) ids.add(leafSelectionId(t.key, item.id));
    }
    return ids;
  }, [affectedByType]);

  // Reset the selection to "all affected" only when the affected set actually
  // changes (the mapping changed). Editing a half-finished row that doesn't yet
  // form a mapping leaves the set untouched, so the user's deselections persist.
  const affectedKeyRef = useRef('');
  useEffect(() => {
    const key = [...affectedLeafIds].sort().join('|');
    if (key === affectedKeyRef.current) return;
    affectedKeyRef.current = key;
    const next = new Set(affectedLeafIds);
    for (const t of REMAP_TYPES) {
      if (affectedByType[t.key].length > 0) next.add(t.key);
    }
    setSelectedIds(next);
  }, [affectedByType, affectedLeafIds]);

  const selectedItemsByType = useMemo(() => {
    const acc = { apps: [], beastModes: [], cards: [], dataflows: [], datasets: [] };
    for (const t of REMAP_TYPES) {
      for (const item of affectedByType[t.key]) {
        if (selectedIds.has(leafSelectionId(t.key, item.id))) acc[t.key].push(item);
      }
    }
    return acc;
  }, [affectedByType, selectedIds]);

  const totalSelected = useMemo(
    () => REMAP_TYPES.reduce((sum, t) => sum + selectedItemsByType[t.key].length, 0),
    [selectedItemsByType]
  );

  // Pro-code apps whose column renames would collapse two or more aliases onto
  // the same column, blanking those fields (the app reads each column once).
  const appColumnCollisions = useMemo(() => {
    const out = [];
    for (const app of selectedItemsByType.apps || []) {
      const collisions = findAppColumnCollisions(app.fields, columnMap);
      if (collisions.length > 0) out.push({ collisions, id: app.id, name: app.name || String(app.id) });
    }
    return out;
  }, [columnMap, selectedItemsByType]);

  // Always render a group per type, even at zero affected items, so the four
  // categories stay visible as a consistent rundown (matching the Migrate
  // Content list). Empty groups aren't selectable or expandable.
  const dataListItems = useMemo(() => {
    return REMAP_TYPES.map((t) => {
      const items = affectedByType[t.key];
      const xfer = transferStatus[t.key];
      const leaves = items.map(
        (item) =>
          new DataListItem({
            id: leafSelectionId(t.key, item.id),
            label: item.name || String(item.id),
            originalId: item.id,
            typeId: TYPE_KEY_TO_DOMO_TYPE[t.key],
            url: buildObjectUrl(t.key, item, origin)
          })
      );
      return new DataListItem({
        children: leaves,
        count: xfer?.count ?? items.length,
        error: xfer?.error || null,
        errorDetail: xfer?.errorDetail || null,
        id: t.key,
        isVirtualParent: true,
        label: typeGroupLabel(t.key),
        status: xfer?.status ?? 'loaded',
        typeId: TYPE_KEY_TO_DOMO_TYPE[t.key]
      });
    });
  }, [affectedByType, origin, transferStatus]);

  // Decide which type groups start expanded. When only one category has any
  // affected content, expand it outright (however many items it holds) so the
  // sole non-empty group isn't left collapsed behind a click. Otherwise expand
  // just the groups holding a single item, so a lone entry is visible while
  // multi-item groups stay collapsed.
  const defaultExpandedGroupIds = useMemo(() => {
    const groupsWithChildren = dataListItems.filter((group) => group.children?.length > 0);
    if (groupsWithChildren.length === 1) return [groupsWithChildren[0].id];
    return groupsWithChildren.filter((group) => group.children.length === 1).map((group) => group.id);
  }, [dataListItems]);

  const isSelectable = useCallback((item) => (item.isVirtualParent ? item.children?.length > 0 : true), []);

  const handleSelectionChange = useCallback(
    (incoming) => {
      const prev = selectedIds;
      const added = [...incoming].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !incoming.has(id));
      const next = new Set(incoming);

      const propagateParent = (typeKey, isAdding) => {
        for (const item of affectedByType[typeKey] || []) {
          const leafId = leafSelectionId(typeKey, item.id);
          if (isAdding) next.add(leafId);
          else next.delete(leafId);
        }
      };
      const reconcileLeafParent = (typeKey) => {
        const items = affectedByType[typeKey] || [];
        if (items.length === 0) return;
        const allSelected = items.every((item) => next.has(leafSelectionId(typeKey, item.id)));
        if (allSelected) next.add(typeKey);
        else next.delete(typeKey);
      };

      for (const id of added) if (isParentKey(id)) propagateParent(id, true);
      for (const id of removed) if (isParentKey(id)) propagateParent(id, false);
      const touched = new Set();
      for (const id of [...added, ...removed]) {
        const typeKey = parseLeafTypeKey(id);
        if (typeKey) touched.add(typeKey);
      }
      for (const typeKey of touched) reconcileLeafParent(typeKey);

      setSelectedIds(next);
    },
    [affectedByType, selectedIds]
  );

  const setRow = useCallback((key, patch) => {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);
  const removeRow = useCallback((key) => {
    setRows((prev) => prev.filter((r) => r.key !== key));
  }, []);
  const addRow = useCallback(() => {
    setRows((prev) => [...prev, { key: `r${rowKeyRef.current++}`, newName: '', oldName: '' }]);
  }, []);

  const sqlDataflowWarnings = scanResult?.dataflowSqlWarnings || [];
  const viewFusionWarnings = scanResult?.viewFusionWarnings || [];

  const handleRemap = useCallback(async () => {
    setConfirmOpen(false);
    const selectedItems = selectedItemsByType;
    const targetColumnTypes = {};
    for (const col of schemaColumns) if (col?.name && col?.type) targetColumnTypes[col.name] = col.type;

    const initialStatus = {};
    for (const t of REMAP_TYPES) {
      if (selectedItems[t.key].length > 0)
        initialStatus[t.key] = { count: selectedItems[t.key].length, status: 'transferring' };
    }
    setTransferStatus(initialStatus);
    setIsTransferring(true);

    try {
      const transferResults = await remapDatasetColumns({
        columnMap,
        datasetId,
        datasetName,
        definitionsByItemKey: scanResult?.byItem || new Map(),
        onProgress: ({ count, result, status, typeKey }) => {
          if (!mountedRef.current) return;
          setTransferStatus((prevStatus) => {
            const nextStatus = { ...prevStatus };
            if (status === 'transferring') {
              nextStatus[typeKey] = { count, status: 'transferring' };
            } else if (status === 'done') {
              const failed = result?.failed ?? 0;
              const succeeded = result?.succeeded ?? 0;
              nextStatus[typeKey] = {
                count: count ?? succeeded + failed,
                error: failed > 0 ? formatErrors(result) : null,
                errorDetail: failed > 0 ? (result?.errors ?? null) : null,
                failed,
                status: failed > 0 ? 'failed' : 'transferred',
                succeeded
              };
            }
            return nextStatus;
          });
        },
        selectedItems,
        tabId,
        targetColumnTypes
      });

      let totalSucceeded = 0;
      let totalFailed = 0;
      let totalManualReview = 0;
      for (const [, r] of transferResults) {
        totalSucceeded += r.succeeded || 0;
        totalFailed += r.failed || 0;
        totalManualReview += r.manualReview?.length || 0;
      }
      const reviewNote =
        totalManualReview > 0
          ? ` ${totalManualReview} SQL dataflow${totalManualReview !== 1 ? 's' : ''} flagged for manual review.`
          : '';

      if (totalFailed > 0) {
        showStatus(
          'Remap Partially Complete',
          `**${totalSucceeded}** updated, **${totalFailed}** failed.${reviewNote}`,
          'warning',
          7000
        );
      } else {
        showStatus(
          'Remap Complete',
          `Updated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''}.${reviewNote}`,
          totalManualReview > 0 ? 'warning' : 'success',
          totalManualReview > 0 ? 9000 : 7000
        );
        onBackToDefault?.();
      }
    } catch (err) {
      showStatus('Remap Failed', err.message || 'An error occurred', 'danger', 7000);
      if (mountedRef.current) {
        setTransferStatus((prevStatus) => {
          const nextStatus = { ...prevStatus };
          for (const key of Object.keys(nextStatus)) {
            if (nextStatus[key].status === 'transferring') {
              nextStatus[key] = { ...nextStatus[key], error: err.message || 'Remap failed', status: 'failed' };
            }
          }
          return nextStatus;
        });
      }
    } finally {
      if (mountedRef.current) setIsTransferring(false);
    }
  }, [
    columnMap,
    datasetId,
    datasetName,
    onBackToDefault,
    scanResult,
    schemaColumns,
    selectedItemsByType,
    showStatus,
    tabId
  ]);

  if (isLoading || nothingDownstream) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading...</p>
        </Card.Content>
      </Card>
    );
  }

  const mappedCount = Object.keys(columnMap).length;
  const totalAffected = affectedLeafIds.size;
  const canAdvance = mappedCount > 0 && totalAffected > 0 && !isScanning && !isTransferring;
  const canApply = mappedCount > 0 && totalSelected > 0 && !isTransferring && !isScanning;

  // Page 1: build the old -> new column mappings. The footer's only action is
  // Next, which advances to the selection page once a mapping affects content.
  if (page === 'map') {
    // Reload re-targets at the user's current object; refresh re-runs the
    // downstream fetch + scan in place. Built from the shared helpers so they
    // match every other view's header exactly.
    const headerActions = [
      buildReloadAction({
        currentContext,
        objectId: datasetId,
        objectType: 'DATA_SOURCE',
        onStatusUpdate,
        viewType: 'remapColumns'
      }),
      buildRefreshAction({ isRefreshing: loadingCount > 0, onRefresh: refresh })
    ];
    return (
      <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
        <ViewHeader
          beta
          actions={headerActions}
          feature='Remap Columns of'
          featureIcon={<IconColumnEdit />}
          subject={datasetName}
          subjectTypeId='DATA_SOURCE'
          onClose={onBackToDefault}
        />
        <Separator />
        <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
          <Card.Content className='flex flex-col gap-3 py-2'>
            {isScanning && (
              <div className='flex items-center gap-2 text-xs text-muted'>
                <Spinner size='sm' />
                <span>Scanning downstream content…</span>
              </div>
            )}
            {scanError && (
              <Alert className='w-full border border-border bg-transparent' status='danger'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>Scan failed</Alert.Title>
                  <Alert.Description>{scanError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {orphanCandidates.length > 0 && (
              <p className='text-xs text-muted'>
                Found <strong>{orphanCandidates.length}</strong> broken column reference
                {orphanCandidates.length === 1 ? '' : 's'} no longer on the dataset.
              </p>
            )}

            <div className='flex flex-col gap-1'>
              {rows.map((row) => (
                <RemapRow
                  cardsById={cardsById}
                  isOrphan={orphanCandidates.includes(row.oldName)}
                  key={row.key}
                  oldType={schemaTypeByName.get(row.oldName) || null}
                  origin={origin}
                  row={row}
                  schemaColumns={schemaColumns}
                  schemaTypeByName={schemaTypeByName}
                  totalAvailable={totalAvailable}
                  usages={scanResult?.byColumn?.get(row.oldName) || []}
                  onChange={setRow}
                  onRemove={removeRow}
                />
              ))}
              <Button className='mt-1 self-start' size='sm' variant='secondary' onPress={addRow}>
                <IconPlus className='size-4' />
                Add a column
              </Button>
            </div>

            {(sqlDataflowWarnings.length > 0 || viewFusionWarnings.length > 0) && (
              <Alert className='w-full border border-border bg-transparent' status='warning'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>Some content needs manual review</Alert.Title>
                  <Alert.Description>
                    {sqlDataflowWarnings.length > 0 &&
                      `${sqlDataflowWarnings.length} SQL dataflow${sqlDataflowWarnings.length === 1 ? '' : 's'} can't be rewritten automatically. `}
                    {viewFusionWarnings.length > 0 &&
                      `${viewFusionWarnings.length} fusion view${viewFusionWarnings.length === 1 ? '' : 's'} use the column in a computed expression. `}
                    Review these by hand after applying.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {appColumnCollisions.length > 0 && (
              <Alert className='w-full border border-border bg-transparent' status='warning'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {appColumnCollisions.length === 1
                      ? '1 pro-code app would lose fields'
                      : `${appColumnCollisions.length} pro-code apps would lose fields`}
                  </Alert.Title>
                  <Alert.Description>
                    {appColumnCollisions.map((a) => a.name).join(', ')} rename two or more fields to the same column (
                    {appColumnCollisions.flatMap((a) => a.collisions.map((c) => c.columnName)).join(', ')}). The app reads each
                    column only once, so only one of those fields keeps its data and the rest show up blank.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </Card.Content>
        </ScrollShadow>
        <Separator />
        <Card.Footer className='pt-2'>
          <Button fullWidth isDisabled={!canAdvance} size='sm' variant='primary' onPress={() => setPage('select')}>
            Next
          </Button>
        </Card.Footer>
      </Card>
    );
  }

  // Page 2: pick which affected content to rewrite, then apply. The full-page
  // DataList owns its header and footer; live per-type progress rides on the
  // item rows via transferStatus.
  return (
    <>
      <DataList
        allowsMultipleExpanded
        beta
        defaultExpandedIds={defaultExpandedGroupIds}
        feature='Remap Columns of'
        featureIcon={<IconColumnEdit />}
        fillHeight={true}
        isSelectable={isSelectable}
        itemActions={['copy']}
        itemLabel='item'
        items={dataListItems}
        objectId={datasetId}
        objectType='DATA_SOURCE'
        selectedIds={selectedIds}
        selectionMode={true}
        showActions={true}
        showActivityLogAll={false}
        showCounts={true}
        subject={datasetName}
        viewType='remapColumns'
        onClose={onBackToDefault}
        onSelectionChange={handleSelectionChange}
        onStatusUpdate={onStatusUpdate}
        footer={
          <div className='flex gap-2'>
            <Button isDisabled={isTransferring} size='sm' variant='tertiary' onPress={() => setPage('map')}>
              Back
            </Button>
            <Button
              fullWidth
              isDisabled={!canApply}
              isPending={isTransferring}
              size='sm'
              variant='primary'
              onPress={() => setConfirmOpen(true)}
            >
              {isTransferring ? 'Updating…' : `Update ${totalSelected} item${totalSelected === 1 ? '' : 's'}`}
            </Button>
          </div>
        }
      />

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
                  Remap columns
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className='text-sm'>
                <p>
                  This rewrites <strong>{totalSelected}</strong> downstream item{totalSelected === 1 ? '' : 's'} to use the
                  new column name{mappedCount === 1 ? '' : 's'}. It saves changes to live content and cannot be undone.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button
                  className='bg-warning text-warning-foreground hover:bg-warning-hover'
                  size='sm'
                  variant='primary'
                  onPress={handleRemap}
                >
                  Confirm
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

// Best-effort Domo object URL for an affected content item.
function buildObjectUrl(typeKey, item, origin) {
  const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
  if (!domoTypeId || !origin) return null;
  try {
    // Apps link to their asset-library overview, keyed by the design id, not the
    // card id every other field of the row is keyed by.
    const objectId = typeKey === 'apps' ? item.designId : item.id;
    if (!objectId) return null;
    return new DomoObject(domoTypeId, objectId, origin, { name: item.name }).url;
  } catch {
    return null;
  }
}

// Concise one-line title for the error Alert's header. The full per-item
// breakdown rides along as structured `errorDetail` (rendered as JSON in the
// Alert body), so this only has to summarize.
function formatErrors(result) {
  if (!result?.errors?.length) return null;
  const n = result.errors.length;
  return `${n} item${n === 1 ? '' : 's'} failed`;
}

// Whether a referenced name plausibly was a real, user-facing column (and so a
// candidate for a rename), as opposed to a Beast Mode reference, an object id,
// or a Domo system column that downstream content references but that never
// appears in a dataset's schema.
function isLikelyRenamedColumn(name) {
  if (typeof name !== 'string' || !name.trim()) return false;
  if (name.startsWith('calculation_')) return false; // Beast Mode reference id
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(name)) return false; // dataset/object id
  if (/^\d+$/.test(name)) return false; // numeric id
  if (/^__.+__$/.test(name)) return false; // Domo system column (__createdAt__, __domoId__)
  if (/^_BATCH_/.test(name)) return false; // Domo batch system column (_BATCH_ID_, _BATCH_LAST_RUN_)
  return true;
}

function isParentKey(id) {
  return REMAP_TYPES.some((t) => t.key === id);
}

function leafSelectionId(typeKey, itemId) {
  return `${typeKey}:${itemId}`;
}

function parseLeafTypeKey(id) {
  if (typeof id !== 'string') return null;
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  const candidate = id.slice(0, idx);
  return REMAP_TYPES.some((t) => t.key === candidate) ? candidate : null;
}

// One old -> new mapping row. The old name lists the dataset's current columns
// but accepts a free-typed name too (the renamed column is no longer on the
// dataset); the new name must be a current column. Both fields are the same
// size, and each reserves a caption line beneath it so they stay aligned: the
// old field's shows the broken/usage badges, the new field's calls out a data
// type mismatch.
function RemapRow({
  cardsById,
  isOrphan,
  oldType,
  onChange,
  onRemove,
  origin,
  row,
  schemaColumns,
  schemaTypeByName,
  totalAvailable,
  usages
}) {
  const newType = row.newName ? schemaTypeByName.get(row.newName) || null : null;
  const typeMismatch = Boolean(oldType && newType && oldType !== newType);
  const usageCount = usages.length;

  const columnItems = schemaColumns.map((col) => (
    <ListBox.Item id={col.name} key={col.name} textValue={col.name}>
      <div className='flex min-w-0 flex-col'>
        <span className='truncate font-mono text-xs' title={col.name}>
          {col.name}
        </span>
        <span className='text-[10px] text-muted'>{col.type || 'STRING'}</span>
      </div>
      <ListBox.ItemIndicator />
    </ListBox.Item>
  ));

  return (
    <div className='flex items-start gap-2 py-1'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <ComboBox
          allowsCustomValue
          allowsEmptyCollection
          aria-label='Old column name'
          inputValue={row.oldName}
          menuTrigger='input'
          variant='secondary'
          onInputChange={(value) => onChange(row.key, { oldName: value })}
          onSelectionChange={(key) => {
            if (key != null) onChange(row.key, { oldName: String(key) });
          }}
        >
          <ComboBox.InputGroup>
            <Input className='h-8 font-mono text-xs' placeholder='Old column name' />
            <ComboBox.Trigger>
              <IconChevronDown />
            </ComboBox.Trigger>
          </ComboBox.InputGroup>
          <ComboBox.Popover className='max-w-9/10' placement='bottom start'>
            <ListBox
              className='max-h-60 overflow-y-auto'
              renderEmptyState={() => <EmptyState>No matching column</EmptyState>}
            >
              {columnItems}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        <span className='flex min-h-4 items-center gap-1 pl-1 text-[10px] text-muted'>
          {isOrphan && (
            <Chip color='warning' size='sm' variant='soft'>
              broken
            </Chip>
          )}
          {usageCount > 0 && (
            <>
              <span>
                {usageCount} use{usageCount === 1 ? '' : 's'}
              </span>
              <ColumnUsagesModal
                cardsById={cardsById}
                columnName={row.oldName}
                items={usages}
                origin={origin}
                total={totalAvailable}
                totalLabel='downstream item'
              />
            </>
          )}
        </span>
      </div>

      <span aria-hidden='true' className='flex h-8 shrink-0 items-center text-muted'>
        →
      </span>

      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <ComboBox
          allowsEmptyCollection
          aria-label={`Map ${row.oldName || 'column'} to`}
          menuTrigger='input'
          selectedKey={row.newName || null}
          variant='secondary'
          onSelectionChange={(key) => onChange(row.key, { newName: key ? String(key) : '' })}
        >
          <ComboBox.InputGroup>
            <Input className='h-8 font-mono text-xs' placeholder='New column' />
            <ComboBox.Trigger>
              <IconChevronDown />
            </ComboBox.Trigger>
          </ComboBox.InputGroup>
          <ComboBox.Popover className='max-w-9/10' placement='bottom start'>
            <ListBox className='max-h-60 overflow-y-auto' renderEmptyState={() => <EmptyState>No columns found</EmptyState>}>
              {columnItems}
            </ListBox>
          </ComboBox.Popover>
        </ComboBox>
        <span className='flex min-h-4 items-center gap-1 pl-1 text-[10px] text-warning'>
          {typeMismatch && (
            <>
              <IconExclamationTriangle className='size-3 shrink-0' />
              <span>
                Type differs: <span className='font-mono'>{oldType}</span> to <span className='font-mono'>{newType}</span>
              </span>
            </>
          )}
        </span>
      </div>

      <div className='flex h-8 shrink-0 items-center'>
        <Tooltip delay={300}>
          <Button isIconOnly aria-label='Remove row' size='sm' variant='ghost' onPress={() => onRemove(row.key)}>
            <IconTrash className='size-4' />
          </Button>
          <Tooltip.Content className='w-fit'>Remove</Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}

function typeGroupLabel(typeKey) {
  // The pro-code app type's own name ("Custom App (Pro-Code)") doesn't pluralize
  // cleanly, so give the group its own readable plural.
  if (typeKey === 'apps') return 'Pro-Code Apps';
  const name = getObjectType(TYPE_KEY_TO_DOMO_TYPE[typeKey])?.name || typeKey;
  return `${name}s`;
}
