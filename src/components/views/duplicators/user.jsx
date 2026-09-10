import {
  Button,
  Disclosure,
  FieldError,
  Input,
  Label,
  Separator,
  TextField,
  ToggleButton,
  ToggleButtonGroup
} from '@heroui/react';
import { useEffect, useRef } from 'react';

import { OwnerComboBox } from '@/components/OwnerComboBox';
import { DataListItem } from '@/models/DataListItem';
import { addAccessToExistingUser, duplicateUser, fetchDuplicationPreview } from '@/services/duplicate';
import { getUserDetails } from '@/services/users';
import { exportToExcel, generateExportFilename } from '@/utils/exportData';
import IconPersonPlus from '@icons/person-plus.svg?react';

import { DUPLICATOR_DESCRIPTORS } from './descriptors';

// The subset of duplication steps that are purely additive grants. The
// "add to existing user" mode runs only these (no create/profile/locale).
const GRANT_STEP_KEYS = new Set(['addGroups', 'shareApps', 'shareCards', 'sharePages']);

const FIELDS = [
  { key: 'newDisplayName', label: 'Full Name', required: true },
  { key: 'newEmail', label: 'Email', required: true, type: 'email' }
];

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

const STEPS = [
  { key: 'createUser', label: 'Create new user' },
  { key: 'copyProfile', label: 'Copy profile fields' },
  { key: 'copyLocale', label: 'Copy locale' },
  { key: 'addGroups', label: 'Add to groups' },
  { key: 'shareCards', label: 'Share individually-shared cards' },
  { key: 'sharePages', label: 'Share individually-shared pages' },
  { key: 'shareApps', label: 'Share individually-shared apps' }
];

export const userDuplicator = {
  ...DUPLICATOR_DESCRIPTORS.USER.options[0],
  buildItems: ({ preview }) => {
    const groups = [
      {
        idField: 'groupId',
        idPrefix: 'group',
        label: 'Group memberships',
        list: preview.groups,
        nameField: 'groupName',
        parentId: 'groups',
        typeId: 'GROUP'
      },
      {
        idField: 'id',
        idPrefix: 'card',
        label: 'Individually-shared cards',
        list: preview.cards,
        nameField: 'name',
        parentId: 'cards',
        typeId: 'CARD'
      },
      {
        idField: 'id',
        idPrefix: 'page',
        label: 'Individually-shared pages',
        list: preview.pages,
        nameField: 'title',
        parentId: 'pages',
        typeId: 'PAGE'
      },
      {
        idField: 'id',
        idPrefix: 'app',
        label: 'Individually-shared apps',
        list: preview.customApps,
        nameField: 'name',
        parentId: 'apps',
        typeId: 'APP'
      }
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
  },
  canSubmit: ({ options, source, target }) =>
    options.mode === 'existing'
      ? isTargetValid(source, target)
      : FIELDS.every((f) => !f.required || !!(options[f.key] ?? '').trim()),
  closeOnSuccess: false,
  defaultOptions: { mode: 'create', newDisplayName: '', newEmail: '' },
  emptyText: 'No groups or individually-shared content found.',
  fetchPreview: ({ context, source }) => fetchDuplicationPreview({ sourceUserId: source.id, tabId: context.tabId }),
  Form: UserForm,
  formatError: ({ error, options }) => ({
    description: error.message || 'An error occurred',
    status: 'danger',
    timeout: 5000,
    title: options.mode === 'existing' ? 'Failed to Add Access' : 'Duplication Failed'
  }),
  formatResult: ({ result, target }) => {
    const sharedCardCount = result.cardResults.attempted.length - result.cardResults.errors.length;
    const sharedPageCount = result.pageResults.attempted.length - result.pageResults.errors.length;
    const appsSkipped = result.appResults.attempted.length;
    const name = result.newUser?.displayName || target?.displayName || 'user';

    if (result.success) {
      const appNote = appsSkipped > 0 ? `, **${appsSkipped}** apps skipped (manual)` : '';
      const lead = result.created ? `Created **${name}**` : `Added access to **${name}**`;
      return {
        description: `${lead}. Shared **${sharedCardCount}** cards, **${sharedPageCount}** pages${appNote}. Audit log downloaded.`,
        status: 'success',
        timeout: 6000,
        title: result.created ? 'Duplication Complete' : 'Access Added'
      };
    }
    if (result.newUser) {
      const failures = result.errors.length || result.cardResults.errors.length + result.pageResults.errors.length;
      return {
        description: `${result.created ? 'Created' : 'Updated'} **${name}** but **${failures}** step(s) had failures. See audit log.`,
        status: 'warning',
        timeout: 7000,
        title: result.created ? 'Duplicated with Warnings' : 'Added with Warnings'
      };
    }
    return {
      description: result.errors[0]?.message || (result.created ? 'Unable to create new user' : 'Unable to add access'),
      status: 'danger',
      timeout: 5000,
      title: result.created ? 'Duplication Failed' : 'Failed to Add Access'
    };
  },
  formatStepDetail,
  getHeader: ({ options, source }) => ({
    beta: true,
    feature: options.mode === 'existing' ? 'Add to Existing User' : 'Duplicate User',
    featureIcon: <IconPersonPlus />,
    subtext: source ? `from ${source.name}` : undefined
  }),
  getSteps: ({ options }) => (options.mode === 'existing' ? STEPS.filter((s) => GRANT_STEP_KEYS.has(s.key)) : STEPS),
  getSubmitLabel: ({ completedResult, options }) => {
    if (options.mode === 'existing') return completedResult?.success ? 'Access Added' : 'Add Access';
    return completedResult?.success ? 'Duplicated' : 'Duplicate';
  },
  onComplete: ({ result, source }) => downloadAuditLog({ result, source }),
  Preview: UserPreview,
  resolveSource: (context) => {
    const id = context.domoObject?.id;
    return {
      id,
      name: context.domoObject?.metadata?.name || context.domoObject?.metadata?.displayName || `User ${id}`
    };
  },
  run: async ({ context, onStepProgress, options, preview, selectedIds, source, target }) => {
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

    return options.mode === 'existing'
      ? addAccessToExistingUser({
          cards: selectedCards,
          customApps: selectedApps,
          groups: selectedGroups,
          onStepProgress,
          pages: selectedPages,
          tabId: context.tabId,
          targetUser: target
        })
      : duplicateUser({
          cards: selectedCards,
          customApps: selectedApps,
          groups: selectedGroups,
          locale: preview.locale,
          newDisplayName: options.newDisplayName.trim(),
          newEmail: options.newEmail.trim(),
          onStepProgress,
          pages: selectedPages,
          profileFields: preview.profileFields,
          sourceUserId: source.id,
          tabId: context.tabId
        });
  }
};

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

function buildDuplicationLogRows({ result, source }) {
  const date = new Date().toISOString().slice(0, -5);
  const sourceCols = {
    'Source User ID': source.id,
    'Source User Name': source.name
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

async function downloadAuditLog({ result, source }) {
  if (!result?.newUser) return;
  try {
    const rows = buildDuplicationLogRows({ result, source });
    if (rows.length === 0) return;
    const fileLabel = result.created === false ? 'user-access-added' : 'duplicated-user';
    await exportToExcel(rows, LOG_COLUMNS, generateExportFilename(fileLabel), 'Duplication Log');
  } catch (err) {
    console.error('[userDuplicator] Failed to write audit log:', err);
  }
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

function isTargetValid(source, target) {
  const isSelf = !!target?.id && !!source?.id && String(target.id) === String(source.id);
  return !!target?.id && !isSelf && target.active !== false;
}

function UserForm({ context, isSubmitting, options, resetProgress, setOption, setTarget, target }) {
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const source = { id: context.domoObject?.id };
  const isSelf = !!target?.id && !!source.id && String(target.id) === String(source.id);

  const handleModeChange = (keys) => {
    const next = [...keys][0];
    if (!next || next === options.mode) return;
    setOption('mode', next);
    resetProgress();
  };

  const handleTargetChange = async (key) => {
    if (key == null) {
      setTarget(null);
      return;
    }
    setTarget({ active: true, displayName: '', id: key });
    const details = await getUserDetails(key, context?.tabId);
    if (!mountedRef.current) return;
    setTarget({
      active: details?.active !== false,
      displayName: details?.displayName ?? `User ${key}`,
      id: key
    });
  };

  return (
    <>
      <ToggleButtonGroup
        disallowEmptySelection
        aria-label='Duplication mode'
        className='w-full'
        isDisabled={isSubmitting}
        selectedKeys={new Set([options.mode])}
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

      {options.mode === 'create' ? (
        FIELDS.map((field) => (
          <TextField
            id={`duplicate-${field.key}`}
            isRequired={field.required}
            key={field.key}
            name={field.key}
            type={field?.type}
            variant='secondary'
          >
            <Label>{field.label}</Label>
            <Input className='h-8' value={options[field.key] ?? ''} onChange={(e) => setOption(field.key, e.target.value)} />
            <FieldError className='text-xs text-danger'>Invalid {field.label.toLowerCase()}</FieldError>
          </TextField>
        ))
      ) : (
        <div className='flex flex-col gap-1'>
          <OwnerComboBox
            isRequired
            avatarBaseUrl={context?.domoObject?.baseUrl}
            label='Add access to'
            selectedKey={target?.id ?? null}
            sources={['USER']}
            tabId={context?.tabId}
            onSelectionChange={handleTargetChange}
          />
          {isSelf && <p className='text-xs text-danger'>You cannot add a user&apos;s access to themselves.</p>}
          {target?.active === false && <p className='text-xs text-danger'>This user is deactivated.</p>}
        </div>
      )}
    </>
  );
}

function UserPreview({ hasItems, options, preview }) {
  return (
    <>
      {options.mode === 'create' && (
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
      {hasItems && (
        <>
          <div className='text-xs font-medium text-muted uppercase'>
            {options.mode === 'existing' ? 'Choose what to add' : 'Choose what to copy'}
          </div>
          <p className='text-xs text-muted italic'>
            Deselect anything you do not want. Deselecting a card or page skips only its direct share, so the user may still
            reach it through a group or Workspace.
            {preview.customApps.length > 0
              ? ' App sharing is not yet implemented, so checked apps are recorded in the audit log to share manually.'
              : ''}
          </p>
        </>
      )}
    </>
  );
}
