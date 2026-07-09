import { AlertDialog, Button, Card, Spinner } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { CloseButton } from '@/components/CloseButton';
import { DataList } from '@/components/views/DataList';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { bulkDeleteFunctions, deleteFunction, findUnusedFunctions } from '@/services/functions';
import { getValidTabForInstance } from '@/utils/currentObject';
import { parseMarkdownBold } from '@/utils/markdown';
import { getSidepanelData } from '@/utils/sidepanel';
import IconBeastMode from '@icons/beast-mode.svg?react';
import IconTrash from '@icons/trash.svg?react';
import IconX from '@icons/x.svg?react';

// Bulk-delete batch size. The retry-on-failure path re-tries each id in a
// failed batch individually, so a bad id never sinks its whole batch.
const BATCH_SIZE = 50;

export function DeleteUnusedBeastModesView({
  currentContext = null,
  instance = null,
  isActive = true,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [candidates, setCandidates] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [viewData, setViewData] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(null);

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
      if (!data || data.type !== 'deleteUnusedBeastModes') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const domoObject = context?.domoObject;
      const objectType = domoObject?.typeId;
      if (!context || (objectType !== 'DATA_SOURCE' && objectType !== 'USER')) {
        onStatusUpdate?.('Error', 'Delete Unused Beast Modes supports datasets and users only', 'danger');
        onBackToDefault?.();
        return;
      }

      const tabId = await getValidTabForInstance(context.instance);
      const found =
        objectType === 'USER'
          ? await findUnusedFunctions({ ownerIds: [domoObject.id], tabId })
          : await findUnusedFunctions({ datasetIds: [domoObject.id], tabId });
      if (!mountedRef.current) return;

      // Nothing to clean up: the toast is the whole message, so skip rendering
      // an empty view and drop straight back to the default panel.
      if (found.length === 0) {
        onStatusUpdate?.('All Clean', 'No unused Beast Modes or Variables were found.', 'success', 3000);
        onBackToDefault?.();
        return;
      }

      setCandidates(found);
      // Pre-select every unlocked candidate (both Beast Modes and Variables) so
      // "delete everything unused" is one click; locked ones stay unchecked as
      // an explicit opt-in. Include a group id whenever all of its leaves start
      // selected so the group checkbox reads as fully checked.
      const beastIds = found.filter((c) => !c.variable && !c.locked).map((c) => String(c.id));
      const variableIds = found.filter((c) => c.variable && !c.locked).map((c) => String(c.id));
      const initial = new Set([...beastIds, ...variableIds]);
      if (beastIds.length) initial.add('group-beastModes');
      if (variableIds.length) initial.add('group-variables');
      setSelectedIds(initial);

      setError(null);
      setViewData({
        objectId: domoObject.id,
        objectName: domoObject.metadata?.name || `${objectType} ${domoObject.id}`,
        objectType,
        origin: `https://${context.instance}.domo.com`,
        tabId
      });
    } catch (err) {
      console.error('[DeleteUnusedBeastModesView] Error loading data:', err);
      if (mountedRef.current) setError(err.message || 'Failed to find unused Beast Modes');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const { allLeafIds, groupsById, leafToGroup } = useMemo(() => {
    const beast = [];
    const locked = [];
    const variables = [];
    for (const c of candidates) {
      const sid = String(c.id);
      if (c.locked) locked.push(sid);
      else if (c.variable) variables.push(sid);
      else beast.push(sid);
    }
    const groups = new Map([
      ['group-beastModes', beast],
      ['group-locked', locked],
      ['group-variables', variables]
    ]);
    const leafGroup = new Map();
    for (const [gid, ids] of groups) {
      for (const id of ids) leafGroup.set(id, gid);
    }
    return { allLeafIds: new Set([...beast, ...variables, ...locked]), groupsById: groups, leafToGroup: leafGroup };
  }, [candidates]);

  const items = useMemo(() => buildItems(candidates, viewData?.origin || ''), [candidates, viewData]);

  const selectedLeafCount = useMemo(
    () => [...selectedIds].filter((id) => allLeafIds.has(id)).length,
    [allLeafIds, selectedIds]
  );

  const selectedByType = useMemo(() => {
    let beastModes = 0;
    let variables = 0;
    for (const c of candidates) {
      if (!selectedIds.has(String(c.id))) continue;
      if (c.variable) variables += 1;
      else beastModes += 1;
    }
    return { beastModes, variables };
  }, [candidates, selectedIds]);

  const isSelectable = useCallback(() => true, []);

  const handleSelectionChange = useCallback(
    (incoming) => {
      const prev = selectedIds;
      const added = [...incoming].filter((id) => !prev.has(id));
      const removed = [...prev].filter((id) => !incoming.has(id));
      const next = new Set(incoming);

      // Cascade a group toggle down to every leaf it contains.
      for (const id of added) {
        const childIds = groupsById.get(id);
        if (childIds) childIds.forEach((cid) => next.add(cid));
      }
      for (const id of removed) {
        const childIds = groupsById.get(id);
        if (childIds) childIds.forEach((cid) => next.delete(cid));
      }

      // Reconcile each touched leaf's group: a group is checked iff every leaf
      // under it is selected.
      const touchedGroups = new Set();
      for (const id of [...added, ...removed]) {
        const gid = leafToGroup.get(id);
        if (gid) touchedGroups.add(gid);
      }
      for (const gid of touchedGroups) {
        const childIds = groupsById.get(gid);
        if (!childIds || childIds.length === 0) continue;
        if (childIds.every((cid) => next.has(cid))) next.add(gid);
        else next.delete(gid);
      }

      setSelectedIds(next);
    },
    [groupsById, leafToGroup, selectedIds]
  );

  const selectAll = useCallback(() => {
    const next = new Set(allLeafIds);
    for (const [gid, childIds] of groupsById) {
      if (childIds.length > 0) next.add(gid);
    }
    setSelectedIds(next);
  }, [allLeafIds, groupsById]);

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const performDelete = () => {
    const toDelete = candidates.filter((c) => selectedIds.has(String(c.id)));
    if (toDelete.length === 0) return;
    const tabId = viewData?.tabId ?? null;
    setPendingDelete(false);
    setIsDeleting(true);
    setDeleteProgress({ done: 0, total: toDelete.length });

    const run = async () => {
      const succeededIds = new Set();
      const errors = [];
      for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
        const chunk = toDelete.slice(i, i + BATCH_SIZE);
        try {
          await bulkDeleteFunctions({ ids: chunk.map((c) => c.id), tabId });
          chunk.forEach((c) => succeededIds.add(String(c.id)));
        } catch {
          // The whole batch failed; retry each id on its own so one bad id
          // doesn't take the rest of the batch down with it.
          for (const c of chunk) {
            try {
              await deleteFunction({ functionId: c.id, tabId });
              succeededIds.add(String(c.id));
            } catch (err) {
              errors.push({ id: c.id, message: err.message });
            }
          }
        }
        if (mountedRef.current) {
          setDeleteProgress({ done: Math.min(i + chunk.length, toDelete.length), total: toDelete.length });
        }
      }
      return { errors, succeededIds };
    };

    run()
      .then(({ errors, succeededIds }) => {
        if (!mountedRef.current) return;
        // Drop deleted rows; keep any that failed so the user can see and retry.
        const remaining = candidates.filter((c) => !succeededIds.has(String(c.id)));
        setCandidates(remaining);
        setSelectedIds(new Set());
        const ok = succeededIds.size;
        if (errors.length === 0) {
          showStatus('Deleted', `Deleted **${ok}** unused ${ok === 1 ? 'item' : 'items'}`, 'success');
        } else {
          showStatus('Partially Deleted', `Deleted **${ok}**, **${errors.length}** failed`, 'warning');
        }
        // Everything cleared: the toast is the confirmation, so close the view
        // like other views do instead of leaving an empty "All clean" panel.
        if (remaining.length === 0) onBackToDefault?.();
      })
      .catch((err) => {
        if (mountedRef.current) showStatus('Delete Failed', err.message || 'An error occurred', 'danger');
      })
      .finally(() => {
        if (mountedRef.current) {
          setIsDeleting(false);
          setDeleteProgress(null);
        }
      });
  };

  const subtextNode = useMemo(() => {
    if (isDeleting && deleteProgress) {
      return `Deleting… **${deleteProgress.done}**/${deleteProgress.total}`;
    }
    const total = allLeafIds.size;
    return `**${selectedLeafCount}** of **${total}** ${total === 1 ? 'item' : 'items'} selected`;
  }, [allLeafIds, deleteProgress, isDeleting, selectedLeafCount]);

  const selectAllControl = {
    ariaLabel: 'Select all unused items',
    count: selectedLeafCount,
    isDisabled: isDeleting,
    onToggle: (checked) => (checked ? selectAll() : clearSelection()),
    total: allLeafIds.size
  };

  const footer = useMemo(
    () => (
      <Button
        fullWidth
        isDisabled={selectedLeafCount === 0 || isDeleting}
        isPending={isDeleting}
        size='sm'
        variant='danger'
        onPress={() => setPendingDelete(true)}
      >
        <IconTrash />
        Delete {selectedLeafCount} Selected
      </Button>
    ),
    [isDeleting, selectedLeafCount]
  );

  if (isLoading || holdContent) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Finding unused Beast Modes…</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Error</Alert.Title>
          <div className='flex flex-col items-start gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button size='sm' onPress={handleRefresh}>
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton className='rounded-full' variant='ghost' onPress={() => onBackToDefault?.()} />
      </Alert>
    );
  }

  return (
    <>
      <DataList
        fillHeight
        selectionMode
        currentContext={currentContext}
        defaultExpandedIds={['group-beastModes', 'group-variables']}
        feature='Unused Beast Modes for'
        featureIcon={<IconBeastMode />}
        footer={footer}
        headerActions={['reload', 'refresh']}
        isRefreshing={isRefreshing}
        isSelectable={isSelectable}
        itemActions={['copy']}
        itemLabel='item'
        items={items}
        objectId={viewData?.objectId}
        objectType={viewData?.objectType}
        selectAll={selectAllControl}
        selectedIds={selectedIds}
        showActivityLogAll={false}
        subject={viewData?.objectName}
        subtext={subtextNode}
        viewType='deleteUnusedBeastModes'
        onClose={onBackToDefault}
        onRefresh={handleRefresh}
        onSelectionChange={handleSelectionChange}
        onStatusUpdate={onStatusUpdate}
      />
      <AlertDialog
        isOpen={pendingDelete && isActive}
        onOpenChange={(open) => {
          if (!open) setPendingDelete(false);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-danger' />
              <AlertDialog.CloseTrigger className='absolute top-3 right-2' variant='ghost'>
                <IconX />
              </AlertDialog.CloseTrigger>
              <AlertDialog.Header>
                <AlertDialog.Heading>Delete Unused Beast Modes</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                Permanently delete {parseMarkdownBold(describeSelection(selectedByType))}? Deleted Beast Modes and Variables
                cannot be recovered.
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button isDisabled={isDeleting} size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button isDisabled={isDeleting} size='sm' variant='danger' onPress={performDelete}>
                  Delete {selectedLeafCount} Selected
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

// Build the grouped item tree: unlocked Beast Modes and unlocked Variables each
// get their own group; anything locked (either type) goes in a separate "Locked"
// group that starts unchecked, so deleting a locked template is an explicit
// opt-in. Only non-empty groups are returned.
function buildItems(candidates, origin) {
  const beast = [];
  const locked = [];
  const variables = [];
  for (const c of candidates) {
    if (c.locked) locked.push(c);
    else if (c.variable) variables.push(c);
    else beast.push(c);
  }

  const makeLeaf = (c) => {
    const typeId = c.variable ? 'VARIABLE' : 'BEAST_MODE_FORMULA';
    // String id so the leaf's DataList checkbox value (and its selection-memo
    // check) line up with the string ids in `selectedIds`. The raw candidate id
    // is what actually gets deleted, so nothing about the delete changes.
    return DataListItem.fromDomoObject(new DomoObject(typeId, String(c.id), origin, { name: c.name }));
  };
  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');

  const groups = [];
  if (beast.length) {
    groups.push(
      DataListItem.createGroup({
        children: beast.slice().sort(byName).map(makeLeaf),
        childTypeId: 'BEAST_MODE_FORMULA',
        id: 'group-beastModes',
        label: 'Beast Modes'
      })
    );
  }
  if (variables.length) {
    groups.push(
      DataListItem.createGroup({
        children: variables.slice().sort(byName).map(makeLeaf),
        childTypeId: 'VARIABLE',
        id: 'group-variables',
        label: 'Variables'
      })
    );
  }
  if (locked.length) {
    const children = locked
      .slice()
      .sort(byName)
      .map((c) => {
        const item = makeLeaf(c);
        item.annotation = { tooltip: 'Locked — select it to include it in the delete' };
        return item;
      });
    groups.push(DataListItem.createGroup({ children, id: 'group-locked', label: 'Locked (not selected by default)' }));
  }
  return groups;
}

function describeSelection({ beastModes, variables }) {
  const parts = [];
  if (beastModes > 0) parts.push(`**${beastModes}** Beast Mode${beastModes === 1 ? '' : 's'}`);
  if (variables > 0) parts.push(`**${variables}** Variable${variables === 1 ? '' : 's'}`);
  return parts.join(' and ');
}
