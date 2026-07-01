import { Alert, AlertDialog, Button, Card, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { useStatusBar } from '@/hooks/useStatusBar';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { deleteApprovalTemplate } from '@/services/approvals';
import { deleteAppAndAllContent } from '@/services/customApps';
import { deleteDataflowAndOutputs } from '@/services/dataflows';
import { deleteDataset } from '@/services/datasets';
import { deleteObject } from '@/services/deleteObject';
import { getDependenciesForDelete } from '@/services/dependencies';
import { deletePageAndAllCards } from '@/services/pages';
import { parseMarkdownBold } from '@/utils/markdown';
import { collectShareableObjects } from '@/utils/rowActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconTrash from '@icons/trash.svg?react';
import IconX from '@icons/x.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

/**
 * Per-type delete behavior. Each entry declares the user-facing typeName, the
 * confirmation copy, the success/loading toast templates, and the actual
 * `run()` function. Optional `cascadeButtons` add secondary delete actions
 * (e.g. "Delete app and all cards" for a `DATA_APP_VIEW` page).
 */
const deletersByType = {
  APP: {
    confirmSuffix: '',
    primaryLabel: 'Delete App',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'App'
  },
  BEAST_MODE_FORMULA: {
    confirmSuffix: '',
    primaryLabel: 'Delete Beast Mode',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'Beast Mode Formula'
  },
  DATA_APP_VIEW: {
    cascadeButtons: [
      {
        available: ({ context }) => !!context.domoObject?.parentId,
        buildContext: ({ context, deps }) => {
          const appLabel = context.domoObject?.typeId === 'WORKSHEET_VIEW' ? 'Worksheet' : 'App';
          return {
            appLabel,
            appName: context.domoObject.metadata?.parent?.name || `${appLabel} ${context.domoObject.parentId}`,
            cardCount: deps?.appSummary?.cardCount ?? null,
            pageCount: deps?.appSummary?.pageCount ?? null,
            parentId: context.domoObject.parentId
          };
        },
        confirmText: ({ appLabel, appName, cardCount, pageCount, parentId }) => {
          const pages = pageCount != null ? ` (${pageCount})` : '';
          const cards = cardCount != null ? ` (${cardCount})` : '';
          return `Delete entire ${appLabel.toLowerCase()} **${appName} (ID: ${parentId})**, all its pages${pages}, and all cards on those pages${cards} permanently?`;
        },
        label: ({ appLabel }) => `Delete ${appLabel} and All Cards`,
        loadingMessage: ({ appName }) => `Deleting **${appName}** and all its cards…`,
        run: async ({ context, deps }) => {
          const appId = context.domoObject.parentId;
          return deleteAppAndAllContent({
            appId,
            cardIds: deps?.appSummary?.cardIds ?? null,
            currentPageId: context.domoObject.id,
            currentPageType: context.domoObject.typeId,
            tabId: context.tabId
          });
        },
        successMessage: ({ appName }, result) =>
          `**${appName}** and ${result.cardCount} card${result.cardCount !== 1 ? 's' : ''} deleted`,
        tooltip: ({ appLabel }) => `Deletes the entire ${appLabel.toLowerCase()} instead of just this page`
      }
    ],
    confirmSuffix: ' and all its cards',
    primaryLabel: 'Delete Page and All Cards',
    run: ({ context }) => runPageDelete({ context, parentAppId: context.domoObject.parentId }),
    typeName: 'Page'
  },
  DATAFLOW_TYPE: {
    confirmSuffix: ({ outputCount }) =>
      outputCount > 0 ? ` and ${outputCount} output dataset${outputCount !== 1 ? 's' : ''}` : '',
    primaryLabel: ({ outputCount }) => (outputCount > 0 ? 'Delete DataFlow and All Outputs' : 'Delete DataFlow'),
    run: async ({ context }) => {
      const outputs = context.domoObject.metadata?.details?.outputs || [];
      const result = await deleteDataflowAndOutputs({
        dataflowId: context.domoObject.id,
        outputs,
        tabId: context.tabId
      });
      if (!result.success) {
        if (result.datasetsFailed > 0) {
          throw new Error(
            `Failed to delete ${result.datasetsFailed} of ${result.datasetsFailed + result.datasetsDeleted} output dataset${result.datasetsFailed + result.datasetsDeleted !== 1 ? 's' : ''}. Dataflow was not deleted.`
          );
        }
        throw new Error(`Output datasets deleted, but dataflow deletion failed (HTTP ${result.statusCode}).`);
      }
      return result;
    },
    successMessage: ({ name, outputCount }) =>
      `**${name}** and ${outputCount} output dataset${outputCount !== 1 ? 's' : ''} deleted`,
    typeName: 'DataFlow'
  },
  MAGNUM_COLLECTION: {
    confirmSuffix: '',
    primaryLabel: 'Delete Collection',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'Collection'
  },
  PAGE: {
    confirmSuffix: ' and all its cards',
    primaryLabel: 'Delete Page and All Cards',
    run: ({ context }) => runPageDelete({ context }),
    typeName: 'Page'
  },
  REPORT_SCHEDULE: {
    confirmSuffix: '',
    primaryLabel: 'Delete Scheduled Report',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'Scheduled Report'
  },
  TEMPLATE: {
    cascadeButtons: [
      {
        available: ({ deps }) => !!findRelatedDataset(deps),
        blockedReason: ({ dependentCount }) =>
          `The related dataset feeds ${dependentCount} other object${dependentCount !== 1 ? 's' : ''}. Delete or repoint ${dependentCount !== 1 ? 'them' : 'it'} before deleting the dataset.`,
        buildContext: ({ context, deps }) => {
          const ds = findRelatedDataset(deps)?.items?.[0];
          return {
            datasetId: ds?.id,
            datasetName: ds?.label || ds?.id,
            dependentCount: ds?.count ?? 0,
            templateId: context.domoObject.id,
            templateName: context.domoObject.metadata?.name || context.domoObject.id
          };
        },
        confirmText: ({ datasetId, datasetName, templateId, templateName }) =>
          `Delete the approval template **${templateName} (ID: ${templateId})** and its related dataset **${datasetName} (ID: ${datasetId})** permanently? This cannot be undone.`,
        isBlocked: ({ dependentCount }) => dependentCount > 0,
        label: () => 'Delete Template and DataSet',
        loadingMessage: ({ datasetName, templateName }) => `Deleting **${templateName}** and dataset **${datasetName}**…`,
        run: ({ context, deps }) =>
          runTemplateAndDatasetDelete({
            context,
            datasetId: findRelatedDataset(deps)?.items?.[0]?.id
          }),
        successMessage: ({ datasetName, templateName }) => `**${templateName}** and dataset **${datasetName}** deleted`,
        tooltip: () => 'Also deletes the related dataset, not just the template'
      }
    ],
    confirmSuffix: '',
    primaryLabel: 'Delete Template',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'Template'
  },
  VARIABLE: {
    confirmSuffix: '',
    primaryLabel: 'Delete Variable',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'Variable'
  },
  WORKFLOW_MODEL: {
    confirmSuffix: '',
    primaryLabel: 'Delete Workflow',
    run: async ({ context }) => {
      const result = await deleteObject({
        object: context.domoObject,
        tabId: context.tabId
      });
      if (result.statusType !== 'success') {
        throw new Error(result.statusDescription || 'Delete failed');
      }
      const origin = `https://${context.instance}.domo.com`;
      chrome.tabs.update(context.tabId, { url: `${origin}/workflows` });
      return result;
    },
    typeName: 'Workflow'
  },
  WORKSHEET_VIEW: {
    cascadeButtons: undefined,
    confirmSuffix: ' and all its cards',
    primaryLabel: 'Delete Worksheet Page and All Cards',
    run: ({ context }) => runPageDelete({ context, parentAppId: context.domoObject.parentId }),
    typeName: 'Worksheet Page'
  }
};
deletersByType.WORKSHEET_VIEW.cascadeButtons = deletersByType.DATA_APP_VIEW.cascadeButtons;

export function DeleteObjectView({
  instance = null,
  isActive = true,
  liveContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContext, setCurrentContext] = useState(null);
  const [config, setConfig] = useState(null);
  const [deps, setDeps] = useState(null);
  const [isLoadingDeps, setIsLoadingDeps] = useState(false);
  const [depsError, setDepsError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
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
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'deleteObject') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      const typeId = context?.domoObject?.typeId;
      const cfg = deletersByType[typeId];
      if (!context || !cfg) {
        onStatusUpdate?.('Error', `Delete not supported for ${typeId}`, 'danger');
        onBackToDefault?.();
        return;
      }
      if (!mountedRef.current) return;
      setCurrentContext(context);
      setConfig(cfg);
      loadDependencies(context);
    } catch (error) {
      console.error('[DeleteObjectView] Error loading data:', error);
      onStatusUpdate?.('Error', error.message || 'Failed to load context', 'danger');
    } finally {
      if (mountedRef.current) setIsLoading(false);
    }
  };

  const loadDependencies = async (context) => {
    setIsLoadingDeps(true);
    setDepsError(null);
    try {
      const result = await getDependenciesForDelete({
        instance: context.instance,
        object: context.domoObject,
        tabId: context.tabId
      });
      if (mountedRef.current) setDeps(result);
    } catch (error) {
      console.error('[DeleteObjectView] Error loading dependencies:', error);
      if (mountedRef.current) {
        setDepsError(error.message || 'Failed to check dependencies');
      }
    } finally {
      if (mountedRef.current) setIsLoadingDeps(false);
    }
  };

  const handleRefresh = async () => {
    if (!currentContext) return;
    setIsRefreshing(true);
    try {
      await loadDependencies(currentContext);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const performDelete = (action) => {
    if (!config || !currentContext) return;
    setIsDeleting(true);

    const objectName = currentContext.domoObject.metadata?.name || currentContext.domoObject.id;
    const isCascade = !!action.cascade;
    const cascade = isCascade ? action.cascade : null;
    const cascadeCtx = isCascade ? cascade.buildContext({ context: currentContext, deps }) : null;

    const promise = isCascade
      ? Promise.resolve().then(() => cascade.run({ context: currentContext, deps }))
      : Promise.resolve().then(() => config.run({ context: currentContext }));

    showPromiseStatus(promise, {
      error: (err) => err.message || `Failed to delete ${config.typeName.toLowerCase()}`,
      loading: isCascade
        ? cascade.loadingMessage(cascadeCtx)
        : `Deleting **${objectName}**${resolveSuffix(config, currentContext)}…`,
      success: (result) => {
        if (isCascade) {
          return cascade.successMessage(cascadeCtx, result);
        }
        if (config.successMessage) {
          return config.successMessage({
            name: objectName,
            outputCount: currentContext.domoObject.metadata?.details?.outputs?.length || 0
          });
        }
        return result?.statusDescription || `**${objectName}** deleted`;
      }
    });

    promise
      .then(() => {
        if (mountedRef.current) onBackToDefault?.();
      })
      .catch(() => {})
      .finally(() => {
        if (mountedRef.current) {
          setIsDeleting(false);
          setPendingAction(null);
        }
      });
  };

  if (isLoading) {
    return (
      <Card className='flex h-full w-full items-center justify-center'>
        <Card.Content className='flex flex-col items-center gap-2 py-8'>
          <Spinner size='lg' />
          <p className='text-sm text-muted'>Loading…</p>
        </Card.Content>
      </Card>
    );
  }

  if (!config || !currentContext) return null;

  const domoObject = currentContext.domoObject;
  const typeName = domoObject.typeName?.toLowerCase() || config.typeName.toLowerCase();
  const objectName = domoObject.metadata?.name || domoObject.id;
  const isBlocked = !!deps?.blockingCount && deps.blockingCount > 0;
  const outputCount = domoObject.metadata?.details?.outputs?.length || 0;
  const deletedCount = (deps?.groups || []).filter((g) => g.deleted).reduce((n, g) => n + g.items.length, 0);

  const primaryLabel =
    typeof config.primaryLabel === 'function' ? config.primaryLabel({ outputCount }) : config.primaryLabel;

  const availableCascades = (config.cascadeButtons || []).filter((c) => c.available({ context: currentContext, deps }));

  // "Will also be deleted" and "Other dependencies" each become a top-level virtual
  // parent group, so the whole view is one DataList: its header carries the
  // delete title/object and the activity-log-for-all button, its footer carries
  // the delete buttons, and these groups (auto-expanded) hold the affected
  // objects. A group with a single child auto-expands that child too (see
  // DataList's sole-virtual-child handling), so a lone "Cards on this page"
  // opens straight away.
  const baseUrl = domoObject.baseUrl;
  const deletedGroups = (deps?.groups || []).filter((g) => g.deleted);
  const otherGroups = (deps?.groups || []).filter((g) => !g.deleted);
  const dependencyItems = [];
  if (deletedGroups.length > 0) {
    dependencyItems.push(
      DataListItem.createGroup({
        children: buildDependencyItems(deletedGroups, 'deleted-group', baseUrl),
        id: 'will-also-be-deleted',
        label: 'Will also be deleted'
      })
    );
  }
  if (otherGroups.length > 0) {
    dependencyItems.push(
      DataListItem.createGroup({
        children: buildDependencyItems(otherGroups, 'other-group', baseUrl),
        id: 'other-dependencies',
        label: 'Other dependencies'
      })
    );
  }
  const expandedGroupIds = dependencyItems.map((item) => item.id);
  // Show the header "Share all" only when some dependency row is actually
  // shareable (DataList shares them itself via its per-type capabilities).
  const hasShareableDeps = collectShareableObjects(dependencyItems).length > 0;

  return (
    <>
      <DataList
        allowsMultipleExpanded
        fillHeight
        currentContext={liveContext}
        defaultExpandedIds={expandedGroupIds}
        feature='Delete'
        featureIcon={<IconTrash />}
        headerActions={hasShareableDeps ? ['shareAll', 'reload', 'refresh'] : ['reload', 'refresh']}
        isRefreshing={isRefreshing}
        itemLabel='dependency'
        items={dependencyItems}
        objectId={domoObject.id}
        objectType={domoObject.typeId}
        showActions={true}
        showCounts={true}
        subject={objectName}
        subjectTypeId={domoObject.typeId}
        subtext={`ID: ${domoObject.id}`}
        viewType='deleteObject'
        onClose={onBackToDefault || undefined}
        onRefresh={handleRefresh}
        onStatusUpdate={onStatusUpdate}
        banner={renderDependencyBanner({
          deps,
          error: depsError,
          isBlocked,
          isLoading: isLoadingDeps,
          onRetry: () => loadDependencies(currentContext)
        })}
        footer={
          <div className='flex flex-col gap-2'>
            {availableCascades.map((cascade, idx) => {
              const ctx = cascade.buildContext({ context: currentContext, deps });
              const cascadeLabel = cascade.label(ctx);
              const blocked = cascade.isBlocked?.(ctx) ?? false;
              return (
                <Tooltip key={idx}>
                  <Button
                    fullWidth
                    isDisabled={isDeleting || blocked}
                    variant='tertiary'
                    onPress={() =>
                      setPendingAction({
                        cascade,
                        kind: 'cascade',
                        label: cascadeLabel
                      })
                    }
                  >
                    <IconTrash className='text-danger' />
                    {cascadeLabel}
                  </Button>
                  <Tooltip.Content className='max-w-60'>
                    {blocked ? cascade.blockedReason(ctx) : cascade.tooltip(ctx)}
                  </Tooltip.Content>
                </Tooltip>
              );
            })}
            <Tooltip isDisabled={!isBlocked}>
              <Button
                fullWidth
                isDisabled={isDeleting || isBlocked}
                isPending={isDeleting}
                variant='danger'
                onPress={() => setPendingAction({ kind: 'primary', label: primaryLabel })}
              >
                <IconTrash />
                {primaryLabel}
              </Button>
              <Tooltip.Content className='max-w-60'>{deps?.blockingReason || 'Blocked'}</Tooltip.Content>
            </Tooltip>
          </div>
        }
      />

      <AlertDialog
        isOpen={!!pendingAction && isActive}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-danger' />
              <AlertDialog.CloseTrigger className='absolute top-3 right-2' variant='ghost'>
                <IconX />
              </AlertDialog.CloseTrigger>
              <AlertDialog.Header>
                <AlertDialog.Heading>{pendingAction?.label}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {pendingAction?.kind === 'cascade' && pendingAction.cascade ? (
                  parseMarkdownBold(
                    pendingAction.cascade.confirmText(pendingAction.cascade.buildContext({ context: currentContext, deps }))
                  )
                ) : (
                  <>
                    Are you sure you want to delete the <span className='lowercase'>{typeName}</span>{' '}
                    <span className='font-bold'>
                      {objectName} (ID: {domoObject.id})
                    </span>
                    {resolveSuffix(config, currentContext) ? (
                      <span className='italic'> {resolveSuffix(config, currentContext)}</span>
                    ) : null}{' '}
                    permanently?
                    {deletedCount > 0 && (
                      <div className='mt-2 text-xs text-muted'>
                        {deletedCount} dependenc{deletedCount === 1 ? 'y' : 'ies'} shown will be deleted with it.
                      </div>
                    )}
                  </>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button isDisabled={isDeleting} size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button isDisabled={isDeleting} size='sm' variant='danger' onPress={() => performDelete(pendingAction)}>
                  {pendingAction?.label}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

function buildDependencyItems(groups, idPrefix, baseUrl) {
  return groups.flatMap((group, idx) => {
    // Count-only summary group (e.g. "Approvals"): a childless virtual parent
    // renders as a flat "(N requests)" row, showing the tally without listing
    // each item.
    if ((!group.items || group.items.length === 0) && group.count !== undefined) {
      return new DataListItem({
        count: group.count,
        countLabel: group.countLabel,
        id: `${idPrefix}-${idx}`,
        isVirtualParent: true,
        label: group.label,
        typeId: group.summaryTypeId ?? null
      });
    }
    const children = group.items.map((item) => {
      const dli = new DataListItem({
        count: item.count,
        countLabel: item.countLabel,
        domoObject: baseUrl ? new DomoObject(item.typeId, item.id, baseUrl) : null,
        id: item.id,
        label: item.label,
        typeId: item.typeId,
        url: item.url
      });
      if (item.unshareable) dli.unshareable = true;
      return dli;
    });
    // Flat group (a 1:1 related object): render its item(s) as leaf rows
    // directly, so the row keeps its type icon and inline actions instead of
    // sitting under an icon-less disclosure header.
    if (group.flat) return children;
    // Each dependency group lists items of a single type, so record it as the
    // group's childTypeId; DataList uses it to decide the group's "all" actions.
    return DataListItem.createGroup({
      children,
      childTypeId: group.items[0]?.typeId ?? null,
      id: `${idPrefix}-${idx}`,
      label: group.label
    });
  });
}

function findRelatedDataset(deps) {
  return deps?.groups?.find((g) => g.key === 'relatedDataset') || null;
}

// The dependency-check status shown above the affected-objects list: a loading
// spinner, an error with retry, a "not supported" or "none found" notice, or a
// blocking warning when something prevents the delete. Returns null once a
// normal set of dependencies has loaded (the list itself carries it then), so
// the consumer can pass the result straight to DataList's `banner` slot.
function renderDependencyBanner({ deps, error, isBlocked, isLoading, onRetry }) {
  if (isLoading) {
    return (
      <div className='flex items-center justify-center gap-2 py-3'>
        <Spinner size='sm' />
        <span className='text-xs text-muted'>Checking dependencies…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className='w-full bg-danger-soft' status='danger'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>Could not check dependencies</Alert.Title>
          <Alert.Description>{error}</Alert.Description>
          <Button className='mt-2' size='sm' variant='ghost' onPress={onRetry}>
            Retry
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  if (!deps) return null;

  if (!deps.supported) {
    return (
      <Alert className='w-full bg-surface-secondary' status='default'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description className='text-foreground'>
            Dependency check is not available for this object type. Verify dependencies manually before deleting.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (deps.totalCount === 0) {
    return (
      <Alert className='w-full bg-success-soft' status='success'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>No dependencies found.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (isBlocked && deps.blockingReason) {
    return (
      <Alert className='w-full bg-warning-soft' status='warning'>
        <AlertStatusIcon />
        <Alert.Content>
          <Alert.Description>{deps.blockingReason}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return null;
}

function resolveSuffix(config, context) {
  if (typeof config.confirmSuffix === 'function') {
    return config.confirmSuffix({
      outputCount: context.domoObject.metadata?.details?.outputs?.length || 0
    });
  }
  return config.confirmSuffix || '';
}

async function runPageDelete({ context, parentAppId = null }) {
  const result = await deletePageAndAllCards({
    appId: parentAppId ? parseInt(parentAppId) : null,
    currentContext: context,
    pageId: parseInt(context.domoObject.id),
    pageType: context.domoObject.typeId,
    skipChildPageCheck: true,
    tabId: context.tabId
  });
  if (!result.success) {
    throw new Error(result.statusDescription || 'Failed to delete page');
  }
  return result;
}

async function runTemplateAndDatasetDelete({ context, datasetId }) {
  await deleteApprovalTemplate({ tabId: context.tabId, templateId: context.domoObject.id });
  try {
    await deleteDataset({ datasetId, tabId: context.tabId });
  } catch (err) {
    throw new Error(`Template deleted, but the dataset could not be removed (${err.message}). Delete it manually.`, {
      cause: err
    });
  }
  return { datasetId };
}
