import { deleteAppDbCollection } from './appDb';
import { deleteApprovalTemplate } from './approvals';
import { deleteCustomApp } from './customApps';
import { deleteFunction } from './functions';
import { deleteWorkflow } from './workflows';

/**
 * Maps a DomoObject typeId to the service primitive that deletes it. Each
 * handler receives `{ id, tabId }` and either resolves (success) or throws.
 */
const DELETE_HANDLERS = {
  APP: ({ id, tabId }) => deleteCustomApp({ designId: id, tabId }),
  BEAST_MODE_FORMULA: ({ id }) => deleteFunction(id),
  FUNCTION_TEMPLATE: ({ id }) => deleteFunction(id),
  MAGNUM_COLLECTION: ({ id, tabId }) =>
    deleteAppDbCollection({ collectionId: id, tabId }),
  TEMPLATE: ({ id, tabId }) =>
    deleteApprovalTemplate({ tabId, templateId: id }),
  VARIABLE: ({ id }) => deleteFunction(id),
  WORKFLOW_MODEL: ({ id, tabId }) => deleteWorkflow({ modelId: id, tabId })
};

/**
 * Delete a Domo object, dispatching to the type-specific service primitive.
 * @param {Object} params
 * @param {DomoObject} params.object - The Domo object to delete (must have
 *   `typeId`, `id`, and ideally `typeName`)
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{statusDescription: string, statusTitle: string,
 *   statusType: 'success'|'danger', success: boolean}>} UI-ready result
 */
export async function deleteObject({ object, tabId = null }) {
  if (!object?.typeId || !object?.id) {
    return {
      statusDescription: 'Invalid object provided for deletion',
      statusTitle: 'Delete Failed',
      statusType: 'danger',
      success: false
    };
  }

  const handler = DELETE_HANDLERS[object.typeId];
  if (!handler) {
    return {
      statusDescription: `Deletion not supported for object type: ${object.typeId}`,
      statusTitle: 'Delete Failed',
      statusType: 'danger',
      success: false
    };
  }

  try {
    await handler({ id: object.id, tabId });
    return {
      statusDescription: `Deleted ${object.typeName?.toLowerCase() || 'object'} ${object.id}`,
      statusTitle: 'Deleted Successfully',
      statusType: 'success',
      success: true
    };
  } catch (error) {
    console.error('Error in deleteObject:', error);
    return {
      statusDescription: error.message || 'Failed to delete object',
      statusTitle: 'Delete Failed',
      statusType: 'danger',
      success: false
    };
  }
}
