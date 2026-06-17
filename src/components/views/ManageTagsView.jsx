import {
  Alert,
  Button,
  Card,
  Checkbox,
  Chip,
  ComboBox,
  Input,
  Label,
  ListBox,
  ListLayout,
  Spinner,
  Tooltip,
  Virtualizer
} from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { CloseButton } from '@/components/CloseButton';
import { DataList } from '@/components/views/DataList';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { getTagsForDataflowAndDatasets, getTagSuggestions, setTagsForObjects } from '@/services/dataflows';
import { getDatasetsForDataflow } from '@/services/datasets';
import { getUserName } from '@/services/users';
import { getValidTabForInstance } from '@/utils/currentObject';
import { getSidepanelData } from '@/utils/sidepanel';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconTagMultiple from '@icons/tag-multiple.svg?react';
import IconX from '@icons/x.svg?react';

const ROLE_LABELS = {
  dataflow: 'DataFlow',
  input: 'Input DataSets',
  output: 'Output DataSets'
};

export function ManageTagsView({ currentContext = null, instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [domoInstance, setDomoInstance] = useState(null);
  const [objectId, setObjectId] = useState(null);
  const [dataflowName, setDataflowName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [objects, setObjects] = useState([]);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [added, setAdded] = useState(() => new Set());
  const [removed, setRemoved] = useState(() => new Set());
  const [suggestions, setSuggestions] = useState([]);
  const [tagInput, setTagInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const loadData = async ({ isRefresh = false } = {}) => {
    setError(null);
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'manageTags') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const domoObject = context?.domoObject;
      if (!context || domoObject?.typeId !== 'DATAFLOW_TYPE') {
        onStatusUpdate?.('Error', 'Manage Tags is only available for dataflows', 'danger');
        onBackToDefault?.();
        return;
      }

      const dataflowId = String(domoObject.id);
      const name = domoObject.metadata?.name || `DataFlow ${dataflowId}`;
      const origin = `https://${context.instance}.domo.com`;
      const { inputs, outputs } = getDatasetsForDataflow({ details: domoObject.metadata?.details });
      const datasetIds = [...outputs, ...inputs].map((d) => d.id).filter(Boolean);

      const tabId = await getValidTabForInstance(context.instance);
      const tags = await getTagsForDataflowAndDatasets({ dataflowId, datasetIds, tabId });

      // A dataset only counts as readable (and thus writable) if the bulk read
      // returned it. Unreadable datasets are shown but never written, because a
      // full-replacement write off an unknown baseline would clobber their tags.
      const datasetMap = tags.datasets || {};
      const toDatasetObj = (d, role) => ({
        currentTags: datasetMap[d.id] || [],
        domoObject: new DomoObject('DATA_SOURCE', d.id, origin, { name: d.name }),
        id: d.id,
        name: d.name,
        readable: Object.prototype.hasOwnProperty.call(datasetMap, d.id),
        role,
        type: 'DATA_SOURCE'
      });
      const dataflowObj = {
        currentTags: tags.dataflow || [],
        domoObject: new DomoObject('DATAFLOW_TYPE', dataflowId, origin, { name }),
        id: dataflowId,
        name,
        readable: true,
        role: 'dataflow',
        type: 'DATAFLOW'
      };
      const outputObjs = outputs.map((d) => toDatasetObj(d, 'output'));
      const inputObjs = inputs.map((d) => toDatasetObj(d, 'input'));
      const allObjects = [dataflowObj, ...outputObjs, ...inputObjs];

      if (!mountedRef.current) return;
      setDomoInstance(context.instance);
      setObjectId(domoObject.id);
      setDataflowName(name);
      setObjects(allObjects);
      // Default selection: the dataflow plus every readable output. Inputs start
      // unchecked so the user opts into touching upstream datasets. A refresh
      // re-reads the server baseline but keeps the user's current selection and
      // any pending tag edits, so the default is applied on first load only.
      if (!isRefresh) {
        const initialLeaves = [dataflowObj.id, ...outputObjs.filter((o) => o.readable).map((o) => o.id)];
        setSelectedIds(reconcileGroupSelection(new Set(initialLeaves), buildGroupChildren(allObjects)));
      }

      // Suggestions are a convenience; never let them block or fail the editor.
      getTagSuggestions(tabId)
        .then((s) => {
          if (mountedRef.current) setSuggestions(s || []);
        })
        .catch(() => {});

      // Resolve the dataflow owner so we can recommend its "From <owner>" tag
      // (the convention Transfer Ownership stamps on transferred objects) when
      // that tag already exists in the instance. Best-effort, like suggestions.
      const ownerId = domoObject.metadata?.details?.responsibleUserId;
      if (ownerId) {
        getUserName(ownerId, tabId)
          .then((name) => {
            if (mountedRef.current && name) setOwnerName(name);
          })
          .catch(() => {});
      }
    } catch (err) {
      console.error('[ManageTagsView] Error loading data:', err);
      if (mountedRef.current) setError(err.message || 'Failed to read tags');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData({ isRefresh: true });
      onStatusUpdate?.('Refreshed', 'Tag data updated', 'success', 2000);
    } catch (err) {
      onStatusUpdate?.('Refresh Failed', err.message || 'Failed to refresh tags', 'danger', 3000);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const selectedObjects = useMemo(
    () => objects.filter((o) => o.readable && selectedIds.has(o.id)),
    [objects, selectedIds]
  );

  // The set of tags in play: the union currently on the selected objects, plus
  // anything added, minus anything removed. Each is flagged "partial" when it is
  // only on some selected objects and is not being applied to all via `added`.
  const displayedTags = useMemo(() => {
    const counts = new Map();
    for (const o of selectedObjects) {
      for (const t of o.currentTags) counts.set(t, (counts.get(t) || 0) + 1);
    }
    const tagSet = new Set([...counts.keys(), ...added]);
    for (const t of removed) tagSet.delete(t);
    const total = selectedObjects.length;
    return [...tagSet]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((tag) => {
        const presentCount = counts.get(tag) || 0;
        const partial = !added.has(tag) && presentCount > 0 && presentCount < total;
        return { partial, presentCount, tag, total };
      });
  }, [selectedObjects, added, removed]);

  const hasEdits = added.size > 0 || removed.size > 0;

  // Group the objects into the three DataList sections. Each group header shows
  // its child count; leaves link to the object and carry a selection checkbox.
  const dataListItems = useMemo(() => {
    const byRole = { dataflow: [], input: [], output: [] };
    for (const o of objects) byRole[o.role].push(o);
    const toLeaf = (o) => {
      const item = DataListItem.fromDomoObject(o.domoObject, { label: o.name });
      if (!o.readable) item.metadata = 'Tags unavailable';
      return item;
    };
    const groups = [];
    for (const role of ['dataflow', 'output', 'input']) {
      if (byRole[role].length > 0) {
        groups.push(DataListItem.createGroup({ children: byRole[role].map(toLeaf), id: `${role}_group`, label: ROLE_LABELS[role] }));
      }
    }
    return groups;
  }, [objects]);

  // Group headers are selectable when they have at least one readable child;
  // readable leaves are always selectable. Unreadable datasets get no checkbox
  // (they can't be written safely off an unknown baseline).
  const readableIds = useMemo(() => new Set(objects.filter((o) => o.readable).map((o) => o.id)), [objects]);
  const groupChildren = useMemo(() => buildGroupChildren(objects), [objects]);
  const isSelectable = useCallback(
    (item) => (item.isVirtualParent ? (groupChildren[item.id]?.length || 0) > 0 : readableIds.has(item.id)),
    [groupChildren, readableIds]
  );

  // CheckboxGroup hands back the full new set. Cascade any group toggle down to
  // its children, then reconcile every group's own checkbox to "checked" iff all
  // its children are selected, mirroring OwnershipView's parent/child sync.
  const handleSelectionChange = useCallback(
    (incoming) => {
      const next = new Set(incoming);
      for (const [groupId, children] of Object.entries(groupChildren)) {
        const wasSelected = selectedIds.has(groupId);
        const nowSelected = incoming.has(groupId);
        if (nowSelected && !wasSelected) children.forEach((c) => next.add(c));
        else if (!nowSelected && wasSelected) children.forEach((c) => next.delete(c));
      }
      setSelectedIds(reconcileGroupSelection(next, groupChildren));
    },
    [groupChildren, selectedIds]
  );

  // Autocomplete options: every existing tag in the instance that isn't already
  // applied or pending. The ComboBox filters these by what's typed; a value not
  // in the list is still accepted via `allowsCustomValue`.
  const tagOptions = useMemo(() => {
    const shown = new Set(displayedTags.map((d) => d.tag));
    return suggestions.filter((s) => !shown.has(s.value)).map((s) => ({ count: s.count, id: s.value, name: s.value }));
  }, [suggestions, displayedTags]);

  const commitTag = (raw) => {
    const value = raw.trim();
    if (!value) return;
    setRemoved((prev) => {
      const next = new Set(prev);
      next.delete(value);
      return next;
    });
    setAdded((prev) => {
      const next = new Set(prev);
      next.add(value);
      return next;
    });
    setTagInput('');
  };

  const removeTag = (tag) => {
    setAdded((prev) => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
    setRemoved((prev) => {
      const next = new Set(prev);
      next.add(tag);
      return next;
    });
  };

  const handleInputKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commitTag(tagInput);
    }
  };

  const handleSave = () => {
    const targets = objects.filter((o) => o.readable && selectedIds.has(o.id));
    if (targets.length === 0) {
      onStatusUpdate?.('No objects selected', 'Select at least one object to tag', 'warning', 2500);
      return;
    }

    let dataflowPayload = null;
    const datasetPayloads = [];
    for (const o of targets) {
      const next = new Set(o.currentTags);
      for (const t of added) next.add(t);
      for (const t of removed) next.delete(t);
      if (next.size === o.currentTags.length && o.currentTags.every((t) => next.has(t))) continue;
      const tags = [...next];
      if (o.type === 'DATAFLOW') dataflowPayload = { id: o.id, name: o.name, tags };
      else datasetPayloads.push({ id: o.id, name: o.name, tags });
    }

    const changedCount = (dataflowPayload ? 1 : 0) + datasetPayloads.length;
    if (changedCount === 0) {
      onStatusUpdate?.('No changes to apply', 'The selected objects already have these tags', 'warning', 2500);
      return;
    }

    setIsSubmitting(true);
    const promise = (async () => {
      const tabId = await getValidTabForInstance(domoInstance);
      const result = await setTagsForObjects({ dataflow: dataflowPayload, datasets: datasetPayloads, tabId });
      if (result.failed > 0) {
        const names = result.errors.map((e) => e.name || e.id).join(', ');
        throw new Error(`${result.succeeded} updated, ${result.failed} failed: ${names}`);
      }
      return result.succeeded;
    })();

    showPromiseStatus(promise, {
      error: (e) => e.message || 'Failed to update tags',
      loading: `Updating tags on ${changedCount} object${changedCount === 1 ? '' : 's'}…`,
      success: (n) => `Updated tags on ${n} object${n === 1 ? '' : 's'}`
    });

    promise
      .then(() => {
        if (mountedRef.current) onBackToDefault?.();
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) setIsSubmitting(false);
      });
  };

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading tags...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Alert className='w-full' status='warning'>
        <Alert.Indicator>
          <IconExclamationTriangle data-slot='alert-default-icon' />
        </Alert.Indicator>
        <Alert.Content>
          <Alert.Title>Could not read tags</Alert.Title>
          <div className='flex flex-col items-start justify-center gap-2'>
            <Alert.Description>{error}</Alert.Description>
            <Button
              isPending={isRetrying}
              size='sm'
              onPress={async () => {
                setIsRetrying(true);
                setIsLoading(true);
                await loadData();
                if (mountedRef.current) setIsRetrying(false);
              }}
            >
              {isRetrying ? <Spinner color='currentColor' size='sm' /> : <IconSync />}
              Retry
            </Button>
          </div>
        </Alert.Content>
        <CloseButton className='rounded-full' variant='ghost' onPress={() => onBackToDefault?.()} />
      </Alert>
    );
  }

  const suggestionChips = (() => {
    const shown = new Set(displayedTags.map((d) => d.tag));
    const available = suggestions.filter((s) => !shown.has(s.value));
    const chips = available.slice(0, 8);
    // Always recommend the owner's "From <owner>" tag when it exists in the
    // instance and isn't already applied, pinning it first even if its usage
    // count would otherwise push it out of the top suggestions.
    const ownerTag = ownerName ? `From ${ownerName}` : null;
    if (ownerTag && !chips.some((c) => c.value === ownerTag)) {
      const match = available.find((s) => s.value === ownerTag);
      if (match) return [match, ...chips.slice(0, 7)];
    }
    return chips;
  })();

  const readableObjects = objects.filter((o) => o.readable);
  const allSelected = readableObjects.length > 0 && readableObjects.every((o) => selectedIds.has(o.id));
  const someSelected = readableObjects.some((o) => selectedIds.has(o.id));

  const selectionToolbar = (
    <Checkbox
      aria-label='Select all objects'
      isDisabled={isSubmitting || readableObjects.length === 0}
      isIndeterminate={someSelected && !allSelected}
      isSelected={allSelected}
      onChange={(checked) =>
        setSelectedIds(
          checked ? reconcileGroupSelection(new Set(readableObjects.map((o) => o.id)), groupChildren) : new Set()
        )
      }
    >
      <Checkbox.Control>
        <Checkbox.Indicator />
      </Checkbox.Control>
      <Checkbox.Content>
        <Label>Select all</Label>
      </Checkbox.Content>
    </Checkbox>
  );

  // The tag editor lives in the DataList footer, pinned beneath the object list.
  const tagEditor = (
    <div className='flex flex-col gap-2'>
      <Label className='text-sm font-medium'>Tags</Label>
      <div className='flex items-end gap-1'>
        <ComboBox
          allowsCustomValue
          allowsEmptyCollection
          aria-label='Add a tag'
          className='flex-1'
          inputValue={tagInput}
          isDisabled={isSubmitting}
          menuTrigger='input'
          variant='secondary'
          onInputChange={setTagInput}
          onSelectionChange={(key) => {
            if (key != null) commitTag(String(key));
          }}
        >
          <ComboBox.InputGroup>
            <Input className='h-8' placeholder='Type or pick a tag, then Enter' onKeyDown={handleInputKeyDown} />
            <ComboBox.Trigger>
              <IconChevronDown />
            </ComboBox.Trigger>
          </ComboBox.InputGroup>
          <ComboBox.Popover className='max-w-9/10' placement='bottom start'>
            <Virtualizer layout={ListLayout} layoutOptions={{ estimatedRowHeight: 32 }}>
              <ListBox className='max-h-60 overflow-y-auto' items={tagOptions}>
                {(item) => (
                  <ListBox.Item className='h-fit' id={item.id} textValue={item.name}>
                    <div className='flex w-full items-center justify-between gap-2'>
                      <span className='line-clamp-2 break-all'>{item.name}</span>
                      <span className='shrink-0 text-xs text-muted'>{item.count}</span>
                    </div>
                  </ListBox.Item>
                )}
              </ListBox>
            </Virtualizer>
          </ComboBox.Popover>
        </ComboBox>
        <Button isDisabled={isSubmitting || !tagInput.trim()} size='md' variant='secondary' onPress={() => commitTag(tagInput)}>
          Add
        </Button>
      </div>

      {displayedTags.length > 0 ? (
        <div className='flex max-h-28 flex-wrap gap-1 overflow-y-auto'>
          {displayedTags.map(({ partial, presentCount, tag, total }) => (
            <Chip
              className='h-6 max-w-full px-2 text-xs'
              color={partial ? 'warning' : 'accent'}
              key={tag}
              size='sm'
              variant='soft'
            >
              <Chip.Label className='truncate'>{tag}</Chip.Label>
              {partial && (
                <Tooltip>
                  <Button
                    className='ml-1 h-4 min-w-0 px-1 text-[10px] opacity-80'
                    isDisabled={isSubmitting}
                    size='sm'
                    variant='ghost'
                    onPress={() => commitTag(tag)}
                  >
                    {presentCount}/{total}
                  </Button>
                  <Tooltip.Content className='max-w-45'>
                    On {presentCount} of {total} selected objects. Click to apply to all.
                  </Tooltip.Content>
                </Tooltip>
              )}
              <Button
                isIconOnly
                className='ml-1 size-4 min-w-0'
                isDisabled={isSubmitting}
                size='sm'
                variant='ghost'
                onPress={() => removeTag(tag)}
              >
                <IconX className='size-3' />
              </Button>
            </Chip>
          ))}
        </div>
      ) : (
        <span className='text-xs text-muted'>No tags on the selected objects yet.</span>
      )}

      {suggestionChips.length > 0 && (
        <div className='flex flex-col gap-1'>
          <span className='text-xs text-muted'>Suggestions</span>
          <div className='flex flex-wrap gap-1'>
            {suggestionChips.map((s) => (
              <Button
                className='h-6 px-2 text-xs'
                isDisabled={isSubmitting}
                key={s.value}
                size='sm'
                variant='tertiary'
                onPress={() => commitTag(s.value)}
              >
                + {s.value}
              </Button>
            ))}
          </div>
        </div>
      )}

      <span className='text-xs text-muted'>
        Removing a tag clears it from every selected object. Tags shown with a count are only on some; click the count to
        apply it to all, or leave it to keep it on only those objects.
      </span>

      <Button
        fullWidth
        isDisabled={isSubmitting || !hasEdits}
        isPending={isSubmitting}
        variant='primary'
        onPress={handleSave}
      >
        <IconTagMultiple />
        Save Tags
      </Button>
    </div>
  );

  return (
    <DataList
      allowsMultipleExpanded
      selectionMode
      showCounts
      currentContext={currentContext}
      defaultExpandedIds={['dataflow_group', 'output_group']}
      footer={tagEditor}
      headerActions={['reload', 'refresh']}
      isRefreshing={isRefreshing}
      isSelectable={isSelectable}
      itemLabel='object'
      items={dataListItems}
      objectId={objectId}
      objectType='DATAFLOW_TYPE'
      selectedIds={selectedIds}
      selectionToolbar={selectionToolbar}
      subtext={`${selectedObjects.length} of ${readableObjects.length} selected`}
      title={`Manage Tags for **${dataflowName}**`}
      viewType='manageTags'
      onClose={onBackToDefault}
      onRefresh={handleRefresh}
      onSelectionChange={handleSelectionChange}
      onStatusUpdate={onStatusUpdate}
    />
  );
}

// Map each group id to its readable child leaf ids. Unreadable datasets are
// omitted so a group toggle never selects something we can't safely write.
function buildGroupChildren(objects) {
  const map = { dataflow_group: [], input_group: [], output_group: [] };
  for (const o of objects) {
    if (o.readable) map[`${o.role}_group`].push(o.id);
  }
  return map;
}

// Add a group id to the selection iff all of its children are selected, else
// remove it. Keeps each group-header checkbox in sync with its children.
function reconcileGroupSelection(selection, groupChildren) {
  const next = new Set(selection);
  for (const [groupId, children] of Object.entries(groupChildren)) {
    if (children.length > 0 && children.every((c) => next.has(c))) next.add(groupId);
    else next.delete(groupId);
  }
  return next;
}
