import { AlertDialog, Button, Card, Disclosure, Separator, Spinner, Tooltip } from '@heroui/react';
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
import {
  getDependenciesForDelete,
  withExtraDependencyGroups,
  withInputJupyterWorkspaceUsage
} from '@/services/dependencies';
import { getJupyterWorkspacesForDatasets } from '@/services/jupyterWorkspaces';
import { deletePageAndAllCards } from '@/services/pages';
import { voidTaskCenterTask } from '@/services/taskCenter';
import { cancelWorkflowExecution } from '@/services/workflows';
import { redirectTabIfViewingObject, reloadTabIfViewingObject } from '@/utils/currentObject';
import { parseMarkdownBold } from '@/utils/markdown';
import { collectShareableObjects } from '@/utils/rowActions';
import { getSidepanelData } from '@/utils/sidepanel';
import IconCancel from '@icons/cancel.svg?react';
import IconChevronDown from '@icons/chevron-down.svg?react';
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
 *
 * An optional `caveat` is a standing note about what the dependency check can't
 * see for that type, shown above the list whatever the check turns up. It may be
 * a function of `{ checkResults, context, deps }` returning the note, or null to
 * drop it for this object. `caveatTitle` retitles it for a type whose note is a
 * consequence rather than a gap in the check.
 *
 * `onDemandChecks` declares lookups too expensive to run on open, each offered as
 * a prompt with a button instead. An entry needs a `key`, the `buttonLabel`,
 * `promptTitle` and `promptDescription` for the prompt, a `run({ context, deps })`
 * that resolves to the found items, and a `toGroups({ context, deps, items })`
 * returning dependency groups in the same shape a fetcher produces. A check's
 * groups fold into the loaded result once it finishes, so they list, count, and
 * block exactly like the automatic ones. An optional `amend({ context, deps,
 * items, result })` returns a whole amended result, for a finding that changes a
 * row the automatic check already produced rather than adding one of its own. An
 * optional `available({ context, deps })` withholds the prompt from an object the
 * check could never find anything for. `deps` throughout is the automatic result,
 * which is why the prompt's button waits for that to land.
 *
 * A type whose removal isn't a deletion overrides the view's verb with `feature`
 * (the header), `actionIcon` (header and buttons), `confirmActionLabel` (the
 * dialog's confirm button, which also supplies the verb in the failure toast),
 * `confirmText` (the dialog body, built from `{ id, name, typeName }` and
 * rendered through `parseMarkdownBold`), `dismissLabel` (the dialog's cancel
 * button), and `loadingMessage`.
 */

const alwaysUncheckedForDatasets = [
  'Workflows',
  'Code Engine Packages',
  'Workspaces',
  'Governance Toolkit Jobs',
  'Input DataSet Streams (e.g., DataSet Copy Connector)',
  'Domo Everywhere Publications',
  'Custom App Designs'
];

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
    cascadeButtons: undefined,
    confirmSuffix: ' and all its cards',
    primaryLabel: 'Delete Page and All Cards',
    run: ({ context }) => runPageDelete({ context, parentAppId: context.domoObject.parentId }),
    typeName: 'Page'
  },
  DATA_SOURCE: {
    caveat: datasetCaveat,
    confirmSuffix: '',
    onDemandChecks: [
      jupyterWorkspacesCheck({
        datasetsFor: ({ context }) => [{ id: context.domoObject.id, name: context.domoObject.metadata?.name }],
        groupLabel: () => 'Jupyter Workspaces'
      })
    ],
    primaryLabel: 'Delete DataSet',
    run: async ({ context }) => {
      await deleteDataset({ datasetId: context.domoObject.id, tabId: context.tabId });
      const origin = context.origin;
      await redirectTabIfViewingObject({
        ids: [context.domoObject.id],
        tabId: context.tabId,
        url: `${origin}/datacenter/datasources`
      });
      return { success: true };
    },
    typeName: 'DataSet'
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
                `Failed to delete ${result.datasetsFailed} of ${total} output dataset${total !== 1 ? 's' : ''}. DataFlow and input datasets were not deleted.`
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
              `DataFlow and its output datasets deleted, but ${result.inputsFailed} of ${total} input dataset${total !== 1 ? 's' : ''} could not be deleted. They may still be in use by other content.`
            );
          }
          await reloadTabIfViewingObject({
            ids: [context.domoObject.id],
            origin: context.origin,
            tabId: context.tabId
          });
          return result;
        },
        successMessage: ({ dataflowName }, result) =>
          `**${dataflowName}**, ${result.datasetsDeleted} output dataset${result.datasetsDeleted !== 1 ? 's' : ''}, and ${result.inputsDeleted} input dataset${result.inputsDeleted !== 1 ? 's' : ''} deleted`,
        tooltip: () => 'Also deletes the connector input datasets you checked, which nothing else uses'
      }
    ],
    caveat: datasetCaveat,
    confirmSuffix: ({ outputCount }) =>
      outputCount > 0 ? ` and ${outputCount} output dataset${outputCount !== 1 ? 's' : ''}` : '',
    onDemandChecks: [
      {
        ...jupyterWorkspacesCheck({
          // Searched alongside the outputs are the connector inputs the alternate
          // delete offers, which is the list the dependency check narrowed to.
          datasetsFor: ({ context, deps }) => [
            ...(context.domoObject.metadata?.details?.outputs || [])
              .filter((output) => output.dataSourceId)
              .map((output) => ({ id: output.dataSourceId, name: output.dataSourceName || output.dataSourceId })),
            ...findDataflowInputs(deps).map((input) => ({ id: input.id, name: input.label }))
          ],
          groupLabel: () => 'Jupyter Workspaces'
        }),
        available: ({ context, deps }) =>
          (context.domoObject.metadata?.details?.outputs?.length || 0) > 0 || findDataflowInputs(deps).length > 0
      }
    ],
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
            `Failed to delete ${result.datasetsFailed} of ${result.datasetsFailed + result.datasetsDeleted} output dataset${result.datasetsFailed + result.datasetsDeleted !== 1 ? 's' : ''}. DataFlow was not deleted.`
          );
        }
        throw new Error(`Output datasets deleted, but dataflow deletion failed (HTTP ${result.statusCode}).`);
      }
      // Domo keeps serving the dataflow's page, so a reload is what replaces it
      // with Domo's deleted-dataflow banner.
      await reloadTabIfViewingObject({
        ids: [context.domoObject.id],
        origin: context.origin,
        tabId: context.tabId
      });
      return result;
    },
    selectionGroupKey: 'dataflowInputs',
    successMessage: ({ name, outputCount }) =>
      `**${name}** and ${outputCount} output dataset${outputCount !== 1 ? 's' : ''} deleted`,
    typeName: 'DataFlow'
  },
  HOPPER_TASK: {
    actionIcon: <IconCancel />,
    cascadeButtons: [
      {
        available: ({ deps }) => !!findSourceExecution(deps),
        blockedReason: ({ executionStatus }) =>
          executionStatus === 'IN_PROGRESS'
            ? 'Resolve the blocking dependencies before voiding.'
            : `This Workflow execution is already ${(executionStatus || 'finished').toLowerCase().replace(/_/g, ' ')}, so there is nothing to cancel. Use Void Task instead.`,
        buildContext: ({ context, deps }) => {
          const group = findSourceExecution(deps);
          return {
            executionId: group?.items?.[0]?.id ?? null,
            executionLabel: group?.items?.[0]?.label ?? group?.items?.[0]?.id ?? 'the Workflow execution',
            executionStatus: group?.executionStatus ?? null,
            taskName: context.domoObject.metadata?.name || context.domoObject.id
          };
        },
        confirmText: ({ executionLabel, taskName }) =>
          `Cancel **${executionLabel}** and then void the task **${taskName}**? Cancelling stops the run instead of leaving it failed, and neither can be undone.`,
        isBlocked: ({ executionStatus }) => executionStatus !== 'IN_PROGRESS',
        label: () => 'Cancel Workflow and Void Task',
        loadingMessage: ({ taskName }) => `Cancelling the Workflow execution and voiding **${taskName}**…`,
        run: async ({ cascadeContext, context }) => {
          await cancelWorkflowExecution({ executionId: cascadeContext.executionId, tabId: context.tabId });
          // Cancelling terminates the run's elements, which makes Domo void this
          // task on its own, so the void below can find it already voided. That
          // is the outcome asked for, and the service reports it as success.
          let result;
          try {
            result = await voidTaskCenterTask({
              queueId: context.domoObject.parentId,
              tabId: context.tabId,
              taskId: context.domoObject.id,
              userId: context.user?.id
            });
          } catch (error) {
            throw new Error(
              `The Workflow execution was cancelled, but the task could not be voided (${error.message}). Void it on its own.`,
              { cause: error }
            );
          }
          await chrome.tabs.reload(context.tabId);
          return result;
        },
        successMessage: ({ taskName }, result) => {
          const base = result?.alreadyVoided
            ? `Workflow execution cancelled, which voided **${taskName}**`
            : `Workflow execution cancelled and **${taskName}** voided`;
          return result?.permissionRevertError
            ? `${base}, but the Void Tasks permission granted to do it could not be removed again`
            : base;
        },
        tooltip: () => 'Stops the Workflow run instead of leaving it failed, then voids the task'
      }
    ],
    // A task reports `ODYSSEY` only when a Workflow created it, and `UNKNOWN`
    // otherwise, so a missing status is the one case worth warning about anyway.
    caveat: ({ context }) => {
      const details = context.domoObject.metadata?.details;
      const base = 'A voided task stays in its queue and can never be reopened or completed.';
      if (details && details.sourceSystem !== 'ODYSSEY') return base;
      return `${base} Voiding this one also fails the Workflow execution that created it, and any Workflow waiting on that one as a subflow fails with it.`;
    },
    caveatTitle: 'Voiding Cannot Be Undone',
    confirmActionLabel: 'Void',
    confirmSuffix: '',
    confirmText: ({ id, name }) =>
      `Void the task **${name} (ID: ${id})**? It stays in its queue marked Voided and can no longer be completed.`,
    // "Cancel" would read as cancelling the Workflow next to the cascade action.
    dismissLabel: 'Go Back',
    feature: 'Void',
    loadingMessage: ({ name }) => `Voiding **${name}**…`,
    primaryLabel: 'Void Task',
    run: async ({ context }) => {
      const result = await voidTaskCenterTask({
        queueId: context.domoObject.parentId,
        tabId: context.tabId,
        taskId: context.domoObject.id,
        userId: context.user?.id
      });
      // The task keeps its page, so there is nothing to redirect away from; a
      // reload is what re-renders an open task drawer as voided.
      await chrome.tabs.reload(context.tabId);
      return result;
    },
    successMessage: ({ name }, result) =>
      result?.permissionRevertError
        ? `**${name}** voided, but the Void Tasks permission granted to do it could not be removed again`
        : `**${name}** voided`,
    typeName: 'Task'
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
    run: async ({ context }) => {
      const result = await deleteObject({ object: context.domoObject, tabId: context.tabId });
      if (result.statusType !== 'success') {
        throw new Error(result.statusDescription || 'Delete failed');
      }
      const origin = context.origin;
      await redirectTabIfViewingObject({
        ids: [context.domoObject.id],
        tabId: context.tabId,
        url: `${origin}/scheduled-reports`
      });
      return result;
    },
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
    run: async ({ context }) => {
      const result = await deleteObject({ object: context.domoObject, tabId: context.tabId });
      if (result.statusType !== 'success') {
        throw new Error(result.statusDescription || 'Delete failed');
      }
      const origin = context.origin;
      await redirectTabIfViewingObject({
        ids: [context.domoObject.id],
        tabId: context.tabId,
        url: `${origin}/approval/request-forms`
      });
      return result;
    },
    typeName: 'Template'
  },
  VARIABLE: {
    confirmSuffix: '',
    primaryLabel: 'Delete Variable',
    run: ({ context }) => deleteObject({ object: context.domoObject, tabId: context.tabId }),
    typeName: 'Variable'
  },
  WORKFLOW_MODEL: {
    caveat:
      'This check lists what the workflow uses, read from its active versions. It does not show what uses this workflow (triggers, Alerts, Approvals, App Studio forms, or other Workflows that call it as a subflow), and it cannot resolve an object the workflow picks at run time from a variable. Verify those manually before deleting.',
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
// App studio and worksheet pages offer the same three alternates, ordered by how
// much they take: this page's exclusive cards, the app minus anything shared
// outside it, then the app and every card on it.
deletersByType.DATA_APP_VIEW.cascadeButtons = [
  onlyHereCardsCascade,
  buildAppCascade({ cardScope: 'onlyHere' }),
  buildAppCascade({ cardScope: 'all' })
];
deletersByType.WORKSHEET_VIEW.cascadeButtons = deletersByType.DATA_APP_VIEW.cascadeButtons;
deletersByType.PAGE.cascadeButtons = [onlyHereCardsCascade];
// Bricks and pro-code apps are both custom app designs deleted the same way, so
// the pro-code type reuses the brick's delete config.
deletersByType.RYUU_APP = deletersByType.APP;
deletersByType.DATA_FUSION = deletersByType.DATA_SOURCE;
deletersByType.DATA_MODEL = deletersByType.DATA_SOURCE;
deletersByType.VIEW = deletersByType.DATA_SOURCE;

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
  const [autoDeps, setAutoDeps] = useState(null);
  // Per opt-in check: `{ error, groups, status }`. A key absent from here is a
  // check the user hasn't run, which is what the prompt offers.
  const [checkResults, setCheckResults] = useState({});
  const [depsSeed, setDepsSeed] = useState(null);
  const [isLoadingDeps, setIsLoadingDeps] = useState(false);
  const [depsError, setDepsError] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [selectedInputIds, setSelectedInputIds] = useState(() => new Set());
  const mountedRef = useRef(true);
  const depsRequestRef = useRef(0);
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
  // now-stale id selected. Seeded from the first pass only, so the slower counts
  // folding in later can't wipe out what the user has ticked since.
  useEffect(() => {
    const scope = buildSelectionScope({ config, deps: depsSeed });
    setSelectedInputIds(scope ? new Set(scope.eligibleIds) : new Set());
  }, [config, depsSeed]);

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
    const requestId = ++depsRequestRef.current;
    const isCurrent = () => mountedRef.current && requestId === depsRequestRef.current;
    setIsLoadingDeps(true);
    setDepsError(null);
    try {
      const result = await getDependenciesForDelete({
        object: context.domoObject,
        origin: context.origin,
        tabId: context.tabId
      });
      if (isCurrent()) {
        setAutoDeps(result);
        setDepsSeed(result);
      }
      // A count too slow to hold the list behind (a dataflow output's downstream
      // impact) lands here, so the rows gain their badges once it arrives.
      result.deferred
        ?.then((updated) => {
          if (isCurrent()) setAutoDeps(updated);
        })
        .catch((error) => console.error('[DeleteObjectView] Error loading deferred dependencies:', error));
    } catch (error) {
      console.error('[DeleteObjectView] Error loading dependencies:', error);
      if (isCurrent()) {
        setDepsError(error.message || 'Failed to check dependencies');
      }
    } finally {
      if (isCurrent()) setIsLoadingDeps(false);
    }
  };

  // What the check found is kept raw rather than as finished groups: the
  // automatic result it folds into keeps changing (the deferred pass lands, a
  // refresh replaces it), and the groups have to be rebuilt against the latest.
  const runCheck = async (check) => {
    if (!currentContext) return;
    setCheckResults((prev) => ({ ...prev, [check.key]: { error: null, items: [], status: 'loading' } }));
    try {
      const items = await check.run({ context: currentContext, deps: autoDeps });
      if (!mountedRef.current) return;
      setCheckResults((prev) => ({ ...prev, [check.key]: { error: null, items, status: 'loaded' } }));
    } catch (error) {
      console.error(`[DeleteObjectView] Error running the ${check.key} check:`, error);
      if (!mountedRef.current) return;
      setCheckResults((prev) => ({
        ...prev,
        [check.key]: { error: error.message || 'The check failed', items: [], status: 'error' }
      }));
    }
  };

  const handleRefresh = async () => {
    if (!currentContext) return;
    setIsRefreshing(true);
    try {
      // A check the user never ran stays unrun; refreshing is not the moment to
      // start an expensive search they declined.
      const started = onDemandChecks.filter((check) => checkResults[check.key]);
      await Promise.all([loadDependencies(currentContext), ...started.map((check) => runCheck(check))]);
    } finally {
      if (mountedRef.current) setIsRefreshing(false);
    }
  };

  const onDemandChecks = (config?.onDemandChecks || []).filter(
    (check) => !check.available || (currentContext && check.available({ context: currentContext, deps: autoDeps }))
  );
  // What a finished opt-in check found joins the automatic result, so its groups
  // list, count, and block the same way every other group does. A check may also
  // `amend` the groups already there, for a finding that changes a row the
  // automatic check produced rather than adding one of its own.
  const deps = onDemandChecks.reduce((merged, check) => {
    const result = checkResults[check.key];
    if (result?.status !== 'loaded') return merged;
    const params = { context: currentContext, deps: autoDeps, items: result.items };
    const withGroups = withExtraDependencyGroups(merged, check.toGroups(params));
    return check.amend ? check.amend({ ...params, result: withGroups }) : withGroups;
  }, autoDeps);
  const runningCheck = onDemandChecks.find((check) => checkResults[check.key]?.status === 'loading') ?? null;

  const performDelete = (action) => {
    if (!config || !currentContext) return;
    setIsDeleting(true);

    const objectName = currentContext.domoObject.metadata?.name || currentContext.domoObject.id;
    const isCascade = !!action.cascade;
    const cascade = isCascade ? action.cascade : null;
    const cascadeCtx = isCascade
      ? cascade.buildContext({ context: currentContext, deps, selection: selectedInputIds })
      : null;

    const verb = (config.confirmActionLabel ?? 'Delete').toLowerCase();

    const promise = Promise.resolve()
      .then(() =>
        isCascade
          ? cascade.run({ cascadeContext: cascadeCtx, context: currentContext, deps, selection: selectedInputIds })
          : config.run({ context: currentContext })
      )
      .then((result) => {
        // Some services report a refusal in their result instead of throwing,
        // which would otherwise read as a success toast and close the view.
        if (result?.success === false) {
          throw new Error(result.statusDescription || `Failed to ${verb} **${objectName}**`);
        }
        return result;
      });

    showPromiseStatus(promise, {
      error: (err) => ({
        description: err.message || `Failed to ${verb} **${objectName}**`,
        title: 'Error'
      }),
      loading: isCascade
        ? cascade.loadingMessage(cascadeCtx)
        : (config.loadingMessage?.({ name: objectName }) ??
          `Deleting **${objectName}**${resolveSuffix(config, currentContext)}…`),
      success: (result) => ({
        description: resolveSuccessDescription({
          cascade,
          cascadeCtx,
          config,
          currentContext,
          isCascade,
          objectName,
          result
        }),
        title: 'Success'
      })
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
  const actionIcon = config.actionIcon ?? <IconTrash />;

  const availableCascades = (config.cascadeButtons || []).filter((c) => c.available({ context: currentContext, deps }));
  const primaryUnavailableReason = unavailableReason({
    blocked: isBlocked,
    blockedReason: () => deps?.blockingReason,
    hasDepsError,
    isLoadingDeps,
    runningCheckLabel: runningCheck?.buttonLabel ?? null
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
        label: 'Will Also Be Deleted',
        sortWeight: 0
      })
    );
  }
  if (otherGroups.length > 0) {
    dependencyItems.push(
      DataListItem.createGroup({
        // Something true of every group in this section belongs here rather than
        // repeated as an identical note on each one.
        annotation: deps?.otherNote ?? null,
        children: buildDependencyItems(otherGroups, 'other-group', baseUrl),
        id: 'other-dependencies',
        label: 'Other Dependencies',
        sortWeight: 1
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
  // A row an opt-in check has since ruled out stays in state but is no longer
  // shown ticked, so its disabled checkbox can't read as still selected.
  const shownSelection = new Set([...selectedInputIds].filter((id) => selectionScope?.eligibleIds.has(id)));
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

  const dependencyBanner = renderDependencyBanner({
    deps,
    error: depsError,
    isBlocked,
    isLoading: isLoadingDeps,
    onRetry: () => loadDependencies(currentContext),
    unrunCheckLabels: onDemandChecks
      .filter((check) => !checkResults[check.key])
      .map((check) => check.buttonLabel.replace(/^Check /, ''))
  });
  const caveatText =
    typeof config.caveat === 'function' ? config.caveat({ checkResults, context: currentContext, deps }) : config.caveat;
  const caveatAlert = caveatText ? (
    <Alert className='w-full' status='accent' variant='transparent'>
      <Alert.Content>
        <Alert.Title className='flex items-center gap-1'>
          <AlertStatusIcon />
          {config.caveatTitle ?? 'Some Usage Is Not Checked'}
        </Alert.Title>
        <Alert.Description>{caveatText}</Alert.Description>
      </Alert.Content>
    </Alert>
  ) : null;
  const checkBanners = onDemandChecks
    .map((check) => ({
      isRunning: checkResults[check.key]?.status === 'loading',
      node: renderCheckBanner({
        check,
        // A check can search what the automatic one turned up, so starting it
        // early would search an incomplete list and report a clean result.
        isWaitingForDeps: isLoadingDeps || !autoDeps,
        onRun: () => runCheck(check),
        result: checkResults[check.key]
      })
    }))
    .filter((entry) => entry.node);
  // A check still running is progress, not a notice, so its spinner stays out of
  // the collapsible block; otherwise collapsing it would hide the only sign the
  // view is still working.
  const runningBanners = checkBanners.filter((entry) => entry.isRunning).map((entry) => entry.node);
  const checkNotices = checkBanners.filter((entry) => !entry.isRunning).map((entry) => entry.node);
  const depNotice = isLoadingDeps ? null : dependencyBanner;
  const noticeCount = (caveatAlert ? 1 : 0) + checkNotices.length + (depNotice ? 1 : 0);
  // The caveat is a standing note for the type, so it sits above the dependency
  // banner, which comes and goes as the check runs. The other way round, the
  // caveat slides down and back up as the spinner is replaced. An opt-in check's
  // prompt stands until pressed, so it goes with the caveat rather than below.
  const banner =
    noticeCount > 0 || runningBanners.length > 0 || isLoadingDeps ? (
      <div className='flex w-full flex-col gap-2'>
        {runningBanners}
        {isLoadingDeps ? dependencyBanner : null}
        {noticeCount > 0 ? (
          // The row lines up with the dependency groups below only if it carries
          // no spacing of its own, so `-mt-2` cancels the banner slot's top
          // padding whenever nothing sits above it.
          <div className={`flex flex-col ${runningBanners.length > 0 || isLoadingDeps ? '' : '-mt-2'}`}>
            <Disclosure defaultExpanded className='space-0 w-full' id='delete-warnings'>
              <Disclosure.Heading className='my-1 flex min-h-9 w-full flex-row items-center justify-between gap-2'>
                <Disclosure.Trigger
                  aria-label='Toggle'
                  className='flex w-full min-w-0 flex-1 flex-row items-center gap-2 self-stretch'
                  variant='tertiary'
                >
                  <p className='min-w-0 truncate text-sm font-medium'>Warnings</p>
                  <span aria-hidden='true' className='flex-1' />
                  <Disclosure.Indicator>
                    <IconChevronDown />
                  </Disclosure.Indicator>
                </Disclosure.Trigger>
              </Disclosure.Heading>
              <Disclosure.Content>
                <Disclosure.Body>
                  {/* `pb-1` rides inside the collapsing panel, so the gap above the
                      separator disappears with the rest of the content when closed. */}
                  <div className='flex flex-col gap-2 pb-2'>
                    {caveatAlert}
                    {checkNotices}
                    {depNotice}
                  </div>
                </Disclosure.Body>
              </Disclosure.Content>
            </Disclosure>
            <Separator />
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <>
      <DataList
        {...(selectionProps || {})}
        allowsMultipleExpanded
        fillHeight
        banner={banner}
        currentContext={liveContext}
        defaultExpandedIds={expandedGroupIds}
        feature={config.feature ?? 'Delete'}
        featureIcon={actionIcon}
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
        footer={
          <div className='flex flex-col gap-2'>
            {availableCascades.map((cascade, idx) => {
              const ctx = cascade.buildContext({ context: currentContext, deps, selection: selectedInputIds });
              const cascadeLabel = cascade.label(ctx);
              const reason = unavailableReason({
                blocked: cascade.isBlocked?.(ctx) ?? false,
                blockedReason: () => cascade.blockedReason(ctx),
                hasDepsError,
                isLoadingDeps,
                runningCheckLabel: runningCheck?.buttonLabel ?? null
              });
              // A reason to explain means the button has to stay hoverable, so it
              // goes through DisabledTooltip rather than `isDisabled`, which would
              // kill the very tooltip carrying the explanation.
              if (reason) {
                return (
                  <DisabledTooltip content={reason} key={idx}>
                    <Button fullWidth variant='danger-soft'>
                      {actionIcon}
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
                    {actionIcon}
                    {cascadeLabel}
                  </Button>
                  <Tooltip.Content className='max-w-60'>{cascade.tooltip(ctx)}</Tooltip.Content>
                </Tooltip>
              );
            })}
            {primaryUnavailableReason ? (
              <DisabledTooltip content={primaryUnavailableReason}>
                <Button fullWidth variant='danger'>
                  {actionIcon}
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
                {actionIcon}
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
                    {config.confirmText ? (
                      parseMarkdownBold(config.confirmText({ id: domoObject.id, name: objectName, typeName }))
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
                      </>
                    )}
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
                  {config.dismissLabel ?? 'Cancel'}
                </Button>
                <Button isDisabled={isDeleting} size='sm' variant='danger' onPress={() => performDelete(pendingAction)}>
                  {config.confirmActionLabel ?? 'Delete'}
                </Button>
              </AlertDialog.Footer>
            </AlertDialog.Dialog>
          </AlertDialog.Container>
        </AlertDialog.Backdrop>
      </AlertDialog>
    </>
  );
}

/**
 * The whole-app alternate delete, in its two scopes: every card in the app, or
 * only the ones appearing on no page outside it.
 * @param {{cardScope: 'all'|'onlyHere'}} params
 * @returns {Object} A cascade button config
 */
function buildAppCascade({ cardScope }) {
  const isOnlyHere = cardScope === 'onlyHere';
  return {
    available: ({ context }) => !!context.domoObject?.parentId,
    buildContext: ({ context, deps }) => {
      const appLabel = context.domoObject?.typeId === 'WORKSHEET_VIEW' ? 'Worksheet' : 'App';
      return {
        appLabel,
        appName: context.domoObject.metadata?.parent?.name || `${appLabel} ${context.domoObject.parentId}`,
        appOnlyCount: deps?.appOnlyCardCount ?? null,
        cardCount: deps?.appSummary?.cardCount ?? null,
        pageCount: deps?.appSummary?.pageCount ?? null,
        parentId: context.domoObject.parentId
      };
    },
    confirmText: ({ appLabel, appName, appOnlyCount, cardCount, pageCount, parentId }) => {
      const pages = pageCount != null ? ` (${pageCount})` : '';
      const base = `Delete entire ${appLabel.toLowerCase()} **${appName} (ID: ${parentId})**`;
      if (!isOnlyHere) {
        const cards = cardCount != null ? ` (${cardCount})` : '';
        return `${base}, all its pages${pages}, and all cards on those pages${cards} permanently?`;
      }
      const shared = ' Cards that also appear outside it are left in place.';
      // No count yet (lookup pending or failed): describe the scope without a number.
      if (appOnlyCount == null) {
        return `${base}, all its pages${pages}, and only the cards that appear on no page outside it permanently?${shared}`;
      }
      // Every card is shared outside the app: the delete removes just the app.
      if (appOnlyCount === 0) {
        return `${base} and all its pages${pages} permanently? Every one of its cards also appears outside it and will be left in place.`;
      }
      return `${base}, all its pages${pages}, and its **${appOnlyCount} card${appOnlyCount !== 1 ? 's' : ''}** that appear on no page outside it permanently?${shared}`;
    },
    label: ({ appLabel }) => `Delete ${appLabel} and All Cards${isOnlyHere ? ' that Only Live Here' : ''}`,
    loadingMessage: ({ appName }) =>
      isOnlyHere
        ? `Deleting **${appName}** and the cards that only live in it…`
        : `Deleting **${appName}** and all its cards…`,
    run: async ({ context, deps }) => {
      const appId = context.domoObject.parentId;
      const result = await deleteAppAndAllContent({
        appId,
        cardIds: deps?.appSummary?.cardIds ?? null,
        cardScope,
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
    successMessage: ({ appName }, result) => {
      if (!isOnlyHere) {
        return `**${appName}** and ${result.cardCount} card${result.cardCount !== 1 ? 's' : ''} deleted`;
      }
      return result.cardCount === 0
        ? `**${appName}** deleted; its cards appear outside it and were left in place`
        : `**${appName}** and ${result.cardCount} card${result.cardCount !== 1 ? 's' : ''} that only lived in it deleted`;
    },
    tooltip: ({ appLabel }) =>
      isOnlyHere
        ? `Deletes the entire ${appLabel.toLowerCase()}, leaving cards that also appear outside it in place`
        : `Deletes the entire ${appLabel.toLowerCase()} instead of just this page`
  };
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
// cascade delete may actually remove. A group where nothing is eligible drops
// the column entirely rather than showing a row of disabled checkboxes; the
// cascade button stays visible and disabled, so the feature is still findable.
function buildSelectionScope({ config, deps }) {
  if (!config?.selectionGroupKey) return null;
  const group = (deps?.groups || []).find((g) => g.key === config.selectionGroupKey);
  if (!group || group.items.length === 0) return null;
  const eligibleIds = new Set((group.deletableIds || []).map(String));
  if (eligibleIds.size === 0) return null;
  return {
    allIds: new Set(group.items.map((item) => String(item.id))),
    eligibleIds,
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

// Jupyter Workspaces drop off the list once the opt-in check has found them, so
// the note never claims they went unchecked right above the ones it turned up.
function datasetCaveat({ checkResults }) {
  const areas =
    checkResults?.jupyterWorkspaces?.status === 'loaded'
      ? alwaysUncheckedForDatasets
      : ['Jupyter Workspaces', ...alwaysUncheckedForDatasets];
  return `This check does not cover ${areas.slice(0, -1).join(', ')}, or ${areas.at(-1)}. Verify those manually before deleting.`;
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

function findSourceExecution(deps) {
  return deps?.groups?.find((g) => g.key === 'sourceExecution') || null;
}

// A workspace reading the DataSet loses an input; one writing it loses its
// destination, so the row says which (or both) rather than just naming it.
function jupyterUsageChip({ inputAliases, outputAliases }) {
  const reads = (inputAliases?.length ?? 0) > 0;
  const writes = (outputAliases?.length ?? 0) > 0;
  if (reads && writes) return { color: 'warning', label: 'Reads and Writes' };
  if (writes) return { color: 'warning', label: 'Writes' };
  return { color: 'default', label: 'Reads' };
}

/**
 * The opt-in Jupyter Workspace search, over whichever DataSets the delete takes
 * down: the object itself for a DataSet, every output for a DataFlow.
 * @param {Object} params
 * @param {Function} params.datasetsFor - `(context) => [{id, name}]`, the DataSets to search for
 * @param {Function} params.groupLabel - `(datasets) => string`, the found group's heading
 * @returns {Object} An `onDemandChecks` entry
 */
function jupyterWorkspacesCheck({ datasetsFor, groupLabel }) {
  return {
    // A Jupyter Workspace using an input dataset is one more thing that breaks
    // if the alternate delete takes it, so it counts against that input exactly
    // as a card or dataflow using it does. A type with no input rows is untouched.
    amend: ({ items, result }) => {
      const jupyterWorkspaceCounts = {};
      for (const workspace of items) {
        for (const datasetId of workspace.datasetIds) {
          jupyterWorkspaceCounts[String(datasetId)] = (jupyterWorkspaceCounts[String(datasetId)] || 0) + 1;
        }
      }
      return withInputJupyterWorkspaceUsage(result, jupyterWorkspaceCounts);
    },
    buttonLabel: 'Check Jupyter Workspaces',
    key: 'jupyterWorkspaces',
    promptDescription: 'Finding them means reading every Jupyter Workspace in the instance, so it only runs when you ask.',
    promptTitle: "Jupyter Workspaces Aren't Searched Automatically",
    run: ({ context, deps }) =>
      getJupyterWorkspacesForDatasets(
        datasetsFor({ context, deps }).map((dataset) => dataset.id),
        context.tabId
      ),
    toGroups: ({ context, deps, items }) => {
      const datasets = datasetsFor({ context, deps });
      const nameById = new Map(datasets.map((dataset) => [String(dataset.id), dataset.name]));
      return [
        {
          annotation: 'Only Jupyter Workspaces you have access to are listed.',
          blocking: false,
          deleted: false,
          items: items.map((workspace) => ({
            // Which DataSet a workspace uses only needs saying when the delete
            // takes down more than one, so a DataSet's own rows stay unannotated.
            annotation:
              datasets.length > 1
                ? `Uses ${workspace.datasetIds.map((id) => nameById.get(String(id)) || id).join(', ')}`
                : null,
            chip: jupyterUsageChip(workspace),
            id: workspace.id,
            label: workspace.name || `Jupyter Workspace ${workspace.id}`,
            typeId: 'DATA_SCIENCE_NOTEBOOK',
            url: `${context.origin}/jupyter-workspaces/${workspace.id}`
          })),
          key: 'jupyterWorkspaces',
          label: groupLabel(datasets)
        }
      ];
    }
  };
}

/**
 * One opt-in check's banner: the offer to run it, a spinner while it runs, or
 * its failure with a retry. Returns null once it has finished, since its groups
 * are then in the list itself.
 * @param {Object} params
 * @param {Object} params.check - The `onDemandChecks` entry
 * @param {boolean} params.isWaitingForDeps - Whether the automatic check is still running
 * @param {Function} params.onRun - Starts the check
 * @param {{error: string|null, status: string}} [params.result] - Its state, absent until first run
 * @returns {JSX.Element|null}
 */
function renderCheckBanner({ check, isWaitingForDeps, onRun, result }) {
  if (result?.status === 'loaded') return null;

  if (result?.status === 'loading') {
    return (
      <div className='flex items-center justify-center gap-2 py-3' key={check.key}>
        <Spinner size='sm' />
        <span className='text-xs text-muted'>{check.buttonLabel.replace(/^Check /, 'Searching ')}…</span>
      </div>
    );
  }

  if (result?.status === 'error') {
    return (
      <Alert className='w-full' key={check.key} status='danger' variant='transparent'>
        <Alert.Content>
          <Alert.Title className='flex items-center gap-1'>
            <AlertStatusIcon />
            {check.buttonLabel.replace(/^Check /, 'Could Not Check ')}
          </Alert.Title>
          <Alert.Description>{result.error}</Alert.Description>
          <Button fullWidth className='mt-2' size='sm' variant='secondary' onPress={onRun}>
            <IconSync /> Retry
          </Button>
        </Alert.Content>
      </Alert>
    );
  }

  return (
    <Alert className='w-full' key={check.key} status='accent' variant='transparent'>
      <Alert.Content>
        <Alert.Title className='flex items-center gap-1'>
          <AlertStatusIcon />
          {check.promptTitle}
        </Alert.Title>
        <Alert.Description>{check.promptDescription}</Alert.Description>
        <Button fullWidth className='mt-2' isDisabled={isWaitingForDeps} size='sm' variant='secondary' onPress={onRun}>
          <IconSync />
          {check.buttonLabel}
        </Button>
      </Alert.Content>
    </Alert>
  );
}

// The dependency-check status shown above the affected-objects list: a loading
// spinner, an error with retry, a "not supported" or "none found" notice, or a
// blocking warning when something prevents the delete. Returns null once a
// normal set of dependencies has loaded (the list itself carries it then), so
// the consumer can pass the result straight to DataList's `banner` slot.
function renderDependencyBanner({ deps, error, isBlocked, isLoading, onRetry, unrunCheckLabels = [] }) {
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
            Could Not Check Dependencies
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
            Dependency Check Not Supported
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
            No Dependencies Found
          </Alert.Title>
          {/* An all-clear would otherwise read as covering the search the user hasn't run. */}
          {unrunCheckLabels.length > 0 && (
            <Alert.Description>{`${unrunCheckLabels.join(' and ')} not searched`}</Alert.Description>
          )}
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
            Delete Blocked by Dependencies
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
            Nothing Else Depends on This
          </Alert.Title>
          <Alert.Description>{deps.clearNote}</Alert.Description>
        </Alert.Content>
      </Alert>
    );
  }

  return null;
}

function resolveSuccessDescription({ cascade, cascadeCtx, config, currentContext, isCascade, objectName, result }) {
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
  const templateId = context.domoObject.id;
  await deleteApprovalTemplate({ tabId: context.tabId, templateId });
  let datasetError = null;
  try {
    await deleteDataset({ datasetId, tabId: context.tabId });
  } catch (err) {
    datasetError = err;
  }
  // The template is gone even when the dataset delete failed, so rescue the tab
  // before reporting that failure. A surviving dataset keeps its own page.
  await redirectTabIfViewingObject({
    ids: datasetError ? [templateId] : [templateId, datasetId],
    tabId: context.tabId,
    url: `${context.origin}/approval/request-forms`
  });
  if (datasetError) {
    throw new Error(
      `Template deleted, but the dataset could not be removed (${datasetError.message}). Delete it manually.`,
      { cause: datasetError }
    );
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
 * @param {string|null} [params.runningCheckLabel] - Label of the opt-in check in flight, if any
 * @returns {string|null}
 */
function unavailableReason({ blocked, blockedReason, hasDepsError, isLoadingDeps, runningCheckLabel = null }) {
  if (isLoadingDeps) return 'Checking dependencies…';
  if (hasDepsError) return 'Retry the dependency check before deleting.';
  // An opt-in check in flight could still turn up something blocking, so the
  // delete waits for it. Declining to run one never gates the delete.
  if (runningCheckLabel) return `${runningCheckLabel.replace(/^Check /, 'Checking ')}…`;
  if (blocked) return blockedReason() || 'Blocked by dependencies.';
  return null;
}
