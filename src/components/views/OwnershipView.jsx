import { Button, Card, Checkbox, Label, Spinner } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { TransferOwnershipModal } from '@/components/modals/TransferOwnershipModal';
import { DataList } from '@/components/views/DataList';
import { useParallelFetches } from '@/hooks/useParallelFetches';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { uploadDataFile } from '@/services/files';
import { sendEmail } from '@/services/messages';
import { sharePages } from '@/services/pages';
import {
  countOwned,
  flattenOwned,
  TRANSFER_TYPES,
  transferAllOwnership,
  TYPE_KEY_TO_LOG_TYPE
} from '@/services/transferOwnership';
import { deleteUser } from '@/services/users';
import { buildExcelBlob, generateExportFilename } from '@/utils/exportData';
import { isTypeFeatureEnabled } from '@/utils/featureSwitches';
import { getSidepanelData } from '@/utils/sidepanel';
import IconArrowsHorizontalBox from '@icons/arrows-horizontal-box.svg?react';
import IconFormatListChecks from '@icons/format-list-checks.svg?react';
import IconListBulleted from '@icons/list-bulleted.svg?react';

const LOG_COLUMNS = [
  { accessorKey: 'Object Type', header: 'Object Type' },
  { accessorKey: 'Object ID', header: 'Object ID' },
  { accessorKey: 'Object Name', header: 'Object Name' },
  { accessorKey: 'Date', header: 'Date' },
  { accessorKey: 'Status', header: 'Status' },
  { accessorKey: 'Notes', header: 'Notes' },
  { accessorKey: 'Previous Owner ID', header: 'Previous Owner ID' },
  { accessorKey: 'Previous Owner Name', header: 'Previous Owner Name' },
  { accessorKey: 'New Owner ID', header: 'New Owner ID' },
  { accessorKey: 'New Owner Name', header: 'New Owner Name' }
];

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Maps TRANSFER_TYPES keys to DomoObjectType IDs. Used for two things:
 *   - Leading ObjectTypeIcon on each parent row in selection mode.
 *   - URL construction on individual leaf items in `buildLeafItems`.
 *
 * `projectsAndTasks` is a synthetic key that bundles two real types
 * (PROJECT + PROJECT_TASK). Both share the same icon component in
 * DomoObjectType.js, so we map this key to 'PROJECT' for the parent
 * row's icon. Per-leaf URLs are NOT driven by this map value, though.
 * `buildProjectsAndTasksItems` builds URLs against each leaf's specific
 * subType (`PROJECT` for project rows, `PROJECT_TASK` for task rows)
 * because the two have distinct urlPath templates (`/project/{id}` and
 * `/project?taskId={id}`).
 */
const TYPE_KEY_TO_DOMO_TYPE = {
  accounts: 'ACCOUNT',
  aiModels: 'AI_MODEL',
  aiProjects: 'AI_PROJECT',
  alerts: 'ALERT',
  appDbCollections: 'MAGNUM_COLLECTION',
  approvals: 'APPROVAL',
  approvalTemplates: 'TEMPLATE',
  appStudioApps: 'DATA_APP',
  cards: 'CARD',
  codeEnginePackages: 'CODEENGINE_PACKAGE',
  customApps: 'APP',
  dataflows: 'DATAFLOW_TYPE',
  datasets: 'DATA_SOURCE',
  filesets: 'FILESET',
  functions: 'BEAST_MODE_FORMULA',
  goals: 'GOAL',
  groups: 'GROUP',
  jupyterWorkspaces: 'DATA_SCIENCE_NOTEBOOK',
  metrics: 'METRIC',
  pages: 'PAGE',
  projectsAndTasks: 'PROJECT',
  repositories: 'REPOSITORY',
  subscriptions: 'SUBSCRIPTION',
  taskCenterQueues: 'HOPPER_QUEUE',
  taskCenterTasks: 'HOPPER_TASK',
  workflows: 'WORKFLOW_MODEL',
  worksheets: 'WORKSHEET',
  workspaces: 'WORKSPACE'
};

export function OwnershipView({
  currentContext = null,
  instance = null,
  isActive = true,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [origin, setOrigin] = useState('');
  // Frozen snapshot of the context at view launch; its `domoObject` is the
  // source user being browsed/transferred. Distinct from the `currentContext`
  // prop above, which is the LIVE context tracking whatever object the user is
  // currently looking at in Domo (used by DataList's reload affordance).
  const [launchContext, setLaunchContext] = useState(null);

  const [selectionMode, setSelectionMode] = useState(false);
  // Unified selection Set: contains both bare type keys (`cards`, `pages`, …)
  // for whole-type selection AND namespaced leaf IDs (`cards:1234`) for
  // per-item selection. Parent↔child reconciliation happens in
  // `handleSelectionChange`, same pattern as MigrateDownstreamContentView.
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  // True when selection-mode was engaged with a pre-selection that may need
  // hydration/pruning once fetches settle; currently only the
  // TransferOwnership launch path (`autoEnableSelectionMode`) uses this.
  // `loadData` pre-selects every type the user has authority for so type-level
  // checkboxes appear pre-checked as each fetch resolves; once fully loaded,
  // the auto-select effect fires once to (a) seed every leaf under each
  // pre-selected eligible type, and (b) prune any pre-selected type that
  // didn't end up eligible (failed or returned 0 items).
  const [pendingSelectAll, setPendingSelectAll] = useState(false);
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
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'ownership') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }

      const uid = context.domoObject?.id;
      const name = context.domoObject?.metadata?.name || context.domoObject?.metadata?.displayName || `User ${uid}`;
      const baseUrl = context.domoObject?.baseUrl || '';

      setUserId(uid);
      setUserName(name);
      setOrigin(baseUrl);
      setTabId(context.tabId);
      setLaunchContext(context);

      // Transfer Ownership action button passes `autoEnableSelectionMode: true`
      // so we engage selection mode as soon as the view mounts. We
      // optimistically pre-select every type the toolkit user has authority
      // for (forbidden filter is authority-based, derivable from
      // `context.user` without waiting on fetches) so each row's checkbox
      // appears already-checked the moment its fetch resolves, instead of
      // every checkbox flipping unchecked → checked together when the slowest
      // fetch finishes (which made users uncertain whether they had to act
      // during loading). The auto-select effect below still runs to PRUNE
      // any pre-selected types that ended up failing or returning 0 items.
      if (data.autoEnableSelectionMode && context.domoObject?.typeId === 'USER') {
        setSelectionMode(true);
        setPendingSelectAll(true);
        const userRights = context.user?.metadata?.USER_RIGHTS || [];
        // Same feature-switch filter as the `transferTypes` memo below, applied
        // against the local context snapshot (launchContext state isn't set
        // yet), so a feature-disabled type never enters the selection set.
        const initiallySelected = TRANSFER_TYPES.filter(
          (t) =>
            isTypeFeatureEnabled(TYPE_KEY_TO_DOMO_TYPE[t.key], context) &&
            (!t.requiredAuthority || userRights.includes(t.requiredAuthority))
        ).map((t) => t.key);
        // Seed type keys only; leaves get added by the pendingSelectAll effect
        // once fetches resolve and we know what leaf IDs exist.
        setSelectedIds(new Set(initiallySelected));
      }
    } catch (error) {
      console.error('[OwnershipView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // Transfer types whose required feature switch is enabled on this instance
  // (fail-open: all of them while the switch list is unknown). Every body-level
  // iteration below uses this filtered list, so a feature-disabled type never
  // gets a fetch spec and never produces a row.
  const transferTypes = useMemo(
    () => TRANSFER_TYPES.filter((t) => isTypeFeatureEnabled(TYPE_KEY_TO_DOMO_TYPE[t.key], launchContext)),
    [launchContext]
  );

  // Specs for useParallelFetches. Stable identity required, so memoize on the
  // primary inputs and the hook doesn't loop on every render.
  const specs = useMemo(
    () =>
      userId
        ? transferTypes.map((t) => ({
            fetch: () => t.getOwned(userId, tabId),
            key: t.key,
            label: t.label
          }))
        : [],
    [userId, tabId, transferTypes]
  );

  const { errorCount, isFullyLoaded, loadingCount, refresh: refreshFetches, results } = useParallelFetches(specs);

  // Forbidden types: source user lacks the required authority. Calculated from
  // the toolkit user's USER_RIGHTS (the user running the extension), not the
  // source user being browsed. Matches the prior TransferOwnership semantics.
  const forbidden = useMemo(() => {
    const userRights = launchContext?.user?.metadata?.USER_RIGHTS || [];
    return new Set(
      transferTypes.filter((t) => t.requiredAuthority && !userRights.includes(t.requiredAuthority)).map((t) => t.key)
    );
  }, [launchContext, transferTypes]);

  const isUserSource = launchContext?.domoObject?.typeId === 'USER';

  // Aggregate stats for the subtext line
  const { loadedTypeCount, totalObjects } = useMemo(() => {
    let total = 0;
    let typeCount = 0;
    for (const t of transferTypes) {
      const r = results[t.key];
      if (r?.status === 'loaded' && r.items) {
        const c = countOwned(t.key, r.items);
        total += c;
        if (c > 0) typeCount++;
      }
    }
    return { loadedTypeCount: typeCount, totalObjects: total };
  }, [results, transferTypes]);

  const hasAnyTransferable = useMemo(
    () =>
      transferTypes.some((t) => {
        if (forbidden.has(t.key)) return false;
        const r = results[t.key];
        return r?.status === 'loaded' && r.items && countOwned(t.key, r.items) > 0;
      }),
    [forbidden, results, transferTypes]
  );

  // Every type the toolkit user can actually transfer right now (loaded, > 0
  // items, not forbidden). Recomputed when fetch results change so the "Select
  // all" toolbar button stays accurate as types finish loading.
  const eligibleTypeKeys = useMemo(
    () =>
      transferTypes
        .filter((t) => {
          if (forbidden.has(t.key)) return false;
          const r = results[t.key];
          return r?.status === 'loaded' && r.items && countOwned(t.key, r.items) > 0;
        })
        .map((t) => t.key),
    [forbidden, results, transferTypes]
  );

  // Auto-select pruner: `loadData` optimistically pre-selects every type the
  // toolkit user has authority for, so each row's checkbox shows up
  // pre-checked as its fetch resolves. Once all fetches settle, this effect
  // fires once to PRUNE any types that ended up not eligible (failed fetches
  // or empty results), so the bottom Select-all checkbox doesn't read as
  // indeterminate forever and an empty/failed type isn't silently included
  // in the transfer. We only REMOVE keys that aren't in `eligibleTypeKeys`,
  // never add keys back: that preserves any deselections the user made
  // during the loading phase.
  //
  // The `Object.keys(results).length === 0` guard handles a subtle race on
  // initial mount: when `userId` first becomes non-null, `specs` recomputes
  // to a non-empty array, but `useParallelFetches`'s effect hasn't yet run
  // its `setResults(buildInitial(specs))` for the new specs. So `results` is
  // still `{}`, `loadingCount` is 0, and `isFullyLoaded` reads true
  // vacuously. Without the guard, this effect would fire prematurely with
  // `eligibleTypeKeys = []`, prune everything, and clear `pendingSelectAll`,
  // leaving nothing selected when fetches actually finish.
  useEffect(() => {
    if (!pendingSelectAll) return;
    if (Object.keys(results).length === 0) return;

    // Incremental hydration: every time a type's fetch resolves, hydrate its
    // leaves into `selectedIds` (so individual checkboxes appear pre-checked
    // as soon as that type's data arrives) or prune the type key (if it
    // ended up non-eligible). Runs idempotently per type; already-hydrated
    // types are no-ops, so this can fire repeatedly as `results` updates
    // without thrashing state. The pendingSelectAll flag flips off only
    // after isFullyLoaded so the effect goes quiet for the rest of the
    // session once initial loading is done.
    setSelectedIds((prev) => {
      let changed = false;
      const next = new Set(prev);
      for (const t of transferTypes) {
        const r = results[t.key];
        if (r?.status !== 'loaded') continue;
        const items = r.items;
        const eligible = !forbidden.has(t.key) && items && countOwned(t.key, items) > 0;
        if (!eligible) {
          // Failed fetch, empty list, or forbidden authority: drop the
          // pre-selected type key so the toolbar Select-all settles to a
          // sane state once loading completes.
          if (next.has(t.key)) {
            next.delete(t.key);
            changed = true;
          }
          continue;
        }
        // Respect user deselections during loading: if the user unchecked
        // this type before it resolved, `handleSelectionChange` removed the
        // type key. Don't fight that; skip seeding its leaves.
        if (!next.has(t.key)) continue;
        for (const item of flattenOwned(t.key, items)) {
          const leafId = leafIdForItem(t.key, item);
          if (!next.has(leafId)) {
            next.add(leafId);
            changed = true;
          }
        }
      }
      return changed ? next : prev;
    });

    if (isFullyLoaded) setPendingSelectAll(false);
  }, [pendingSelectAll, isFullyLoaded, results, forbidden, transferTypes]);

  // Map<projectId, task[]> for the Projects & Tasks group. Drives two things:
  //   - `buildLeafItems` reads it to nest tasks under their parent project
  //     instead of rendering a flat project + task list.
  //   - `handleSelectionChange` reads it for project-tier propagation: when a
  //     project checkbox toggles, we cascade to every one of its tasks; when
  //     a task toggles, we reconcile its project's checkbox state.
  // Projects without owned tasks just don't appear in this map; their rows
  // render as flat leaves. Tasks whose projectId doesn't match any owned
  // project surface under a synthetic `null` key (defensive; shouldn't
  // happen given how getOwnedProjectsAndTasks fetches per-project, but we
  // handle it gracefully if Domo's behavior shifts).
  const tasksByProject = useMemo(() => {
    const map = new Map();
    const r = results['projectsAndTasks'];
    if (r?.status !== 'loaded' || !r.items) return map;
    for (const task of r.items.tasks || []) {
      const pid = task.projectId ?? null;
      if (!map.has(pid)) map.set(pid, []);
      map.get(pid).push(task);
    }
    return map;
  }, [results]);

  // Build DataList items, threading both fetch status and transfer status
  // (transfer state takes priority during the transfer phase).
  //
  // Constructed via `new DataListItem(...)` instead of `createGroup` because
  // `createGroup` falls back `count` to `children.length` when count is
  // undefined, which would force `(0)` to render during the loading phase
  // (children = [], so fallback = 0). We want the count slot to stay empty
  // until a real fetch result lands, and `(0)` to appear ONLY when a fetch
  // genuinely returns zero items.
  const dataListItems = useMemo(
    () =>
      transferTypes.map((t) => {
        const result = results[t.key];
        const xfer = transferStatus[t.key];
        const status = xfer?.status ?? result?.status ?? 'loading';

        let count;
        let error = null;
        let errorDetail = null;
        let children;

        if (result?.status === 'loaded' && result.items !== null) {
          count = countOwned(t.key, result.items);
          children = buildLeafItems(t.key, result.items, origin, tasksByProject);
        } else if (result?.status === 'error') {
          error = result.error;
        }

        if (xfer) {
          if (xfer.error) error = xfer.error;
          if (xfer.errorDetail) errorDetail = xfer.errorDetail;
          if (xfer.count !== undefined) count = xfer.count;
        }

        return new DataListItem({
          children,
          count,
          error,
          errorDetail,
          id: t.key,
          isVirtualParent: true,
          label: t.label,
          metadata: forbidden.has(t.key) ? `Requires ${t.requiredAuthority}` : undefined,
          status,
          // typeId drives the leading ObjectTypeIcon on the parent row. Falls
          // back to undefined for keys not in the map (e.g. projectsAndTasks,
          // which is intentionally null in TYPE_KEY_TO_DOMO_TYPE); DataList
          // skips the icon render in that case.
          typeId: TYPE_KEY_TO_DOMO_TYPE[t.key] || undefined,
          // Share-all is page-specific here: the only share service we use is
          // `sharePages`, and pages are the only type this view exposes
          // share-all for. Flag every other group `unshareable` so DataList's
          // hasShareableChildren returns false for them and the "Share all with
          // yourself" button renders only on the Pages group.
          unshareable: t.key !== 'pages'
        });
      }),
    [results, transferStatus, forbidden, origin, tasksByProject, transferTypes]
  );

  // Selection eligibility: applies to BOTH parent type rows and individual
  // leaf items. A parent is selectable when its type has loaded with > 0
  // items AND the toolkit user has the required authority. A leaf is
  // selectable iff its enclosing type is selectable; DataList enables a
  // checkbox on each leaf in selection mode so users can subset within a
  // type. The leaf's enclosing type is parsed off the namespaced leaf id.
  const isSelectable = useCallback(
    (item) => {
      if (item.isVirtualParent) {
        if (forbidden.has(item.id)) return false;
        const r = results[item.id];
        if (!r || r.status !== 'loaded' || !r.items) return false;
        return countOwned(item.id, r.items) > 0;
      }
      const typeKey = parseLeafTypeKey(item.id);
      if (!typeKey) return false;
      if (forbidden.has(typeKey)) return false;
      const r = results[typeKey];
      return r?.status === 'loaded' && !!r.items && countOwned(typeKey, r.items) > 0;
    },
    [forbidden, results]
  );

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  // Parent↔child propagation, same pattern as MigrateDownstreamContentView,
  // plus a project-tier pass for the nested Projects & Tasks tree.
  // CheckboxGroup hands back the full new Set; we diff against the previous
  // selection to detect which row toggled, then:
  //   - type-parent toggled (e.g. 'projectsAndTasks')         → cascade to ALL its leaves
  //   - project toggled    (e.g. 'projectsAndTasks:project-X') → cascade to its tasks only
  //   - task toggled       (e.g. 'projectsAndTasks:task-Y')    → reconcile its parent project
  //   - any leaf toggled                                      → reconcile its type-parent
  // The order matters: cascade downward first, then reconcile upward.
  const handleSelectionChange = useCallback(
    (incoming) => {
      const prev = selectedIds;
      const added = [...incoming].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !incoming.has(id));

      const next = new Set(incoming);

      const propagateParent = (typeKey, isAdding) => {
        const r = results[typeKey];
        if (r?.status !== 'loaded' || !r.items) return;
        for (const item of flattenOwned(typeKey, r.items)) {
          const leafId = leafIdForItem(typeKey, item);
          if (isAdding) next.add(leafId);
          else next.delete(leafId);
        }
      };

      // Project-tier cascade: toggling a project row's checkbox mirrors the
      // change onto every one of its tasks. tasksByProject keys are numeric
      // (matching the API), so coerce here.
      const propagateProject = (projectId, isAdding) => {
        const tasks = tasksByProject.get(projectId) || [];
        for (const task of tasks) {
          const leafId = leafIdForItem('projectsAndTasks', { ...task, subType: 'Task' });
          if (isAdding) next.add(leafId);
          else next.delete(leafId);
        }
      };

      // Project-tier reconcile: a project's checkbox is "in" iff every one
      // of its tasks is in the selection set. With no tasks, the project's
      // membership is determined only by its own toggle (no reconcile).
      const reconcileTaskProject = (projectId) => {
        const tasks = tasksByProject.get(projectId) || [];
        if (tasks.length === 0) return;
        const allSelected = tasks.every((t) => next.has(leafIdForItem('projectsAndTasks', { ...t, subType: 'Task' })));
        const projectLeafId = `projectsAndTasks:project-${projectId}`;
        if (allSelected) next.add(projectLeafId);
        else next.delete(projectLeafId);
      };

      const reconcileLeafParent = (typeKey) => {
        const r = results[typeKey];
        if (r?.status !== 'loaded' || !r.items) return;
        const items = flattenOwned(typeKey, r.items);
        if (items.length === 0) return;
        const allSelected = items.every((item) => next.has(leafIdForItem(typeKey, item)));
        if (allSelected) next.add(typeKey);
        else next.delete(typeKey);
      };

      // Cascade downward: type-parent → leaves, project → tasks.
      for (const id of added) {
        if (isParentKey(id)) propagateParent(id, true);
        const projectId = parseProjectIdFromLeaf(id);
        if (projectId !== null) propagateProject(projectId, true);
      }
      for (const id of removed) {
        if (isParentKey(id)) propagateParent(id, false);
        const projectId = parseProjectIdFromLeaf(id);
        if (projectId !== null) propagateProject(projectId, false);
      }

      // Reconcile upward: tasks → their parent project. Collect the set of
      // project IDs touched by any task toggle, then reconcile each one
      // exactly once (avoids double work when several tasks under the same
      // project toggle together).
      const touchedProjects = new Set();
      for (const id of [...added, ...removed]) {
        const taskId = parseTaskIdFromLeaf(id);
        if (taskId === null) continue;
        for (const [pid, tasks] of tasksByProject) {
          if (tasks.some((t) => t.id === taskId)) {
            touchedProjects.add(pid);
            break;
          }
        }
      }
      for (const projectId of touchedProjects) reconcileTaskProject(projectId);

      // Reconcile upward: leaves → type-parent. Uses the flat owned list,
      // which already includes projects + tasks for the projectsAndTasks
      // case, so the membership check still treats every leaf equally.
      const touchedTypes = new Set();
      for (const id of [...added, ...removed]) {
        const typeKey = parseLeafTypeKey(id);
        if (typeKey) touchedTypes.add(typeKey);
      }
      for (const typeKey of touchedTypes) reconcileLeafParent(typeKey);

      setSelectedIds(next);
    },
    [results, selectedIds, tasksByProject]
  );

  // Selected leaf items grouped by type: drives the per-row count badge,
  // the subtext "X objects selected" line, the modal's selectedObjectCount
  // and selectedTypeCount summary, and the orchestrator's `enabledItemIds`
  // filter. Recomputed whenever the selection set or fetch results change.
  const selectedItemsByType = useMemo(() => {
    const acc = {};
    for (const t of transferTypes) {
      acc[t.key] = [];
      const r = results[t.key];
      if (r?.status !== 'loaded' || !r.items) continue;
      for (const item of flattenOwned(t.key, r.items)) {
        if (selectedIds.has(leafIdForItem(t.key, item))) acc[t.key].push(item);
      }
    }
    return acc;
  }, [results, selectedIds, transferTypes]);

  const selectedTypeCount = useMemo(
    () => Object.values(selectedItemsByType).filter((items) => items.length > 0).length,
    [selectedItemsByType]
  );

  const selectedObjectCount = useMemo(
    () => Object.values(selectedItemsByType).reduce((sum, items) => sum + items.length, 0),
    [selectedItemsByType]
  );

  // Denominator for the toolbar Select-all checkbox (and the subtext). Counts
  // every leaf across types the user has authority for AND that loaded with
  // > 0 items. Forbidden / failed / empty types don't contribute, so the
  // Select-all reads as "checked" once every reachable leaf is selected.
  const totalEligibleObjects = useMemo(() => {
    let total = 0;
    for (const typeKey of eligibleTypeKeys) {
      const r = results[typeKey];
      if (r?.status === 'loaded' && r.items) total += countOwned(typeKey, r.items);
    }
    return total;
  }, [eligibleTypeKeys, results]);

  // The footer Transfer button only renders inside selection mode (and the
  // selection-toggle header action seeds `selectedIds` with every eligible
  // type when first entered), so the prior "auto-engage selection mode if
  // nothing's selected" fallback can't trigger from here anymore; this is
  // just an open-the-modal handler now.
  const handleOpenTransferModal = useCallback(() => {
    setTransferModalOpen(true);
  }, []);

  // Select-all / Clear handlers used by the toolbar Checkbox. The Checkbox
  // itself derives its visual state (indeterminate vs. checked) from the
  // eligible/selected counts; these handlers are pure state mutators.
  // Select-all seeds both the type-level rows AND every leaf under each
  // eligible type, so individual checkboxes in expanded groups also light up.
  const selectAllEligible = useCallback(() => {
    const next = new Set();
    for (const typeKey of eligibleTypeKeys) {
      next.add(typeKey);
      const r = results[typeKey];
      if (r?.status !== 'loaded' || !r.items) continue;
      for (const item of flattenOwned(typeKey, r.items)) {
        next.add(leafIdForItem(typeKey, item));
      }
    }
    setSelectedIds(next);
  }, [eligibleTypeKeys, results]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Share-all handler for the Pages group. Mirrors GetPagesView's
  // share-with-yourself flow via `sharePages`, scoped to pages (every other
  // group is flagged `unshareable` in dataListItems, so DataList never renders
  // the button on them). The recipient is the toolkit user running the
  // extension (launchContext.user, i.e. yourself), not the source user whose
  // owned objects are being browsed.
  const handleItemShareAll = useCallback(
    async (actionType, item) => {
      if (item.id !== 'pages' || !item.children?.length) return;
      try {
        // Leaf React ids are namespaced (`pages:<id>`); the canonical page id
        // lives on `originalId`. Drop any synthetic/negative ids defensively.
        const pageIds = item.children.map((child) => child.originalId ?? child.id).filter((id) => Number(id) >= 0);
        if (!pageIds.length) return;
        await sharePages({ pageIds, tabId, userId: launchContext?.user?.id });
        showStatus(
          'Shared',
          `**${pageIds.length}** page${pageIds.length !== 1 ? 's' : ''} shared with yourself`,
          'success',
          2000
        );
      } catch (err) {
        console.error('[OwnershipView] Error in shareAll action:', err);
        showStatus('Error', err.message || 'Failed to share', 'danger', 3000);
      }
    },
    [launchContext, showStatus, tabId]
  );

  // Submit handler invoked by the modal. Runs transferAllOwnership, threading
  // per-type progress into transferStatus (which feeds DataList rows). Then
  // optionally emails the new owner and deletes the source user. Errors per
  // type surface inside the row's expanded body via `status: 'failed'` + error
  // message, same UX as the old TransferOwnership view's failure-disclosure.
  const handleTransferSubmit = useCallback(
    async (formData) => {
      const { currentUser, deleteAfterTransfer, emailCurrentUser, emailNewOwner, targetUser, toUserDisplayName, toUserId } =
        formData;

      // A type is "enabled for transfer" iff at least one of its leaves is
      // selected; bare type-key membership in `selectedIds` isn't sufficient
      // any more (the user could have toggled the parent off but kept some
      // leaves on). `enabledItemIds` is the leaf-id allow-list passed to the
      // orchestrator's filterOwnedToSelection step.
      const enabledTypes = new Set();
      const enabledItemIds = new Map();
      for (const t of transferTypes) {
        const items = selectedItemsByType[t.key];
        if (!items || items.length === 0) continue;
        enabledTypes.add(t.key);
        const idSet = new Set();
        for (const item of items) {
          // For projectsAndTasks, the orchestrator filter matches by
          // `project-<id>` / `task-<id>` composites (preserves the
          // {projects, tasks} shape). For other types, it matches by raw
          // stringified item id.
          if (t.key === 'projectsAndTasks') {
            const prefix = item.subType === 'Task' ? 'task' : 'project';
            idSet.add(`${prefix}-${item.id}`);
          } else {
            idSet.add(String(item.id));
          }
        }
        enabledItemIds.set(t.key, idSet);
      }
      // Snapshot owned data per type, passed to transferAllOwnership so it
      // doesn't refetch the types we already have. Types with
      // getOwnedForTransfer still re-fetch via that variant inside the
      // orchestrator.
      const seededOwnedObjects = {};
      for (const key of enabledTypes) {
        const r = results[key];
        if (r?.status === 'loaded') seededOwnedObjects[key] = r.items;
      }

      // Initialize transferStatus rows with the count of SELECTED leaves
      // (not the total fetched), so the spinner row reads "transferring N"
      // where N matches what the user actually picked.
      const initialStatus = {};
      for (const key of enabledTypes) {
        initialStatus[key] = {
          count: selectedItemsByType[key].length,
          status: 'transferring'
        };
      }
      setTransferStatus(initialStatus);
      setIsTransferring(true);

      try {
        const transferResults = await transferAllOwnership({
          enabledItemIds,
          enabledTypes,
          fromUserId: userId,
          onTypeProgress: ({ count, result, status, typeKey }) => {
            if (!mountedRef.current) return;
            setTransferStatus((prev) => {
              const next = { ...prev };
              if (status === 'listing') {
                next[typeKey] = { count: count ?? 0, status: 'transferring' };
              } else if (status === 'transferring') {
                next[typeKey] = { count, status: 'transferring' };
              } else if (status === 'done') {
                const failed = result?.failed ?? 0;
                const succeeded = result?.succeeded ?? 0;
                next[typeKey] = {
                  count: count ?? succeeded + failed,
                  error: failed > 0 ? formatTransferErrors(result) : null,
                  errorDetail: failed > 0 ? (result?.errors ?? null) : null,
                  failed,
                  status: failed > 0 ? 'failed' : 'transferred',
                  succeeded
                };
              } else if (status === 'error') {
                next[typeKey] = {
                  count: 0,
                  error: result?.errors?.[0]?.error || 'Transfer failed before completing',
                  errorDetail: result?.errors ?? result ?? null,
                  status: 'failed'
                };
              }
              return next;
            });
          },
          seededOwnedObjects,
          tabId,
          toUserId
        });

        let totalSucceeded = 0;
        let totalFailed = 0;
        for (const [, r] of transferResults) {
          totalSucceeded += r.succeeded || 0;
          totalFailed += r.failed || 0;
        }

        // Optional: email an Excel summary. The new-owner and email-me toggles
        // are independent, but we only ever send a single email whose recipient
        // list is the union of whichever toggles are on (deduped so a self-
        // transfer doesn't double-list the same address).
        const recipientEmails = [
          ...new Set(
            [emailNewOwner ? targetUser?.email : null, emailCurrentUser ? currentUser?.email : null].filter(Boolean)
          )
        ];
        if (recipientEmails.length > 0 && totalSucceeded > 0) {
          try {
            const rows = buildTransferLogRows({
              fromUserId: userId,
              fromUserName: userName,
              results: transferResults,
              toUserId,
              toUserName: toUserDisplayName ?? targetUser?.displayName
            });
            const blob = await buildExcelBlob(rows, LOG_COLUMNS, 'Transfer Log');
            const filename = `${generateExportFilename('transferred-objects')}.xlsx`;
            const dataFileId = await uploadDataFile(blob, filename, XLSX_MIME_TYPE, tabId);
            await sendEmail(
              {
                bodyHtml: renderEmailBody({
                  sourceUserName: userName,
                  totalFailed,
                  totalSucceeded
                }),
                dataFileAttachments: [dataFileId],
                recipientEmails,
                subject: `Ownership transferred to you from ${userName}`
              },
              tabId
            );
          } catch (err) {
            showStatus('Email Not Sent', err.message || 'Failed to email transfer summary', 'warning', 5000);
          }
        }

        // Optional: delete the source user once everything succeeded.
        if (totalFailed === 0 && deleteAfterTransfer) {
          try {
            await deleteUser(userId, tabId);
            showStatus(
              'Transfer Complete',
              `Transferred **${totalSucceeded}** object${totalSucceeded !== 1 ? 's' : ''} and deleted user **${userName}**`,
              'success',
              7000
            );
            setTimeout(() => onBackToDefault?.(), 3000);
          } catch (error) {
            showStatus(
              'Transfer Complete (Delete Failed)',
              `Transferred **${totalSucceeded}** object${totalSucceeded !== 1 ? 's' : ''} but failed to delete user: ${error.message}`,
              'warning',
              7000
            );
          }
        } else if (totalFailed > 0) {
          showStatus(
            'Transfer Partially Complete',
            `**${totalSucceeded}** succeeded, **${totalFailed}** failed`,
            'warning',
            7000
          );
        } else {
          showStatus(
            'Transfer Complete',
            `Transferred **${totalSucceeded}** object${totalSucceeded !== 1 ? 's' : ''}`,
            'success',
            7000
          );
        }
      } catch (err) {
        showStatus('Transfer Failed', err.message || 'An error occurred', 'danger', 7000);
      } finally {
        if (mountedRef.current) {
          setIsTransferring(false);
          // After transfer settles, drop selection mode so the view returns to
          // browse state. Selection set is cleared too so the next transfer
          // starts fresh.
          setSelectionMode(false);
          setSelectedIds(new Set());
        }
      }
    },
    [onBackToDefault, results, selectedItemsByType, showStatus, tabId, transferTypes, userId, userName]
  );

  const subtextNode = useMemo(() => {
    if (isTransferring) {
      const inFlight = Object.values(transferStatus).filter((x) => x.status === 'transferring').length;
      const done = Object.values(transferStatus).filter((x) => x.status === 'transferred' || x.status === 'failed').length;
      const total = inFlight + done;
      return `Transferring… **${done}**/${total}`;
    }
    if (selectionMode) {
      // Per-leaf counts come from `selectedItemsByType`, already filtered
      // to types that are loaded AND have authority, so the displayed
      // numbers track what the rows actually show. Falls back gracefully
      // during the autoEnableSelectionMode launch (when fetches haven't
      // resolved yet): both counts read 0 until items arrive, then ramp up
      // as each type's checkboxes hydrate.
      const typeWord = selectedTypeCount === 1 ? 'type' : 'types';
      const objectWord = selectedObjectCount === 1 ? 'object' : 'objects';
      return `**${selectedTypeCount}** ${typeWord}, **${selectedObjectCount}** ${objectWord} selected`;
    }
    if (!isFullyLoaded) {
      return `Searching… (${transferTypes.length - loadingCount}/${transferTypes.length} types)`;
    }
    const objectWord = totalObjects === 1 ? 'object' : 'objects';
    const typeWord = loadedTypeCount === 1 ? 'type' : 'types';
    let text = `**${totalObjects}** ${objectWord} across **${loadedTypeCount}** ${typeWord}`;
    if (errorCount > 0) {
      text += ` (${errorCount} failed)`;
    }
    return text;
  }, [
    errorCount,
    isFullyLoaded,
    isTransferring,
    loadedTypeCount,
    loadingCount,
    selectedObjectCount,
    selectedTypeCount,
    selectionMode,
    totalObjects,
    transferStatus,
    transferTypes
  ]);

  const customHeaderActions = useMemo(() => {
    const actions = [];
    if (isUserSource) {
      // Transfer action moved out of the header; it now lives as a full-width
      // Button in the DataList footer slot, only visible when selection mode is
      // engaged. The selection toggle stays in the header so users can enter
      // selection mode (which reveals the footer button) without committing to
      // a destination yet.
      actions.push({
        icon: <IconFormatListChecks />,
        isActive: selectionMode,
        isDisabled: !isFullyLoaded || !hasAnyTransferable || isTransferring,
        key: 'selection',
        onPress: () => {
          if (selectionMode) {
            exitSelectionMode();
          } else {
            // Mirror the TransferOwnership launch path: entering selection mode
            // pre-selects every eligible type AND every leaf under each type.
            // User can deselect either at the type level (cascades to all its
            // leaves) or per-leaf inside an expanded group.
            selectAllEligible();
            setSelectionMode(true);
          }
        },
        tooltipText: selectionMode ? 'Exit selection mode' : 'Select types to transfer'
      });
    }
    return actions;
  }, [exitSelectionMode, hasAnyTransferable, isFullyLoaded, isTransferring, isUserSource, selectAllEligible, selectionMode]);

  // Toolbar rendered just under the header action row when selection mode is
  // engaged. The "Select all" Checkbox shows three states:
  //   - unchecked: no eligible types are selected
  //   - indeterminate: some (but not all) eligible types are selected
  //   - checked: every eligible type is selected
  // It lives outside the per-row CheckboxGroup (rendered by DataList around
  // the items list) so we control its visual state directly via
  // `isIndeterminate` / `isSelected` instead of letting the group derive it.
  // This mirrors the HeroUI v3 docs' "Indeterminate" pattern, where the
  // select-all sits as a sibling of the inner CheckboxGroup. See DataList's
  // `selectionToolbar` prop.
  const selectionToolbar = useMemo(() => {
    if (!selectionMode) return null;
    // Two phases:
    //   1. While hydration is in flight (`pendingSelectAll || !isFullyLoaded`),
    //      the auto-pre-select effect is racing the fetches. The gate
    //      stays ON until the hydration effect has both seen `isFullyLoaded`
    //      true AND finished adding leaves for the last type, which is what
    //      flipping `pendingSelectAll` to false signals. If we only gated on
    //      `!isFullyLoaded`, the handoff frame between "last type loaded"
    //      and "hydration effect runs" would briefly evaluate normally with
    //      stale `selectedIds`, flashing the dash icon once. Holding the
    //      pinned visual until `pendingSelectAll` clears closes that gap.
    //   2. After hydration settles: normal evaluation. The toolbar goes
    //      indeterminate the moment the user deselects any single leaf
    //      inside an otherwise fully-selected type.
    const isHydrating = pendingSelectAll || !isFullyLoaded;
    return (
      <Checkbox
        aria-label='Select all eligible objects'
        isDisabled={isHydrating || totalEligibleObjects === 0 || isTransferring}
        isIndeterminate={!isHydrating && selectedObjectCount > 0 && selectedObjectCount < totalEligibleObjects}
        isSelected={isHydrating || (totalEligibleObjects > 0 && selectedObjectCount === totalEligibleObjects)}
        onChange={(isSelected) => {
          if (isSelected) selectAllEligible();
          else clearSelection();
        }}
      >
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Checkbox.Content>
          <Label>Select all</Label>
        </Checkbox.Content>
      </Checkbox>
    );
  }, [
    clearSelection,
    isFullyLoaded,
    isTransferring,
    pendingSelectAll,
    selectAllEligible,
    selectedObjectCount,
    selectionMode,
    totalEligibleObjects
  ]);

  // Full-width Transfer button pinned to the bottom of the Card when selection
  // mode is engaged. Replaces the header's transfer action so the primary CTA
  // sits where the user's attention finishes after scrolling through type
  // checkboxes. Now keyed on the leaf-level selected object count rather than
  // a type-level tally; the user can transfer as long as ≥1 individual
  // object is checked, even if no full type is selected.
  const selectionFooter = useMemo(() => {
    if (!selectionMode) return null;
    return (
      <Button
        fullWidth
        isDisabled={selectedObjectCount === 0 || isTransferring || !isFullyLoaded || !hasAnyTransferable}
        size='sm'
        variant='primary'
        onPress={handleOpenTransferModal}
      >
        <IconArrowsHorizontalBox />
        Transfer ownership to…
      </Button>
    );
  }, [handleOpenTransferModal, hasAnyTransferable, isFullyLoaded, isTransferring, selectedObjectCount, selectionMode]);

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
        beta
        currentContext={currentContext}
        customHeaderActions={customHeaderActions}
        feature='Objects Owned by'
        featureIcon={<IconListBulleted />}
        footer={selectionFooter}
        headerActions={['reload', 'refresh']}
        isRefreshing={loadingCount > 0}
        isSelectable={isSelectable}
        itemActions={['copy']}
        itemLabel='object'
        items={dataListItems}
        objectId={userId}
        objectType='USER'
        selectedIds={selectedIds}
        selectionMode={selectionMode}
        selectionToolbar={selectionToolbar}
        showActions={true}
        showCounts={true}
        subject={userName}
        subtext={subtextNode}
        viewType='ownership'
        onClose={onBackToDefault}
        onItemShareAll={handleItemShareAll}
        onRefresh={refreshFetches}
        onSelectionChange={handleSelectionChange}
        onStatusUpdate={onStatusUpdate}
      />
      <TransferOwnershipModal
        currentContext={launchContext}
        isOpen={transferModalOpen && isActive}
        selectedObjectCount={selectedObjectCount}
        selectedTypeCount={selectedTypeCount}
        sourceUser={{ id: userId, name: userName }}
        onOpenChange={setTransferModalOpen}
        onSubmit={handleTransferSubmit}
      />
    </>
  );
}

/**
 * Convert raw owned data per type into DataListItem leaf children.
 * For projectsAndTasks, project and task IDs come from independent namespaces
 * and can collide, so we namespace the React-key id (`project-<id>` /
 * `task-<id>`) and stash the canonical id in `originalId` so Copy-ID still
 * yields the unmodified value.
 */
function buildLeafItems(typeKey, owned, origin, tasksByProject) {
  // projectsAndTasks gets its own tree-style builder so tasks nest under
  // their parent project instead of rendering as siblings. Selection IDs
  // stay namespaced as `projectsAndTasks:project-<id>` /
  // `projectsAndTasks:task-<id>` so the orchestrator's existing per-leaf
  // filter (`filterOwnedToSelection`) works without any changes; only
  // the UI shape changes here.
  if (typeKey === 'projectsAndTasks') {
    return buildProjectsAndTasksItems(owned, tasksByProject, origin);
  }

  const flat = flattenOwned(typeKey, owned);
  return flat.map((item) => {
    // Leaf React IDs are namespaced as `${typeKey}:<suffix>` so the
    // CheckboxGroup value set can hold leaves from every type without
    // collisions (a dataset 123 and a card 123 would otherwise share an ID).
    // `originalId` keeps the canonical item id available for the row's
    // Copy-ID action so the user always sees the un-namespaced value.
    // The `functions` category returns Beast Modes and Variables together; the
    // per-item `global` flag (true only for Variables) is the only thing that
    // distinguishes them, so resolve the leaf type per item rather than using
    // the category default.
    const domoTypeId = typeKey === 'functions' && item.global ? 'VARIABLE' : TYPE_KEY_TO_DOMO_TYPE[typeKey];
    let url = null;
    if (domoTypeId) {
      try {
        url = new DomoObject(domoTypeId, item.id, origin, { name: item.name }, null, item.queueId || item.parentId || null)
          .url;
      } catch {
        url = null;
      }
    }

    return new DataListItem({
      id: leafIdForItem(typeKey, item),
      label: item.name || String(item.id),
      originalId: item.id,
      typeId: domoTypeId,
      url
    });
  });
}

/**
 * Build the nested Projects-and-Tasks tree. Returns:
 *   - one DataListItem per owned project (with its tasks as children, or
 *     no `children` prop if the project has no owned tasks → renders as a
 *     flat selectable leaf without a chevron)
 *   - one DataListItem per orphan task (task whose projectId didn't match
 *     any owned project; shouldn't happen in practice given the per-
 *     project fetch in services/projects.js, but surfaces them at the
 *     project level as a defensive fallback)
 *
 * Both projects and tasks use composite IDs (`project-<id>` / `task-<id>`)
 * for selection, so the orchestrator's per-leaf filter handles them
 * without modification. URLs are built via DomoObject against the
 * canonical PROJECT and PROJECT_TASK types (urlPath: `/project/{id}`
 * and `/project?taskId={id}` respectively) so each row in the tree is
 * clickable straight to the corresponding Domo page. The Task type's
 * URL doesn't use {parent}, but we still pass `task.projectId` through
 * for forward-compat with any future URL template change.
 */
function buildProjectsAndTasksItems(owned, tasksByProject, origin) {
  const buildProjectUrl = (project) => {
    if (!origin) return null;
    try {
      return new DomoObject('PROJECT', project.id, origin, { name: project.name }).url;
    } catch {
      return null;
    }
  };

  const buildTaskItem = (task) => {
    let url = null;
    if (origin) {
      try {
        url = new DomoObject('PROJECT_TASK', task.id, origin, { name: task.name }, null, task.projectId ?? null).url;
      } catch {
        url = null;
      }
    }
    return new DataListItem({
      id: leafIdForItem('projectsAndTasks', { ...task, subType: 'Task' }),
      label: task.name || task.taskName || String(task.id),
      originalId: task.id,
      typeId: 'PROJECT_TASK',
      url
    });
  };

  const projects = owned?.projects || [];
  const matched = new Set();

  const projectItems = projects.map((project) => {
    const projectTasks = tasksByProject?.get(project.id) || [];
    matched.add(project.id);
    const taskChildren = projectTasks.map(buildTaskItem);
    return new DataListItem({
      children: taskChildren.length > 0 ? taskChildren : undefined,
      id: leafIdForItem('projectsAndTasks', { ...project, subType: 'Project' }),
      label: project.name || String(project.id),
      originalId: project.id,
      typeId: 'PROJECT',
      url: buildProjectUrl(project)
    });
  });

  // Orphan tasks: any task whose projectId didn't resolve to an owned
  // project. Render at the project level so they're still selectable AND
  // still get their direct Task URL.
  const orphanTasks = [];
  if (tasksByProject) {
    for (const [pid, tasks] of tasksByProject) {
      if (matched.has(pid)) continue;
      for (const task of tasks) {
        orphanTasks.push(buildTaskItem(task));
      }
    }
  }

  return [...projectItems, ...orphanTasks];
}

function buildTransferLogRows({ fromUserId, fromUserName, results, toUserId, toUserName }) {
  const date = new Date().toISOString().slice(0, -5);
  const rows = [];
  for (const [typeKey, result] of results) {
    const typeDef = TRANSFER_TYPES.find((t) => t.key === typeKey);
    const logType = TYPE_KEY_TO_LOG_TYPE[typeKey];
    const failedById = new Map((result.errors || []).map((e) => [e.id, e.error]));
    // `{id: 'all'}` sentinel means the whole batch failed; every row in this
    // type should be marked FAILED with the shared error message.
    const wholeBatchError = failedById.get('all');
    for (const item of result.attempted ?? []) {
      const isFailure = wholeBatchError !== undefined || failedById.has(item.id);
      // The `functions` category mixes Beast Modes and Variables; the per-item
      // `global` flag (true only for Variables) overrides the category log type
      // so the audit row reports the correct object type.
      const itemLogType = typeKey === 'functions' && item.global ? 'VARIABLE' : logType;
      rows.push({
        'Date': date,
        'New Owner ID': toUserId,
        'New Owner Name': toUserName,
        'Notes': isFailure ? (wholeBatchError ?? failedById.get(item.id)) : '',
        'Object ID': item.id,
        'Object Name': item.name,
        'Object Type': item.subType ? item.subType.toUpperCase() : (itemLogType ?? typeDef?.label ?? typeKey),
        'Previous Owner ID': fromUserId,
        'Previous Owner Name': fromUserName,
        'Status': isFailure ? 'FAILED' : 'TRANSFERRED'
      });
    }
  }
  return rows;
}

function formatTransferErrors(result) {
  if (!result?.errors?.length) return null;
  const wholeBatch = result.errors.find((e) => e.id === 'all');
  if (wholeBatch) return wholeBatch.error;
  if (result.errors.length === 1) {
    return `${result.errors[0].id}: ${result.errors[0].error}`;
  }
  // List every failure in full (one per line). The DataList error Alert renders
  // this untruncated and offers a copy button for the raw JSON, so there's no
  // reason to collapse to just the first error any more.
  const header = `${result.errors.length} items failed:`;
  const lines = result.errors.map((e) => `${e.id}: ${e.error}`);
  return [header, ...lines].join('\n');
}

function isParentKey(id) {
  return typeof id === 'string' && TRANSFER_TYPES.some((t) => t.key === id);
}

/**
 * Build the namespaced selection ID for a given owned item. Matches the `id`
 * that `buildLeafItems` puts on each leaf DataListItem so the CheckboxGroup
 * value set lines up with what the DataList renders.
 *
 * For projectsAndTasks: leaves carry composite React IDs (`project-<id>` /
 * `task-<id>`) because project and task ID namespaces can collide. The leaf
 * selection ID wraps that composite under the type key.
 *
 * For other types: the canonical item id (stringified) wrapped under the
 * type key. Stringification matters because Domo's owned-objects responses
 * mix numeric and string ids across types.
 */
function leafIdForItem(typeKey, item) {
  if (typeKey === 'projectsAndTasks') {
    const prefix = item.subType === 'Task' ? 'task' : 'project';
    return `${typeKey}:${prefix}-${item.id}`;
  }
  return `${typeKey}:${item.id}`;
}

function parseLeafTypeKey(id) {
  if (typeof id !== 'string') return null;
  const idx = id.indexOf(':');
  if (idx === -1) return null;
  const candidate = id.slice(0, idx);
  return TRANSFER_TYPES.some((t) => t.key === candidate) ? candidate : null;
}

/**
 * Extract the numeric project ID from a `projectsAndTasks:project-<id>`
 * selection ID, or null if the input doesn't match. Used by the project-
 * tier cascade in handleSelectionChange. Returns a number (matching the
 * API's numeric projectId on tasks) so the tasksByProject Map lookup
 * compares keys consistently.
 */
function parseProjectIdFromLeaf(id) {
  if (typeof id !== 'string') return null;
  const match = /^projectsAndTasks:project-(.+)$/.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Extract the numeric task ID from a `projectsAndTasks:task-<id>` selection
 * ID, or null if the input doesn't match. Used by the project-tier
 * reconcile pass in handleSelectionChange to find which project a toggled
 * task belongs to (so we can re-check the project's checkbox state).
 */
function parseTaskIdFromLeaf(id) {
  if (typeof id !== 'string') return null;
  const match = /^projectsAndTasks:task-(.+)$/.exec(id);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function renderEmailBody({ sourceUserName, totalFailed, totalSucceeded }) {
  const objectWord = totalSucceeded === 1 ? 'object' : 'objects';
  const failedLine =
    totalFailed > 0
      ? `<p>${totalFailed} object${totalFailed === 1 ? '' : 's'} could not be transferred and ${totalFailed === 1 ? 'is' : 'are'} included in the attachment with a FAILED status.</p>`
      : '';
  return `<p>Ownership of <strong>${totalSucceeded}</strong> ${objectWord} has been transferred to you from <strong>${sourceUserName}</strong>.</p><p>A complete list is attached.</p>${failedLine}`;
}
