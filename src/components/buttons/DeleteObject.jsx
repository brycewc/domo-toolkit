import { Button, Tooltip } from '@heroui/react';

import { DisabledTooltip } from '@/components/DisabledTooltip';
import { useLaunchView } from '@/hooks/useLaunchView';
import { isCodeEngineInWorkflow } from '@/utils/availableActions';
import { isDataflowOutput, isDatasetTypeId } from '@/utils/datasetTypes';
import IconCancel from '@icons/cancel.svg?react';
import IconTrash from '@icons/trash.svg?react';

const CODE_ENGINE_TYPES = ['CODEENGINE_PACKAGE', 'CODEENGINE_PACKAGE_VERSION'];

const SUPPORTED_TYPES = [
  'APP',
  'BEAST_MODE_FORMULA',
  'CODEENGINE_PACKAGE',
  'CODEENGINE_PACKAGE_VERSION',
  'DATA_APP_VIEW',
  'DATA_FUSION',
  'DATA_MODEL',
  'DATA_SOURCE',
  'DATAFLOW_TYPE',
  'HOPPER_TASK',
  'MAGNUM_COLLECTION',
  'PAGE',
  'REPORT_SCHEDULE',
  'RYUU_APP',
  'TEMPLATE',
  'VARIABLE',
  'WORKFLOW_MODEL',
  'WORKSHEET_VIEW'
];

export function DeleteObject({ currentContext, isDisabled, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  const typeId = currentContext?.domoObject?.typeId;
  const typeName = currentContext?.domoObject?.typeName?.toLowerCase() || 'object';

  const isInWorkflow = isCodeEngineInWorkflow(currentContext);
  const isVoid = typeId === 'HOPPER_TASK';

  const isDataflowOutputDataset =
    isDatasetTypeId(typeId) && isDataflowOutput(currentContext?.domoObject?.metadata?.details);

  // A task's status is only known once its details load, and the workflow
  // user-task-response page carries no queue to load them with, so an unknown
  // status leaves the action open rather than blocking it.
  const closedTaskReason = (() => {
    if (!isVoid) return null;
    const status = currentContext?.domoObject?.metadata?.details?.status;
    if (!status || status === 'OPEN') return null;
    return status === 'VOIDED' ? 'This task is already voided' : 'Only an open task can be voided';
  })();

  const isDeleteForbidden = (() => {
    const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
    const isOwner = currentContext?.domoObject?.metadata?.isOwner;

    if (CODE_ENGINE_TYPES.includes(typeId)) {
      // A version's own response carries no owner, so ownership comes off the
      // package the delete actually targets.
      const packageOwner = currentContext?.domoObject?.metadata?.parent?.details?.owner;
      const ownsPackage = isOwner || (packageOwner != null && String(packageOwner) === String(currentContext?.user?.id));
      return !ownsPackage && !userRights.includes('codeengine.package.admin');
    }
    if (typeId === 'DATAFLOW_TYPE') {
      return !isOwner && !userRights.includes('dataflow.admin');
    }
    if (isDatasetTypeId(typeId)) {
      return !isOwner && !userRights.includes('dataset.admin');
    }
    if (typeId === 'WORKFLOW_MODEL') {
      const permValues = currentContext?.domoObject?.metadata?.permission?.values || [];
      const hasDeletePerm = permValues.includes('ADMIN') || permValues.includes('DELETE');
      return !isOwner && !hasDeletePerm && !userRights.includes('workflow.admin');
    }
    if (typeId === 'BEAST_MODE_FORMULA' || typeId === 'VARIABLE') {
      return !isOwner && !userRights.includes('content.admin');
    }
    if (typeId === 'DATA_APP_VIEW' || typeId === 'PAGE' || typeId === 'WORKSHEET_VIEW') {
      return !isOwner && !userRights.includes('content.admin');
    }
    if (typeId === 'TEMPLATE') {
      return !isOwner && !userRights.includes('approvalcenter.admin');
    }
    if (typeId === 'MAGNUM_COLLECTION') {
      const userId = currentContext?.user?.id;
      const userPerms = (currentContext?.domoObject?.metadata?.permission?.USER || []).find(
        (u) => String(u.id) === String(userId)
      );
      const hasDeletePerm = userPerms?.permissions?.includes('ADMIN') || userPerms?.permissions?.includes('DELETE');
      return !isOwner && !hasDeletePerm && !userRights.includes('datastore.admin');
    }
    return false;
  })();

  const isDeleteDisabled =
    isDisabled ||
    !currentContext?.domoObject ||
    !SUPPORTED_TYPES.includes(typeId) ||
    (typeId === 'DATAFLOW_TYPE' && currentContext?.domoObject?.metadata?.details?.deleted === true) ||
    isDataflowOutputDataset ||
    isInWorkflow ||
    !!closedTaskReason ||
    isDeleteForbidden;

  // Persistent reasons the action is unavailable (the pending state is transient
  // and handled by the button below, so it is intentionally excluded here).
  const disabledReason =
    isDisabled || !currentContext?.domoObject
      ? 'Navigate to a Domo object to use delete'
      : !SUPPORTED_TYPES.includes(typeId)
        ? `Delete isn't supported for ${typeName}s`
        : typeId === 'DATAFLOW_TYPE' && currentContext?.domoObject?.metadata?.details?.deleted === true
          ? 'This dataflow is already deleted'
          : isDataflowOutputDataset
            ? 'You can delete a dataflow output using the extension from the dataflow itself'
            : isInWorkflow
              ? 'Open the code engine package itself to delete it'
              : closedTaskReason
                ? closedTaskReason
                : isDeleteForbidden
                  ? `You don't have permission to delete this ${typeName}`
                  : null;

  const ActionIcon = isVoid ? IconCancel : IconTrash;

  if (disabledReason) {
    return (
      <DisabledTooltip content={disabledReason}>
        <Button fullWidth isIconOnly variant='tertiary'>
          <ActionIcon />
        </Button>
      </DisabledTooltip>
    );
  }

  return (
    <Tooltip delay={200} isDisabled={isDeleteDisabled}>
      <Button
        fullWidth
        isIconOnly
        isDisabled={isDeleteDisabled}
        isPending={isPending}
        variant='tertiary'
        onPress={() =>
          launch({
            currentContext,
            onStatusUpdate,
            type: 'deleteObject'
          })
        }
      >
        {({ isDisabled: btnDisabled }) => <ActionIcon className={btnDisabled ? '' : 'text-danger'} />}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        {isVoid ? 'List related objects and confirm void' : 'List dependencies and confirm delete'}
      </Tooltip.Content>
    </Tooltip>
  );
}
