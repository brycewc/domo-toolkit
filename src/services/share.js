import { shareAccount } from './accounts';
import { getAppInstanceCollections, shareAppDbCollection } from './appDb';
import { shareStudioApp } from './appStudio';
import { getAppInstance, shareCustomAppDesign } from './customApps';
import { sharePages } from './pages';

/**
 * Full permission bundle granted to AppDB collections when sharing a DomoApp
 * card with a user — mirrors what the Domo UI grants when you share a card.
 */
const FULL_COLLECTION_PERMS =
  'ADMIN,SHARE,DELETE,WRITE,READ,READ_CONTENT,CREATE_CONTENT,UPDATE_CONTENT,DELETE_CONTENT';

/**
 * Share a Domo object with a user by dispatching to the type-specific
 * primitive(s) in the relevant service file. For `CARD` the flow spans
 * `customApps` (share the app design) and `appDb` (share each associated
 * collection), so the dispatcher coordinates multiple primitives; all other
 * types route to a single service call.
 *
 * Calls `setStatus` on success/failure when provided, and re-throws on
 * failure so the caller can attach its own handling if desired.
 *
 * @param {Object} params
 * @param {DomoObject} params.object - The Domo object to share
 * @param {number} params.userId - The recipient user ID
 * @param {Function} [params.setStatus] - Optional (title, description, level) callback
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 */
export async function shareWithSelf({
  object,
  setStatus,
  tabId = null,
  userId
}) {
  try {
    if (!object || !object.typeId || !object.id) {
      throw new Error('Invalid object provided');
    }
    const message = await shareForType({ object, tabId, userId });
    setStatus?.('Shared Successfully', message, 'success');
  } catch (error) {
    console.error('Error sharing object with self:', error);
    setStatus?.('Share Failed', error.message, 'danger');
    throw error;
  }
}

async function shareForType({ object, tabId, userId }) {
  switch (object.typeId) {
    case 'APP':
      await shareCustomAppDesign({ designId: object.id, tabId, userId });
      return `Custom App Design ${object.id} shared successfully`;

    case 'CARD': {
      if (object.metadata?.details?.type !== 'domoapp') {
        throw new Error('Sharing is only supported for DomoApp cards');
      }
      const appInstanceId = object.metadata.details.domoapp?.id;
      if (!appInstanceId) {
        throw new Error('App Instance ID not found in card metadata');
      }

      const instance = await getAppInstance({ appInstanceId, tabId });
      const designId = instance?.designId;
      if (!designId) {
        throw new Error('Design ID not found in App Instance response');
      }
      await shareCustomAppDesign({ designId, tabId, userId });

      const collections = await getAppInstanceCollections({
        appInstanceId,
        tabId
      });
      if (collections.length > 0) {
        await Promise.all(
          collections.map((col) =>
            shareAppDbCollection({
              collectionId: col.id,
              permissions: FULL_COLLECTION_PERMS,
              tabId,
              userId
            })
          )
        );
      }
      return `Custom App Design ${designId} shared successfully (including ${appInstanceId} AppDB collections)`;
    }

    case 'DATA_APP':
    case 'WORKSHEET':
      await shareStudioApp({ appId: object.id, tabId, userId });
      return `${object.typeName || 'App'} ${object.id} shared successfully`;

    case 'DATA_APP_VIEW':
    case 'WORKSHEET_VIEW': {
      const parentId = object.metadata?.parent?.id;
      if (!parentId) {
        throw new Error('Parent app ID not found — cannot share app page');
      }
      await shareStudioApp({ appId: parentId, tabId, userId });
      return `App ${parentId} shared successfully`;
    }

    case 'DATA_SOURCE': {
      if (object.metadata?.details?.type === 'dataflow') {
        throw new Error(
          'DataSet is a DataFlow output and does not have an account to share'
        );
      }
      const accountId = object.metadata?.details?.accountId;
      if (!accountId) {
        throw new Error('DataSet account ID not found in metadata');
      }
      await shareAccount({ accountId, tabId, userId });
      return `Account ${accountId} shared successfully`;
    }

    case 'PAGE':
      await sharePages({ pageIds: [object.id], tabId, userId });
      return `Page ${object.id} shared successfully`;

    default:
      throw new Error(`Sharing not supported for object type: ${object.typeId}`);
  }
}
