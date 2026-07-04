import { Button, Checkbox, Label, ListBox, Select, Spinner } from '@heroui/react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { updateAlertTriggerVersions } from '@/services/alerts';
import { getWorkflowModelName, getWorkflowTriggers, getWorkflowVersions } from '@/services/workflows';
import { compareSemver } from '@/utils/semver';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconDoubleChevronUp from '@icons/double-chevron-up.svg?react';

import { DataList } from './DataList';

export function UpdateTriggerVersionsView({
  instance = null,
  liveContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentContext, setCurrentContext] = useState(null);
  const [modelId, setModelId] = useState(null);
  const [workflowName, setWorkflowName] = useState(null);
  const [versions, setVersions] = useState([]);
  const [triggers, setTriggers] = useState([]);
  const [targetVersion, setTargetVersion] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // The set of triggers that are behind the chosen target. Both the default
  // selection and which rows are selectable derive from this, so it recomputes
  // whenever the user picks a different target version.
  const outdatedIds = useMemo(() => {
    const ids = new Set();
    for (const t of triggers) {
      if (t.currentVersion !== targetVersion) ids.add(triggerKey(t));
    }
    return ids;
  }, [targetVersion, triggers]);

  // Default the selection to every out-of-date trigger (opt-out semantics): the
  // user unchecks the ones they want to leave behind. Recomputed on target
  // change so switching the target re-selects whatever is now behind it.
  useEffect(() => {
    setSelectedIds(new Set(outdatedIds));
  }, [outdatedIds]);

  const items = useMemo(
    () =>
      triggers.map((t) => {
        const onTarget = t.currentVersion === targetVersion;
        return new DataListItem({
          id: triggerKey(t),
          label: t.name || `Alert ${t.alertId}`,
          metadata: onTarget ? `Already on v${targetVersion}` : `v${t.currentVersion} → v${targetVersion}`,
          muted: onTarget,
          originalId: t.alertId,
          typeId: 'ALERT',
          url: currentContext ? `${currentContext.domoObject?.baseUrl || ''}/alerts/${t.alertId}` : undefined
        });
      }),
    [currentContext, targetVersion, triggers]
  );

  const isSelectable = (item) => outdatedIds.has(item.id);

  const banner = useMemo(() => {
    if (!targetVersion) return null;
    return (
      <div className='flex flex-col gap-2 px-2 pt-2'>
        <div className='flex items-center justify-start gap-2'>
          <Label className='shrink-0' id='target-version-label'>
            Target version
          </Label>
          <Select
            aria-labelledby='target-version-label'
            className='w-40 flex-1'
            selectionMode='single'
            value={targetVersion}
            variant='secondary'
            onChange={(key) => setTargetVersion(key)}
          >
            <Select.Trigger className='items-center py-0'>
              <Select.Value />
              <Select.Indicator>
                <IconChevronDown />
              </Select.Indicator>
            </Select.Trigger>
            <Select.Popover className='max-h-60!'>
              <ListBox>
                {sortedVersions(versions).map((v, index) => (
                  <ListBox.Item id={v.version} key={v.version} textValue={versionLabel(v, index === 0)}>
                    <Label>{versionLabel(v, index === 0)}</Label>
                    <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
                  </ListBox.Item>
                ))}
              </ListBox>
            </Select.Popover>
          </Select>
        </div>
      </div>
    );
  }, [outdatedIds, selectedIds, targetVersion, triggers, versions]);

  const selectionToolbar = useMemo(() => {
    const outdatedCount = outdatedIds.size;
    if (outdatedCount === 0) return null;
    const selectedCount = selectedIds.size;
    return (
      <div className='px-2 py-1'>
        <Checkbox
          aria-label='Select all triggers'
          isDisabled={isSubmitting}
          isIndeterminate={selectedCount > 0 && selectedCount < outdatedCount}
          isSelected={selectedCount === outdatedCount && outdatedCount > 0}
          variant='secondary'
          onChange={(isSelected) => setSelectedIds(isSelected ? new Set(outdatedIds) : new Set())}
        >
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
          <Checkbox.Content>
            <Label>
              Select all ({selectedCount} / {outdatedCount})
            </Label>
          </Checkbox.Content>
        </Checkbox>
      </div>
    );
  }, [isSubmitting, outdatedIds, selectedIds]);

  async function handleSubmit() {
    const selected = triggers.filter((t) => selectedIds.has(triggerKey(t)));
    if (selected.length === 0) return;
    setIsSubmitting(true);
    const promise = updateAlertTriggerVersions({ tabId: currentContext?.tabId, targetVersion, triggers: selected });
    showPromiseStatus(promise, {
      error: (err) => `Failed to update triggers: ${err.message}`,
      loading: `Updating **${selected.length}** trigger${selected.length === 1 ? '' : 's'}...`,
      success: (res) =>
        res.failed > 0
          ? `Updated **${res.succeeded}**, **${res.failed}** failed`
          : `Updated **${res.succeeded}** trigger${res.succeeded === 1 ? '' : 's'} to v${targetVersion}`
    });
    try {
      const res = await promise;
      // Close on a clean run; keep the view open (refreshed) when some updates
      // failed so the user can see what is left and retry.
      if (res.failed > 0) {
        await refresh();
      } else {
        onBackToDefault?.();
        return;
      }
    } catch {
      // Status already surfaced via showPromiseStatus.
    } finally {
      if (mountedRef.current) setIsSubmitting(false);
    }
  }

  async function loadData(context = null) {
    try {
      let ctx = context;
      if (!ctx) {
        const data = await getSidepanelData(instance);
        if (!data || data.type !== 'updateTriggerVersions') {
          onBackToDefault?.();
          return;
        }
        ctx = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      }
      if (!ctx?.domoObject?.id) {
        onStatusUpdate?.('Error', 'No workflow context available', 'danger');
        onBackToDefault?.();
        return;
      }

      const id = ctx.domoObject.id;
      if (mountedRef.current) {
        setCurrentContext(ctx);
        setModelId(id);
      }

      const [name, versionList, triggerList] = await Promise.all([
        ctx.domoObject.metadata?.details?.name
          ? Promise.resolve(ctx.domoObject.metadata.details.name)
          : getWorkflowModelName(id, ctx.tabId),
        getWorkflowVersions(id, ctx.tabId),
        getWorkflowTriggers(id, ctx.tabId)
      ]);

      if (!mountedRef.current) return;
      setWorkflowName(name);
      setVersions(versionList);
      setTriggers(triggerList);
      setTargetVersion(latestVersion(versionList));
    } catch (error) {
      if (mountedRef.current) {
        onStatusUpdate?.('Error', error.message || 'Failed to load triggers', 'danger');
        onBackToDefault?.();
      }
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }

  async function refresh() {
    setIsRefreshing(true);
    await loadData(currentContext);
  }

  if (isLoading) {
    return (
      <div className='flex h-full items-center justify-center'>
        <Spinner />
      </div>
    );
  }

  const selectedCount = selectedIds.size;
  const footer = (
    <Button fullWidth isDisabled={selectedCount === 0 || isSubmitting} size='sm' onPress={handleSubmit}>
      {isSubmitting
        ? 'Updating...'
        : `Update ${selectedCount} trigger${selectedCount === 1 ? '' : 's'} to v${targetVersion}`}
    </Button>
  );

  return (
    <DataList
      selectionMode
      banner={banner}
      currentContext={currentContext || liveContext}
      feature='Triggers for'
      featureIcon={<IconDoubleChevronUp />}
      footer={footer}
      headerActions={['reload', 'refresh']}
      isRefreshing={isRefreshing}
      isSelectable={isSelectable}
      itemLabel='trigger'
      items={items}
      objectId={modelId}
      objectType='WORKFLOW_MODEL'
      selectedIds={selectedIds}
      selectionToolbar={selectionToolbar}
      showActions={false}
      showActivityLogAll={false}
      showCounts={false}
      subject={workflowName}
      subjectTypeId='WORKFLOW_MODEL'
      viewType='updateTriggerVersions'
      onClose={onBackToDefault}
      onRefresh={refresh}
      onSelectionChange={setSelectedIds}
      onStatusUpdate={onStatusUpdate}
      subtext={
        triggers.length === 0
          ? 'This workflow has no alert triggers.'
          : `**${triggers.length}** alert trigger${triggers.length === 1 ? '' : 's'}`
      }
    />
  );
}

function latestVersion(versionList) {
  if (!Array.isArray(versionList) || versionList.length === 0) return null;
  return sortedVersions(versionList)[0]?.version ?? null;
}

function sortedVersions(versionList) {
  return [...(versionList || [])].sort((a, b) => compareSemver(b.version, a.version));
}

function triggerKey(trigger) {
  return `${trigger.alertId}:${trigger.actionId}`;
}

function versionLabel(version, isLatest) {
  const parts = [`v${version.version}`];
  if (isLatest) parts.push('(latest)');
  else if (version.active) parts.push('(active)');
  return parts.join(' ');
}
