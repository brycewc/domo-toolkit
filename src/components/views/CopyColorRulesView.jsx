import { Alert, Button, Card, Separator, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { DatasetComboBox } from '@/components/DatasetComboBox';
import { useStatusBar } from '@/hooks/useStatusBar';
import { DomoContext } from '@/models/DomoContext';
import { getColorRules, getDatasetBeastModes, getDatasetColumns, setColorRules } from '@/services/datasets';
import { parseMarkdownBold, stripMarkdownBold } from '@/utils/markdown';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheckCircle from '@icons/check-circle.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconX from '@icons/x.svg?react';

export function CopyColorRulesView({ instance = null, onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContext, setCurrentContext] = useState(null);
  const [sourceRules, setSourceRules] = useState([]);
  const [destinationId, setDestinationId] = useState(null);
  const [destinationColumns, setDestinationColumns] = useState(null);
  const [destinationBeastModes, setDestinationBeastModes] = useState(null);
  const [destinationExistingRules, setDestinationExistingRules] = useState(null);
  const [isLoadingDestination, setIsLoadingDestination] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const mountedRef = useRef(true);
  const destGenRef = useRef(0);
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
      if (!data || data.type !== 'copyColorRules') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      if (!context || context.domoObject?.typeId !== 'DATA_SOURCE') {
        onStatusUpdate?.('Error', 'Copy Color Rules requires a dataset context', 'danger');
        onBackToDefault?.();
        return;
      }
      const rules = await getColorRules(context.domoObject.id, context.tabId);
      if (!mountedRef.current) return;
      setCurrentContext(context);
      setSourceRules(rules);
    } catch (error) {
      console.error('[CopyColorRulesView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load color rules', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleDestinationChange = async (destId) => {
    if (destId == null || destId === currentContext?.domoObject?.id) {
      setDestinationId(destId);
      setDestinationColumns(null);
      setDestinationBeastModes(null);
      setDestinationExistingRules(null);
      return;
    }
    setDestinationId(destId);
    setDestinationColumns(null);
    setDestinationBeastModes(null);
    setDestinationExistingRules(null);
    setIsLoadingDestination(true);
    destGenRef.current += 1;
    const gen = destGenRef.current;
    try {
      const tabId = currentContext.tabId;
      const [columns, beastModes, existing] = await Promise.all([
        getDatasetColumns({ datasetId: destId, tabId }),
        getDatasetBeastModes(destId, tabId),
        getColorRules(destId, tabId)
      ]);
      if (!mountedRef.current || gen !== destGenRef.current) return;
      setDestinationColumns(columns);
      setDestinationBeastModes(beastModes);
      setDestinationExistingRules(existing);
    } catch (error) {
      if (gen !== destGenRef.current) return;
      console.error('[CopyColorRulesView] Error loading destination:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load destination dataset', 'danger');
    } finally {
      if (mountedRef.current && gen === destGenRef.current) {
        setIsLoadingDestination(false);
      }
    }
  };

  const handleSubmit = () => {
    if (!destinationId || !currentContext) return;
    setIsSubmitting(true);
    const tabId = currentContext.tabId;
    const count = sourceRules.length;
    const remappedRules = sourceRules.map((rule) => {
      const col = rule?.condition?.column;
      if (col && beastModeIdSwap[col]) {
        return {
          ...rule,
          condition: { ...rule.condition, column: beastModeIdSwap[col] }
        };
      }
      return rule;
    });
    const promise = setColorRules(destinationId, remappedRules, tabId);
    showPromiseStatus(promise, {
      error: (err) => err.message || 'Failed to copy color rules',
      loading: `Copying **${count}** color rule${count === 1 ? '' : 's'}…`,
      success: () => `Copied ${count} color rule${count === 1 ? '' : 's'}`
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
          <p className='text-sm text-muted'>Loading color rules…</p>
        </Card.Content>
      </Card>
    );
  }

  if (!currentContext) return null;

  const sourceId = currentContext.domoObject.id;
  const sourceName = currentContext.domoObject.metadata?.name || sourceId;
  const sourceBeastModes = currentContext.domoObject.metadata?.details?.properties?.formulas?.formulas || {};
  const sameDataset = destinationId && destinationId === sourceId;
  const { missingColumns, swap: beastModeIdSwap } =
    destinationColumns && sourceRules.length > 0
      ? resolveColumnRefs(sourceRules, destinationColumns, sourceBeastModes, destinationBeastModes)
      : { missingColumns: [], swap: {} };
  const beastModeSwapsUsed = sourceRules.filter(
    (rule) => rule?.condition?.column && beastModeIdSwap[rule.condition.column]
  ).length;
  const schemaResolved =
    !!destinationColumns && !sameDataset && !isLoadingDestination && sourceRules.length > 0 && missingColumns.length === 0;
  const destinationHasRules = (destinationExistingRules?.length ?? 0) > 0;
  const canSubmit = !!destinationId && !sameDataset && !isLoadingDestination && !isSubmitting && sourceRules.length > 0;

  const headerTitle = `Copy Color Rules from **${sourceName}**`;
  const headerSubtext = `${sourceRules.length} color rule${sourceRules.length === 1 ? '' : 's'}`;

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header className='gap-1'>
        <Tooltip>
          <Tooltip.Trigger className='min-w-0 pr-8'>
            <Card.Title className='line-clamp-1'>{parseMarkdownBold(headerTitle)}</Card.Title>
          </Tooltip.Trigger>
          <Tooltip.Content className='max-w-60'>{stripMarkdownBold(headerTitle)}</Tooltip.Content>
        </Tooltip>
        {onBackToDefault && (
          <Tooltip>
            <Button
              isIconOnly
              aria-label='Close view'
              className='absolute top-1 right-2'
              size='sm'
              variant='ghost'
              onPress={onBackToDefault}
            >
              <IconX />
            </Button>
            <Tooltip.Content className='max-w-60'>Close view</Tooltip.Content>
          </Tooltip>
        )}
        <div className='min-w-0 truncate text-xs text-muted'>{parseMarkdownBold(headerSubtext)}</div>
        <Separator className='mt-1.5' />
      </Card.Header>

      <div className='flex flex-col gap-3 pt-3'>
        <DatasetComboBox
          aria-label='Destination dataset'
          instanceBaseUrl={currentContext.domoObject?.baseUrl}
          label='Destination'
          tabId={currentContext.tabId}
          onSelectionChange={handleDestinationChange}
        />

        {sameDataset && (
          <Alert className='w-full border border-border bg-transparent' status='warning'>
            <Alert.Indicator>
              <IconExclamationTriangle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Same dataset</Alert.Title>
              <Alert.Description>Pick a different dataset as the destination.</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {isLoadingDestination && (
          <div className='flex items-center gap-2 text-sm text-muted'>
            <Spinner size='sm' />
            Checking destination…
          </div>
        )}

        {!isLoadingDestination && destinationHasRules && (
          <Alert className='w-full border border-border bg-transparent' status='warning'>
            <Alert.Indicator>
              <IconExclamationTriangle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Destination already has color rules</Alert.Title>
              <Alert.Description>
                The destination dataset has {destinationExistingRules.length} existing rule
                {destinationExistingRules.length === 1 ? '' : 's'}. Copying will replace them.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {schemaResolved && (
          <Alert className='w-full border border-border bg-transparent' status='success'>
            <Alert.Indicator>
              <IconCheckCircle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>Schema matches</Alert.Title>
              <Alert.Description>
                All rule column references exist on the destination
                {beastModeSwapsUsed > 0
                  ? ` (${beastModeSwapsUsed} Beast Mode reference${
                      beastModeSwapsUsed === 1 ? '' : 's'
                    } will be remapped to the destination's ids).`
                  : '.'}
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        {!isLoadingDestination && missingColumns.length > 0 && (
          <Alert className='w-full border border-border bg-transparent' status='warning'>
            <Alert.Indicator>
              <IconExclamationTriangle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Title>
                {missingColumns.length} column{missingColumns.length === 1 ? '' : 's'} not on destination
              </Alert.Title>
              <Alert.Description>
                Rules referencing {missingColumns.join(', ')} will be copied as-is and may not render until those columns
                exist.
              </Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </div>

      <div className='flex shrink-0 flex-col gap-2 pt-2'>
        <Button fullWidth isDisabled={!canSubmit} isPending={isSubmitting} variant='primary' onPress={handleSubmit}>
          Copy Color Rules
        </Button>
      </div>
    </Card>
  );
}

/**
 * Resolve each rule's `condition.column` against the destination dataset.
 *
 * Regular columns match by name or id against the destination's schema. Beast
 * Modes (calculation_<uuid>) have per-dataset ids, so we name-match the source
 * beast mode against the destination's beast modes and emit a swap entry when
 * we find one; that swap is applied to the rules right before the PUT so the
 * copied rule references the destination's id.
 *
 * Returns `{ missingColumns, swap }`. `missingColumns` shows friendly names
 * (the source beast mode's name when applicable) so the warning is readable.
 */
function resolveColumnRefs(rules, destColumns, sourceBeastModes, destBeastModes) {
  const knownColumns = new Set();
  for (const c of destColumns) {
    if (c.name) knownColumns.add(c.name);
    if (c.id) knownColumns.add(c.id);
  }
  const destBeastModeNameToId = {};
  for (const [id, def] of Object.entries(destBeastModes || {})) {
    if (def?.name) destBeastModeNameToId[def.name] = id;
  }
  const swap = {};
  for (const [srcId, def] of Object.entries(sourceBeastModes || {})) {
    const destId = def?.name && destBeastModeNameToId[def.name];
    if (destId) swap[srcId] = destId;
  }
  const missing = new Set();
  for (const rule of rules) {
    const ref = rule?.condition?.column;
    if (!ref) continue;
    if (knownColumns.has(ref)) continue;
    if (swap[ref]) continue;
    missing.add(sourceBeastModes?.[ref]?.name || ref);
  }
  return { missingColumns: [...missing], swap };
}
