import { Button, Tooltip } from '@heroui/react';

import { DisabledTooltip } from '@/components/DisabledTooltip';
import { useLaunchView } from '@/hooks/useLaunchView';
import { isCodeEngineInWorkflow } from '@/utils/availableActions';
import IconTrash from '@icons/trash.svg?react';

const CODE_ENGINE_TYPES = ['CODEENGINE_PACKAGE', 'CODEENGINE_PACKAGE_VERSION'];

const SUPPORTED_TYPES = [
  'APP',
  'BEAST_MODE_FORMULA',
  'CODEENGINE_PACKAGE',
  'CODEENGINE_PACKAGE_VERSION',
  'DATA_APP_VIEW',
  'DATAFLOW_TYPE',
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
    isInWorkflow ||
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
          : isInWorkflow
            ? 'Open the Code Engine package itself to delete it'
            : isDeleteForbidden
              ? `You don't have permission to delete this ${typeName}`
              : null;

  if (disabledReason) {
    return (
      <DisabledTooltip content={disabledReason}>
        <Button fullWidth isIconOnly variant='tertiary'>
          <IconTrash />
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
        {({ isDisabled: btnDisabled }) => <IconTrash className={btnDisabled ? '' : 'text-danger'} />}
      </Button>
      <Tooltip.Content className='max-w-60' offset={4}>
        List dependencies and confirm delete
      </Tooltip.Content>
    </Tooltip>
  );
}
