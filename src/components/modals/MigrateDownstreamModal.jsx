import {
  Button,
  Description,
  Form,
  Input,
  Label,
  Modal,
  Spinner,
  TextField
} from '@heroui/react';
import { IconAlertTriangle, IconArrowRight, IconX } from '@tabler/icons-react';
import { useEffect, useMemo, useState } from 'react';

import { DatasetComboBox } from '@/components';
import { compareDatasetSchemas } from '@/services';

/**
 * Modal that collects the destination dataset and runs a schema-compatibility
 * check before submit. If the target's schema doesn't fully cover the
 * origin's columns/types, a warning panel lists the mismatches and the
 * submit button switches to "Proceed Anyway" — matching the CLI's behavior.
 *
 * @param {Object} props
 * @param {Object} props.currentContext
 * @param {boolean} props.isOpen
 * @param {(open: boolean) => void} props.onOpenChange
 * @param {(formData: { targetId: string, targetName: string|null, ignoredSchemaWarnings: boolean }) => void} props.onSubmit
 * @param {{ id: string, name: string }} props.sourceDataset
 * @param {{ cards: number, datasetViews: number, dataflows: number }} props.selectedCounts
 */
export function MigrateDownstreamModal({
  currentContext,
  isOpen,
  onOpenChange,
  onSubmit,
  selectedCounts,
  sourceDataset
}) {
  const [selectedDatasetId, setSelectedDatasetId] = useState(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState(null);
  const [comparison, setComparison] = useState(null);
  const [isComparing, setIsComparing] = useState(false);
  const [comparisonError, setComparisonError] = useState(null);

  // Fresh state every time the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    setSelectedDatasetId(null);
    setSelectedDisplayName(null);
    setComparison(null);
    setComparisonError(null);
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

  const excludeIds = useMemo(
    () => (sourceDataset?.id ? new Set([sourceDataset.id]) : null),
    [sourceDataset?.id]
  );

  const totalSelected =
    (selectedCounts?.cards || 0) +
    (selectedCounts?.datasetViews || 0) +
    (selectedCounts?.dataflows || 0);

  const hasMismatches = comparison && !comparison.compatible;
  const submitDisabled =
    !selectedDatasetId || isComparing || totalSelected === 0 || comparisonError !== null;

  const handleSubmit = (e) => {
    if (e) e.preventDefault();
    if (submitDisabled) return;

    const formData = {
      ignoredSchemaWarnings: hasMismatches,
      targetId: selectedDatasetId,
      targetName: selectedDisplayName ?? null
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
              <IconX stroke={1.5} />
            </Modal.CloseTrigger>
            <Form id='migrate-downstream-form' onSubmit={handleSubmit}>
              <Modal.Header>
                <Modal.Heading>Migrate Downstream Content</Modal.Heading>
              </Modal.Header>
              <Modal.Body className='flex flex-col gap-2'>
                <TextField isReadOnly className='pointer-events-none'>
                  <Label>From Dataset</Label>
                  <Input value={sourceDataset?.name || sourceDataset?.id || ''} variant='secondary' />
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
                    <IconAlertTriangle stroke={1.5} />
                    <div>
                      <div className='font-medium'>Schema check failed</div>
                      <div>{comparisonError}</div>
                    </div>
                  </div>
                )}

                {hasMismatches && (
                  <div className='flex flex-col gap-1 rounded border border-warning bg-warning/10 p-2 text-xs'>
                    <div className='flex items-center gap-1 font-medium text-warning'>
                      <IconAlertTriangle stroke={1.5} />
                      <span>
                        {comparison.missing.length} schema
                        {comparison.missing.length === 1 ? '' : 's'} mismatched
                      </span>
                    </div>
                    <Description className='text-foreground'>
                      The target dataset is missing columns or has different types. Downstream
                      content may break after migration.
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
                  <IconArrowRight stroke={1.5} />
                  {hasMismatches ? 'Proceed Anyway' : 'Migrate'}
                </Button>
              </Modal.Footer>
            </Form>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
