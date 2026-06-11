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

  if (['CARD', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getDatasets');
  }

  if (['DATA_APP_VIEW', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getChildPages');
  }

  if (['CARD', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'PAGE', 'WORKSHEET_VIEW'].includes(typeId)) {
    actions.add('getCardPages');
  }

  if (typeId === 'DATA_SOURCE') {
    actions.add('copyColorRules');
    actions.add('getViewInputs');
    actions.add('dataRepair');
    actions.add('migrateDownstreamContent');
    if (details?.streamId && metadata?.parent?.details?.currentExecutionState === 'ACTIVE') {
      actions.add('cancelStreamExecution');
    }
    if (details?.streamId && metadata?.parent?.details?.scheduleState !== 'MANUAL') {
      actions.add('setStreamToManual');
    }
  }

  if (['DATA_SOURCE', 'DATAFLOW_TYPE'].includes(typeId)) {
    actions.add('viewLineage');
  }

  if (['CARD', 'DATA_APP_VIEW', 'PAGE'].includes(typeId)) {
    actions.add('copyFilteredUrl');
  }

  if (typeId === 'DATAFLOW_TYPE') {
    if (metadata?.permission?.mask & 2) {
      actions.add('updateDetails');
    }
  } else if (typeId === 'DATA_SOURCE') {
    if (metadata?.isOwner || userRights.includes('dataset.admin')) {
      actions.add('updateDetails');
    }
  }

  if (['ALERT', 'WORKFLOW_MODEL'].includes(typeId)) {
    actions.add('updateOwner');
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
  }

  if (typeId === 'MAGNUM_COLLECTION') {
    actions.add('generate');
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

  return actions;
}
