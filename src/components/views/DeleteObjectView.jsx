import { Alert, AlertDialog, Button, Card, Spinner, Tooltip } from '@heroui/react';
import { IconAlertTriangle, IconTrash, IconX } from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';

import { ObjectTypeIcon } from '@/components';
import { useStatusBar } from '@/hooks';
import { DataListItem, DomoContext } from '@/models';
import {
  deleteAppAndAllContent,
  deleteDataflowAndOutputs,
  deleteObject,
  deletePageAndAllCards,
  getDependenciesForDelete
} from '@/services';
import { getSidepanelData } from '@/utils';

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
        confirmText: ({ appLabel, appName, parentId }) =>
          `Delete entire ${appLabel.toLowerCase()} ${appName} (ID: ${parentId}), all its pages, and all cards on those pages permanently?`,
        getKind: ({ context }) =>
          context.domoObject?.typeId === 'WORKSHEET_VIEW' ? 'Worksheet' : 'App',
        label: ({ appLabel }) => `Delete ${appLabel} and All Cards`,
        loadingMessage: ({ appName }) => `Deleting **${appName}** and all its cards…`,
        run: async ({ context }) => {
          const appId = context.domoObject.parentId;
          return deleteAppAndAllContent({
            appId,
            currentPageId: context.domoObject.id,
            currentPageType: context.domoObject.typeId,
            tabId: context.tabId
          });
        },
        successMessage: ({ appName, result }) =>
          `**${appName}** and ${result.cardCount} card${result.cardCount !== 1 ? 's' : ''} deleted`
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
    primaryLabel: ({ outputCount }) =>
      outputCount > 0 ? 'Delete DataFlow and All Outputs' : 'Delete DataFlow',
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
        throw new Error(
          `Output datasets deleted, but dataflow deletion failed (HTTP ${result.statusCode}).`
        );
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
  TEMPLATE: {
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

export function DeleteObjectView({ onBackToDefault = null, onStatusUpdate = null }) {
  const [isLoading, setIsLoading] = useState(true);
  const [currentContext, setCurrentContext] = useState(null);
  const [config, setConfig] = useState(null);
  const [deps, setDeps] = useState(null);
  const [isLoadingDeps, setIsLoadingDeps] = useState(false);
  const [depsError, setDepsError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
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
      const data = await getSidepanelData();
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

  const performDelete = (action) => {
    if (!config || !currentContext) return;
    setIsDeleting(true);

    const objectName = currentContext.domoObject.metadata?.name || currentContext.domoObject.id;
    const isCascade = !!action.cascade;
    const cascade = isCascade ? action.cascade : null;

    const cascadeContext = isCascade
      ? {
          appLabel: cascade.getKind({ context: currentContext }),
          appName:
            currentContext.domoObject.metadata?.parent?.name ||
            `${cascade.getKind({ context: currentContext })} ${currentContext.domoObject.parentId}`,
          parentId: currentContext.domoObject.parentId
        }
      : null;

    const promise = isCascade
      ? Promise.resolve().then(() => cascade.run({ context: currentContext }))
      : Promise.resolve().then(() => config.run({ context: currentContext }));

    showPromiseStatus(promise, {
      error: (err) =>
        err.message ||
        `Failed to delete ${(isCascade ? cascadeContext.appLabel : config.typeName).toLowerCase()}`,
      loading: isCascade
        ? cascade.loadingMessage(cascadeContext)
        : `Deleting **${objectName}**${resolveSuffix(config, currentContext)}…`,
      success: (result) => {
        if (isCascade) {
          return cascade.successMessage({ ...cascadeContext, result });
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

  const primaryLabel =
    typeof config.primaryLabel === 'function'
      ? config.primaryLabel({ outputCount })
      : config.primaryLabel;

  const availableCascades = (config.cascadeButtons || []).filter((c) =>
    c.available({ context: currentContext })
  );

  return (
    <>
      <Card className='flex min-h-0 w-full flex-1 flex-col p-2'>
        <Card.Header className='gap-2'>
          <Card.Title className='flex items-start justify-between'>
            <div className='flex min-w-0 flex-1 items-center gap-2 pt-1'>
              <ObjectTypeIcon size={20} typeId={domoObject.typeId} />
              <div className='min-w-0'>
                <div className='truncate'>Delete {domoObject.typeName || config.typeName}</div>
                <div className='truncate text-xs font-normal text-muted'>
                  {objectName} (ID: {domoObject.id})
                </div>
              </div>
            </div>
            {onBackToDefault && (
              <Tooltip closeDelay={0} delay={400}>
                <Button isIconOnly size='sm' variant='ghost' onPress={onBackToDefault}>
                  <IconX stroke={1.5} />
                </Button>
                <Tooltip.Content className='text-xs'>Close</Tooltip.Content>
              </Tooltip>
            )}
          </Card.Title>
        </Card.Header>

        <DependencySection
          deps={deps}
          error={depsError}
          isLoading={isLoadingDeps}
          onRetry={() => loadDependencies(currentContext)}
          onStatusUpdate={onStatusUpdate}
        />

        {isBlocked && deps?.blockingReason && (
          <Alert className='w-full shrink-0 bg-warning-soft' status='warning'>
            <Alert.Indicator>
              <IconAlertTriangle data-slot='alert-default-icon' />
            </Alert.Indicator>
            <Alert.Content>
              <Alert.Description>{deps.blockingReason}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}

        <div className='flex shrink-0 flex-col gap-2'>
          {availableCascades.map((cascade, idx) => {
            const appLabel = cascade.getKind({ context: currentContext });
            const cascadeLabel = cascade.label({ appLabel });
            return (
              <Tooltip closeDelay={0} delay={400} key={idx}>
                <Button
                  fullWidth
                  isDisabled={isDeleting}
                  variant='tertiary'
                  onPress={() =>
                    setPendingAction({
                      cascade,
                      kind: 'cascade',
                      label: cascadeLabel
                    })
                  }
                >
                  <IconTrash className='text-danger' stroke={1.5} />
                  {cascadeLabel}
                </Button>
                <Tooltip.Content className='text-xs'>
                  Cascade option — deletes the entire {appLabel.toLowerCase()} instead of just this
                  page
                </Tooltip.Content>
              </Tooltip>
            );
          })}
          <Tooltip closeDelay={0} delay={400} isDisabled={!isBlocked}>
            <Button
              fullWidth
              isDisabled={isDeleting || isBlocked}
              isPending={isDeleting}
              variant='danger'
              onPress={() => setPendingAction({ kind: 'primary', label: primaryLabel })}
            >
              <IconTrash stroke={1.5} />
              {primaryLabel}
            </Button>
            <Tooltip.Content className='text-xs'>
              {deps?.blockingReason || 'Blocked'}
            </Tooltip.Content>
          </Tooltip>
        </div>
      </Card>

      <AlertDialog
        isOpen={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialog.Backdrop>
          <AlertDialog.Container className='p-1' placement='top'>
            <AlertDialog.Dialog className='p-2 pt-3'>
              <div className='absolute top-0 left-0 h-1.25 w-full bg-danger' />
              <AlertDialog.CloseTrigger className='absolute top-3 right-2' variant='ghost'>
                <IconX stroke={1.5} />
              </AlertDialog.CloseTrigger>
              <AlertDialog.Header>
                <AlertDialog.Heading>{pendingAction?.label}</AlertDialog.Heading>
              </AlertDialog.Header>
              <AlertDialog.Body>
                {pendingAction?.kind === 'cascade' && pendingAction.cascade ? (
                  pendingAction.cascade.confirmText({
                    appLabel: pendingAction.cascade.getKind({ context: currentContext }),
                    appName:
                      currentContext.domoObject.metadata?.parent?.name ||
                      `${pendingAction.cascade.getKind({ context: currentContext })} ${currentContext.domoObject.parentId}`,
                    parentId: currentContext.domoObject.parentId
                  })
                ) : (
                  <>
                    Are you sure you want to delete the{' '}
                    <span className='lowercase'>{typeName}</span>{' '}
                    <span className='font-bold'>
                      {objectName} (ID: {domoObject.id})
                    </span>
                    {resolveSuffix(config, currentContext) ? (
                      <span className='italic'> {resolveSuffix(config, currentContext)}</span>
                    ) : null}{' '}
                    permanently?
                    {deps?.totalCount > 0 && (
                      <div className='mt-2 text-xs text-muted'>
                        {deps.totalCount} dependenc{deps.totalCount === 1 ? 'y' : 'ies'} shown above
                        will be affected.
                      </div>
                    )}
                  </>
                )}
              </AlertDialog.Body>
              <AlertDialog.Footer>
                <Button isDisabled={isDeleting} size='sm' slot='close' variant='tertiary'>
                  Cancel
                </Button>
                <Button
                  isDisabled={isDeleting}
                  size='sm'
                  variant='danger'
                  onPress={() => performDelete(pendingAction)}
                >
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

function DependencySection({ deps, error, isLoading, onRetry, onStatusUpdate }) {
  if (isLoading) {
    return (
      <div className='flex shrink-0 items-center justify-center gap-2 py-3'>
        <Spinner size='sm' />
        <span className='text-xs text-muted'>Checking dependencies…</span>
      </div>
    );
  }

  if (error) {
    return (
      <Alert className='w-full shrink-0 bg-danger-soft' status='danger'>
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
      <Alert className='w-full shrink-0 bg-muted/20' status='default'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>
            Dependency check is not available for this object type. Verify dependencies manually
            before deleting.
          </Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (deps.totalCount === 0) {
    return (
      <Alert className='w-full shrink-0 bg-success-soft' status='success'>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Description>No dependencies found.</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  const items = deps.groups.map((group, idx) => {
    const countLabel = pluralizeForType(group.items[0]?.typeId, group.items.length);
    const children = group.items.map(
      (item) =>
        new DataListItem({
          id: item.id,
          label: item.label,
          typeId: item.typeId,
          url: item.url
        })
    );
    const groupItem = DataListItem.createGroup({
      children,
      id: `dep-group-${idx}`,
      label: group.label
    });
    if (countLabel) groupItem.countLabel = countLabel;
    return groupItem;
  });

  return (
    <div className='flex min-h-0 flex-1 flex-col overflow-hidden'>
      <DataList
        itemLabel='dependency'
        items={items}
        showActions={true}
        showCounts={true}
        variant='transparent'
        onStatusUpdate={onStatusUpdate}
      />
    </div>
  );
}

function pluralizeForType(typeId, count) {
  switch (typeId) {
    case 'CARD':
      return count === 1 ? 'card' : 'cards';
    case 'DATA_APP_VIEW':
    case 'PAGE':
      return count === 1 ? 'page' : 'pages';
    case 'DATA_SOURCE':
      return count === 1 ? 'dataset' : 'datasets';
    case 'DATAFLOW_TYPE':
      return count === 1 ? 'dataflow' : 'dataflows';
    default:
      return null;
  }
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
