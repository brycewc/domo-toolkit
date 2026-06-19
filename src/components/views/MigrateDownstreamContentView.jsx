import {
  Alert,
  AlertDialog,
  Autocomplete,
  Button,
  Card,
  Chip,
  Description,
  EmptyState,
  Header,
  Input,
  Label,
  Link,
  ListBox,
  Modal,
  ScrollShadow,
  SearchField,
  Select,
  Separator,
  Spinner,
  TextField,
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
import { getObjectType } from '@/models/DomoObjectType';
import { scanContentForColumns } from '@/services/columnReferences';
import { hasEffectiveMapping } from '@/services/columnRewriter';
import { getDatasetColumns } from '@/services/datasets';
import { getBeastModeReferenceGraph, getCardBeastModes, getDatasetFunctions } from '@/services/functions';
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
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconExclamationPointCircle from '@icons/exclamation-point-circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconWand from '@icons/wand.svg?react';
import IconX from '@icons/x.svg?react';

const TYPE_KEY_TO_DOMO_TYPE = {
  beastModes: 'BEAST_MODE_FORMULA',
  cards: 'CARD',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE'
};

const UNMAPPED = '__unmapped__';
// Sentinel for the "drop column" remap choice: remove the column's references
// from the (badge_table) cards/drills that use it instead of mapping it.
const DROP = '__drop__';

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
    // datasets and dataflows both come from the same lineage call. Share one
    // in-flight Promise so the API isn't hit twice. Re-created with the specs
    // array so a refresh refetches.
    let lineagePromise = null;
    const lineage = () => {
      if (!lineagePromise) lineagePromise = getDownstreamLineage(datasetId, tabId);
      return lineagePromise;
    };
    return [
      {
        fetch: async () => ({ items: await getDatasetFunctions(datasetId, tabId) }),
        key: 'beastModes'
      },
      {
        fetch: async () => ({ items: await getDownstreamCards(datasetId, tabId) }),
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
    const counts = { beastModes: 0, cards: 0, dataflows: 0, datasets: 0 };
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

  const totalSelected =
    selectedCounts.beastModes + selectedCounts.cards + selectedCounts.datasets + selectedCounts.dataflows;

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
    const acc = { beastModes: [], cards: [], dataflows: [], datasets: [] };
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

  // Card ids each dataset Beast Mode is actively used by (from the search's
  // activeLinks), keyed by Beast Mode id. Drives the selection lock. Drill links
  // come back as `dr:<drillId>:<rootId>` URNs from the search but are normalized
  // to the bare drill card id in getDatasetFunctions, so they match the selection
  // set (which holds bare drill ids) exactly like parent card ids do.
  const beastModeCardLinks = useMemo(() => {
    const m = new Map();
    const r = results.beastModes;
    const items = r?.status === 'loaded' ? r.items?.items || [] : [];
    for (const bm of items) m.set(String(bm.id), bm.activeCardIds || []);
    return m;
  }, [results]);

  const selectedCardIdSet = useMemo(
    () => new Set(selectedItemsByType.cards.map((c) => String(c.id))),
    [selectedItemsByType]
  );

  // Build the nested-reference graph once the Beast Mode list settles. It's a
  // function of the loaded list only (not the selection), so it's fetched once
  // per dataset load and reused as the user toggles content. Keyed by numeric
  // Beast Mode id (the id a nested formula references via DOMO_BEAST_MODE(id)).
  useEffect(() => {
    const r = results.beastModes;
    const items = r?.status === 'loaded' ? r.items?.items || [] : [];
    if (items.length === 0) {
      setBmRefGraph(new Map());
      return;
    }
    let cancelled = false;
    getBeastModeReferenceGraph(items, tabId)
      .then((graph) => {
        if (!cancelled) setBmRefGraph(graph);
      })
      .catch(() => {
        if (!cancelled) setBmRefGraph(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [results, tabId]);

  // Every Beast Mode being migrated, expanded over its nested references: the
  // seed is each Beast Mode used by a selected card OR selected directly, then
  // forward-reachability follows `bm -> bms it nests` to its full dependency
  // closure. Cycle-safe via the visited set. In numeric-id space.
  const requiredBeastModeIds = useMemo(() => {
    const seeds = new Set();
    const r = results.beastModes;
    const items = r?.status === 'loaded' ? r.items?.items || [] : [];
    for (const bm of items) {
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
  }, [beastModeCardLinks, bmRefGraph, results, selectedCardIdSet, selectedItemsByType]);

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
    const r = results.beastModes;
    const items = r?.status === 'loaded' ? r.items?.items || [] : [];
    if (items.length === 0) return false;
    return items.every((bm) => {
      const fnId = bm.id != null ? String(bm.id) : null;
      if (!fnId) return false;
      const cardLocked = (beastModeCardLinks.get(fnId) || []).some((cardId) => selectedCardIdSet.has(String(cardId)));
      return cardLocked || lockedBeastModeIds.has(fnId);
    });
  }, [beastModeCardLinks, lockedBeastModeIds, results, selectedCardIdSet]);

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

  // Fetch the target's Beast Modes when a target is chosen so we can flag name
  // collisions with the selected origin Beast Modes (independent of schema
  // compatibility; a collision matters even when the columns line up).
  useEffect(() => {
    if (page !== 'target' || !selectedDatasetId) {
      setTargetBeastModes([]);
      return;
    }
    let cancelled = false;
    getDatasetFunctions(selectedDatasetId, tabId)
      .then((bms) => {
        if (!cancelled) setTargetBeastModes(bms || []);
      })
      .catch(() => {
        if (!cancelled) setTargetBeastModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [page, selectedDatasetId, tabId]);

  // Selected origin Beast Modes whose name already exists on the target. These
  // are the ones the user has to resolve (keep / overwrite / rename).
  const beastModeConflicts = useMemo(() => {
    const selected = selectedItemsByType.beastModes || [];
    if (selected.length === 0 || targetBeastModes.length === 0) return [];
    const targetNames = new Set(targetBeastModes.map((b) => b.name));
    return selected.filter((bm) => targetNames.has(bm.name)).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [selectedItemsByType, targetBeastModes]);

  const targetBeastModeNames = useMemo(() => new Set(targetBeastModes.map((b) => b.name)), [targetBeastModes]);

  // Default every conflict to "keep" (reuse the target's existing Beast Mode)
  // and drop choices for Beast Modes that are no longer in conflict.
  useEffect(() => {
    setBeastModeChoices((prev) => {
      const next = {};
      let changed = false;
      for (const bm of beastModeConflicts) {
        next[bm.id] = prev[bm.id] || { disposition: 'keep' };
        if (!prev[bm.id]) changed = true;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
      return next;
    });
  }, [beastModeConflicts]);

  const handleBeastModeChoice = useCallback((bmId, disposition, newName) => {
    setBeastModeChoices((prev) => ({
      ...prev,
      [bmId]: disposition === 'rename' ? { disposition, newName: newName ?? '' } : { disposition }
    }));
  }, []);

  // Fetch the origin's card-level Beast Modes when a target is chosen, so we can
  // flag any whose name collides with a target dataset Beast Mode.
  useEffect(() => {
    if (page !== 'target' || !selectedDatasetId || !datasetId) {
      setCardBeastModes([]);
      return;
    }
    let cancelled = false;
    getCardBeastModes(datasetId, tabId)
      .then((bms) => {
        if (!cancelled) setCardBeastModes(bms || []);
      })
      .catch(() => {
        if (!cancelled) setCardBeastModes([]);
      });
    return () => {
      cancelled = true;
    };
  }, [datasetId, page, selectedDatasetId, tabId]);

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

  // Default every card-level collision to "use the target's Beast Mode" and drop
  // choices for ones no longer in conflict.
  useEffect(() => {
    setCardBeastModeChoices((prev) => {
      const next = {};
      let changed = false;
      for (const bm of cardBeastModeConflicts) {
        next[bm.id] = prev[bm.id] || { disposition: 'useTarget' };
        if (!prev[bm.id]) changed = true;
      }
      if (!changed && Object.keys(prev).length === Object.keys(next).length) return prev;
      return next;
    });
  }, [cardBeastModeConflicts]);

  const handleCardBeastModeChoice = useCallback((bmId, disposition, newName) => {
    setCardBeastModeChoices((prev) => ({
      ...prev,
      [bmId]: disposition === 'rename' ? { disposition, newName: newName ?? '' } : { disposition }
    }));
  }, []);

  const targetBeastModeByName = useMemo(() => new Map(targetBeastModes.map((b) => [b.name, b])), [targetBeastModes]);

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

  const hasMismatches = comparison && !comparison.compatible;

  // SQL dataflows (Redshift/MySQL) whose SQL references origin in a shape we
  // can't auto-remap (origin SELECT *, an unsupported engine). These get an
  // honest "review manually" note instead of the old false "all clear".
  const sqlDataflowWarnings = scanResult?.dataflowSqlWarnings || [];
  // Fusion views whose origin columns appear inside computed expressions: the
  // simple refs are remapped automatically, but the computation may need a look.
  const viewFusionWarnings = scanResult?.viewFusionWarnings || [];

  // Columns that are BOTH used by selected content AND missing/changed in the
  // target schema. The intersection is what the user has to decide about;
  // anything outside it is either irrelevant or already compatible.
  const usedUnmappedColumns = useMemo(() => {
    if (!hasMismatches || !scanResult) return [];
    const missing = comparison?.missing || [];
    const mismatchedNames = new Set(missing.map((m) => m.name));
    // expectedType is the origin column's own type, surfaced so the user knows
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

  // Of the card-only columns, those whose using cards/drills are ALL badge_table,
  // the ones eligible for the "drop column" choice (removing the column from a
  // table is safe; other chart types aren't). Also used to filter the user's
  // drop choices at migrate time so a stale choice can't slip through.
  const droppableColumnNames = useMemo(() => {
    const names = new Set();
    for (const { items, name } of usedUnmappedColumns) {
      if (cardOnlyColumnNames.has(name) && items.every((it) => cardsById.get(String(it.id))?.chartType === 'badge_table')) {
        names.add(name);
      }
    }
    return names;
  }, [cardOnlyColumnNames, cardsById, usedUnmappedColumns]);

  const dataListItems = useMemo(
    () =>
      MIGRATE_TYPES.map((t) => {
        const result = results[t.key];
        const xfer = transferStatus[t.key];
        const status = xfer?.status ?? result?.status ?? 'loading';

        let count;
        let countLabel = null;
        let error = null;
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
          if (xfer.count !== undefined) count = xfer.count;
          // Transfer progress shows a plain count, not the "+ N drills" tally.
          countLabel = null;
        }

        return new DataListItem({
          children,
          count,
          countLabel,
          error,
          id: t.key,
          isVirtualParent: true,
          label: typeGroupLabel(t.key),
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

  // A rename choice with an empty or already-taken name can't be migrated.
  const beastModeChoiceInvalid = useMemo(() => {
    for (const bm of beastModeConflicts) {
      const c = beastModeChoices[bm.id];
      if (c?.disposition === 'rename') {
        const trimmed = (c.newName || '').trim();
        if (trimmed === '' || targetBeastModeNames.has(trimmed)) return true;
      }
    }
    return false;
  }, [beastModeConflicts, beastModeChoices, targetBeastModeNames]);

  // Same rename validity check for card-level Beast Mode collisions.
  const cardBeastModeChoiceInvalid = useMemo(() => {
    for (const bm of cardBeastModeConflicts) {
      const c = cardBeastModeChoices[bm.id];
      if (c?.disposition === 'rename') {
        const trimmed = (c.newName || '').trim();
        if (trimmed === '' || targetBeastModeNames.has(trimmed)) return true;
      }
    }
    return false;
  }, [cardBeastModeConflicts, cardBeastModeChoices, targetBeastModeNames]);

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
    cardBeastModeChoiceInvalid;

  // CTA wording reflects the schema state: a clean migrate, a migrate that
  // will apply the user's column remap, or an explicit proceed-despite-mismatch.
  const migrateLabel = useMemo(() => {
    if (!hasMismatches) return 'Migrate';
    return hasEffectiveMapping(columnMap) ? 'Migrate with Remap' : 'Proceed Anyway';
  }, [columnMap, hasMismatches]);

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
    const name = obj.metadata?.name || obj.metadata?.displayName || `Dataset ${id}`;
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
    const beastModeLegacyIds = new Set((targetBeastModes || []).map((b) => b.legacyId).filter(Boolean));
    const renameMap = {};
    const droppedColumns = [];
    for (const [name, choice] of Object.entries(columnMap)) {
      if (choice === DROP) {
        if (droppableColumnNames.has(name)) droppedColumns.push(name);
      } else if (choice != null) {
        if (beastModeLegacyIds.has(choice)) {
          if (cardOnlyColumnNames.has(name)) renameMap[name] = choice;
        } else {
          renameMap[name] = choice;
        }
      }
    }

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
        beastModeChoices,
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
        originName: datasetName,
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
      for (const [, r] of transferResults) {
        totalSucceeded += r.succeeded || 0;
        totalFailed += r.failed || 0;
        totalManualReview += r.manualReview?.length || 0;
      }

      // SQL dataflows whose input repointed but whose SQL we couldn't safely
      // rewrite (origin SELECT *, etc.) still need a hand edit; call it out.
      const reviewNote =
        totalManualReview > 0
          ? ` ${totalManualReview} SQL dataflow${totalManualReview !== 1 ? 's' : ''} flagged for manual review.`
          : '';

      const targetLabel = targetName ? `**${targetName}**` : `**${targetId}**`;
      if (totalFailed > 0) {
        showStatus(
          'Migration Partially Complete',
          `**${totalSucceeded}** succeeded, **${totalFailed}** failed migrating to ${targetLabel}.${reviewNote}`,
          'warning',
          7000
        );
        // Some items failed: drop back to the list, where each per-type row
        // shows its own failure message, instead of closing.
        if (mountedRef.current) setPage('select');
      } else if (totalManualReview > 0) {
        showStatus(
          'Migration Complete',
          `Migrated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''} to ${targetLabel}.${reviewNote}`,
          'warning',
          9000
        );
        // Inputs repointed cleanly, but some SQL needs a hand edit. The toast
        // persists past unmount, so closing is fine.
        onBackToDefault?.();
      } else {
        showStatus(
          'Migration Complete',
          `Migrated **${totalSucceeded}** item${totalSucceeded !== 1 ? 's' : ''} to ${targetLabel}`,
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
    beastModeChoices,
    cardBeastModeResolutions,
    cardOnlyColumnNames,
    columnMap,
    datasetId,
    datasetName,
    droppableColumnNames,
    hasMismatches,
    onBackToDefault,
    scanResult,
    selectedDatasetId,
    selectedDatasetName,
    selectedItemsByType,
    showStatus,
    tabId,
    targetBeastModes,
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

  // Shown in the subheader of both pages. This migration flow is new and may
  // not handle every case yet, so it's flagged Beta to set expectations.
  const betaChip = (
    <Chip className='shrink-0' color='accent' size='sm' variant='soft'>
      Beta
    </Chip>
  );

  // Page 1: choose what downstream content to migrate. The type groups live in
  // the DataList; the only footer action is Next, which advances to page 2.
  if (page === 'select') {
    return (
      <DataList
        beta
        currentContext={currentContext}
        feature='Migrate Content of'
        featureIcon={<IconArrowsHorizontalBox />}
        fillHeight={true}
        getItemLock={getItemLock}
        headerActions={['reload', 'refresh']}
        isRefreshing={loadingCount > 0}
        isSelectable={isSelectable}
        itemActions={['copy']}
        itemLabel='item'
        items={dataListItems}
        objectId={datasetId}
        objectType='DATA_SOURCE'
        selectedIds={selectedIds}
        selectionMode={true}
        showActions={true}
        showCounts={true}
        subject={datasetName}
        subtext={subtextNode}
        viewType='migrateDownstreamContent'
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
  // Live transfer progress rides on the footer's Migrate button (always visible,
  // unlike the old inline row that rendered below the remap UI, off-screen).
  // Aggregate over types, since the per-type rows live on page 1.
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
          <div className='flex'>{betaChip}</div>
          <Tooltip>
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
            <Tooltip.Content className='max-w-60 text-wrap'>Close</Tooltip.Content>
          </Tooltip>
        </Card.Header>
        <Separator />
        <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
          <Card.Content className='flex flex-col gap-2 py-2'>
            <DatasetComboBox
              className='min-w-0'
              excludeIds={excludeIds}
              instanceBaseUrl={origin}
              label='To DataSet'
              maxListHeight='max-h-120'
              selectedDisplayName={selectedDatasetName}
              selectedKey={selectedDatasetId}
              tabId={tabId}
              onSelectionChange={(key, name) => {
                setSelectedDatasetId(key);
                setSelectedDatasetName(name ?? null);
              }}
            />

            {suggestedTarget && (
              <Alert className='w-full border border-border bg-transparent' status='accent'>
                <Alert.Indicator>
                  <IconInfoCircle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>Use the dataset you're viewing?</Alert.Title>
                  <Alert.Description className='break-all'>{suggestedTarget.name}</Alert.Description>
                  <div className='mt-2 flex gap-2'>
                    <Button size='sm' variant='primary' onPress={handleUseSuggestedTarget}>
                      Use as target
                    </Button>
                    <Button size='sm' variant='ghost' onPress={handleDismissSuggestedTarget}>
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

            {hasMismatches && !isScanning && scanResult && usedUnmappedColumns.length > 0 && (
              <Alert className='w-full border border-border bg-transparent' status='warning'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {usedUnmappedColumns.length === 1
                      ? "1 used column doesn't match"
                      : `${usedUnmappedColumns.length} used columns don't match`}
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
                  <Tooltip>
                    <Button
                      isPending={autoMapStatus === 'mapping'}
                      size='sm'
                      variant='secondary'
                      onPress={handleAutoMapClick}
                    >
                      {autoMapStatus === 'mapping' ? (
                        <Spinner color='currentColor' size='sm' />
                      ) : autoMapStatus === 'done' ? (
                        <IconCheck className='text-success' />
                      ) : (
                        <IconWand />
                      )}
                      {autoMapStatus === 'mapping' ? 'Mapping…' : autoMapStatus === 'done' ? 'Mapped' : 'Auto Map'}
                    </Button>
                    <Tooltip.Content className='max-w-80 text-wrap'>
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
                      canDrop={droppableColumnNames.has(name)}
                      canMapBeastMode={cardOnlyColumnNames.has(name)}
                      cardsById={cardsById}
                      collisions={scanResult?.dataflowCollisions?.get?.(name) || null}
                      items={items}
                      key={name}
                      mappedTo={columnMap[name] ?? UNMAPPED}
                      origin={origin}
                      originName={name}
                      originType={type}
                      targetBeastModes={targetBeastModes}
                      targetColumns={targetColumns}
                      totalSelected={totalSelected}
                      onChange={(choice) => handleColumnChoice(name, choice)}
                    />
                  ))}
                </div>
              </div>
            )}

            {hasMismatches && !isScanning && scanResult && sqlDataflowWarnings.length > 0 && (
              <Alert className='w-full border border-border bg-transparent' status='warning'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {sqlDataflowWarnings.length === 1
                      ? '1 SQL dataflow needs manual review'
                      : `${sqlDataflowWarnings.length} SQL dataflows need manual review`}
                  </Alert.Title>
                  <Alert.Description>
                    {sqlDataflowWarnings.map((w) => w.name).join(', ')} reference this dataset in SQL that can't be remapped
                    automatically. The input is repointed on migrate, but you'll need to update the SQL by hand.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {hasMismatches && !isScanning && scanResult && viewFusionWarnings.length > 0 && (
              <Alert className='w-full border border-border bg-transparent' status='warning'>
                <Alert.Indicator>
                  <IconExclamationTriangle data-slot='alert-default-icon' />
                </Alert.Indicator>
                <Alert.Content>
                  <Alert.Title>
                    {viewFusionWarnings.length === 1
                      ? '1 fused view needs manual review'
                      : `${viewFusionWarnings.length} fused views need manual review`}
                  </Alert.Title>
                  <Alert.Description>
                    {viewFusionWarnings.map((w) => w.name).join(', ')} use this dataset's columns inside calculated columns.
                    Those column references are remapped automatically, but double-check the calculations after migrating.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}

            {hasMismatches &&
              !isScanning &&
              scanResult &&
              usedUnmappedColumns.length === 0 &&
              sqlDataflowWarnings.length === 0 &&
              viewFusionWarnings.length === 0 && (
                <Alert className='w-full border border-border bg-transparent' status='default'>
                  <Alert.Indicator>
                    <IconInfoCircle data-slot='alert-default-icon' />
                  </Alert.Indicator>
                  <Alert.Content>
                    <Alert.Description>
                      None of the mismatched columns are referenced by the selected content. Safe to proceed without
                      remapping, but data may still be missing in the target.
                    </Alert.Description>
                  </Alert.Content>
                </Alert>
              )}

            {beastModeConflicts.length > 0 && (
              <div className='flex flex-col gap-1'>
                <Label className='text-sm font-medium'>Beast Mode Conflicts</Label>
                <Description className='text-xs'>
                  The target already has a Beast Mode with each of these names. Keep the target's, overwrite it with the
                  incoming one, or rename the incoming so both exist. Cards that use it are repointed either way.
                </Description>
                <div className='flex flex-col divide-y divide-border'>
                  {beastModeConflicts.map((bm) => (
                    <BeastModeConflictRow
                      choice={beastModeChoices[bm.id]}
                      key={bm.id}
                      originName={bm.name}
                      targetNames={targetBeastModeNames}
                      onChange={(disposition, newName) => handleBeastModeChoice(bm.id, disposition, newName)}
                    />
                  ))}
                </div>
              </div>
            )}

            {cardBeastModeConflicts.length > 0 && (
              <div className='flex flex-col gap-1'>
                <Label className='text-sm font-medium'>Card Beast Mode Conflicts</Label>
                <Description className='text-xs'>
                  A selected card has a Beast Mode whose name already exists as a Beast Mode on the target dataset, which
                  Domo won't allow. Use the target's Beast Mode instead, or rename the card's so both can exist.
                </Description>
                <div className='flex flex-col divide-y divide-border'>
                  {cardBeastModeConflicts.map((bm) => (
                    <CardBeastModeConflictRow
                      choice={cardBeastModeChoices[bm.id]}
                      key={bm.id}
                      originName={bm.name}
                      targetNames={targetBeastModeNames}
                      onChange={(disposition, newName) => handleCardBeastModeChoice(bm.id, disposition, newName)}
                    />
                  ))}
                </div>
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
            isPending={isTransferring}
            size='sm'
            variant='primary'
            onPress={() => setConfirmOpen(true)}
          >
            {isTransferring ? (
              <>
                <Spinner color='currentColor' size='sm' />
                Migrating… {migratedDone}/{migratedTotal}
              </>
            ) : (
              <>
                <IconArrowsHorizontalBox />
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

// One row of the Beast Mode conflict resolver: the origin Beast Mode's name
// plus a keep / overwrite / rename choice, with an inline name field (and
// validation) when renaming.
function BeastModeConflictRow({ choice, onChange, originName, targetNames }) {
  const disposition = choice?.disposition || 'keep';
  const newName = choice?.newName ?? '';
  const trimmed = newName.trim();
  const renameEmpty = disposition === 'rename' && trimmed === '';
  const renameCollides = disposition === 'rename' && trimmed !== '' && targetNames.has(trimmed);
  return (
    <div className='flex flex-col gap-1 py-1.5'>
      <div className='flex items-center gap-2'>
        <span className='min-w-0 flex-1 truncate font-mono text-xs' title={originName}>
          {originName}
        </span>
        <Select
          aria-label={`Resolve ${originName}`}
          className='w-36'
          value={disposition}
          variant='secondary'
          onChange={(value) => onChange(value, newName)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='keep'>
                Keep existing
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='overwrite'>
                Overwrite
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='rename'>
                Rename new
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      {disposition === 'rename' && (
        <TextField aria-label={`New name for ${originName}`} className='w-full' variant='secondary'>
          <Input
            className='h-8 font-mono text-xs'
            placeholder='New Beast Mode name…'
            value={newName}
            onChange={(e) => onChange('rename', e.target.value)}
          />
        </TextField>
      )}
      {renameEmpty && <p className='text-xs text-warning'>Enter a name for the new Beast Mode.</p>}
      {renameCollides && <p className='text-xs text-warning'>That name also exists on the target.</p>}
    </div>
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

// Groups card-type column usages so drills nest under their parent card. Uses
// the full card map to resolve each drill's parent and to name a parent that
// only appears because a drill under it uses the column (`usesColumn: false`).
// `orphanDrills` holds drills with no known parent (shouldn't happen) so none
// are dropped.
function buildCardUsageGroups(cardItems, cardsById) {
  const groups = new Map();
  for (const it of cardItems) {
    if (cardsById?.get(String(it.id))?.isDrill) continue;
    groups.set(String(it.id), { drills: [], id: it.id, name: it.name, usesColumn: true });
  }
  const orphanDrills = [];
  for (const it of cardItems) {
    const meta = cardsById?.get(String(it.id));
    if (!meta?.isDrill) continue;
    if (meta.parentId == null) {
      orphanDrills.push(it);
      continue;
    }
    const key = String(meta.parentId);
    if (!groups.has(key)) {
      // Prefer a parent that's in the list; otherwise use the name the drill
      // carries (the parent isn't migrating, so it isn't in cardsById).
      const parent = cardsById?.get(key);
      groups.set(key, {
        drills: [],
        id: meta.parentId,
        name: parent?.name || meta.parentName || `Card ${meta.parentId}`,
        usesColumn: false
      });
    }
    groups.get(key).drills.push(it);
  }
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  return {
    groups: [...groups.values()].map((g) => ({ ...g, drills: [...g.drills].sort(byName) })).sort(byName),
    orphanDrills: orphanDrills.sort(byName)
  };
}

// Builds the DataList tree for the column-usages modal: a virtual-parent group
// per content type, with card-type usages nested (drills under their parent
// card). A card present only because a drill under it uses the column carries an
// asterisk marker (and stays a non-link); `hasIndirectCards` flags whether any
// exist so the modal can show the matching legend. Also returns the ids to
// expand by default so the modal shows every usage at once.
function buildColumnUsageTree(items, cardsById, origin) {
  const expandedIds = [];
  let hasIndirectCards = false;
  const drillItem = (d, parentId) =>
    new DataListItem({
      id: `cards:${d.id}`,
      label: d.name,
      originalId: d.id,
      typeId: 'DRILL_VIEW',
      url: buildDrillViewUrl({ id: d.id, name: d.name, parentId }, origin)
    });
  const treeItems = MIGRATE_TYPES.map((t) => {
    const typeItems = items.filter((it) => it.type === t.key);
    if (typeItems.length === 0) return null;
    let children;
    let count = typeItems.length;
    let countLabel = null;
    if (t.key === 'cards') {
      const { groups, orphanDrills } = buildCardUsageGroups(typeItems, cardsById);
      // Call out drills separately in the group count, matching the main list:
      // "{parent-card usages} + {drill usages} drills".
      const drillUsages = typeItems.filter((it) => cardsById?.get(String(it.id))?.isDrill).length;
      count = typeItems.length - drillUsages;
      if (drillUsages > 0) countLabel = `+ ${drillUsages} drill${drillUsages === 1 ? '' : 's'}`;
      children = groups.map((g) => {
        const drills = g.drills.map((d) => drillItem(d, g.id));
        if (drills.length > 0) expandedIds.push(`cards:${g.id}`);
        // A card that doesn't itself reference the column (it's here only
        // because a drill under it does) gets the asterisk marker and stays a
        // non-link, so it reads as a container rather than a direct match.
        if (!g.usesColumn) hasIndirectCards = true;
        return new DataListItem({
          annotation: g.usesColumn ? null : "This card doesn't use the column directly; one of its drill views does.",
          children: drills.length > 0 ? drills : undefined,
          id: `cards:${g.id}`,
          label: g.name,
          muted: !g.usesColumn,
          originalId: g.id,
          typeId: TYPE_KEY_TO_DOMO_TYPE.cards,
          url: g.usesColumn ? buildObjectUrl('cards', { id: g.id, name: g.name }, origin) : null
        });
      });
      for (const d of orphanDrills) children.push(drillItem(d, cardsById?.get(String(d.id))?.parentId));
    } else {
      children = typeItems.map(
        (it) =>
          new DataListItem({
            id: `${t.key}:${it.id}`,
            label: it.name,
            originalId: it.id,
            typeId: TYPE_KEY_TO_DOMO_TYPE[t.key],
            url: buildObjectUrl(t.key, it, origin)
          })
      );
    }
    expandedIds.push(t.key);
    return new DataListItem({
      children,
      count,
      countLabel,
      id: t.key,
      isVirtualParent: true,
      label: typeGroupLabel(t.key),
      typeId: TYPE_KEY_TO_DOMO_TYPE[t.key]
    });
  }).filter(Boolean);
  return { expandedIds, hasIndirectCards, items: treeItems };
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

// One row of the card-level Beast Mode collision resolver: a card's Beast Mode
// whose name clashes with a target dataset Beast Mode. The user either uses the
// target's Beast Mode (references repointed, card copy dropped) or renames the
// card's copy so both can coexist.
function CardBeastModeConflictRow({ choice, onChange, originName, targetNames }) {
  const disposition = choice?.disposition || 'useTarget';
  const newName = choice?.newName ?? '';
  const trimmed = newName.trim();
  const renameEmpty = disposition === 'rename' && trimmed === '';
  const renameCollides = disposition === 'rename' && trimmed !== '' && targetNames.has(trimmed);
  return (
    <div className='flex flex-col gap-1 py-1.5'>
      <div className='flex items-center gap-2'>
        <span className='min-w-0 flex-1 truncate font-mono text-xs' title={originName}>
          {originName}
        </span>
        <Select
          aria-label={`Resolve card Beast Mode ${originName}`}
          className='w-36'
          value={disposition}
          variant='secondary'
          onChange={(value) => onChange(value, newName)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox>
              <ListBox.Item id='useTarget'>
                Use target's
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
              <ListBox.Item id='rename'>
                Rename card's
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      {disposition === 'rename' && (
        <TextField aria-label={`New name for ${originName}`} className='w-full' variant='secondary'>
          <Input
            className='h-8 font-mono text-xs'
            placeholder='New Beast Mode name…'
            value={newName}
            onChange={(e) => onChange('rename', e.target.value)}
          />
        </TextField>
      )}
      {renameEmpty && <p className='text-xs text-warning'>Enter a name for the card's Beast Mode.</p>}
      {renameCollides && <p className='text-xs text-warning'>That name also exists on the target.</p>}
    </div>
  );
}

function ColumnMapRow({
  canDrop = false,
  canMapBeastMode = false,
  cardsById,
  collisions,
  items,
  mappedTo,
  onChange,
  origin,
  originName,
  originType,
  targetBeastModes,
  targetColumns,
  totalSelected
}) {
  // Case-insensitive "contains" match for the Autocomplete's local filter, so
  // the user can type to narrow a long target-column list.
  const { contains } = useFilter({ sensitivity: 'base' });

  // Target Beast Modes offered as mapping targets: only those with a legacyId
  // (the id a card references them by; without it we couldn't rewrite the ref).
  // Shown only for card-only columns. Sorted by name to match the column list.
  const mappableBeastModes = useMemo(() => {
    if (!canMapBeastMode) return [];
    return (targetBeastModes || [])
      .filter((b) => b?.legacyId)
      .slice()
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }, [canMapBeastMode, targetBeastModes]);

  // When the current choice is a Beast Mode (its legacyId), resolve it for the
  // trigger so it shows the Beast Mode's name rather than the raw id.
  const selectedBeastMode = useMemo(
    () => mappableBeastModes.find((b) => b.legacyId === mappedTo) || null,
    [mappableBeastModes, mappedTo]
  );

  // The target columns and Beast Modes as ListBox items, built once so they can
  // render either flat (no Beast Modes to offer) or split into labeled sections
  // (when Beast Modes are available). The "Columns" header is only shown
  // alongside the "Beast Modes" header; on its own it adds no information and
  // would just hint at options that aren't there.
  const columnItems = targetColumns.map((col) => (
    <ListBox.Item id={col.name} key={col.name} textValue={col.name}>
      <div className='flex min-w-0 flex-col'>
        <span className='truncate font-mono text-xs' title={col.name}>
          {col.name}
        </span>
        <span className='text-[10px] text-muted'>{col.type || 'STRING'}</span>
      </div>
      <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
    </ListBox.Item>
  ));
  const beastModeItems = mappableBeastModes.map((bm) => (
    <ListBox.Item id={bm.legacyId} key={bm.legacyId} textValue={bm.name}>
      <span className='flex min-w-0 items-center gap-1'>
        <ObjectTypeIcon className='size-3.5 shrink-0' typeId='BEAST_MODE_FORMULA' />
        <div className='flex min-w-0 flex-col'>
          <span className='truncate text-xs' title={bm.name}>
            {bm.name}
          </span>
          <span className='text-[10px] text-muted'>{bm.dataType || 'STRING'}</span>
        </div>
      </span>
      <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
    </ListBox.Item>
  ));

  // Aggregate collisions by dataflow. Many other-inputs may share the same
  // column name; the user mostly cares which dataflows are affected.
  const collisionByDataflow = useMemo(() => {
    if (!collisions || collisions.length === 0) return [];
    const m = new Map();
    for (const c of collisions) {
      if (!m.has(c.dataflowId)) {
        m.set(c.dataflowId, { dataflowName: c.dataflowName, otherInputs: new Map() });
      }
      // Dedup each dataflow's other inputs by dataset id (the same input can
      // surface for several colliding columns), keeping the input's name so it
      // can render as a link to the dataset.
      m.get(c.dataflowId).otherInputs.set(c.otherInputId, c.otherInputName);
    }
    return [...m.entries()].map(([id, v]) => ({
      dataflowId: id,
      dataflowName: v.dataflowName,
      otherInputs: [...v.otherInputs].map(([inputId, name]) => ({ id: inputId, name }))
    }));
  }, [collisions]);

  const singleCollision = collisionByDataflow.length === 1 ? collisionByDataflow[0] : null;
  const singleCollisionUrl = singleCollision
    ? buildObjectUrl('dataflows', { id: singleCollision.dataflowId, name: singleCollision.dataflowName }, origin)
    : null;

  // After a target is picked, flag when its data type differs from the origin
  // column's. A silent type change can break a dataflow (e.g. an integer column
  // dropped into a UNION of text values), so surface it on the row.
  const selectedTargetType = mappedTo && mappedTo !== UNMAPPED ? targetColumns.find((c) => c.name === mappedTo)?.type : null;
  const typeMismatch = Boolean(originType && selectedTargetType && originType !== selectedTargetType);

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
              {singleCollision ? (
                <>
                  another input of{' '}
                  <span className='inline-flex items-center gap-0.5 align-text-bottom'>
                    <ObjectTypeIcon className='size-3.5 shrink-0' typeId='DATAFLOW_TYPE' />
                    {singleCollisionUrl ? (
                      <Link
                        className='text-current no-underline decoration-accent hover:text-accent hover:underline'
                        href={singleCollisionUrl}
                        target='_blank'
                        title={singleCollision.dataflowName}
                      >
                        {singleCollision.dataflowName}
                      </Link>
                    ) : (
                      singleCollision.dataflowName
                    )}
                  </span>
                </>
              ) : (
                <>
                  other inputs of {collisionByDataflow.length} dataflows{' '}
                  <span className='inline-flex align-text-bottom'>
                    <DataflowCollisionModal dataflows={collisionByDataflow} origin={origin} originName={originName} />
                  </span>
                </>
              )}
            </Alert.Title>
            <Alert.Description>
              Remapping will rewrite every reference to <span className='font-mono font-medium'>{originName}</span> in the
              affected dataflow
              {collisionByDataflow.length === 1 ? '' : 's'}, including refs that came from{' '}
              {collisionByDataflow.length === 1
                ? collisionByDataflow[0].otherInputs.map((input, i) => {
                    const inputUrl = buildObjectUrl('datasets', { id: input.id, name: input.name }, origin);
                    return (
                      <Fragment key={input.id}>
                        {i > 0 ? ', ' : ''}
                        <span className='inline-flex items-center gap-0.5 align-text-bottom'>
                          <ObjectTypeIcon className='size-3.5 shrink-0' typeId='DATA_SOURCE' />
                          {inputUrl ? (
                            <Link
                              className='font-medium text-current no-underline decoration-accent hover:text-accent hover:underline'
                              href={inputUrl}
                              target='_blank'
                              title={input.name}
                            >
                              {input.name}
                            </Link>
                          ) : (
                            <span className='font-medium'>{input.name}</span>
                          )}
                        </span>
                      </Fragment>
                    );
                  })
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
            <ColumnUsagesModal
              cardsById={cardsById}
              items={items}
              origin={origin}
              originName={originName}
              totalSelected={totalSelected}
            />
          </span>
        </div>
        {typeMismatch && (
          <Tooltip delay={300}>
            <Button isIconOnly aria-label='Data type mismatch' className='shrink-0 text-warning' size='sm' variant='ghost'>
              <IconExclamationTriangle />
            </Button>
            <Tooltip.Content className='w-fit max-w-60'>
              Selected column's type <span className='font-mono text-muted'>{selectedTargetType}</span> doesn't match the
              original <span className='font-mono text-muted'>{originType}</span>
            </Tooltip.Content>
          </Tooltip>
        )}
        <Autocomplete
          aria-label={`Map ${originName} to`}
          className='w-44'
          selectionMode='single'
          value={mappedTo}
          variant='secondary'
          onChange={(key) => onChange(key)}
        >
          <Autocomplete.Trigger className='w-full'>
            {/* Render only the name (not its type) so the value stays one line.
                `flex-1 min-w-0` lets a long name truncate within the trigger
                instead of growing it and pushing the clear/indicator controls. */}
            <Autocomplete.Value className='flex min-w-0 flex-1 items-center gap-1'>
              {() =>
                mappedTo === UNMAPPED ? (
                  <span className='min-w-0 truncate text-muted italic'>Leave unmapped</span>
                ) : mappedTo === DROP ? (
                  <span className='min-w-0 truncate text-danger italic'>Drop column</span>
                ) : selectedBeastMode ? (
                  <>
                    <ObjectTypeIcon className='size-3.5 shrink-0' typeId='BEAST_MODE_FORMULA' />
                    <span className='min-w-0 truncate text-xs'>{selectedBeastMode.name}</span>
                  </>
                ) : (
                  <span className='min-w-0 truncate font-mono text-xs'>{mappedTo}</span>
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
                {canDrop && (
                  <ListBox.Item id={DROP} textValue='Drop column'>
                    <span className='text-danger italic'>Drop column</span>
                    <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                  </ListBox.Item>
                )}
                {/* No Beast Modes to offer: render columns flat, with no section
                    header. Beast Modes available: split into labeled sections so
                    the "Beast Modes" group is obviously selectable. */}
                {beastModeItems.length === 0 && columnItems}
                {beastModeItems.length > 0 && (
                  <ListBox.Section>
                    <Header>Columns</Header>
                    {columnItems}
                  </ListBox.Section>
                )}
                {beastModeItems.length > 0 && (
                  <ListBox.Section>
                    <Header>Beast Modes</Header>
                    {beastModeItems}
                  </ListBox.Section>
                )}
              </ListBox>
            </Autocomplete.Filter>
          </Autocomplete.Popover>
        </Autocomplete>
      </div>
    </div>
  );
}

// Info-icon modal listing every selected piece of content that references the
// origin column, grouped by type via a read-only DataList. Cards nest their
// drills (with the drill icon); a card shown only because a drill under it uses
// the column is marked with a leading asterisk (explained by a legend at the
// top of the modal). The info icon itself is the modal trigger (React Aria
// wires onPress through the Modal's DialogTrigger).
function ColumnUsagesModal({ cardsById, items, origin, originName, totalSelected }) {
  const {
    expandedIds,
    hasIndirectCards,
    items: usageItems
  } = useMemo(() => buildColumnUsageTree(items, cardsById, origin), [cardsById, items, origin]);
  return (
    <Modal>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label={`Show where ${originName} is used`}
          className='size-4 min-h-0 p-0 text-muted hover:text-foreground'
          size='sm'
          variant='ghost'
        >
          <IconInfoCircle className='size-3.5' />
        </Button>
        <Tooltip.Content className='max-w-60'>Click to view what objects reference this column</Tooltip.Content>
      </Tooltip>
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
            <Modal.Body className='max-h-[60vh] overflow-y-auto text-foreground'>
              {hasIndirectCards && (
                <p className='mb-2 text-xs text-muted'>
                  <span className='mr-1 inline-flex align-text-bottom text-accent'>
                    <IconInfoCircle className='size-3.5 shrink-0' />
                  </span>
                  This card doesn't use the column directly; one of its drill views does.
                </p>
              )}
              <DataList
                allowsMultipleExpanded
                defaultExpandedIds={expandedIds}
                items={usageItems}
                showActions={false}
                variant='transparent'
              />
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

// Info-icon modal listing the dataflows whose other inputs collide on the
// origin column name, each linking to the dataflow. Mirrors ColumnUsagesModal,
// shown when the collision spans more than one dataflow (a single one links
// inline).
function DataflowCollisionModal({ dataflows, origin, originName }) {
  return (
    <Modal>
      <Tooltip delay={300}>
        <Button
          isIconOnly
          aria-label={`Show dataflows where ${originName} collides`}
          className='size-4 min-h-0 p-0 text-current hover:opacity-70'
          size='sm'
          variant='ghost'
        >
          <IconInfoCircle className='size-3.5' />
        </Button>
        <Tooltip.Content className='max-w-60'>Click to view dataflows with a column that has the same name</Tooltip.Content>
      </Tooltip>
      <Modal.Backdrop isDissmissable>
        <Modal.Container className='p-1' placement='center' scroll='outside'>
          <Modal.Dialog className='p-2 pt-3'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Modal.Header>
              <Modal.Heading className='flex flex-col gap-1 truncate pr-6'>
                <span className='font-mono'>{originName}</span>
                <Description>
                  Also on another input of {dataflows.length} dataflow{dataflows.length === 1 ? '' : 's'}.
                </Description>
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className='flex max-h-[60vh] flex-col gap-3 overflow-y-auto text-foreground'>
              <ul className='flex min-w-0 flex-col gap-1'>
                {[...dataflows]
                  .sort((a, b) => (a.dataflowName || '').localeCompare(b.dataflowName || ''))
                  .map((df) => {
                    const url = buildObjectUrl('dataflows', { id: df.dataflowId, name: df.dataflowName }, origin);
                    return (
                      <li className='flex min-w-0 items-center gap-1.5' key={df.dataflowId}>
                        <ObjectTypeIcon className='size-4 shrink-0' typeId='DATAFLOW_TYPE' />
                        {url ? (
                          <Link
                            className='min-w-0 truncate text-sm no-underline decoration-accent hover:text-accent hover:underline'
                            href={url}
                            target='_blank'
                            title={df.dataflowName}
                          >
                            {df.dataflowName}
                          </Link>
                        ) : (
                          <span className='min-w-0 truncate text-sm' title={df.dataflowName}>
                            {df.dataflowName}
                          </span>
                        )}
                      </li>
                    );
                  })}
              </ul>
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

// Plural group label for a migrate type, taken from the object type model so the
// casing matches everywhere it's shown (e.g. "DataFlows", "DataSets"). None of
// these types pluralize irregularly, so a trailing "s" is enough.
function typeGroupLabel(typeKey) {
  const name = getObjectType(TYPE_KEY_TO_DOMO_TYPE[typeKey])?.name || typeKey;
  return `${name}s`;
}
