import { executeInPage } from '@/utils/executeInPage';

/**
 * Enrich a Jupyter workspace's account references with account details.
 * Each configuration entry keeps its workspace-specific fields (alias) and
 * gains the referenced account's details (name, provider type, etc.).
 * @param {Object} params - Parameters
 * @param {Array<{account_id: number, alias: string}>} params.entries - The workspace's accountConfiguration array
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Configuration entries merged with account details
 */
export async function getJupyterWorkspaceAccounts({ entries, tabId = null }) {
  if (!entries || entries.length === 0) return [];
  return executeInPage(
    async (entries) => {
      return Promise.all(
        entries.map(async (entry) => {
          if (!entry.account_id) return entry;
          try {
            const response = await fetch(`/api/data/v1/accounts/${entry.account_id}`);
            // Fall back to the raw configuration entry when enrichment fails
            if (!response.ok) return entry;
            const account = await response.json();
            return { ...entry, ...account };
          } catch {
            return entry;
          }
        })
      );
    },
    [entries],
    tabId
  );
}

/**
 * Enrich a Jupyter workspace's input/output dataset references with dataset details.
 * Each configuration entry keeps its workspace-specific fields (alias, streamId) and
 * gains the referenced dataset's core details (name, owner, row count, etc.).
 * @param {Object} params - Parameters
 * @param {Array<{alias: string, dataSourceId: string}>} params.entries - The workspace's inputConfiguration or outputConfiguration array
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Configuration entries merged with dataset details
 */
export async function getJupyterWorkspaceDatasets({ entries, tabId = null }) {
  if (!entries || entries.length === 0) return [];
  return executeInPage(
    async (entries) => {
      const ids = entries.map((entry) => entry.dataSourceId).filter(Boolean);
      if (ids.length === 0) return entries;

      const response = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&part=core', {
        body: JSON.stringify(ids),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      // Fall back to the raw configuration entries when enrichment fails
      if (!response.ok) return entries;
      const data = await response.json();

      const byId = {};
      for (const dataset of data.dataSources || []) {
        byId[dataset.id] = dataset;
      }
      return entries.map((entry) => (byId[entry.dataSourceId] ? { ...entry, ...byId[entry.dataSourceId] } : entry));
    },
    [entries],
    tabId
  );
}

/**
 * Get all Jupyter workspaces owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedJupyterWorkspaces(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allWorkspaces = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/datascience/v1/search/workspaces', {
          body: JSON.stringify({
            filters: [{ type: 'OWNER', values: [userId] }],
            limit,
            offset,
            searchFieldMap: {},
            sortFieldMap: { LAST_RUN: 'DESC' }
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.workspaces && data.workspaces.length > 0) {
          allWorkspaces.push(
            ...data.workspaces.map((w) => ({
              id: w.id,
              name: w.name || w.id
            }))
          );
          offset += limit;
          if (data.workspaces.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allWorkspaces;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer Jupyter workspace ownership to a new user.
 * @param {string[]} workspaceIds - Array of workspace IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferJupyterWorkspaces(workspaceIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (workspaceIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of workspaceIds) {
        try {
          const response = await fetch(`/api/datascience/v1/workspaces/${id}/ownership`, {
            body: JSON.stringify({ newOwnerId: toUserId }),
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
    [workspaceIds, fromUserId, toUserId],
    tabId
  );
}
