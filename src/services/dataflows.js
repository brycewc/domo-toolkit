import { executeInPage } from '@/utils/executeInPage';

import { getUserGroups, getUserName } from './users';

/**
 * Delete a DataFlow and all its output datasets.
 * Deletes outputs first, then the dataflow itself.
 * @param {Object} params
 * @param {string} params.dataflowId - The DataFlow ID
 * @param {Array} params.outputs - Array of output objects with dataSourceId
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Result with success/status info
 */
export async function deleteDataflowAndOutputs({ dataflowId, outputs, tabId = null }) {
  return executeInPage(
    async (dataflowId, outputs) => {
      const outputIds = outputs.map((o) => o.dataSourceId).filter(Boolean);

      // Step 1: Delete all output datasets
      if (outputIds.length > 0) {
        const results = await Promise.allSettled(
          outputIds.map((id) => fetch(`/api/data/v3/datasources/${id}`, { method: 'DELETE' }))
        );

        const failures = results.filter((r) => r.status === 'rejected' || !r.value?.ok);
        if (failures.length > 0) {
          return {
            datasetsDeleted: outputIds.length - failures.length,
            datasetsFailed: failures.length,
            success: false
          };
        }
      }

      // Step 2: Delete the dataflow
      const response = await fetch(`/api/dataprocessing/v1/dataflows/${dataflowId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        return {
          datasetsDeleted: outputIds.length,
          statusCode: response.status,
          success: false
        };
      }

      return {
        datasetsDeleted: outputIds.length,
        success: true
      };
    },
    [dataflowId, outputs],
    tabId
  );
}

/**
 * Get the full detail of a DataFlow (including actions/tiles)
 * @param {string} dataflowId - The DataFlow ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} The full dataflow JSON
 */
export async function getDataflowDetail(dataflowId, tabId = null) {
  return executeInPage(
    async (dataflowId) => {
      const response = await fetch(`/api/dataprocessing/v1/dataflows/${dataflowId}`, {
        credentials: 'include',
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch dataflow: HTTP ${response.status}`);
      }

      return response.json();
    },
    [dataflowId],
    tabId
  );
}

/**
 * Get the DataFlow ID for a given output DataSet (reverse lookup).
 * Only applicable when the DataSet is an output of a DataFlow.
 * @param {string} datasetId - The DataSet UUID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<string>} The DataFlow ID
 * @throws {Error} If the dataflow cannot be fetched
 */
export async function getDataflowForOutputDataset(datasetId, tabId = null) {
  const fetchLogic = async (datasetId) => {
    const response = await fetch(
      `/api/dataprocessing/v2/dataflows/${datasetId}?populateActions=false&excludeFields=executionCount`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch DataFlow for DataSet ${datasetId}. HTTP status: ${response.status}`);
    }

    const data = await response.json();

    if (!data.id) {
      throw new Error(`No DataFlow ID returned for DataSet ${datasetId}`);
    }

    return data.id.toString();
  };

  try {
    return await executeInPage(fetchLogic, [datasetId], tabId);
  } catch (error) {
    console.error('Error fetching DataFlow for DataSet:', error);
    throw error;
  }
}

/**
 * Get the current user's permission for a DataFlow.
 * @param {string} dataflowId - The DataFlow ID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>} Permission object (e.g. { mask: 515 }) or null
 */
export async function getDataflowPermission(dataflowId, tabId = null) {
  return executeInPage(
    async (dataflowId) => {
      const response = await fetch('/api/dataprocessing/v1/dataflows/bulk/flowPermissions', {
        body: JSON.stringify({ dataFlowIds: [dataflowId] }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) return null;
      const data = await response.json();
      return data?.permissions?.[0]?.permission || null;
    },
    [dataflowId],
    tabId
  );
}

/**
 * Update a DataFlow's details (name and description)
 * @param {string} dataflowId - The DataFlow ID
 * @param {Object} updates - Object containing name and/or description
 * @returns {Promise<Object>} - The updated DataFlow object
 */
/**
 * Get all dataflows owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedDataflows(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allDataflows = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            count,
            entities: ['DATAFLOW'],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                value: userId
              }
            ],
            offset,
            query: '*'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.searchObjects && data.searchObjects.length > 0) {
          allDataflows.push(
            ...data.searchObjects.map((d) => ({
              id: d.databaseId,
              name: d.winnerText || d.databaseId.toString()
            }))
          );
          offset += count;
          if (data.searchObjects.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allDataflows;
    },
    [userId],
    tabId
  );
}

/**
 * Ensure a user has access to every input dataset feeding the given dataflows.
 *
 * Owning a dataflow is useless if you can't read its inputs, so after a transfer
 * we grant the new owner read access to any input dataset they can't already
 * reach. "Can already reach" means either a direct USER grant on the dataset or
 * membership in a GROUP the dataset is shared with, so a user who inherits
 * access through a group is never granted a redundant direct share.
 *
 * Best-effort throughout: unreadable dataflow details, unreadable dataset
 * grants, and failed share calls are swallowed per item rather than thrown, so
 * one bad dataset never blocks sharing the rest. When a dataset's grants can't
 * be read at all, it defaults to being shared (the new owner should have access).
 *
 * @param {string[]} dataflowIds - The dataflows whose inputs to cover
 * @param {number} toUserId - The user who should end up with input access
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{alreadyHadAccess: number, failed: number, shared: number}>}
 */
export async function shareDataflowInputsWithOwner(dataflowIds, toUserId, tabId = null) {
  // Resolve the new owner's group memberships once, up front, so the in-page
  // step can treat group-inherited access the same as a direct grant. On
  // failure we proceed with no groups: at worst the user gets a redundant
  // direct share on a dataset they could already reach through a group.
  const groupIds = await getUserGroups(toUserId, tabId)
    .then((groups) => groups.map((g) => g.groupId))
    .catch(() => []);

  return executeInPage(
    async (dataflowIds, toUserId, groupIds) => {
      const toUserIdStr = String(toUserId);
      const groupIdSet = new Set(groupIds.map(String));

      // 1. Gather the unique input dataSourceIds across all transferred dataflows.
      const inputIds = new Set();
      await Promise.all(
        dataflowIds.map(async (id) => {
          try {
            const response = await fetch(`/api/dataprocessing/v1/dataflows/${id}`, { credentials: 'include' });
            if (!response.ok) return;
            const detail = await response.json();
            for (const input of detail.inputs || []) {
              if (input.dataSourceId) inputIds.add(input.dataSourceId);
            }
          } catch {
            // Skip this dataflow's inputs; the others still get covered.
          }
        })
      );
      if (inputIds.size === 0) return { alreadyHadAccess: 0, failed: 0, shared: 0 };

      // 2. For each input dataset, read its share grants and decide whether the
      //    new owner already has access (direct USER grant or via a group).
      const needsShare = [];
      let alreadyHadAccess = 0;
      await Promise.all(
        [...inputIds].map(async (datasetId) => {
          try {
            const response = await fetch(`/api/data/v3/datasources/${datasetId}/permissions`, { credentials: 'include' });
            if (!response.ok) {
              // Can't read grants: default to sharing rather than risk locking
              // the new owner out of an input they need.
              needsShare.push(datasetId);
              return;
            }
            const data = await response.json();
            const hasAccess = (data.list || []).some(
              (grant) =>
                (grant.type === 'USER' && String(grant.id) === toUserIdStr) ||
                (grant.type === 'GROUP' && groupIdSet.has(String(grant.id)))
            );
            if (hasAccess) {
              alreadyHadAccess++;
            } else {
              needsShare.push(datasetId);
            }
          } catch {
            needsShare.push(datasetId);
          }
        })
      );
      if (needsShare.length === 0) return { alreadyHadAccess, failed: 0, shared: 0 };

      // 3. Share the inputs the new owner can't yet reach, batched 50 per call.
      let failed = 0;
      let shared = 0;
      for (let i = 0; i < needsShare.length; i += 50) {
        const chunk = needsShare.slice(i, i + 50);
        try {
          const response = await fetch('/api/data/v1/ui/bulk/share', {
            body: JSON.stringify({
              bulkItems: { excludeIds: null, ids: chunk, query: null, type: 'DATA_SOURCE' },
              dataSourceShareEntity: {
                permissions: [{ accessLevel: 'CAN_VIEW', id: toUserIdStr, type: 'USER' }],
                sendEmail: false
              }
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          shared += chunk.length;
        } catch {
          failed += chunk.length;
        }
      }
      return { alreadyHadAccess, failed, shared };
    },
    [dataflowIds, toUserId, groupIds],
    tabId
  );
}

/**
 * Transfer dataflow ownership to a new user.
 * @param {string[]} dataflowIds - Array of dataflow IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferDataflows(dataflowIds, fromUserId, toUserId, tabId = null) {
  // Resolve the source user's name for the tag, but never let that lookup block
  // the transfer: on failure we proceed untagged rather than aborting ownership.
  const fromUserName = await getUserName(fromUserId, tabId).catch(() => null);
  const result = await executeInPage(
    async (dataflowIds, toUserId, fromUserName) => {
      try {
        const response = await fetch('/api/dataprocessing/v1/dataflows/bulk/patch', {
          body: JSON.stringify({
            dataFlowIds: dataflowIds,
            responsibleUserId: toUserId
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        // Tag each transferred dataflow with its previous owner so the new owner
        // can see where it came from. Best-effort: ownership has already moved,
        // so a failed tag call must not flip the result to failed. Batch the tag
        // calls in chunks of 50 to keep each request bounded.
        if (fromUserName) {
          for (let i = 0; i < dataflowIds.length; i += 50) {
            const chunk = dataflowIds.slice(i, i + 50);
            try {
              const tagResponse = await fetch('/api/dataprocessing/v1/dataflows/bulk/tag', {
                body: JSON.stringify({
                  dataFlowIds: chunk,
                  tagNames: [`From ${fromUserName}`]
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'PUT'
              });
              if (!tagResponse.ok) throw new Error(`HTTP ${tagResponse.status}`);
            } catch {
              // Best-effort tagging; the ownership transfer already succeeded.
            }
          }
        }

        return { errors: [], failed: 0, succeeded: dataflowIds.length };
      } catch (error) {
        return {
          errors: dataflowIds.map((id) => ({ error: error.message, id })),
          failed: dataflowIds.length,
          succeeded: 0
        };
      }
    },
    [dataflowIds, toUserId, fromUserName],
    tabId
  );

  // Once ownership has moved, make sure the new owner can actually use each
  // dataflow by granting access to any input dataset they can't already reach.
  // Best-effort: a sharing failure must never flip a successful transfer to
  // failed, and we skip it entirely when the reassign itself failed.
  if (result.succeeded > 0) {
    try {
      await shareDataflowInputsWithOwner(dataflowIds, toUserId, tabId);
    } catch {
      // Best-effort; the ownership transfer already succeeded.
    }
  }

  return result;
}

export async function updateDataflowDetails(dataflowId, updates) {
  const result = await executeInPage(
    async (dataflowId, updates) => {
      try {
        // Build payload from updates - allow empty string for description (to clear it)
        const payload = {};
        if ('name' in updates && updates.name?.trim()) {
          payload.name = updates.name.trim();
        }
        if ('description' in updates) {
          payload.description = updates.description?.trim() ?? '';
        }

        // Update the DataFlow using PATCH
        const updateResponse = await fetch(`/api/dataprocessing/v1/dataflows/${dataflowId}/patch`, {
          body: JSON.stringify(payload),
          headers: {
            'Content-Type': 'application/json'
          },
          method: 'PUT'
        });

        if (!updateResponse.ok) {
          throw new Error(`HTTP ${updateResponse.status}`);
        }

        const data = await updateResponse.json();
        return data;
      } catch (error) {
        console.error('Error in updateDataflowInPage:', error);
        throw error;
      }
    },
    [dataflowId, updates]
  );
  return result;
}
