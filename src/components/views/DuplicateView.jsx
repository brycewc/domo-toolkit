import { Button, Card, ScrollShadow, Separator, Spinner } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DomoContext } from '@/models/DomoContext';
import { buildReloadAction } from '@/utils/headerActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheck from '@icons/check.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconSync from '@icons/sync.svg?react';
import IconX from '@icons/x.svg?react';

import { DataList } from './DataList';
import { duplicatorsByType, getDuplicator } from './duplicators/registry';
import { ViewHeader } from './ViewHeader';

const buildInitialStepStates = (steps) => Object.fromEntries(steps.map((s) => [s.key, { status: 'idle' }]));

/**
 * Shell for every duplicator: copy some aspect of the current object onto
 * another object of the same type. The target picker, preview, steps, and
 * submit all come from the entry `duplicators/registry` resolves.
 */
export function DuplicateView({ instance = null, liveContext = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  useViewReady(!isLoading);
  const [currentContext, setCurrentContext] = useState(null);
  const [config, setConfig] = useState(null);
  const [source, setSource] = useState(null);
  const [options, setOptions] = useState({});
  const [target, setTarget] = useState(null);
  const [preview, setPreview] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [stepStates, setStepStates] = useState({});
  const [completedResult, setCompletedResult] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
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
      const duplicator = getDuplicator(typeId, data.duplicator);
      if (!duplicator) {
        onStatusUpdate?.('Error', `Duplication is not supported for ${typeId}`, 'danger');
        onBackToDefault?.();
        return;
      }
      setCurrentContext(context);
      setConfig(duplicator);
      setOptions({ ...duplicator.defaultOptions });
      setSource(duplicator.resolveSource(context));
    } catch (error) {
      console.error('[DuplicateView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!config || !source || !currentContext) return;
    loadPreview();
  }, [config, source, currentContext]);

  const loadPreview = async () => {
    if (!mountedRef.current) return;
    setIsPreviewLoading(true);
    setPreviewError(null);
    try {
      const data = await config.fetchPreview({ context: currentContext, source });
      if (mountedRef.current) setPreview(data);
    } catch (error) {
      console.error('[DuplicateView] Error loading preview:', error);
      if (mountedRef.current) setPreviewError(error.message || 'Failed to load preview');
    } finally {
      if (mountedRef.current) setIsPreviewLoading(false);
    }
  };

  const { allLeafIds, groupLeafMap, items } = useMemo(() => {
    if (!config || !preview) return { allLeafIds: [], groupLeafMap: {}, items: [] };
    return config.buildItems({ options, preview, target });
  }, [config, options, preview, target]);

  const getItemBadge = useMemo(
    () => (config && preview ? config.buildItemBadge?.({ options, preview, target }) : undefined),
    [config, options, preview, target]
  );

  // Everything starts selected. Keyed on the id list, not the arrays: a
  // duplicator rebuilds its items whenever an option or the target changes, and
  // that must not discard what the user already deselected.
  const leafKey = allLeafIds.join('|');
  useEffect(() => {
    if (!preview) return;
    const next = new Set(allLeafIds);
    for (const parentId of Object.keys(groupLeafMap)) next.add(parentId);
    setSelectedIds(next);
  }, [preview, leafKey]);

  const activeSteps = useMemo(
    () => (config?.getSteps ? config.getSteps({ options, preview }) : []),
    [config, options, preview]
  );

  const canSubmit =
    !!config && !!preview && !isSubmitting && config.canSubmit({ options, preview, selectedIds, source, target });
  const hasStarted = Object.values(stepStates).some((s) => s.status !== 'idle');

  const resetProgress = () => {
    setCompletedResult(null);
    setStepStates({});
  };

  const setOption = (key, value) => setOptions((prev) => ({ ...prev, [key]: value }));

  // Toggling a group parent cascades to its leaves; toggling a leaf reconciles
  // whether its parent is fully selected. Mirrors OwnershipView.
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
    if (!canSubmit || !source) return;
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
      const result = await config.run({
        context: currentContext,
        onStepProgress,
        options,
        preview,
        selectedIds,
        source,
        target
      });

      if (!mountedRef.current) return;
      setCompletedResult(result);

      await config.onComplete?.({ result, source, target });

      const status = config.formatResult({ options, result, source, target });
      showStatus(status.title, status.description, status.status, status.timeout);
      if (config.closeOnSuccess && result?.success) onBackToDefault?.();
    } catch (error) {
      const status = config.formatError({ error, options });
      showStatus(status.title, status.description, status.status, status.timeout);
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

  if (!config) return null;

  const header = config.getHeader({ options, preview, source });
  const liveTypeId = liveContext?.domoObject?.typeId;
  // The `duplicate` action key is shared by every aspect, so it can't tell
  // reload that the object underneath supports a different one.
  const unsupportedReason =
    liveTypeId && !duplicatorsByType[liveTypeId]?.some((d) => d.key === config.key)
      ? "Current object doesn't support this view"
      : null;

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        beta={header.beta}
        feature={header.feature}
        featureIcon={header.featureIcon}
        subject={header.subject}
        subjectTypeId={header.subjectTypeId}
        subtext={header.subtext}
        onClose={onBackToDefault}
        actions={[
          buildReloadAction({
            currentContext: liveContext,
            extras: { duplicator: config.key },
            objectId: currentContext?.domoObject?.id,
            objectType: currentContext?.domoObject?.typeId,
            onStatusUpdate,
            unsupportedReason,
            viewType: 'duplicate'
          })
        ]}
      />
      <Separator />

      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto px-1 py-2' offset={5} orientation='vertical'>
        <div className='flex flex-col gap-2'>
          <config.Form
            context={currentContext}
            isSubmitting={isSubmitting}
            options={options}
            preview={preview}
            resetProgress={resetProgress}
            selectedIds={selectedIds}
            setOption={setOption}
            setTarget={setTarget}
            target={target}
          />
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
            {config.Preview && (
              <config.Preview hasItems={items.length > 0} options={options} preview={preview} target={target} />
            )}
            {items.length > 0 ? (
              <DataList
                selectionMode
                getItemBadge={getItemBadge}
                items={items}
                selectedIds={selectedIds}
                showActions={false}
                variant='transparent'
                onSelectionChange={handleSelectionChange}
              />
            ) : (
              <p className='text-sm text-muted'>{config.emptyText}</p>
            )}
          </div>
        ) : null}

        {hasStarted && activeSteps.length > 0 && (
          <>
            <Separator className='my-3' />
            <div className='mb-1 text-xs font-medium text-muted uppercase'>Progress</div>
            {activeSteps.map((step) => (
              <StepRow
                detail={config.formatStepDetail?.(step.key, stepStates[step.key]?.result)}
                key={step.key}
                state={stepStates[step.key]}
                step={step}
              />
            ))}
          </>
        )}
      </ScrollShadow>

      <Separator />

      <div className='flex shrink-0 flex-col gap-2'>
        <Button fullWidth isDisabled={!canSubmit} isPending={isSubmitting} variant='primary' onPress={handleSubmit}>
          {isSubmitting ? <Spinner color='currentColor' size='sm' /> : config.getSubmitLabel({ completedResult, options })}
        </Button>
      </div>
    </Card>
  );
}

function StepRow({ detail, state, step }) {
  const status = state?.status || 'idle';
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
