import { AlertDialog, Button, Card, DisclosureGroup, ScrollShadow, Separator, Spinner, toast } from '@heroui/react';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { DatasetComboBox } from '@/components/DatasetComboBox';
import { DataList } from '@/components/views/DataList';
import { ViewHeader } from '@/components/views/ViewHeader';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getObjectType } from '@/models/DomoObjectType';
import { extractAlertPdpPolicies, getDownstreamAlerts, getRowPdpPolicies } from '@/services/alerts';
import { scanContentForColumns } from '@/services/columnReferences';
import { hasEffectiveMapping } from '@/services/columnRewriter';
import { getDatasetColumns } from '@/services/datasets';
import {
  getBeastModeReferenceGraph,
  getCardBeastModes,
  getDatasetFunctions,
  getNestingBeastModeIds
} from '@/services/functions';
import { getDownstreamJupyterWorkspaces } from '@/services/jupyterWorkspaces';
import {
  compareDatasetSchemas,
  findDataflowInputConflicts,
  getDownstreamCards,
  getDownstreamCardsRaw,
  getDownstreamDatasetIds,
  getDownstreamLineage,
  MIGRATE_TYPES,
  migrateAllDownstreamContent
} from '@/services/migrateDownstreamContent';
import { findAppColumnCollisions, getDownstreamApps } from '@/services/proCodeApps';
import { isColumnDroppable } from '@/utils/columnDrops';
import { suggestReplacement } from '@/utils/columnMatching';
import { indexColumnNames, isBrokenColumnReference, resolveColumnName } from '@/utils/columnOrphans';
import { buildRefreshAction } from '@/utils/headerActions';
import { getSidepanelData, launchView } from '@/utils/sidepanel';
import IconArrowLeft from '@icons/arrow-left.svg?react';
import IconArrowRight from '@icons/arrow-right.svg?react';
import IconCheckCircle from '@icons/check-circle.svg?react';
import IconCheck from '@icons/check.svg?react';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconWand from '@icons/wand.svg?react';
import IconX from '@icons/x.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { BeastModeConflictsSection, CardBeastModeConflictsSection } from './migrateDownstream/BeastModeConflictsSection';
import { ColumnRemapSection } from './migrateDownstream/ColumnRemapSection';
import { buildObjectUrl, DROP, TYPE_KEY_TO_DOMO_TYPE, UNMAPPED } from './migrateDownstream/contentTypes';
import { PdpMappingSection } from './migrateDownstream/PdpMappingSection';
import { ReconciliationWarnings } from './migrateDownstream/ReconciliationWarnings';

// An opt-in type never joins these, so "all searches finished" counts only these.
const AUTO_MIGRATE_TYPES = MIGRATE_TYPES.filter((t) => !t.onDemand);

const JUPYTER_VISIBILITY_NOTE = 'Only Jupyter Workspaces you have access to are listed';

const NEEDS_NAME_CHIP = { color: 'danger', label: 'Needs a Name' };

const RESOLVED_CHIP = { color: 'success', label: 'Resolved' };

export function MigrateDownstreamContentView({
  currentContext = null,
  instance = null,
  isActive = true,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [datasetId, setDatasetId] = useState(null);
  const [datasetName, setDatasetName] = useState('');
  const [origin, setOrigin] = useState('');
  const [tabId, setTabId] = useState(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [pendingSelectAll, setPendingSelectAll] = useState(true);
  // Jupyter Workspaces are only searched when the user asks, so the row stays
  // out of the list until then.
  const [jupyterCheckStarted, setJupyterCheckStarted] = useState(false);
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
  // Transient feedback for the (synchronous) Auto Map action so the user can
  // see it ran: 'idle' | 'mapping' (brief spinner) | 'done' (checkmark, clears).
  const [autoMapStatus, setAutoMapStatus] = useState('idle');

  // Target ids the user has dismissed from the "use the dataset you're viewing"
  // suggestion, so navigating back to one doesn't re-offer it. Keyed by dataset
  // id; persists for the life of the view (a fresh launch starts empty).
  const [dismissedSuggestionIds, setDismissedSuggestionIds] = useState(() => new Set());

  // Beast Modes already on the target dataset, used to detect name collisions
  // with the selected origin Beast Modes. `beastModeChoices` holds the user's
  // per-collision resolution (keyed by origin Beast Mode id).
  const [targetBeastModes, setTargetBeastModes] = useState([]);
  const [beastModeChoices, setBeastModeChoices] = useState({});
  const [nestingTargetBeastModeIds, setNestingTargetBeastModeIds] = useState(() => new Set());

  // Card-level Beast Modes on the origin (the ones that travel with a card, not
  // saved to the dataset). Used to flag names that collide with a target dataset
  // Beast Mode, which Domo would reject on save. `cardBeastModeChoices` holds the
  // user's per-collision resolution (keyed by the card-level Beast Mode id).
  const [cardBeastModes, setCardBeastModes] = useState([]);
  const [cardBeastModeChoices, setCardBeastModeChoices] = useState({});

  // Nested-reference graph among the origin dataset's Beast Modes (origin
  // legacyId -> set of referenced origin legacyIds). Built once the Beast Mode
  // list loads; drives requiring a Beast Mode's dependencies whenever it (or a
  // card that uses it) is migrated, so nested Beast Modes never arrive on the
  // target with a dangling reference.
  const [bmRefGraph, setBmRefGraph] = useState(() => new Map());

  // Row PDP policies on the target dataset, fetched when a target is chosen and a
  // selected alert references at least one named policy. `pdpChoices` holds the
  // user's resolution for each origin policy that has no same-name match on the
  // target (keyed by the origin filterGroupId): either map it to a target policy
  // or remove it (widening the alert to all rows). `pdpLoaded` gates the UI/gating
  // so the unmatched list doesn't flash while the target's policies are loading.
  // null = not compared yet; an empty array is the real answer "target has no
  // row policies". Collapsing the two reports every referenced policy as
  // unmatched before a target is even picked.
  const [targetPdpPolicies, setTargetPdpPolicies] = useState(null);
  const [pdpChoices, setPdpChoices] = useState({});
  const [pdpLoaded, setPdpLoaded] = useState(false);

  const [targetRefreshKey, setTargetRefreshKey] = useState(0);
  const [targetFetchCount, setTargetFetchCount] = useState(0);

  const [expandedSections, setExpandedSections] = useState(() => new Set());
  const seededExpansionRef = useRef(false);

  const mountedRef = useRef(true);
  const bailedRef = useRef(false);
  const autoMapTimersRef = useRef([]);
  const { showStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
      autoMapTimersRef.current.forEach(clearTimeout);
    };
  }, []);

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'migrateDownstreamContent') {
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
        context.domoObject?.metadata?.name || context.domoObject?.metadata?.displayName || `DataSet ${context.domoObject.id}`
      );
      setOrigin(context.domoObject?.baseUrl || '');
      setTabId(context.tabId);
      if (data.checkJupyterWorkspaces) setJupyterCheckStarted(true);
    } catch (error) {
      console.error('[MigrateDownstreamContentView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const specs = useMemo(() => {
    if (!datasetId) return [];
    // datasets and dataflows both come from the same lineage call. Share one
    // in-flight Promise so the API isn't hit twice. Re-created with the specs
    // array so a refresh refetches.
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
      {
        fetch: async () => ({ items: await getDatasetFunctions(datasetId, tabId) }),
        key: 'beastModes'
      },
      {
        fetch: async () => ({ items: await getDownstreamCards(datasetId, tabId, await cardsRaw()) }),
        key: 'cards'
      },
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
      },
      {
        fetch: async () => ({ items: await getDownstreamApps(datasetId, tabId, await cardsRaw()) }),
        key: 'apps'
      },
      {
        fetch: async () => ({ items: await getDownstreamAlerts(datasetId, tabId) }),
        key: 'alerts'
      }
    ];
  }, [datasetId, tabId]);

  const {
    errorCount,
    isFullyLoaded,
    loadedCount,
    loadingCount,
    refresh: refreshFetches,
    results: autoResults
  } = useParallelFetches(specs);

  // Its own hook instance: `useParallelFetches` fetches and refreshes a whole
  // spec set at once, and this search is deferred until the user asks for it.
  const jupyterSpecs = useMemo(() => {
    if (!datasetId) return [];
    return [
      {
        fetch: async () => ({ items: await getDownstreamJupyterWorkspaces(datasetId, tabId) }),
        key: 'jupyterWorkspaces'
      }
    ];
  }, [datasetId, tabId]);

  const { refresh: runJupyterCheck, results: jupyterResults } = useParallelFetches(jupyterSpecs, { autoFetch: false });

  // 'idle' until the check is asked for: the hook seeds every key as 'loading',
  // which would otherwise paint a spinner on a row that isn't searching.
  const jupyterStatus = jupyterCheckStarted ? (jupyterResults.jupyterWorkspaces?.status ?? 'loading') : 'idle';

  const results = useMemo(
    () => (jupyterCheckStarted ? { ...autoResults, ...jupyterResults } : autoResults),
    [autoResults, jupyterCheckStarted, jupyterResults]
  );

  useEffect(() => {
    if (!jupyterCheckStarted || !datasetId) return;
    runJupyterCheck();
  }, [datasetId, jupyterCheckStarted, runJupyterCheck]);

  // Pre-select every loaded item once all fetches settle. We hold pending in
  // a flag so a partial early result doesn't snapshot empty children.
  useEffect(() => {
    if (!pendingSelectAll) return;
    if (Object.keys(results).length === 0) return;
    if (!isFullyLoaded) return;
    setSelectedIds(buildFullSelection(results));
    setPendingSelectAll(false);
  }, [pendingSelectAll, isFullyLoaded, results]);

  // The Jupyter search settles long after that one-shot pre-select, so its
  // results select themselves: the user asked for them by running the check.
  useEffect(() => {
    if (jupyterStatus !== 'loaded') return;
    const items = jupyterResults.jupyterWorkspaces?.items?.items || [];
    if (items.length === 0) return;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.add('jupyterWorkspaces');
      for (const item of items) next.add(leafSelectionId('jupyterWorkspaces', item.id));
      return next;
    });
  }, [jupyterResults, jupyterStatus]);

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
  // An unrun Jupyter search can still turn something up, so an idle one doesn't
  // hold the bail-out back; the toast offers to run it instead. A running one
  // does hold it back, and an errored one keeps the view open to show the error.
  const jupyterSettled = jupyterStatus === 'idle' || jupyterStatus === 'loaded';
  const nothingToMigrate =
    !isLoading && !isTransferring && loadedCount === AUTO_MIGRATE_TYPES.length && totalAvailable === 0 && jupyterSettled;
  const holdContent = useViewReady(!isLoading && !nothingToMigrate);

  // The render path short-circuits to the spinner on `nothingToMigrate` to
  // prevent a one-frame flash of the empty list before this effect navigates
  // away. The bailedRef guards against double-firing if a refresh re-settles
  // to another empty result.
  useEffect(() => {
    if (bailedRef.current) return;
    if (!nothingToMigrate) return;
    bailedRef.current = true;
    // The view is closing, so an unrun Jupyter search would be unreachable from
    // here. The toast carries it instead, reopening the view with it running.
    if (jupyterStatus === 'idle') {
      let toastKey;
      toastKey = showStatus(
        'Nothing to Migrate',
        `**${datasetName}** has no downstream content to migrate, but Jupyter Workspaces haven't been searched`,
        'warning',
        15000,
        {
          actionProps: {
            children: (
              <>
                <IconSync />
                Check Jupyter Workspaces
              </>
            ),
            onPress: () => {
              launchView({ checkJupyterWorkspaces: true, currentContext, type: 'migrateDownstreamContent' });
              toast.close(toastKey);
            },
            size: 'sm',
            variant: 'secondary'
          }
        }
      );
    } else {
      onStatusUpdate?.('Nothing to Migrate', `**${datasetName}** has no downstream content to migrate`, 'warning');
    }
    onBackToDefault?.();
  }, [nothingToMigrate, currentContext, datasetName, jupyterStatus, onStatusUpdate, onBackToDefault, showStatus]);

  const selectedCounts = useMemo(() => {
    const counts = { alerts: 0, apps: 0, beastModes: 0, cards: 0, dataflows: 0, datasets: 0, jupyterWorkspaces: 0 };
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

  const totalSelected = MIGRATE_TYPES.reduce((sum, t) => sum + (selectedCounts[t.key] || 0), 0);

  // Non-zero selected counts as `{ key, n, noun }` parts, in MIGRATE_TYPES
  // order, for the confirmation's "N beast modes, 1 card, …" breakdown. The
  // singular noun is the object type's own name (lowercased); plural just adds
  // an "s" (none of these types pluralize irregularly).
  const selectionParts = useMemo(() => {
    const parts = [];
    for (const t of MIGRATE_TYPES) {
      const n = selectedCounts[t.key] || 0;
      if (n === 0) continue;
      const singular = (getObjectType(TYPE_KEY_TO_DOMO_TYPE[t.key])?.name || t.key).toLowerCase();
      parts.push({ key: t.key, n, noun: n === 1 ? singular : `${singular}s` });
    }
    return parts;
  }, [selectedCounts]);

  // Full selected items array per type, used to scan each item's definition
  // for column references when a schema mismatch is detected. Distinct from
  // `selectedCounts` (numbers) and `selectedIds` (flat key Set).
  const selectedItemsByType = useMemo(() => {
    const acc = { alerts: [], apps: [], beastModes: [], cards: [], dataflows: [], datasets: [], jupyterWorkspaces: [] };
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

  // Derived from the input lists captured during discovery, so this is available
  // on a compatible-schema migration too, where the column scan never runs.
  const dataflowInputConflicts = useMemo(
    () =>
      findDataflowInputConflicts({
        originId: datasetId,
        selectedDataflows: selectedItemsByType.dataflows,
        targetId: selectedDatasetId
      }),
    [datasetId, selectedDatasetId, selectedItemsByType]
  );
  // Views and fusions carry no input list on their rows, so the ones already
  // reading the target are found by intersecting the selection with the target's
  // own downstream. One request per target, rather than one per selected view.
  const [targetReaderIds, setTargetReaderIds] = useState(null);
  useEffect(() => {
    if (!selectedDatasetId || selectedDatasetId === datasetId) {
      setTargetReaderIds(null);
      return;
    }
    let cancelled = false;
    getDownstreamDatasetIds(selectedDatasetId, tabId)
      .then((ids) => {
        if (!cancelled) setTargetReaderIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setTargetReaderIds(null);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, selectedDatasetId, tabId, targetRefreshKey]);

  const unrepointableDatasets = useMemo(() => {
    if (!targetReaderIds) return [];
    return selectedItemsByType.datasets.filter((d) => targetReaderIds.has(String(d.id)));
  }, [selectedItemsByType, targetReaderIds]);

  const mergeableDataflows = useMemo(() => dataflowInputConflicts.filter((c) => c.canCollapse), [dataflowInputConflicts]);
  const unrepointableDataflows = useMemo(
    () => dataflowInputConflicts.filter((c) => !c.canCollapse),
    [dataflowInputConflicts]
  );

  const excludeIds = useMemo(() => (datasetId ? new Set([datasetId]) : null), [datasetId]);

  // All downstream cards keyed by id (parents and drills), so the column-usages
  // modal can resolve a drill's parent and a parent's name even when the parent
  // itself doesn't reference the column being mapped.
  const cardsById = useMemo(() => {
    const m = new Map();
    const r = results.cards;
    const cardItems = r?.status === 'loaded' ? r.items?.items || [] : [];
    for (const c of cardItems) m.set(String(c.id), c);
    return m;
  }, [results]);

  const beastModeItems = useMemo(() => {
    const r = results.beastModes;
    return r?.status === 'loaded' ? r.items?.items || [] : [];
  }, [
    // Not `results`: any other type's fetch settling replaces that object, which
    // would re-run the reference-graph hydration below, one read per item, again.
    results.beastModes
  ]);

  // Card ids each dataset Beast Mode is actively used by (from the search's
  // activeLinks), keyed by Beast Mode id. Drives the selection lock. Drill links
  // come back as `dr:<drillId>:<rootId>` URNs from the search but are normalized
  // to the bare drill card id in getDatasetFunctions, so they match the selection
  // set (which holds bare drill ids) exactly like parent card ids do.
  const beastModeCardLinks = useMemo(() => {
    const m = new Map();
    for (const bm of beastModeItems) m.set(String(bm.id), bm.activeCardIds || []);
    return m;
  }, [beastModeItems]);

  const selectedCardIdSet = useMemo(
    () => new Set(selectedItemsByType.cards.map((c) => String(c.id))),
    [selectedItemsByType]
  );

  // Build the nested-reference graph once the Beast Mode list settles. It's a
  // function of the loaded list only (not the selection), so it's fetched once
  // per dataset load and reused as the user toggles content. Keyed by numeric
  // Beast Mode id (the id a nested formula references via DOMO_BEAST_MODE(id)).
  useEffect(() => {
    if (beastModeItems.length === 0) {
      setBmRefGraph(new Map());
      return;
    }
    let cancelled = false;
    getBeastModeReferenceGraph(beastModeItems, tabId)
      .then((graph) => {
        if (!cancelled) setBmRefGraph(graph);
      })
      .catch(() => {
        if (!cancelled) setBmRefGraph(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [beastModeItems, tabId]);

  // Every Beast Mode being migrated, expanded over its nested references: the
  // seed is each Beast Mode used by a selected card OR selected directly, then
  // forward-reachability follows `bm -> bms it nests` to its full dependency
  // closure. Cycle-safe via the visited set. In numeric-id space.
  const requiredBeastModeIds = useMemo(() => {
    const seeds = new Set();
    for (const bm of beastModeItems) {
      const fnId = bm?.id != null ? String(bm.id) : null;
      if (fnId && (beastModeCardLinks.get(fnId) || []).some((id) => selectedCardIdSet.has(String(id)))) {
        seeds.add(fnId);
      }
    }
    for (const bm of selectedItemsByType.beastModes) {
      if (bm?.id != null) seeds.add(String(bm.id));
    }
    const visited = new Set();
    const stack = [...seeds];
    while (stack.length > 0) {
      const id = stack.pop();
      if (visited.has(id)) continue;
      visited.add(id);
      for (const ref of bmRefGraph.get(id) || []) {
        if (!visited.has(ref)) stack.push(ref);
      }
    }
    return visited;
  }, [beastModeCardLinks, beastModeItems, bmRefGraph, selectedCardIdSet, selectedItemsByType]);

  // The Beast Modes that something else being migrated nests, so dropping one
  // would dangle that formula. These lock (can't be unchecked). A migrated
  // top-level Beast Mode that nothing references is NOT here, so the user can
  // still drop it (which then releases its now-orphaned dependencies). The
  // closure is forward-closed, so every ref target is itself migrated.
  const lockedBeastModeIds = useMemo(() => {
    const locked = new Set();
    for (const id of requiredBeastModeIds) {
      for (const ref of bmRefGraph.get(id) || []) locked.add(ref);
    }
    return locked;
  }, [bmRefGraph, requiredBeastModeIds]);

  // True when every Beast Mode is locked, either because a selected card uses it
  // or because another migrated Beast Mode nests it. Drives locking the parent
  // "Beast Modes" group checkbox, since its toggle can't change anything.
  const allBeastModesLocked = useMemo(() => {
    if (beastModeItems.length === 0) return false;
    return beastModeItems.every((bm) => {
      const fnId = bm.id != null ? String(bm.id) : null;
      if (!fnId) return false;
      const cardLocked = (beastModeCardLinks.get(fnId) || []).some((cardId) => selectedCardIdSet.has(String(cardId)));
      return cardLocked || lockedBeastModeIds.has(fnId);
    });
  }, [beastModeCardLinks, beastModeItems, lockedBeastModeIds, selectedCardIdSet]);

  // A Beast Mode leaf is locked (kept checked, can't be unchecked) while any
  // card that uses it is selected: dropping it would break those cards on the
  // target. The parent group row locks too once every leaf under it is locked.
  // Returns null for every other row.
  const getItemLock = useCallback(
    (item) => {
      if (item?.typeId !== 'BEAST_MODE_FORMULA') return null;
      // Parent "Beast Modes" group row (no originalId): lock it only when every
      // Beast Mode under it is itself locked, since then the parent toggle has
      // nothing left to change.
      if (item?.isVirtualParent) {
        if (!allBeastModesLocked) return null;
        return {
          locked: true,
          tooltip: 'Every Beast Mode here has to migrate'
        };
      }
      const fnId = item?.originalId != null ? String(item.originalId) : null;
      if (!fnId) return null;
      const usingCount = (beastModeCardLinks.get(fnId) || []).filter((id) => selectedCardIdSet.has(String(id))).length;
      if (usingCount > 0) {
        return {
          locked: true,
          tooltip: `Used by ${usingCount} selected card${usingCount === 1 ? '' : 's'}; it has to migrate too or those cards break`
        };
      }
      // Not used by a card, but another Beast Mode being migrated nests it:
      // dropping it would dangle that formula on the target.
      if (lockedBeastModeIds.has(fnId)) {
        return {
          locked: true,
          tooltip: "Required by a Beast Mode you're migrating; it has to come too or that formula breaks"
        };
      }
      return null;
    },
    [allBeastModesLocked, beastModeCardLinks, lockedBeastModeIds, selectedCardIdSet]
  );

  // Drop the scan and the remap choices whenever the target changes so stale
  // results never leak across targets. Kept out of the schema check below so a
  // refresh re-runs that check without discarding mappings the user has set.
  useEffect(() => {
    setScanResult(null);
    setScanError(null);
    setColumnMap({});
  }, [datasetId, selectedDatasetId]);

  // Run the schema check whenever a target dataset is picked, and again on refresh.
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
  }, [datasetId, selectedDatasetId, tabId, targetRefreshKey]);

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

  // Fetch the target's Beast Modes when a target is chosen so we can flag name
  // collisions with the selected origin Beast Modes (independent of schema
  // compatibility; a collision matters even when the columns line up).
  useEffect(() => {
    if (page !== 'target' || !selectedDatasetId) {
      setTargetBeastModes([]);
      return;
    }
    let cancelled = false;
    setTargetFetchCount((n) => n + 1);
    getDatasetFunctions(selectedDatasetId, tabId)
      .then((bms) => {
        if (!cancelled) setTargetBeastModes(bms || []);
      })
      .catch(() => {
        if (!cancelled) setTargetBeastModes([]);
      })
      .finally(() => setTargetFetchCount((n) => n - 1));
    return () => {
      cancelled = true;
    };
  }, [page, selectedDatasetId, tabId, targetRefreshKey]);

  // Selected origin Beast Modes whose name already exists on the target. These
  // are the ones the user has to resolve (keep / overwrite / rename).
  const beastModeConflicts = useMemo(() => {
    const selected = selectedItemsByType.beastModes || [];
    if (selected.length === 0 || targetBeastModes.length === 0) return [];
    const targetNames = new Set(targetBeastModes.map((b) => b.name));
    return selected.filter((bm) => targetNames.has(bm.name)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedItemsByType, targetBeastModes]);

  const targetBeastModeNames = useMemo(() => new Set(targetBeastModes.map((b) => b.name)), [targetBeastModes]);

  const handleBeastModeChoice = useCallback((bmId, disposition, newName) => {
    setBeastModeChoices((prev) => ({
      ...prev,
      [bmId]: disposition === 'rename' ? { disposition, newName: newName ?? '' } : { disposition }
    }));
  }, []);

  // Set every conflict at once, keeping any name already typed on a row so
  // switching the whole list to Rename new doesn't discard that work.
  const handleAllBeastModeChoices = useCallback(
    (disposition) => {
      setBeastModeChoices((prev) => {
        const next = {};
        for (const bm of beastModeConflicts) {
          next[bm.id] = disposition === 'rename' ? { disposition, newName: prev[bm.id]?.newName ?? '' } : { disposition };
        }
        return next;
      });
    },
    [beastModeConflicts]
  );

  // Fetch the origin's card-level Beast Modes when a target is chosen, so we can
  // flag any whose name collides with a target dataset Beast Mode.
  useEffect(() => {
    if (page !== 'target' || !selectedDatasetId || !datasetId) {
      setCardBeastModes([]);
      return;
    }
    let cancelled = false;
    setTargetFetchCount((n) => n + 1);
    getCardBeastModes(datasetId, tabId)
      .then((bms) => {
        if (!cancelled) setCardBeastModes(bms || []);
      })
      .catch(() => {
        if (!cancelled) setCardBeastModes([]);
      })
      .finally(() => setTargetFetchCount((n) => n - 1));
    return () => {
      cancelled = true;
    };
  }, [datasetId, page, selectedDatasetId, tabId, targetRefreshKey]);

  // Card-level Beast Modes on a SELECTED card whose name already exists as a
  // dataset Beast Mode on the target. Domo rejects saving the card with such a
  // name, so the user must resolve each (use the target's, or rename).
  const cardBeastModeConflicts = useMemo(() => {
    if (cardBeastModes.length === 0 || targetBeastModes.length === 0) return [];
    const targetNames = new Set(targetBeastModes.map((b) => b.name));
    return cardBeastModes
      .filter((bm) => targetNames.has(bm.name) && (bm.activeCardIds || []).some((id) => selectedCardIdSet.has(String(id))))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [cardBeastModes, selectedCardIdSet, targetBeastModes]);

  const handleCardBeastModeChoice = useCallback((bmId, disposition, newName) => {
    setCardBeastModeChoices((prev) => ({
      ...prev,
      [bmId]: disposition === 'rename' ? { disposition, newName: newName ?? '' } : { disposition }
    }));
  }, []);

  const handleAllCardBeastModeChoices = useCallback(
    (disposition) => {
      setCardBeastModeChoices((prev) => {
        const next = {};
        for (const bm of cardBeastModeConflicts) {
          next[bm.id] = disposition === 'rename' ? { disposition, newName: prev[bm.id]?.newName ?? '' } : { disposition };
        }
        return next;
      });
    },
    [cardBeastModeConflicts]
  );

  const targetBeastModeByName = useMemo(() => new Map(targetBeastModes.map((b) => [b.name, b])), [targetBeastModes]);

  // Rows start undecided, so this is the one place an absent choice resolves to
  // what the migration will actually do, shared by the depth check, the submit
  // payload, and the confirm dialog.
  const beastModeDispositionFor = useCallback(
    (bm) => beastModeChoices[bm.id]?.disposition || (targetBeastModeByName.has(bm.name) ? 'keep' : 'create'),
    [beastModeChoices, targetBeastModeByName]
  );

  const plannedBeastModeChoices = useMemo(() => {
    // A leftover entry for a Beast Mode no longer in conflict would reach the
    // service as a keep/overwrite with nothing on the target to match.
    const planned = {};
    for (const bm of beastModeConflicts) {
      const choice = beastModeChoices[bm.id];
      const disposition = beastModeDispositionFor(bm);
      planned[bm.id] = disposition === 'rename' ? { disposition, newName: choice?.newName ?? '' } : { disposition };
    }
    return planned;
  }, [beastModeChoices, beastModeConflicts, beastModeDispositionFor]);

  // Conflicts the user hasn't answered, so the UI can say how many decisions are
  // outstanding and the confirm dialog can name what the defaults will do.
  const undecidedBeastModeCount = useMemo(
    () => beastModeConflicts.filter((bm) => !beastModeChoices[bm.id]?.disposition).length,
    [beastModeChoices, beastModeConflicts]
  );

  const undecidedCardBeastModeCount = useMemo(
    () => cardBeastModeConflicts.filter((bm) => !cardBeastModeChoices[bm.id]?.disposition).length,
    [cardBeastModeChoices, cardBeastModeConflicts]
  );

  // Resolutions the card swap applies: per colliding card-level Beast Mode, either
  // rename it or repoint its references to the same-named target dataset Beast
  // Mode (carrying that Beast Mode's legacyId + numeric template id).
  const cardBeastModeResolutions = useMemo(
    () =>
      cardBeastModeConflicts.map((bm) => {
        const choice = cardBeastModeChoices[bm.id] || { disposition: 'useTarget' };
        const target = targetBeastModeByName.get(bm.name);
        return {
          disposition: choice.disposition,
          newName: choice.newName,
          originLegacyId: bm.legacyId,
          originTemplateId: bm.id,
          targetLegacyId: target?.legacyId ?? null,
          targetTemplateId: target?.id ?? null
        };
      }),
    [cardBeastModeChoices, cardBeastModeConflicts, targetBeastModeByName]
  );

  const nestedDependencyTargets = useMemo(() => {
    const byId = new Map(beastModeItems.map((bm) => [String(bm.id), bm]));
    const targets = new Map();
    for (const deps of bmRefGraph.values()) {
      for (const depId of deps) {
        if (targets.has(depId)) continue;
        const target = targetBeastModeByName.get(byId.get(depId)?.name);
        if (target) targets.set(depId, target);
      }
    }
    return targets;
  }, [beastModeItems, bmRefGraph, targetBeastModeByName]);

  // Which of those target Beast Modes are themselves nested, which is what makes
  // reusing one push the Beast Mode nesting it past Domo's one-level limit.
  useEffect(() => {
    const targets = [...nestedDependencyTargets.values()];
    if (targets.length === 0) {
      setNestingTargetBeastModeIds(new Set());
      return;
    }
    let cancelled = false;
    setTargetFetchCount((n) => n + 1);
    getNestingBeastModeIds(targets, tabId)
      .then((ids) => {
        if (!cancelled) setNestingTargetBeastModeIds(ids);
      })
      .catch(() => {
        if (!cancelled) setNestingTargetBeastModeIds(new Set());
      })
      .finally(() => setTargetFetchCount((n) => n - 1));
    return () => {
      cancelled = true;
    };
  }, [nestedDependencyTargets, tabId]);

  // One level is Domo's limit: a dependency arriving already nested puts whatever
  // nests it a level too deep. A copy reproduces the origin's accepted depth.
  const depthBlockedBeastModes = useMemo(() => {
    if (nestingTargetBeastModeIds.size === 0) return [];
    const byId = new Map(beastModeItems.map((bm) => [String(bm.id), bm]));
    const blocked = [];
    for (const bm of selectedItemsByType.beastModes) {
      // Only a create is checked: a kept Beast Mode is never written, so its
      // nesting is never re-validated, and an overwrite lands after every create,
      // which is Domo's to judge on that write.
      const disposition = beastModeDispositionFor(bm);
      if (disposition !== 'create' && disposition !== 'rename') continue;
      const dependencies = [];
      for (const depId of bmRefGraph.get(String(bm.id)) || []) {
        const target = nestedDependencyTargets.get(depId);
        if (!target || !nestingTargetBeastModeIds.has(String(target.id))) continue;
        const dep = byId.get(depId);
        // The dependency only arrives already nested when it reuses the target's
        // Beast Mode: keep leaves that definition alone, and overwrite replaces it
        // only after this create has already run.
        const depDisposition = dep ? beastModeDispositionFor(dep) : 'keep';
        if (depDisposition !== 'keep' && depDisposition !== 'overwrite') continue;
        dependencies.push({ id: depId, name: dep?.name || depId });
      }
      if (dependencies.length > 0) {
        blocked.push({ dependencies, id: String(bm.id), name: bm.name || String(bm.id) });
      }
    }
    return blocked.sort((a, b) => a.name.localeCompare(b.name));
  }, [
    beastModeDispositionFor,
    beastModeItems,
    bmRefGraph,
    nestedDependencyTargets,
    nestingTargetBeastModeIds,
    selectedItemsByType
  ]);

  // The depth warning as one sentence, assembled here rather than inline so the
  // markup isn't a nest of pluralization ternaries.
  const depthBlockedMessage = useMemo(() => {
    if (depthBlockedBeastModes.length === 0) return null;
    const blocked = depthBlockedBeastModes.map((bm) => `"${bm.name}"`).join(', ');
    const dependencies = [
      ...new Set(depthBlockedBeastModes.flatMap((bm) => bm.dependencies.map((dep) => `"${dep.name}"`)))
    ].join(', ');
    const one = depthBlockedBeastModes.length === 1;
    return (
      `Domo allows only one level of Beast Mode nesting. ${blocked} ` +
      `${one ? 'nests a Beast Mode that is' : 'nest Beast Modes that are'} already nested on the target, so Domo will ` +
      `reject ${one ? 'it' : 'them'} and any card using ${one ? 'it' : 'them'} will keep pointing at the original ` +
      `dataset. Switch ${dependencies} below to Rename new so a copy comes along instead of reusing the target's.`
    );
  }, [depthBlockedBeastModes]);

  // The same finding keyed by the dependency the user has to change, so each
  // conflict row can say what keeping it costs.
  const depthBlockedByDependency = useMemo(() => {
    const byDependency = new Map();
    for (const { dependencies, name } of depthBlockedBeastModes) {
      for (const dep of dependencies) {
        if (!byDependency.has(dep.id)) byDependency.set(dep.id, []);
        byDependency.get(dep.id).push(name);
      }
    }
    return byDependency;
  }, [depthBlockedBeastModes]);

  // Fetch the target's row PDP policies once a target is chosen, but only when a
  // selected alert actually references a named policy (the common all-rows alert
  // needs no remap). Used to auto-match origin policies by name and to populate
  // the per-policy dropdown for any that don't match.
  const selectedAlertsRefPdp = useMemo(
    () => (selectedItemsByType.alerts || []).some((a) => extractAlertPdpPolicies(a).some((p) => p.type !== 'open')),
    [selectedItemsByType]
  );

  useEffect(() => {
    if (page !== 'target' || !selectedDatasetId || !selectedAlertsRefPdp) {
      setTargetPdpPolicies(null);
      setPdpLoaded(true);
      return;
    }
    let cancelled = false;
    setPdpLoaded(false);
    setTargetPdpPolicies(null);
    getRowPdpPolicies(selectedDatasetId, tabId)
      .then((policies) => {
        if (cancelled) return;
        setTargetPdpPolicies(policies || []);
        setPdpLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setTargetPdpPolicies([]);
        setPdpLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [page, selectedAlertsRefPdp, selectedDatasetId, tabId, targetRefreshKey]);

  // Distinct named PDP policies referenced by the selected alerts (the open "All
  // Rows" group auto-resolves and is excluded). These are the candidates for
  // remapping onto the target.
  const alertPdpReferences = useMemo(() => {
    const byId = new Map();
    for (const alert of selectedItemsByType.alerts || []) {
      for (const p of extractAlertPdpPolicies(alert)) {
        if (p.type === 'open' || byId.has(p.filterGroupId)) continue;
        byId.set(p.filterGroupId, p);
      }
    }
    return [...byId.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedItemsByType]);

  // Named target policies indexed by name (first wins), for same-name auto-match.
  const targetPdpByName = useMemo(() => {
    const m = new Map();
    for (const p of targetPdpPolicies || []) {
      if (p.type !== 'open' && p.name && !m.has(p.name)) m.set(p.name, p);
    }
    return m;
  }, [targetPdpPolicies]);

  // Referenced policies with no same-name policy on the target: the ones the user
  // must resolve (map to a target policy, or remove to widen the alert).
  const unmatchedPdpReferences = useMemo(
    () => (targetPdpPolicies === null ? [] : alertPdpReferences.filter((p) => !targetPdpByName.has(p.name))),
    [alertPdpReferences, targetPdpByName, targetPdpPolicies]
  );

  // Prune choices for policies no longer unmatched (e.g. selection changed). No
  // default disposition is seeded, so each unmatched policy stays unresolved
  // until the user picks, which keeps the migration gated.
  useEffect(() => {
    // Skip while no comparison has run: every reference reads as matched then,
    // which would discard the user's choices mid-refresh.
    if (targetPdpPolicies === null) return;
    setPdpChoices((prev) => {
      const validKeys = new Set(unmatchedPdpReferences.map((p) => String(p.filterGroupId)));
      const next = {};
      let changed = false;
      for (const k of Object.keys(prev)) {
        if (validKeys.has(k)) next[k] = prev[k];
        else changed = true;
      }
      if (!changed) return prev;
      return next;
    });
  }, [targetPdpPolicies, unmatchedPdpReferences]);

  const handlePdpChoice = useCallback((filterGroupId, disposition, targetFilterGroupId) => {
    setPdpChoices((prev) => ({
      ...prev,
      [String(filterGroupId)]:
        disposition === 'map' ? { disposition, targetFilterGroupId: targetFilterGroupId ?? null } : { disposition }
    }));
  }, []);

  // The resolution map handed to the migration, keyed by origin filterGroupId and
  // covering every referenced group: the open group and same-name matches resolve
  // automatically; unmatched groups use the user's choice. Groups still
  // unresolved are omitted (the migrate button is gated until none remain).
  const pdpMap = useMemo(() => {
    const targetOpen = (targetPdpPolicies || []).find((p) => p.type === 'open');
    const map = {};
    const refsById = new Map();
    for (const alert of selectedItemsByType.alerts || []) {
      for (const p of extractAlertPdpPolicies(alert)) {
        if (!refsById.has(p.filterGroupId)) refsById.set(p.filterGroupId, p);
      }
    }
    for (const p of refsById.values()) {
      if (p.type === 'open') {
        if (targetOpen) map[p.filterGroupId] = { action: 'map', target: targetOpen };
        continue;
      }
      const match = targetPdpByName.get(p.name);
      if (match) {
        map[p.filterGroupId] = { action: 'map', target: match };
        continue;
      }
      const choice = pdpChoices[String(p.filterGroupId)];
      if (choice?.disposition === 'remove') {
        map[p.filterGroupId] = { action: 'remove' };
      } else if (choice?.disposition === 'map' && choice.targetFilterGroupId != null) {
        const t = (targetPdpPolicies || []).find((tp) => String(tp.filterGroupId) === String(choice.targetFilterGroupId));
        if (t) map[p.filterGroupId] = { action: 'map', target: t };
      }
    }
    return map;
  }, [pdpChoices, selectedItemsByType, targetPdpByName, targetPdpPolicies]);

  // True while any referenced PDP policy lacks a valid resolution: still loading,
  // or an unmatched policy the user hasn't mapped or removed yet. Gates migrate.
  const pdpChoiceInvalid = useMemo(() => {
    if (!selectedAlertsRefPdp) return false;
    // Unknown counts as unresolved: the migrate button is separately gated on a
    // target being chosen, so this only ever holds while the fetch is in flight.
    if (!pdpLoaded || targetPdpPolicies === null) return true;
    for (const p of unmatchedPdpReferences) {
      const choice = pdpChoices[String(p.filterGroupId)];
      if (!choice) return true;
      if (choice.disposition === 'map' && choice.targetFilterGroupId == null) return true;
    }
    return false;
  }, [pdpChoices, pdpLoaded, selectedAlertsRefPdp, targetPdpPolicies, unmatchedPdpReferences]);

  const undecidedPdpCount = useMemo(
    () =>
      unmatchedPdpReferences.filter((p) => {
        const choice = pdpChoices[String(p.filterGroupId)];
        return !choice || (choice.disposition === 'map' && choice.targetFilterGroupId == null);
      }).length,
    [pdpChoices, unmatchedPdpReferences]
  );

  const hasMismatches = comparison && !comparison.compatible;

  // SQL dataflows (Redshift/MySQL) whose SQL references origin in a shape we
  // can't auto-remap (origin SELECT *, an unsupported engine). These get an
  // honest "review manually" note instead of the old false "all clear".
  const sqlDataflowWarnings = scanResult?.dataflowSqlWarnings || [];
  // Magic ETL dataflows with a Python/R script tile that references a column the
  // user could remap. The script body can't be auto-rewritten, so it's flagged
  // for the user to update by hand.
  const scriptDataflowWarnings = scanResult?.dataflowScriptWarnings || [];
  // Fusion views whose origin columns appear inside computed expressions: the
  // simple refs are remapped automatically, but the computation may need a look.
  const viewFusionWarnings = scanResult?.viewFusionWarnings || [];

  // Columns that are BOTH used by selected content AND missing/changed in the
  // target schema. The intersection is what the user has to decide about;
  // anything outside it is either irrelevant or already compatible.
  const usedUnmappedColumns = useMemo(() => {
    if (!hasMismatches || !scanResult) return [];
    const missing = comparison?.missing || [];
    const mismatchedIndex = indexColumnNames(missing.map((m) => m.name));
    // expectedType is the origin column's own type, surfaced so the user knows
    // the existing type when choosing a target column to remap onto.
    const typeByName = new Map(missing.map((m) => [m.name, m.expectedType]));
    const targetIndex = indexColumnNames(targetColumns.map((c) => c.name));
    const referenced = scanResult.byColumn || new Map();
    const out = [];
    for (const [colName, items] of referenced.entries()) {
      const mismatched = resolveColumnName(colName, mismatchedIndex);
      if (mismatched) {
        out.push({ items, name: colName, type: typeByName.get(mismatched) ?? null });
        continue;
      }
      // Gated on the target columns having loaded, or an empty set flags them all.
      if (targetIndex.size > 0 && !resolveColumnName(colName, targetIndex) && isBrokenColumnReference(colName, items)) {
        out.push({ items, name: colName, type: null });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [comparison, hasMismatches, scanResult, targetColumns]);

  const unmappedColumnCount = useMemo(
    () => usedUnmappedColumns.filter((c) => columnMap[c.name] == null).length,
    [columnMap, usedUnmappedColumns]
  );

  // Names of used-unmapped columns whose every usage is a card or drill (type
  // 'cards'). These are the columns whose references live only in card
  // definitions, so they're the ones we can rewrite to a target Beast Mode id
  // (and the precondition for dropping). A column also used by a dataflow/view
  // can't take either action.
  const cardOnlyColumnNames = useMemo(() => {
    const names = new Set();
    for (const { items, name } of usedUnmappedColumns) {
      if (items.length > 0 && items.every((it) => it.type === 'cards')) names.add(name);
    }
    return names;
  }, [usedUnmappedColumns]);

  // Columns eligible for the "drop column" choice, per the shared rule Remap
  // Columns applies too (`isColumnDroppable`). Re-derived on every render, and
  // re-applied at migrate time, so a stale choice can't slip through to content
  // the drop would corrupt.
  const droppableColumnNames = useMemo(() => {
    const names = new Set();
    for (const { items, name } of usedUnmappedColumns) {
      if (isColumnDroppable(items, cardsById)) names.add(name);
    }
    return names;
  }, [cardsById, usedUnmappedColumns]);

  // The effective rename map + dropped-column list, derived once from the user's
  // column choices and reused by both the migration and the pro-code app
  // collision warning so the warning can't drift from what actually runs. DROP
  // choices travel separately; a Beast Mode mapping only applies to a card-only
  // column.
  const { droppedColumns: plannedDroppedColumns, renameMap: plannedRenameMap } = useMemo(() => {
    const beastModeLegacyIds = new Set((targetBeastModes || []).map((b) => b.legacyId).filter(Boolean));
    const renameMap = {};
    const droppedColumns = [];
    for (const [name, choice] of Object.entries(columnMap)) {
      if (choice === DROP) {
        if (droppableColumnNames.has(name)) droppedColumns.push(name);
      } else if (choice != null && choice !== UNMAPPED) {
        if (beastModeLegacyIds.has(choice)) {
          if (cardOnlyColumnNames.has(name)) renameMap[name] = choice;
        } else {
          renameMap[name] = choice;
        }
      }
    }
    return { droppedColumns, renameMap };
  }, [cardOnlyColumnNames, columnMap, droppableColumnNames, targetBeastModes]);

  // Pro-code apps whose selected column mapping would collapse two or more
  // aliases onto the same column (so those fields would silently blank out).
  const appColumnCollisions = useMemo(() => {
    const out = [];
    for (const app of selectedItemsByType.apps || []) {
      const collisions = findAppColumnCollisions(app.fieldGroups, plannedRenameMap);
      if (collisions.length > 0) out.push({ collisions, id: app.id, name: app.name || String(app.id) });
    }
    return out;
  }, [plannedRenameMap, selectedItemsByType]);

  // A notebook names its columns in code, so a rename or a drop always needs a
  // person; nothing in the scan can find or rewrite those references.
  const jupyterColumnWarnings = useMemo(() => {
    if (!hasEffectiveMapping(plannedRenameMap) && plannedDroppedColumns.length === 0) return [];
    return (selectedItemsByType.jupyterWorkspaces || []).map((w) => ({ id: w.id, name: w.name || String(w.id) }));
  }, [plannedDroppedColumns, plannedRenameMap, selectedItemsByType]);

  const dataListItems = useMemo(
    () =>
      MIGRATE_TYPES.filter((t) => !t.onDemand || jupyterCheckStarted).map((t) => {
        const result = results[t.key];
        const xfer = transferStatus[t.key];
        const status = xfer?.status ?? result?.status ?? 'loading';

        let count;
        let countLabel = null;
        let error = null;
        let errorDetail = null;
        let children;

        if (result?.status === 'loaded' && result.items?.items) {
          const items = result.items.items;
          if (t.key === 'cards') {
            // Drills nest under their parent card, so the group's own count is
            // the parent cards; the drill total rides along as "+ N drills".
            const drillsCount = items.filter((c) => c.isDrill).length;
            count = items.length - drillsCount;
            if (drillsCount > 0) countLabel = `+ ${drillsCount} drill${drillsCount === 1 ? '' : 's'}`;
            children = buildCardItems(items, origin);
          } else {
            count = items.length;
            children = buildLeafItems(t.key, items, origin);
          }
        } else if (result?.status === 'error') {
          error = result.error;
        }

        if (xfer) {
          if (xfer.error) error = xfer.error;
          if (xfer.errorDetail) errorDetail = xfer.errorDetail;
          if (xfer.count !== undefined) count = xfer.count;
          // Transfer progress shows a plain count, not the "+ N drills" tally.
          countLabel = null;
        }

        return new DataListItem({
          annotation: t.key === 'jupyterWorkspaces' ? JUPYTER_VISIBILITY_NOTE : null,
          children,
          count,
          countLabel,
          error,
          errorDetail,
          id: t.key,
          isVirtualParent: true,
          label: typeGroupLabel(t.key),
          status,
          // typeId drives the leading ObjectTypeIcon on the parent row,
          // matching the icon already shown on each leaf inside the group.
          typeId: TYPE_KEY_TO_DOMO_TYPE[t.key]
        });
      }),
    [jupyterCheckStarted, results, transferStatus, origin]
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

      // Drill leaves grouped by their parent card's leaf id, so toggling a card
      // cascades to its nested drills.
      const cardsForDrills = results.cards;
      const allCardItems = cardsForDrills?.status === 'loaded' ? cardsForDrills.items?.items || [] : [];
      const drillLeavesByParentLeaf = new Map();
      for (const c of allCardItems) {
        if (!c.isDrill || c.parentId == null) continue;
        const parentLeaf = leafSelectionId('cards', c.parentId);
        if (!drillLeavesByParentLeaf.has(parentLeaf)) drillLeavesByParentLeaf.set(parentLeaf, []);
        drillLeavesByParentLeaf.get(parentLeaf).push(leafSelectionId('cards', c.id));
      }

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
        let items = r?.status === 'loaded' ? r.items?.items || [] : [];
        // For cards, only the parent (non-drill) cards are direct children of
        // the group; nested drills don't gate the group's own checked state.
        if (typeKey === 'cards') items = items.filter((c) => !c.isDrill);
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
      // A parent card toggling cascades to its nested drills. Drills stay
      // independently toggleable, so unchecking one just leaves the card
      // partially selected rather than dropping the card itself.
      for (const id of added) {
        for (const leaf of drillLeavesByParentLeaf.get(id) || []) {
          next.add(leaf);
        }
      }
      for (const id of removed) {
        for (const leaf of drillLeavesByParentLeaf.get(id) || []) {
          next.delete(leaf);
        }
      }
      // Leaf toggles reconcile parent.
      const touchedTypes = new Set();
      for (const id of [...added, ...removed]) {
        const typeKey = parseLeafTypeKey(id);
        if (typeKey) touchedTypes.add(typeKey);
      }
      for (const typeKey of touchedTypes) reconcileLeafParent(typeKey);

      // Enforce Beast Mode locks against the resulting card selection: any
      // Beast Mode used by a still-selected card stays checked, even if a
      // parent cascade or deselect-all just tried to drop it. (The read-only
      // checkbox blocks unchecking it directly; this covers the group paths.)
      const cardsResult = results.cards;
      const cardItems = cardsResult?.status === 'loaded' ? cardsResult.items?.items || [] : [];
      const selectedCardIds = new Set();
      for (const card of cardItems) {
        if (next.has(leafSelectionId('cards', card.id))) selectedCardIds.add(String(card.id));
      }
      const bmResult = results.beastModes;
      const bmItems = bmResult?.status === 'loaded' ? bmResult.items?.items || [] : [];
      for (const bm of bmItems) {
        if ((bm.activeCardIds || []).some((id) => selectedCardIds.has(String(id)))) {
          next.add(leafSelectionId('beastModes', bm.id));
        }
      }

      // Enforce nested Beast Mode dependencies: any Beast Mode nested by a Beast
      // Mode being migrated (one a still-selected card uses, or one selected
      // directly) must come too, or its formula dangles on the target. Seed from
      // the resulting selection, expand the reference closure (in numeric-id
      // space), and re-add every dependency. (The read-only checkbox blocks
      // dropping a locked dependency directly; this covers the cascade paths.)
      const seeds = new Set();
      for (const bm of bmItems) {
        if (bm?.id != null && next.has(leafSelectionId('beastModes', bm.id))) seeds.add(String(bm.id));
      }
      const visited = new Set();
      const stack = [...seeds];
      while (stack.length > 0) {
        const id = stack.pop();
        if (visited.has(id)) continue;
        visited.add(id);
        for (const ref of bmRefGraph.get(id) || []) {
          if (!visited.has(ref)) stack.push(ref);
        }
      }
      for (const id of visited) next.add(leafSelectionId('beastModes', id));
      reconcileLeafParent('beastModes');

      setSelectedIds(next);
    },
    [bmRefGraph, results, selectedIds]
  );

  const subtextNode = useMemo(() => {
    if (isTransferring) {
      const inFlight = Object.values(transferStatus).filter((x) => x.status === 'transferring').length;
      const done = Object.values(transferStatus).filter((x) => x.status === 'transferred' || x.status === 'failed').length;
      const total = inFlight + done;
      return `Migrating… **${done}**/${total} ${total === 1 ? 'Type' : 'Types'}`;
    }
    if (!isFullyLoaded) {
      return `Searching downstream content… (${AUTO_MIGRATE_TYPES.length - loadingCount}/${AUTO_MIGRATE_TYPES.length})`;
    }
    if (jupyterStatus === 'loading') return 'Searching Jupyter Workspaces…';
    let text = `**${totalSelected}** of **${totalAvailable}** selected`;
    if (errorCount > 0) {
      text += ` (${errorCount} failed to load)`;
    }
    return text;
  }, [
    isTransferring,
    transferStatus,
    isFullyLoaded,
    jupyterStatus,
    loadingCount,
    totalAvailable,
    totalSelected,
    errorCount
  ]);

  // A rename choice with an empty or already-taken name can't be migrated.
  const invalidBeastModeRenameCount = useMemo(
    () => countInvalidRenames(beastModeConflicts, beastModeChoices, targetBeastModeNames),
    [beastModeConflicts, beastModeChoices, targetBeastModeNames]
  );

  const invalidCardBeastModeRenameCount = useMemo(
    () => countInvalidRenames(cardBeastModeConflicts, cardBeastModeChoices, targetBeastModeNames),
    [cardBeastModeConflicts, cardBeastModeChoices, targetBeastModeNames]
  );

  const beastModeChoiceInvalid = invalidBeastModeRenameCount > 0;
  const cardBeastModeChoiceInvalid = invalidCardBeastModeRenameCount > 0;

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
    scanError !== null ||
    beastModeChoiceInvalid ||
    cardBeastModeChoiceInvalid ||
    pdpChoiceInvalid;

  // CTA wording reflects the schema state: a clean migrate, a migrate that
  // will apply the user's column remap, or an explicit proceed-despite-mismatch.
  const migrateLabel = useMemo(() => {
    if (!hasMismatches) return 'Migrate';
    return hasEffectiveMapping(columnMap) ? 'Migrate with Remap' : 'Proceed Anyway';
  }, [columnMap, hasMismatches]);

  // Spells out what the rows the user never answered are about to do, so a
  // scrolled-past section can't decide anything silently.
  const defaultedDecisionParts = useMemo(() => {
    const parts = [];
    if (undecidedBeastModeCount > 0) {
      parts.push(
        `${undecidedBeastModeCount} Beast ${undecidedBeastModeCount === 1 ? 'Mode' : 'Modes'} will keep the target's version`
      );
    }
    if (undecidedCardBeastModeCount > 0) {
      parts.push(
        `${undecidedCardBeastModeCount} card Beast ${undecidedCardBeastModeCount === 1 ? 'Mode' : 'Modes'} will use the target's`
      );
    }
    if (unmappedColumnCount > 0) {
      parts.push(`${unmappedColumnCount} ${unmappedColumnCount === 1 ? 'column' : 'columns'} will be left unmapped`);
    }
    return parts;
  }, [undecidedBeastModeCount, undecidedCardBeastModeCount, unmappedColumnCount]);

  const columnRemapStatus = unmappedColumnCount > 0 ? countChip(unmappedColumnCount, 'unmapped') : RESOLVED_CHIP;

  const beastModeStatus =
    invalidBeastModeRenameCount > 0
      ? NEEDS_NAME_CHIP
      : undecidedBeastModeCount > 0
        ? countChip(undecidedBeastModeCount, 'to resolve')
        : RESOLVED_CHIP;

  const cardBeastModeStatus =
    invalidCardBeastModeRenameCount > 0
      ? NEEDS_NAME_CHIP
      : undecidedCardBeastModeCount > 0
        ? countChip(undecidedCardBeastModeCount, 'to resolve')
        : RESOLVED_CHIP;

  const pdpStatus = undecidedPdpCount > 0 ? countChip(undecidedPdpCount, 'to resolve', 'danger') : RESOLVED_CHIP;

  const firstUnresolvedSection = useMemo(() => {
    if (unmappedColumnCount > 0) return 'columns';
    if (invalidBeastModeRenameCount > 0 || undecidedBeastModeCount > 0) return 'beastModes';
    if (invalidCardBeastModeRenameCount > 0 || undecidedCardBeastModeCount > 0) return 'cardBeastModes';
    if (undecidedPdpCount > 0) return 'pdp';
    return null;
  }, [
    invalidBeastModeRenameCount,
    invalidCardBeastModeRenameCount,
    undecidedBeastModeCount,
    undecidedCardBeastModeCount,
    undecidedPdpCount,
    unmappedColumnCount
  ]);

  const targetFetchesPending = isComparing || isScanning || !pdpLoaded || targetFetchCount > 0;
  const reconciliationSettled = Boolean(selectedDatasetId) && !targetFetchesPending;

  // Waits for every fetch to settle before choosing, or whichever section resolves
  // first wins the seed regardless of priority. Seeds once, so a later change can't
  // reopen a section the user deliberately collapsed.
  useEffect(() => {
    if (seededExpansionRef.current || !reconciliationSettled) return;
    seededExpansionRef.current = true;
    if (firstUnresolvedSection) setExpandedSections(new Set([firstUnresolvedSection]));
  }, [firstUnresolvedSection, reconciliationSettled]);

  useEffect(() => {
    seededExpansionRef.current = false;
  }, [selectedDatasetId]);

  const blockedDecisionCount = undecidedPdpCount + invalidBeastModeRenameCount + invalidCardBeastModeRenameCount;
  const defaultedDecisionCount = undecidedBeastModeCount + undecidedCardBeastModeCount + unmappedColumnCount;

  // The dataset currently open in the browser tab, offered as a one-tap target
  // when the user navigates somewhere new after starting the migration (the
  // common "open the dataset I want to migrate to, copy its id, paste it" flow).
  // Suppressed entirely once a target is chosen (by either path): the picker is
  // already settled, so re-offering whatever tab the user wanders to would just
  // be noise. Otherwise only a DATA_SOURCE that isn't the origin and hasn't been
  // dismissed qualifies. `currentContext` is the live tab context from the app,
  // distinct from the origin captured at launch, so navigating away changes only
  // the suggestion, never the origin.
  const suggestedTarget = useMemo(() => {
    if (selectedDatasetId) return null;
    const obj = currentContext?.domoObject;
    if (!obj || obj.typeId !== 'DATA_SOURCE') return null;
    const id = obj.id;
    if (!id || id === datasetId || dismissedSuggestionIds.has(id)) return null;
    const name = obj.metadata?.name || obj.metadata?.displayName || `DataSet ${id}`;
    return { id, name };
  }, [currentContext, datasetId, selectedDatasetId, dismissedSuggestionIds]);

  const handleDismissSuggestedTarget = useCallback(() => {
    setDismissedSuggestionIds((prev) => (suggestedTarget ? new Set(prev).add(suggestedTarget.id) : prev));
  }, [suggestedTarget]);

  const handleUseSuggestedTarget = useCallback(() => {
    if (!suggestedTarget) return;
    setSelectedDatasetId(suggestedTarget.id);
    setSelectedDatasetName(suggestedTarget.name);
  }, [suggestedTarget]);

  // Only the target-side fetches: refetching page 1's downstream lists would
  // empty the selection mid-flight and reset every conflict choice keyed off it.
  const handleRefreshTarget = useCallback(() => setTargetRefreshKey((n) => n + 1), []);

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

  // Auto-map each origin column to its closest target column, matching on whole
  // words via the shared matcher (the same one Remap Columns uses). No good match
  // leaves the column unmapped. This OVERWRITES every existing choice, which is
  // why handleAutoMapClick gates on a confirm dialog when anything is mapped.
  const runAutoMap = useCallback(() => {
    const next = {};
    for (const { name } of usedUnmappedColumns) {
      next[name] = suggestReplacement(name, targetColumns) || null;
    }
    setColumnMap(next);
  }, [targetColumns, usedUnmappedColumns]);

  // runAutoMap is synchronous, so on its own the button gives no sign it ran.
  // Flash a spinner, do the mapping, then settle on a checkmark for a moment
  // before returning to idle. Timers are tracked so they can be cleared on
  // unmount (and reset if the button is pressed again mid-flash). Defined before
  // handleAutoMapClick so its dependency-array reference isn't in the TDZ.
  const runAutoMapWithFeedback = useCallback(() => {
    autoMapTimersRef.current.forEach(clearTimeout);
    autoMapTimersRef.current = [];
    setAutoMapStatus('mapping');
    const mapTimer = setTimeout(() => {
      runAutoMap();
      if (!mountedRef.current) return;
      setAutoMapStatus('done');
      const resetTimer = setTimeout(() => {
        if (mountedRef.current) setAutoMapStatus('idle');
      }, 1500);
      autoMapTimersRef.current.push(resetTimer);
    }, 350);
    autoMapTimersRef.current.push(mapTimer);
  }, [runAutoMap]);

  const handleAutoMapClick = useCallback(() => {
    const alreadyMapped = Object.values(columnMap).some((to) => to != null);
    if (alreadyMapped) {
      setAutoMapConfirmOpen(true);
    } else {
      runAutoMapWithFeedback();
    }
  }, [columnMap, runAutoMapWithFeedback]);

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

    // Split the remap state into renames and drops. The DROP sentinel never
    // reaches the rewriters; drops travel separately. Beast Mode mappings store
    // the target Beast Mode's legacyId as the value; the card rewriter renames
    // the column reference to that id (the same id form a card uses to reference
    // a dataset Beast Mode), so they ride along in the rename map. Both drops and
    // Beast Mode mappings are re-checked against their eligible set so a stale
    // choice (e.g. after a selection change) can't slip through to a dataflow or
    // view that the rewrite would corrupt.
    const renameMap = plannedRenameMap;
    const droppedColumns = plannedDroppedColumns;

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
        beastModeChoices: plannedBeastModeChoices,
        cardBeastModeResolutions,
        columnMap: renameMap,
        definitionsByItemKey,
        droppedColumns,
        onProgress: ({ count, result, status, typeKey }) => {
          if (!mountedRef.current) return;
          setTransferStatus((prev) => {
            const next = { ...prev };
            if (status === 'transferring') {
              next[typeKey] = { count, status: 'transferring' };
            } else if (status === 'done') {
              const failed = result?.failed ?? 0;
              const succeeded = result?.succeeded ?? 0;
              const skipped = result?.skipped ?? [];
              next[typeKey] = {
                count: count ?? succeeded + failed,
                error: failed > 0 ? formatErrors(result) : formatSkips(skipped),
                errorDetail: failed > 0 ? (result?.errors ?? null) : skipped.length > 0 ? skipped : null,
                failed,
                skipped: skipped.length,
                status: failed > 0 ? 'failed' : 'transferred',
                succeeded
              };
            }
            return next;
          });
        },
        originBeastModes: beastModeItems,
        originId: datasetId,
        originName: datasetName,
        pdpMap,
        selectedItems,
        tabId,
        targetBeastModes,
        targetColumnTypes,
        targetId,
        targetName,
        useFullPath
      });

      let totalSucceeded = 0;
      let totalFailed = 0;
      let totalManualReview = 0;
      let totalSkipped = 0;
      let totalMerged = 0;
      let totalFiltersDropped = 0;
      for (const [, r] of transferResults) {
        totalSucceeded += r.succeeded || 0;
        totalFailed += r.failed || 0;
        totalManualReview += r.manualReview?.length || 0;
        totalSkipped += r.skipped?.length || 0;
        totalMerged += r.mergedInputs?.length || 0;
        totalFiltersDropped += (r.droppedFilters || []).reduce((sum, entry) => sum + (entry.count || 0), 0);
      }

      // Items that moved but need a hand afterwards: a SQL dataflow whose SQL
      // couldn't be safely rewritten, an alert that lost a piece Domo wouldn't
      // take. Each one's row says what it needs.
      const reviewNote =
        totalManualReview > 0
          ? ` ${totalManualReview} item${totalManualReview !== 1 ? 's' : ''} flagged for manual review.`
          : '';
      const skipNote =
        totalSkipped > 0 ? ` ${totalSkipped} item${totalSkipped !== 1 ? 's' : ''} skipped, each row says why.` : '';
      const mergeNote =
        totalMerged > 0 ? ` ${totalMerged} dataflow${totalMerged !== 1 ? 's' : ''} had an input merged.` : '';
      // A filter with no values filters nothing and blocks Domo's card write, so
      // it comes out as part of the repoint; say so, since it edits the card.
      const filterNote =
        totalFiltersDropped > 0
          ? ` Removed ${totalFiltersDropped} filter${totalFiltersDropped !== 1 ? 's' : ''} that had no values.`
          : '';

      const targetLabel = targetName ? `**${targetName}**` : `**${targetId}**`;
      if (totalFailed > 0) {
        showStatus(
          'Migration Partially Complete',
          `**${totalSucceeded}** succeeded, **${totalFailed}** failed migrating to ${targetLabel}.${reviewNote}${skipNote}${mergeNote}${filterNote}`,
          'warning',
          7000
        );
        // Some items failed: drop back to the list, where each per-type row
        // shows its own failure message, instead of closing.
        if (mountedRef.current) setPage('select');
      } else if (totalManualReview > 0 || totalSkipped > 0) {
        showStatus(
          'Migration Complete',
          `Migrated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''} to ${targetLabel}.${reviewNote}${skipNote}${mergeNote}${filterNote}`,
          'warning',
          9000
        );
        // Something still needs the user: a hand edit, or an item left behind.
        // Skips keep the list open so the rows naming them stay visible.
        if (totalSkipped > 0 && mountedRef.current) setPage('select');
        else onBackToDefault?.();
      } else {
        showStatus(
          'Migration Complete',
          `Migrated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''} to ${targetLabel}${mergeNote}${filterNote}`,
          'success',
          7000
        );
        // Fully succeeded: close the view back to default. The toast lives in
        // the App-level ToastProvider, so it survives this unmount. Only a
        // clean run closes; any failure instead drops back to the list (above
        // and in catch) so the failed per-type rows stay visible.
        onBackToDefault?.();
      }
    } catch (err) {
      showStatus('Migration Failed', err.message || 'An error occurred', 'danger', 7000);
      // The run threw before finishing, so some rows are still mid-flight. Mark
      // those failed (otherwise the list shows a frozen spinner) and return to
      // the list so the failure is visible on the per-type rows.
      if (mountedRef.current) {
        setTransferStatus((prev) => {
          const next = { ...prev };
          for (const key of Object.keys(next)) {
            if (next[key].status === 'transferring') {
              next[key] = { ...next[key], error: err.message || 'Migration failed', status: 'failed' };
            }
          }
          return next;
        });
        setPage('select');
      }
    } finally {
      if (mountedRef.current) setIsTransferring(false);
    }
  }, [
    beastModeItems,
    cardBeastModeResolutions,
    datasetId,
    datasetName,
    hasMismatches,
    onBackToDefault,
    pdpMap,
    plannedBeastModeChoices,
    plannedDroppedColumns,
    plannedRenameMap,
    scanResult,
    selectedDatasetId,
    selectedDatasetName,
    selectedItemsByType,
    showStatus,
    tabId,
    targetBeastModes,
    targetColumns
  ]);

  if (isLoading || nothingToMigrate || holdContent) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading...</p>
        </Card.Content>
      </Card>
    );
  }

  // Select all / clear for the whole downstream tree. Select all reuses the same
  // "everything" set as the initial pre-select; clearing to empty is safe because
  // no Beast Mode stays locked once nothing that requires it is selected.
  const selectAllControl = {
    ariaLabel: 'Select all downstream content',
    count: totalSelected,
    isDisabled: !isFullyLoaded || jupyterStatus === 'loading' || isTransferring,
    onToggle: (checked) => setSelectedIds(checked ? buildFullSelection(results) : new Set()),
    total: totalAvailable
  };

  // Domo can't be asked which workspaces read a dataset, so the only way to find
  // them is to list every workspace in the instance and match here. Too heavy to
  // run on open, so it's offered instead.
  const jupyterPrompt = !jupyterCheckStarted ? (
    <Alert className='w-full' status='accent' variant='transparent'>
      <Alert.Content>
        <Alert.Title className='flex items-center gap-1'>
          <Alert.Indicator>
            <IconInfoCircle data-slot='alert-default-icon' />
          </Alert.Indicator>
          Jupyter Workspaces Aren't Searched Automatically
        </Alert.Title>
        <Alert.Description>
          Finding them means reading every Jupyter Workspace in the instance, so it only runs when you ask.
        </Alert.Description>
        <Button fullWidth className='mt-2' size='sm' variant='secondary' onPress={() => setJupyterCheckStarted(true)}>
          <IconSync />
          Check Jupyter Workspaces
        </Button>
      </Alert.Content>
    </Alert>
  ) : null;

  // Page 1: choose what downstream content to migrate. The type groups live in
  // the DataList; the only footer action is Next, which advances to page 2.
  if (page === 'select') {
    return (
      <DataList
        beta
        banner={jupyterPrompt}
        currentContext={currentContext}
        feature='Migrate Content of'
        featureIcon={<IconSwapHorizontal />}
        fillHeight={true}
        getItemLock={getItemLock}
        headerActions={['reload', 'refresh']}
        isRefreshing={loadingCount > 0 || jupyterStatus === 'loading'}
        isSelectable={isSelectable}
        itemActions={['copy']}
        itemLabel='item'
        items={dataListItems}
        objectId={datasetId}
        objectType='DATA_SOURCE'
        selectAll={selectAllControl}
        selectedIds={selectedIds}
        selectionMode={true}
        showActions={true}
        showCounts={true}
        subject={datasetName}
        subtext={subtextNode}
        viewType='migrateDownstreamContent'
        onClose={onBackToDefault}
        onRefresh={() => {
          refreshFetches();
          if (jupyterCheckStarted) runJupyterCheck();
        }}
        onSelectionChange={handleSelectionChange}
        onStatusUpdate={onStatusUpdate}
        footer={
          <Button
            fullWidth
            isDisabled={!isFullyLoaded || jupyterStatus === 'loading' || isTransferring || totalSelected === 0}
            size='sm'
            variant='primary'
            onPress={() => setPage('target')}
          >
            Next
            <IconArrowRight />
          </Button>
        }
      />
    );
  }

  // Page 2: pick the target dataset, reconcile schema (warn + remap), migrate.
  // Live transfer progress rides on the footer's Migrate button (always visible,
  // unlike the old inline row that rendered below the remap UI, off-screen).
  // Aggregate over types, since the per-type rows live on page 1.
  const migratedDone = Object.values(transferStatus).filter(
    (x) => x.status === 'transferred' || x.status === 'failed'
  ).length;
  const migratedTotal = Object.values(transferStatus).length;

  const isRefreshingTarget = targetFetchesPending;
  const refreshDisabledReason = !selectedDatasetId
    ? 'Choose a To DataSet to refresh'
    : isTransferring
      ? 'Migration in progress'
      : null;
  const headerActions = [
    {
      ...buildRefreshAction({ isRefreshing: isRefreshingTarget, onRefresh: handleRefreshTarget }),
      disabledReason: refreshDisabledReason
    }
  ];

  return (
    <>
      <Card className='flex min-h-0 w-full flex-1 flex-col gap-0 p-2'>
        <ViewHeader
          beta
          actions={headerActions}
          feature='Migrate Content of'
          featureIcon={<IconSwapHorizontal />}
          subject={datasetName}
          subjectTypeId='DATA_SOURCE'
          onClose={onBackToDefault}
        />
        <Separator className='mt-1.5' />
        <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
          <Card.Content className='flex flex-col gap-2 py-2'>
            <DatasetComboBox
              className='min-w-0'
              excludeIds={excludeIds}
              instanceBaseUrl={origin}
              label='To DataSet'
              maxListHeight={480}
              selectedDisplayName={selectedDatasetName}
              selectedKey={selectedDatasetId}
              tabId={tabId}
              onSelectionChange={(key, name) => {
                setSelectedDatasetId(key);
                setSelectedDatasetName(name ?? null);
              }}
            />

            {suggestedTarget && (
              <Alert className='w-full' status='accent' variant='transparent'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <Alert.Indicator>
                      <IconInfoCircle data-slot='alert-default-icon' />
                    </Alert.Indicator>
                    Use the DataSet You're Viewing?
                  </Alert.Title>
                  <Alert.Description className='break-all'>{suggestedTarget.name}</Alert.Description>
                  <div className='mt-2 flex w-full gap-2'>
                    <Button className='flex-1' size='sm' variant='primary' onPress={handleUseSuggestedTarget}>
                      <IconCheck />
                      Use as Target
                    </Button>
                    <Button className='flex-1' size='sm' variant='tertiary' onPress={handleDismissSuggestedTarget}>
                      <IconX />
                      Dismiss
                    </Button>
                  </div>
                </Alert.Content>
              </Alert>
            )}

            {isComparing && (
              <div className='flex items-center gap-2 text-xs text-muted'>
                <Spinner size='sm' />
                <span>Comparing schemas…</span>
              </div>
            )}

            {comparisonError && (
              <Alert className='w-full' status='danger' variant='transparent'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <Alert.Indicator>
                      <IconExclamationPointCircle data-slot='alert-default-icon' />
                    </Alert.Indicator>
                    Schema Check Failed
                  </Alert.Title>
                  <Alert.Description>{comparisonError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {comparison?.compatible && (
              <Alert className='w-full' status='success' variant='transparent'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <Alert.Indicator>
                      <IconCheckCircle data-slot='alert-default-icon' />
                    </Alert.Indicator>
                    Schemas Are Compatible
                  </Alert.Title>
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
              <Alert className='w-full' status='danger' variant='transparent'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <Alert.Indicator>
                      <IconExclamationPointCircle data-slot='alert-default-icon' />
                    </Alert.Indicator>
                    Column Scan Failed
                  </Alert.Title>
                  <Alert.Description>{scanError}</Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {hasMismatches &&
              !isScanning &&
              scanResult &&
              appColumnCollisions.length === 0 &&
              usedUnmappedColumns.length === 0 &&
              scriptDataflowWarnings.length === 0 &&
              sqlDataflowWarnings.length === 0 &&
              viewFusionWarnings.length === 0 && (
                <Alert className='w-full' status='default' variant='transparent'>
                  <AlertStatusIcon />
                  <Alert.Content>
                    <Alert.Description>
                      None of the mismatched columns are referenced by the selected content. Safe to proceed without
                      remapping, but data may still be missing in the target.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

            <DisclosureGroup
              allowsMultipleExpanded
              className='flex w-full flex-col divide-y divide-border'
              expandedKeys={expandedSections}
              onExpandedChange={setExpandedSections}
            >
              <ReconciliationWarnings
                appColumnCollisions={appColumnCollisions}
                hasMismatches={hasMismatches}
                isScanning={isScanning}
                jupyterColumnWarnings={jupyterColumnWarnings}
                mergeableDataflows={mergeableDataflows}
                originName={datasetName}
                scanResult={scanResult}
                scriptDataflowWarnings={scriptDataflowWarnings}
                sqlDataflowWarnings={sqlDataflowWarnings}
                targetLabel={selectedDatasetName || selectedDatasetId}
                unrepointableDataflows={unrepointableDataflows}
                unrepointableDatasets={unrepointableDatasets}
                usedUnmappedColumns={usedUnmappedColumns}
                viewFusionWarnings={viewFusionWarnings}
              />

              {hasMismatches && !isScanning && scanResult && (
                <ColumnRemapSection
                  autoMapStatus={autoMapStatus}
                  cardOnlyColumnNames={cardOnlyColumnNames}
                  cardsById={cardsById}
                  columnMap={columnMap}
                  dataflowCollisions={scanResult?.dataflowCollisions}
                  droppableColumnNames={droppableColumnNames}
                  origin={origin}
                  rows={usedUnmappedColumns}
                  status={columnRemapStatus}
                  targetBeastModes={targetBeastModes}
                  targetColumns={targetColumns}
                  totalSelected={totalSelected}
                  onAutoMap={handleAutoMapClick}
                  onColumnChoice={handleColumnChoice}
                />
              )}

              <BeastModeConflictsSection
                choices={beastModeChoices}
                conflicts={beastModeConflicts}
                depthBlockedByDependency={depthBlockedByDependency}
                depthBlockedMessage={depthBlockedMessage}
                status={beastModeStatus}
                targetNames={targetBeastModeNames}
                onApplyAll={handleAllBeastModeChoices}
                onChoice={handleBeastModeChoice}
              />

              <CardBeastModeConflictsSection
                choices={cardBeastModeChoices}
                conflicts={cardBeastModeConflicts}
                status={cardBeastModeStatus}
                targetNames={targetBeastModeNames}
                onApplyAll={handleAllCardBeastModeChoices}
                onChoice={handleCardBeastModeChoice}
              />

              <PdpMappingSection
                choices={pdpChoices}
                isLoaded={pdpLoaded}
                references={unmatchedPdpReferences}
                status={pdpStatus}
                targetPolicies={targetPdpPolicies || []}
                onChoice={handlePdpChoice}
              />
            </DisclosureGroup>
          </Card.Content>
        </ScrollShadow>
        <Separator className='mt-1.5' />
        {!isTransferring && selectedDatasetId && (blockedDecisionCount > 0 || defaultedDecisionCount > 0) && (
          <p className='shrink-0 pt-1.5 text-xs text-muted'>
            {blockedDecisionCount > 0 ? (
              <span className='text-warning'>
                {blockedDecisionCount} {blockedDecisionCount === 1 ? 'decision' : 'decisions'} to resolve before migrating
              </span>
            ) : (
              <>
                {defaultedDecisionCount} {defaultedDecisionCount === 1 ? 'choice' : 'choices'} left unmade, so{' '}
                {defaultedDecisionCount === 1 ? 'its default' : 'their defaults'} will apply
              </>
            )}
          </p>
        )}
        <div className='flex shrink-0 gap-2 pt-2'>
          <Button isDisabled={isTransferring} size='sm' variant='tertiary' onPress={() => setPage('select')}>
            <IconArrowLeft />
            Back
          </Button>
          <Button
            fullWidth
            isDisabled={migrateDisabled}
            isPending={isTransferring}
            size='sm'
            variant='primary'
            onPress={() => setConfirmOpen(true)}
          >
            {isTransferring ? (
              <>
                <Spinner color='currentColor' size='sm' />
                Migrating… {migratedDone}/{migratedTotal} {migratedTotal === 1 ? 'Type' : 'Types'}
              </>
            ) : (
              <>
                <IconSwapHorizontal />
                {migrateLabel}
              </>
            )}
          </Button>
        </div>
      </Card>
      <AlertDialog
        isOpen={confirmOpen && isActive}
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
                  Migrate Content
                </AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body className='flex flex-col gap-2 text-sm'>
                <p>
                  This migrates{' '}
                  {selectionParts.map((p, i) => (
                    <Fragment key={p.key}>
                      {i === 0
                        ? ''
                        : i === selectionParts.length - 1
                          ? selectionParts.length > 2
                            ? ', and '
                            : ' and '
                          : ', '}
                      <span className='font-medium'>{p.n}</span> {p.noun}
                    </Fragment>
                  ))}{' '}
                  from <span className='font-medium'>{datasetName}</span> to{' '}
                  <span className='font-medium'>{selectedDatasetName || selectedDatasetId}</span>.
                </p>
                {unrepointableDataflows.length + unrepointableDatasets.length > 0 && (
                  <p className='text-warning'>
                    <span className='font-medium'>{unrepointableDataflows.length + unrepointableDatasets.length}</span>{' '}
                    {unrepointableDataflows.length + unrepointableDatasets.length === 1 ? 'item' : 'items'} will be skipped
                    because they already read {selectedDatasetName || selectedDatasetId}.
                  </p>
                )}
                {defaultedDecisionParts.length > 0 && (
                  <p className='text-warning'>
                    You left some choices unmade, so{' '}
                    {defaultedDecisionParts.map((part, i) => (
                      <Fragment key={part}>
                        {i === 0
                          ? ''
                          : i === defaultedDecisionParts.length - 1
                            ? defaultedDecisionParts.length > 2
                              ? ', and '
                              : ' and '
                            : ', '}
                        <span className='font-medium'>{part}</span>
                      </Fragment>
                    ))}
                    .
                  </p>
                )}
                {hasMismatches && (
                  <p className='text-warning'>
                    The schemas don't fully match
                    {hasEffectiveMapping(columnMap) ? ', so your column remap will be applied' : ''}. Unmapped or incorrectly
                    mapped column references can cause cards to render blank, dataflows to fail, and views to error. Validate
                    every result.
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
        isOpen={autoMapConfirmOpen && isActive}
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
                  Auto Map replaces every column's mapping with its closest match and leaves columns it can't match unmapped.
                  Mappings you've set manually will be overwritten.
                </p>
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button
                  size='sm'
                  variant='primary'
                  onPress={() => {
                    runAutoMapWithFeedback();
                    setAutoMapConfirmOpen(false);
                  }}
                >
                  <IconWand />
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

// Cards group builder: nests each drill card under its parent card so the
// hierarchy is visible, instead of listing drills as flat siblings. Parent
// cards with no drills stay plain leaves. Any drill whose parent isn't in the
// list (shouldn't happen) falls back to a top-level row so none are dropped.
function buildCardItems(items, origin) {
  const makeItem = (item, children) =>
    new DataListItem({
      children,
      id: leafSelectionId('cards', item.id),
      label: item.name || String(item.id),
      originalId: item.id,
      // Drills carry the DRILL_VIEW type (drill icon) and link to the drill in
      // the analyzer; parent and standalone cards keep the card type and URL.
      typeId: item.isDrill ? 'DRILL_VIEW' : TYPE_KEY_TO_DOMO_TYPE.cards,
      url: item.isDrill ? buildDrillViewUrl(item, origin) : buildObjectUrl('cards', item, origin)
    });
  const drillsByParent = new Map();
  for (const item of items) {
    if (!item.isDrill || item.parentId == null) continue;
    const key = String(item.parentId);
    if (!drillsByParent.has(key)) drillsByParent.set(key, []);
    drillsByParent.get(key).push(item);
  }
  const claimed = new Set();
  const rows = [];
  for (const item of items) {
    if (item.isDrill) continue;
    const drills = drillsByParent.get(String(item.id));
    const children = drills?.length ? drills.map((d) => makeItem(d, undefined)) : undefined;
    if (children) claimed.add(String(item.id));
    rows.push(makeItem(item, children));
  }
  // Orphan drills (parent card absent from the list) become top-level rows.
  for (const [key, drills] of drillsByParent) {
    if (claimed.has(key)) continue;
    for (const d of drills) rows.push(makeItem(d, undefined));
  }
  return rows;
}

// Drill cards open in the analyzer alongside their parent card, so the URL needs
// the parent card id the drill carries. Built as a DRILL_VIEW object so the path
// stays defined by the type registry.
function buildDrillViewUrl(item, origin) {
  if (!origin || item.parentId == null) return null;
  try {
    return new DomoObject('DRILL_VIEW', item.id, origin, { name: item.name }, null, item.parentId).url;
  } catch {
    return null;
  }
}

// The "everything selected" set: every loaded type's parent key plus a leaf id
// for each of its items. Shared by the initial pre-select effect and the header
// Select all control so both mean exactly the same thing.
function buildFullSelection(results) {
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
  return next;
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

// Info-icon modal listing the dataflows whose other inputs collide on the
// origin column name, each linking to the dataflow. Mirrors ColumnUsagesModal,
// shown when the collision spans more than one dataflow (a single one links
// inline).
function countChip(count, suffix, color = 'warning') {
  return { color, label: `${count} ${suffix}` };
}

function countInvalidRenames(conflicts, choices, targetNames) {
  let count = 0;
  for (const bm of conflicts) {
    const choice = choices[bm.id];
    if (choice?.disposition !== 'rename') continue;
    const trimmed = (choice.newName || '').trim();
    if (trimmed === '' || targetNames.has(trimmed)) count++;
  }
  return count;
}

function formatErrors(result) {
  if (!result?.errors?.length) return null;
  const n = result.errors.length;
  return `${n} item${n === 1 ? '' : 's'} failed`;
}

function formatSkips(skipped) {
  if (!skipped?.length) return null;
  const n = skipped.length;
  return `${n} item${n === 1 ? '' : 's'} skipped`;
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

// Plural group label for a migrate type, taken from the object type model so the
// casing matches everywhere it's shown (e.g. "DataFlows", "DataSets"). None of
// these types pluralize irregularly, so a trailing "s" is enough.
function typeGroupLabel(typeKey) {
  // The pro-code app type's own name ("Custom App (Pro-Code)") doesn't pluralize
  // cleanly, so give the group its own readable plural.
  if (typeKey === 'apps') return 'Pro-Code Apps';
  const name = getObjectType(TYPE_KEY_TO_DOMO_TYPE[typeKey])?.name || typeKey;
  return `${name}s`;
}
