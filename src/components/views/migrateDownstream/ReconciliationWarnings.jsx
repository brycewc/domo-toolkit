import { Chip, Disclosure } from '@heroui/react';

import { Alert } from '@/components/Alert';
import { AlertStatusIcon } from '@/components/AlertStatusIcon';
import IconChevronDown from '@icons/chevron-down.svg?react';

export function ReconciliationWarnings({
  appColumnCollisions,
  hasMismatches,
  isScanning,
  jupyterColumnWarnings,
  mergeableDataflows,
  originName,
  scanResult,
  scriptDataflowWarnings,
  sqlDataflowWarnings,
  targetLabel,
  unrepointableDataflows,
  unrepointableDatasets,
  usedUnmappedColumns,
  viewFusionWarnings
}) {
  const scanSettled = Boolean(hasMismatches && !isScanning && scanResult);
  const names = (list) => list.map((x) => x.name || x.id).join(', ');
  const warnings = [];

  if (scanSettled && usedUnmappedColumns.length > 0) {
    warnings.push({
      body: 'Best practice is to align schemas before migrating content. Proceeding here is your responsibility; broken column references can cause cards to render blank, dataflows to fail, and views to error. Validate every result.',
      key: 'mismatched-columns',
      title:
        usedUnmappedColumns.length === 1
          ? "1 used column doesn't match"
          : `${usedUnmappedColumns.length} used columns don't match`
    });
  }

  if (scanSettled && sqlDataflowWarnings.length > 0) {
    warnings.push({
      body: `${names(sqlDataflowWarnings)} reference this dataset in SQL that can't be remapped automatically. The input is repointed on migrate, but you'll need to update the SQL by hand.`,
      key: 'sql-dataflows',
      title:
        sqlDataflowWarnings.length === 1
          ? '1 SQL dataflow needs manual review'
          : `${sqlDataflowWarnings.length} SQL dataflows need manual review`
    });
  }

  if (scanSettled && scriptDataflowWarnings.length > 0) {
    warnings.push({
      body: `${names(scriptDataflowWarnings)} reference this dataset's columns inside a Python or R script tile, which can't be renamed automatically. The input is repointed on migrate, but you'll need to update the script by hand.`,
      key: 'script-dataflows',
      title:
        scriptDataflowWarnings.length === 1
          ? '1 script dataflow needs manual review'
          : `${scriptDataflowWarnings.length} script dataflows need manual review`
    });
  }

  if (scanSettled && viewFusionWarnings.length > 0) {
    warnings.push({
      body: `${names(viewFusionWarnings)} use this dataset's columns inside calculated columns. Those column references are remapped automatically, but double-check the calculations after migrating.`,
      key: 'fused-views',
      title:
        viewFusionWarnings.length === 1
          ? '1 fused view needs manual review'
          : `${viewFusionWarnings.length} fused views need manual review`
    });
  }

  if (jupyterColumnWarnings.length > 0) {
    warnings.push({
      body: `${names(jupyterColumnWarnings)} read this dataset's columns in notebook code, which can't be rewritten automatically. The input is repointed on migrate, but you'll need to update the notebook by hand.`,
      key: 'jupyter-workspaces',
      title:
        jupyterColumnWarnings.length === 1
          ? '1 Jupyter Workspace needs manual review'
          : `${jupyterColumnWarnings.length} Jupyter Workspaces need manual review`
    });
  }

  if (mergeableDataflows.length > 0) {
    warnings.push({
      body: `${names(mergeableDataflows)} already read ${targetLabel}. Their input tile for ${originName} will be merged into the one they already have, and every tile reading it will be repointed.`,
      key: 'mergeable-dataflows',
      title:
        mergeableDataflows.length === 1
          ? '1 dataflow already reads the target'
          : `${mergeableDataflows.length} dataflows already read the target`
    });
  }

  if (unrepointableDataflows.length > 0) {
    warnings.push({
      body: `${names(unrepointableDataflows)} already read ${targetLabel} and run on SQL, where merging the two inputs would mean rewriting their SQL. They'll be skipped, so repoint them in Domo.`,
      key: 'unrepointable-dataflows',
      title:
        unrepointableDataflows.length === 1
          ? "1 dataflow can't be repointed"
          : `${unrepointableDataflows.length} dataflows can't be repointed`
    });
  }

  if (unrepointableDatasets.length > 0) {
    warnings.push({
      body: `${names(unrepointableDatasets)} already read ${targetLabel}, so repointing would leave them reading it twice. They'll be skipped, so update them in Domo.`,
      key: 'unrepointable-datasets',
      title:
        unrepointableDatasets.length === 1
          ? "1 view can't be repointed"
          : `${unrepointableDatasets.length} views can't be repointed`
    });
  }

  if (!isScanning && scanResult && appColumnCollisions.length > 0) {
    const columns = appColumnCollisions.flatMap((a) => a.collisions.map((c) => c.columnName)).join(', ');
    warnings.push({
      body: `${names(appColumnCollisions)} ${appColumnCollisions.length === 1 ? 'maps' : 'map'} two or more fields to the same target column (${columns}). The app reads each column only once, so only one of those fields keeps its data and the rest show up blank. Map them to distinct columns to avoid losing data.`,
      key: 'app-collisions',
      title:
        appColumnCollisions.length === 1
          ? '1 pro-code app would lose fields'
          : `${appColumnCollisions.length} pro-code apps would lose fields`
    });
  }

  if (warnings.length === 0) return null;

  return (
    <Disclosure className='space-0 w-full' id='warnings'>
      <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row items-center justify-between gap-2'>
        <Disclosure.Trigger
          aria-label='Toggle'
          className='flex w-full min-w-0 flex-1 basis-4/5 flex-row items-center gap-2 self-stretch'
          variant='tertiary'
        >
          <p className='min-w-0 truncate text-sm font-medium'>Warnings</p>
          <span aria-hidden='true' className='flex-1' />
          <div className='flex shrink-0 flex-row items-center gap-1'>
            <Chip color='warning' size='sm' variant='soft'>
              <Chip.Label>{warnings.length}</Chip.Label>
            </Chip>
          </div>
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body>
          <div className='flex flex-col gap-2'>
            {warnings.map((w) => (
              <Alert className='w-full border border-border bg-transparent' key={w.key} status='warning'>
                <Alert.Content>
                  <Alert.Title className='flex items-center gap-1'>
                    <AlertStatusIcon />
                    {w.title}
                  </Alert.Title>
                  <Alert.Description>{w.body}</Alert.Description>
                </Alert.Content>
              </Alert>
            ))}
          </div>
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
