import {
  Button,
  Card,
  Checkbox,
  Chip,
  Disclosure,
  Label,
  Link,
  ListBox,
  ScrollShadow,
  Select,
  Separator,
  Spinner,
  Tooltip
} from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DomoContext } from '@/models/DomoContext';
import { getCodeEnginePackageInfo } from '@/services/codeEngine';
import { getVersionDefinition, updateVersionDefinition } from '@/services/workflows';
import { classifyContractChanges, getFunctionContract } from '@/utils/ceContractDiff';
import { getSidepanelData } from '@/utils/sidepanel';
import { waitForDefinition } from '@/utils/workflowHelpers';
import {
  getTileParams,
  getVariableConsumers,
  getWorkflowVariables,
  hasBinding,
  reconcileTileForVersionBump
} from '@/utils/workflowTileIO';
import IconArrowRight from '@icons/arrow-right.svg?react';
import IconCheck from '@icons/check.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
import IconExclamationTriangle from '@icons/exclamation-triangle.svg?react';
import IconX from '@icons/x.svg?react';

export function UpdateCodeEngineVersionsView({ onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDiffing, setIsDiffing] = useState(false);
  const [packages, setPackages] = useState([]);
  const [definition, setDefinition] = useState(null);
  const [currentContext, setCurrentContext] = useState(null);
  const [contractDiffs, setContractDiffs] = useState({});
  const [reconciliations, setReconciliations] = useState({});
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
      const data = await getSidepanelData();

      if (!data || data.type !== 'updateCodeEngineVersions') {
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

      // Get definition - either from stored data or fetch/wait for it
      let def = data.definition;
      if (!def) {
        const isCEVersion = context.domoObject?.typeId === 'CODEENGINE_PACKAGE_VERSION';
        if (isCEVersion) {
          const wfModelId = context.domoObject.metadata?.context?.workflowModelId;
          const wfVersion = context.domoObject.metadata?.context?.workflowVersionNumber;
          if (!wfModelId || !wfVersion) {
            onStatusUpdate?.('Error', 'Missing workflow context for code engine version', 'danger');
            onBackToDefault?.();
            return;
          }
          def = await getVersionDefinition(wfModelId, wfVersion, context.tabId);
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

      // Parse code engine tiles
      const packageMap = groupTilesByPackage(def.designElements || []);

      if (packageMap.size === 0) {
        onStatusUpdate?.(
          'No Code Engine Packages',
          'This workflow version does not use any code engine functions.',
          'warning',
          3000
        );
        onBackToDefault?.();
        return;
      }

      // Fetch package info (name + versions) for each package
      const tabId = context.tabId;
      const packageEntries = await Promise.all(
        Array.from(packageMap.entries()).map(async ([packageId, { actions, versions }]) => {
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
            console.warn(`[UpdateCEVersions] Failed to fetch package info for ${packageId}:`, error);
          }

          const uniqueVersions = Array.from(versions);
          const isSingleVersion = uniqueVersions.length === 1;
          const currentVersion = isSingleVersion ? uniqueVersions[0] : null;
          const latestVersion = availableVersions.length > 0 ? availableVersions[0] : null;

          // Built-in Domo packages can only be upgraded to latest — no
          // downgrades or intermediate versions.
          if (isDomoBuiltin) {
            availableVersions =
              latestVersion && (!isSingleVersion || currentVersion !== latestVersion) ? [latestVersion] : [];
          }

          // Default: latest if single version and not already on latest, otherwise no-change
          let defaultSelected = 'no-change';
          if (!isSingleVersion || (latestVersion && currentVersion !== latestVersion)) {
            defaultSelected = latestVersion;
          }

          return {
            actions: actions.map((a) => ({
              ...a,
              selectedVersion: 'inherit'
            })),
            availableVersions,
            currentVersion,
            isDomoBuiltin,
            isSingleVersion,
            latestVersion,
            packageId,
            packageName,
            selectedVersion: defaultSelected
          };
        })
      );

      if (!mountedRef.current) return;
      packageEntries.sort((a, b) => a.packageName.localeCompare(b.packageName));
      setDefinition(def);
      setPackages(packageEntries);
    } catch (error) {
      console.error('[UpdateCEVersionsView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load code engine packages', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const computeChanges = () => {
    const changes = [];

    for (const pkg of packages) {
      for (const action of pkg.actions) {
        let effectiveVersion = null;

        if (action.selectedVersion !== 'inherit') {
          effectiveVersion = action.selectedVersion;
        } else if (pkg.selectedVersion !== 'no-change') {
          effectiveVersion = pkg.selectedVersion;
        }

        if (effectiveVersion && effectiveVersion !== action.currentVersion) {
          changes.push({
            currentVersion: action.currentVersion,
            elementId: action.elementId,
            functionName: action.functionName,
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
            const [oldFn, newFn] = await Promise.all([
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
            console.warn('[UpdateCEVersions] Contract diff failed for', change.elementId, error);
          }
        })
      );
      if (cancelled || !mountedRef.current) return;
      const defaults = {};
      for (const [elementId, info] of Object.entries(next)) {
        defaults[elementId] = {
          addOutputs: info.addedOutputs.slice(),
          inputRemap: {},
          updateVariableTypes: {}
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
        updateVariableTypes: {}
      };
      const set = new Set(current.addOutputs);
      if (selected) set.add(outputName);
      else set.delete(outputName);
      return { ...prev, [elementId]: { ...current, addOutputs: Array.from(set) } };
    });
  };

  const handleToggleVariableType = (elementId, variableId, selected) => {
    setReconciliations((prev) => {
      const current = prev[elementId] || {
        addOutputs: [],
        inputRemap: {},
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
      // Fetch the latest definition to avoid overwriting concurrent changes
      const latestDefinition = await getVersionDefinition(modelId, versionNumber, tabId);
      const modified = structuredClone(latestDefinition);

      for (const change of applicableChanges) {
        const element = modified.designElements.find((el) => el.id === change.elementId);
        if (!element?.data?.metadata) continue;
        element.data.metadata.version = change.newVersion;

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

    return (
      <Select
        className='w-40 flex-1'
        id={selectId}
        selectionMode='single'
        value={selectedVersion}
        variant='secondary'
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
            <ListBox.Item
              id={isActionLevel ? 'inherit' : 'no-change'}
              key={isActionLevel ? 'inherit' : 'no-change'}
              textValue={isActionLevel ? 'Inherit' : 'No Change'}
            >
              <Label>{isActionLevel ? 'Inherit' : 'No Change'}</Label>
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
          <p className='text-sm text-muted'>Loading code engine packages...</p>
        </Card.Content>
      </Card>
    );
  }

  return (
    <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
      <Card.Header>
        <Card.Title className='flex items-start justify-between'>
          <div className='flex flex-col gap-1'>
            <div className='line-clamp-2 min-w-0'>Update Code Engine Versions</div>

            <div className='flex flex-row items-center gap-1'>
              <span className='text-sm text-muted'>
                {`${packages.length} package${packages.length === 1 ? '' : 's'} | ${packages.reduce((sum, pkg) => sum + pkg.actions.length, 0)} action${packages.reduce((sum, pkg) => sum + pkg.actions.length, 0) === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
          {onBackToDefault && (
            <Tooltip closeDelay={50} delay={800}>
              <Button isIconOnly size='sm' variant='ghost' onPress={onBackToDefault}>
                <IconX />
              </Button>
              <Tooltip.Content className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-balance break-normal'>
                Close
              </Tooltip.Content>
            </Tooltip>
          )}
        </Card.Title>
      </Card.Header>
      <Separator />
      <ScrollShadow hideScrollBar className='min-h-0 flex-1 overflow-y-auto' offset={5} orientation='vertical'>
        <Card.Content>
          {packages.map((pkg, index) => (
            <div className={index > 0 ? 'w-full border-t border-border pt-2 pb-1' : 'pb-1'} key={pkg.packageId}>
              <div className='flex w-full flex-col gap-1'>
                <div className='flex w-full items-center justify-between gap-2'>
                  <div className='flex min-w-0 flex-1 items-center gap-1.5'>
                    <Link
                      className='min-w-0 truncate no-underline decoration-accent hover:text-accent hover:underline'
                      href={`https://${currentContext?.instance}.domo.com/codeengine/${pkg.packageId}`}
                      target='_blank'
                    >
                      {pkg.packageName}
                    </Link>
                    {pkg.isDomoBuiltin && (
                      <Chip className='shrink-0' color='accent' size='sm' variant='soft'>
                        Built-in
                      </Chip>
                    )}
                  </div>
                  <span className='shrink-0 text-xs text-muted'>
                    {pkg.actions.length} action
                    {pkg.actions.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className='flex w-full items-center justify-between gap-2'>
                  <Chip
                    className='h-9'
                    color={pkg.latestVersion === pkg.currentVersion ? 'success' : pkg.isSingleVersion ? 'warning' : 'danger'}
                    size='lg'
                    variant='soft'
                  >
                    {pkg.isSingleVersion ? pkg.currentVersion : 'Multiple Versions'}
                  </Chip>
                  <div className='flex items-center justify-end gap-2'>
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
                </div>

                {!pkg.isSingleVersion && (
                  <Disclosure className='w-full'>
                    <Disclosure.Heading>
                      <Button fullWidth className='justify-between' size='sm' slot='trigger' variant='ghost'>
                        Per-action overrides
                        <Disclosure.Indicator>
                          <IconChevronDown />
                        </Disclosure.Indicator>
                      </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                      <div className='flex flex-col gap-1.5 pt-1 pl-1'>
                        {pkg.actions.map((action) => (
                          <div className='flex flex-col gap-0.5' key={action.elementId}>
                            <span className='truncate text-xs' title={action.actionName}>
                              {action.actionName}
                            </span>
                            <div className='flex items-center justify-between gap-2'>
                              <Chip
                                className='h-9'
                                size='sm'
                                variant='soft'
                                color={
                                  pkg.latestVersion === pkg.currentVersion
                                    ? 'success'
                                    : pkg.isSingleVersion
                                      ? 'warning'
                                      : 'danger'
                                }
                              >
                                {action.currentVersion}
                              </Chip>
                              <div className='flex items-center justify-end gap-2'>
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
                          </div>
                        ))}
                      </div>
                    </Disclosure.Content>
                  </Disclosure>
                )}

                {pkg.actions.map((action) => {
                  const info = contractDiffs[action.elementId];
                  if (!info || (!info.functionDeleted && !info.classified?.hasChanges)) return null;
                  return (
                    <ActionReconciliation
                      action={action}
                      info={info}
                      key={`recon-${action.elementId}`}
                      reconciliation={reconciliations[action.elementId]}
                      onRemapInput={handleRemapInput}
                      onToggleOutput={handleToggleOutput}
                      onToggleVariableType={handleToggleVariableType}
                    />
                  );
                })}
              </div>
            </div>
          ))}
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
                <span className='text-warning'>{reviewCount} need review</span>
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
          isDisabled={!hasChanges || isSubmitting || isDiffing}
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
    info.typeChangeImpacts.length > 0 ||
    info.breakingRemovedOutputs.length > 0
  );
}

function ActionReconciliation({ action, info, onRemapInput, onToggleOutput, onToggleVariableType, reconciliation }) {
  if (info.functionDeleted) {
    return (
      <div className='mt-1 flex items-start gap-2 rounded-md bg-danger-soft p-2 text-xs text-danger'>
        <IconExclamationTriangle className='mt-0.5 shrink-0' size={12} />
        <span>
          <span className='font-mono'>{action.functionName}</span> no longer exists in the selected version. This action will
          be skipped so it does not break the workflow.
        </span>
      </div>
    );
  }

  const choices = reconciliation || { addOutputs: [], inputRemap: {}, updateVariableTypes: {} };
  const needsReview = actionNeedsReview(info);

  return (
    <Disclosure className='mt-1 w-full rounded-md border border-border' defaultExpanded={needsReview}>
      <Disclosure.Heading>
        <Button fullWidth className='items-center justify-between gap-1 px-2 py-1 text-xs' slot='trigger' variant='ghost'>
          <span className='flex min-w-0 items-center gap-1'>
            <Disclosure.Indicator>
              <IconChevronDown size={12} />
            </Disclosure.Indicator>
            <span className='truncate'>{action.actionName}</span>
          </span>
          <Chip color={needsReview ? 'warning' : 'accent'} size='sm' variant='soft'>
            {needsReview ? 'Review' : 'Auto'}
          </Chip>
        </Button>
      </Disclosure.Heading>
      <Disclosure.Content>
        <div className='flex flex-col gap-2 px-2 pb-2 text-xs'>
          {info.autoNotes.length > 0 && (
            <ul className='flex flex-col gap-0.5 text-muted'>
              {info.autoNotes.map((note) => (
                <li className='flex items-start gap-1' key={note}>
                  <IconCheck className='mt-0.5 shrink-0' size={12} />
                  <span>{note}</span>
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
                variant='secondary'
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
            <div className='flex items-start gap-2 rounded-md bg-warning-soft p-2 text-warning'>
              <IconExclamationTriangle className='mt-0.5 shrink-0' size={12} />
              <span>
                New required input{info.addedRequiredInputs.length === 1 ? '' : 's'}{' '}
                <span className='font-mono'>{info.addedRequiredInputs.join(', ')}</span> will be unset. Set{' '}
                {info.addedRequiredInputs.length === 1 ? 'it' : 'them'} in Domo after updating.
              </span>
            </div>
          )}

          {info.addedOutputs.map((name) => (
            <Checkbox
              isSelected={choices.addOutputs?.includes(name) ?? false}
              key={`out-${name}`}
              onChange={(selected) => onToggleOutput(action.elementId, name, selected)}
            >
              <Checkbox.Control>
                <Checkbox.Indicator />
              </Checkbox.Control>
              <Checkbox.Content>
                <Label className='text-xs'>
                  Add output <span className='font-mono'>{name}</span> and map a new variable
                </Label>
              </Checkbox.Content>
            </Checkbox>
          ))}

          {info.typeChangeImpacts.map((impact) => (
            <div
              className='flex flex-col gap-1 rounded-md bg-warning-soft p-2 text-warning'
              key={`tc-${impact.flag}-${impact.paramName}`}
            >
              <span className='flex items-start gap-2'>
                <IconExclamationTriangle className='mt-0.5 shrink-0' size={12} />
                <span>
                  Type of <span className='font-mono'>{impact.paramName}</span> changed to{' '}
                  <span className='font-mono'>{impact.newType}</span>, but variable{' '}
                  <span className='font-mono'>{impact.variableName}</span> keeps its old type
                  {impact.consumers.length > 0
                    ? ` (also used by ${impact.consumers.map((c) => c.title || c.paramName).join(', ')})`
                    : ''}
                  .
                </span>
              </span>
              <Checkbox
                isSelected={!!choices.updateVariableTypes?.[impact.variableId]}
                onChange={(selected) => onToggleVariableType(action.elementId, impact.variableId, selected)}
              >
                <Checkbox.Control>
                  <Checkbox.Indicator />
                </Checkbox.Control>
                <Checkbox.Content>
                  <Label className='text-xs'>
                    Update variable <span className='font-mono'>{impact.variableName}</span> to{' '}
                    <span className='font-mono'>{impact.newType}</span>
                  </Label>
                </Checkbox.Content>
              </Checkbox>
            </div>
          ))}

          {info.breakingRemovedOutputs.map((impact) => (
            <div
              className='flex items-start gap-2 rounded-md bg-warning-soft p-2 text-warning'
              key={`ro-${impact.paramName}`}
            >
              <IconExclamationTriangle className='mt-0.5 shrink-0' size={12} />
              <span>
                Output <span className='font-mono'>{impact.paramName}</span> was removed. Variable{' '}
                <span className='font-mono'>{impact.variableName}</span> loses its writer and will break{' '}
                {impact.consumers.map((c) => c.title || c.paramName).join(', ')}.
              </span>
            </div>
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
  const variables = getWorkflowVariables(definition);
  const varById = new Map(variables.map((v) => [v.id, v]));
  const inputParams = new Map(getTileParams(element, 'input').map((p) => [p.paramName, p]));
  const outputParams = new Map(getTileParams(element, 'output').map((p) => [p.paramName, p]));
  const consumersOf = (variableId) =>
    getVariableConsumers(definition, variableId).filter((c) => c.elementId !== change.elementId);
  const variableName = (variableId) => varById.get(variableId)?.paramName || variableId;

  const addedInputNames = classified.inputs.added.map((e) => e.name);
  const addedOutputs = classified.outputs.added.map((e) => e.name);
  const addedRequiredInputs = classified.inputs.added.filter((e) => e.nullable === false).map((e) => e.name);

  const removedBoundInputs = classified.inputs.removed
    .filter((e) => hasBinding(inputParams.get(e.name)))
    .map((e) => ({
      binding: describeBinding(inputParams.get(e.name), varById),
      paramName: e.name
    }));

  // Every type change, paired with the tile param that carries the binding.
  const typeChanged = [
    ...classified.inputs.typeChanged.map((t) => ({
      flag: 'input',
      name: t.name,
      newType: t.new?.type ?? null,
      param: inputParams.get(t.name)
    })),
    ...classified.outputs.typeChanged.map((t) => ({
      flag: 'output',
      name: t.name,
      newType: t.new?.type ?? null,
      param: outputParams.get(t.name)
    }))
  ];
  const typeChangeImpacts = typeChanged
    .filter((t) => t.param?.mappedTo)
    .map((t) => ({
      consumers: consumersOf(t.param.mappedTo),
      flag: t.flag,
      newType: t.newType,
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
  const autoNotes = [];
  for (const r of classified.inputs.renamed) {
    autoNotes.push(`Input renamed ${r.from} to ${r.to}, binding kept`);
  }
  for (const r of classified.outputs.renamed) {
    autoNotes.push(`Output renamed ${r.from} to ${r.to}, binding kept`);
  }
  for (const e of classified.inputs.added) {
    if (e.nullable !== false) autoNotes.push(`New optional input ${e.name} added`);
  }
  for (const e of classified.inputs.removed) {
    if (!hasBinding(inputParams.get(e.name))) autoNotes.push(`Unused input ${e.name} removed`);
  }
  for (const t of typeChanged) {
    if (!t.param?.mappedTo) {
      autoNotes.push(`Type of ${t.name} changed to ${t.newType}, no variable bound`);
    }
  }
  for (const o of removedOutputs) {
    if (o.consumers.length === 0) {
      autoNotes.push(
        o.variableName
          ? `Output ${o.paramName} removed, variable ${o.variableName} is no longer written`
          : `Output ${o.paramName} removed`
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
    removedBoundInputs,
    typeChangeImpacts
  };
}

/**
 * Compare two semver strings. Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) {
      return (pa[i] || 0) - (pb[i] || 0);
    }
  }
  return 0;
}

function describeBinding(param, varById) {
  if (!param) return 'unmapped';
  if (param.mappedTo) return `variable ${varById.get(param.mappedTo)?.paramName || param.mappedTo}`;
  if (param.value !== null && param.value !== undefined) return 'a fixed value';
  return 'unmapped';
}

/**
 * Parse code engine tiles from a workflow definition and group by package.
 */
function groupTilesByPackage(designElements) {
  const packageMap = new Map();

  for (const el of designElements) {
    if (el.data?.taskType !== 'nebulaFunction' || !el.data?.metadata?.packageId) {
      continue;
    }

    const { functionName, packageId, version } = el.data.metadata;
    const actionName = el.data.title || functionName || el.id;

    if (!packageMap.has(packageId)) {
      packageMap.set(packageId, { actions: [], versions: new Set() });
    }

    const pkg = packageMap.get(packageId);
    pkg.actions.push({
      actionName,
      currentVersion: version,
      elementId: el.id,
      functionName
    });
    pkg.versions.add(version);
  }

  return packageMap;
}
