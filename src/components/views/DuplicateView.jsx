import {
  Button,
  Card,
  Disclosure,
  FieldError,
  Input,
  Label,
  ScrollShadow,
  Separator,
  Spinner,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { UserComboBox } from '@/components/UserComboBox';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { addAccessToExistingUser, duplicateUser, fetchDuplicationPreview } from '@/services/duplicate';
import { getUserDetails } from '@/services/users';
import { exportToExcel, generateExportFilename } from '@/utils/exportData';
import { buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheck from '@icons/check.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconPersonPlus from '@icons/person-plus.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

import { DataList } from './DataList';
import { ViewHeader } from './ViewHeader';

// The subset of duplication steps that are purely additive grants. The
// "add to existing user" mode runs only these (no create/profile/locale).
const GRANT_STEP_KEYS = new Set(['addGroups', 'shareApps', 'shareCards', 'sharePages']);

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

export function DuplicateView({ instance = null, liveContext = null, onBackToDefault = null, onStatusUpdate = null }) {
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
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [mode, setMode] = useState('create');
  const [targetUser, setTargetUser] = useState(null);
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

  // Map of group-parent id -> its leaf ids, plus the flat leaf list. Leaf ids are
  // namespaced (`card:123`) so the single DataList selection Set never collides a
  // card id with a page id, and the parent id (`cards`) drives the group checkbox.
  const { allLeafIds, groupLeafMap, items } = useMemo(() => {
    if (!preview) return { allLeafIds: [], groupLeafMap: {}, items: [] };
    const groups = [
      { idField: 'groupId', idPrefix: 'group', label: 'Group memberships', list: preview.groups, nameField: 'groupName', parentId: 'groups', typeId: 'GROUP' },
      { idField: 'id', idPrefix: 'card', label: 'Individually-shared cards', list: preview.cards, nameField: 'name', parentId: 'cards', typeId: 'CARD' },
      { idField: 'id', idPrefix: 'page', label: 'Individually-shared pages', list: preview.pages, nameField: 'title', parentId: 'pages', typeId: 'PAGE' },
      { idField: 'id', idPrefix: 'app', label: 'Individually-shared apps', list: preview.customApps, nameField: 'name', parentId: 'apps', typeId: 'APP' }
    ];
    const map = {};
    const leaves = [];
    const built = [];
    for (const g of groups) {
      if (!g.list.length) continue;
      const childIds = g.list.map((item) => `${g.idPrefix}:${item[g.idField]}`);
      map[g.parentId] = childIds;
      leaves.push(...childIds);
      built.push(
        DataListItem.createGroup({
          children: g.list.map(
            (item) =>
              new DataListItem({
                id: `${g.idPrefix}:${item[g.idField]}`,
                label: item[g.nameField] || `${g.typeId} ${item[g.idField]}`,
                originalId: item[g.idField],
                typeId: g.typeId
              })
          ),
          childTypeId: g.typeId,
          id: g.parentId,
          label: g.label
        })
      );
    }
    return { allLeafIds: leaves, groupLeafMap: map, items: built };
  }, [preview]);

  // Default every shared item to selected once the preview loads.
  useEffect(() => {
    if (!preview) return;
    const next = new Set(allLeafIds);
    for (const parentId of Object.keys(groupLeafMap)) next.add(parentId);
    setSelectedIds(next);
  }, [preview, allLeafIds, groupLeafMap]);

  const setValue = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const fieldValidity = (field) => {
    const trimmed = (values[field.key] ?? '').trim();
    return { ok: !field.required || !!trimmed };
  };

  // "existing" mode runs only the additive-grant steps; "create" runs all of them.
  const activeSteps = useMemo(() => {
    if (!config) return [];
    return mode === 'existing' ? config.steps.filter((s) => GRANT_STEP_KEYS.has(s.key)) : config.steps;
  }, [config, mode]);

  const isSelf = !!targetUser?.id && !!sourceUser?.id && String(targetUser.id) === String(sourceUser.id);
  const targetValid = !!targetUser?.id && !isSelf && targetUser.active !== false;

  const canSubmit =
    !!config &&
    !!preview &&
    !isSubmitting &&
    (mode === 'existing' ? targetValid : config.fields.every((f) => fieldValidity(f).ok));
  const hasStarted = Object.values(stepStates).some((s) => s.status !== 'idle');

  const handleModeChange = (keys) => {
    const next = [...keys][0];
    if (!next || next === mode) return;
    setMode(next);
    setCompletedResult(null);
    if (config) setStepStates(buildInitialStepStates(config.steps));
  };

  const handleTargetChange = async (key) => {
    if (key == null) {
      setTargetUser(null);
      return;
    }
    setTargetUser({ active: true, displayName: '', id: key });
    const details = await getUserDetails(key, currentContext?.tabId);
    if (!mountedRef.current) return;
    setTargetUser({
      active: details?.active !== false,
      displayName: details?.displayName ?? `User ${key}`,
      id: key
    });
  };

  // Single flat selection Set for the grouped DataList. Toggling a group parent
  // cascades to its leaves; toggling a leaf reconciles whether its parent is
  // fully selected. Mirrors the parent/child selection pattern in OwnershipView.
  const handleSelectionChange = (incoming) => {
    const next = new Set(incoming);
    const added = [...incoming].filter((id) => !selectedIds.has(id));
    const removed = [...selectedIds].filter((id) => !incoming.has(id));
    for (const id of added) {
      if (groupLeafMap[id]) groupLeafMap[id].forEach((leaf) => next.add(leaf));
    }
    for (const id of removed) {
      if (groupLeafMap[id]) groupLeafMap[id].forEach((leaf) => next.delete(leaf));
    }
    for (const [parentId, leaves] of Object.entries(groupLeafMap)) {
      if (leaves.length > 0 && leaves.every((leaf) => next.has(leaf))) next.add(parentId);
      else next.delete(parentId);
    }
    setSelectedIds(next);
  };

  const handleSubmit = async () => {
    if (!canSubmit || !sourceUser) return;
    setIsSubmitting(true);
    setCompletedResult(null);
    setStepStates(buildInitialStepStates(activeSteps));

    const onStepProgress = (stepKey, status, res) => {
      if (!mountedRef.current) return;
      setStepStates((prev) => ({
        ...prev,
        [stepKey]: { result: res, status }
      }));
    };

    try {
      const selectedGroups = preview.groups.filter((g) => selectedIds.has(`group:${g.groupId}`));
      const selectedCards = preview.cards
        .filter((c) => selectedIds.has(`card:${c.id}`))
        .map((c) => ({ id: c.id, name: c.name }));
      const selectedPages = preview.pages
        .filter((p) => selectedIds.has(`page:${p.id}`))
        .map((p) => ({ id: p.id, title: p.title }));
      const selectedApps = preview.customApps
        .filter((a) => selectedIds.has(`app:${a.id}`))
        .map((a) => ({ id: a.id, name: a.name }));

      const result =
        mode === 'existing'
          ? await addAccessToExistingUser({
              cards: selectedCards,
              customApps: selectedApps,
              groups: selectedGroups,
              onStepProgress,
              pages: selectedPages,
              tabId: currentContext.tabId,
              targetUser
            })
          : await duplicateUser({
              cards: selectedCards,
              customApps: selectedApps,
              groups: selectedGroups,
              locale: preview.locale,
              newDisplayName: values.newDisplayName.trim(),
              newEmail: values.newEmail.trim(),
              onStepProgress,
              pages: selectedPages,
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
      const name = result.newUser?.displayName || targetUser?.displayName || 'user';

      if (result.success) {
        const appNote = appsSkipped > 0 ? `, **${appsSkipped}** apps skipped (manual)` : '';
        const lead = result.created ? `Created **${name}**` : `Added access to **${name}**`;
        showStatus(
          result.created ? 'Duplication Complete' : 'Access Added',
          `${lead}. Shared **${sharedCardCount}** cards, **${sharedPageCount}** pages${appNote}. Audit log downloaded.`,
          'success',
          6000
        );
      } else if (result.newUser) {
        const failures = result.errors.length || result.cardResults.errors.length + result.pageResults.errors.length;
        showStatus(
          result.created ? 'Duplicated with Warnings' : 'Added with Warnings',
          `${result.created ? 'Created' : 'Updated'} **${name}** but **${failures}** step(s) had failures. See audit log.`,
          'warning',
          7000
        );
      } else {
        showStatus(
          result.created ? 'Duplication Failed' : 'Failed to Add Access',
          result.errors[0]?.message || (result.created ? 'Unable to create new user' : 'Unable to add access'),
          'danger',
          5000
        );
      }
    } catch (error) {
      showStatus(
        mode === 'existing' ? 'Failed to Add Access' : 'Duplication Failed',
        error.message || 'An error occurred',
        'danger',
        5000
      );
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  };

  async function downloadAuditLog({ result, sourceUser }) {
    if (!result?.newUser) return;
    try {
      const rows = buildDuplicationLogRows({ result, sourceUser });
      if (rows.length === 0) return;
      const fileLabel = result.created === false ? 'user-access-added' : 'duplicated-user';
      await exportToExcel(rows, LOG_COLUMNS, generateExportFilename(fileLabel), 'Duplication Log');
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
      <ViewHeader
        beta
        feature={mode === 'existing' ? 'Add to Existing User' : config?.title || 'Duplicate'}
        featureIcon={<IconPersonPlus />}
        subtext={sourceUser ? `from ${sourceUser.name}` : undefined}
        onClose={onBackToDefault}
        actions={[
          buildReloadAction({
            currentContext: liveContext,
            objectId: currentContext?.domoObject?.id,
            objectType: currentContext?.domoObject?.typeId,
            onStatusUpdate,
            viewType: 'duplicate'
          })
        ]}
      />
      <Separator />

      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto px-1 py-2' offset={5} orientation='vertical'>
        <div className='flex flex-col gap-2'>
          <ToggleButtonGroup
            disallowEmptySelection
            aria-label='Duplication mode'
            className='w-full'
            isDisabled={isSubmitting}
            selectedKeys={new Set([mode])}
            selectionMode='single'
            size='sm'
            onSelectionChange={handleModeChange}
          >
            <ToggleButton className='flex-1' id='create'>
              New user
            </ToggleButton>
            <ToggleButton className='flex-1' id='existing'>
              Existing user
            </ToggleButton>
          </ToggleButtonGroup>

          {mode === 'create' ? (
            config?.fields.map((field) => (
              <TextField
                id={`duplicate-${field.key}`}
                isRequired={field.required}
                key={field.key}
                name={field.key}
                type={field?.type}
                variant='secondary'
              >
                <Label>{field.label}</Label>
                <Input
                  className='h-8'
                  value={values[field.key] ?? ''}
                  onChange={(e) => setValue(field.key, e.target.value)}
                />
                <FieldError className='text-xs text-danger'>Invalid {field.label.toLowerCase()}</FieldError>
              </TextField>
            ))
          ) : (
            <div className='flex flex-col gap-1'>
              <UserComboBox
                isRequired
                avatarBaseUrl={currentContext?.domoObject?.baseUrl}
                label='Add access to'
                selectedKey={targetUser?.id ?? null}
                tabId={currentContext?.tabId}
                onSelectionChange={handleTargetChange}
              />
              {isSelf && <p className='text-xs text-danger'>You cannot add a user&apos;s access to themselves.</p>}
              {targetUser?.active === false && <p className='text-xs text-danger'>This user is deactivated.</p>}
            </div>
          )}
        </div>

        <Separator className='my-2' />

        {isPreviewLoading ? (
          <div className='flex items-center justify-center gap-2 py-2'>
            <Spinner size='sm' />
            <span className='text-sm text-muted'>Loading preview...</span>
          </div>
        ) : previewError ? (
          <div className='flex items-center gap-2 py-1'>
            <IconExclamationTriangle className='shrink-0 text-danger' size={18} />
            <span className='min-w-0 flex-1 text-sm text-danger'>{previewError}</span>
            <Button size='sm' variant='tertiary' onPress={loadPreview}>
              <IconSync />
              Retry
            </Button>
          </div>
        ) : preview ? (
          <div className='flex flex-col gap-1'>
            {mode === 'create' && (
              <>
                <div className='text-xs font-medium text-muted uppercase'>Always copied</div>
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
                <Separator className='my-1' />
              </>
            )}
            {allLeafIds.length > 0 ? (
              <>
                <div className='text-xs font-medium text-muted uppercase'>
                  {mode === 'existing' ? 'Choose what to add' : 'Choose what to copy'}
                </div>
                <p className='text-xs text-muted italic'>
                  Deselect anything you do not want. Deselecting a card or page skips only its direct share, so the user
                  may still reach it through a group or Workspace.
                  {preview.customApps.length > 0
                    ? ' App sharing is not yet implemented, so checked apps are recorded in the audit log to share manually.'
                    : ''}
                </p>
                <DataList
                  selectionMode
                  items={items}
                  selectedIds={selectedIds}
                  showActions={false}
                  variant='transparent'
                  onSelectionChange={handleSelectionChange}
                />
              </>
            ) : (
              <p className='text-sm text-muted'>No groups or individually-shared content found.</p>
            )}
          </div>
        ) : null}

        {hasStarted && config && (
          <>
            <Separator className='my-3' />
            <div className='mb-1 text-xs font-medium text-muted uppercase'>Progress</div>
            {activeSteps.map((step) => (
              <StepRow key={step.key} state={stepStates[step.key]} step={step} />
            ))}
          </>
        )}
      </ScrollShadow>

      <Separator />

      <div className='flex shrink-0 flex-col gap-2'>
        <Button fullWidth isDisabled={!canSubmit} isPending={isSubmitting} variant='primary' onPress={handleSubmit}>
          {isSubmitting ? (
            <Spinner color='currentColor' size='sm' />
          ) : mode === 'existing' ? (
            completedResult?.success ? 'Access Added' : 'Add Access'
          ) : completedResult?.success ? (
            'Duplicated'
          ) : (
            'Duplicate'
          )}
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

  // USER (created in duplicate mode, or the existing recipient in add-access mode)
  rows.push(
    baseRow({
      'Notes': result.newUser ? '' : result.errors[0]?.message || 'Failed',
      'Object ID': result.newUser?.id ?? '',
      'Object Name': result.newUser?.displayName ?? '',
      'Object Type': 'USER',
      'Status': result.newUser ? (result.created === false ? 'EXISTING' : 'CREATED') : 'FAILED'
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
