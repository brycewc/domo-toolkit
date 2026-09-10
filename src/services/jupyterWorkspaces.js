import { executeInPage } from '@/utils/executeInPage';

import { hasEffectiveMapping } from './columnRewriter';

/**
 * Find the Jupyter Workspaces that read a dataset, matching on inputs only. A
 * workspace that merely writes the dataset is upstream, so it is left out here;
 * `getJupyterWorkspacesForDataset` returns both sides.
 *
 * @param {string} datasetId - The dataset's GUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, inputAliases: string[], name: string, outputAliases: string[], owner: number|null}>>}
 */
export async function getDownstreamJupyterWorkspaces(datasetId, tabId = null) {
  const workspaces = await getJupyterWorkspacesForDataset(datasetId, tabId);
  return workspaces.filter((workspace) => workspace.inputAliases.length > 0);
}

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
 * Find every Jupyter Workspace that references a dataset on either side, each
 * carrying the aliases it reads it by (`inputAliases`) and writes it by
 * (`outputAliases`), so a caller can tell a reader from a writer.
 *
 * The unpaginated list endpoint is the only source: workspace search never
 * returns the input/output configuration and silently ignores a DATASOURCE_ID
 * filter. `instances=false` keeps Domo from enumerating every running
 * JupyterHub server, which is slow and fails when JupyterHub is unreachable.
 * Domo returns every workspace to a notebook admin and only readable ones to
 * everyone else, so a non-admin's answer is incomplete.
 *
 * @param {string} datasetId - The dataset's GUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, inputAliases: string[], name: string, outputAliases: string[], owner: number|null}>>}
 */
export async function getJupyterWorkspacesForDataset(datasetId, tabId = null) {
  const result = await executeInPage(
    async (datasetId) => {
      try {
        const response = await fetch('/api/datascience/v1/workspaces?instances=false');
        if (!response.ok) return { error: `HTTP ${response.status}`, workspaces: null };
        const data = await response.json();

        const aliasesFor = (entries) =>
          (Array.isArray(entries) ? entries : [])
            .filter((entry) => entry && String(entry.dataSourceId) === String(datasetId))
            .map((entry) => entry.alias);

        const matches = [];
        for (const workspace of data?.workspaces || []) {
          const inputAliases = aliasesFor(workspace?.inputConfiguration);
          const outputAliases = aliasesFor(workspace?.outputConfiguration);
          if (inputAliases.length === 0 && outputAliases.length === 0) continue;
          matches.push({
            id: workspace.id,
            inputAliases,
            name: workspace.name || workspace.id,
            outputAliases,
            owner: workspace.owner ?? null
          });
        }
        return { error: null, workspaces: matches };
      } catch (error) {
        return { error: error.message, workspaces: null };
      }
    },
    [datasetId],
    tabId
  );
  // A swallowed failure would read as "no workspace uses this dataset", which is
  // indistinguishable from the normal empty answer, so surface it instead.
  if (!result?.workspaces) {
    throw new Error(result?.error ? `Could not load Jupyter Workspaces: ${result.error}` : 'Could not load Jupyter Workspaces');
  }
  return result.workspaces;
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
 * Repoint one Jupyter Workspace's dataset input from `originId` to `targetId`.
 *
 * The workspace is re-read here even though discovery already saw it: the save
 * is a full-object replace with no PATCH, and Domo deletes and re-inserts every
 * configuration list on it, so writing back a copy captured before the column
 * mapping step would revert anything edited in between. The fetched object is
 * mutated in place and sent back whole for the same reason.
 *
 * Only `dataSourceId` changes. The alias is the name the notebook reads the
 * dataset by, so preserving it is what keeps the notebook working, and it also
 * makes the write collision-proof: aliases are unique within a list but dataset
 * ids are not, so a workspace already reading the target just ends up reading it
 * under two aliases.
 *
 * @param {Object} params - Parameters
 * @param {{id: string, name?: string}} params.workspace - The workspace to repoint
 * @param {string} params.originId - The dataset the input currently reads
 * @param {string} params.targetId - The dataset it should read instead
 * @param {Object<string, string|null>} [params.columnMap] - Origin to target column names, read only to decide manual review
 * @param {string[]} [params.droppedColumns] - Columns being dropped, read only to decide manual review
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{success: boolean, error?: string, mergedInput?: boolean, skipped?: boolean, skipReason?: string, unhandled?: string[]}>}
 */
export async function swapJupyterWorkspaceInput({
  columnMap,
  droppedColumns,
  originId,
  tabId = null,
  targetId,
  workspace
}) {
  if (!workspace?.id) return { error: 'Jupyter Workspace has no ID', success: false };

  const result = await executeInPage(
    async (workspaceId, originId, targetId) => {
      const url = `/api/datascience/v1/workspaces/${workspaceId}?instances=false`;
      const MISSING_OR_DENIED = "Domo says this Jupyter Workspace doesn't exist or you can't open it, so nothing was changed.";
      // Domo's `message` is usually just the HTTP reason ("Not Found"), while
      // `localizedMessage` carries the reason worth reading.
      const readFailure = async (response) => {
        const text = await response.text().catch(() => '');
        let detail = text.trim();
        let toe = '';
        try {
          const parsed = JSON.parse(text);
          detail = parsed?.localizedMessage || parsed?.message || '';
          toe = parsed?.toe || '';
        } catch {
          // Not JSON, so the raw body is the best detail available.
        }
        if (!detail) detail = 'Domo gave no reason';
        return { message: `HTTP ${response.status}: ${detail}${toe ? ` (Domo trace ${toe})` : ''}`, text };
      };

      try {
        const getResponse = await fetch(url);
        if (getResponse.status === 403) {
          return { error: "You don't have permission to open this Jupyter Workspace, so it wasn't changed.", success: false };
        }
        if (getResponse.status === 404) {
          return { error: MISSING_OR_DENIED, success: false };
        }
        if (!getResponse.ok) {
          return { error: (await readFailure(getResponse)).message, success: false };
        }
        const saved = await getResponse.json();

        const inputs = Array.isArray(saved?.inputConfiguration) ? saved.inputConfiguration : [];
        const matched = inputs.filter((entry) => entry && String(entry.dataSourceId) === String(originId));
        if (matched.length === 0) {
          return { skipped: true, skipReason: 'no longer reads this DataSet', success: false };
        }
        const mergedInput = inputs.some((entry) => entry && String(entry.dataSourceId) === String(targetId));
        const writesOrigin = (Array.isArray(saved?.outputConfiguration) ? saved.outputConfiguration : []).some(
          (entry) => entry && String(entry.dataSourceId) === String(originId)
        );

        for (const entry of matched) {
          entry.dataSourceId = targetId;
        }
        // A null bootstrapKernel is how Domo is told this save has nothing to do
        // with the kernel: it then leaves the stored flag alone rather than
        // rewriting it from a value we only echoed back.
        saved.bootstrapKernel = null;

        const putResponse = await fetch(url, {
          // The whole object goes back: Domo deletes and re-inserts every
          // configuration list on save, so anything omitted here is dropped.
          body: JSON.stringify(saved),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!putResponse.ok) {
          const failure = await readFailure(putResponse);
          // Matched against the whole body, since Domo reports the refusal by
          // exception class and not always in a field we read.
          if (/WorkspaceDataSetPermission/i.test(failure.text)) {
            return {
              error:
                "You don't have access to the target DataSet, so Domo won't let it be added as an input to this Jupyter Workspace.",
              success: false
            };
          }
          if (putResponse.status === 403) {
            return { error: "You don't have permission to edit this Jupyter Workspace, so it wasn't changed.", success: false };
          }
          if (putResponse.status === 404) {
            return { error: MISSING_OR_DENIED, success: false };
          }
          return { error: failure.message, success: false };
        }

        // Best-effort read-back. This endpoint has no known silent no-op, so an
        // unreadable response body isn't treated as a failed save.
        const after = await putResponse.json().catch(() => null);
        if (Array.isArray(after?.inputConfiguration)) {
          const stale = after.inputConfiguration.some((entry) => entry && String(entry.dataSourceId) === String(originId));
          if (stale) return { error: 'The Jupyter Workspace still reads the original DataSet after saving.', success: false };
        }

        return { mergedInput, success: true, writesOrigin };
      } catch (error) {
        return { error: error.message, success: false };
      }
    },
    [workspace.id, originId, targetId],
    tabId
  );

  if (!result?.success) return result ?? { error: 'No result came back from the Domo page.', success: false };

  // Neither of these blocks the repoint, but both need a person to finish.
  const unhandled = [];
  if (hasEffectiveMapping(columnMap) || (droppedColumns?.length ?? 0) > 0) {
    unhandled.push('notebook code referencing renamed or dropped columns');
  }
  if (result.writesOrigin) unhandled.push('an output still writing to the original DataSet');

  return {
    ...(result.mergedInput ? { mergedInput: true } : {}),
    ...(unhandled.length > 0 ? { unhandled } : {}),
    success: true
  };
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
