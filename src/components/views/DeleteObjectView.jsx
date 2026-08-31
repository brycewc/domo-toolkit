import { AlertDialog, Button, Card, Spinner, Tooltip } from '@heroui/react';
import { useEffect, useRef, useState } from 'react';

import { Alert } from '@/components/Alert';
import { DisabledTooltip } from '@/components/DisabledTooltip';
import { useStatusBar } from '@/hooks/useStatusBar';
import { useViewReady } from '@/hooks/useViewReady';
import { DataListItem } from '@/models/DataListItem';
import { DomoContext } from '@/models/DomoContext';
import { DomoObject } from '@/models/DomoObject';
import { deleteDatastoreAndAllCollections } from '@/services/appDb';
import { deleteApprovalTemplate } from '@/services/approvals';
import { deleteCodeEnginePackageWithVersions } from '@/services/codeEngine';
import { deleteAppAndAllContent } from '@/services/customApps';
import { deleteDataflowAndOutputs, deleteDataflowWithInputsAndOutputs } from '@/services/dataflows';
import { deleteDataset } from '@/services/datasets';
import { deleteObject } from '@/services/deleteObject';
import { getDependenciesForDelete } from '@/services/dependencies';
import { deletePageAndAllCards } from '@/services/pages';
import { redirectTabIfViewingObject } from '@/utils/currentObject';
import { parseMarkdownBold } from '@/utils/markdown';
import { collectShareableObjects } from '@/utils/rowActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconSync from '@icons/sync.svg?react';
import IconTrash from '@icons/trash.svg?react';
import IconX from '@icons/x.svg?react';

import { AlertStatusIcon } from '../AlertStatusIcon';
import { DataList } from './DataList';

/**
 * Per-type delete behavior. Each entry declares the user-facing typeName, the
 * confirmation copy, the success/loading toast templates, and the actual
 * `run()` function. Optional `cascadeButtons` add secondary delete actions
 * (e.g. "Delete app and all cards" for a `DATA_APP_VIEW` page).
 *
 * An entry with `selectionGroupKey` turns that dependency group's rows into
 * checkboxes: the group's `deletableIds` start checked and are the only ones
 * that can be, and every other row carries its `unselectableReasons` entry on
 * the checkbox itself. The cascade reads the result through the `selection` set
 * its hooks receive, so what it deletes is whatever the user left checked.
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
  CODEENGINE_PACKAGE: {
    confirmSuffix: ' and every version it has',
    primaryLabel: 'Delete Package and All Versions',
    run: async ({ context }) => {
      const result = await deleteCodeEnginePackageWithVersions({
        packageId: context.domoObject.id,
        tabId: context.tabId
      });
      if (!result?.success) {
        if (result?.stage === 'versions') {
          const total = (result.versionsFailed || 0) + (result.versionsDeleted || 0);
          throw new Error(
            total > 0
              ? `Failed to delete ${result.versionsFailed} of ${total} deployed version${total !== 1 ? 's' : ''}. The package was not deleted.`
              : `Could not read the package's versions (HTTP ${result?.statusCode}). The package was not deleted.`
          );
        }
        throw new Error(
          `Deployed versions deleted, but the package could not be deleted (HTTP ${result?.statusCode}). Its remaining versions were left in place.`
        );
      }
      const origin = context.origin;
      await redirectTabIfViewingObject({
        ids: [context.domoObject.id],
        tabId: context.tabId,
        url: `${origin}/codeengine`
      });
      return result;
    },
    successMessage: ({ name }, result) =>
      result?.versionsDeleted > 0
        ? `**${name}** and its ${result.versionsDeleted} deployed version${result.versionsDeleted !== 1 ? 's' : ''} deleted`
        : `**${name}** deleted`,
    typeName: 'Code Engine Package'
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
          const result = await deleteAppAndAllContent({
            appId,
            cardIds: deps?.appSummary?.cardIds ?? null,
            currentPageId: context.domoObject.id,
            currentPageType: context.domoObject.typeId,
            tabId: context.tabId
          });
          // If the tab is still on anything the cascade just deleted, send it to
          // the matching App Studio list: worksheets have their own tab,
          // everything else lands on the main app-studio list. The app ID covers
          // every one of its pages, since they all carry it in their URL, and the
          // deleted card IDs cover a card opened on its own.
          const origin = context.origin;
          const listPath = context.domoObject.typeId === 'WORKSHEET_VIEW' ? '/app-studio/worksheets' : '/app-studio';
          await redirectTabIfViewingObject({
            ids: [appId, context.domoObject.id, ...(result.cardIds || [])],
            tabId: context.tabId,
            url: `${origin}${listPath}`
          });
          return result;
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
    cascadeButtons: [
      {
        available: ({ context }) => (context.domoObject.metadata?.details?.inputs?.length || 0) > 0,
        blockedReason: ({ blockingReason, eligibleCount, inputCount }) => {
          if (blockingReason) return blockingReason;
          if (inputCount === 0) {
            return 'This DataFlow reads only DataSets that other DataFlows or views produce, and deleting one of those would break whatever produces it.';
          }
          if (eligibleCount === 0) {
            return inputCount === 1
              ? 'The one connector input dataset is used elsewhere, so it cannot be deleted safely.'
              : `All ${inputCount} connector input datasets are used elsewhere, so none can be deleted safely.`;
          }
          return 'Check at least one input dataset to delete it with the DataFlow.';
        },
        buildContext: ({ context, deps, selection }) => {
          const inputItems = findDataflowInputs(deps);
          const eligibleIds = new Set((findDataflowInputGroup(deps)?.deletableIds || []).map(String));
          const selectedIds = [...(selection || [])].filter((id) => eligibleIds.has(String(id)));
          return {
            blocked: (deps?.blockingCount ?? 0) > 0,
            blockingReason: deps?.blockingReason || null,
            dataflowId: context.domoObject.id,
            dataflowName: context.domoObject.metadata?.name || context.domoObject.id,
            eligibleCount: eligibleIds.size,
            inputCount: inputItems.length,
            keptCount: inputItems.length - selectedIds.length,
            outputCount: context.domoObject.metadata?.details?.outputs?.length || 0,
            selectedIds
          };
        },
        confirmText: ({ dataflowId, dataflowName, keptCount, outputCount, selectedIds }) => {
          const outputPart =
            outputCount > 0 ? `, its **${outputCount} output dataset${outputCount !== 1 ? 's' : ''}**,` : '';
          const count = selectedIds.length;
          const kept =
            keptCount > 0 ? ` The other ${keptCount} input dataset${keptCount !== 1 ? 's are' : ' is'} left in place.` : '';
          return `Delete the dataflow **${dataflowName} (ID: ${dataflowId})**${outputPart} and the **${count} input dataset${count !== 1 ? 's' : ''} you selected** permanently? This cannot be undone.${kept}`;
        },
        isBlocked: ({ blocked, eligibleCount, selectedIds }) => blocked || eligibleCount === 0 || selectedIds.length === 0,
        label: ({ outputCount, selectedIds }) => {
          const count = selectedIds.length;
          const inputPart = count > 0 ? `${count} Selected Input${count !== 1 ? 's' : ''}` : 'Selected Inputs';
          return outputCount > 0 ? `Delete DataFlow, Outputs, and ${inputPart}` : `Delete DataFlow and ${inputPart}`;
        },
        loadingMessage: ({ dataflowName, outputCount }) =>
          outputCount > 0
            ? `Deleting **${dataflowName}**, its outputs, and the selected inputs…`
            : `Deleting **${dataflowName}** and the selected inputs…`,
        run: async ({ cascadeContext, context }) => {
          const result = await deleteDataflowWithInputsAndOutputs({
            dataflowId: context.domoObject.id,
            inputs: cascadeContext.selectedIds.map((id) => ({ dataSourceId: id })),
            outputs: context.domoObject.metadata?.details?.outputs || [],
            tabId: context.tabId
          });
          if (!result.success) {
            if (result.datasetsFailed > 0) {
              const total = result.datasetsFailed + result.datasetsDeleted;
              throw new Error(
                `Failed to delete ${result.datasetsFailed} of ${total} output dataset${total !== 1 ? 's' : ''}. Dataflow and input datasets were not deleted.`
              );
            }
            throw new Error(
              `Output datasets deleted, but dataflow deletion failed (HTTP ${result.statusCode}). Input datasets were left in place.`
            );
          }
          // The dataflow and its outputs are gone by here, so leftover inputs are
          // reported as a failure without undoing any of that: an input another
          // object still uses (or that a view is built on) simply stays.
          if (result.inputsFailed > 0) {
            const total = result.inputsFailed + result.inputsDeleted;
            throw new Error(
              `Dataflow and its output datasets deleted, but ${result.inputsFailed} of ${total} input dataset${total !== 1 ? 's' : ''} could not be deleted. They may still be in use by other content.`
            );
          }
          return result;
        },
        successMessage: ({ dataflowName }, result) =>
          `**${dataflowName}**, ${result.datasetsDeleted} output dataset${result.datasetsDeleted !== 1 ? 's' : ''}, and ${result.inputsDeleted} input dataset${result.inputsDeleted !== 1 ? 's' : ''} deleted`,
        tooltip: () => 'Also deletes the connector input datasets you checked, which nothing else uses'
      }
    ],
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
    selectionGroupKey: 'dataflowInputs',
    successMessage: ({ name, outputCount }) =>
      `**${name}** and ${outputCount} output dataset${outputCount !== 1 ? 's' : ''} deleted`,
    typeName: 'DataFlow'
  },
  MAGNUM_COLLECTION: {
    cascadeButtons: [
      {
        available: ({ context }) => !!context.domoObject?.parentId,
        buildContext: ({ context, deps }) => {
          const datastoreId = context.domoObject.parentId;
          // Sibling collections come from the dependency check; +1 counts this
          // collection, which the cascade also removes.
          const siblings = (deps?.groups || []).find((g) => g.key === 'siblingCollections')?.items || [];
          return {
            collectionCount: siblings.length + 1,
            datastoreId,
            datastoreName: context.domoObject.metadata?.parent?.name || `Datastore ${datastoreId}`
          };
        },
        confirmText: ({ collectionCount, datastoreId, datastoreName }) =>
          `Delete the datastore **${datastoreName} (ID: ${datastoreId})** and all **${collectionCount} collection${collectionCount !== 1 ? 's' : ''}** it contains permanently? This cannot be undone.`,
        label: () => 'Delete Datastore and All Collections',
        loadingMessage: ({ datastoreName }) => `Deleting **${datastoreName}** and all its collections…`,
        run: async ({ context, deps }) => {
          const result = await deleteDatastoreAndAllCollections({
            datastoreId: context.domoObject.parentId,
            tabId: context.tabId
          });
          if (!result.success) {
            if (result.collectionsFailed > 0) {
              const total = result.collectionsFailed + result.collectionsDeleted;
              throw new Error(
                `Failed to delete ${result.collectionsFailed} of ${total} collection${total !== 1 ? 's' : ''}. Datastore was not deleted.`
              );
            }
            throw new Error(`Collections deleted, but datastore deletion failed (HTTP ${result.statusCode}).`);
          }
          // If the tab is still on any of the now-deleted collections (this one or
          // a sibling in the same datastore), send it to the AppDB list.
          const siblingIds = ((deps?.groups || []).find((g) => g.key === 'siblingCollections')?.items || []).map(
            (item) => item.id
          );
          const origin = context.origin;
          await redirectTabIfViewingObject({
            ids: [context.domoObject.id, ...siblingIds],
            tabId: context.tabId,
            url: `${origin}/appDb`
          });
          return result;
        },
        successMessage: ({ datastoreName }, result) =>
          `**${datastoreName}** and ${result.collectionsDeleted} collection${result.collectionsDeleted !== 1 ? 's' : ''} deleted`,
        tooltip: () => 'Deletes the entire datastore and every collection in it, not just this collection'
      }
    ],
    confirmSuffix: '',
    primaryLabel: 'Delete Collection',
    run: async ({ context }) => {
      const result = await deleteObject({ object: context.domoObject, tabId: context.tabId });
      if (result.statusType !== 'success') {
        throw new Error(result.statusDescription || 'Delete failed');
      }
      // If the tab is still on the now-deleted collection's page, send it to the
      // AppDB list.
      const origin = context.origin;
      await redirectTabIfViewingObject({
        ids: [context.domoObject.id],
        tabId: context.tabId,
        url: `${origin}/appDb`
      });
      return result;
    },
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
      const origin = context.origin;
      await redirectTabIfViewingObject({
        ids: [context.domoObject.id],
        tabId: context.tabId,
        url: `${origin}/workflows`
      });
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
// The "Delete Page and Cards that Only Live Here" alternate action, shared by
// plain pages, app studio pages, and worksheet pages. It deletes the page and
// only the cards that appear on no other page, leaving shared cards in place, and
// honors the same child-page block as the primary delete (both remove just this
// one page).
const onlyHereCardsCascade = {
  available: ({ deps }) => (deps?.groups || []).some((g) => g.key === 'pageCards' && g.items.length > 0),
  blockedReason: ({ blockingReason }) => blockingReason || 'Resolve the blocking dependencies before deleting.',
  buildContext: ({ context, deps }) => {
    const isWorksheet = context.domoObject?.typeId === 'WORKSHEET_VIEW';
    return {
      blocked: (deps?.blockingCount ?? 0) > 0,
      blockingReason: deps?.blockingReason || null,
      onlyHereCount: deps?.onlyHereCardCount ?? null,
      pageId: context.domoObject.id,
      pageLabel: isWorksheet ? 'Worksheet Page' : 'Page',
      pageName: context.domoObject.metadata?.name || context.domoObject.id
    };
  },
  confirmText: ({ onlyHereCount, pageId, pageLabel, pageName }) => {
    const base = `Delete the ${pageLabel.toLowerCase()} **${pageName} (ID: ${pageId})**`;
    // No count yet (lookup pending or failed): describe the scope without a number.
    if (onlyHereCount == null) {
      return `${base} and only the cards that appear on no other page permanently? Cards also used on other pages are left in place.`;
    }
    // Every card is shared elsewhere: the delete removes just the page.
    if (onlyHereCount === 0) {
      return `${base} permanently? All of its cards also appear on other pages and will be left in place.`;
    }
    return `${base} and its **${onlyHereCount} card${onlyHereCount !== 1 ? 's' : ''}** that appear on no other page permanently? Cards also used on other pages are left in place.`;
  },
  isBlocked: ({ blocked }) => blocked,
  label: () => 'Delete Page and Cards that Only Live Here',
  loadingMessage: ({ pageName }) => `Deleting **${pageName}** and cards that only live here…`,
  run: ({ context }) => runPageDelete({ cardScope: 'onlyHere', context, parentAppId: context.domoObject.parentId }),
  successMessage: ({ pageName }, result) =>
    result.cardsDeleted === 0
      ? `**${pageName}** deleted; its cards live elsewhere and were left in place`
      : `**${pageName}** and ${result.cardsDeleted} card${result.cardsDeleted !== 1 ? 's' : ''} that only lived here deleted`,
  tooltip: () => 'Deletes only the cards that live on no other page, leaving shared cards in place'
};
// App studio and worksheet pages already share one cascade array; add the
// only-here action to all three page types. Prepending it via unshift mutates the
// shared array in place, so both app and worksheet views pick it up.
deletersByType.WORKSHEET_VIEW.cascadeButtons = deletersByType.DATA_APP_VIEW.cascadeButtons;
deletersByType.DATA_APP_VIEW.cascadeButtons.unshift(onlyHereCardsCascade);
deletersByType.PAGE.cascadeButtons = [onlyHereCardsCascade];
// Bricks and pro-code apps are both custom app designs deleted the same way, so
// the pro-code type reuses the brick's delete config.
deletersByType.RYUU_APP = deletersByType.APP;

export function DeleteObjectView({
  instance = null,
  isActive = true,
  liveContext = null,
  onBackToDefault = null,
  onStatusUpdate = null
}) {
  const [isLoading, setIsLoading] = useState(true);
  const holdContent = useViewReady(!isLoading);
  const [currentContext, setCurrentContext] = useState(null);
  const [config, setConfig] = useState(null);
  const [deps, setDeps] = useState(null);
  const [isLoadingDeps, setIsLoadingDeps] = useState(false);
  const [depsError, setDepsError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedInputIds, setSelectedInputIds] = useState(() => new Set());
  const mountedRef = useRef(true);
  const { showPromiseStatus } = useStatusBar();

  useEffect(() => {
    mountedRef.current = true;
    loadData();
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Seed the picker from the dependency check: every row that is safe to delete
  // starts checked. Re-seeding on each check means a refresh can't leave a
  // now-stale id selected.
  useEffect(() => {
    const scope = buildSelectionScope({ config, deps });
    setSelectedInputIds(scope ? new Set(scope.eligibleIds) : new Set());
  }, [config, deps]);

  const loadData = async () => {
    try {
      const data = await getSidepanelData(instance);
      if (!data || data.type !== 'deleteObject') {
        onBackToDefault?.();
        return;
      }
      const context = data.currentContext ? DomoContext.fromJSON(data.currentContext) : null;
      retargetVersionToPackage(context);
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
        object: context.domoObject,
        origin: context.origin,
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
    const cascadeCtx = isCascade
      ? cascade.buildContext({ context: currentContext, deps, selection: selectedInputIds })
      : null;

    const promise = isCascade
      ? Promise.resolve().then(() =>
          cascade.run({ cascadeContext: cascadeCtx, context: currentContext, deps, selection: selectedInputIds })
        )
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
          return config.successMessage(
            {
              name: objectName,
              outputCount: currentContext.domoObject.metadata?.details?.outputs?.length || 0
            },
            result
          );
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

  if (isLoading || holdContent) {
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
  // A failed dependency check means we can't tell what a delete would take down,
  // so block deleting until the user retries the check successfully.
  const hasDepsError = !!depsError;
  const outputCount = domoObject.metadata?.details?.outputs?.length || 0;
  const deletedCount = (deps?.groups || []).filter((g) => g.deleted).reduce((n, g) => n + g.items.length, 0);

  const primaryLabel =
    typeof config.primaryLabel === 'function' ? config.primaryLabel({ outputCount }) : config.primaryLabel;

  const availableCascades = (config.cascadeButtons || []).filter((c) => c.available({ context: currentContext, deps }));
  const primaryUnavailableReason = unavailableReason({
    blocked: isBlocked,
    blockedReason: () => deps?.blockingReason,
    hasDepsError,
    isLoadingDeps
  });

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
        label: 'Will Also Be Deleted'
      })
    );
  }
  if (otherGroups.length > 0) {
    dependencyItems.push(
      DataListItem.createGroup({
        children: buildDependencyItems(otherGroups, 'other-group', baseUrl),
        id: 'other-dependencies',
        label: 'Other Dependencies'
      })
    );
  }
  const expandedGroupIds = dependencyItems.map((item) => item.id);
  // Checkboxes on the one group a cascade delete can be narrowed to; every other
  // row keeps the blank leading spacer. Actions stay on, since deciding what to
  // delete often means opening a row first.
  const selectionScope = buildSelectionScope({ config, deps });
  const pickerAncestors = selectionScope ? collectPickerAncestors(dependencyItems, selectionScope) : new Map();
  // State holds picker rows only; an ancestor's checkbox is derived from whether
  // every selectable row under it is ticked, so the two can never disagree.
  const shownSelection = new Set(selectedInputIds);
  for (const [ancestorId, { eligible }] of pickerAncestors) {
    if (eligible.length > 0 && eligible.every((rowId) => selectedInputIds.has(rowId))) shownSelection.add(ancestorId);
  }
  const scopedSectionIds = collectScopedSectionIds(dependencyItems, pickerAncestors);
  const selectionProps = selectionScope
    ? {
        getUnselectableTooltip: (item) => {
          const id = String(item.id);
          if (selectionScope.reasons[id]) return selectionScope.reasons[id];
          return pickerAncestors.has(id) ? 'Nothing under here can be deleted with the DataFlow.' : null;
        },
        isInSelectionScope: (item) => scopedSectionIds.has(String(item.id)),
        isSelectable: (item) => {
          const id = String(item.id);
          return selectionScope.eligibleIds.has(id) || (pickerAncestors.get(id)?.eligible.length ?? 0) > 0;
        },
        onSelectionChange: (incoming) => {
          const next = new Set([...incoming].filter((id) => selectionScope.eligibleIds.has(id)));
          for (const [ancestorId, { eligible }] of pickerAncestors) {
            const wasTicked = shownSelection.has(ancestorId);
            const isTicked = incoming.has(ancestorId);
            if (isTicked && !wasTicked) eligible.forEach((rowId) => next.add(rowId));
            else if (!isTicked && wasTicked) eligible.forEach((rowId) => next.delete(rowId));
          }
          setSelectedInputIds(next);
        },
        selectedIds: shownSelection,
        selectionMode: true,
        showActionsInSelectionMode: true
      }
    : null;
  // Show the header "Share all" only when some dependency row is actually
  // shareable (DataList shares them itself via its per-type capabilities).
  const hasShareableDeps = collectShareableObjects(dependencyItems).length > 0;

  return (
    <>
      <DataList
        {...(selectionProps || {})}
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
              const ctx = cascade.buildContext({ context: currentContext, deps, selection: selectedInputIds });
              const cascadeLabel = cascade.label(ctx);
              const reason = unavailableReason({
                blocked: cascade.isBlocked?.(ctx) ?? false,
                blockedReason: () => cascade.blockedReason(ctx),
                hasDepsError,
                isLoadingDeps
              });
              // A reason to explain means the button has to stay hoverable, so it
              // goes through DisabledTooltip rather than `isDisabled`, which would
              // kill the very tooltip carrying the explanation.
              if (reason) {
                return (
                  <DisabledTooltip content={reason} key={idx}>
                    <Button fullWidth variant='danger-soft'>
                      <IconTrash />
                      {cascadeLabel}
                    </Button>
                  </DisabledTooltip>
                );
              }
              return (
                <Tooltip key={idx}>
                  <Button
                    fullWidth
                    isDisabled={isDeleting}
                    variant='danger-soft'
                    onPress={() =>
                      setPendingAction({
                        cascade,
                        kind: 'cascade',
                        label: cascadeLabel
                      })
                    }
                  >
                    <IconTrash />
                    {cascadeLabel}
                  </Button>
                  <Tooltip.Content className='max-w-60'>{cascade.tooltip(ctx)}</Tooltip.Content>
                </Tooltip>
              );
            })}
            {primaryUnavailableReason ? (
              <DisabledTooltip content={primaryUnavailableReason}>
                <Button fullWidth variant='danger'>
                  <IconTrash />
                  {primaryLabel}
                </Button>
              </DisabledTooltip>
            ) : (
              <Button
                fullWidth
                isDisabled={isDeleting}
                isPending={isDeleting}
                variant='danger'
                onPress={() => setPendingAction({ kind: 'primary', label: primaryLabel })}
              >
                <IconTrash />
                {primaryLabel}
              </Button>
            )}
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
                    pendingAction.cascade.confirmText(
                      pendingAction.cascade.buildContext({ context: currentContext, deps, selection: selectedInputIds })
                    )
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
                  Delete
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
      // Some items (e.g. another app page) carry their own objects to nest, such
      // as the cards on that page, so they render as an expandable row.
      const nestedChildren = item.children?.map(
        (child) =>
          new DataListItem({
            chip: child.chip ?? null,
            // A drill only resolves to a URL through the card it drills from, so
            // a child carrying a parentId passes it to its DomoObject.
            domoObject: baseUrl ? new DomoObject(child.typeId, child.id, baseUrl, {}, null, child.parentId ?? null) : null,
            id: child.id,
            label: child.label,
            muted: child.muted ?? false,
            typeId: child.typeId,
            url: child.url
          })
      );
      const dli = new DataListItem({
        annotation: item.annotation ?? null,
        children: nestedChildren,
        chip: item.chip ?? null,
        count: item.count,
        countLabel: item.countLabel,
        domoObject: baseUrl ? new DomoObject(item.typeId, item.id, baseUrl, {}, null, item.parentId ?? null) : null,
        id: item.id,
        label: item.label,
        muted: item.muted ?? false,
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
    // group's childTypeId; DataList uses it to decide the group's "all" actions,
    // and pass it as typeId too so the header shows that type's icon (e.g. a card
    // icon on "Cards on this page").
    const groupTypeId = group.items[0]?.typeId ?? null;
    const dliGroup = DataListItem.createGroup({
      annotation: group.annotation ?? null,
      children,
      childTypeId: groupTypeId,
      // Defaults to one per row; a group that counts its own rows differently
      // states it, so a list whose rows nest others can report both.
      count: group.count,
      id: `${idPrefix}-${idx}`,
      label: group.label,
      sortChildrenDescending: group.sortChildrenDescending ?? false,
      typeId: groupTypeId
    });
    if (group.countLabel) dliGroup.countLabel = group.countLabel;
    return dliGroup;
  });
}

// What the delete view's checkboxes cover, or null when this type has no
// picker: `allIds` is every row the picker spans, `eligibleIds` the subset a
// cascade delete may actually remove.
function buildSelectionScope({ config, deps }) {
  if (!config?.selectionGroupKey) return null;
  const group = (deps?.groups || []).find((g) => g.key === config.selectionGroupKey);
  if (!group || group.items.length === 0) return null;
  return {
    allIds: new Set(group.items.map((item) => String(item.id))),
    eligibleIds: new Set((group.deletableIds || []).map(String)),
    reasons: group.unselectableReasons || {}
  };
}

function collectPickerAncestors(items, scope) {
  const map = new Map();
  const walk = (item) => {
    const found = { all: [], eligible: [] };
    for (const child of item.children || []) {
      const childId = String(child.id);
      if (scope.allIds.has(childId)) {
        found.all.push(childId);
        if (scope.eligibleIds.has(childId)) found.eligible.push(childId);
      }
      const nested = walk(child);
      found.all.push(...nested.all);
      found.eligible.push(...nested.eligible);
    }
    if (found.all.length > 0) map.set(String(item.id), found);
    return found;
  };
  items.forEach(walk);
  return map;
}

/**
 * Every ancestor row that has picker rows under it, mapped to those rows: `all`
 * for the checkbox column to reach that far up the tree, `eligible` for what
 * ticking it actually selects. Lets a group header and the section above it act
 * as select-all for their part of the picker, so the column doesn't run out
 * halfway up.
 * @param {Array<DataListItem>} items - The rendered dependency tree
 * @param {{allIds: Set<string>, eligibleIds: Set<string>}} scope
 * @returns {Map<string, {all: string[], eligible: string[]}>}
 */
/**
 * Every id inside a top-level section that holds picker rows. Scoping the
 * checkbox column by section rather than by row keeps a group with no picker
 * rows of its own (Downstream DataSet Views, say) aligned with the group beside
 * it, while a section with none at all (Will Also Be Deleted) drops the column
 * and reads as a plain list.
 * @param {Array<DataListItem>} items - The rendered dependency tree
 * @param {Map<string, Object>} pickerAncestors - From `collectPickerAncestors`
 * @returns {Set<string>}
 */
function collectScopedSectionIds(items, pickerAncestors) {
  const scoped = new Set();
  const addAll = (item) => {
    scoped.add(String(item.id));
    (item.children || []).forEach(addAll);
  };
  for (const section of items) {
    if (pickerAncestors.has(String(section.id))) addAll(section);
  }
  return scoped;
}

function findDataflowInputGroup(deps) {
  return (deps?.groups || []).find((g) => g.key === 'dataflowInputs') || null;
}

// The dataflow's connector-backed input datasets, as listed by the dependency
// check. Inputs another dataflow or view produces are not among them, so this
// can be shorter than the dataflow's own input list.
function findDataflowInputs(deps) {
  return findDataflowInputGroup(deps)?.items || [];
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
      <Alert className='w-full' status='danger' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            Could not check dependencies
          </Alert.Title>
          <Alert.Description>{error}</Alert.Description>
          <Button fullWidth className='mt-2' size='sm' variant='secondary' onPress={onRetry}>
            <IconSync /> Retry
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  if (!deps) return null;

  if (!deps.supported) {
    return (
      <Alert className='w-full' status='accent' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            Dependency check not supported
          </Alert.Title>
          <Alert.Description>Verify dependencies manually before deleting</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (deps.totalCount === 0) {
    return (
      <Alert className='w-full' status='success' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            No dependencies found
          </Alert.Title>
        </Alert.Content>
      </Alert>
    );
  }

  if (isBlocked && deps.blockingReason) {
    return (
      <Alert className='w-full' status='warning' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            Delete blocked by dependencies
          </Alert.Title>
          <Alert.Description>{deps.blockingReason}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  if (deps.clearNote) {
    return (
      <Alert className='w-full' status='success' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            Nothing else depends on this
          </Alert.Title>
          <Alert.Description>{deps.clearNote}</Alert.Description>
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

/**
 * A Code Engine package version has no delete of its own, since Domo removes
 * every version with the package. Swapping the version for its parent package
 * here, before the config lookup, is what lets the rest of the view, the
 * dependency check, and the delete itself all speak in packages. Mutates the
 * freshly deserialized context this view owns; a no-op for every other type.
 * @param {DomoContext|null} context
 */
function retargetVersionToPackage(context) {
  const domoObject = context?.domoObject;
  if (domoObject?.typeId !== 'CODEENGINE_PACKAGE_VERSION' || !domoObject.parentId) return;
  const parent = domoObject.metadata?.parent;
  context.domoObject = new DomoObject('CODEENGINE_PACKAGE', domoObject.parentId, domoObject.baseUrl, {
    details: parent?.details ?? {},
    name: parent?.name || `Package ${domoObject.parentId}`
  });
}

async function runPageDelete({ cardScope = 'all', context, parentAppId = null }) {
  const result = await deletePageAndAllCards({
    appId: parentAppId ? parseInt(parentAppId) : null,
    cardScope,
    currentContext: context,
    pageId: parseInt(context.domoObject.id),
    pageType: context.domoObject.typeId,
    skipChildPageCheck: true,
    tabId: context.tabId
  });
  if (!result.success) {
    throw new Error(result.statusDescription || 'Failed to delete page');
  }
  // If the tab is still on the now-deleted page, or on one of the cards that went
  // with it, send it somewhere valid. This path deletes only the page, not its
  // app, so an app studio or worksheet page (the ones carrying a parentAppId)
  // returns to its still-existing app, where /app-studio/<appId> opens the app's
  // default page. A regular page has no parent app to fall back to, so it goes to
  // Domo's default page (-100000), which every instance resolves to the user's
  // Overview. The full-app cascade deletes handle their own redirect to the App
  // Studio list.
  //
  // The card IDs come from the delete itself rather than the dependency check, so
  // the "only live here" scope contributes just the cards it actually removed and
  // a card that left the page since the check is never counted as deleted.
  const origin = context.origin;
  const redirectUrl = parentAppId ? `${origin}/app-studio/${parentAppId}` : `${origin}/page/-100000`;
  await redirectTabIfViewingObject({
    ids: [context.domoObject.id, ...(result.cardIds || [])],
    tabId: context.tabId,
    url: redirectUrl
  });
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

/**
 * The persistent reason a delete button can't be pressed, or null when it can.
 * A delete already in flight is deliberately not one of these: it is transient
 * and needs no explanation, so it natively disables the button instead.
 * @param {Object} params
 * @param {boolean} params.blocked - Whether this button's own gate is closed
 * @param {Function} params.blockedReason - Lazily builds the `blocked` reason
 * @param {boolean} params.hasDepsError - Whether the dependency check failed
 * @param {boolean} params.isLoadingDeps - Whether the dependency check is running
 * @returns {string|null}
 */
function unavailableReason({ blocked, blockedReason, hasDepsError, isLoadingDeps }) {
  if (isLoadingDeps) return 'Checking dependencies…';
  if (hasDepsError) return 'Retry the dependency check before deleting.';
  if (blocked) return blockedReason() || 'Blocked by dependencies.';
  return null;
}
