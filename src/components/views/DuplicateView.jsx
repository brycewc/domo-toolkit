import {
  Button,
  Card,
  Chip,
  Disclosure,
  FieldError,
  Input,
  Label,
  ScrollShadow,
  Separator,
  Spinner,
  TextField,
  Tooltip
} from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { duplicateUser, fetchDuplicationPreview } from '@/services/duplicate';
import { exportToExcel, generateExportFilename } from '@/utils/exportData';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheck from '@icons/check.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

import { DataList } from './DataList';

const LOG_COLUMNS = [
  { accessorKey: 'Date', header: 'Date' },
  { accessorKey: 'Object Type', header: 'Object Type' },
  { accessorKey: 'Object ID', header: 'Object ID' },
  { accessorKey: 'Object Name', header: 'Object Name' },
  { accessorKey: 'Status', header: 'Status' },
  { accessorKey: 'Notes', header: 'Notes' },
  { accessorKey: 'Source User ID', header: 'Source User ID' },
  { accessorKey: 'Source User Name', header: 'Source User Name' },
  { accessorKey: 'New User ID', header: 'New User ID' },
  { accessorKey: 'New User Name', header: 'New User Name' }
];

/**
 * Registry of duplicatable object types. Add an entry here to support a new
 * typeId. Each entry defines the form fields, the preview fetcher, how to
 * render the preview, and the step-by-step status rows. USER currently calls
 * `duplicateUser` directly from `handleSubmit` so it can close over selection
 * state; the `run` field is reserved for future declarative types.
 */
const duplicatorsByType = {
  USER: {
    fetchPreview: ({ sourceUserId, tabId }) => fetchDuplicationPreview({ sourceUserId, tabId }),
    fields: [
      { key: 'newDisplayName', label: 'Full Name', required: true },
      { key: 'newEmail', label: 'Email', required: true, type: 'email' }
    ],
    steps: [
      { key: 'createUser', label: 'Create new user' },
      { key: 'copyProfile', label: 'Copy profile fields' },
      { key: 'copyLocale', label: 'Copy locale' },
      { key: 'addGroups', label: 'Add to groups' },
      { key: 'shareCards', label: 'Share individually-shared cards' },
      { key: 'sharePages', label: 'Share individually-shared pages' },
      { key: 'shareApps', label: 'Share individually-shared apps' }
    ],
    title: 'Duplicate User'
  }
};

const buildInitialStepStates = (steps) => Object.fromEntries(steps.map((s) => [s.key, { status: 'idle' }]));

const buildInitialValues = (fields) => Object.fromEntries(fields.map((f) => [f.key, '']));

export function DuplicateView({ instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContext, setCurrentContext] = useState(null);
  const [sourceUser, setSourceUser] = useState(null);
  const [config, setConfig] = useState(null);
  const [values, setValues] = useState({});
  const [preview, setPreview] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepStates, setStepStates] = useState({});
  const [completedResult, setCompletedResult] = useState(null);
  const [selectedCardIds, setSelectedCardIds] = useState(() => new Set());
  const [selectedPageIds, setSelectedPageIds] = useState(() => new Set());
  const [selectedAppIds, setSelectedAppIds] = useState(() => new Set());
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
      if (!data || data.type !== 'duplicate') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }
      const typeId = context.domoObject?.typeId;
      const typeConfig = duplicatorsByType[typeId];
      if (!typeConfig) {
        onStatusUpdate?.('Error', `Duplication is not supported for ${typeId}`, 'danger');
        onBackToDefault?.();
        return;
      }
      setCurrentContext(context);
      setConfig(typeConfig);
      setValues(buildInitialValues(typeConfig.fields));
      setStepStates(buildInitialStepStates(typeConfig.steps));
      const userId = context.domoObject?.id;
      const userName = context.domoObject?.metadata?.name || context.domoObject?.metadata?.displayName || `User ${userId}`;
      if (userId) setSourceUser({ id: userId, name: userName });
    } catch (error) {
      console.error('[DuplicateView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!config || !sourceUser || !currentContext) return;
    loadPreview();
  }, [config, sourceUser, currentContext]);

  const loadPreview = async () => {
    if (!mountedRef.current) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await config.fetchPreview({
        sourceUserId: sourceUser.id,
        tabId: currentContext.tabId
      });
      if (mountedRef.current) setPreview(data);
    } catch (error) {
      console.error('[DuplicateView] Error loading preview:', error);
      if (mountedRef.current) setPreviewError(error.message || 'Failed to load preview');
    } finally {
      if (mountedRef.current) setIsPreviewLoading(false);
    }
  };

  useEffect(() => {
    if (!preview) return;
    setSelectedCardIds(new Set(preview.cards.map((c) => String(c.id))));
    setSelectedPageIds(new Set(preview.pages.map((p) => String(p.id))));
    setSelectedAppIds(new Set(preview.customApps.map((a) => String(a.id))));
  }, [preview]);

  const setValue = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const fieldValidity = (field) => {
    const trimmed = (values[field.key] ?? '').trim();
    return { ok: !field.required || !!trimmed };
  };

  const canSubmit = !!config && !!preview && !isSubmitting && config.fields.every((f) => fieldValidity(f).ok);
  const hasStarted = Object.values(stepStates).some((s) => s.status !== 'idle');

  const handleSubmit = async () => {
    if (!canSubmit || !sourceUser) return;
    setIsSubmitting(true);
    setCompletedResult(null);
    setStepStates(buildInitialStepStates(config.steps));

    try {
      const selectedCards = preview.cards.filter((c) => selectedCardIds.has(String(c.id)));
      const selectedPages = preview.pages.filter((p) => selectedPageIds.has(String(p.id)));
      const selectedApps = preview.customApps.filter((a) => selectedAppIds.has(String(a.id)));

      const result = await duplicateUser({
        cards: selectedCards.map((c) => ({ id: c.id, name: c.name })),
        customApps: selectedApps.map((a) => ({ id: a.id, name: a.name })),
        groups: preview.groups,
        locale: preview.locale,
        newDisplayName: values.newDisplayName.trim(),
        newEmail: values.newEmail.trim(),
        onStepProgress: (stepKey, status, res) => {
          if (!mountedRef.current) return;
          setStepStates((prev) => ({
            ...prev,
            [stepKey]: { result: res, status }
          }));
        },
        pages: selectedPages.map((p) => ({ id: p.id, title: p.title })),
        profileFields: preview.profileFields,
        sourceUserId: sourceUser.id,
        tabId: currentContext.tabId
      });

      if (!mountedRef.current) return;
      setCompletedResult(result);

      await downloadAuditLog({ result, sourceUser });

      const sharedCardCount = result.cardResults.attempted.length - result.cardResults.errors.length;
      const sharedPageCount = result.pageResults.attempted.length - result.pageResults.errors.length;
      const appsSkipped = result.appResults.attempted.length;

      if (result.success) {
        const appNote = appsSkipped > 0 ? `, **${appsSkipped}** apps skipped (manual)` : '';
        showStatus(
          'Duplication Complete',
          `Created **${result.newUser.displayName}**. Shared **${sharedCardCount}** cards, **${sharedPageCount}** pages${appNote}. Audit log downloaded.`,
          'success',
          6000
        );
      } else if (result.newUser) {
        showStatus(
          'Duplicated with Warnings',
          `Created **${result.newUser.displayName}** but **${result.errors.length || result.cardResults.errors.length + result.pageResults.errors.length}** step(s) had failures. See audit log.`,
          'warning',
          7000
        );
      } else {
        showStatus('Duplication Failed', result.errors[0]?.message || 'Unable to create new user', 'danger', 5000);
      }
    } catch (error) {
      showStatus('Duplication Failed', error.message || 'An error occurred', 'danger', 5000);
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  async function downloadAuditLog({ result, sourceUser }) {
    if (!result?.newUser) return;
    try {
      const rows = buildDuplicationLogRows({ result, sourceUser });
      if (rows.length === 0) return;
      await exportToExcel(rows, LOG_COLUMNS, generateExportFilename('duplicated-user'), 'Duplication Log');
    } catch (err) {
      console.error('[DuplicateView] Failed to write audit log:', err);
    }
  }

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
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-2'>
        <Card.Title className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 pt-1'>
            <div className='flex items-center gap-1.5'>
              <div className='truncate'>{config?.title || 'Duplicate'}</div>
              <Chip className='shrink-0' color='accent' size='sm' variant='soft'>
                Beta
              </Chip>
            </div>
            {sourceUser && <div className='truncate text-xs font-normal text-muted'>from {sourceUser.name}</div>}
          </div>
          {onBackToDefault && (
            <Tooltip>
              <Button isIconOnly size='sm' variant='ghost' onPress={onBackToDefault}>
                <IconX />
              </Button>
              <Tooltip.Content className='max-w-60'>Close</Tooltip.Content>
            </Tooltip>
          )}
        </Card.Title>
        <Separator />
      </Card.Header>

      <div className='flex shrink-0 flex-col gap-2'>
        {config?.fields.map((field) => (
          <TextField
            id={`duplicate-${field.key}`}
            isRequired={field.required}
            key={field.key}
            name={field.key}
            type={field?.type}
            variant='secondary'
          >
            <Label>{field.label}</Label>
            <Input className='h-8' value={values[field.key] ?? ''} onChange={(e) => setValue(field.key, e.target.value)} />
            <FieldError className='text-xs text-danger'>Invalid {field.label.toLowerCase()}</FieldError>
          </TextField>
        ))}

        <Separator className='mt-1' />
      </div>

      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto px-1 py-2' offset={5} orientation='vertical'>
        <PreviewPanel
          error={previewError}
          isLoading={isPreviewLoading}
          preview={preview}
          selectedAppIds={selectedAppIds}
          selectedCardIds={selectedCardIds}
          selectedPageIds={selectedPageIds}
          setSelectedAppIds={setSelectedAppIds}
          setSelectedCardIds={setSelectedCardIds}
          setSelectedPageIds={setSelectedPageIds}
          onRetry={loadPreview}
        />

        {hasStarted && config && (
          <>
            <Separator className='my-3' />
            <div className='mb-1 text-xs font-medium text-muted uppercase'>Progress</div>
            {config.steps.map((step) => (
              <StepRow key={step.key} state={stepStates[step.key]} step={step} />
            ))}
          </>
        )}
      </ScrollShadow>

      <Separator />

      <div className='flex shrink-0 flex-col gap-2'>
        <Button fullWidth isDisabled={!canSubmit} isPending={isSubmitting} variant='primary' onPress={handleSubmit}>
          {isSubmitting ? <Spinner color='currentColor' size='sm' /> : completedResult?.success ? 'Duplicated' : 'Duplicate'}
        </Button>
      </div>
    </Card>
  );
}

function AggregateRow({ emptyText, items, label }) {
  const count = items.length;
  if (count === 0) {
    return (
      <div className='flex items-center justify-between py-1'>
        <span className='text-sm'>{label}</span>
        <span className='shrink-0 text-xs text-muted'>{emptyText || 'None'}</span>
      </div>
    );
  }
  if (count <= 3) {
    return (
      <div className='flex items-start justify-between gap-2 py-1'>
        <span className='text-sm'>{label}</span>
        <span className='min-w-0 shrink-0 text-right text-xs text-muted'>{items.join(', ')}</span>
      </div>
    );
  }
  return (
    <Disclosure>
      <Disclosure.Heading>
        <Button className='h-auto w-full justify-between px-0 py-1 font-normal' slot='trigger' variant='ghost'>
          <span className='text-sm'>{label}</span>
          <span className='flex items-center gap-1 text-xs text-muted'>
            {count}
            <Disclosure.Indicator />
          </span>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className='pt-0 pb-1 pl-2'>
          <ul className='list-none space-y-0.5'>
            {items.slice(0, 20).map((item, i) => (
              <li className='text-xs text-muted' key={i}>
                {item}
              </li>
            ))}
            {items.length > 20 && <li className='text-xs text-muted'>...and {items.length - 20} more</li>}
          </ul>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function buildDuplicationLogRows({ result, sourceUser }) {
  const date = new Date().toISOString().slice(0, -5);
  const sourceCols = {
    'Source User ID': sourceUser.id,
    'Source User Name': sourceUser.name
  };
  const newCols = {
    'New User ID': result.newUser?.id ?? '',
    'New User Name': result.newUser?.displayName ?? ''
  };
  const baseRow = (overrides) => ({
    ...sourceCols,
    ...newCols,
    'Date': date,
    'Notes': '',
    'Object ID': '',
    'Object Name': '',
    'Object Type': '',
    'Status': '',
    ...overrides
  });

  const rows = [];

  // USER (the new user creation)
  rows.push(
    baseRow({
      'Notes': result.newUser ? '' : result.errors[0]?.message || 'Failed',
      'Object ID': result.newUser?.id ?? '',
      'Object Name': result.newUser?.displayName ?? '',
      'Object Type': 'USER',
      'Status': result.newUser ? 'CREATED' : 'FAILED'
    })
  );

  // PROFILE_FIELD per field
  const profileError = result.errors.find((e) => e.step === 'copyProfile');
  if (profileError) {
    rows.push(
      baseRow({
        'Notes': profileError.message,
        'Object ID': '(all)',
        'Object Type': 'PROFILE_FIELD',
        'Status': 'FAILED'
      })
    );
  } else {
    for (const key of result.copied.fields) {
      rows.push(
        baseRow({
          'Object ID': key,
          'Object Name': '',
          'Object Type': 'PROFILE_FIELD',
          'Status': 'COPIED'
        })
      );
    }
  }

  // LOCALE
  const localeError = result.errors.find((e) => e.step === 'copyLocale');
  if (localeError) {
    rows.push(
      baseRow({
        'Notes': localeError.message,
        'Object Type': 'LOCALE',
        'Status': 'FAILED'
      })
    );
  } else if (result.copied.locale) {
    rows.push(
      baseRow({
        'Notes': result.copied.locale,
        'Object Name': result.copied.locale,
        'Object Type': 'LOCALE',
        'Status': 'COPIED'
      })
    );
  }

  // GROUP per group
  const groupError = result.errors.find((e) => e.step === 'addGroups');
  if (groupError) {
    rows.push(
      baseRow({
        'Notes': groupError.message,
        'Object ID': '(all)',
        'Object Type': 'GROUP',
        'Status': 'FAILED'
      })
    );
  } else {
    for (const g of result.copied.groups) {
      rows.push(
        baseRow({
          'Object ID': g.groupId,
          'Object Name': g.groupName,
          'Object Type': 'GROUP',
          'Status': 'ADDED'
        })
      );
    }
  }

  // CARDS
  const cardErrorsById = new Map((result.cardResults.errors || []).map((e) => [e.id, e.error]));
  for (const c of result.cardResults.attempted) {
    const err = cardErrorsById.get(c.id) ?? cardErrorsById.get('all');
    rows.push(
      baseRow({
        'Notes': err ?? '',
        'Object ID': c.id,
        'Object Name': c.name,
        'Object Type': 'CARD',
        'Status': err ? 'FAILED' : 'SHARED'
      })
    );
  }

  // PAGES
  const pageErrorsById = new Map((result.pageResults.errors || []).map((e) => [e.id, e.error]));
  for (const p of result.pageResults.attempted) {
    const err = pageErrorsById.get(p.id) ?? pageErrorsById.get('all');
    rows.push(
      baseRow({
        'Notes': err ?? '',
        'Object ID': p.id,
        'Object Name': p.title,
        'Object Type': 'PAGE',
        'Status': err ? 'FAILED' : 'SHARED'
      })
    );
  }

  // CUSTOM APPS (audit-only)
  const appErrorsById = new Map((result.appResults.errors || []).map((e) => [e.id, e.error]));
  for (const a of result.appResults.attempted) {
    const err = appErrorsById.get(a.id) ?? appErrorsById.get('all');
    rows.push(
      baseRow({
        'Notes': err ?? 'Manual sharing required',
        'Object ID': a.id,
        'Object Name': a.name,
        'Object Type': 'CUSTOM_APP',
        'Status': 'SKIPPED'
      })
    );
  }

  return rows;
}

function formatStepDetail(stepKey, result) {
  if (!result) return null;
  if (stepKey === 'copyLocale') return result.locale || null;
  if (stepKey === 'shareApps' && result.skipped) return `${result.skipped} manual`;
  if (typeof result.count === 'number') {
    return result.count > 0 ? String(result.count) : 'None';
  }
  if (stepKey === 'createUser' && result.id) return `#${result.id}`;
  return null;
}

function PreviewPanel({
  error,
  isLoading,
  onRetry,
  preview,
  selectedAppIds,
  selectedCardIds,
  selectedPageIds,
  setSelectedAppIds,
  setSelectedCardIds,
  setSelectedPageIds
}) {
  if (isLoading) {
    return (
      <div className='flex items-center justify-center gap-2 py-4'>
        <Spinner size='sm' />
        <span className='text-sm text-muted'>Loading preview...</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className='flex items-center gap-2 py-2'>
        <IconExclamationTriangle className='shrink-0 text-danger' size={18} />
        <span className='min-w-0 flex-1 text-sm text-danger'>{error}</span>
        <Button size='sm' variant='tertiary' onPress={onRetry}>
          <IconSync />
          Retry
        </Button>
      </div>
    );
  }
  if (!preview) return null;

  return (
    <div className='flex flex-col gap-1'>
      <div className='mb-1 text-xs font-medium text-muted uppercase'>Will be copied</div>

      <AggregateRow
        emptyText='None'
        items={preview.source.roleId != null ? [`Role ID ${preview.source.roleId}`] : []}
        label='Role'
      />
      <AggregateRow
        emptyText='None'
        items={preview.profileFields.map((f) => `${f.key}: ${f.value}`)}
        label='Profile fields'
      />
      <AggregateRow emptyText='Not set' items={preview.locale ? [preview.locale] : []} label='Locale' />
      <AggregateRow emptyText='None' items={preview.groups.map((g) => g.groupName)} label='Group memberships' />

      <SelectableSection
        emptyText='None'
        items={preview.cards}
        itemTypeId='CARD'
        label='Individually-shared cards'
        nameField='name'
        selectedIds={selectedCardIds}
        setSelectedIds={setSelectedCardIds}
      />
      <SelectableSection
        emptyText='None'
        items={preview.pages}
        itemTypeId='PAGE'
        label='Individually-shared pages'
        nameField='title'
        selectedIds={selectedPageIds}
        setSelectedIds={setSelectedPageIds}
      />
      <SelectableSection
        emptyText='None'
        helperText='App sharing is not yet implemented. Listed items will be recorded in the audit log so you can share them manually.'
        items={preview.customApps}
        itemTypeId='APP'
        label='Individually-shared apps'
        nameField='name'
        selectedIds={selectedAppIds}
        setSelectedIds={setSelectedAppIds}
      />
    </div>
  );
}

function SelectableSection({ emptyText, helperText, items, itemTypeId, label, nameField, selectedIds, setSelectedIds }) {
  const dataListItems = useMemo(
    () =>
      items.map(
        (item) =>
          new DataListItem({
            id: String(item.id),
            label: item[nameField] || `${itemTypeId} ${item.id}`,
            typeId: itemTypeId
          })
      ),
    [items, itemTypeId, nameField]
  );

  if (items.length === 0) {
    return (
      <div className='flex items-center justify-between py-1'>
        <span className='text-sm'>{label}</span>
        <span className='shrink-0 text-xs text-muted'>{emptyText || 'None'}</span>
      </div>
    );
  }

  const selectAll = () => setSelectedIds(new Set(items.map((it) => String(it.id))));
  const deselectAll = () => setSelectedIds(new Set());

  return (
    <Disclosure>
      <Disclosure.Heading>
        <Button className='h-auto w-full justify-between px-0 py-1 font-normal' slot='trigger' variant='ghost'>
          <span className='text-sm'>{label}</span>
          <span className='flex items-center gap-1 text-xs text-muted'>
            {selectedIds.size} of {items.length}
            <Disclosure.Indicator />
          </span>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className='pt-0 pb-1 pl-2'>
          <p className='mb-1 text-xs text-muted italic'>
            Deselecting a row only skips its direct share. The new user may still see it through inherited group or Workspace
            access.
            {helperText ? ` ${helperText}` : ''}
          </p>
          <DataList
            isSelectable={() => true}
            items={dataListItems}
            selectedIds={selectedIds}
            selectionMode={true}
            showActions={false}
            showCounts={false}
            variant='transparent'
            onSelectionChange={setSelectedIds}
            selectionToolbar={
              <div className='flex gap-1'>
                <Button size='sm' variant='tertiary' onPress={selectAll}>
                  Select all
                </Button>
                <Button size='sm' variant='tertiary' onPress={deselectAll}>
                  Deselect all
                </Button>
              </div>
            }
          />
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}

function StepRow({ state, step }) {
  const status = state?.status || 'idle';
  const result = state?.result;
  if (status === 'idle') {
    return (
      <div className='flex items-center justify-between py-1' key={step.key}>
        <div className='flex items-center gap-2'>
          <span className='inline-block h-4.5 w-4.5 shrink-0 rounded-full border border-muted' />
          <span className='text-sm text-muted'>{step.label}</span>
        </div>
      </div>
    );
  }
  if (status === 'running') {
    return (
      <div className='flex items-center justify-between py-1' key={step.key}>
        <div className='flex items-center gap-2'>
          <Spinner className='shrink-0 text-accent' color='current' size='sm' />
          <span className='text-sm'>{step.label}</span>
        </div>
      </div>
    );
  }
  if (status === 'done') {
    const detail = formatStepDetail(step.key, result);
    return (
      <div className='flex items-center justify-between py-1' key={step.key}>
        <div className='flex items-center gap-2'>
          <IconCheck className='shrink-0 text-success' size={18} />
          <span className='text-sm'>{step.label}</span>
        </div>
        {detail && <span className='shrink-0 text-xs text-success'>{detail}</span>}
      </div>
    );
  }
  return (
    <div className='flex items-center justify-between py-1' key={step.key}>
      <div className='flex items-center gap-2'>
        <IconX className='shrink-0 text-danger' size={18} />
        <span className='text-sm'>{step.label}</span>
      </div>
      <span className='shrink-0 text-xs text-danger'>Failed</span>
    </div>
  );
}
