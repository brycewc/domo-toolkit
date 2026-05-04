import { Card, Spinner } from '@heroui/react';
import { IconChecks, IconUserUp } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { DataList, TransferOwnershipModal } from '@/components';
import { useParallelFetches, useStatusBar } from '@/hooks';
import { DataListItem, DomoContext, DomoObject } from '@/models';
import {
  countOwned,
  deleteUser,
  flattenOwned,
  sendEmail,
  TRANSFER_TYPES,
  transferAllOwnership,
  TYPE_KEY_TO_LOG_TYPE,
  uploadDataFile
} from '@/services';
import {
  buildExcelBlob,
  generateExportFilename,
  getSidepanelData
} from '@/utils';

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

const XLSX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/**
 * Maps TRANSFER_TYPES keys to DomoObjectType IDs for URL construction.
 * Types mapped to null render leaf items without a navigable link.
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
  goals: null,
  groups: 'GROUP',
  jupyterWorkspaces: 'DATA_SCIENCE_NOTEBOOK',
  metrics: null,
  pages: 'PAGE',
  projectsAndTasks: null,
  repositories: 'REPOSITORY',
  subscriptions: null,
  taskCenterQueues: 'HOPPER_QUEUE',
  taskCenterTasks: null,
  workflows: 'WORKFLOW_MODEL',
  worksheets: 'WORKSHEET',
  workspaces: 'WORKSPACE'
};

export function OwnershipView({ onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [userName, setUserName] = useState('');
  const [userId, setUserId] = useState(null);
  const [tabId, setTabId] = useState(null);
  const [origin, setOrigin] = useState('');
  const [currentContext, setCurrentContext] = useState(null);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedTypeKeys, setSelectedTypeKeys] = useState(() => new Set());
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
      if (!data || data.type !== 'ownership') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext
        ? DomoContext.fromJSON(data.currentContext)
        : null;
      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }

      const uid = context.domoObject?.id;
      const name =
        context.domoObject?.metadata?.name ||
        context.domoObject?.metadata?.displayName ||
        `User ${uid}`;
      const baseUrl = context.domoObject?.baseUrl || '';

      setUserId(uid);
      setUserName(name);
      setOrigin(baseUrl);
      setTabId(context.tabId);
      setCurrentContext(context);

      // Transfer Ownership action button passes `autoOpenTransferModal: true`
      // so the modal pops open as soon as fetches start. Selection mode also
      // auto-engages; the modal's submit handler auto-selects all eligible
      // types if the user submits without picking specifics.
      if (data.autoOpenTransferModal && context.domoObject?.typeId === 'USER') {
        setSelectionMode(true);
        setTransferModalOpen(true);
      }
    } catch (error) {
      console.error('[OwnershipView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // Specs for useParallelFetches. Stable identity required — memoize on the
  // primary inputs so the hook doesn't loop on every render.
  const specs = useMemo(
    () =>
      userId
        ? TRANSFER_TYPES.map((t) => ({
            fetch: () => t.getOwned(userId, tabId),
            key: t.key,
            label: t.label
          }))
        : [],
    [userId, tabId]
  );

  const {
    errorCount,
    isFullyLoaded,
    loadingCount,
    refresh: refreshFetches,
    results
  } = useParallelFetches(specs);

  // Forbidden types: source user lacks the required authority. Calculated from
  // the toolkit user's USER_RIGHTS (the user running the extension), not the
  // source user being browsed. Matches the prior TransferOwnership semantics.
  const forbidden = useMemo(() => {
    const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
    return new Set(
      TRANSFER_TYPES.filter(
        (t) => t.requiredAuthority && !userRights.includes(t.requiredAuthority)
      ).map((t) => t.key)
    );
  }, [currentContext]);

  const isUserSource = currentContext?.domoObject?.typeId === 'USER';

  // Aggregate stats for the subtext line
  const { loadedTypeCount, totalObjects } = useMemo(() => {
    let total = 0;
    let typeCount = 0;
    for (const t of TRANSFER_TYPES) {
      const r = results[t.key];
      if (r?.status === 'loaded' && r.items) {
        const c = countOwned(t.key, r.items);
        total += c;
        if (c > 0) typeCount++;
      }
    }
    return { loadedTypeCount: typeCount, totalObjects: total };
  }, [results]);

  const hasAnyTransferable = useMemo(
    () =>
      TRANSFER_TYPES.some((t) => {
        if (forbidden.has(t.key)) return false;
        const r = results[t.key];
        return r?.status === 'loaded' && r.items && countOwned(t.key, r.items) > 0;
      }),
    [forbidden, results]
  );

  // Build DataList items, threading both fetch status and transfer status
  // (transfer state takes priority during the transfer phase).
  const dataListItems = useMemo(
    () =>
      TRANSFER_TYPES.map((t) => {
        const result = results[t.key];
        const xfer = transferStatus[t.key];
        const status = xfer?.status ?? result?.status ?? 'loading';

        let count;
        let error = null;
        let children = [];

        if (result?.status === 'loaded' && result.items !== null) {
          count = countOwned(t.key, result.items);
          children = buildLeafItems(t.key, result.items, origin);
        } else if (result?.status === 'error') {
          error = result.error;
        }

        if (xfer) {
          if (xfer.error) error = xfer.error;
          if (xfer.count !== undefined) count = xfer.count;
        }

        return DataListItem.createGroup({
          children,
          count,
          error,
          id: t.key,
          label: t.label,
          metadata: forbidden.has(t.key)
            ? `Requires ${t.requiredAuthority}`
            : undefined,
          status
        });
      }),
    [results, transferStatus, forbidden, origin]
  );

  // Selection eligibility — only loaded virtual parents with > 0 items, and
  // only when the toolkit user has the required authority for that type.
  const isTypeSelectable = useCallback(
    (item) => {
      if (!item.isVirtualParent) return false;
      if (forbidden.has(item.id)) return false;
      const r = results[item.id];
      if (!r || r.status !== 'loaded' || !r.items) return false;
      return countOwned(item.id, r.items) > 0;
    },
    [forbidden, results]
  );

  const toggleSelection = useCallback((id, isSelected) => {
    setSelectedTypeKeys((prev) => {
      const next = new Set(prev);
      if (isSelected) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const exitSelectionMode = useCallback(() => {
    setSelectionMode(false);
    setSelectedTypeKeys(new Set());
  }, []);

  // "Transfer to..." button: if nothing's selected, auto-engage selection mode
  // and select every eligible type. Matches the prior TransferOwnership default
  // (pre-selected all transferable types). User can deselect inside the view.
  const handleOpenTransferModal = useCallback(() => {
    if (selectedTypeKeys.size === 0) {
      const eligible = TRANSFER_TYPES.filter((t) => {
        if (forbidden.has(t.key)) return false;
        const r = results[t.key];
        return r?.status === 'loaded' && r.items && countOwned(t.key, r.items) > 0;
      }).map((t) => t.key);
      setSelectedTypeKeys(new Set(eligible));
      setSelectionMode(true);
    }
    setTransferModalOpen(true);
  }, [selectedTypeKeys, forbidden, results]);

  // Submit handler invoked by the modal. Runs transferAllOwnership, threading
  // per-type progress into transferStatus (which feeds DataList rows). Then
  // optionally emails the new owner and deletes the source user. Errors per
  // type surface inside the row's expanded body via `status: 'failed'` + error
  // message — same UX as the old TransferOwnership view's failure-disclosure.
  const handleTransferSubmit = useCallback(
    async (formData) => {
      const { deleteAfterTransfer, emailNewOwner, targetUser, toUserDisplayName, toUserId } =
        formData;

      const enabledTypes = new Set(selectedTypeKeys);
      // Snapshot owned data per type — passed to transferAllOwnership so it
      // doesn't refetch the types we already have. Types with
      // getOwnedForTransfer still re-fetch via that variant inside the
      // orchestrator.
      const seededOwnedObjects = {};
      for (const key of enabledTypes) {
        const r = results[key];
        if (r?.status === 'loaded') seededOwnedObjects[key] = r.items;
      }

      // Initialize transferStatus rows: every selected type starts as
      // 'transferring' so the spinner shows immediately.
      const initialStatus = {};
      for (const key of enabledTypes) {
        const r = results[key];
        const c = r?.status === 'loaded' && r.items ? countOwned(key, r.items) : 0;
        initialStatus[key] = { count: c, status: 'transferring' };
      }
      setTransferStatus(initialStatus);
      setIsTransferring(true);

      try {
        const transferResults = await transferAllOwnership({
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
                  failed,
                  status: failed > 0 ? 'failed' : 'transferred',
                  succeeded
                };
              } else if (status === 'error') {
                next[typeKey] = {
                  count: 0,
                  error:
                    result?.errors?.[0]?.error || 'Transfer failed before completing',
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

        // Optional: email the new owner with an Excel summary.
        if (emailNewOwner && targetUser?.email && totalSucceeded > 0) {
          try {
            const rows = buildTransferLogRows({
              fromUserId: userId,
              fromUserName: userName,
              results: transferResults,
              toUserId,
              toUserName: toUserDisplayName ?? targetUser.displayName
            });
            const blob = await buildExcelBlob(rows, LOG_COLUMNS, 'Transfer Log');
            const filename = `${generateExportFilename('transferred-objects')}.xlsx`;
            const dataFileId = await uploadDataFile(
              blob,
              filename,
              XLSX_MIME_TYPE,
              tabId
            );
            await sendEmail(
              {
                bodyHtml: renderEmailBody({
                  sourceUserName: userName,
                  totalFailed,
                  totalSucceeded
                }),
                dataFileAttachments: [dataFileId],
                recipientEmails: targetUser.email,
                subject: `Ownership transferred to you from ${userName}`
              },
              tabId
            );
          } catch (err) {
            showStatus(
              'Email Not Sent',
              err.message || 'Failed to email new owner',
              'warning',
              5000
            );
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
          setSelectedTypeKeys(new Set());
        }
      }
    },
    [results, selectedTypeKeys, tabId, userId, userName, showStatus, onBackToDefault]
  );

  const subtextNode = useMemo(() => {
    if (isTransferring) {
      const inFlight = Object.values(transferStatus).filter(
        (x) => x.status === 'transferring'
      ).length;
      const done = Object.values(transferStatus).filter(
        (x) => x.status === 'transferred' || x.status === 'failed'
      ).length;
      const total = inFlight + done;
      return (
        <>
          Transferring… <span className='font-medium text-foreground'>{done}</span>/{total}
        </>
      );
    }
    if (selectionMode) {
      const objectCount = Array.from(selectedTypeKeys).reduce((sum, key) => {
        const r = results[key];
        return sum + (r?.status === 'loaded' && r.items ? countOwned(key, r.items) : 0);
      }, 0);
      return (
        <>
          <span className='font-medium text-foreground'>{selectedTypeKeys.size}</span>{' '}
          type{selectedTypeKeys.size !== 1 ? 's' : ''},{' '}
          <span className='font-medium text-foreground'>{objectCount}</span>{' '}
          object{objectCount !== 1 ? 's' : ''} selected
        </>
      );
    }
    if (!isFullyLoaded) {
      return (
        <>
          Searching… ({TRANSFER_TYPES.length - loadingCount}/{TRANSFER_TYPES.length} types)
        </>
      );
    }
    return (
      <>
        <span className='font-medium text-foreground'>{totalObjects}</span> object
        {totalObjects !== 1 ? 's' : ''} across{' '}
        <span className='font-medium text-foreground'>{loadedTypeCount}</span> type
        {loadedTypeCount !== 1 ? 's' : ''}
        {errorCount > 0 && (
          <span>
            {' ('}
            <span className='text-danger'>{errorCount} failed</span>
            {')'}
          </span>
        )}
      </>
    );
  }, [
    isFullyLoaded,
    isTransferring,
    loadedTypeCount,
    loadingCount,
    errorCount,
    selectionMode,
    selectedTypeKeys,
    results,
    totalObjects,
    transferStatus
  ]);

  const customHeaderActions = useMemo(() => {
    const actions = [];
    if (isUserSource) {
      actions.push({
        icon: <IconChecks stroke={1.5} />,
        isActive: selectionMode,
        isDisabled: !isFullyLoaded || !hasAnyTransferable || isTransferring,
        key: 'selection',
        onPress: () => {
          if (selectionMode) {
            exitSelectionMode();
          } else {
            setSelectionMode(true);
          }
        },
        tooltipText: selectionMode ? 'Exit selection mode' : 'Select types to transfer'
      });
      actions.push({
        icon: <IconUserUp stroke={1.5} />,
        isDisabled: !isFullyLoaded || !hasAnyTransferable || isTransferring,
        key: 'transfer',
        onPress: handleOpenTransferModal,
        tooltipText: 'Transfer ownership to…'
      });
    }
    return actions;
  }, [
    exitSelectionMode,
    handleOpenTransferModal,
    hasAnyTransferable,
    isFullyLoaded,
    isTransferring,
    isUserSource,
    selectionMode
  ]);

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
        closeLabel='Close Ownership View'
        customHeaderActions={customHeaderActions}
        headerActions={['refresh']}
        isRefreshing={loadingCount > 0}
        isSelectable={isTypeSelectable}
        itemActions={['copy']}
        itemLabel='object'
        items={dataListItems}
        selectedIds={selectedTypeKeys}
        selectionMode={selectionMode}
        showActions={true}
        showCounts={true}
        subtext={subtextNode}
        onClose={onBackToDefault}
        onRefresh={refreshFetches}
        onStatusUpdate={onStatusUpdate}
        onToggleSelection={toggleSelection}
        title={
          <>
            <span>Objects Owned by</span>{' '}
            <span className='font-bold'>{userName}</span>
          </>
        }
      />
      <TransferOwnershipModal
        currentContext={currentContext}
        isOpen={transferModalOpen}
        results={results}
        selectedTypeKeys={selectedTypeKeys}
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
 * and can collide — we namespace the React-key id (`project-<id>` /
 * `task-<id>`) and stash the canonical id in `originalId` so Copy-ID still
 * yields the unmodified value.
 */
function buildLeafItems(typeKey, owned, origin) {
  const flat = flattenOwned(typeKey, owned);
  return flat.map((item) => {
    if (typeKey === 'projectsAndTasks') {
      const prefix = item.subType === 'Task' ? 'task' : 'project';
      return new DataListItem({
        id: `${prefix}-${item.id}`,
        label: item.subType
          ? `[${item.subType}] ${item.name || item.id}`
          : (item.name || String(item.id)),
        originalId: item.id,
        typeId: null,
        url: null
      });
    }

    const domoTypeId = TYPE_KEY_TO_DOMO_TYPE[typeKey];
    let url = null;
    if (domoTypeId) {
      try {
        url = new DomoObject(
          domoTypeId,
          item.id,
          origin,
          { name: item.name },
          null,
          item.queueId || item.parentId || null
        ).url;
      } catch {
        url = null;
      }
    }

    return new DataListItem({
      id: item.id,
      label: item.name || String(item.id),
      typeId: domoTypeId,
      url
    });
  });
}

function buildTransferLogRows({ fromUserId, fromUserName, results, toUserId, toUserName }) {
  const date = new Date().toISOString().slice(0, -5);
  const rows = [];
  for (const [typeKey, result] of results) {
    const typeDef = TRANSFER_TYPES.find((t) => t.key === typeKey);
    const logType = TYPE_KEY_TO_LOG_TYPE[typeKey];
    const failedById = new Map((result.errors || []).map((e) => [e.id, e.error]));
    // `{id: 'all'}` sentinel means the whole batch failed — every row in this
    // type should be marked FAILED with the shared error message.
    const wholeBatchError = failedById.get('all');
    for (const item of result.attempted ?? []) {
      const isFailure = wholeBatchError !== undefined || failedById.has(item.id);
      rows.push({
        'Date': date,
        'New Owner ID': toUserId,
        'New Owner Name': toUserName,
        'Notes': isFailure ? (wholeBatchError ?? failedById.get(item.id)) : '',
        'Object ID': item.id,
        'Object Name': item.name,
        'Object Type': item.subType
          ? item.subType.toUpperCase()
          : (logType ?? typeDef?.label ?? typeKey),
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
  return `${result.errors.length} item${result.errors.length === 1 ? '' : 's'} failed: ${result.errors[0].id}: ${result.errors[0].error}…`;
}

function renderEmailBody({ sourceUserName, totalFailed, totalSucceeded }) {
  const objectWord = totalSucceeded === 1 ? 'object' : 'objects';
  const failedLine =
    totalFailed > 0
      ? `<p>${totalFailed} object${totalFailed === 1 ? '' : 's'} could not be transferred and ${totalFailed === 1 ? 'is' : 'are'} included in the attachment with a FAILED status.</p>`
      : '';
  return `<p>Ownership of <strong>${totalSucceeded}</strong> ${objectWord} has been transferred to you from <strong>${sourceUserName}</strong>.</p><p>A complete list is attached.</p>${failedLine}`;
}
