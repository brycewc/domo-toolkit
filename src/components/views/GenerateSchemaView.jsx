import {
  Button,
  Card,
  Input,
  Label,
  ListBox,
  ScrollShadow,
  Select,
  Separator,
  Spinner,
  TextField,
  Tooltip
} from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DomoContext } from '@/models/DomoContext';
import {
  queryAppDbCollectionDocuments,
  setAppDbCollectionSyncEnabled,
  syncAppDbDatastore,
  updateAppDbCollectionSchema
} from '@/services/appDb';
import { buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconMagic from '@icons/magic.svg?react';
import IconPlus from '@icons/plus.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconTrash from '@icons/trash.svg?react';

import { ViewHeader } from './ViewHeader';

const TYPE_OPTIONS = ['STRING', 'LONG', 'DOUBLE', 'DECIMAL', 'DATE', 'DATETIME'];
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function GenerateSchemaView({ instance = null, liveContext = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentContext, setCurrentContext] = useState(null);
  const [collectionName, setCollectionName] = useState('');
  const [columns, setColumns] = useState([]);
  const [error, setError] = useState(null);
  const nextIdRef = useRef(0);
  const mountedRef = useRef(true);
  const { showPromiseStatus, showStatus } = useStatusBar();

  const allocateId = () => `col-${nextIdRef.current++}`;

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
      if (!data || data.type !== 'generateSchema') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context?.domoObject || context.domoObject.typeId !== 'MAGNUM_COLLECTION') {
        onStatusUpdate?.('Error', 'No AppDB collection context available', 'danger');
        onBackToDefault?.();
        return;
      }

      const collectionId = context.domoObject.id;
      const tabId = context.tabId;
      const docs = await queryAppDbCollectionDocuments({ collectionId, tabId });

      if (!mountedRef.current) return;

      if (!docs || docs.length === 0) {
        showStatus('Nothing to infer', 'No documents found in this collection, cannot infer a schema', 'warning');
        onBackToDefault?.();
        return;
      }

      const inferred = inferColumnsFromDocuments(docs);
      if (inferred.length === 0) {
        showStatus('Nothing to infer', 'Documents were found but none have content keys to infer from', 'warning');
        onBackToDefault?.();
        return;
      }

      setCurrentContext(context);
      setCollectionName(context.domoObject.metadata?.name || `Collection ${context.domoObject.id}`);
      setColumns(inferred.map((col) => ({ id: allocateId(), ...col })));
      setError(null);
    } catch (err) {
      console.error('[GenerateSchemaView] Error loading data:', err);
      if (mountedRef.current) setError(err.message || 'Failed to load documents');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const updateColumn = (id, patch) => {
    setColumns((prev) => prev.map((col) => (col.id === id ? { ...col, ...patch } : col)));
  };

  const removeColumn = (id) => {
    setColumns((prev) => prev.filter((col) => col.id !== id));
  };

  const addColumn = () => {
    setColumns((prev) => [...prev, { id: allocateId(), name: '', type: 'STRING' }]);
  };

  const validation = useMemo(() => {
    if (columns.length === 0) {
      return { isValid: false, reason: 'Add at least one column before saving' };
    }
    const trimmedNames = columns.map((col) => col.name.trim());
    if (trimmedNames.some((name) => name === '')) {
      return { isValid: false, reason: 'Every column needs a name' };
    }
    const dupes = new Set();
    const seen = new Set();
    for (const name of trimmedNames) {
      if (seen.has(name)) dupes.add(name);
      seen.add(name);
    }
    if (dupes.size > 0) {
      return {
        isValid: false,
        reason: `Duplicate column names: ${[...dupes].join(', ')}`
      };
    }
    return { isValid: true, reason: null };
  }, [columns]);

  const buildSchemaPayload = () => columns.map((col) => ({ name: col.name.trim(), type: col.type }));

  const handleApply = () => {
    if (!validation.isValid || !currentContext) return;
    const collectionId = currentContext.domoObject.id;
    const tabId = currentContext.tabId;
    const payload = buildSchemaPayload();
    setIsSubmitting(true);

    const promise = updateAppDbCollectionSchema({
      collectionId,
      columns: payload,
      tabId
    });

    showPromiseStatus(promise, {
      error: (err) => `Failed to save schema for **${collectionName}**: ${err.message}`,
      loading: `Saving schema for **${collectionName}**...`,
      success: () =>
        `Schema saved for **${collectionName}** (${payload.length} ${payload.length === 1 ? 'column' : 'columns'})`
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

  const handleApplyAndSync = async () => {
    if (!validation.isValid || !currentContext) return;
    const collectionId = currentContext.domoObject.id;
    const datastoreId = currentContext.domoObject.parentId;
    const tabId = currentContext.tabId;
    const payload = buildSchemaPayload();

    if (!datastoreId) {
      onStatusUpdate?.('Cannot sync', 'Parent datastore id is missing on this collection', 'danger');
      return;
    }

    setIsSubmitting(true);
    try {
      await showPromiseStatus(
        (async () => {
          await updateAppDbCollectionSchema({ collectionId, columns: payload, tabId });
          await setAppDbCollectionSyncEnabled({ collectionId, syncEnabled: true, tabId });
          await syncAppDbDatastore({ datastoreId, tabId });
        })(),
        {
          error: (err) => {
            if (err?.syncFailed) {
              return `Schema saved for **${collectionName}**, but datastore sync failed: ${err.message}`;
            }
            return `Failed to save schema for **${collectionName}**: ${err.message}`;
          },
          loading: `Saving schema and syncing datastore for **${collectionName}**...`,
          success: () =>
            `Schema saved and sync started for **${collectionName}** (${payload.length} ${
              payload.length === 1 ? 'column' : 'columns'
            })`
        }
      );
      if (mountedRef.current) onBackToDefault?.();
    } catch {
      // toast already surfaced; keep view open so the user can retry
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  const reloadAction = buildReloadAction({
    currentContext: liveContext,
    objectId: currentContext?.domoObject?.id,
    objectType: currentContext?.domoObject?.typeId,
    onStatusUpdate,
    viewType: 'generateSchema'
  });

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Querying documents and inferring schema...</p>
        </Card.Content>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className='flex h-full w-full flex-col p-2'>
        <ViewHeader
          actions={[reloadAction]}
          feature='Generate Schema'
          featureIcon={<IconMagic />}
          onClose={onBackToDefault}
        />
        <Separator />
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <IconExclamationTriangle className='text-danger' />
          <p className='text-sm text-danger'>{error}</p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        actions={[reloadAction]}
        feature='Generate Schema'
        featureIcon={<IconMagic />}
        subtext={collectionName ? `Collection: ${collectionName}` : null}
        onClose={onBackToDefault}
      />
      <Separator />
      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
        <Card.Content className='flex flex-col gap-2 py-2'>
          <p className='text-xs text-muted'>
            Inferred from the 100 most recent documents. Rename, retype, add, or remove columns before saving.
          </p>
          {columns.map((col) => (
            <ColumnRow
              column={col}
              isDisabled={isSubmitting}
              key={col.id}
              onChangeName={(name) => updateColumn(col.id, { name })}
              onChangeType={(type) => updateColumn(col.id, { type })}
              onRemove={() => removeColumn(col.id)}
            />
          ))}
          <Button className='self-start' isDisabled={isSubmitting} size='sm' variant='tertiary' onPress={addColumn}>
            <IconPlus /> Add column
          </Button>
        </Card.Content>
      </ScrollShadow>

      <div className='flex shrink-0 flex-col gap-2 border-t border-border px-3 py-2'>
        <Tooltip isDisabled={validation.isValid}>
          <Button fullWidth isDisabled={isSubmitting || !validation.isValid} variant='tertiary' onPress={handleApply}>
            <IconCheck /> Apply Schema
          </Button>
          <Tooltip.Content className='max-w-60'>{validation.reason}</Tooltip.Content>
        </Tooltip>
        <Tooltip isDisabled={validation.isValid}>
          <Button
            fullWidth
            isDisabled={isSubmitting || !validation.isValid}
            isPending={isSubmitting}
            variant='primary'
            onPress={handleApplyAndSync}
          >
            <IconSync /> Apply Schema and Sync
          </Button>
          <Tooltip.Content className='max-w-60'>{validation.reason}</Tooltip.Content>
        </Tooltip>
      </div>
    </Card>
  );
}

function classifyValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? 'LONG' : 'DOUBLE';
  }
  if (typeof value === 'string') {
    if (ISO_DATETIME_RE.test(value)) return 'DATETIME';
    if (ISO_DATE_RE.test(value)) return 'DATE';
  }
  return 'STRING';
}

function ColumnRow({ column, isDisabled, onChangeName, onChangeType, onRemove }) {
  return (
    <div className='flex items-end gap-1'>
      <TextField className='min-w-0 flex-1' id={`col-name-${column.id}`} name='columnName' variant='secondary'>
        <Label className='text-xs'>Name</Label>
        <Input className='h-8' isDisabled={isDisabled} value={column.name} onChange={(e) => onChangeName(e.target.value)} />
      </TextField>
      <div className='flex w-32 flex-col gap-1'>
        <Label className='text-xs'>Type</Label>
        <Select
          isDisabled={isDisabled}
          selectionMode='single'
          value={column.type}
          variant='secondary'
          onChange={(key) => onChangeType(key)}
        >
          <Select.Trigger className='h-8 items-center py-0'>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover className='max-h-60!'>
            <ListBox>
              {TYPE_OPTIONS.map((opt) => (
                <ListBox.Item id={opt} key={opt} textValue={opt}>
                  <Label>{opt}</Label>
                  <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      <Tooltip>
        <Button isIconOnly aria-label='Remove column' isDisabled={isDisabled} size='sm' variant='ghost' onPress={onRemove}>
          <IconTrash className='text-danger' />
        </Button>
        <Tooltip.Content className='max-w-60'>Remove column</Tooltip.Content>
      </Tooltip>
    </div>
  );
}

function inferColumnsFromDocuments(documents) {
  const orderedKeys = [];
  const seen = new Set();
  const valuesByKey = new Map();

  for (const doc of documents) {
    const content = doc?.content;
    if (!content || typeof content !== 'object') continue;
    for (const [key, value] of Object.entries(content)) {
      if (!seen.has(key)) {
        seen.add(key);
        orderedKeys.push(key);
        valuesByKey.set(key, []);
      }
      if (value !== null && value !== undefined) {
        valuesByKey.get(key).push(value);
      }
    }
  }

  return orderedKeys.map((key) => {
    const samples = valuesByKey.get(key) || [];
    if (samples.length === 0) return { name: key, type: 'STRING' };
    const buckets = new Set(samples.map(classifyValue));
    if (buckets.size === 1) return { name: key, type: [...buckets][0] };
    if (buckets.size === 2 && buckets.has('LONG') && buckets.has('DOUBLE')) {
      return { name: key, type: 'DOUBLE' };
    }
    return { name: key, type: 'STRING' };
  });
}
