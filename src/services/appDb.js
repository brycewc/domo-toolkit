import { executeInPage } from '@/utils';

/**
 * Delete an AppDB collection.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteAppDbCollection({ collectionId, tabId = null }) {
  return executeInPage(
    async (collectionId) => {
      const response = await fetch(
        `/api/datastores/v1/collections/${collectionId}`,
        { method: 'DELETE' }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [collectionId],
    tabId
  );
}

/**
 * Get permissions for an AppDB collection.
 * @param {string} collectionId - The AppDB collection ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Object|null>} Permission object or null
 */
export async function getAppDbCollectionPermission(
  collectionId,
  tabId = null
) {
  return executeInPage(
    async (collectionId) => {
      const res = await fetch(
        `/api/datastores/v1/collections/${collectionId}/permission`
      );
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
export async function getAppInstanceCollections({
  appInstanceId,
  tabId = null
}) {
  return executeInPage(
    async (appInstanceId) => {
      const response = await fetch(
        `/api/datastores/v1/${appInstanceId}/collections`
      );
      if (!response.ok) return [];
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    },
    [appInstanceId],
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
export async function shareAppDbCollection({
  collectionId,
  permissions,
  tabId = null,
  userId
}) {
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
 * Transfer AppDB collection ownership to a new user.
 * @param {string[]} collectionIds - Array of collection IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAppDbCollections(
  collectionIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (collectionIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of collectionIds) {
        try {
          const response = await fetch(
            `/api/datastores/v1/collections/${id}`,
            {
              body: JSON.stringify({ id, owner: toUserId }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            }
          );
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
