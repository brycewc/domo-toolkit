import {
  AlertDialog,
  Autocomplete,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Label,
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
import { BeastModeCardsModal } from '@/components/views/BeastModeCardsModal';
import { DataList } from '@/components/views/DataList';
import { ViewHeader } from '@/components/views/ViewHeader';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { getObjectType } from '@/models/DomoObjectType';
import { getBeastModeNestingParents, getBeastModeUsageForObject } from '@/services/beastModes';
import { getDatasetFunctions, getFunctionTemplate, getNestingBeastModeIds } from '@/services/functions';
import { MIGRATE_BEAST_MODE_TYPES, migrateBeastModeUsage } from '@/services/migrateBeastModeUsage';
import {
  beastModeSaveTarget,
  datasetIdFromBeastModeLinks,
  DRILL_ONLY_NOTE,
  groupBeastModeUsageByCard,
  parseBeastModeLinks
} from '@/utils/beastModeLinks';
import { buildRefreshAction, buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconArrowLeft from '@icons/arrow-left.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSwapHorizontal from '@icons/swap-horizontal.svg?react';
import IconX from '@icons/x.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';

/** Stable empty set, so an unsettled target doesn't churn the memos reading it. */
const EMPTY_SET = new Set();

const TYPE_GROUP_LABEL = {
  beastModes: 'Beast Modes Nesting This One',
  cards: 'Cards and Drills Using This Beast Mode'
};

const TYPE_KEY_TO_DOMO_TYPE = {
  beastModes: 'BEAST_MODE_FORMULA',
  cards: 'CARD'
};

export function MigrateBeastModeUsageView({
  currentContext = null,
  instance = null,
  isActive = true,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [beastModeId, setBeastModeId] = useState(null);
  const [beastModeName, setBeastModeName] = useState('');
  const [datasetId, setDatasetId] = useState(null);
  const [origin, setOrigin] = useState('');
  const [originTemplate, setOriginTemplate] = useState(null);
  const [tabId, setTabId] = useState(null);

  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [seededSelection, setSeededSelection] = useState(false);
  const [page, setPage] = useState('select');

  // `targetDetail` holds the facts only the target's own template answers
  // (whether it nests something, which cards already use it, its legacyId) and
  // carries the id it was read for, so `targetSettled` below can tell a
  // half-loaded target from a settled one and keep blockers from misfiring.
  const [targetId, setTargetId] = useState(null);
  const [targetDetail, setTargetDetail] = useState(null);

  // Consolidation's whole point is collapsing a duplicate, so removing the
  // original is the default; the service still refuses on a partial run.
  const [deleteOrigin, setDeleteOrigin] = useState(true);

  const [transferStatus, setTransferStatus] = useState({});
  // Counted in items, not types: this view has one type in almost every run
  // (cards), so a type tally would sit at 0/1 for the whole migration while
  // dozens of cards go by one PUT at a time.
  const [itemProgress, setItemProgress] = useState(null);
  const [isTransferring, setIsTransferring] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

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
      if (!data || data.type !== 'migrateBeastModeUsage') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context || context.domoObject?.typeId !== 'BEAST_MODE_FORMULA') {
        onStatusUpdate?.('Error', 'Migrate Content requires a Beast Mode in scope', 'danger');
        onBackToDefault?.();
        return;
      }
      // Detection stores the whole template response as the object's details, so
      // the common path needs no request; the fetch covers one never enriched.
      const details = context.domoObject?.metadata?.details;
      const template = details?.links ? details : await getFunctionTemplate(context.domoObject.id, context.tabId);
      const dataset = datasetIdFromBeastModeLinks(template?.links);
      if (!dataset) {
        onStatusUpdate?.('Error', "Couldn't determine which DataSet this Beast Mode belongs to", 'danger');
        onBackToDefault?.();
        return;
      }
      setBeastModeId(context.domoObject.id);
      setBeastModeName(template?.name || context.domoObject?.metadata?.name || `Beast Mode ${context.domoObject.id}`);
      setDatasetId(dataset);
      setOrigin(context.domoObject?.baseUrl || '');
      setOriginTemplate(template);
      setTabId(context.tabId);
    } catch (error) {
      console.error('[MigrateBeastModeUsageView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const specs = useMemo(() => {
    if (!beastModeId || !datasetId || !originTemplate) return [];
    const metadata = { details: originTemplate };
    return [
      {
        fetch: () => getBeastModeNestingParents({ id: beastModeId, metadata, tabId }),
        key: 'nestingParents'
      },
      { fetch: () => getDatasetFunctions(datasetId, tabId), key: 'targets' },
      {
        fetch: () => getBeastModeUsageForObject({ id: beastModeId, metadata, tabId }),
        key: 'usage'
      }
    ];
  }, [beastModeId, datasetId, originTemplate, tabId]);

  const { loadingCount, refresh, results } = useParallelFetches(specs);

  // Read per-spec rather than from `isFullyLoaded`: that flag is true for one
  // render after `specs` populates, because the hook seeds its state from the
  // FIRST specs value and only marks keys as loading in an effect. Treating that
  // frame as settled made the empty-usage bail fire before any fetch had run.
  // An errored fetch settles too, but must never read as "nothing uses it".
  const discoveryStatuses = specs.map((spec) => results[spec.key]?.status);
  const discoverySettled = specs.length > 0 && discoveryStatuses.every((s) => s === 'loaded' || s === 'error');
  const discoveryErrors = specs.map((spec) => results[spec.key]?.error).filter(Boolean);

  const usage = results.usage?.items || null;
  const nestingParents = results.nestingParents?.items || [];
  const datasetFunctions = results.targets?.items || [];
  const otherLinks = usage?.otherLinks || [];

  const originLegacyId = originTemplate?.legacyId || null;
  const originDataType = originTemplate?.dataType || null;
  const originSavedOn = useMemo(() => beastModeSaveTarget(originTemplate?.links), [originTemplate]);

  // Every row the repoint has to write, split by which write it needs. A
  // card-saved nesting parent is NOT its own row: one card gets exactly one PUT,
  // so it folds into its owner card and rides along on that card's numeric remap.
  const { cardRows, datasetNesting, unreadableNesting } = useMemo(() => {
    const grouped = usage ? groupBeastModeUsageByCard(usage) : { cards: [], orphanDrills: [] };
    const rows = new Map();
    const addRow = (row) => {
      const existing = rows.get(row.key);
      if (existing) {
        if (row.usesDirectly) existing.usesDirectly = true;
        if (row.hostedNesting) existing.hostedNesting.push(...row.hostedNesting);
        return;
      }
      rows.set(row.key, { hostedNesting: [], ...row });
    };

    for (const card of grouped.cards) {
      addRow({
        id: card.id,
        isDrill: false,
        key: `card-${card.id}`,
        name: card.name || `Card ${card.id}`,
        urn: null,
        usesDirectly: card.usesDirectly
      });
      for (const drill of card.drills) {
        addRow({
          id: drill.id,
          isDrill: true,
          key: `drill-${drill.id}`,
          name: drill.name || `Drill ${drill.id}`,
          parentName: card.name || `Card ${card.id}`,
          urn: `dr:${drill.id}:${card.id}`,
          usesDirectly: true
        });
      }
    }
    // A drill whose parent card is unknown can't be written: the PUT needs the
    // full `dr:<drillId>:<rootId>` urn. Listed so it isn't silently dropped.
    for (const drill of grouped.orphanDrills) {
      addRow({
        id: drill.id,
        isDrill: true,
        key: `drill-${drill.id}`,
        name: drill.name || `Drill ${drill.id}`,
        unwritable: "This drill's parent card is unknown, so it can't be updated automatically.",
        urn: null,
        usesDirectly: true
      });
    }

    const dataset = [];
    const unreadable = [];
    for (const parent of nestingParents) {
      if (!parent.template) {
        unreadable.push(parent);
        continue;
      }
      if (!parent.saveTarget) {
        dataset.push(parent);
        continue;
      }
      const isDrill = parent.saveTarget.typeId === 'DRILL_VIEW';
      const hostId = parent.saveTarget.id;
      addRow({
        hostedNesting: [parent.name || `Beast Mode ${parent.id}`],
        id: hostId,
        isDrill,
        key: isDrill ? `drill-${hostId}` : `card-${hostId}`,
        name: `Card ${hostId}`,
        unwritable:
          isDrill && !parent.saveTarget.parentId
            ? "This drill's parent card is unknown, so it can't be updated automatically."
            : undefined,
        urn: isDrill && parent.saveTarget.parentId ? `dr:${hostId}:${parent.saveTarget.parentId}` : null,
        usesDirectly: false
      });
    }

    return {
      cardRows: [...rows.values()].sort((a, b) => (a.name || '').localeCompare(b.name || '')),
      datasetNesting: dataset,
      unreadableNesting: unreadable
    };
  }, [nestingParents, usage]);

  const rowsByType = useMemo(
    () => ({ beastModes: [...datasetNesting, ...unreadableNesting], cards: cardRows }),
    [cardRows, datasetNesting, unreadableNesting]
  );

  const selectionKey = useCallback((typeKey, row) => `${typeKey}:${typeKey === 'cards' ? row.key : row.id}`, []);

  const isRowSelectable = useCallback((typeKey, row) => {
    if (typeKey === 'cards') return !row.unwritable;
    return Boolean(row.template);
  }, []);

  const selectableIds = useMemo(() => {
    const ids = new Set();
    for (const t of MIGRATE_BEAST_MODE_TYPES) {
      for (const row of rowsByType[t.key]) {
        if (isRowSelectable(t.key, row)) ids.add(selectionKey(t.key, row));
      }
    }
    return ids;
  }, [isRowSelectable, rowsByType, selectionKey]);

  // Pre-select everything writable once discovery settles: consolidating a
  // duplicate normally means moving all of it.
  useEffect(() => {
    if (seededSelection || !discoverySettled) return;
    const next = new Set(selectableIds);
    for (const t of MIGRATE_BEAST_MODE_TYPES) {
      const rows = rowsByType[t.key].filter((row) => isRowSelectable(t.key, row));
      if (rows.length > 0 && rows.every((row) => next.has(selectionKey(t.key, row)))) next.add(t.key);
    }
    setSelectedIds(next);
    setSeededSelection(true);
  }, [discoverySettled, isRowSelectable, rowsByType, seededSelection, selectableIds, selectionKey]);

  const target = useMemo(
    () => datasetFunctions.find((f) => String(f.id) === String(targetId)) || null,
    [datasetFunctions, targetId]
  );

  // True only once the CURRENT target's template has been read. Every check that
  // depends on the target's own fields is gated on this, so none of them fires
  // against a half-loaded target.
  const targetSettled = Boolean(targetId) && targetDetail?.forId === targetId;
  const targetCardIds = targetSettled ? targetDetail.cardIds : EMPTY_SET;
  const targetLegacyId = targetSettled ? targetDetail.legacyId : null;
  const targetNests = targetSettled ? targetDetail.nests : false;

  // Candidates: every other dataset-saved Beast Mode on this dataset, minus the
  // ones that nest the origin (they can't replace what they contain).
  const targetOptions = useMemo(() => {
    const excluded = new Set([String(beastModeId), ...nestingParents.map((p) => String(p.id))]);
    return datasetFunctions
      .filter((f) => !excluded.has(String(f.id)))
      .map((f) => ({
        cardCount: (f.activeCardIds || []).length,
        dataType: f.dataType || null,
        id: String(f.id),
        legacyId: f.legacyId || null,
        name: f.name || String(f.id)
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [beastModeId, datasetFunctions, nestingParents]);

  // Read the chosen target's own template for the two things the search response
  // can't answer: whether it nests anything (depth) and which cards use it.
  useEffect(() => {
    if (!targetId) {
      setTargetDetail(null);
      return;
    }
    let cancelled = false;
    getFunctionTemplate(targetId, tabId)
      .then(async (template) => {
        const { cardIds, drillRefs } = parseBeastModeLinks(template?.links);
        // Only worth the extra hydrate when it lists a dependency at all;
        // getNestingBeastModeIds knows a nested Variable doesn't count.
        const nests = (template?.functionTemplateDependencies || []).length
          ? (await getNestingBeastModeIds([{ id: targetId }], tabId)).has(String(targetId))
          : false;
        if (cancelled) return;
        setTargetDetail({
          cardIds: new Set([...cardIds, ...drillRefs.map((d) => d.id)].map(String)),
          forId: targetId,
          legacyId: template?.legacyId || null,
          nests
        });
      })
      .catch(() => {
        // Settled-but-empty, so the missing-id blocker fires for real rather
        // than the view waiting forever on a read that already failed.
        if (!cancelled) setTargetDetail({ cardIds: new Set(), forId: targetId, legacyId: null, nests: false });
      });
    return () => {
      cancelled = true;
    };
  }, [tabId, targetId]);

  const selectedByType = useMemo(() => {
    const out = {};
    for (const t of MIGRATE_BEAST_MODE_TYPES) {
      out[t.key] = rowsByType[t.key].filter(
        (row) => isRowSelectable(t.key, row) && selectedIds.has(selectionKey(t.key, row))
      );
    }
    return out;
  }, [isRowSelectable, rowsByType, selectedIds, selectionKey]);

  const totalSelected = MIGRATE_BEAST_MODE_TYPES.reduce((sum, t) => sum + selectedByType[t.key].length, 0);
  const selectionIsComplete = totalSelected === selectableIds.size && unreadableNesting.length === 0;

  const dataListItems = useMemo(() => {
    return MIGRATE_BEAST_MODE_TYPES.map((t) => {
      const rows = rowsByType[t.key];
      const xfer = transferStatus[t.key];
      const leaves = rows.map((row) => {
        const isCard = t.key === 'cards';
        const typeId = isCard ? (row.isDrill ? 'DRILL_VIEW' : 'CARD') : 'BEAST_MODE_FORMULA';
        return new DataListItem({
          annotation: leafAnnotation(t.key, row),
          chip: !isCard && !row.template ? { color: 'warning', label: 'Formula unreadable' } : null,
          id: selectionKey(t.key, row),
          label: isCard ? row.name : row.name || `Beast Mode ${row.id}`,
          muted: isCard ? !row.usesDirectly : false,
          originalId: row.id,
          typeId,
          url: leafUrl(t.key, row, origin)
        });
      });
      return new DataListItem({
        children: leaves,
        count: xfer?.count ?? rows.length,
        error: xfer?.error || null,
        errorDetail: xfer?.errorDetail || null,
        id: t.key,
        isVirtualParent: true,
        label: TYPE_GROUP_LABEL[t.key],
        status: xfer?.status ?? 'loaded',
        typeId: TYPE_KEY_TO_DOMO_TYPE[t.key]
      });
    });
  }, [origin, rowsByType, selectionKey, transferStatus]);

  const defaultExpandedGroupIds = useMemo(() => {
    const withChildren = dataListItems.filter((group) => group.children?.length > 0);
    if (withChildren.length === 1) return [withChildren[0].id];
    return withChildren.filter((group) => group.children.length === 1).map((group) => group.id);
  }, [dataListItems]);

  const isSelectable = useCallback(
    (item) => {
      if (item.isVirtualParent) return item.children?.some((child) => selectableIds.has(child.id));
      return selectableIds.has(item.id);
    },
    [selectableIds]
  );

  const getUnselectableTooltip = useCallback(
    (item) => {
      if (item.isVirtualParent) return null;
      for (const t of MIGRATE_BEAST_MODE_TYPES) {
        const row = rowsByType[t.key].find((r) => selectionKey(t.key, r) === item.id);
        if (!row) continue;
        if (t.key === 'cards' && row.unwritable) return row.unwritable;
        if (t.key === 'beastModes' && !row.template) {
          return "This Beast Mode's formula couldn't be read, so it can't be repointed automatically.";
        }
      }
      return null;
    },
    [rowsByType, selectionKey]
  );

  const handleSelectionChange = useCallback(
    (incoming) => {
      const prev = selectedIds;
      const added = [...incoming].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !incoming.has(id));
      const next = new Set(incoming);

      const propagate = (typeKey, isAdding) => {
        for (const row of rowsByType[typeKey] || []) {
          if (!isRowSelectable(typeKey, row)) continue;
          const id = selectionKey(typeKey, row);
          if (isAdding) next.add(id);
          else next.delete(id);
        }
      };
      const reconcile = (typeKey) => {
        const rows = (rowsByType[typeKey] || []).filter((row) => isRowSelectable(typeKey, row));
        if (rows.length === 0) return;
        if (rows.every((row) => next.has(selectionKey(typeKey, row)))) next.add(typeKey);
        else next.delete(typeKey);
      };

      for (const id of added) if (isParentKey(id)) propagate(id, true);
      for (const id of removed) if (isParentKey(id)) propagate(id, false);
      const touched = new Set();
      for (const id of [...added, ...removed]) {
        const typeKey = String(id).split(':')[0];
        if (!isParentKey(id) && TYPE_KEY_TO_DOMO_TYPE[typeKey]) touched.add(typeKey);
      }
      for (const typeKey of touched) reconcile(typeKey);

      setSelectedIds(next);
    },
    [isRowSelectable, rowsByType, selectedIds, selectionKey]
  );

  const selectAllControl = useMemo(
    () => ({
      ariaLabel: 'Select all usage',
      count: totalSelected,
      onToggle: (checked) => {
        const next = new Set();
        if (checked) {
          for (const id of selectableIds) next.add(id);
          for (const t of MIGRATE_BEAST_MODE_TYPES) {
            const rows = rowsByType[t.key].filter((row) => isRowSelectable(t.key, row));
            if (rows.length > 0) next.add(t.key);
          }
        }
        setSelectedIds(next);
      },
      showCount: true,
      total: selectableIds.size
    }),
    [isRowSelectable, rowsByType, selectableIds, totalSelected]
  );

  // Nothing to do: discovery settled and nothing references this Beast Mode.
  const bailedRef = useRef(false);
  const nothingToMigrate =
    discoverySettled &&
    discoveryErrors.length === 0 &&
    !isTransferring &&
    cardRows.length === 0 &&
    nestingParents.length === 0;
  const holdContent = useViewReady(!isLoading && !nothingToMigrate);
  useEffect(() => {
    if (bailedRef.current || !nothingToMigrate) return;
    bailedRef.current = true;
    const message =
      otherLinks.length > 0
        ? `Only content this tool can't repoint uses **${beastModeName}**`
        : `Nothing uses **${beastModeName}**`;
    onStatusUpdate?.('Nothing to Migrate', message, 'warning');
    onBackToDefault?.();
  }, [beastModeName, nothingToMigrate, onBackToDefault, onStatusUpdate, otherLinks.length]);

  const blockers = useMemo(() => {
    const out = [];
    if (!target || !targetSettled) return out;
    if (targetNests && selectedByType.beastModes.length > 0) {
      const n = selectedByType.beastModes.length;
      out.push(
        `"${target.name}" nests another Beast Mode, and ${n} Beast Mode${n === 1 ? '' : 's'} nesting ` +
          `"${beastModeName}" ${n === 1 ? 'is' : 'are'} selected. Domo allows only one level of nesting, so this ` +
          `would break ${n === 1 ? 'it' : 'them'}. Pick a target that doesn't nest another Beast Mode, or clear ` +
          `${n === 1 ? 'it' : 'them'} from the selection.`
      );
    }
    if (selectedByType.cards.length > 0 && (!originLegacyId || !targetLegacyId)) {
      out.push(
        "Domo didn't return an ID for one of these Beast Modes, so the cards can't be repointed. Refresh and try again."
      );
    }
    return out;
  }, [beastModeName, originLegacyId, selectedByType, target, targetLegacyId, targetNests, targetSettled]);

  // Cards in the selection that already reference the target. Named here rather
  // than inside the warning text: the list belongs in the info-icon modal, where
  // each card can be a link.
  const alreadyUsingCards = useMemo(
    () => selectedByType.cards.filter((row) => targetCardIds.has(String(row.id))),
    [selectedByType, targetCardIds]
  );

  const warnings = useMemo(() => {
    const out = [];
    if (originSavedOn) {
      out.push({
        key: 'cardSavedOrigin',
        message:
          `"${beastModeName}" is saved to a card rather than to the DataSet, so its only use is that card and any ` +
          'drills under it. Its card-level copy is removed as part of the repoint.'
      });
    }
    // Only a real mismatch counts: a template can legitimately report no
    // dataType at all, and calling that a mismatch would warn on every such pair.
    if (target && originDataType && target.dataType && originDataType !== target.dataType) {
      out.push({
        key: 'dataType',
        message:
          `"${beastModeName}" is a ${originDataType} and "${target.name}" is a ${target.dataType}. Cards using it may ` +
          'aggregate, sort, or format differently afterward.'
      });
    }
    if (target && alreadyUsingCards.length > 0) {
      const one = alreadyUsingCards.length === 1;
      out.push({
        key: 'alreadyUsing',
        message:
          `${alreadyUsingCards.length} selected card${one ? '' : 's'} already reference${one ? 's' : ''} ` +
          `"${target.name}". Deselect ${one ? 'it' : 'them'} to leave ${one ? 'it' : 'them'} alone.`,
        trailing: (
          <BeastModeCardsModal
            beastModeName={target.name}
            cards={alreadyUsingCards}
            origin={origin}
            total={selectedByType.cards.length}
          />
        )
      });
    }
    if (otherLinks.length > 0) {
      out.push({
        key: 'otherLinks',
        message:
          `${describeOtherLinks(otherLinks)} also use "${beastModeName}" and can't be repointed here. ` +
          'Update them by hand, or they will keep pointing at the original.'
      });
    }
    if (unreadableNesting.length > 0) {
      const n = unreadableNesting.length;
      out.push({
        key: 'unreadableNesting',
        message:
          `${n} Beast Mode${n === 1 ? '' : 's'} nesting "${beastModeName}" couldn't be read, ` +
          `so ${n === 1 ? 'it' : 'they'} can't be repointed automatically.`
      });
    }
    return out;
  }, [
    alreadyUsingCards,
    beastModeName,
    originDataType,
    originSavedOn,
    origin,
    otherLinks,
    selectedByType,
    target,
    unreadableNesting
  ]);

  const canDeleteOrigin = selectionIsComplete && otherLinks.length === 0;

  const handleMigrate = async () => {
    setConfirmOpen(false);
    if (!target) return;

    const initialStatus = {};
    for (const t of MIGRATE_BEAST_MODE_TYPES) {
      if (selectedByType[t.key].length > 0) {
        initialStatus[t.key] = { count: selectedByType[t.key].length, status: 'transferring' };
      }
    }
    setTransferStatus(initialStatus);
    setItemProgress(null);
    setIsTransferring(true);

    try {
      const { originDelete, results: transferResults } = await migrateBeastModeUsage({
        datasetId,
        deleteOrigin: deleteOrigin && canDeleteOrigin,
        hasUnmappableUsage: otherLinks.length > 0,
        onItemProgress: ({ completed, total }) => {
          if (mountedRef.current) setItemProgress({ completed, total });
        },
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
        origin: { id: beastModeId, legacyId: originLegacyId, name: beastModeName, savedOn: originSavedOn },
        selectedCards: selectedByType.cards,
        selectedNestingBeastModes: selectedByType.beastModes,
        selectionIsComplete,
        tabId,
        target: { id: target.id, legacyId: targetLegacyId, name: target.name }
      });

      let totalSucceeded = 0;
      let totalFailed = 0;
      for (const [, r] of transferResults) {
        totalSucceeded += r.succeeded || 0;
        totalFailed += r.failed || 0;
      }

      const deleteNote = originDelete.succeeded
        ? ` **${beastModeName}** was deleted.`
        : originDelete.error
          ? ` **${beastModeName}** could not be deleted: ${originDelete.error}`
          : originDelete.skipReason
            ? ` **${beastModeName}** was kept because ${originDelete.skipReason}.`
            : '';

      if (totalFailed > 0) {
        showStatus(
          'Migration Partially Complete',
          `**${totalSucceeded}** repointed, **${totalFailed}** failed.${deleteNote}`,
          'warning',
          8000
        );
        setPage('select');
      } else {
        showStatus(
          'Migration Complete',
          `Repointed **${totalSucceeded}** item${totalSucceeded === 1 ? '' : 's'} from **${beastModeName}** to ` +
            `**${target.name}**.${deleteNote}`,
          'success',
          7000
        );
        onBackToDefault?.();
      }
    } catch (err) {
      showStatus('Migration Failed', err.message || 'An error occurred', 'danger', 7000);
      if (mountedRef.current) {
        setTransferStatus((prevStatus) => {
          const nextStatus = { ...prevStatus };
          for (const key of Object.keys(nextStatus)) {
            if (nextStatus[key].status === 'transferring') {
              nextStatus[key] = { ...nextStatus[key], error: err.message || 'Migration failed', status: 'failed' };
            }
          }
          return nextStatus;
        });
      }
    } finally {
      if (mountedRef.current) setIsTransferring(false);
    }
  };

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

  const canAdvance = totalSelected > 0 && !isTransferring;
  const canMigrate = targetSettled && totalSelected > 0 && blockers.length === 0 && !isTransferring;

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
                Migrate Content
              </AlertDialog.Heading>
            </AlertDialog.Header>
            <AlertDialog.Body className='flex flex-col gap-2 text-sm'>
              <p>
                This repoints <strong>{totalSelected}</strong> item{totalSelected === 1 ? '' : 's'} from{' '}
                <strong>{beastModeName}</strong> to <strong>{target?.name}</strong>. It saves changes to live content and
                cannot be undone.
              </p>
              {deleteOrigin && canDeleteOrigin && (
                <p>
                  <strong>{beastModeName}</strong> is deleted afterward.
                </p>
              )}
            </AlertDialog.Body>
            <AlertDialog.Footer>
              <Button size='sm' slot='close' variant='tertiary'>
                Cancel
              </Button>
              <Button size='sm' variant='primary' onPress={handleMigrate}>
                <IconSwapHorizontal />
                Migrate
              </Button>
            </AlertDialog.Footer>
          </AlertDialog.Dialog>
        </AlertDialog.Container>
      </AlertDialog.Backdrop>
    </AlertDialog>
  );

  if (page === 'select') {
    return (
      <>
        <DataList
          allowsMultipleExpanded
          beta
          currentContext={currentContext}
          defaultExpandedIds={defaultExpandedGroupIds}
          feature='Migrate Content of'
          featureIcon={<IconSwapHorizontal />}
          fillHeight={true}
          getUnselectableTooltip={getUnselectableTooltip}
          headerActions={['reload', 'refresh']}
          isActive={isActive}
          isRefreshing={loadingCount > 0}
          isSelectable={isSelectable}
          itemActions={['copy']}
          itemLabel='item'
          items={dataListItems}
          objectId={beastModeId}
          objectType='BEAST_MODE_FORMULA'
          selectAll={selectAllControl}
          selectedIds={selectedIds}
          selectionMode={true}
          showActions={true}
          showActivityLogAll={false}
          showCounts={true}
          subject={beastModeName}
          viewType='migrateBeastModeUsage'
          onClose={onBackToDefault}
          onRefresh={refresh}
          onSelectionChange={handleSelectionChange}
          onStatusUpdate={onStatusUpdate}
          banner={
            discoveryErrors.length > 0 ? (
              <Alert className='w-full' status='danger' variant='transparent'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <AlertStatusIcon />
                    Couldn't Read Everything That Uses This Beast Mode
                  </Alert.Title>
                  <Alert.Description>{discoveryErrors[0]}</Alert.Description>
                </Alert.Content>
              </Alert>
            ) : null
          }
          footer={
            <Button fullWidth isDisabled={!canAdvance} size='sm' variant='primary' onPress={() => setPage('target')}>
              Choose Replacement
            </Button>
          }
        />
        {confirmDialog}
      </>
    );
  }

  return (
    <>
      <Card className='flex min-h-0 w-full flex-1 flex-col gap-0 p-2'>
        <ViewHeader
          beta
          feature='Migrate Content of'
          featureIcon={<IconSwapHorizontal />}
          subject={beastModeName}
          subjectTypeId='BEAST_MODE_FORMULA'
          onClose={onBackToDefault}
          actions={[
            buildReloadAction({
              currentContext,
              objectId: beastModeId,
              objectType: 'BEAST_MODE_FORMULA',
              onStatusUpdate,
              viewType: 'migrateBeastModeUsage'
            }),
            buildRefreshAction({ isRefreshing: loadingCount > 0 || Boolean(targetId && !targetSettled), onRefresh: refresh })
          ]}
        />
        <Separator className='mt-1.5' />
        <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
          <Card.Content className='flex flex-col gap-3 py-2'>
            <div className='flex flex-col gap-1'>
              <Label className='text-sm font-medium'>To Beast Mode</Label>
              <p className='text-xs text-muted'>
                <strong>{totalSelected}</strong> item{totalSelected === 1 ? '' : 's'} will reference this Beast Mode instead.
                Only Beast Modes on the same DataSet can replace it.
              </p>
              <TargetBeastModeSelect options={targetOptions} value={targetId} onChange={setTargetId} />
            </div>

            {blockers.map((message) => (
              <Alert className='w-full' key={message} status='warning' variant='transparent'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <AlertStatusIcon />
                    Can't Migrate
                  </Alert.Title>
                  <Alert.Description>{message}</Alert.Description>
                </Alert.Content>
              </Alert>
            ))}
            {warnings.map((warning) => (
              <Alert className='w-full' key={warning.key} status='warning' variant='transparent'>
                <Alert.Content>
                  {/* The trigger sits beside the <p>, not inside it: Alert.Description
                      renders a paragraph, which can't legally contain the modal's
                      wrapper markup. */}
                  <div className='flex items-start gap-1'>
                    <Alert.Description className='min-w-0 flex-1'>{warning.message}</Alert.Description>
                    {warning.trailing}
                  </div>
                </Alert.Content>
              </Alert>
            ))}

            <Checkbox
              isDisabled={!canDeleteOrigin || isTransferring}
              isSelected={deleteOrigin && canDeleteOrigin}
              variant='secondary'
              onChange={setDeleteOrigin}
            >
              <Checkbox.Content>
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <span className='text-sm'>Delete "{beastModeName}" afterward</span>
              </Checkbox.Content>
            </Checkbox>
            {!canDeleteOrigin && (
              <p className='-mt-2 text-xs text-muted'>
                Available once everything using it is selected
                {otherLinks.length > 0 ? " and no usage remains that can't be repointed" : ''}.
              </p>
            )}
          </Card.Content>
        </ScrollShadow>
        <Card.Footer className='flex gap-2 pt-2'>
          <Button isDisabled={isTransferring} size='sm' variant='tertiary' onPress={() => setPage('select')}>
            <IconArrowLeft />
            Back
          </Button>
          <Button
            fullWidth
            isDisabled={!canMigrate}
            isPending={isTransferring}
            size='sm'
            variant='primary'
            onPress={() => setConfirmOpen(true)}
          >
            {isTransferring
              ? `Migrating… ${itemProgress?.completed ?? 0}/${itemProgress?.total ?? totalSelected} ${
                  (itemProgress?.total ?? totalSelected) === 1 ? 'Item' : 'Items'
                }`
              : `Migrate ${totalSelected} item${totalSelected === 1 ? '' : 's'}`}
          </Button>
        </Card.Footer>
      </Card>
      {confirmDialog}
    </>
  );
}

/** Human-readable summary of usage kinds this tool doesn't model, e.g. "1 Alert". */
function describeOtherLinks(otherLinks) {
  return otherLinks
    .map((other) => {
      const label = getObjectType(other.type)?.name || other.type.toLowerCase().replace(/_/g, ' ');
      return `${other.count} ${label}${other.count === 1 ? '' : 's'}`;
    })
    .join(' and ');
}

function formatErrors(result) {
  if (!result?.errors?.length) return null;
  const n = result.errors.length;
  return `${n} item${n === 1 ? '' : 's'} failed`;
}

function isParentKey(id) {
  return MIGRATE_BEAST_MODE_TYPES.some((t) => t.key === id);
}

function leafAnnotation(typeKey, row) {
  if (typeKey !== 'cards') return null;
  if (row.unwritable) return row.unwritable;
  if (row.hostedNesting?.length > 0 && !row.usesDirectly) {
    return "This card doesn't use the Beast Mode directly; a Beast Mode saved on it nests it.";
  }
  if (!row.usesDirectly) return DRILL_ONLY_NOTE;
  if (row.isDrill && row.parentName) return `Drill under "${row.parentName}"`;
  return null;
}

function leafUrl(typeKey, row, origin) {
  if (!origin) return null;
  if (typeKey === 'beastModes') return `${origin}/datacenter/beastmode?id=${row.id}`;
  // A drill lives on no page of its own, and a card listed only to hold one is
  // not itself a consumer, so neither gets a link.
  if (row.isDrill || !row.usesDirectly) return null;
  return `${origin}/kpis/details/${row.id}`;
}

// The replacement picker. Virtualized and searchable because a busy dataset
// carries hundreds of Beast Modes; each option shows its data type and how many
// cards already use it.
function TargetBeastModeSelect({ onChange, options, value }) {
  const { contains } = useFilter({ sensitivity: 'base' });
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => options.filter((o) => !query || contains(o.name, query)), [contains, options, query]);
  const selected = options.find((o) => o.id === value) || null;

  return (
    <Autocomplete
      allowsEmptyCollection
      aria-label='Replacement Beast Mode'
      className='w-full'
      selectionMode='single'
      value={value}
      variant='secondary'
      onChange={onChange}
    >
      <Autocomplete.Trigger className='w-full'>
        <Autocomplete.Value className='flex min-w-0 flex-1 items-center gap-1'>
          {() =>
            selected ? (
              <span className='min-w-0 truncate'>{selected.name}</span>
            ) : (
              <span className='min-w-0 truncate text-muted italic'>Choose a Beast Mode…</span>
            )
          }
        </Autocomplete.Value>
        <Autocomplete.ClearButton />
        <Autocomplete.Indicator />
      </Autocomplete.Trigger>
      <Autocomplete.Popover className='w-fit max-w-9/10 min-w-72' placement='bottom start'>
        <Popover.Heading className='sr-only'>Choose a replacement Beast Mode</Popover.Heading>
        <Autocomplete.Filter inputValue={query} onInputChange={setQuery}>
          <SearchField
            autoFocus
            aria-label='Search Beast Modes'
            className='sticky top-0 z-10'
            name='beast-mode-search'
            variant='secondary'
          >
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder='Search Beast Modes...' />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
          <Virtualizer layout={ListLayout} layoutOptions={{ estimatedRowHeight: 48 }}>
            <ListBox
              aria-label='Beast Modes on this DataSet'
              className='max-h-80 overflow-y-auto'
              items={filtered}
              renderEmptyState={() => <EmptyState>No Beast Modes found</EmptyState>}
            >
              {(item) => (
                <ListBox.Item id={item.id} key={item.id} textValue={item.name}>
                  <div className='flex min-w-0 flex-col'>
                    <span className='truncate text-sm'>{item.name}</span>
                    <span className='truncate text-xs text-muted'>
                      {[item.dataType, `${item.cardCount} card${item.cardCount === 1 ? '' : 's'}`]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </div>
                </ListBox.Item>
              )}
            </ListBox>
          </Virtualizer>
        </Autocomplete.Filter>
      </Autocomplete.Popover>
    </Autocomplete>
  );
}
