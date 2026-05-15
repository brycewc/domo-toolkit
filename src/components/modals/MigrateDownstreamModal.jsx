import {
  Button,
  Description,
  Form,
  Input,
  Label,
  ListBox,
  Modal,
  Select,
  Spinner,
  TextField
} from '@heroui/react';
import { useEffect, useMemo, useState } from 'react';

import { DatasetComboBox } from '@/components/DatasetComboBox';
import { scanContentForColumns } from '@/services/columnReferences';
import { hasEffectiveMapping } from '@/services/columnRewriter';
import { getDatasetColumns } from '@/services/datasets';
import { compareDatasetSchemas } from '@/services/migrateDownstreamContent';
import IconArrowRight from '@icons/arrow-right.svg?react';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconX from '@icons/x.svg?react';

const UNMAPPED = '__unmapped__';

/**
 * Modal that:
 *   1. Collects the destination dataset.
 *   2. Runs schema compatibility check on the (origin, target) pair.
 *   3. If incompatible, scans every selected content item for column
 *      references and surfaces only the columns that are BOTH used by
 *      selected content AND missing/changed in the target schema. The user
 *      maps each (or leaves unmapped) — never auto-suggested.
 *   4. Submits with `{targetId, columnMap, definitionsByItemKey}` so the
 *      orchestrator can route through the full-PUT rewrite path.
 *
 * @param {Object} props
 * @param {Object} props.currentContext
 * @param {boolean} props.isOpen
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(formData: { targetId: string, targetName: string|null, columnMap: Record<string, string|null>, definitionsByItemKey: Map<string, {definition: Object}>, ignoredSchemaWarnings: boolean }) => void} props.onSubmit
 * @param {{ id: string, name: string }} props.sourceDataset
 * @param {{ cards: number, datasetViews: number, dataflows: number }} props.selectedCounts
 * @param {{ cards: Array, datasetViews: Array, dataflows: Array }} props.selectedItems - full selected items so we can scan their definitions
 */
export function MigrateDownstreamModal({
  currentContext,
  isOpen,
  onOpenChange,
  onSubmit,
  selectedCounts,
  selectedItems,
  sourceDataset
}) {
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState(null);

  // Scan + remap state — only populated when schema mismatch is detected.
  const [targetColumns, setTargetColumns] = useState([]);
  const [scanResult, setScanResult] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState(null);
  const [columnMap, setColumnMap] = useState({});

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedDatasetId(null);
    setSelectedDisplayName(null);
    setComparison(null);
    setComparisonError(null);
    setTargetColumns([]);
    setScanResult(null);
    setScanError(null);
    setColumnMap({});
  }, [isOpen]);

  // Run the schema check whenever the user picks a target.
  useEffect(() => {
    if (!isOpen || !selectedDatasetId || !sourceDataset?.id) {
      setComparison(null);
      setComparisonError(null);
      return;
    }
    let cancelled = false;
    setIsComparing(true);
    setComparison(null);
    setComparisonError(null);
    setScanResult(null);
    setScanError(null);
    setColumnMap({});
    compareDatasetSchemas(sourceDataset.id, selectedDatasetId, currentContext?.tabId)
      .then((result) => {
        if (cancelled) return;
        setComparison(result);
      })
      .catch((err) => {
        if (cancelled) return;
        setComparisonError(err?.message || 'Schema comparison failed');
      })
      .finally(() => {
        if (!cancelled) setIsComparing(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, selectedDatasetId, sourceDataset?.id, currentContext?.tabId]);

  // When mismatch is detected, fetch target columns AND scan selected content
  // for column references in parallel. Both feed the column-mapper UI.
  useEffect(() => {
    if (!comparison || comparison.compatible) return;
    if (!selectedDatasetId) return;
    let cancelled = false;
    setIsScanning(true);
    setScanError(null);

    Promise.all([
      getDatasetColumns({ datasetId: selectedDatasetId, tabId: currentContext?.tabId }),
      scanContentForColumns({
        originId: sourceDataset?.id,
        selectedItems,
        tabId: currentContext?.tabId
      })
    ])
      .then(([cols, scan]) => {
        if (cancelled) return;
        setTargetColumns(cols || []);
        setScanResult(scan);
      })
      .catch((err) => {
        if (cancelled) return;
        setScanError(err?.message || 'Failed to scan content for column references');
      })
      .finally(() => {
        if (!cancelled) setIsScanning(false);
      });
    return () => {
      cancelled = true;
    };
  }, [comparison, selectedDatasetId, selectedItems, sourceDataset?.id, currentContext?.tabId]);

  const excludeIds = useMemo(
    () => (sourceDataset?.id ? new Set([sourceDataset.id]) : null),
    [sourceDataset?.id]
  );

  const totalSelected =
    (selectedCounts?.cards || 0) +
    (selectedCounts?.datasetViews || 0) +
    (selectedCounts?.dataflows || 0);

  const hasMismatches = comparison && !comparison.compatible;

  // Columns that are BOTH used by selected content AND missing/changed in the
  // target schema. The intersection is what the user has to make a decision
  // about — anything outside it is either irrelevant or already compatible.
  const usedUnmappedColumns = useMemo(() => {
    if (!hasMismatches || !scanResult) return [];
    const mismatchedNames = new Set((comparison?.missing || []).map((m) => m.name));
    const referenced = scanResult.byColumn || new Map();
    const out = [];
    for (const [colName, items] of referenced.entries()) {
      if (mismatchedNames.has(colName)) {
        out.push({ items, name: colName });
      }
    }
    out.sort((a, b) => a.name.localeCompare(b.name));
    return out;
  }, [hasMismatches, scanResult, comparison]);

  const submitDisabled =
    !selectedDatasetId ||
    isComparing ||
    isScanning ||
    totalSelected === 0 ||
    comparisonError !== null ||
    scanError !== null;

  const buttonLabel = useMemo(() => {
    if (!hasMismatches) return 'Migrate';
    if (hasEffectiveMapping(columnMap)) return 'Migrate with Remap';
    return 'Proceed Anyway';
  }, [hasMismatches, columnMap]);

  const handleColumnChoice = (originName, choice) => {
    setColumnMap((prev) => {
      const next = { ...prev };
      if (choice === UNMAPPED || choice == null) {
        next[originName] = null;
      } else {
        next[originName] = choice;
      }
      return next;
    });
  };

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (submitDisabled) return;

    // Map of NEW column name → target type. Used by the dataset-view
    // rewriter to propagate type changes from a column rename across a type
    // boundary (e.g. LONG → STRING) so Domo's view validator doesn't 400 on
    // "column types do not match".
    const targetColumnTypes = {};
    for (const col of targetColumns) {
      if (col?.name && col?.type) targetColumnTypes[col.name] = col.type;
    }

    const formData = {
      columnMap,
      definitionsByItemKey: scanResult?.byItem || new Map(),
      ignoredSchemaWarnings: hasMismatches,
      targetColumnTypes,
      targetId: selectedDatasetId,
      targetName: selectedDisplayName ?? null,
      // Force the full-PUT path whenever the schema check found mismatches.
      // The lightweight datasource-swap shortcut can't reconcile mismatched
      // column names server-side; using it here would silently fail.
      useFullPath: Boolean(hasMismatches)
    };
    onOpenChange(false);
    onSubmit(formData);
  };

  return (
    <Modal isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Backdrop>
        <Modal.Container className='p-1' placement='top' scroll='outside'>
          <Modal.Dialog className='p-2'>
            <Modal.CloseTrigger className='absolute top-2 right-2' variant='ghost'>
              <IconX />
            </Modal.CloseTrigger>
            <Form id='migrate-downstream-form' onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>Migrate Downstream Content</Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex flex-col gap-2'>
                <TextField isReadOnly className='pointer-events-none'>
                  <Label>From Dataset</Label>
                  <Input
                    value={sourceDataset?.name || sourceDataset?.id || ''}
                    variant='secondary'
                  />
                </TextField>

                <DatasetComboBox
                  className='min-w-0'
                  excludeIds={excludeIds}
                  isActive={isOpen}
                  label='To Dataset'
                  selectedDisplayName={selectedDisplayName}
                  selectedKey={selectedDatasetId}
                  tabId={currentContext?.tabId}
                  onSelectionChange={(key) => {
                    setSelectedDatasetId(key);
                    setSelectedDisplayName(null);
                  }}
                />

                {isComparing && (
                  <div className='flex items-center gap-2 text-xs text-muted'>
                    <Spinner size='sm' />
                    <span>Comparing schemas…</span>
                  </div>
                )}

                {comparisonError && (
                  <div className='flex items-start gap-2 rounded border border-danger bg-danger/10 p-2 text-xs text-danger'>
                    <IconExclamationTriangle />
                    <div>
                      <div className='font-medium'>Schema check failed</div>
                      <div>{comparisonError}</div>
                    </div>
                  </div>
                )}

                {hasMismatches && (
                  <div className='flex flex-col gap-1 rounded border border-warning bg-warning/10 p-2 text-xs'>
                    <div className='flex items-center gap-1 font-medium text-warning'>
                      <IconExclamationTriangle />
                      <span>
                        {comparison.missing.length} schema
                        {comparison.missing.length === 1 ? '' : 's'} mismatched
                      </span>
                    </div>
                    <Description className='text-foreground'>
                      Best practice is to align schemas BEFORE migrating content. Proceeding here
                      is your responsibility — broken column references can cause cards to render
                      blank, dataflows to fail, and views to error. Validate every result.
                    </Description>
                    <ul className='ml-4 list-disc text-foreground'>
                      {comparison.missing.slice(0, 8).map((m) => (
                        <li key={m.name}>
                          <span className='font-mono'>{m.name}</span> — expected{' '}
                          <span className='font-mono'>{m.expectedType}</span>
                          {m.actualType ? (
                            <>
                              , got <span className='font-mono'>{m.actualType}</span>
                            </>
                          ) : (
                            ', missing in target'
                          )}
                        </li>
                      ))}
                      {comparison.missing.length > 8 && (
                        <li>and {comparison.missing.length - 8} more…</li>
                      )}
                    </ul>
                  </div>
                )}

                {comparison?.compatible && (
                  <div className='text-xs text-success'>Schemas are compatible.</div>
                )}

                {hasMismatches && isScanning && (
                  <div className='flex items-center gap-2 text-xs text-muted'>
                    <Spinner size='sm' />
                    <span>Scanning content for column references…</span>
                  </div>
                )}

                {hasMismatches && scanError && (
                  <div className='flex items-start gap-2 rounded border border-danger bg-danger/10 p-2 text-xs text-danger'>
                    <IconExclamationTriangle />
                    <div>
                      <div className='font-medium'>Column scan failed</div>
                      <div>{scanError}</div>
                    </div>
                  </div>
                )}

                {hasMismatches && !isScanning && scanResult && usedUnmappedColumns.length > 0 && (
                  <div className='flex flex-col gap-1 rounded border border-default p-2'>
                    <Label className='text-sm font-medium'>Column Remap</Label>
                    <Description className='text-xs'>
                      Map each origin column to a column on the target dataset, or leave it
                      unmapped (you'll need to fix references manually). Only columns actually
                      referenced by the selected content are shown.
                    </Description>
                    <div className='flex max-h-72 flex-col gap-1 overflow-y-auto pr-1'>
                      {usedUnmappedColumns.map(({ items, name }) => (
                        <ColumnMapRow
                          collisions={scanResult?.dataflowCollisions?.get?.(name) || null}
                          itemsCount={items.length}
                          key={name}
                          mappedTo={columnMap[name] ?? UNMAPPED}
                          originName={name}
                          targetColumns={targetColumns}
                          onChange={(choice) => handleColumnChoice(name, choice)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {hasMismatches &&
                  !isScanning &&
                  scanResult &&
                  usedUnmappedColumns.length === 0 && (
                    <div className='text-xs text-muted'>
                      None of the mismatched columns are referenced by the selected content. Safe
                      to proceed without remapping, but data may still be missing in the target.
                    </div>
                  )}

                <p className='text-xs text-muted'>
                  <span className='font-medium text-foreground'>{selectedCounts?.cards || 0}</span>{' '}
                  card{selectedCounts?.cards === 1 ? '' : 's'},{' '}
                  <span className='font-medium text-foreground'>
                    {selectedCounts?.datasetViews || 0}
                  </span>{' '}
                  dataset view{selectedCounts?.datasetViews === 1 ? '' : 's'},{' '}
                  <span className='font-medium text-foreground'>
                    {selectedCounts?.dataflows || 0}
                  </span>{' '}
                  dataflow{selectedCounts?.dataflows === 1 ? '' : 's'} selected
                </p>
              </Modal.Body>
              <Modal.Footer className='flex justify-end gap-2'>
                <Button size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button
                  isDisabled={submitDisabled}
                  size='sm'
                  type='submit'
                  variant={hasMismatches ? 'danger' : 'primary'}
                >
                  <IconArrowRight />
                  {buttonLabel}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}

function ColumnMapRow({ collisions, itemsCount, mappedTo, onChange, originName, targetColumns }) {
  // Aggregate collisions by dataflow — many other-inputs may share the same
  // column name; the user mostly cares which dataflows are affected.
  const collisionByDataflow = useMemo(() => {
    if (!collisions || collisions.length === 0) return [];
    const m = new Map();
    for (const c of collisions) {
      if (!m.has(c.dataflowId)) {
        m.set(c.dataflowId, { dataflowName: c.dataflowName, otherInputs: new Set() });
      }
      m.get(c.dataflowId).otherInputs.add(c.otherInputName);
    }
    return [...m.entries()].map(([id, v]) => ({
      dataflowId: id,
      dataflowName: v.dataflowName,
      otherInputs: [...v.otherInputs]
    }));
  }, [collisions]);

  return (
    <div className='flex flex-col gap-1 rounded border border-default/40 p-1'>
      <div className='flex items-center gap-2'>
        <div className='flex min-w-0 flex-1 flex-col'>
          <span className='truncate font-mono text-xs'>{originName}</span>
          <span className='text-[10px] text-muted'>
            Used by {itemsCount} item{itemsCount === 1 ? '' : 's'}
          </span>
        </div>
        <Select
          aria-label={`Map ${originName} to`}
          className='w-44'
          selectedKey={mappedTo}
          onSelectionChange={(key) => onChange(key)}
        >
          <Select.Trigger>
            <Select.Value />
            <Select.Indicator>
              <IconChevronDown />
            </Select.Indicator>
          </Select.Trigger>
          <Select.Popover>
            <ListBox className='max-h-60 overflow-y-auto'>
              <ListBox.Item id={UNMAPPED} textValue='Leave unmapped'>
                <span className='italic text-muted'>Leave unmapped</span>
                <ListBox.ItemIndicator>
                  {({ isSelected }) => (isSelected ? <IconCheck /> : null)}
                </ListBox.ItemIndicator>
              </ListBox.Item>
              {targetColumns.map((col) => (
                <ListBox.Item id={col.name} key={col.name} textValue={col.name}>
                  <div className='flex min-w-0 flex-col'>
                    <span className='truncate font-mono text-xs'>{col.name}</span>
                    {col.type && <span className='text-[10px] text-muted'>{col.type}</span>}
                  </div>
                  <ListBox.ItemIndicator>
                    {({ isSelected }) => (isSelected ? <IconCheck /> : null)}
                  </ListBox.ItemIndicator>
                </ListBox.Item>
              ))}
            </ListBox>
          </Select.Popover>
        </Select>
      </div>
      {collisionByDataflow.length > 0 && (
        <div className='flex items-start gap-1 rounded bg-warning/10 p-1 text-[11px] text-warning'>
          <IconExclamationTriangle className='size-3.5 shrink-0' />
          <div className='flex min-w-0 flex-1 flex-col gap-0.5 text-foreground'>
            <span className='font-medium text-warning'>
              Cross-input collision: this column also exists on{' '}
              {collisionByDataflow.length === 1
                ? `another input of ${collisionByDataflow[0].dataflowName}`
                : `other inputs of ${collisionByDataflow.length} dataflows`}
            </span>
            <span>
              Remapping will rewrite every reference to{' '}
              <span className='font-mono'>{originName}</span> in the affected dataflow
              {collisionByDataflow.length === 1 ? '' : 's'}, including refs that came from{' '}
              {collisionByDataflow.length === 1
                ? collisionByDataflow[0].otherInputs.join(', ')
                : 'other inputs'}
              . Consider leaving this unmapped and fixing the dataflow manually.
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
