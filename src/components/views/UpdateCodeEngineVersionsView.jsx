import {
  Button,
  Card,
  Chip,
  Disclosure,
  Label,
  Link,
  ListBox,
  ScrollShadow,
  Select,
  Spinner,
  Tooltip
} from '@heroui/react';
import {
  IconArrowRight,
  IconCheck,
  IconChevronDown,
  IconX
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks';
import { DomoContext } from '@/models';
import {
  getCodeEnginePackageInfo,
  getVersionDefinition,
  updateVersionDefinition
} from '@/services';
import { getSidepanelData, waitForDefinition } from '@/utils';

export function UpdateCodeEngineVersionsView({
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [packages, setPackages] = useState([]);
  const [currentContext, setCurrentContext] = useState(null);
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
      const data = await getSidepanelData();

      if (!data || data.type !== 'updateCodeEngineVersions') {
        onBackToDefault?.();
        return;
      }

      const context = data.currentContext
        ? DomoContext.fromJSON(data.currentContext)
        : null;

      if (!context) {
        onStatusUpdate?.('Error', 'No context available', 'danger');
        onBackToDefault?.();
        return;
      }

      setCurrentContext(context);

      // Get definition - either from stored data or fetch/wait for it
      let def = data.definition;
      if (!def) {
        const isCEVersion =
          context.domoObject?.typeId === 'CODEENGINE_PACKAGE_VERSION';
        if (isCEVersion) {
          const wfModelId =
            context.domoObject.metadata?.context?.workflowModelId;
          const wfVersion =
            context.domoObject.metadata?.context?.workflowVersionNumber;
          if (!wfModelId || !wfVersion) {
            onStatusUpdate?.(
              'Error',
              'Missing workflow context for code engine version',
              'danger'
            );
            onBackToDefault?.();
            return;
          }
          def = await getVersionDefinition(
            wfModelId,
            wfVersion,
            context.tabId
          );
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
        Array.from(packageMap.entries()).map(
          async ([packageId, { actions, versions }]) => {
            let packageName = packageId;
            let availableVersions = [];

            try {
              const info = await getCodeEnginePackageInfo(packageId, tabId);
              packageName = info.name || packageId;
              availableVersions = (info.versions || [])
                .filter((v) => v.released != null)
                .map((v) => v.version)
                .sort((a, b) => compareSemver(b, a));
            } catch (error) {
              console.warn(
                `[UpdateCEVersions] Failed to fetch package info for ${packageId}:`,
                error
              );
            }

            const uniqueVersions = Array.from(versions);
            const isSingleVersion = uniqueVersions.length === 1;
            const currentVersion = isSingleVersion ? uniqueVersions[0] : null;
            const latestVersion =
              availableVersions.length > 0 ? availableVersions[0] : null;

            // Default: latest if single version and not already on latest, otherwise no-change
            let defaultSelected = 'no-change';
            if (
              !isSingleVersion ||
              (latestVersion && currentVersion !== latestVersion)
            ) {
              defaultSelected = latestVersion;
            }

            return {
              actions: actions.map((a) => ({
                ...a,
                selectedVersion: 'inherit'
              })),
              availableVersions,
              currentVersion,
              isSingleVersion,
              latestVersion,
              packageId,
              packageName,
              selectedVersion: defaultSelected
            };
          }
        )
      );

      if (!mountedRef.current) return;
      packageEntries.sort((a, b) => a.packageName.localeCompare(b.packageName));
      setPackages(packageEntries);
    } catch (error) {
      console.error('[UpdateCEVersionsView] Error loading data:', error);
      onStatusUpdate?.(
        'Error',
        error.message || 'Failed to load code engine packages',
        'danger'
      );
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const handlePackageVersionChange = (packageId, version) => {
    setPackages((prev) =>
      prev.map((pkg) =>
        pkg.packageId === packageId ? { ...pkg, selectedVersion: version } : pkg
      )
    );
  };

  const handleActionVersionChange = (packageId, elementId, version) => {
    setPackages((prev) =>
      prev.map((pkg) =>
        pkg.packageId === packageId
          ? {
              ...pkg,
              actions: pkg.actions.map((a) =>
                a.elementId === elementId
                  ? { ...a, selectedVersion: version }
                  : a
              )
            }
          : pkg
      )
    );
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
            elementId: action.elementId,
            newVersion: effectiveVersion
          });
        }
      }
    }

    return changes;
  };

  const hasChanges = computeChanges().length > 0;

  const handleSubmit = async () => {
    const changes = computeChanges();

    if (changes.length === 0) {
      onStatusUpdate?.(
        'No Changes',
        'No version changes to apply.',
        'warning',
        2000
      );
      return;
    }

    setIsSubmitting(true);

    const isCEVersion =
      currentContext.domoObject.typeId === 'CODEENGINE_PACKAGE_VERSION';
    const modelId = isCEVersion
      ? currentContext.domoObject.metadata?.context?.workflowModelId
      : currentContext.domoObject.parentId;
    const versionNumber = isCEVersion
      ? currentContext.domoObject.metadata?.context?.workflowVersionNumber
      : currentContext.domoObject.id;
    const tabId = currentContext.tabId;

    const promise = (async () => {
      // Fetch the latest definition to avoid overwriting concurrent changes
      const latestDefinition = await getVersionDefinition(
        modelId,
        versionNumber,
        tabId
      );
      const modified = structuredClone(latestDefinition);

      for (const change of changes) {
        const element = modified.designElements.find(
          (el) => el.id === change.elementId
        );
        if (element?.data?.metadata) {
          element.data.metadata.version = change.newVersion;
        }
      }

      await updateVersionDefinition(modelId, versionNumber, modified, tabId);

      // Reload the tab to reflect changes
      chrome.tabs.reload(tabId);

      return changes.length;
    })();

    showPromiseStatus(promise, {
      error: (err) => err.message || 'Failed to update versions',
      loading: `Updating **${changes.length}** action${changes.length !== 1 ? 's' : ''}…`,
      success: (count) => `Updated ${count} action${count !== 1 ? 's' : ''}`
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
            <IconChevronDown stroke={1.5} />
          </Select.Indicator>
        </Select.Trigger>
        <Select.Popover className='h-60'>
          <ListBox>
            <ListBox.Item
              id={isActionLevel ? 'inherit' : 'no-change'}
              key={isActionLevel ? 'inherit' : 'no-change'}
              textValue={isActionLevel ? 'Inherit' : 'No Change'}
            >
              <Label>{isActionLevel ? 'Inherit' : 'No Change'}</Label>
              <ListBox.ItemIndicator>
                {({ isSelected }) =>
                  isSelected ? <IconCheck stroke={1.5} /> : null
                }
              </ListBox.ItemIndicator>
            </ListBox.Item>
            {availableVersions.map((v) => (
              <ListBox.Item
                id={v}
                isDisabled={v === disabledVersion}
                key={v}
                textValue={v === latestVersion ? `Latest - ${v}` : v}
              >
                <Label>{v === latestVersion ? `Latest - ${v}` : v}</Label>
                <ListBox.ItemIndicator>
                  {({ isSelected }) =>
                    isSelected ? <IconCheck stroke={1.5} /> : null
                  }
                </ListBox.ItemIndicator>
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
            <div className='line-clamp-2 min-w-0'>
              Update Code Engine Versions
            </div>

            <div className='flex flex-row items-center gap-1'>
              <span className='text-sm text-muted'>
                {`${packages.length} package${packages.length === 1 ? '' : 's'} | ${packages.reduce((sum, pkg) => sum + pkg.actions.length, 0)} action${packages.reduce((sum, pkg) => sum + pkg.actions.length, 0) === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
          {onBackToDefault && (
            <Tooltip closeDelay={0} delay={400}>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                onPress={onBackToDefault}
              >
                <IconX stroke={1.5} />
              </Button>
              <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
            </Tooltip>
          )}
        </Card.Title>
      </Card.Header>

      <ScrollShadow
        hideScrollBar
        className='min-h-0 flex-1 overflow-y-auto'
        offset={5}
        orientation='vertical'
      >
        <Card.Content>
          {packages.map((pkg, index) => (
            <div
              key={pkg.packageId}
              className={
                index > 0 ? 'w-full border-t border-border pt-2 pb-1' : 'pb-1'
              }
            >
              <div className='flex w-full flex-col gap-1'>
                <div className='flex w-full items-end justify-between gap-2'>
                  <Link
                    className='min-w-0 flex-1 truncate no-underline decoration-accent hover:text-accent hover:underline'
                    href={`https://${currentContext?.instance}.domo.com/codeengine/${pkg.packageId}`}
                    target='_blank'
                  >
                    {pkg.packageName}
                  </Link>
                  <span className='shrink-0 text-xs text-muted'>
                    {pkg.actions.length} action
                    {pkg.actions.length !== 1 ? 's' : ''}
                  </span>
                </div>

                <div className='flex w-full items-center justify-between gap-2'>
                  <Chip
                    className='h-9'
                    size='lg'
                    variant='soft'
                    color={
                      pkg.latestVersion === pkg.currentVersion
                        ? 'success'
                        : pkg.isSingleVersion
                          ? 'warning'
                          : 'danger'
                    }
                  >
                    {pkg.isSingleVersion
                      ? pkg.currentVersion
                      : 'Multiple Versions'}
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
                      <Button
                        fullWidth
                        className='justify-between'
                        size='sm'
                        slot='trigger'
                        variant='ghost'
                      >
                        Per-action overrides
                        <Disclosure.Indicator>
                          <IconChevronDown stroke={1.5} />
                        </Disclosure.Indicator>
                      </Button>
                    </Disclosure.Heading>
                    <Disclosure.Content>
                      <div className='flex flex-col gap-1.5 pt-1 pl-1'>
                        {pkg.actions.map((action) => (
                          <div
                            className='flex flex-col gap-0.5'
                            key={action.elementId}
                          >
                            <span
                              className='truncate text-xs'
                              title={action.actionName}
                            >
                              {action.actionName}
                            </span>
                            <div className='flex items-center justify-between gap-2'>
                              <Chip
                                className='h-9'
                                size='lg'
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
              </div>
            </div>
          ))}
        </Card.Content>
      </ScrollShadow>

      <div className='shrink-0 border-t border-border px-3 py-2'>
        <Button
          fullWidth
          isDisabled={!hasChanges || isSubmitting}
          isPending={isSubmitting}
          size='sm'
          variant='primary'
          onPress={handleSubmit}
        >
          {isSubmitting ? (
            <Spinner color='currentColor' size='sm' />
          ) : (
            'Update Versions'
          )}
        </Button>
      </div>
    </Card>
  );
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

/**
 * Parse code engine tiles from a workflow definition and group by package.
 */
function groupTilesByPackage(designElements) {
  const packageMap = new Map();

  for (const el of designElements) {
    if (
      el.data?.taskType !== 'nebulaFunction' ||
      !el.data?.metadata?.packageId
    ) {
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
      elementId: el.id
    });
    pkg.versions.add(version);
  }

  return packageMap;
}
