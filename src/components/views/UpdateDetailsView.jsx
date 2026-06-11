import {
  Button,
  Card,
  ComboBox,
  Description,
  Input,
  Label,
  ListBox,
  ListLayout,
  Separator,
  Spinner,
  Switch,
  TextArea,
  TextField,
  Tooltip,
  Virtualizer
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DomoContext } from '@/models/DomoContext';
import { updateDataflowDetails } from '@/services/dataflows';
import { getProviders, updateDatasetProperties } from '@/services/datasets';
import { setUserAttributes } from '@/services/users';
import { getSidepanelData } from '@/utils/sidepanel';
import IconArrowCurvedBack from '@icons/arrow-curved-back.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const updatersByType = {
  DATA_SOURCE: {
    fields: [
      {
        key: 'userDefinedType',
        kind: 'combo',
        label: 'User Defined Type',
        resettable: true
      }
    ],
    getOriginal: (ctx) => ({
      userDefinedType: ctx.domoObject?.metadata?.details?.userDefinedType || ''
    }),
    loadOptions: async () => {
      const providers = await getProviders();
      return (providers || [])
        .map((p) => p.key)
        .filter(Boolean)
        .sort();
    },
    run: (id, updates) => updateDatasetProperties(id, updates),
    title: 'Update DataSet Details',
    typeName: 'DataSet'
  },
  DATAFLOW_TYPE: {
    fields: [
      { key: 'name', kind: 'text', label: 'DataFlow Name', required: true },
      { key: 'description', kind: 'textarea', label: 'DataFlow Description' }
    ],
    getOriginal: (ctx) => ({
      description: ctx.domoObject?.metadata?.details?.description || '',
      name: ctx.domoObject?.metadata?.details?.name || ''
    }),
    run: (id, updates) => updateDataflowDetails(id, updates),
    title: 'Update DataFlow Details',
    typeName: 'DataFlow'
  },
  USER: {
    applyToggles: (diff, { originalValues, toggles }) => {
      if (toggles.syncEmail && diff.userName && diff.userName !== originalValues.email) {
        return { ...diff, email: diff.userName };
      }
      return diff;
    },
    fields: [{ key: 'userName', kind: 'email', label: 'Username', required: true, syncFromKey: 'email' }],
    getOriginal: (ctx) => ({
      email: ctx.domoObject?.metadata?.details?.emailAddress || '',
      userName: ctx.domoObject?.metadata?.details?.userName || ''
    }),
    run: async (id, updates) => {
      const attributes = [];
      if ('userName' in updates) attributes.push({ key: 'userName', values: [updates.userName] });
      if ('email' in updates) attributes.push({ key: 'emailAddress', values: [updates.email] });
      const ok = await setUserAttributes(id, attributes);
      if (!ok) throw new Error('Failed to update user');
    },
    title: 'Update Person Details',
    toggles: [
      {
        defaultSelected: true,
        description: 'Sets the email to the new username on save',
        key: 'syncEmail',
        label: 'Also update email to match'
      }
    ],
    typeName: 'Person'
  }
};

export function UpdateDetailsView({ instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContext, setCurrentContext] = useState(null);
  const [config, setConfig] = useState(null);
  const [originalValues, setOriginalValues] = useState({});
  const [values, setValues] = useState({});
  const [toggles, setToggles] = useState({});
  const [options, setOptions] = useState(null);
  const [optionsError, setOptionsError] = useState(null);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
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

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'updateDetails') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const typeId = context?.domoObject?.typeId;
      const cfg = updatersByType[typeId];
      if (!context || !cfg) {
        onStatusUpdate?.('Error', `Update Details not supported for ${typeId}`, 'danger');
        onBackToDefault?.();
        return;
      }
      const original = cfg.getOriginal(context);
      if (!mountedRef.current) return;
      setCurrentContext(context);
      setConfig(cfg);
      setOriginalValues(original);
      setValues(original);
      setToggles(Object.fromEntries((cfg.toggles || []).map((t) => [t.key, !!t.defaultSelected])));
      if (cfg.loadOptions) loadOptions(cfg);
    } catch (error) {
      console.error('[UpdateDetailsView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const loadOptions = async (cfg) => {
    setIsLoadingOptions(true);
    setOptionsError(null);
    try {
      const opts = await cfg.loadOptions();
      if (mountedRef.current) setOptions(opts);
    } catch (error) {
      console.error('[UpdateDetailsView] Error loading options:', error);
      if (mountedRef.current) {
        setOptionsError(error.message || 'Failed to load options');
      }
    } finally {
      if (mountedRef.current) setIsLoadingOptions(false);
    }
  };

  const setValue = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const buildDiff = () => {
    const diff = {};
    for (const f of config.fields) {
      const original = (originalValues[f.key] ?? '').trim();
      const next = (values[f.key] ?? '').trim();
      if (next !== original) diff[f.key] = next;
    }
    return diff;
  };

  const performUpdate = (updates, { isReset = false } = {}) => {
    if (!config || !currentContext) return;
    setIsSubmitting(true);
    const fieldList = Object.keys(updates).join(' and ');

    const promise = (async () => {
      await config.run(currentContext.domoObject.id, updates);
      const tabId = currentContext.tabId;
      if (tabId) {
        await chrome.runtime.sendMessage({
          metadataUpdates: updates,
          tabId,
          type: 'UPDATE_CONTEXT_METADATA'
        });
        chrome.tabs.reload(tabId);
      }
      return fieldList;
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'An error occurred',
      loading: isReset
        ? `Resetting ${config.typeName} **userDefinedType**…`
        : `Updating ${config.typeName} **${fieldList}**…`,
      success: (f) => (isReset ? `Reset ${config.typeName} userDefinedType` : `Updated ${f}`)
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

  const handleSubmit = () => {
    const diff = buildDiff();
    if (Object.keys(diff).length === 0) {
      onStatusUpdate?.('No changes to update', 'No fields were modified', 'warning', 2000);
      return;
    }
    for (const f of config.fields) {
      if (f.required && !(values[f.key] ?? '').trim()) {
        onStatusUpdate?.(`${f.label} is required`, '', 'warning', 2000);
        return;
      }
      if (f.kind === 'email' && diff[f.key] !== undefined && !EMAIL_PATTERN.test(diff[f.key])) {
        onStatusUpdate?.(`${f.label} must be a valid email address`, '', 'warning', 2000);
        return;
      }
    }
    performUpdate(config.applyToggles ? config.applyToggles(diff, { originalValues, toggles }) : diff);
  };

  const handleReset = () => {
    performUpdate({ userDefinedType: null }, { isReset: true });
  };

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

  if (!config) return null;

  const hasResettableValue = config.fields.some((f) => f.resettable && originalValues[f.key]);
  const objectId = currentContext.domoObject.id;
  const objectName = currentContext.domoObject.metadata?.name || objectId;

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-2'>
        <Card.Title className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 pt-1'>
            <div className='truncate'>{config.title}</div>
            <Tooltip>
              <Tooltip.Trigger className='block w-full min-w-0 pr-8'>
                <div className='truncate text-xs font-normal text-muted'>
                  {objectName} (ID: {objectId})
                </div>
              </Tooltip.Trigger>
              <Tooltip.Content className='text-wrap'>
                {objectName} (ID: {objectId})
              </Tooltip.Content>
            </Tooltip>
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

      <div className='flex flex-col gap-2'>
        {config.fields.map((field) => (
          <FieldRow
            field={field}
            isDisabled={isSubmitting}
            isLoadingOptions={isLoadingOptions}
            key={field.key}
            options={options}
            optionsError={optionsError}
            originalValue={originalValues[field.key]}
            syncValue={field.syncFromKey ? (originalValues[field.syncFromKey] ?? '') : undefined}
            value={values[field.key] ?? ''}
            onChange={(v) => setValue(field.key, v)}
            onReset={hasResettableValue ? handleReset : undefined}
            onRetryOptions={config.loadOptions ? () => loadOptions(config) : undefined}
          />
        ))}
      </div>

      <div className='flex shrink-0 flex-col gap-2'>
        {(config.toggles || []).map((toggle) => (
          <Switch
            className='py-1'
            isDisabled={isSubmitting}
            isSelected={!!toggles[toggle.key]}
            key={toggle.key}
            onChange={(v) => setToggles((prev) => ({ ...prev, [toggle.key]: v }))}
          >
            <Switch.Control>
              <Switch.Thumb />
            </Switch.Control>
            <Switch.Content>
              <Label>{toggle.label}</Label>
              <Description>{toggle.description}</Description>
            </Switch.Content>
          </Switch>
        ))}
        <Button fullWidth isDisabled={isSubmitting} isPending={isSubmitting} variant='primary' onPress={handleSubmit}>
          Save
        </Button>
      </div>
    </Card>
  );
}

function FieldRow({
  field,
  isDisabled,
  isLoadingOptions,
  onChange,
  onReset,
  onRetryOptions,
  options,
  optionsError,
  originalValue,
  syncValue,
  value
}) {
  if (field.kind === 'text') {
    return (
      <TextField id={`update-${field.key}`} isRequired={field.required} name={field.key} variant='secondary'>
        <Label>{field.label}</Label>
        <Input className='h-8' isDisabled={isDisabled} value={value} onChange={(e) => onChange(e.target.value)} />
      </TextField>
    );
  }

  if (field.kind === 'email') {
    const showSyncButton = Boolean(field.syncFromKey);
    const isSyncDisabled = isDisabled || !syncValue || value === syncValue;
    return (
      <div className='flex flex-col gap-1'>
        <TextField id={`update-${field.key}`} isRequired={field.required} name={field.key} variant='secondary'>
          <Label>{field.label}</Label>
          <div className='flex items-center gap-1'>
            <Input
              className='h-8 flex-1'
              isDisabled={isDisabled}
              type='email'
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
            {showSyncButton && (
              <Tooltip>
                <Button isIconOnly isDisabled={isSyncDisabled} size='md' variant='tertiary' onPress={() => onChange(syncValue)}>
                  <IconSync />
                </Button>
                <Tooltip.Content className='max-w-60'>
                  {syncValue ? `Set to current email (${syncValue})` : 'No email to copy'}
                </Tooltip.Content>
              </Tooltip>
            )}
          </div>
        </TextField>
        {showSyncButton && <span className='text-xs text-muted'>Current email: {syncValue || 'none'}</span>}
      </div>
    );
  }

  if (field.kind === 'textarea') {
    return (
      <div className='flex flex-col gap-2'>
        <Label>{field.label}</Label>
        <TextArea
          id={`update-${field.key}`}
          isDisabled={isDisabled}
          name={field.key}
          resize='vertical'
          rows={2}
          value={value}
          variant='secondary'
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    );
  }

  if (field.kind === 'combo') {
    const items = [...(options || [])]
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
      .map((key) => ({ id: key, name: key }));
    const showResetButton = field.resettable && onReset;
    const isResetDisabled = isDisabled || !originalValue;
    return (
      <div className='flex flex-col gap-1'>
        <div className='flex items-end gap-1'>
          <ComboBox
            allowsCustomValue
            allowsEmptyCollection
            className='flex-1'
            inputValue={value}
            isDisabled={isDisabled}
            menuTrigger='input'
            name={field.key}
            variant='secondary'
            onInputChange={onChange}
          >
            <Label>{field.label}</Label>
            <ComboBox.InputGroup>
              <Input placeholder={isLoadingOptions ? 'Loading providers…' : 'Type or pick a value…'} />
              <ComboBox.Trigger>
                <IconChevronDown />
              </ComboBox.Trigger>
            </ComboBox.InputGroup>
            <ComboBox.Popover className='max-w-9/10' placement='bottom start'>
              <Virtualizer layout={ListLayout} layoutOptions={{ estimatedRowHeight: 32 }}>
                <ListBox className='max-h-100 overflow-y-auto' items={items}>
                  {(item) => (
                    <ListBox.Item className='h-fit' id={item.id} textValue={item.name}>
                      <span className='line-clamp-2 break-all'>{item.name}</span>
                    </ListBox.Item>
                  )}
                </ListBox>
              </Virtualizer>
            </ComboBox.Popover>
          </ComboBox>
          {showResetButton && (
            <Tooltip>
              <Button isIconOnly isDisabled={isResetDisabled} size='md' variant='tertiary' onPress={onReset}>
                <IconArrowCurvedBack />
              </Button>
              <Tooltip.Content className='max-w-60'>
                {originalValue
                  ? 'Reset: clears userDefinedType and restores displayType to dataProviderType'
                  : 'Nothing to reset'}
              </Tooltip.Content>
            </Tooltip>
          )}
        </div>
        {optionsError && (
          <div className='flex items-center gap-2 py-1'>
            <IconExclamationTriangle className='shrink-0 text-danger' size={16} />
            <span className='min-w-0 flex-1 text-xs text-danger'>
              Could not load suggestions; you can still type a value
            </span>
            {onRetryOptions && (
              <Button size='sm' variant='ghost' onPress={onRetryOptions}>
                <IconSync />
                Retry
              </Button>
            )}
          </div>
        )}
      </div>
    );
  }

  return null;
}
