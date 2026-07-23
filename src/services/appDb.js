import { executeInPage } from '@/utils/executeInPage';

/**
 * Delete an AppDB collection.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteAppDbCollection({ collectionId, tabId = null }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed delete report success. See executeInPage.
  const result = await executeInPage(
    async (collectionId) => {
      const response = await fetch(`/api/datastores/v1/collections/${collectionId}`, { method: 'DELETE' });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [collectionId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to delete collection');
}

/**
 * Delete an AppDB datastore and every collection it contains. Deleting the
 * datastore does not cascade to its collections, so the collections are removed
 * first and the datastore only after they all succeed. Mirrors
 * `deleteDataflowAndOutputs`: on any collection failure it returns early without
 * touching the datastore, so a partial delete never leaves an emptied-out
 * datastore behind.
 * @param {Object} params
 * @param {string} params.datastoreId - The AppDB datastore ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{collectionsDeleted: number, collectionsFailed?: number, statusCode?: number, success: boolean}>}
 */
export async function deleteDatastoreAndAllCollections({ datastoreId, tabId = null }) {
  return executeInPage(
    async (datastoreId) => {
      // Fetch the collections fresh in the page rather than trusting a snapshot
      // from the dependency check, which may be stale.
      const listResponse = await fetch(`/api/datastores/v1/${datastoreId}/collections`);
      if (!listResponse.ok) return { collectionsDeleted: 0, statusCode: listResponse.status, success: false };
      const listData = await listResponse.json();
      const collectionIds = (Array.isArray(listData) ? listData : []).map((c) => c.id).filter(Boolean);

      // Step 1: delete every collection.
      if (collectionIds.length > 0) {
        const results = await Promise.allSettled(
          collectionIds.map((id) => fetch(`/api/datastores/v1/collections/${id}`, { method: 'DELETE' }))
        );
        const failures = results.filter((r) => r.status === 'rejected' || !r.value?.ok);
        if (failures.length > 0) {
          return {
            collectionsDeleted: collectionIds.length - failures.length,
            collectionsFailed: failures.length,
            success: false
          };
        }
      }

      // Step 2: delete the datastore. Tolerate not-found in case the datastore
      // was already gone; any other failure is reported with its status code.
      const response = await fetch(`/api/datastores/v1/${datastoreId}`, { method: 'DELETE' });
      if (!response.ok && response.status !== 404 && response.status !== 410) {
        return { collectionsDeleted: collectionIds.length, statusCode: response.status, success: false };
      }

      return { collectionsDeleted: collectionIds.length, success: true };
    },
    [datastoreId],
    tabId
  );
}

/**
 * Get permissions for an AppDB collection.
 * @param {string} collectionId - The AppDB collection ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Object|null>} Permission object or null
 */
export async function getAppDbCollectionPermission(collectionId, tabId = null) {
  return executeInPage(
    async (collectionId) => {
      const res = await fetch(`/api/datastores/v1/collections/${collectionId}/permission`);
      if (!res.ok) return null;
      return res.json();
    },
    [collectionId],
    tabId
  );
}

/**
 * List the AppDB collections associated with a Custom App instance.
 * @param {Object} params
 * @param {string} params.appInstanceId - The Custom App instance ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Raw collection objects, or [] if none
 */
export async function getAppInstanceCollections({ appInstanceId, tabId = null }) {
  return executeInPage(
    async (appInstanceId) => {
      const response = await fetch(`/api/datastores/v1/${appInstanceId}/collections`);
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    [appInstanceId],
    tabId
  );
}

/**
 * List the Custom Apps connected to an AppDB collection. Domo grants each
 * connected app a permission on the collection, so the collection's permission
 * record names the app instance IDs (under `RYUU_APP`); those IDs are resolved
 * to their cards (title + card ID) via the domoapps card endpoint. Instance IDs
 * that no longer resolve to a card (a deleted app that left a stale permission
 * entry) drop out, matching Domo's own "Apps Connected" panel. Best-effort:
 * returns [] on any failure.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{cardId: number, instanceId: string, title: string}>>}
 */
export async function getCollectionConnectedApps({ collectionId, tabId = null }) {
  return executeInPage(
    async (collectionId) => {
      const permResponse = await fetch(`/api/datastores/v1/collections/${collectionId}/permission`);
      if (!permResponse.ok) return [];
      const permission = await permResponse.json();
      const instanceIds = (permission?.RYUU_APP || []).map((entry) => entry.id).filter(Boolean);
      if (instanceIds.length === 0) return [];
      // Resolve the instance IDs to real app cards. The response is keyed by
      // instance ID and only includes apps that still exist, so a stale
      // permission entry for a deleted app is naturally excluded.
      const cardResponse = await fetch('/domoapps/apps/v2/card', {
        body: JSON.stringify(instanceIds),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!cardResponse.ok) return [];
      const cards = await cardResponse.json();
      return Object.values(cards || {})
        .filter((card) => card && card.id)
        .map((card) => ({ cardId: card.id, instanceId: card.domoapp?.id || card.urn, title: card.title || `App ${card.id}` }));
    },
    [collectionId],
    tabId
  );
}

/**
 * Get all AppDB collections owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedAppDbCollections(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allCollections = [];
      let moreData = true;
      let pageNumber = 1;
      const pageSize = 100;

      while (moreData) {
        const response = await fetch('/api/datastores/v1/collections/query', {
          body: JSON.stringify({
            collectionFilteringList: [
              {
                comparingCriteria: 'equals',
                filterType: 'ownedby',
                typedValue: userId
              }
            ],
            pageNumber,
            pageSize
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.collections && data.collections.length > 0) {
          allCollections.push(
            ...data.collections.map((c) => ({
              id: c.id,
              name: c.name || c.id
            }))
          );
          pageNumber++;
          if (data.collections.length < pageSize) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allCollections;
    },
    [userId],
    tabId
  );
}

/**
 * Query documents from an AppDB collection. Returns up to the 100 most-recent
 * documents (`orderby=createdOn+descending`) so the sample is biased toward
 * the document shape currently in use, even if older docs in the collection
 * still carry deprecated keys.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of document objects, or [] if none
 */
export async function queryAppDbCollectionDocuments({ collectionId, tabId = null }) {
  return executeInPage(
    async (collectionId) => {
      const response = await fetch(
        `/api/datastores/v2/collections/${collectionId}/documents/query?limit=100&offset=0&orderby=createdOn+descending`,
        {
          body: '{}',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    [collectionId],
    tabId
  );
}

/**
 * Rename an AppDB collection. Sends the new name via PUT to the collection
 * endpoint, which merges the change (matching how the sync-toggle and schema
 * PUTs update a single field). The `id` is included in the body to match the
 * shape the other collection PUT helpers in this file use.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {string} params.name - The new collection name
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function renameAppDbCollection({ collectionId, name, tabId = null }) {
  return executeInPage(
    async (collectionId, name) => {
      const response = await fetch(`/api/datastores/v1/collections/${collectionId}`, {
        body: JSON.stringify({ id: collectionId, name }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [collectionId, name],
    tabId
  );
}

/**
 * Turn sync-on-write on or off for an AppDB collection. Sent as its own PUT
 * (instead of bundled with the schema PUT), since the schema endpoint does
 * not honor `syncEnabled` when both are sent together.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {boolean} params.syncEnabled - Target state for the flag
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function setAppDbCollectionSyncEnabled({ collectionId, syncEnabled, tabId = null }) {
  return executeInPage(
    async (collectionId, syncEnabled) => {
      const response = await fetch(`/api/datastores/v1/collections/${collectionId}`, {
        body: JSON.stringify({ id: collectionId, syncEnabled }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [collectionId, syncEnabled],
    tabId
  );
}

/**
 * Grant a user a permission set on an AppDB collection. Uses `overwrite=true`
 * so the call replaces any existing permission for that user on this
 * collection.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {number} params.userId - The user ID to grant permission to
 * @param {string} params.permissions - Comma-separated permission list
 *   (e.g., 'READ', 'READ,WRITE', or full admin bundle)
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function shareAppDbCollection({ collectionId, permissions, tabId = null, userId }) {
  return executeInPage(
    async (collectionId, userId, permissions) => {
      const response = await fetch(
        `/api/datastores/v1/collections/${collectionId}/permission/USER/${userId}?overwrite=true&permissions=${permissions}`,
        { method: 'PUT' }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [collectionId, userId, permissions],
    tabId
  );
}

/**
 * Trigger an export/sync of an AppDB datastore. Posts to the datastores export
 * endpoint with no body, which kicks off the same sync the Domo UI invokes.
 * @param {Object} params
 * @param {string} params.datastoreId - The AppDB datastore ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function syncAppDbDatastore({ datastoreId, tabId = null }) {
  return executeInPage(
    async (datastoreId) => {
      const response = await fetch(`/api/datastores/v1/export/${datastoreId}`, {
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [datastoreId],
    tabId
  );
}

/**
 * Transfer AppDB collection ownership to a new user.
 * @param {string[]} collectionIds - Array of collection IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAppDbCollections(collectionIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (collectionIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of collectionIds) {
        try {
          const response = await fetch(`/api/datastores/v1/collections/${id}`, {
            body: JSON.stringify({ id, owner: toUserId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [collectionIds, fromUserId, toUserId],
    tabId
  );
}

/**
 * Replace the schema on an AppDB collection. Sends the column list as part of
 * a PUT to the collection, which is the same call Domo's UI fires when an
 * operator edits the schema by hand.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {Array<{name: string, type: string}>} params.columns - Ordered columns
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function updateAppDbCollectionSchema({ collectionId, columns, tabId = null }) {
  return executeInPage(
    async (collectionId, columns) => {
      const response = await fetch(`/api/datastores/v1/collections/${collectionId}`, {
        body: JSON.stringify({ id: collectionId, schema: { columns } }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [collectionId, columns],
    tabId
  );
}
