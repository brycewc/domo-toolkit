import {
  AlertDialog,
  Autocomplete,
  Button,
  Card,
  EmptyState,
  Link,
  ListBox,
  ListLayout,
  Popover,
  ScrollShadow,
  SearchField,
  Separator,
  Spinner,
  useFilter,
  Virtualizer
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { ObjectTypeIcon } from '@/components/ObjectTypeIcon';
import { ColumnUsagesModal } from '@/components/views/ColumnUsagesModal';
import { DataList } from '@/components/views/DataList';
import { ViewHeader } from '@/components/views/ViewHeader';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getObjectType } from '@/models/DomoObjectType';
import { scanContentForColumns } from '@/services/columnReferences';
import { getDatasetColumns, isViewType } from '@/services/datasets';
import { getDatasetFunctions } from '@/services/functions';
import { getDownstreamCards, getDownstreamCardsRaw, getDownstreamLineage } from '@/services/migrateDownstreamContent';
import { findAppColumnCollisions, getDownstreamApps } from '@/services/proCodeApps';
import { remapDatasetColumns } from '@/services/remapDatasetColumns';
import { detectBrokenViewColumns, repairViewColumns } from '@/services/repairViewColumns';
import { buildRefreshAction, buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconColumnEdit from '@icons/column-edit.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconX from '@icons/x.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';

const REMAP_TYPES = [{ key: 'beastModes' }, { key: 'cards' }, { key: 'dataflows' }, { key: 'datasets' }, { key: 'apps' }];

const TYPE_KEY_TO_DOMO_TYPE = {
  apps: 'RYUU_APP',
  beastModes: 'BEAST_MODE_FORMULA',
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE'
};

// Sentinels for a column's mapping choice, matching Migrate Content so the two
// views read the same way. UNMAPPED = leave it alone; DROP = remove the column
// (only offered where it's safe). Any other value is a target column name.
const UNMAPPED = '__unmapped__';
const DROP = '__drop__';

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

  // One choice per broken column, keyed by the column's stable row key:
  // UNMAPPED | DROP | <replacement column name>. Seeded once from detection.
  const [columnChoices, setColumnChoices] = useState({});
  const [seededChoices, setSeededChoices] = useState(false);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [transferStatus, setTransferStatus] = useState({});
  const [isTransferring, setIsTransferring] = useState(false);
  // 'map' = choose a replacement (or drop) per broken column; 'select' = pick
  // which downstream content to rewrite, then apply. Opposite order from Migrate
  // Content, whose first page is the selection and whose second is the columns.
  const [page, setPage] = useState('map');

  // View self-repair (second detection axis, views only): the open view's OWN
  // input references that a source dataset renamed/dropped.
  const [isView, setIsView] = useState(false);
  const [isViewFusion, setIsViewFusion] = useState(false);
  const [viewDefinition, setViewDefinition] = useState(null);
  const [brokenViewColumns, setBrokenViewColumns] = useState([]);
  const [isDetectingView, setIsDetectingView] = useState(false);
  const [viewDetectionDone, setViewDetectionDone] = useState(false);

  const mountedRef = useRef(true);
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
      setIsView(isViewType(context.domoObject?.metadata?.details));
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

  // Second detection axis (views only): scan the open view's OWN definition for
  // input references its source datasets no longer have. Non-views have nothing
  // to detect, so they settle immediately and never block the "nothing to do"
  // bail below.
  useEffect(() => {
    if (!datasetId) return;
    if (!isView) {
      setViewDetectionDone(true);
      return;
    }
    let cancelled = false;
    setIsDetectingView(true);
    setViewDetectionDone(false);
    detectBrokenViewColumns({ tabId, viewId: datasetId })
      .then((detection) => {
        if (cancelled) return;
        setViewDefinition(detection.viewDefinition);
        setIsViewFusion(detection.isFusion);
        setBrokenViewColumns(detection.broken);
      })
      .catch((err) => {
        if (!cancelled) console.error('[RemapColumnsView] View repair detection failed:', err);
      })
      .finally(() => {
        if (cancelled) return;
        setIsDetectingView(false);
        setViewDetectionDone(true);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, isView, tabId]);

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
      // one.
      if (!usages.some((u) => u.type === 'apps' || u.type === 'beastModes' || u.type === 'cards')) continue;
      out.push(name);
    }
    return out;
  }, [scanResult, schemaColumnNames]);

  // The single source of truth for the map page: every broken column that needs a
  // decision, in one shape regardless of where the break is. View-input breaks
  // (a source column the view reads that vanished) remap against the owning
  // source's columns and can be dropped from the view; downstream breaks (a view
  // output column cards still reference) remap against the view's own columns and
  // are remap-only. Sorted alphabetically; used vs unused is shown per row.
  const brokenColumns = useMemo(() => {
    const out = [];
    for (const broken of brokenViewColumns) {
      const realOutputs = broken.outputColumns.filter((name) => schemaColumnNames.has(name));
      // Downstream usages of the output column(s) this reference feeds, deduped.
      const usages = [];
      const seen = new Set();
      for (const outName of broken.outputColumns) {
        for (const usage of scanResult?.byColumn?.get(outName) || []) {
          const usageKey = `${usage.type}:${usage.id}`;
          if (seen.has(usageKey)) continue;
          seen.add(usageKey);
          usages.push(usage);
        }
      }
      const dropSafe = realOutputs.length === 0 || usages.length === 0;
      out.push({
        candidates: broken.candidates || [],
        key: `view:${broken.sourceId}:${broken.column}`,
        kind: 'view',
        name: broken.column,
        // Drop is only offered when it's a real, unused output (dropping a used
        // output would break downstream; a non-output ref can't be dropped).
        offerDrop: broken.outputColumns.length > 0 && dropSafe,
        outputColumns: broken.outputColumns,
        sourceId: broken.sourceId,
        sourceName: broken.sourceName,
        usageCount: usages.length,
        usages
      });
    }
    for (const name of orphanCandidates) {
      const usages = scanResult?.byColumn?.get(name) || [];
      out.push({
        candidates: schemaColumns,
        key: `downstream:${name}`,
        kind: 'downstream',
        name,
        offerDrop: false,
        usageCount: usages.length,
        usages
      });
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [brokenViewColumns, orphanCandidates, schemaColumns, schemaColumnNames, scanResult]);

  // The broken columns grouped by the dataset they belong to, so the source name
  // is stated once as a section header instead of on every row. A view-input
  // break belongs to its source dataset; a downstream orphan is one of the open
  // object's own (removed) columns, so it groups under the open object.
  const sections = useMemo(() => {
    const byKey = new Map();
    for (const row of brokenColumns) {
      const key = row.kind === 'view' ? row.sourceId : datasetId;
      const name = row.kind === 'view' ? row.sourceName : datasetName;
      if (!byKey.has(key)) byKey.set(key, { id: key, name, rows: [] });
      byKey.get(key).rows.push(row);
    }
    // Rows stay alphabetical within each section (brokenColumns is pre-sorted);
    // order the sections by name for a stable grouping.
    return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [brokenColumns, datasetId, datasetName]);

  // The downstream scan has produced its verdict: either there was nothing to
  // scan, it finished, or it errored. Used to hold off seeding drop-vs-remap
  // defaults (and the bail) until downstream usage is known.
  const scanSettled = totalAvailable === 0 || scanResult != null || Boolean(scanError);
  const detectionSettled = !isLoading && loadedCount === REMAP_TYPES.length && scanSettled && (!isView || viewDetectionDone);

  // Seed each broken column's default choice once detection has settled: an
  // unused, droppable view column defaults to Drop; anything else defaults to
  // its nearest-named replacement, else Leave unmapped. The user can override.
  useEffect(() => {
    if (seededChoices || !detectionSettled || brokenColumns.length === 0) return;
    setSeededChoices(true);
    const initial = {};
    for (const row of brokenColumns) {
      if (row.kind !== 'view') {
        // Downstream orphans: no smart default; the user picks a view column.
        initial[row.key] = UNMAPPED;
      } else if (row.offerDrop) {
        // An unused, droppable view column: recommend dropping it.
        initial[row.key] = DROP;
      } else {
        // A still-needed view column: pre-pick its nearest-named source column.
        initial[row.key] = suggestReplacement(row.name, row.candidates) || UNMAPPED;
      }
    }
    setColumnChoices(initial);
  }, [brokenColumns, detectionSettled, seededChoices]);

  // Nothing to do: detection settled and no broken column surfaced. Bail back to
  // the default view with a note rather than painting an empty list.
  const bailedRef = useRef(false);
  const nothingToDo = detectionSettled && !isTransferring && brokenColumns.length === 0;
  const holdContent = useViewReady(!isLoading && !nothingToDo);
  useEffect(() => {
    if (bailedRef.current || !nothingToDo) return;
    bailedRef.current = true;
    onStatusUpdate?.('Nothing to remap', `No broken column references found on **${datasetName}**`, 'warning');
    onBackToDefault?.();
  }, [datasetName, nothingToDo, onBackToDefault, onStatusUpdate]);

  // Old -> new map for the DOWNSTREAM rows the user has pointed at a real column.
  // Drives which downstream content is affected (and, on page 2, rewritten).
  const columnMap = useMemo(() => {
    const map = {};
    for (const row of brokenColumns) {
      if (row.kind !== 'downstream') continue;
      const choice = columnChoices[row.key];
      if (choice && choice !== UNMAPPED && choice !== DROP && choice !== row.name) map[row.name] = choice;
    }
    return map;
  }, [brokenColumns, columnChoices]);

  // The view self-repair the user has resolved: remaps grouped later per source,
  // drops by output column name, plus each touched source's column types (for the
  // rewriter's type propagation). `count` drives the confirm-dialog copy.
  const viewActions = useMemo(() => {
    const remaps = [];
    const drops = [];
    const sourceTypes = {};
    let count = 0;
    for (const row of brokenColumns) {
      if (row.kind !== 'view') continue;
      const choice = columnChoices[row.key];
      if (!choice || choice === UNMAPPED) continue;
      if (choice === DROP) {
        if (!row.offerDrop) continue;
        for (const output of row.outputColumns) drops.push(output);
        count++;
      } else if (choice !== row.name) {
        remaps.push({ column: row.name, replacement: choice, sourceId: row.sourceId });
        if (!sourceTypes[row.sourceId]) {
          sourceTypes[row.sourceId] = Object.fromEntries((row.candidates || []).map((c) => [c.name, c.type]));
        }
        count++;
      }
    }
    return { count, drops: [...new Set(drops)], remaps, sourceTypes };
  }, [brokenColumns, columnChoices]);

  const hasViewWork = viewActions.count > 0;

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
      const collisions = findAppColumnCollisions(app.fieldGroups, columnMap);
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

  const setChoice = useCallback((key, choice) => {
    setColumnChoices((prev) => ({ ...prev, [key]: choice == null ? UNMAPPED : choice }));
  }, []);

  const sqlDataflowWarnings = scanResult?.dataflowSqlWarnings || [];
  const viewFusionWarnings = scanResult?.viewFusionWarnings || [];

  const handleRemap = useCallback(async () => {
    setConfirmOpen(false);
    const selectedItems = selectedItemsByType;
    const targetColumnTypes = {};
    for (const col of schemaColumns) if (col?.name && col?.type) targetColumnTypes[col.name] = col.type;

    const hasDownstreamWork = REMAP_TYPES.some((t) => selectedItems[t.key].length > 0);
    const { drops, remaps, sourceTypes } = viewActions;
    const willRepair = drops.length > 0 || remaps.length > 0;

    const initialStatus = {};
    for (const t of REMAP_TYPES) {
      if (selectedItems[t.key].length > 0)
        initialStatus[t.key] = { count: selectedItems[t.key].length, status: 'transferring' };
    }
    setTransferStatus(initialStatus);
    setIsTransferring(true);

    try {
      // Repair the open view itself FIRST, so any subsequent downstream remap
      // reads the already-fixed view.
      let repairResult = null;
      if (willRepair) {
        repairResult = await repairViewColumns({
          drops,
          isFusion: isViewFusion,
          remaps,
          sourceTypes,
          tabId,
          viewDefinition,
          viewId: datasetId
        });
      }

      const transferResults = hasDownstreamWork
        ? await remapDatasetColumns({
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
          })
        : new Map();

      let totalSucceeded = 0;
      let totalFailed = 0;
      let totalManualReview = 0;
      for (const [, r] of transferResults) {
        totalSucceeded += r.succeeded || 0;
        totalFailed += r.failed || 0;
        totalManualReview += r.manualReview?.length || 0;
      }

      const repairFailed = repairResult?.failed || 0;
      const repairSucceeded = repairResult ? (repairResult.dropped || 0) + (repairResult.remapped || 0) : 0;
      totalFailed += repairFailed;

      const reviewNote =
        totalManualReview > 0
          ? ` ${totalManualReview} SQL dataflow${totalManualReview !== 1 ? 's' : ''} flagged for manual review.`
          : '';
      const repairErrorNote = repairResult?.errors?.length ? ` ${repairResult.errors[0].error}` : '';

      if (totalFailed > 0) {
        const parts = [];
        if (hasDownstreamWork) parts.push(`**${totalSucceeded}** updated`);
        if (repairSucceeded > 0)
          parts.push(`**${repairSucceeded}** view column${repairSucceeded === 1 ? '' : 's'} repaired`);
        parts.push(`**${totalFailed}** failed`);
        showStatus('Partially Complete', `${parts.join(', ')}.${repairErrorNote}${reviewNote}`, 'warning', 8000);
      } else {
        const summary = hasDownstreamWork
          ? `Updated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''}.${
              repairSucceeded > 0 ? ` Repaired **${repairSucceeded}** view column${repairSucceeded === 1 ? '' : 's'}.` : ''
            }`
          : `Repaired **${repairSucceeded}** view column${repairSucceeded === 1 ? '' : 's'}.`;
        showStatus(
          hasDownstreamWork ? 'Remap Complete' : 'View Repaired',
          `${summary}${reviewNote}`,
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
    isViewFusion,
    onBackToDefault,
    scanResult,
    schemaColumns,
    selectedItemsByType,
    showStatus,
    tabId,
    viewActions,
    viewDefinition
  ]);

  if (isLoading || nothingToDo || holdContent) {
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
  // Page 2 can apply when downstream content is selected, or when only a view
  // repair remains (e.g. the user deselected every downstream item).
  const canApply = ((mappedCount > 0 && totalSelected > 0) || hasViewWork) && !isTransferring && !isScanning;
  // A view with self-repairs but no downstream mapping applies straight from the
  // map page (there's no downstream content to select on page 2).
  const canApplyView = hasViewWork && !isScanning && !isDetectingView && !isTransferring;
  const isBusy = isScanning || isDetectingView;

  // Shared confirm dialog, rendered on both pages. Its copy adapts: the map page
  // opens it only for a view-repair-only run (no downstream selection), while the
  // select page opens it for a downstream rewrite that may also repair the view.
  const confirmDialog = (
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
                {totalSelected > 0 ? 'Remap columns' : 'Repair this view'}
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className='text-sm'>
              <p>
                {totalSelected > 0 && (
                  <>
                    This rewrites <strong>{totalSelected}</strong> downstream item{totalSelected === 1 ? '' : 's'}
                    {hasViewWork ? ' and repairs this view' : ` to use the new column name${mappedCount === 1 ? '' : 's'}`}
                    .{' '}
                  </>
                )}
                {totalSelected === 0 && hasViewWork && (
                  <>
                    This edits this view's definition to repair <strong>{viewActions.count}</strong> broken column
                    {viewActions.count === 1 ? '' : 's'}.{' '}
                  </>
                )}
                It saves changes to live content and cannot be undone.
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
  );

  // Page 1: choose a replacement (or drop) per broken column. The footer advances
  // to the content-selection page when a downstream remap is set, or applies a
  // view-only repair directly.
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
      <>
        <Card className='flex min-h-0 w-full flex-1 flex-col gap-0 p-2'>
          <ViewHeader
            beta
            actions={headerActions}
            feature='Remap Columns of'
            featureIcon={<IconColumnEdit />}
            subject={datasetName}
            subjectTypeId='DATA_SOURCE'
            onClose={onBackToDefault}
          />
          <Separator className='mt-1.5' />
          <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
            <Card.Content className='flex flex-col gap-3 py-2'>
              {isBusy && (
                <div className='flex items-center gap-2 text-xs text-muted'>
                  <Spinner size='sm' />
                  <span>{isDetectingView ? 'Checking this view for broken columns…' : 'Scanning downstream content…'}</span>
                </div>
              )}
              {scanError && (
                <Alert className='w-full border border-border bg-transparent' status='danger'>
                  <Alert.Content>
                    <Alert.Title className='flex items-center gap-1'>
                      <AlertStatusIcon />
                      Scan failed
                    </Alert.Title>
                    <Alert.Description>{scanError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

              {brokenColumns.length > 0 && (
                <>
                  <p className='text-xs text-muted'>
                    <strong>{brokenColumns.length}</strong> column{brokenColumns.length === 1 ? '' : 's'}{' '}
                    {brokenColumns.length === 1 ? 'is' : 'are'} referenced but no longer available. Point each at a valid
                    column{isView ? ', or drop the unused ones from the view' : ''}.
                  </p>
                  {sections.map((section) => {
                    const sectionUrl = buildObjectUrl('datasets', { id: section.id, name: section.name }, origin);
                    return (
                      <div className='flex flex-col' key={section.id}>
                        <div className='flex items-center gap-1.5 pb-0.5'>
                          <ObjectTypeIcon className='size-3.5 shrink-0 text-muted' typeId='DATA_SOURCE' />
                          {sectionUrl ? (
                            <Link
                              className='truncate text-xs font-semibold text-current no-underline decoration-accent hover:text-accent hover:underline'
                              href={sectionUrl}
                              target='_blank'
                              title={section.name}
                            >
                              {section.name}
                            </Link>
                          ) : (
                            <span className='truncate text-xs font-semibold' title={section.name}>
                              {section.name}
                            </span>
                          )}
                        </div>
                        <div className='flex flex-col divide-y divide-border'>
                          {section.rows.map((row) => (
                            <BrokenColumnRow
                              cardsById={cardsById}
                              key={row.key}
                              origin={origin}
                              row={row}
                              totalAvailable={totalAvailable}
                              value={columnChoices[row.key] ?? UNMAPPED}
                              onChange={setChoice}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </>
              )}

              {(sqlDataflowWarnings.length > 0 || viewFusionWarnings.length > 0) && (
                <Alert className='w-full border border-border bg-transparent' status='warning'>
                  <Alert.Content>
                    <Alert.Title className='flex items-center gap-1'>
                      <AlertStatusIcon />
                      Some content needs manual review
                    </Alert.Title>
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
                  <Alert.Content>
                    <Alert.Title className='flex items-center gap-1'>
                      <AlertStatusIcon />
                      {appColumnCollisions.length === 1
                        ? '1 pro-code app would lose fields'
                        : `${appColumnCollisions.length} pro-code apps would lose fields`}
                    </Alert.Title>
                    <Alert.Description>
                      {appColumnCollisions.map((a) => a.name).join(', ')} rename two or more fields to the same column (
                      {appColumnCollisions.flatMap((a) => a.collisions.map((c) => c.columnName)).join(', ')}). The app reads
                      each column only once, so only one of those fields keeps its data and the rest show up blank.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </Card.Content>
          </ScrollShadow>
          <Separator className='mt-1.5' />
          <Card.Footer className='pt-2'>
            {canAdvance ? (
              <Button fullWidth size='sm' variant='primary' onPress={() => setPage('select')}>
                Next
              </Button>
            ) : hasViewWork ? (
              <Button
                fullWidth
                isDisabled={!canApplyView}
                isPending={isTransferring}
                size='sm'
                variant='primary'
                onPress={() => setConfirmOpen(true)}
              >
                {isTransferring ? 'Repairing…' : 'Repair this view'}
              </Button>
            ) : (
              <Button fullWidth isDisabled size='sm' variant='primary'>
                Next
              </Button>
            )}
          </Card.Footer>
        </Card>
        {confirmDialog}
      </>
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
              {isTransferring
                ? 'Updating…'
                : totalSelected > 0
                  ? `Update ${totalSelected} item${totalSelected === 1 ? '' : 's'}`
                  : 'Repair this view'}
            </Button>
          </div>
        }
      />

      {confirmDialog}
    </>
  );
}

// One broken-column row: the vanished column on the left with its source (for
// view-input breaks) and downstream-usage line, and a searchable select on the
// right whose options are Leave unmapped, Drop column (only when droppable), then
// the valid target columns. Mirrors Migrate Content's ColumnMapRow.
function BrokenColumnRow({ cardsById, onChange, origin, row, totalAvailable, value }) {
  // Case-insensitive "contains" match for the select's local filter, so the user
  // can type to narrow a long target-column list (sources can have hundreds).
  const { contains } = useFilter({ sensitivity: 'base' });
  // Controlled search text. The option list is virtualized, so the collection
  // must BE the filtered set (a dynamic `items` array) rather than static
  // children auto-filtered by the Autocomplete.
  const [query, setQuery] = useState('');

  // Options for the virtualized picker, filtered by the search box: Leave
  // unmapped, Drop column (when offered), then the valid target columns sorted
  // alphabetically (the schema fetch returns them in physical-column order,
  // matching how Migrate Content sorts its target columns).
  const options = useMemo(() => {
    const matches = (text) => !query || contains(text, query);
    const out = [];
    if (matches('Leave unmapped')) out.push({ id: UNMAPPED, kind: 'unmapped' });
    if (row.offerDrop && matches('Drop column')) out.push({ id: DROP, kind: 'drop' });
    const sortedCandidates = [...row.candidates].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    for (const col of sortedCandidates) {
      if (matches(col.name)) out.push({ id: col.name, kind: 'column', name: col.name, type: col.type || 'STRING' });
    }
    return out;
  }, [contains, query, row.candidates, row.offerDrop]);

  // Render one option row for the virtualized collection, by kind.
  const renderOption = (item) => {
    if (item.kind === 'unmapped') {
      return (
        <ListBox.Item id={UNMAPPED} textValue='Leave unmapped'>
          <span className='text-muted italic'>Leave unmapped</span>
          <ListBox.ItemIndicator />
        </ListBox.Item>
      );
    }
    if (item.kind === 'drop') {
      return (
        <ListBox.Item id={DROP} textValue='Drop column'>
          <span className='text-danger italic'>Drop column</span>
          <ListBox.ItemIndicator />
        </ListBox.Item>
      );
    }
    return (
      <ListBox.Item id={item.id} textValue={item.name}>
        <div className='flex min-w-0 flex-col'>
          <span className='truncate font-mono text-xs' title={item.name}>
            {item.name}
          </span>
          <span className='text-[10px] text-muted'>{item.type}</span>
        </div>
        <ListBox.ItemIndicator />
      </ListBox.Item>
    );
  };

  return (
    <div className='flex items-center gap-2 py-1.5'>
      <div className='flex min-w-0 flex-1 flex-col'>
        <span className='truncate font-mono text-xs' title={row.name}>
          {row.name}
        </span>
        <span className='flex items-center gap-1 text-[10px] text-muted'>
          {row.usageCount > 0 ? (
            <>
              <span>
                {row.usageCount} use{row.usageCount === 1 ? '' : 's'}
              </span>
              <ColumnUsagesModal
                cardsById={cardsById}
                columnName={row.name}
                items={row.usages}
                origin={origin}
                total={totalAvailable}
                totalLabel='downstream item'
              />
            </>
          ) : (
            <span>not used anywhere</span>
          )}
        </span>
      </div>
      <Autocomplete
        allowsEmptyCollection
        aria-label={`Map ${row.name} to`}
        className='w-44'
        selectionMode='single'
        value={value}
        variant='secondary'
        onChange={(key) => onChange(row.key, key)}
      >
        <Autocomplete.Trigger className='w-full'>
          <Autocomplete.Value className='flex min-w-0 flex-1 items-center gap-1'>
            {() =>
              value === UNMAPPED ? (
                <span className='min-w-0 truncate text-muted italic'>Leave unmapped</span>
              ) : value === DROP ? (
                <span className='min-w-0 truncate text-danger italic'>Drop column</span>
              ) : (
                <span className='min-w-0 truncate font-mono text-xs'>{value}</span>
              )
            }
          </Autocomplete.Value>
          <Autocomplete.ClearButton />
          <Autocomplete.Indicator />
        </Autocomplete.Trigger>
        <Autocomplete.Popover className='w-fit max-w-9/10 min-w-72' placement='bottom end'>
          {/* The Autocomplete popover renders an internal dialog; give it a
              screen-reader title so it has an accessible name (React Aria warns
              when a dialog has neither a title slot nor an aria-label). Visually
              hidden, so the popover layout is unchanged. */}
          <Popover.Heading className='sr-only'>Map {row.name} to a column</Popover.Heading>
          <Autocomplete.Filter inputValue={query} onInputChange={setQuery}>
            <SearchField
              autoFocus
              aria-label={`Search columns for ${row.name}`}
              className='sticky top-0 z-10'
              name='column-search'
              variant='secondary'
            >
              <SearchField.Group>
                <SearchField.SearchIcon />
                <SearchField.Input placeholder='Search columns...' />
                <SearchField.ClearButton />
              </SearchField.Group>
            </SearchField>
            {/* Virtualized so a source with hundreds of columns only renders the
                visible rows. Heights are estimated (one-line actions vs two-line
                columns vary) so React Aria measures and self-corrects. */}
            <Virtualizer layout={ListLayout} layoutOptions={{ estimatedRowHeight: 44 }}>
              <ListBox
                aria-label={`Columns for ${row.name}`}
                className='max-h-80 overflow-y-auto'
                items={options}
                renderEmptyState={() => <EmptyState>No columns found</EmptyState>}
              >
                {(item) => renderOption(item)}
              </ListBox>
            </Virtualizer>
          </Autocomplete.Filter>
        </Autocomplete.Popover>
      </Autocomplete>
    </div>
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

// Length of the longest common substring of two strings (simple DP). Used to
// score how closely a candidate replacement column resembles the broken one.
function longestCommonSubstring(a, b) {
  if (!a || !b) return 0;
  let best = 0;
  let prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    const curr = new Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
        if (curr[j] > best) best = curr[j];
      }
    }
    prev = curr;
  }
  return best;
}

function parseLeafTypeKey(id) {
  if (typeof id !== 'string') return null;
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  const candidate = id.slice(0, idx);
  return REMAP_TYPES.some((t) => t.key === candidate) ? candidate : null;
}

// Best-guess replacement for a broken column: the candidate sharing the longest
// run of characters with it (letters/digits only, case-insensitive), tie-broken
// toward the shorter name. Surfaces the obvious rename (e.g. `ca_parentid` ->
// `l_utm_campid_parentid`) as the default. Returns '' when nothing overlaps
// meaningfully, so the row falls back to Leave unmapped.
function suggestReplacement(brokenName, candidates) {
  const normalize = (value) =>
    String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
  const target = normalize(brokenName);
  let best = '';
  let bestScore = 0;
  for (const candidate of candidates || []) {
    const name = candidate?.name;
    if (!name) continue;
    const score = longestCommonSubstring(target, normalize(name));
    if (score > bestScore || (score === bestScore && best && name.length < best.length)) {
      best = name;
      bestScore = score;
    }
  }
  return bestScore >= 3 ? best : '';
}

function typeGroupLabel(typeKey) {
  // The pro-code app type's own name ("Custom App (Pro-Code)") doesn't pluralize
  // cleanly, so give the group its own readable plural.
  if (typeKey === 'apps') return 'Pro-Code Apps';
  const name = getObjectType(TYPE_KEY_TO_DOMO_TYPE[typeKey])?.name || typeKey;
  return `${name}s`;
}
