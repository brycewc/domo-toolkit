import { SHARE_BATCH_SIZE } from '@/utils/constants';
import { isDataflowOutput, isDerivedDatasetType } from '@/utils/datasetTypes';
import { executeInPage } from '@/utils/executeInPage';

import { getAccountIdsForDomoObject, shareAccount } from './accounts';
import { getAppInstanceCollections, shareAppDbCollection } from './appDb';
import { shareStudioApps } from './appStudio';
import { getAppInstance, shareCustomAppDesign } from './customApps';
import { sharePages } from './pages';
import { shareTaskCenterQueue } from './taskCenter';

/**
 * Full permission bundle granted to AppDB collections when sharing a DomoApp
 * card with a user — mirrors what the Domo UI grants when you share a card.
 */
const FULL_COLLECTION_PERMS = 'ADMIN,SHARE,DELETE,WRITE,READ,READ_CONTENT,CREATE_CONTENT,UPDATE_CONTENT,DELETE_CONTENT';

/**
 * Share a batch of resources with a set of recipients via the generic
 * /api/content/v1/share endpoint. Useful for bulk card/page sharing flows.
 *
 * Supply `resources` like [{ type: 'badge', id: '123' }, ...] and
 * `recipients` like [{ type: 'user', id: '456' }, ...].
 *
 * @param {Object} params
 * @param {Array<{type: string, id: string}>} params.resources
 * @param {Array<{type: string, id: string}>} params.recipients
 * @param {string} [params.message='']
 * @param {boolean} [params.sendEmail=false]
 * @param {number|null} [tabId]
 * @returns {Promise<boolean>} true on success
 */
export async function shareContent({ message = '', recipients, resources, sendEmail = false }, tabId = null) {
  if (!resources?.length || !recipients?.length) return true;
  return executeInPage(
    async (resources, recipients, message, sendEmail) => {
      const response = await fetch(`/api/content/v1/share?sendEmail=${sendEmail}`, {
        body: JSON.stringify({ message, recipients, resources }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      return response.ok;
    },
    [resources, recipients, message, sendEmail],
    tabId
  );
}

// Pages, apps and worksheets share through endpoints that take a list of resources,
// so they go out in batches; every other type still shares one request at a time.
/** @returns {Promise<{errors: Array<{error: string, id: string|number}>, shared: number, total: number}>} */
export async function shareObjectsWithSelf({ objects, tabId = null, userId }) {
  const errors = [];
  const failed = new Set();
  const objectsByAppId = new Map();
  const objectsByPageId = new Map();
  const individual = [];

  const track = (map, id, object) => {
    const key = String(id);
    if (!map.has(key)) map.set(key, { id, objects: [] });
    map.get(key).objects.push(object);
  };

  const fail = (object, error) => {
    if (failed.has(object)) return;
    failed.add(object);
    errors.push({ error, id: object.id });
  };

  for (const object of objects) {
    switch (object?.typeId) {
      case 'DATA_APP':
      case 'WORKSHEET':
        track(objectsByAppId, object.id, object);
        break;

      case 'DATA_APP_VIEW':
      case 'WORKSHEET_VIEW': {
        const parentId = object.metadata?.parent?.id;
        if (!parentId) {
          fail(object, 'Parent app ID not found, cannot share app page');
          break;
        }
        track(objectsByAppId, parentId, object);
        break;
      }

      case 'PAGE':
        track(objectsByPageId, object.id, object);
        break;

      default:
        individual.push(object);
    }
  }

  const shareBatched = async (map, shareChunk) => {
    const entries = [...map.values()];
    for (let i = 0; i < entries.length; i += SHARE_BATCH_SIZE) {
      const chunk = entries.slice(i, i + SHARE_BATCH_SIZE);
      const byId = new Map(chunk.map((entry) => [String(entry.id), entry.objects]));
      try {
        const { failures } = await shareChunk(chunk.map((entry) => entry.id));
        for (const failure of failures) {
          for (const object of byId.get(String(failure.id)) ?? []) fail(object, failure.error);
        }
      } catch (error) {
        for (const entry of chunk) {
          for (const object of entry.objects) fail(object, error.message);
        }
      }
    }
  };

  await shareBatched(objectsByPageId, (pageIds) => sharePages({ pageIds, tabId, userId }));
  await shareBatched(objectsByAppId, (appIds) => shareStudioApps({ appIds, tabId, userId }));

  for (const object of individual) {
    try {
      await shareWithSelf({ object, tabId, userId });
    } catch (error) {
      fail(object, error.message);
    }
  }

  return { errors, shared: objects.length - failed.size, total: objects.length };
}

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
export async function shareWithSelf({ object, setStatus, tabId = null, userId }) {
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
    case 'RYUU_APP':
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
      throwFirstFailure(await shareStudioApps({ appIds: [object.id], tabId, userId }));
      return `${object.typeName || 'App'} ${object.id} shared successfully`;

    case 'DATA_APP_VIEW':
    case 'WORKSHEET_VIEW': {
      const parentId = object.metadata?.parent?.id;
      if (!parentId) {
        throw new Error('Parent app ID not found, cannot share app page');
      }
      throwFirstFailure(await shareStudioApps({ appIds: [parentId], tabId, userId }));
      return `App ${parentId} shared successfully`;
    }

    case 'DATA_FUSION':
    case 'DATA_MODEL':
    case 'DATA_SOURCE':
    case 'VIEW': {
      if (isDataflowOutput(object.metadata?.details)) {
        throw new Error('DataSet is a DataFlow output and does not have an account to share');
      }
      if (isDerivedDatasetType(object.metadata?.details)) {
        throw new Error(`${object.typeName} is built from other datasets and does not have an account to share`);
      }
      const accountIds = getAccountIdsForDomoObject(object);
      if (accountIds.length === 0) {
        throw new Error('DataSet account information not found');
      }
      await Promise.all(accountIds.map((accountId) => shareAccount({ accountId, tabId, userId })));
      if (accountIds.length === 1) {
        return `Account ${accountIds[0]} shared successfully`;
      }
      return `${accountIds.length} accounts shared successfully (${accountIds.join(', ')})`;
    }

    case 'HOPPER_QUEUE':
      await shareTaskCenterQueue({ queueId: object.id, tabId, userId });
      return `Task Center Queue ${object.id} shared successfully`;

    // A task holds no permissions of its own; access to one comes from its queue.
    case 'HOPPER_TASK': {
      const queueId = object.parentId || object.metadata?.details?.queueId;
      if (!queueId) {
        throw new Error("Could not find the task's queue, so there is nothing to share");
      }
      await shareTaskCenterQueue({ queueId, tabId, userId });
      return `Task Center Queue ${queueId} shared successfully`;
    }

    case 'PAGE':
      throwFirstFailure(await sharePages({ pageIds: [object.id], tabId, userId }));
      return `Page ${object.id} shared successfully`;

    default:
      throw new Error(`Sharing not supported for object type: ${object.typeId}`);
  }
}

function throwFirstFailure({ failures }) {
  if (failures.length) throw new Error(failures[0].error);
}
