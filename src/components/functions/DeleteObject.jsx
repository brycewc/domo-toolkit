import { Button, Tooltip } from '@heroui/react';

import { useLaunchView } from '@/hooks/useLaunchView';
import IconTrash from '@icons/trash.svg?react';

const SUPPORTED_TYPES = [
  'APP',
  'BEAST_MODE_FORMULA',
  'DATA_APP_VIEW',
  'DATAFLOW_TYPE',
  'PAGE',
  'MAGNUM_COLLECTION',
  'TEMPLATE',
  'VARIABLE',
  'WORKFLOW_MODEL',
  'WORKSHEET_VIEW'
];

export function DeleteObject({ currentContext, isDisabled, onStatusUpdate }) {
  const { isPending, launch } = useLaunchView();

  const typeId = currentContext?.domoObject?.typeId;
  const typeName = currentContext?.domoObject?.typeName?.toLowerCase() || 'object';

  const isDeleteForbidden = (() => {
    const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
    const isOwner = currentContext?.domoObject?.metadata?.isOwner;

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
    isDeleteForbidden;

  const tooltipSuffix =
    typeId === 'PAGE' || typeId === 'DATA_APP_VIEW' || typeId === 'WORKSHEET_VIEW'
      ? ' and all its cards'
      : typeId === 'DATAFLOW_TYPE'
        ? ' and all its output datasets'
        : '';

  return (
    <Tooltip closeDelay={0} delay={800} isDisabled={isDeleteDisabled}>
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
      <Tooltip.Content
        className='flex max-w-60 flex-col items-center justify-center px-1 py-0.5 text-center text-wrap break-normal'
        offset={4}
      >
        List dependencies and confirm delete of {typeName}
        {tooltipSuffix}
      </Tooltip.Content>
    </Tooltip>
  );
}
