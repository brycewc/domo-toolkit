import { getAccountIdsForDomoObject } from '@/services/accounts';

/**
 * Determine which expandable action buttons are available for the current context.
 * Returns a Set of action keys. Used for both rendering the main action bar and
 * for DataList's `reload` header action to decide whether the user's current
 * object can re-run the active view.
 */
export function getAvailableActions(currentContext) {
  const actions = new Set();
  const typeId = currentContext?.domoObject?.typeId;
  const metadata = currentContext?.domoObject?.metadata;
  const details = metadata?.details;
  const url = currentContext?.url;
  const userRights = currentContext?.user?.metadata?.USER_RIGHTS || [];
  if (['DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE', 'REPORT_BUILDER_VIEW', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getCards');
    if (userRights.includes('content.admin')) {
      actions.add('lockCards');
    }
  }

  if (
    ['CARD', 'DATA_APP_VIEW', 'DATA_SCIENCE_NOTEBOOK', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE', 'WORKSHEET_VIEW'].includes(
      typeId
    )
  ) {
    actions.add('getDatasets');
  }

  if (['CARD', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getBeastModes');
  }

  if (['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getChildPages');
  }

  if (['CARD', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getCardPages');
  }

  if (
    [
      'CARD',
      'DATA_APP',
      'DATA_APP_VIEW',
      'DATA_SOURCE',
      'DATAFLOW_TYPE',
      'PAGE',
      'WORKFLOW_MODEL',
      'WORKSHEET',
      'WORKSHEET_VIEW'
    ].includes(typeId)
  ) {
    actions.add('getWorkspaces');
  }

  if (typeId === 'DATA_SOURCE') {
    actions.add('copyColorRules');
    actions.add('getViewInputs');
    actions.add('dataRepair');
    actions.add('migrateDownstreamContent');
    actions.add('remapColumns');
    if (details?.streamId && metadata?.parent?.details?.currentExecutionState === 'ACTIVE') {
      actions.add('cancelStreamExecution');
    }
    if (details?.streamId && metadata?.parent?.details?.scheduleState !== 'MANUAL') {
      actions.add('setStreamToManual');
    }
    if (userRights.includes('account.admin') && getAccountIdsForDomoObject(currentContext.domoObject).length > 0) {
      actions.add('switchAccount');
    }
  }

  if (['DATA_SOURCE', 'DATAFLOW_TYPE'].includes(typeId)) {
    actions.add('viewLineage');
  }

  if (['CARD', 'DATA_APP_VIEW', 'PAGE'].includes(typeId)) {
    actions.add('copyFilteredUrl');
  }

  if (typeId === 'DATAFLOW_TYPE') {
    actions.add('inspectDataflow');
    if (metadata?.permission?.mask & 2) {
      actions.add('updateDetails');
      actions.add('manageTags');
    }
  } else if (typeId === 'DATA_SOURCE') {
    if (metadata?.isOwner || userRights.includes('dataset.admin')) {
      actions.add('updateDetails');
    }
  }

  if (['ALERT', 'WORKFLOW_MODEL'].includes(typeId)) {
    actions.add('updateOwner');
  }

  if (typeId === 'WORKFLOW_MODEL') {
    actions.add('updateTriggerVersions');
  }

  if (typeId === 'APPROVAL' && details?.status === 'PENDING') {
    const pendingApprover = details?.pendingApprover;
    const templateOwnerId = metadata?.parent?.details?.owner?.id;
    const currentUserId = currentContext?.user?.id;
    const isTemplateOwner =
      templateOwnerId != null && currentUserId != null && String(templateOwnerId) === String(currentUserId);
    if (
      pendingApprover?.isCurrentUser ||
      pendingApprover?.currentUserIsMember ||
      isTemplateOwner ||
      userRights.includes('approvalcenter.admin')
    ) {
      actions.add('transferApproval');
    }
  }

  if (typeId === 'WORKFLOW_MODEL_VERSION' && !details?.deletedAt && !details?.releasedAt) {
    actions.add('updateCodeEngineVersions');
  }

  if (typeId === 'CODEENGINE_PACKAGE_VERSION' && metadata?.context?.workflowModelId) {
    actions.add('updateCodeEngineVersions');
  }

  if (['CARD', 'CODEENGINE_PACKAGE', 'CODEENGINE_PACKAGE_VERSION'].includes(typeId)) {
    actions.add('export');
  }

  if (
    ['CODEENGINE_PACKAGE', 'CODEENGINE_PACKAGE_VERSION'].includes(typeId) &&
    !metadata?.context?.workflowModelId &&
    (metadata?.details?.language || metadata?.parent?.details?.language || 'JAVASCRIPT').toUpperCase() !== 'PYTHON'
  ) {
    actions.add('generate');
    // Routing key for the Generate Definition from JSDoc view's reload action
    // (not consumed by any button — the button uses `generate`).
    actions.add('generatePackageDefinitionFromJSDoc');
  }

  if (typeId === 'MAGNUM_COLLECTION') {
    actions.add('generate');
    // Routing key for the Generate Schema view's reload action.
    actions.add('generateSchema');
    if (details?.syncEnabled === true) {
      actions.add('sync');
    }
  }

  if (typeId === 'CARD' && details?.type !== 'domoapp') {
    actions.add('removeEmptyStrings');
  }

  if (typeId === 'USER') {
    actions.add('transferOwnership');
    actions.add('getOwnedObjects');
    actions.add('duplicate');
    if (userRights.includes('user.edit')) {
      actions.add('updateDetails');
    }
    // Sidepanel routing key used by both GetOwnedObjects and TransferOwnership
    // — added here so DataList's reload affordance can verify the current
    // object supports the shared OwnershipView. Not consumed by any button.
    actions.add('ownership');
  }

  if (url?.includes('domo.com/auth/index') && !url?.includes('domoManualLogin=true')) {
    actions.add('directSignOn');
  }

  // Routing key for the Delete view's reload action (not consumed by any button;
  // the Delete control lives outside getAvailableActions). Mirrors the object
  // types DeleteObjectView's `deletersByType` knows how to delete.
  if (
    [
      'APP',
      'BEAST_MODE_FORMULA',
      'DATA_APP_VIEW',
      'DATAFLOW_TYPE',
      'MAGNUM_COLLECTION',
      'PAGE',
      'REPORT_SCHEDULE',
      'TEMPLATE',
      'VARIABLE',
      'WORKFLOW_MODEL',
      'WORKSHEET_VIEW'
    ].includes(typeId)
  ) {
    actions.add('deleteObject');
  }

  // ObjectDetails renders any detected object, so its reload affordance is
  // available whenever there is a current object. Routing key only.
  if (typeId) {
    actions.add('viewObjectDetails');
  }

  return actions;
}
