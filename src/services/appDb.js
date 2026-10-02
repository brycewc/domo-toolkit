import { executeInPage } from '@/utils/executeInPage';

/**
 * Delete an AppDB collection.
 * @param {Object} params
 * @param {string} params.collectionId - The AppDB collection ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteAppDbCollection({ collectionId, tabId = null }) {
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
 * List the AppDB collections stored in a Custom App instance's own datastore.
 * Collections the app borrows from another app's datastore are not included;
 * use `resolveAppInstanceCollections` for everything an app actually uses.
 * @param {Object} params
 * @param {string} params.appInstanceId - The Custom App instance ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Raw collection objects, or [] if none
 */
export async function getAppInstanceCollections({ appInstanceId, tabId = null }) {
  return executeInPage(
    async (appInstanceId) => {
      const response = await fetch(`/api/datastores/v1/collections?datastoreId=${appInstanceId}`);
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
  ).catch(() => []);
}

/**
 * Read AppDB collections by ID, each tagged with the app card whose datastore holds it.
 * An unreadable ID comes back as `inaccessible`, labeled by its alias.
 * @param {{entries: Array<{alias?: string, id: string}>, tabId?: number|null}} params
 * @returns {Promise<Array<Object>>}
 */
export async function getCollectionsByIds({ entries, tabId = null }) {
  const unique = [];
  const seen = new Set();
  for (const entry of entries || []) {
    const id = entry?.id ? String(entry.id) : null;
    if (!id || seen.has(id)) continue;
    seen.add(id);
    unique.push({ alias: entry.alias || null, id });
  }
  if (unique.length === 0) return [];

  const result = await executeInPage(
    async (entries) => {
      const collections = new Array(entries.length);
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(6, entries.length) }, async () => {
          while (next < entries.length) {
            const index = next++;
            const { alias, id } = entries[index];
            try {
              const response = await fetch(`/api/datastores/v1/collections/${id}`);
              if (!response.ok) throw new Error(`HTTP ${response.status}`);
              const collection = await response.json();
              collections[index] = {
                alias,
                datastoreId: collection.datastoreId || null,
                id,
                inaccessible: false,
                name: collection.name || alias || id,
                syncEnabled: !!collection.syncEnabled
              };
            } catch {
              collections[index] = {
                alias,
                datastoreId: null,
                id,
                inaccessible: true,
                name: alias || id,
                syncEnabled: false
              };
            }
          }
        })
      );

      const datastoreIds = [...new Set(collections.map((c) => c.datastoreId).filter(Boolean))];
      const ownerCards = {};
      if (datastoreIds.length > 0) {
        try {
          const response = await fetch('/domoapps/apps/v2/card', {
            body: JSON.stringify(datastoreIds),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (response.ok) {
            for (const [instanceId, card] of Object.entries((await response.json()) || {})) {
              if (card?.id) ownerCards[instanceId] = { id: card.id, title: card.title || `App ${card.id}` };
            }
          }
        } catch {
          // Owner cards only label the rows; the collections still list without them.
        }
      }

      return collections.map((c) => ({ ...c, ownerCard: (c.datastoreId && ownerCards[c.datastoreId]) || null }));
    },
    [unique],
    tabId
  );
  return Array.isArray(result) ? result : [];
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
        if (!response.ok) {
          const error = new Error(`HTTP ${response.status}`);
          error.status = response.status;
          throw error;
        }
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
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
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
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
    },
    [collectionId, name],
    tabId
  );
}

/**
 * Resolve every AppDB collection the given Custom App instances use.
 * @param {{instanceIds: string[], tabId?: number|null}} params
 * @returns {Promise<Array<{card: Object|null, collections: Array<Object>, instanceId: string}>>}
 */
export async function resolveAppInstanceCollections({ instanceIds, tabId = null }) {
  const ids = [...new Set((instanceIds || []).filter(Boolean).map(String))];
  if (ids.length === 0) return [];
  return resolveCollections({ instanceIds: ids, tabId });
}

/**
 * Resolve every AppDB collection used by each instance of a Custom App design.
 * @param {{designId: string, tabId?: number|null}} params
 * @returns {Promise<Array<{card: Object|null, collections: Array<Object>, instanceId: string}>>}
 */
export async function resolveDesignCollections({ designId, tabId = null }) {
  return resolveCollections({ designId, tabId });
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
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
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
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
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
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
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
      if (!response.ok) {
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
    },
    [collectionId, columns],
    tabId
  );
}

// Mirrors ryuu's resolveCollectionsMapping: context mapping, then manifest entries with an id
// for aliases the context lacks, then the own datastore. Only the first two can borrow.
async function resolveCollections({ designId = null, instanceIds = [], tabId = null }) {
  const result = await executeInPage(
    async (designId, instanceIds) => {
      const readJson = async (url) => {
        try {
          const response = await fetch(url);
          return response.ok ? await response.json() : null;
        } catch {
          return null;
        }
      };
      const mapLimit = async (list, fn) => {
        const out = new Array(list.length);
        let next = 0;
        await Promise.all(
          Array.from({ length: Math.min(6, list.length) }, async () => {
            while (next < list.length) {
              const index = next++;
              out[index] = await fn(list[index]);
            }
          })
        );
        return out;
      };

      const designs = {};
      const cardByInstance = {};
      let instances;
      if (designId) {
        const design = await readJson(`/api/apps/v1/designs/${designId}?parts=apps,cards,versions`);
        if (!design) return { error: 'Failed to load the app design', ok: false };
        designs[designId] = design;
        // Domo never creates collections for a temporary (preview) instance.
        instances = (design.instances || []).filter((instance) => instance?.id && !instance.temporary);
        for (const card of design.referencingCards || []) {
          const instanceId = card.domoapp?.id;
          if (instanceId && card.id && !cardByInstance[instanceId]) {
            cardByInstance[instanceId] = { id: card.id, title: card.title || `App ${card.id}` };
          }
        }
      } else {
        const fetched = await mapLimit(instanceIds, (id) => readJson(`/api/apps/v1/instances/${id}`));
        instances = instanceIds.map((id, index) => ({ ...(fetched[index] || {}), id }));
        const designIds = [...new Set(instances.map((instance) => instance.designId).filter(Boolean))];
        const fetchedDesigns = await mapLimit(designIds, (id) => readJson(`/api/apps/v1/designs/${id}?parts=versions`));
        designIds.forEach((id, index) => {
          if (fetchedDesigns[index]) designs[id] = fetchedDesigns[index];
        });
      }

      const manifestMappingFor = (instance) => {
        const design = designs[instance.designId];
        if (!design) return [];
        const version = instance.designVersion || design.latestVersion;
        return (design.versions || []).find((v) => v.version === version)?.collectionsMapping || [];
      };

      const ownLists = await mapLimit(instances, (instance) =>
        readJson(`/api/datastores/v1/collections?datastoreId=${instance.id}`)
      );
      const resolved = instances.map((instance, index) => {
        const byId = new Map();
        for (const c of Array.isArray(ownLists[index]) ? ownLists[index] : []) {
          if (!c?.id) continue;
          byId.set(c.id, {
            alias: null,
            datastoreId: c.datastoreId || instance.id,
            id: c.id,
            inaccessible: false,
            name: c.name || c.id,
            syncEnabled: !!c.syncEnabled
          });
        }
        const contextMapping = instance.collectionsMapping || [];
        const contextAliases = new Set(contextMapping.map((m) => m?.name));
        const mapped = [...contextMapping, ...manifestMappingFor(instance).filter((m) => !contextAliases.has(m?.name))];
        const external = [];
        for (const m of mapped) {
          if (!m?.id) continue;
          const own = byId.get(m.id);
          if (own) own.alias = m.name || null;
          else if (!external.some((e) => e.id === m.id)) external.push({ alias: m.name || null, id: m.id });
        }
        return { byId, external, instance };
      });

      const externalIds = [...new Set(resolved.flatMap((r) => r.external.map((e) => e.id)))];
      const externalFetched = await mapLimit(externalIds, (id) => readJson(`/api/datastores/v1/collections/${id}`));
      const externalById = {};
      externalIds.forEach((id, index) => {
        externalById[id] = externalFetched[index];
      });

      for (const { byId, external } of resolved) {
        for (const { alias, id } of external) {
          const c = externalById[id];
          byId.set(
            id,
            c
              ? {
                  alias,
                  datastoreId: c.datastoreId || null,
                  id,
                  inaccessible: false,
                  name: c.name || alias || id,
                  syncEnabled: !!c.syncEnabled
                }
              : { alias, datastoreId: null, id, inaccessible: true, name: alias || id, syncEnabled: false }
          );
        }
      }

      const borrowedDatastoreIds = [
        ...new Set(
          resolved.flatMap(({ byId, instance }) =>
            [...byId.values()].map((c) => c.datastoreId).filter((dsId) => dsId && dsId !== instance.id)
          )
        )
      ];
      const ownerCards = {};
      if (borrowedDatastoreIds.length > 0) {
        try {
          const response = await fetch('/domoapps/apps/v2/card', {
            body: JSON.stringify(borrowedDatastoreIds),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (response.ok) {
            for (const [instanceId, card] of Object.entries((await response.json()) || {})) {
              if (card?.id) ownerCards[instanceId] = { id: card.id, title: card.title || `App ${card.id}` };
            }
          }
        } catch {
          // Owner cards only label borrowed rows; the collections still list without them.
        }
      }

      return {
        instances: resolved.map(({ byId, instance }) => ({
          card: cardByInstance[instance.id] || null,
          collections: [...byId.values()].map((c) => {
            const borrowed = !!c.datastoreId && c.datastoreId !== instance.id;
            return { ...c, borrowed, ownerCard: borrowed ? ownerCards[c.datastoreId] || null : null };
          }),
          instanceId: instance.id
        })),
        ok: true
      };
    },
    [designId, instanceIds],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to load AppDB collections');
  return result.instances;
}
