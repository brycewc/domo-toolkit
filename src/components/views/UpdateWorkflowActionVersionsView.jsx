import {
  Button,
  Card,
  Chip,
  Disclosure,
  DisclosureGroup,
  Label,
  Link,
  ListBox,
  ScrollShadow,
  Select,
  Separator,
  Spinner,
  Switch,
  Tooltip
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DomoContext } from '@/models/DomoContext';
import { getCodeEnginePackageInfo } from '@/services/codeEngine';
import {
  ensureWorkflowVersionEditable,
  getVersionDefinition,
  getWorkflowModelInfo,
  getWorkflowModelName,
  updateVersionDefinition
} from '@/services/workflows';
import { classifyContractChanges, getFunctionContract, variableMatchesEntry } from '@/utils/ceContractDiff';
import { buildRefreshAction, buildReloadAction } from '@/utils/headerActions';
import { compareSemver } from '@/utils/semver';
import { getSidepanelData } from '@/utils/sidepanel';
import { getSubflowContract } from '@/utils/subflowContract';
import { waitForDefinition } from '@/utils/workflowHelpers';
import {
  getTileParams,
  getVariableConsumers,
  hasBinding,
  indexVariablesById,
  reconcileTileForVersionBump
} from '@/utils/workflowTileIO';
import IconArrowRight from '@icons/arrow-right.svg?react';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconPackage from '@icons/package.svg?react';
import IconWorkflow from '@icons/workflow.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { ViewHeader } from './ViewHeader';

export function UpdateWorkflowActionVersionsView({
  instance = null,
  liveContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  useViewReady(!isLoading);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);
  const [packages, setPackages] = useState([]);
  const [definition, setDefinition] = useState(null);
  const [currentContext, setCurrentContext] = useState(null);
  const [contractDiffs, setContractDiffs] = useState({});
  const [reconciliations, setReconciliations] = useState({});
  const [workflowName, setWorkflowName] = useState(null);
  const mountedRef = useRef(true);
  const contractCacheRef = useRef(new Map());
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

      if (!data || data.type !== 'updateWorkflowActionVersions') {
        onBackToDefault?.();
        return;
      }

      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;

      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }

      setCurrentContext(context);

      const isCEVersion = context.domoObject?.typeId === 'CODEENGINE_PACKAGE_VERSION';
      const workflowModelId = isCEVersion
        ? context.domoObject.metadata?.context?.workflowModelId
        : context.domoObject.parentId;

      // Name the workflow in the header. A workflow version already carries its
      // parent workflow's name from detection; a code engine version only knows
      // the workflow's id, so look up the model to name it.
      let wfName = isCEVersion ? null : context.domoObject.metadata?.parent?.name || null;
      if (!wfName && workflowModelId) {
        wfName = await getWorkflowModelName(workflowModelId, context.tabId);
      }
      if (mountedRef.current) setWorkflowName(wfName);

      // A workflow version is locked while someone edits it. Before grabbing the
      // definition to change action versions, honor that lock: one held by the
      // current user or left over 24 hours ago is cleared automatically so
      // editing can resume; a fresh lock held by someone else blocks the edit.
      const workflowVersionNumber = isCEVersion
        ? context.domoObject.metadata?.context?.workflowVersionNumber
        : context.domoObject.id;
      if (workflowModelId && workflowVersionNumber) {
        const editable = await ensureWorkflowVersionEditable({
          modelId: workflowModelId,
          tabId: context.tabId,
          versionNumber: workflowVersionNumber
        });
        if (!editable) {
          onStatusUpdate?.(
            'Version Locked',
            'The current workflow version is locked and editing it is forbidden.',
            'danger'
          );
          onBackToDefault?.();
          return;
        }
      }

      // Get definition - either from stored data or fetch/wait for it
      let def = data.definition;
      if (!def) {
        if (isCEVersion) {
          const wfVersion = context.domoObject.metadata?.context?.workflowVersionNumber;
          if (!workflowModelId || !wfVersion) {
            onStatusUpdate?.('Error', 'Missing workflow context for code engine version', 'danger');
            onBackToDefault?.();
            return;
          }
          def = await getVersionDefinition(workflowModelId, wfVersion, context.tabId);
        } else {
          const waitResult = await waitForDefinition(context);
          if (!waitResult.success) {
            onStatusUpdate?.('Error', waitResult.error, 'danger');
            onBackToDefault?.();
            return;
          }
          def = waitResult.definition;
        }
      }

      // Parse Code Engine and subflow action tiles
      const groupMap = groupActionTiles(def.designElements || []);

      if (groupMap.size === 0) {
        onStatusUpdate?.(
          'No Actions to Update',
          'This workflow version has no Code Engine actions or subflows.',
          'warning',
          3000
        );
        onBackToDefault?.();
        return;
      }

      // Enrich each group with its referenced name + released versions. Code Engine
      // groups resolve the package; subflow groups resolve the referenced workflow.
      const tabId = context.tabId;
      const groupEntries = await Promise.all(
        Array.from(groupMap.entries()).map(([groupId, group]) =>
          group.kind === 'subflow'
            ? enrichSubflowGroup({ actions: group.actions, modelId: groupId, tabId, versions: group.versions })
            : enrichCodeEngineGroup({ actions: group.actions, packageId: groupId, tabId, versions: group.versions })
        )
      );

      if (!mountedRef.current) return;
      groupEntries.sort((a, b) => a.packageName.localeCompare(b.packageName));
      setDefinition(def);
      setPackages(groupEntries);
    } catch (error) {
      console.error('[UpdateWorkflowActionVersions] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load workflow actions', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadData();
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const computeChanges = () => {
    const changes = [];

    for (const pkg of packages) {
      for (const action of pkg.actions) {
        let effectiveVersion = null;

        // An action override of 'no-change' pins this action to its current
        // version, ignoring the package-level selection; 'inherit' defers to it.
        if (action.selectedVersion === 'no-change') {
          effectiveVersion = null;
        } else if (action.selectedVersion !== 'inherit') {
          effectiveVersion = action.selectedVersion;
        } else if (pkg.selectedVersion !== 'no-change') {
          effectiveVersion = pkg.selectedVersion;
        }

        if (effectiveVersion && effectiveVersion !== action.currentVersion) {
          changes.push({
            currentVersion: action.currentVersion,
            elementId: action.elementId,
            functionName: action.functionName,
            kind: pkg.kind,
            newVersion: effectiveVersion,
            packageId: pkg.packageId
          });
        }
      }
    }

    return changes;
  };

  const changes = computeChanges();
  const changeSignature = changes
    .map((c) => `${c.elementId}@${c.newVersion}`)
    .sort()
    .join('|');

  // When the set of version changes settles, diff each changed action's old vs
  // new function contract. Only changed actions are fetched (cached by
  // packageId@version), so the common "bump, no contract change" path stays
  // cheap and the panels below stay hidden.
  useEffect(() => {
    if (!definition || changeSignature === '') {
      setContractDiffs({});
      return;
    }
    let cancelled = false;
    const pending = computeChanges();
    const cache = contractCacheRef.current;
    const tabId = currentContext?.tabId;
    setIsDiffing(true);
    (async () => {
      const next = {};
      await Promise.all(
        pending.map(async (change) => {
          try {
            const [oldFn, newFn] =
              change.kind === 'subflow'
                ? await Promise.all([
                    getSubflowContract({ cache, modelId: change.packageId, tabId, version: change.currentVersion }),
                    getSubflowContract({ cache, modelId: change.packageId, tabId, version: change.newVersion })
                  ])
                : await Promise.all([
                    getFunctionContract({
                      cache,
                      functionName: change.functionName,
                      packageId: change.packageId,
                      tabId,
                      version: change.currentVersion
                    }),
                    getFunctionContract({
                      cache,
                      functionName: change.functionName,
                      packageId: change.packageId,
                      tabId,
                      version: change.newVersion
                    })
                  ]);
            next[change.elementId] = buildActionContractInfo({ change, definition, newFn, oldFn });
          } catch (error) {
            console.warn('[UpdateWorkflowActionVersions] Contract diff failed for', change.elementId, error);
          }
        })
      );
      if (cancelled || !mountedRef.current) return;
      const defaults = {};
      for (const [elementId, info] of Object.entries(next)) {
        const updateVariableSchemas = {};
        for (const impact of info.schemaChangeImpacts) {
          updateVariableSchemas[impact.variableId] = true;
        }
        const updateVariableTypes = {};
        for (const impact of info.typeChangeImpacts) {
          updateVariableTypes[impact.variableId] = true;
        }
        defaults[elementId] = {
          addOutputs: info.addedOutputs.slice(),
          inputRemap: {},
          updateVariableSchemas,
          updateVariableTypes
        };
      }
      setContractDiffs(next);
      setReconciliations(defaults);
      setIsDiffing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [changeSignature, definition, currentContext]);

  const handlePackageVersionChange = (packageId, version) => {
    setPackages((prev) => prev.map((pkg) => (pkg.packageId === packageId ? { ...pkg, selectedVersion: version } : pkg)));
  };

  const handleActionVersionChange = (packageId, elementId, version) => {
    setPackages((prev) =>
      prev.map((pkg) =>
        pkg.packageId === packageId
          ? {
              ...pkg,
              actions: pkg.actions.map((a) => (a.elementId === elementId ? { ...a, selectedVersion: version } : a))
            }
          : pkg
      )
    );
  };

  const handleRemapInput = (elementId, oldName, target) => {
    setReconciliations((prev) => {
      const current = prev[elementId] || {
        addOutputs: [],
        inputRemap: {},
        updateVariableSchemas: {},
        updateVariableTypes: {}
      };
      return {
        ...prev,
        [elementId]: { ...current, inputRemap: { ...current.inputRemap, [oldName]: target } }
      };
    });
  };

  const handleToggleOutput = (elementId, outputName, selected) => {
    setReconciliations((prev) => {
      const current = prev[elementId] || {
        addOutputs: [],
        inputRemap: {},
        updateVariableSchemas: {},
        updateVariableTypes: {}
      };
      const set = new Set(current.addOutputs);
      if (selected) set.add(outputName);
      else set.delete(outputName);
      return { ...prev, [elementId]: { ...current, addOutputs: Array.from(set) } };
    });
  };

  const handleToggleVariableSchema = (elementId, variableId, selected) => {
    setReconciliations((prev) => {
      const current = prev[elementId] || {
        addOutputs: [],
        inputRemap: {},
        updateVariableSchemas: {},
        updateVariableTypes: {}
      };
      return {
        ...prev,
        [elementId]: {
          ...current,
          updateVariableSchemas: { ...current.updateVariableSchemas, [variableId]: selected }
        }
      };
    });
  };

  const handleToggleVariableType = (elementId, variableId, selected) => {
    setReconciliations((prev) => {
      const current = prev[elementId] || {
        addOutputs: [],
        inputRemap: {},
        updateVariableSchemas: {},
        updateVariableTypes: {}
      };
      return {
        ...prev,
        [elementId]: {
          ...current,
          updateVariableTypes: { ...current.updateVariableTypes, [variableId]: selected }
        }
      };
    });
  };

  const blockedElementIds = new Set(
    changes.filter((c) => contractDiffs[c.elementId]?.functionDeleted).map((c) => c.elementId)
  );
  const applicableChanges = changes.filter((c) => !blockedElementIds.has(c.elementId));
  const hasChanges = applicableChanges.length > 0;
  const reviewCount = applicableChanges.filter((c) => actionNeedsReview(contractDiffs[c.elementId])).length;

  // Every action whose contract changed, kept in package order. Each package
  // renders its own reconciliation panels below its version selectors; this
  // flattened list is used only to pick the first review to auto-expand.
  const reconciliationEntries = packages.flatMap((pkg) =>
    pkg.actions
      .map((action) => ({ action, info: contractDiffs[action.elementId] }))
      .filter(({ info }) => info && (info.functionDeleted || info.classified?.hasChanges))
  );
  const reviewReconciliations = reconciliationEntries.filter(({ info }) => !info.functionDeleted);
  const firstReviewId = reviewReconciliations.find(({ info }) => actionNeedsReview(info))?.action.elementId;

  const handleSubmit = async () => {
    if (applicableChanges.length === 0) {
      onStatusUpdate?.('No Changes', 'No version changes to apply.', 'warning', 2000);
      return;
    }

    setIsSubmitting(true);

    const isCEVersion = currentContext.domoObject.typeId === 'CODEENGINE_PACKAGE_VERSION';
    const modelId = isCEVersion
      ? currentContext.domoObject.metadata?.context?.workflowModelId
      : currentContext.domoObject.parentId;
    const versionNumber = isCEVersion
      ? currentContext.domoObject.metadata?.context?.workflowVersionNumber
      : currentContext.domoObject.id;
    const tabId = currentContext.tabId;
    const count = applicableChanges.length;

    const promise = (async () => {
      // Honor the version's edit lock before touching its definition.
      const editable = await ensureWorkflowVersionEditable({ modelId, tabId, versionNumber });
      if (!editable) {
        throw new Error('The current workflow version is locked and editing it is forbidden.');
      }

      // Fetch the latest definition to avoid overwriting concurrent changes
      const latestDefinition = await getVersionDefinition(modelId, versionNumber, tabId);
      const modified = structuredClone(latestDefinition);

      for (const change of applicableChanges) {
        const element = modified.designElements.find((el) => el.id === change.elementId);
        if (!element?.data) continue;
        // A subflow tile carries its referenced version on `data.modelVersion`; a
        // Code Engine tile carries it on `data.metadata.version`. Its `modelId`,
        // `execution`, and `wait` are left untouched.
        if (change.kind === 'subflow') {
          element.data.modelVersion = change.newVersion;
        } else {
          if (!element.data.metadata) continue;
          element.data.metadata.version = change.newVersion;
        }

        const info = contractDiffs[change.elementId];
        if (info && info.classified?.hasChanges && !info.functionDeleted) {
          reconcileTileForVersionBump({
            choices: reconciliations[change.elementId] || {},
            classified: info.classified,
            definition: modified,
            element,
            newFn: info.newFn
          });
        }
      }

      await updateVersionDefinition(modelId, versionNumber, modified, tabId);

      // Reload the tab to reflect changes
      chrome.tabs.reload(tabId);

      return count;
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'Failed to update versions',
      loading: `Updating **${count}** action${count !== 1 ? 's' : ''}…`,
      success: (applied) => `Updated ${applied} action${applied !== 1 ? 's' : ''}`
    });

    promise
      .then(() => {
        onBackToDefault?.();
      })
      .finally(() => {
        if (mountedRef.current) setIsSubmitting(false);
      });
  };

  const renderVersionSelect = (
    packageId,
    availableVersions,
    latestVersion,
    selectedVersion,
    disabledVersion,
    onChange,
    elementId = null
  ) => {
    const isActionLevel = elementId !== null;
    const selectId = isActionLevel ? `action-${elementId}` : `pkg-${packageId}`;
    // A built-in package already on its latest version has nothing to switch to
    // (downgrades aren't allowed), leaving no versions to choose, so lock it.
    const isDisabled = availableVersions.length === 0;

    return (
      <Select
        className='w-40 flex-1'
        id={selectId}
        isDisabled={isDisabled}
        selectionMode='single'
        value={selectedVersion}
        variant={isActionLevel ? 'primary' : 'secondary'}
        onChange={(key) => {
          if (isActionLevel) {
            onChange(packageId, elementId, key);
          } else {
            onChange(packageId, key);
          }
        }}
      >
        <Select.Trigger className='items-center py-0'>
          <Select.Value />
          <Select.Indicator>
            <IconChevronDown />
          </Select.Indicator>
        </Select.Trigger>
        <Select.Popover className='max-h-60!'>
          <ListBox>
            {isActionLevel && (
              <ListBox.Item id='inherit' key='inherit' textValue='Inherit'>
                <Label>Inherit</Label>
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            )}
            <ListBox.Item id='no-change' key='no-change' textValue='No Change'>
              <Label>No Change</Label>
              <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
            </ListBox.Item>
            {availableVersions.map((v) => (
              <ListBox.Item
                id={v}
                isDisabled={v === disabledVersion}
                key={v}
                textValue={v === latestVersion ? `Latest - ${v}` : v}
              >
                <Label>{v === latestVersion ? `Latest - ${v}` : v}</Label>
                <ListBox.ItemIndicator>{({ isSelected }) => (isSelected ? <IconCheck /> : null)}</ListBox.ItemIndicator>
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
      </Select>
    );
  };

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading workflow actions...</p>
        </Card.Content>
      </Card>
    );
  }

  const totalActions = packages.reduce((sum, pkg) => sum + pkg.actions.length, 0);
  const ceCount = packages.filter((pkg) => pkg.kind === 'codeengine').length;
  const subflowCount = packages.filter((pkg) => pkg.kind === 'subflow').length;
  const groupParts = [];
  if (ceCount) groupParts.push(`${ceCount} package${ceCount === 1 ? '' : 's'}`);
  if (subflowCount) groupParts.push(`${subflowCount} subflow${subflowCount === 1 ? '' : 's'}`);
  const headerSubtext = `${totalActions} action${totalActions === 1 ? '' : 's'} | ${groupParts.join(' x ')}`;

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <ViewHeader
        beta
        feature={workflowName ? 'Update Action Versions for' : 'Update Action Versions'}
        featureIcon={<IconPackage />}
        subject={workflowName}
        subjectTypeId={workflowName ? 'WORKFLOW_MODEL' : null}
        subtext={headerSubtext}
        onClose={onBackToDefault}
        actions={[
          buildReloadAction({
            currentContext: liveContext,
            objectId: currentContext?.domoObject?.id,
            objectType: currentContext?.domoObject?.typeId,
            onStatusUpdate,
            viewType: 'updateWorkflowActionVersions'
          }),
          buildRefreshAction({ isRefreshing, onRefresh: handleRefresh })
        ]}
      />
      <Separator />
      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
        <Card.Content>
          {packages.map((pkg, index) => {
            const pkgReconciliations = pkg.actions
              .map((action) => ({ action, info: contractDiffs[action.elementId] }))
              .filter(({ info }) => info && (info.functionDeleted || info.classified?.hasChanges));
            const pkgDeleted = pkgReconciliations.filter(({ info }) => info.functionDeleted);
            const pkgReviews = pkgReconciliations.filter(({ info }) => !info.functionDeleted);
            const isSubflow = pkg.kind === 'subflow';
            const GroupIcon = isSubflow ? IconWorkflow : IconPackage;
            const groupHref = isSubflow
              ? `${currentContext?.origin}/workflows/models/${pkg.packageId}`
              : `${currentContext?.origin}/codeengine/${pkg.packageId}`;

            return (
              <div className={index > 0 ? 'w-full border-t border-border pt-2 pb-1' : 'pb-1'} key={pkg.packageId}>
                <div className='flex w-full flex-col gap-1'>
                  <div className='flex w-full items-center justify-between gap-2'>
                    <div className='flex min-w-0 items-center gap-1.5'>
                      <Tooltip delay={200}>
                        <Tooltip.Trigger className='shrink-0 cursor-help'>
                          <GroupIcon className='size-4' />
                        </Tooltip.Trigger>
                        <Tooltip.Content>{isSubflow ? 'Subflow' : 'Code Engine package'}</Tooltip.Content>
                      </Tooltip>
                      <Link
                        className='min-w-0 truncate decoration-accent underline-offset-2 hover:text-accent'
                        href={groupHref}
                        target='_blank'
                      >
                        {pkg.packageName}
                      </Link>
                    </div>
                    <div className='flex min-w-0 flex-1 items-center justify-end gap-2'>
                      {pkg.isDomoBuiltin && (
                        <Tooltip delay={200}>
                          <Tooltip.Trigger className='cursor-help'>
                            <Chip className='shrink-0 gap-1' color='accent' size='sm' variant='soft'>
                              Built-in
                              <IconInfoCircle className='size-3.5 p-0!' />
                            </Chip>
                          </Tooltip.Trigger>
                          <Tooltip.Content className='max-w-56'>
                            Built-in packages can only be upgraded to the latest version, not downgraded to an earlier one.
                          </Tooltip.Content>
                        </Tooltip>
                      )}
                      <span className='w-12 shrink-0 text-right text-xs text-muted'>
                        {pkg.actions.length} action
                        {pkg.actions.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <div className='flex w-full items-center justify-around gap-2'>
                    <Chip
                      className='h-9 w-35 rounded-3xl'
                      color={pkg.latestVersion === pkg.currentVersion ? 'success' : 'warning'}
                      size='lg'
                      variant='secondary'
                    >
                      {pkg.isSingleVersion ? pkg.currentVersion : 'Multiple Versions'}
                    </Chip>
                    <IconArrowRight className='shrink-0 text-muted' />
                    {renderVersionSelect(
                      pkg.packageId,
                      pkg.availableVersions,
                      pkg.latestVersion,
                      pkg.selectedVersion,
                      pkg.isSingleVersion ? pkg.currentVersion : null,
                      handlePackageVersionChange
                    )}
                  </div>

                  {pkgDeleted.map(({ action, info }) => (
                    <ActionReconciliation
                      action={action}
                      info={info}
                      key={`recon-${action.elementId}`}
                      reconciliation={reconciliations[action.elementId]}
                      onRemapInput={handleRemapInput}
                      onToggleOutput={handleToggleOutput}
                      onToggleVariableSchema={handleToggleVariableSchema}
                      onToggleVariableType={handleToggleVariableType}
                    />
                  ))}

                  {(!pkg.isSingleVersion || pkgReviews.length > 0) && (
                    <DisclosureGroup
                      className='flex flex-col gap-1'
                      defaultExpandedKeys={firstReviewId ? [firstReviewId] : []}
                    >
                      {!pkg.isSingleVersion && (
                        <Disclosure
                          className='w-full overflow-hidden rounded-3xl bg-surface-secondary'
                          id={`overrides-${pkg.packageId}`}
                        >
                          <Disclosure.Heading>
                            <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
                              <span className='truncate text-sm font-medium'>Per-action overrides</span>
                              <span className='flex shrink-0 items-center gap-2'>
                                <Chip color='accent' size='sm' variant='soft'>
                                  Optional
                                </Chip>
                                <Disclosure.Indicator>
                                  <IconChevronDown />
                                </Disclosure.Indicator>
                              </span>
                            </Disclosure.Trigger>
                          </Disclosure.Heading>
                          <Disclosure.Content>
                            <div className='px-4'>
                              <Separator variant='secondary' />
                            </div>
                            <div className='flex flex-col gap-1.5 p-2'>
                              {pkg.actions.map((action) => (
                                <div className='flex flex-col gap-0.5' key={action.elementId}>
                                  <span className='truncate text-xs' title={action.actionName}>
                                    {action.actionName}
                                  </span>
                                  <div className='flex items-center justify-between gap-2'>
                                    <Chip
                                      className='h-9 w-25 rounded-3xl bg-surface! shadow-sm'
                                      color={pkg.latestVersion === action.currentVersion ? 'success' : 'danger'}
                                      size='lg'
                                      variant='secondary'
                                    >
                                      {action.currentVersion}
                                    </Chip>
                                    <IconArrowRight className='shrink-0 text-muted' />
                                    {renderVersionSelect(
                                      pkg.packageId,
                                      pkg.availableVersions,
                                      pkg.latestVersion,
                                      action.selectedVersion,
                                      action.currentVersion,
                                      handleActionVersionChange,
                                      action.elementId
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </Disclosure.Content>
                        </Disclosure>
                      )}
                      {pkgReviews.map(({ action, info }) => (
                        <ActionReconciliation
                          action={action}
                          id={action.elementId}
                          info={info}
                          key={`recon-${action.elementId}`}
                          reconciliation={reconciliations[action.elementId]}
                          onRemapInput={handleRemapInput}
                          onToggleOutput={handleToggleOutput}
                          onToggleVariableSchema={handleToggleVariableSchema}
                          onToggleVariableType={handleToggleVariableType}
                        />
                      ))}
                    </DisclosureGroup>
                  )}
                </div>
              </div>
            );
          })}
        </Card.Content>
      </ScrollShadow>

      <div className='shrink-0 border-t border-border px-3 py-2'>
        {(reviewCount > 0 || blockedElementIds.size > 0 || isDiffing) && (
          <div className='flex flex-wrap items-center gap-1 pb-1 text-xs text-muted'>
            <span>
              {applicableChanges.length} action{applicableChanges.length === 1 ? '' : 's'}
            </span>
            {reviewCount > 0 && (
              <>
                <span>·</span>
                <span className='text-warning'>
                  {reviewCount} {reviewCount === 1 ? 'needs' : 'need'} review
                </span>
              </>
            )}
            {blockedElementIds.size > 0 && (
              <>
                <span>·</span>
                <span className='text-danger'>{blockedElementIds.size} blocked</span>
              </>
            )}
            {isDiffing && (
              <>
                <span>·</span>
                <span>Checking contract changes…</span>
              </>
            )}
          </div>
        )}
        <Button
          fullWidth
          isDisabled={!hasChanges || isSubmitting || isDiffing || isRefreshing}
          isPending={isSubmitting}
          size='sm'
          variant='primary'
          onPress={handleSubmit}
        >
          {isSubmitting ? <Spinner color='currentColor' size='sm' /> : 'Update Versions'}
        </Button>
      </div>
    </Card>
  );
}

/**
 * Whether an action's contract change needs human attention (vs. fully
 * auto-handled). Renamed params and added outputs are handled automatically;
 * removed bindings, new required inputs, and type/output breakages are not.
 */
function actionNeedsReview(info) {
  if (!info) return false;
  if (info.functionDeleted) return true;
  return (
    info.removedBoundInputs.length > 0 ||
    info.addedRequiredInputs.length > 0 ||
    info.newlyRequiredUnboundInputs.length > 0 ||
    info.typeChangeImpacts.length > 0 ||
    info.schemaChangeImpacts.length > 0 ||
    info.breakingRemovedOutputs.length > 0
  );
}

function ActionReconciliation({
  action,
  id = null,
  info,
  onRemapInput,
  onToggleOutput,
  onToggleVariableSchema,
  onToggleVariableType,
  reconciliation
}) {
  if (info.functionDeleted) {
    return (
      <Alert className='mt-1' status='danger' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            Function Removed
          </Alert.Title>
          <Alert.Description>
            <span className='font-mono font-bold'>{action.functionName ?? action.actionName}</span> no longer exists in the
            selected version. This action will be skipped so it does not break the workflow.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const choices = reconciliation || { addOutputs: [], inputRemap: {}, updateVariableSchemas: {}, updateVariableTypes: {} };
  const needsReview = actionNeedsReview(info);

  return (
    <Disclosure className='w-full overflow-hidden rounded-3xl bg-surface-secondary' id={id}>
      <Disclosure.Heading>
        <Disclosure.Trigger className='flex w-full items-center justify-between gap-2 p-2'>
          <span className='flex min-w-0 flex-1 items-center gap-2' title={action.actionName}>
            <span className='truncate text-sm font-medium'>{action.actionName}</span>
          </span>
          <Chip color={needsReview ? 'warning' : 'accent'} size='sm' variant='soft'>
            {needsReview ? 'Review' : 'Auto'}
          </Chip>
          <Disclosure.Indicator>
            <IconChevronDown />
          </Disclosure.Indicator>
        </Disclosure.Trigger>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='px-4'>
          <Separator variant='secondary' />
        </div>
        <div className='flex flex-col gap-2 p-2 text-xs'>
          {info.autoNotes.length > 0 && (
            <ul className='flex flex-col gap-1'>
              {info.autoNotes.map((note, i) => (
                <li
                  className='flex items-start gap-1 rounded-field border border-field bg-field px-3 py-2 text-field-foreground shadow-field'
                  key={i}
                >
                  <IconCheck className='mt-0.5 shrink-0 text-success' size={12} />
                  <span>
                    {note.map((seg, j) =>
                      typeof seg === 'string' ? (
                        seg
                      ) : (
                        <span className='font-mono font-bold' key={j}>
                          {seg.code}
                        </span>
                      )
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {info.removedBoundInputs.map((ri) => (
            <div className='flex flex-col gap-0.5' key={`rm-${ri.paramName}`}>
              <span>
                Input <span className='font-mono'>{ri.paramName}</span> was removed (was {ri.binding}
                ). Map its binding to:
              </span>
              <Select
                className='w-48'
                selectionMode='single'
                value={choices.inputRemap?.[ri.paramName] ?? 'drop'}
                variant='primary'
                onChange={(key) => onRemapInput(action.elementId, ri.paramName, key)}
              >
                <Select.Trigger className='items-center py-0'>
                  <Select.Value />
                  <Select.Indicator>
                    <IconChevronDown />
                  </Select.Indicator>
                </Select.Trigger>
                <Select.Popover className='max-h-60!'>
                  <ListBox>
                    {info.addedInputNames.map((n) => (
                      <ListBox.Item id={n} key={n} textValue={`Map to ${n}`}>
                        <Label>Map to {n}</Label>
                        <ListBox.ItemIndicator>
                          {({ isSelected }) => (isSelected ? <IconCheck /> : null)}
                        </ListBox.ItemIndicator>
                      </ListBox.Item>
                    ))}
                    <ListBox.Item id='drop' key='drop' textValue='Drop binding'>
                      <Label>Drop binding</Label>
                      <ListBox.ItemIndicator>
                        {({ isSelected }) => (isSelected ? <IconCheck /> : null)}
                      </ListBox.ItemIndicator>
                    </ListBox.Item>
                  </ListBox>
                </Select.Popover>
              </Select>
            </div>
          ))}

          {info.addedRequiredInputs.length > 0 && (
            <Alert className='w-full' status='warning'>
              <Alert.Content>
                <Alert.Title className='flex items-center gap-1'>
                  <AlertStatusIcon />
                  New Required Input{info.addedRequiredInputs.length === 1 ? '' : 's'}
                </Alert.Title>
                <Alert.Description>
                  New required input{info.addedRequiredInputs.length === 1 ? '' : 's'}{' '}
                  <span className='font-mono font-bold'>{info.addedRequiredInputs.join(', ')}</span> will be unset. Set{' '}
                  {info.addedRequiredInputs.length === 1 ? 'it' : 'them'} in Domo after updating.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {info.newlyRequiredUnboundInputs.length > 0 && (
            <Alert className='w-full' status='warning'>
              <Alert.Content>
                <Alert.Title className='flex items-center gap-1'>
                  <AlertStatusIcon />
                  Input{info.newlyRequiredUnboundInputs.length === 1 ? '' : 's'} Now Required
                </Alert.Title>
                <Alert.Description>
                  <span className='font-mono font-bold'>{info.newlyRequiredUnboundInputs.join(', ')}</span> changed from
                  optional to required but {info.newlyRequiredUnboundInputs.length === 1 ? 'has' : 'have'} no value set. Set{' '}
                  {info.newlyRequiredUnboundInputs.length === 1 ? 'it' : 'them'} in Domo after updating.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {info.addedOutputs.map((name) => (
            <Switch
              isSelected={choices.addOutputs?.includes(name) ?? false}
              key={`out-${name}`}
              size='sm'
              onChange={(selected) => onToggleOutput(action.elementId, name, selected)}
            >
              <Switch.Content>
                <Switch.Control>
                  <Switch.Thumb />
                </Switch.Control>
                <span className='text-xs'>
                  Add output <span className='font-mono'>{name}</span> and map a new variable
                </span>
              </Switch.Content>
            </Switch>
          ))}

          {info.typeChangeImpacts.map((impact) => (
            <Alert key={`tc-${impact.flag}-${impact.paramName}`} status='warning'>
              <Alert.Content>
                <Alert.Title className='flex items-center gap-1'>
                  <AlertStatusIcon />
                  Type Change
                </Alert.Title>
                <Alert.Description>
                  Type of <span className='font-mono font-bold'>{impact.paramName}</span> changed to{' '}
                  <span className='font-mono font-bold'>{impact.newType}</span>, so variable{' '}
                  <span className='font-mono font-bold'>{impact.variableName}</span>
                  {(impact.currentType || impact.consumers.length > 0) && (
                    <>
                      {' '}
                      (
                      {impact.currentType && (
                        <>
                          currently <span className='font-mono font-bold'>{impact.currentType}</span>
                        </>
                      )}
                      {impact.currentType && impact.consumers.length > 0 && ', '}
                      {impact.consumers.length > 0 && (
                        <>
                          also used by{' '}
                          <span className='font-semibold'>
                            {impact.consumers.map((c) => c.title || c.paramName).join(', ')}
                          </span>
                        </>
                      )}
                      )
                    </>
                  )}{' '}
                  no longer matches. Keep this on to update it.
                </Alert.Description>
                <Switch
                  isSelected={!!choices.updateVariableTypes?.[impact.variableId]}
                  size='sm'
                  onChange={(selected) => onToggleVariableType(action.elementId, impact.variableId, selected)}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <span className='text-xs'>
                      Update {impact.currentType} variable{' '}
                      <span className='font-mono text-accent'>{impact.variableName}</span> to {impact.newType}
                    </span>
                  </Switch.Content>
                </Switch>
              </Alert.Content>
            </Alert>
          ))}

          {info.schemaChangeImpacts.map((impact) => (
            <Alert key={`sc-${impact.flag}-${impact.paramName}`} status='warning'>
              <Alert.Content>
                <Alert.Title className='flex items-center gap-1'>
                  <AlertStatusIcon />
                  Properties Change
                </Alert.Title>
                <Alert.Description>
                  The properties of {impact.isList ? 'the objects in ' : ''}
                  <span className='font-mono font-bold'>{impact.paramName}</span> changed, so variable{' '}
                  <span className='font-mono font-bold'>{impact.variableName}</span>
                  {impact.consumers.length > 0 ? (
                    <>
                      {' '}
                      (also used by{' '}
                      <span className='font-semibold'>{impact.consumers.map((c) => c.title || c.paramName).join(', ')}</span>
                      )
                    </>
                  ) : null}{' '}
                  no longer matches. Keep this on to update it.
                </Alert.Description>
                <Switch
                  isSelected={!!choices.updateVariableSchemas?.[impact.variableId]}
                  size='sm'
                  onChange={(selected) => onToggleVariableSchema(action.elementId, impact.variableId, selected)}
                >
                  <Switch.Content>
                    <Switch.Control>
                      <Switch.Thumb />
                    </Switch.Control>
                    <span className='text-xs'>
                      Update <span className='font-mono text-accent'>{impact.variableName}</span> variable properties
                    </span>
                  </Switch.Content>
                </Switch>
              </Alert.Content>
            </Alert>
          ))}

          {info.breakingRemovedOutputs.map((impact) => (
            <Alert key={`ro-${impact.paramName}`} status='warning'>
              <Alert.Content>
                <Alert.Title className='flex items-center gap-1'>
                  <AlertStatusIcon />
                  Output Removed
                </Alert.Title>
                <Alert.Description>
                  Output <span className='font-mono font-bold'>{impact.paramName}</span> was removed. Variable{' '}
                  <span className='font-mono font-bold'>{impact.variableName}</span> loses its writer and will break{' '}
                  <span className='font-semibold'>{impact.consumers.map((c) => c.title || c.paramName).join(', ')}</span>.
                </Alert.Description>
              </Alert.Content>
            </Alert>
          ))}
        </div>
      </Disclosure.Content>
    </Disclosure>
  );
}

/**
 * Pre-compute everything the reconciliation UI needs for one changed action,
 * using the loaded definition to resolve current bindings, variable names, and
 * downstream consumers so the render stays declarative.
 */
function buildActionContractInfo({ change, definition, newFn, oldFn }) {
  const classified = classifyContractChanges(oldFn, newFn);
  const element = (definition?.designElements || []).find((e) => e.id === change.elementId);
  // A param can bind to a nested field of an object variable (id `varId.childId`),
  // which isn't in the flat dataList. Index the whole tree so both the name shown
  // and the "already matches?" check resolve that child instead of the raw id.
  const varIndex = indexVariablesById(definition);
  const variableNode = (variableId) => varIndex.get(variableId)?.node ?? null;
  const inputParams = new Map(getTileParams(element, 'input').map((p) => [p.paramName, p]));
  const outputParams = new Map(getTileParams(element, 'output').map((p) => [p.paramName, p]));
  const consumersOf = (variableId) =>
    getVariableConsumers(definition, variableId).filter((c) => c.elementId !== change.elementId);
  const variableName = (variableId) => varIndex.get(variableId)?.path || variableId;

  const addedInputNames = classified.inputs.added.map((e) => e.name);
  const addedOutputs = classified.outputs.added.map((e) => e.name);
  const addedRequiredInputs = classified.inputs.added.filter((e) => e.nullable === false).map((e) => e.name);

  // Existing inputs that flipped optional -> required. Only those with no binding
  // will break the action (a required input left unset), so those need review; one
  // that already carries a binding is fine and surfaces as an auto note below.
  const newlyRequiredUnboundInputs = classified.inputs.becameRequired
    .filter((e) => !hasBinding(inputParams.get(e.name)))
    .map((e) => e.name);

  const removedBoundInputs = classified.inputs.removed
    .filter((e) => hasBinding(inputParams.get(e.name)))
    .map((e) => ({
      binding: describeBinding(inputParams.get(e.name), varIndex),
      paramName: e.name
    }));

  // Describe a type the way a user reads it, keeping the list-ness visible so an
  // array of objects never collapses to a bare "object" in the warning.
  const describeType = (entry) => {
    const type = entry?.type ?? null;
    if (!type) return type;
    return entry?.isList ? `list of ${type}` : type;
  };
  // Same, but read from a bound variable's node (variables carry the type on
  // `dataType`), so the warning can state the variable's current type.
  const describeVariableType = (node) => {
    const type = node?.dataType ?? null;
    if (!type) return type;
    return node?.isList ? `list of ${type}` : type;
  };

  // Every type change, paired with the tile param that carries the binding and
  // the new manifest entry (so we can check whether the bound variable already
  // matches the target version).
  const typeChanged = [
    ...classified.inputs.typeChanged.map((t) => ({
      flag: 'input',
      name: t.name,
      newEntry: t.new,
      newType: describeType(t.new),
      param: inputParams.get(t.name)
    })),
    ...classified.outputs.typeChanged.map((t) => ({
      flag: 'output',
      name: t.name,
      newEntry: t.new,
      newType: describeType(t.new),
      param: outputParams.get(t.name)
    }))
  ];
  // Only prompt when the bound variable is actually out of sync with the new
  // version. A variable already matching the target (e.g. from a prior update)
  // needs nothing, so the version diff alone must not keep flagging it.
  const typeChangeImpacts = typeChanged
    .filter((t) => t.param?.mappedTo && !variableMatchesEntry(variableNode(t.param.mappedTo), t.newEntry))
    .map((t) => ({
      consumers: consumersOf(t.param.mappedTo),
      currentType: describeVariableType(variableNode(t.param.mappedTo)),
      flag: t.flag,
      newType: t.newType,
      paramName: t.name,
      variableId: t.param.mappedTo,
      variableName: variableName(t.param.mappedTo)
    }));

  // Changes confined to an object's nested property schema (the data type is
  // unchanged). Paired with the binding so the user can sync the variable's
  // properties; `isList` tunes the wording (objects in an array vs. one object).
  const schemaChanged = [
    ...classified.inputs.schemaChanged.map((t) => ({
      flag: 'input',
      isList: t.new?.isList ?? false,
      name: t.name,
      newEntry: t.new,
      param: inputParams.get(t.name)
    })),
    ...classified.outputs.schemaChanged.map((t) => ({
      flag: 'output',
      isList: t.new?.isList ?? false,
      name: t.name,
      newEntry: t.new,
      param: outputParams.get(t.name)
    }))
  ];
  // Same guard as type changes: skip a variable that already carries the new
  // property schema so a re-run of the same bump stops asking to update it.
  const schemaChangeImpacts = schemaChanged
    .filter((t) => t.param?.mappedTo && !variableMatchesEntry(variableNode(t.param.mappedTo), t.newEntry))
    .map((t) => ({
      consumers: consumersOf(t.param.mappedTo),
      flag: t.flag,
      isList: t.isList,
      paramName: t.name,
      variableId: t.param.mappedTo,
      variableName: variableName(t.param.mappedTo)
    }));

  // All removed outputs; split into breaking (variable still feeds downstream
  // tiles) vs. harmless (surfaced as an auto note below).
  const removedOutputs = classified.outputs.removed.map((e) => {
    const variableId = outputParams.get(e.name)?.mappedTo || null;
    return {
      consumers: variableId ? consumersOf(variableId) : [],
      paramName: e.name,
      variableName: variableId ? variableName(variableId) : null
    };
  });
  const breakingRemovedOutputs = removedOutputs.filter((o) => o.consumers.length > 0);

  // Auto-handled changes worth surfacing so the panel is never empty and the
  // user understands the version's effect even when nothing needs a decision.
  // Each note is an array of segments: plain strings render as-is, `{ code }`
  // segments render as the popped-out identifier (font-mono font-bold), matching
  // how param and variable names are styled in the review panels above.
  const autoNotes = [];
  for (const r of classified.inputs.renamed) {
    autoNotes.push(['Input renamed ', { code: r.from }, ' to ', { code: r.to }, ', binding kept']);
  }
  for (const r of classified.outputs.renamed) {
    autoNotes.push(['Output renamed ', { code: r.from }, ' to ', { code: r.to }, ', binding kept']);
  }
  for (const e of classified.inputs.added) {
    if (e.nullable !== false) autoNotes.push(['New optional input ', { code: e.name }, ' added']);
  }
  for (const e of classified.inputs.removed) {
    if (!hasBinding(inputParams.get(e.name))) autoNotes.push(['Unused input ', { code: e.name }, ' removed']);
  }
  for (const e of classified.inputs.becameRequired) {
    if (hasBinding(inputParams.get(e.name))) {
      autoNotes.push(['Input ', { code: e.name }, ' is now required and already set']);
    }
  }
  for (const t of typeChanged) {
    if (!t.param?.mappedTo) {
      autoNotes.push(['Type of ', { code: t.name }, ' changed to ', { code: t.newType }, ', no variable bound']);
    } else if (variableMatchesEntry(variableNode(t.param.mappedTo), t.newEntry)) {
      autoNotes.push([
        'Type of ',
        { code: t.name },
        ' changed, ',
        { code: variableName(t.param.mappedTo) },
        ' already matches'
      ]);
    }
  }
  for (const t of schemaChanged) {
    if (!t.param?.mappedTo) {
      autoNotes.push(['Properties of ', { code: t.name }, ' changed, no variable bound']);
    } else if (variableMatchesEntry(variableNode(t.param.mappedTo), t.newEntry)) {
      autoNotes.push([
        'Properties of ',
        { code: t.name },
        ' changed, ',
        { code: variableName(t.param.mappedTo) },
        ' already matches'
      ]);
    }
  }
  for (const o of removedOutputs) {
    if (o.consumers.length === 0) {
      autoNotes.push(
        o.variableName
          ? ['Output ', { code: o.paramName }, ' removed, variable ', { code: o.variableName }, ' is no longer written']
          : ['Output ', { code: o.paramName }, ' removed']
      );
    }
  }

  return {
    addedInputNames,
    addedOutputs,
    addedRequiredInputs,
    autoNotes,
    breakingRemovedOutputs,
    classified,
    functionDeleted: classified.functionDeleted,
    newFn,
    newlyRequiredUnboundInputs,
    removedBoundInputs,
    schemaChangeImpacts,
    typeChangeImpacts
  };
}

function describeBinding(param, varIndex) {
  if (!param) return 'unmapped';
  if (param.mappedTo) return `variable ${varIndex.get(param.mappedTo)?.path || param.mappedTo}`;
  if (param.value !== null && param.value !== undefined) return 'a fixed value';
  return 'unmapped';
}

/**
 * Enrich a Code Engine group with its package name, released versions, built-in
 * status, and default selection. Built-in Domo packages can only be upgraded to
 * the latest version, so their choices collapse to that single option.
 */
async function enrichCodeEngineGroup({ actions, packageId, tabId, versions }) {
  let packageName = packageId;
  let availableVersions = [];
  let isDomoBuiltin = false;

  try {
    const info = await getCodeEnginePackageInfo(packageId, tabId);
    packageName = info.name || packageId;
    isDomoBuiltin = info.availability === 'GLOBAL' && info.packageSource === 'DOMO';
    availableVersions = (info.versions || [])
      .filter((v) => v.released != null)
      .map((v) => v.version)
      .sort((a, b) => compareSemver(b, a));
  } catch (error) {
    console.warn(`[UpdateWorkflowActionVersions] Failed to fetch package info for ${packageId}:`, error);
  }

  const uniqueVersions = Array.from(versions);
  const isSingleVersion = uniqueVersions.length === 1;
  const currentVersion = isSingleVersion ? uniqueVersions[0] : null;
  const latestVersion = availableVersions.length > 0 ? availableVersions[0] : null;

  // Built-in Domo packages can only be upgraded to latest, no downgrades or
  // intermediate versions.
  if (isDomoBuiltin) {
    availableVersions = latestVersion && (!isSingleVersion || currentVersion !== latestVersion) ? [latestVersion] : [];
  }

  // Default: latest if single version and not already on latest, otherwise no-change
  let defaultSelected = 'no-change';
  if (!isSingleVersion || (latestVersion && currentVersion !== latestVersion)) {
    defaultSelected = latestVersion;
  }

  return {
    actions: actions.map((a) => ({ ...a, selectedVersion: 'inherit' })),
    availableVersions,
    currentVersion,
    isDomoBuiltin,
    isSingleVersion,
    kind: 'codeengine',
    latestVersion,
    packageId,
    packageName,
    selectedVersion: defaultSelected
  };
}

/**
 * Enrich a subflow group with the referenced workflow's name, released versions
 * (those with a deployment date), and default selection. Subflows have no
 * built-in concept, so every released version is an eligible target.
 */
async function enrichSubflowGroup({ actions, modelId, tabId, versions }) {
  let packageName = modelId;
  let availableVersions = [];

  try {
    const info = await getWorkflowModelInfo(modelId, tabId);
    packageName = info.name || modelId;
    availableVersions = (info.versions || [])
      .filter((v) => v.deployedOn != null)
      .map((v) => v.version)
      .sort((a, b) => compareSemver(b, a));
  } catch (error) {
    console.warn(`[UpdateWorkflowActionVersions] Failed to fetch workflow info for ${modelId}:`, error);
  }

  const uniqueVersions = Array.from(versions);
  const isSingleVersion = uniqueVersions.length === 1;
  const currentVersion = isSingleVersion ? uniqueVersions[0] : null;
  const latestVersion = availableVersions.length > 0 ? availableVersions[0] : null;

  let defaultSelected = 'no-change';
  if (!isSingleVersion || (latestVersion && currentVersion !== latestVersion)) {
    defaultSelected = latestVersion;
  }

  return {
    actions: actions.map((a) => ({ ...a, selectedVersion: 'inherit' })),
    availableVersions,
    currentVersion,
    isDomoBuiltin: false,
    isSingleVersion,
    kind: 'subflow',
    latestVersion,
    packageId: modelId,
    packageName,
    selectedVersion: defaultSelected
  };
}

/**
 * Parse a workflow definition's action tiles and group them by the thing a version
 * bump targets: Code Engine tiles (`nebulaFunction`, keyed by package id) and
 * subflow tiles (`_designNode === 'SUB_FLOW'`, keyed by referenced model id). Each
 * group is tagged with its `kind` so the load/diff/submit paths can branch on it.
 */
function groupActionTiles(designElements) {
  const groups = new Map();

  for (const el of designElements) {
    const data = el.data;
    if (data?.taskType === 'nebulaFunction' && data?.metadata?.packageId) {
      const { functionName, packageId, version } = data.metadata;
      if (!groups.has(packageId)) groups.set(packageId, { actions: [], kind: 'codeengine', versions: new Set() });
      const group = groups.get(packageId);
      group.actions.push({
        actionName: data.title || functionName || el.id,
        currentVersion: version,
        elementId: el.id,
        functionName
      });
      group.versions.add(version);
    } else if (data?._designNode === 'SUB_FLOW' && data?.modelId) {
      const modelId = data.modelId;
      const version = data.modelVersion;
      if (!groups.has(modelId)) groups.set(modelId, { actions: [], kind: 'subflow', versions: new Set() });
      const group = groups.get(modelId);
      group.actions.push({
        actionName: data.title || el.id,
        currentVersion: version,
        elementId: el.id
      });
      group.versions.add(version);
    }
  }

  return groups;
}
