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
  Tooltip
} from '@heroui/react';
import { IconAlertTriangle, IconCheck, IconLoader2, IconRefresh, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks';
import { DomoContext } from '@/models';
import { duplicateUser, fetchDuplicationPreview } from '@/services';
import { getSidepanelData } from '@/utils';

/**
 * Registry of duplicatable object types. Add an entry here to support a new
 * typeId. Each entry defines the form fields, the preview fetcher, how to
 * render the preview, the confirm action, and the step-by-step status rows.
 */
const duplicatorsByType = {
  USER: {
    fetchPreview: ({ sourceUserId, tabId }) => fetchDuplicationPreview({ sourceUserId, tabId }),
    fields: [
      {
        key: 'newDisplayName',
        label: 'Full Name',
        required: true
      },
      {
        key: 'newEmail',
        label: 'Email',
        required: true,
        type: 'email'
      }
    ],
    renderPreviewSections: (preview) => [
      {
        emptyText: 'None',
        items: preview.source.roleId != null ? [`Role ID ${preview.source.roleId}`] : [],
        key: 'role',
        label: 'Role'
      },
      {
        emptyText: 'None',
        items: preview.profileFields.map((f) => `${f.key}: ${f.value}`),
        key: 'profile',
        label: 'Profile fields'
      },
      {
        emptyText: 'Not set',
        items: preview.locale ? [preview.locale] : [],
        key: 'locale',
        label: 'Locale'
      },
      {
        emptyText: 'None',
        items: preview.groups.map((g) => g.groupName),
        key: 'groups',
        label: 'Group memberships'
      },
      {
        count: preview.cardCount,
        key: 'cards',
        label: 'Accessible cards'
      },
      {
        count: preview.pageCount,
        key: 'pages',
        label: 'Accessible pages'
      }
    ],
    run: ({ onStepProgress, sourceUserId, tabId, values }) =>
      duplicateUser({
        newDisplayName: values.newDisplayName.trim(),
        newEmail: values.newEmail.trim(),
        onStepProgress,
        sourceUserId,
        tabId
      }),
    steps: [
      { key: 'createUser', label: 'Create new user' },
      { key: 'copyProfile', label: 'Copy profile fields' },
      { key: 'copyLocale', label: 'Copy locale' },
      { key: 'addGroups', label: 'Add to groups' },
      { key: 'shareCards', label: 'Share accessible cards' },
      { key: 'sharePages', label: 'Share accessible pages' }
    ],
    title: 'Duplicate User'
  }
};

const buildInitialStepStates = (steps) =>
  Object.fromEntries(steps.map((s) => [s.key, { status: 'idle' }]));

const buildInitialValues = (fields) => Object.fromEntries(fields.map((f) => [f.key, '']));

export function DuplicateView({ onBackToDefault = null, onStatusUpdate = null }) {
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
      const userName =
        context.domoObject?.metadata?.name ||
        context.domoObject?.metadata?.displayName ||
        `User ${userId}`;
      if (userId) setSourceUser({ id: userId, name: userName });
    } catch (error) {
      console.error('[DuplicateView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  // Kick off the preview fetch once we know who to fetch for.
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
      if (mountedRef.current) {
        setPreviewError(error.message || 'Failed to load preview');
      }
    } finally {
      if (mountedRef.current) setIsPreviewLoading(false);
    }
  };

  const setValue = (key, v) => setValues((prev) => ({ ...prev, [key]: v }));

  const fieldValidity = (field) => {
    const trimmed = (values[field.key] ?? '').trim();
    return { ok: !field.required || !!trimmed };
  };

  const canSubmit =
    !!config && !!preview && !isSubmitting && config.fields.every((f) => fieldValidity(f).ok);

  const hasStarted = Object.values(stepStates).some((s) => s.status !== 'idle');

  const handleSubmit = async () => {
    if (!canSubmit || !sourceUser) return;
    setIsSubmitting(true);
    setCompletedResult(null);
    setStepStates(buildInitialStepStates(config.steps));

    try {
      const result = await config.run({
        onStepProgress: (stepKey, status, res) => {
          if (!mountedRef.current) return;
          setStepStates((prev) => ({
            ...prev,
            [stepKey]: { result: res, status }
          }));
        },
        sourceUserId: sourceUser.id,
        tabId: currentContext.tabId,
        values
      });

      if (!mountedRef.current) return;
      setCompletedResult(result);

      if (result.success) {
        showStatus(
          'Duplication Complete',
          `Created **${result.newUser.displayName}** with ${result.copied.fields.length} fields, ${result.copied.groups} groups, ${result.copied.cards} cards, ${result.copied.pages} pages`,
          'success',
          5000
        );
      } else if (result.newUser) {
        showStatus(
          'Duplicated with Warnings',
          `Created **${result.newUser.displayName}** but ${result.errors.length} step${result.errors.length !== 1 ? 's' : ''} failed`,
          'warning',
          6000
        );
      } else {
        showStatus(
          'Duplication Failed',
          result.errors[0]?.message || 'Unable to create new user',
          'danger',
          5000
        );
      }
    } catch (error) {
      showStatus('Duplication Failed', error.message || 'An error occurred', 'danger', 5000);
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
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

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-2'>
        <Card.Title className='flex items-start justify-between'>
          <div className='min-w-0 flex-1 pt-1'>{config?.title || 'Duplicate'}</div>
          {onBackToDefault && (
            <Tooltip closeDelay={0} delay={400}>
              <Button isIconOnly size='sm' variant='ghost' onPress={onBackToDefault}>
                <IconX stroke={1.5} />
              </Button>
              <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
            </Tooltip>
          )}
        </Card.Title>
        <Separator />
      </Card.Header>

      <div className='flex shrink-0 flex-col gap-2'>
        <TextField isReadOnly isRequired className='pointer-events-none'>
          <Label>Duplicate From</Label>
          <Input value={sourceUser?.name || 'Unknown User'} variant='secondary' />
        </TextField>

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
            <Input
              className='h-8'
              value={values[field.key] ?? ''}
              onChange={(e) => setValue(field.key, e.target.value)}
            />
            <FieldError className='text-xs text-danger'>
              Invalid {field.label.toLowerCase()}
            </FieldError>
          </TextField>
        ))}

        <Separator className='mt-1' />
      </div>

      <ScrollShadow
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto px-1 py-2'
        offset={5}
        orientation='vertical'
      >
        <PreviewPanel
          config={config}
          error={previewError}
          isLoading={isPreviewLoading}
          preview={preview}
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
        <Button
          fullWidth
          isDisabled={!canSubmit}
          isPending={isSubmitting}
          variant='primary'
          onPress={handleSubmit}
        >
          {isSubmitting ? (
            <Spinner color='currentColor' size='sm' />
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

function formatStepDetail(stepKey, result) {
  if (!result) return null;
  if (stepKey === 'copyLocale') return result.locale || null;
  if (typeof result.count === 'number') {
    return result.count > 0 ? String(result.count) : 'None';
  }
  if (stepKey === 'createUser' && result.id) return `#${result.id}`;
  return null;
}

function PreviewPanel({ config, error, isLoading, onRetry, preview }) {
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
        <IconAlertTriangle className='shrink-0 text-danger' size={18} />
        <span className='min-w-0 flex-1 text-sm text-danger'>{error}</span>
        <Button size='sm' variant='tertiary' onPress={onRetry}>
          <IconRefresh stroke={1.5} />
          Retry
        </Button>
      </div>
    );
  }

  if (!preview || !config) return null;

  const sections = config.renderPreviewSections(preview);

  return (
    <div className='flex flex-col gap-1'>
      <div className='mb-1 text-xs font-medium text-muted uppercase'>Will be copied</div>
      {sections.map((section) => (
        <PreviewSection key={section.key} section={section} />
      ))}
    </div>
  );
}

function PreviewSection({ section }) {
  // Count-only section (cards, pages) — just a label + number.
  if (typeof section.count === 'number') {
    return (
      <div className='flex items-center justify-between py-1'>
        <span className='text-sm'>{section.label}</span>
        <span className='shrink-0 text-xs text-muted'>{section.count}</span>
      </div>
    );
  }

  const items = section.items || [];
  const count = items.length;

  if (count === 0) {
    return (
      <div className='flex items-center justify-between py-1'>
        <span className='text-sm'>{section.label}</span>
        <span className='shrink-0 text-xs text-muted'>{section.emptyText || 'None'}</span>
      </div>
    );
  }

  // Short list: render inline. Long list: wrap in Disclosure.
  if (count <= 3) {
    return (
      <div className='flex items-start justify-between gap-2 py-1'>
        <span className='text-sm'>{section.label}</span>
        <span className='min-w-0 shrink-0 text-right text-xs text-muted'>{items.join(', ')}</span>
      </div>
    );
  }

  return (
    <Disclosure>
      <Disclosure.Heading>
        <Button
          className='h-auto w-full justify-between px-0 py-1 font-normal'
          slot='trigger'
          variant='ghost'
        >
          <span className='text-sm'>{section.label}</span>
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
            {items.length > 20 && (
              <li className='text-xs text-muted'>...and {items.length - 20} more</li>
            )}
          </ul>
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
          <IconLoader2 className='shrink-0 animate-spin text-accent' size={18} />
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

  // error
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
