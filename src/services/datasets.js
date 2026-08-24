import { getObjectType } from '@/models/DomoObjectType';
import { executeInPage } from '@/utils/executeInPage';

import { getJupyterWorkspaceDatasets } from './jupyterWorkspaces';
import { getUserName } from './users';

const DATASETS_PAGE_SIZE = 50;

/**
 * Cancel every currently running execution for a stream, not just the latest.
 * Domo can wedge a stream with several executions stuck in the ACTIVE state at
 * once, so this scans the most recent executions, aborts each one still ACTIVE,
 * and reports how many it cancelled. Running executions are always recent, so
 * the recent-window scan reliably covers the stuck ones.
 * @param {Object} params
 * @param {string|number} params.streamId - The stream ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{ cancelled: number }>} Count of executions that were aborted
 */
export async function cancelStreamExecution({ streamId, tabId }) {
  return executeInPage(
    async (streamId) => {
      const stateResponse = await fetch(`/api/data/v1/streams/state/${streamId}`);
      if (!stateResponse.ok) {
        throw new Error(`Failed to fetch stream state for stream ${streamId}. HTTP status: ${stateResponse.status}`);
      }
      const stateData = await stateResponse.json();
      const limit = 100;
      const latestExecutionId = stateData[0]?.executionId ?? 0;
      const offset = latestExecutionId < limit ? 0 : latestExecutionId - limit;

      const listResponse = await fetch(`/api/data/v1/streams/${streamId}/executions?limit=${limit}&offset=${offset}`);
      if (!listResponse.ok) {
        throw new Error(`Failed to fetch executions for stream ${streamId}. HTTP status: ${listResponse.status}`);
      }
      const executions = await listResponse.json();
      const running = executions.filter((execution) => execution.currentState === 'ACTIVE');
      if (running.length === 0) {
        return { cancelled: 0 };
      }

      const outcomes = await Promise.allSettled(
        running.map(async (execution) => {
          const abortResponse = await fetch(`/api/data/v1/streams/${streamId}/executions/${execution.executionId}/abort`, {
            body: JSON.stringify({ category: 'CONNECTOR', message: 'Cancelled via Domo Toolkit' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!abortResponse.ok) {
            throw new Error(`execution ${execution.executionId} (HTTP ${abortResponse.status})`);
          }
          return abortResponse.json();
        })
      );

      const cancelled = outcomes.filter((outcome) => outcome.status === 'fulfilled').length;
      const failures = outcomes.filter((outcome) => outcome.status === 'rejected');
      if (failures.length > 0) {
        const detail = failures.map((failure) => failure.reason.message).join(', ');
        throw new Error(`Cancelled ${cancelled} of ${running.length} running updates; ${failures.length} failed: ${detail}`);
      }
      return { cancelled };
    },
    [streamId],
    tabId
  );
}

/**
 * Permanently delete a dataset.
 * @param {Object} params
 * @param {string} params.datasetId - The datasource ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteDataset({ datasetId, tabId = null }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed delete report success. See executeInPage.
  const result = await executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/data/v3/datasources/${datasetId}`, {
        method: 'DELETE'
      });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [datasetId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to delete dataset');
}

/**
 * Get the conditional-format ("color") rules for a dataset.
 * @param {string} datasetId - The dataset UUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of rule objects (empty if none)
 */
export async function getColorRules(datasetId, tabId = null) {
  return executeInPage(
    async (id) => {
      const response = await fetch('/api/content/v1/datasources/conditionalFormats', {
        body: JSON.stringify([id]),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch color rules. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data?.[id] || [];
    },
    [datasetId],
    tabId
  );
}

/**
 * Get a dataset's Beast Mode (calculated column) definitions.
 * Each value is keyed by its `calculation_<uuid>` id and includes at least a
 * `name`. Used by the Copy Color Rules view to remap rule references between
 * datasets — beast mode ids are not stable across datasets, but names usually are.
 * @param {string} datasetId - The dataset UUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Map of `calculation_<uuid>` to `{name, ...}` (empty if none)
 */
export async function getDatasetBeastModes(datasetId, tabId = null) {
  return executeInPage(
    async (id) => {
      const response = await fetch(`/api/data/v3/datasources/${id}?includeAllDetails=true`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset definition. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data?.properties?.formulas?.formulas || {};
    },
    [datasetId],
    tabId
  );
}

/**
 * Get a dataset's column schema (id, name, type, etc. per column)
 * @param {Object} params - Parameters
 * @param {string} params.datasetId - The dataset UUID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of column descriptors
 */
export async function getDatasetColumns({ datasetId, tabId }) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/query/v1/datasources/${datasetId}/schema/indexed`, {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch schema: HTTP ${response.status}`);
      }
      const schema = await response.json();
      return schema.tables?.[0]?.columns || [];
    },
    [datasetId],
    tabId
  );
}

/**
 * Count the objects downstream of a dataset, used to decide whether deleting it
 * is safe. Reads Domo's precomputed impact endpoint, which already rolls up the
 * full downstream blast radius, and sums the impact counts (every dataflow,
 * dataset, card, and alert that ultimately depends on this dataset). The
 * `impact*` fields are the transitive totals; the unprefixed counts are direct
 * children only.
 * @param {Object} params
 * @param {string} params.datasetId - The datasource ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<number>} Total downstream impact (dataflows + datasets + cards + alerts)
 */
export async function getDatasetDependentCount({ datasetId, tabId = null }) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/data/v1/impacts/DATA_SOURCE/${datasetId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const impact = await response.json();
      return (
        (impact.impactCardCount || 0) +
        (impact.impactDataFlowCount || 0) +
        (impact.impactDataSourceCount || 0) +
        (impact.impactAlertCount || 0)
      );
    },
    [datasetId],
    tabId
  );
}

/**
 * Bulk-fetch the full dataset records for a lightweight list of dataset
 * references (account datasets, dataflow inputs/outputs, etc.).
 *
 * These reference lists arrive with only an id and name per entry, everything
 * else null. This pulls the complete records so a related-data tab can show
 * real owners, row counts, types, and the like instead of just id and name.
 * Datasets the user can't access are dropped by the bulk endpoint, so the
 * result may be shorter than the input list.
 *
 * @param {Object} params - Parameters
 * @param {Array<{dataSourceId: string}>} params.datasets - Light dataset reference list
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of full dataset objects (empty if none)
 */
export async function getDatasetDetailsForList({ datasets, tabId }) {
  const datasetIds = (datasets || []).map((ds) => ds.dataSourceId).filter(Boolean);
  if (datasetIds.length === 0) return [];

  return executeInPage(
    async (datasetIds) => {
      const response = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true', {
        body: JSON.stringify(datasetIds),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch dataset details. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data.dataSources || [];
    },
    [datasetIds],
    tabId
  );
}

/**
 * Get a preview of a dataset's data (first N rows)
 * @param {string} datasetId - The dataset UUID
 * @param {number} [tabId] - Optional Chrome tab ID
 * @param {number} [limit=100] - Max rows to return
 * @returns {Promise<{headers: string[], rows: Array[]}>}
 */
export async function getDatasetPreview(datasetId, tabId = null, limit = 100) {
  const columns = await getDatasetColumns({ datasetId, tabId });
  const headers = columns.map((col) => col.name);

  const rows = await executeInPage(
    async (datasetId, columns, limit) => {
      const response = await fetch(`/api/query/v1/execute/${datasetId}`, {
        body: JSON.stringify({
          context: {
            calendar: 'StandardCalendar',
            features: {
              AllowNullValues: true,
              TreatNumbersAsStrings: true
            }
          },
          query: {
            columns: columns.map((col) => ({ column: col.id, exprType: 'COLUMN' })),
            groupByColumns: [],
            having: null,
            limit: { limit, offset: 0 },
            orderByColumns: [],
            where: null
          },
          querySource: 'data_table',
          useCache: true
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to fetch preview: HTTP ${response.status}`);
      }

      const data = await response.json();
      return data.rows || [];
    },
    [datasetId, columns, limit],
    tabId
  );

  return { headers, rows };
}

/**
 * Get the datasets fed by a connector account.
 * @param {Object} params - Parameters
 * @param {string|number} params.accountId - The account ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of dataset objects (each keyed by dataSourceId/dataSourceName)
 */
export async function getDatasetsForAccount({ accountId, tabId }) {
  return executeInPage(
    async (accountId) => {
      const response = await fetch(`/api/data/v2/datasources/account/${accountId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch datasets for account ${accountId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [accountId],
    tabId
  );
}

/**
 * Get all datasets for a data app or worksheet
 * @param {Object} params - Parameters
 * @param {string|number} params.appId - The data app or worksheet ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForApp({ appId, tabId }) {
  const fetchLogic = async (appId) => {
    const response = await fetch(`/api/content/v1/dataapps/${appId}/dataSources`);

    if (!response.ok) {
      throw new Error(`Failed to fetch datasets for app ${appId}. HTTP status: ${response.status}`);
    }

    return response.json();
  };

  try {
    return await executeInPage(fetchLogic, [appId], tabId);
  } catch (error) {
    console.error('[getDatasetsForApp] Error:', error);
    throw error;
  }
}

/**
 * Get datasets from a dataflow's inputs and outputs
 * @param {Object} params - Parameters
 * @param {Object} params.details - The dataflow metadata.details object
 * @returns {{inputs: Array<{id: string, name: string}>, outputs: Array<{id: string, name: string}>}}
 */
export function getDatasetsForDataflow({ details }) {
  const inputs = (details?.inputs || []).map((input) => ({
    id: input.dataSourceId,
    name: input.dataSourceName || `Dataset ${input.dataSourceId}`
  }));

  const outputs = (details?.outputs || []).map((output) => ({
    id: output.dataSourceId,
    name: output.dataSourceName || `Dataset ${output.dataSourceId}`
  }));

  return { inputs, outputs };
}

/**
 * Get datasets from a Jupyter workspace's input and output configuration.
 * Mirrors `getDatasetsForDataflow`'s `{ inputs, outputs }` shape so the view can
 * render both the same way, but the workspace stores dataset references as
 * id-only configuration entries, so each side is enriched with the dataset's
 * core details (name, owner, etc.) before being returned.
 * @param {Object} params - Parameters
 * @param {Object} params.details - The workspace metadata.details object
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{inputs: Array<Object>, outputs: Array<Object>}>}
 */
export async function getDatasetsForJupyterWorkspace({ details, tabId }) {
  const [inputs, outputs] = await Promise.all([
    getJupyterWorkspaceDatasets({ entries: details?.inputConfiguration, tabId }),
    getJupyterWorkspaceDatasets({ entries: details?.outputConfiguration, tabId })
  ]);
  return { inputs, outputs };
}

/**
 * Get datasets used by a page or app studio view
 * @param {Object} params - Parameters
 * @param {string|number} params.pageId - The page ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForPage({ pageId, tabId }) {
  const fetchLogic = async (pageId) => {
    console.log('[getDatasetsForPage] Fetching datasets for page:', pageId);
    const response = await fetch(`/api/content/v1/datasources/pages/${pageId}`);

    if (!response.ok) {
      throw new Error(`Failed to fetch datasets for page ${pageId}. HTTP status: ${response.status}`);
    }

    const data = await response.json();
    console.log('[getDatasetsForPage] API response:', data);
    const result = data.dataSources || [];
    console.log('[getDatasetsForPage] Returning datasets:', result);
    return result;
  };

  try {
    const result = await executeInPage(fetchLogic, [pageId], tabId);
    console.log('[getDatasetsForPage] executeInPage result:', result);
    return result;
  } catch (error) {
    console.error('[getDatasetsForPage] Error:', error);
    throw error;
  }
}

/**
 * Get datasets used by a dataset view (dataset-view or datafusion)
 * @param {Object} params - Parameters
 * @param {string|number} params.datasetId - The datasource ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>} Array of dataset objects
 */
export async function getDatasetsForView({ datasetId, tabId }) {
  const fetchLogic = async (datasetId) => {
    // 1) Get the schema to extract dataset IDs
    const schemaResponse = await fetch(`/api/query/v1/datasources/${datasetId}/schema/indexed?includeHidden=true`);

    if (!schemaResponse.ok) {
      throw new Error(`Failed to fetch schema for datasource ${datasetId}. HTTP status: ${schemaResponse.status}`);
    }

    const schema = await schemaResponse.json();

    // 2) Extract source dataset IDs by walking the WHOLE definition, not just the
    // top-level FROM/JOIN. A UNION view nests each branch's table deep under a
    // SUB_SELECT, and a data fusion carries its inputs on `from` / `datasource`
    // string fields; the old shallow read saw neither and returned nothing for
    // those views. This collects every dataset-UUID table reference (SQL `TABLE`
    // nodes plus fusion `from`/`datasource` fields) and drops the view's own id.
    const idsSet = new Set();
    const stripTicks = (s) => (typeof s === 'string' ? s.replace(/`/g, '') : s);
    const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const addId = (raw) => {
      const value = stripTicks(raw);
      if (typeof value === 'string' && uuidRe.test(value) && value !== datasetId) idsSet.add(value);
    };
    const walk = (node) => {
      if (node == null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        for (const item of node) walk(item);
        return;
      }
      if (node['@type'] === 'TABLE') addId(node.name);
      if (typeof node.from === 'string') addId(node.from);
      if (typeof node.datasource === 'string') addId(node.datasource);
      for (const value of Object.values(node)) walk(value);
    };
    walk(schema);
    const datasetIds = Array.from(idsSet);

    if (datasetIds.length === 0) {
      return [];
    }

    // 3) Get names for all datasets using bulk endpoint
    const bulkResponse = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&includeAllDetails=true', {
      body: JSON.stringify(datasetIds),
      headers: {
        'Content-Type': 'application/json'
      },
      method: 'POST'
    });

    if (!bulkResponse.ok) {
      // If bulk fails, return IDs without names
      console.warn('Bulk datasource fetch failed, returning IDs only');
      return datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
    }

    const namesResponse = await bulkResponse.json();
    const namesData = namesResponse.dataSources || [];
    const byId = Object.fromEntries(namesData.map((d) => [d.id || d.datasetId, d]));
    const ordered = datasetIds.map((id) => byId[id]).filter(Boolean);
    // console.log('[getDatasetsForView] ordered:', ordered);
    return ordered;
  };

  try {
    return await executeInPage(fetchLogic, [datasetId], tabId);
  } catch (error) {
    console.error('Error fetching datasets for view:', error);
    throw error;
  }
}

/**
 * Get dependent datasets for a dataset via the lineage API
 * @param {Object} params - Parameters
 * @param {string} params.datasetId - The datasource ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} Array of dataset objects with details
 */
export async function getDependentDatasets({ datasetId, tabId }) {
  const fetchLogic = async (datasetId) => {
    const lineageResponse = await fetch(
      `/api/data/v1/lineage/DATA_SOURCE/${datasetId}?traverseUp=false&requestEntities=DATA_SOURCE`
    );

    if (!lineageResponse.ok) {
      throw new Error(`Failed to fetch lineage for dataset ${datasetId}. HTTP status: ${lineageResponse.status}`);
    }

    const lineageData = await lineageResponse.json();

    const datasetIds = Object.values(lineageData)
      .filter((entry) => entry.type === 'DATA_SOURCE' && entry.id !== datasetId)
      .map((entry) => entry.id);

    if (datasetIds.length === 0) return [];

    const bulkResponse = await fetch(
      '/api/data/v3/datasources/bulk?includePrivate=true&part=core,impactcounts&includeFormulas=false',
      {
        body: JSON.stringify(datasetIds),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      }
    );

    if (!bulkResponse.ok) {
      console.warn('Bulk datasource fetch failed, returning IDs only');
      return datasetIds.map((id) => ({ id, name: `Dataset ${id}` }));
    }

    const bulkData = await bulkResponse.json();
    const datasources = bulkData.dataSources || [];
    const byId = Object.fromEntries(datasources.map((d) => [d.id, d]));
    return datasetIds.map((id) => byId[id]).filter(Boolean);
  };

  try {
    return await executeInPage(fetchLogic, [datasetId], tabId);
  } catch (error) {
    console.error('Error fetching dependent datasets:', error);
    throw error;
  }
}

/**
 * Find the dataset views (views / data fusions) built directly on top of the
 * given datasets. Domo rejects deleting a dataset that a view is built on, so a
 * dataflow's output datasets can't be deleted while any of these exist. Checks
 * every dataset in one page round-trip (like getDownstreamAlertsForDatasets),
 * reading only the DIRECT downstream DATA_SOURCE children of each, since a
 * view-of-a-view only blocks deleting the intermediate view, not the output.
 * Deduped across inputs. A dataset whose lineage lookup fails is returned in
 * `unverifiedOutputIds` rather than dropped, so callers can block instead of
 * allowing a delete that would fail at runtime.
 * @param {string[]} datasetIds - The datasource IDs to check
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<{unverifiedOutputIds: string[], views: Array<{id: string, name: string}>}>}
 */
export async function getDownstreamViewsForDatasets(datasetIds, tabId = null) {
  return executeInPage(
    async (datasetIds) => {
      const seen = new Set();
      const unverifiedOutputIds = [];

      for (const datasetId of datasetIds) {
        try {
          const url = `/api/data/v1/lineage/DATA_SOURCE/${datasetId}?maxDepth=1&requestEntities=DATA_SOURCE&traverseUp=false`;
          const response = await fetch(url, { credentials: 'include' });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const lineage = await response.json();
          const children = lineage[`DATA_SOURCE${datasetId}`]?.children || [];
          for (const child of children) {
            if (!child || child.type !== 'DATA_SOURCE') continue;
            const idStr = String(child.id);
            if (idStr === String(datasetId)) continue;
            seen.add(idStr);
          }
        } catch {
          unverifiedOutputIds.push(String(datasetId));
        }
      }

      const viewIds = [...seen];
      let views = [];
      if (viewIds.length > 0) {
        const bulkResponse = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&part=core', {
          body: JSON.stringify(viewIds),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (bulkResponse.ok) {
          const bulk = await bulkResponse.json();
          views = (bulk.dataSources || []).map((ds) => ({ id: ds.id, name: ds.name || `DataSet ${ds.id}` }));
        } else {
          views = viewIds.map((id) => ({ id, name: `DataSet ${id}` }));
        }
      }

      return { unverifiedOutputIds, views };
    },
    [datasetIds],
    tabId
  );
}

/**
 * Count what else depends on each of the given datasets, ignoring one dataflow.
 * Used before deleting a dataflow's input datasets: an input that only feeds the
 * dataflow being deleted is safe to remove, while one that also feeds other
 * dataflows, dataset views, or cards takes that content down with it (and a view
 * built on it makes Domo reject the delete outright).
 *
 * Counts only the DIRECT downstream neighbors of each dataset, since anything
 * further out is downstream of those, not of the input itself. Runs in one page
 * round-trip for the whole list. A dataset whose lookup fails comes back with
 * `unverified: true` rather than a misleading zero.
 * @param {Object} params
 * @param {string[]} params.datasetIds - The datasource IDs to check
 * @param {string|null} [params.excludeDataflowId] - Dataflow to leave out of the counts
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object<string, {cards: number, dataflows: number, unverified: boolean, views: number}>>}
 *   Keyed by dataset ID
 */
export async function getOtherDependentCountsForDatasets({ datasetIds, excludeDataflowId = null, tabId = null }) {
  if (!datasetIds || datasetIds.length === 0) return {};

  return executeInPage(
    async (datasetIds, excludeDataflowId) => {
      const counts = {};

      const fetchJson = async (url) => {
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      };

      for (const datasetId of datasetIds) {
        const entry = { cards: 0, dataflows: 0, unverified: false, views: 0 };
        counts[String(datasetId)] = entry;

        // One dataset's two lookups run together, but the list is walked one
        // dataset at a time so a wide input list doesn't flood the API.
        const [lineage, cards] = await Promise.allSettled([
          fetchJson(
            `/api/data/v1/lineage/DATA_SOURCE/${datasetId}?maxDepth=1&requestEntities=DATA_SOURCE,DATAFLOW&traverseUp=false`
          ),
          fetchJson(`/api/content/v1/datasources/${datasetId}/cards`)
        ]);

        if (lineage.status === 'fulfilled') {
          const children = lineage.value?.[`DATA_SOURCE${datasetId}`]?.children || [];
          for (const child of children) {
            if (!child) continue;
            if (child.type === 'DATAFLOW') {
              // The dataflow being deleted doesn't count: the input is only
              // shared if something else reads it too.
              if (excludeDataflowId && String(child.id) === String(excludeDataflowId)) continue;
              entry.dataflows += 1;
            } else if (child.type === 'DATA_SOURCE' && String(child.id) !== String(datasetId)) {
              entry.views += 1;
            }
          }
        } else {
          entry.unverified = true;
        }

        if (cards.status === 'fulfilled') {
          entry.cards = Array.isArray(cards.value) ? cards.value.length : 0;
        } else {
          entry.unverified = true;
        }
      }

      return counts;
    },
    [datasetIds, excludeDataflowId],
    tabId
  );
}

/**
 * Get all datasets owned by a user or group.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedDatasets(ownerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, ownerType) => {
      const response = await fetch('/api/data/ui/v3/datasources/ownedBy', {
        body: JSON.stringify([{ id: ownerId.toString(), type: ownerType }]),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();

      const ids = data && data.length > 0 && data[0].dataSourceIds ? data[0].dataSourceIds : [];
      if (ids.length === 0) return [];

      // Fetch names in bulk (max 100 per request)
      const batchSize = 100;
      const byId = {};
      for (let i = 0; i < ids.length; i += batchSize) {
        const chunk = ids.slice(i, i + batchSize);
        try {
          const bulkResponse = await fetch('/api/data/v3/datasources/bulk?includePrivate=true&part=core', {
            body: JSON.stringify(chunk),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (bulkResponse.ok) {
            const bulk = await bulkResponse.json();
            for (const d of bulk.dataSources || []) {
              byId[d.id] = d.name || d.id;
            }
          }
        } catch {
          // Skip failed batch — IDs will fall back to ID-as-name below
        }
      }
      return ids.map((id) => ({ id, name: byId[id] || id }));
    },
    [ownerId, ownerType],
    tabId
  );
}

export async function getProviders() {
  return executeInPage(async () => {
    const res = await fetch('/api/data/v1/providers');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);
}

/**
 * Fetch a stream's full definition. The account a connector-backed dataset pulls
 * from lives on this object, so it's the source of truth for swapping accounts.
 * @param {Object} params
 * @param {string|number} params.streamId - The stream ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} The stream definition
 */
export async function getStreamDefinition({ streamId, tabId }) {
  return executeInPage(
    async (streamId) => {
      const response = await fetch(`/api/data/v1/streams/${streamId}?fields=all`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stream ${streamId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [streamId],
    tabId
  );
}

/**
 * Get a single stream execution's detailed data
 * @param {Object} params - Parameters
 * @param {string|number} params.streamId - The stream ID
 * @param {string|number} params.executionId - The execution ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Execution object with detailed error data
 */
export async function getStreamExecution({ executionId, streamId, tabId }) {
  return executeInPage(
    async (streamId, executionId) => {
      const response = await fetch(`/api/data/v1/streams/${streamId}/executions/${executionId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch execution ${executionId} for stream ${streamId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [streamId, executionId],
    tabId
  );
}

export async function getStreamExecutions({ limit = 100, streamId, tabId }) {
  const result = await executeInPage(
    async (streamId, limit) => {
      const stateResponse = await fetch(`/api/data/v1/streams/state/${streamId}`);
      if (!stateResponse.ok) {
        throw new Error(`Failed to fetch stream state for stream ${streamId}. HTTP status: ${stateResponse.status}`);
      }
      const stateData = await stateResponse.json();
      const offset = stateData[0].executionId < limit ? 0 : stateData[0].executionId - limit;

      const response = await fetch(`/api/data/v1/streams/${streamId}/executions?limit=${limit}&offset=${offset}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch stream executions for stream ${streamId}. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return data;
    },
    [streamId, limit],
    tabId
  );
  return result;
}

/**
 * Check if a DATA_SOURCE is a view type (dataset-view or datafusion)
 * @param {Object} details - The metadata.details object
 * @returns {boolean}
 */
export function isViewType(details) {
  if (!details) return false;
  const viewTypes = ['dataset-view', 'datafusion'];
  return (
    viewTypes.includes(details.dataProviderType) ||
    viewTypes.includes(details.displayType) ||
    viewTypes.includes(details.type)
  );
}

/**
 * Trigger a stream to run now, re-importing its dataset. Takes the stream ID
 * (not the dataset ID) and posts an empty body, the same contract Domo's own
 * "Run" affordance uses. Returns the created execution when the response carries
 * a JSON body, otherwise null.
 * @param {Object} params
 * @param {string|number} params.streamId - The stream ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>} The created execution, or null
 */
export async function runStream({ streamId, tabId }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed run report success. See executeInPage.
  const result = await executeInPage(
    async (streamId) => {
      const response = await fetch(`/api/data/v1/streams/${streamId}/executions`, {
        method: 'POST'
      });
      if (!response.ok) {
        return { error: `Failed to run stream ${streamId}. HTTP status: ${response.status}`, ok: false };
      }
      const execution = await response.json().catch(() => null);
      return { execution, ok: true };
    },
    [streamId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to run stream');
  return result.execution;
}

/**
 * Search datasets by name (paginated) or look up a single dataset by ID.
 *
 * Mirrors the signature of `searchUsers` so consumers like DatasetComboBox can
 * stay structurally identical to OwnerComboBox. When `text` parses as a
 * DATA_SOURCE UUID the call swaps in a `databaseId` term filter so the result
 * collapses to that single dataset; otherwise it runs a name search.
 *
 * @param {string} text - Search text or a DATA_SOURCE UUID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @param {number} [offset=0] - Pagination offset
 * @returns {Promise<{totalCount: number|null, datasets: Array<Object>}>}
 */
export async function searchDatasets(text, tabId = null, offset = 0) {
  // Trim first: a pasted dataset ID is usually copied with surrounding
  // whitespace, which would otherwise fail the anchored UUID pattern.
  const trimmed = text?.trim() || '';
  const isId = !!trimmed && getObjectType('DATA_SOURCE').isValidObjectId(trimmed);

  // Mirror Domo's own dataset search: the top-level `query` stays '*' and the
  // search text rides in a filter. A valid dataset ID narrows to that one
  // dataset via a `databaseId` term filter; otherwise a name search uses a
  // `name_sort` wildcard so it matches the dataset name only. Putting the raw
  // text in the top-level `query` instead runs a broad relevance search across
  // every indexed field, which floods the list with unrelated matches.
  let filters = [];
  if (isId) {
    filters = [{ field: 'databaseId', filterType: 'term', value: trimmed }];
  } else if (trimmed) {
    filters = [{ field: 'name_sort', filterType: 'wildcard', query: `*${trimmed}*` }];
  }

  return executeInPage(
    async (filters, offset, count) => {
      const response = await fetch('/api/data/ui/v3/datasources/search', {
        body: JSON.stringify({
          combineResults: true,
          count,
          entities: ['DATASET'],
          filters,
          offset,
          query: '*',
          sort: {
            fieldSorts: [{ field: 'create_date', sortOrder: 'DESC' }],
            isRelevance: false
          }
        }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Failed to search datasets. Status: ${response.status}`);
      }
      const data = await response.json();
      return {
        datasets: data.dataSources || [],
        totalCount: data._metaData?.totalCount ?? null
      };
    },
    [filters, offset, DATASETS_PAGE_SIZE],
    tabId
  );
}

/**
 * Replace a dataset's conditional-format ("color") rules with the supplied list.
 * Each rule's `dataSourceId` (top level and inside `condition`) is rewritten to
 * the destination dataset id before sending — source rules carry references to
 * their original dataset that would otherwise persist on the destination.
 *
 * @param {string} datasetId - The destination dataset UUID
 * @param {Array<Object>} rules - Rule objects shaped like `{condition, format, dataSourceId}`
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>}
 */
export async function setColorRules(datasetId, rules, tabId = null) {
  const rewritten = rules.map((rule) => ({
    ...rule,
    condition: { ...rule.condition, dataSourceId: datasetId },
    dataSourceId: datasetId
  }));
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed save report success. See executeInPage.
  const result = await executeInPage(
    async (id, body) => {
      const response = await fetch(`/api/content/v1/datasources/conditionalFormats/${id}`, {
        body,
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) {
        return { error: `Failed to save color rules. HTTP status: ${response.status}`, ok: false };
      }
      return { ok: true };
    },
    [datasetId, JSON.stringify(rewritten)],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to save color rules');
}

export async function setStreamScheduleToManual({ streamId, tabId }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed schedule update report success. See executeInPage.
  const result = await executeInPage(
    async (streamId) => {
      const getResponse = await fetch(`/api/data/v1/streams/${streamId}?fields=all`);
      if (!getResponse.ok) {
        return { error: `Failed to fetch stream ${streamId}. HTTP status: ${getResponse.status}`, ok: false };
      }

      const definition = await getResponse.json();
      definition.scheduleState = 'MANUAL';
      definition.advancedScheduleJson = JSON.stringify({
        timezone: 'UTC',
        type: 'MANUAL'
      });

      const putResponse = await fetch(`/api/data/v1/streams/${streamId}`, {
        body: JSON.stringify(definition),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!putResponse.ok) {
        return { error: `Failed to update stream ${streamId}. HTTP status: ${putResponse.status}`, ok: false };
      }

      return { ok: true };
    },
    [streamId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to update stream schedule');
}

/**
 * Transfer dataset ownership to a new user or group.
 * @param {string[]} datasetIds - Array of dataset IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferDatasets(datasetIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  // Resolve the source user's name for the tag, but never let that lookup block
  // the transfer: on failure we proceed untagged rather than aborting ownership.
  // A group source has no getUserName equivalent, so it transfers untagged.
  const fromUserName = ownerType === 'GROUP' ? null : await getUserName(fromOwnerId, tabId).catch(() => null);
  return executeInPage(
    async (datasetIds, toOwnerId, fromUserName, ownerType) => {
      const errors = [];
      let succeeded = 0;
      const batchSize = 50;

      for (let i = 0; i < datasetIds.length; i += batchSize) {
        const chunk = datasetIds.slice(i, i + batchSize);
        try {
          const response = await fetch('/api/data/v1/ui/bulk/reassign', {
            body: JSON.stringify({
              ids: chunk,
              type: 'DATA_SOURCE',
              ...(ownerType === 'GROUP' ? { groupId: toOwnerId } : { userId: toOwnerId })
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);

          // Tag each reassigned dataset with its previous owner so the new owner
          // can see where it came from. Best-effort: ownership has already moved,
          // so a failed tag call must not flip the batch to failed (which would
          // wrongly report a successful transfer as failed and invite a retry).
          if (fromUserName) {
            try {
              const tagResponse = await fetch('/api/data/v1/ui/bulk/tag', {
                body: JSON.stringify({
                  bulkItems: { ids: chunk, type: 'DATA_SOURCE' },
                  tags: [`From ${fromUserName}`]
                }),
                headers: { 'Content-Type': 'application/json' },
                method: 'POST'
              });
              if (!tagResponse.ok) throw new Error(`HTTP ${tagResponse.status}`);
            } catch {
              // Best-effort tagging; the ownership transfer already succeeded.
            }
          }

          succeeded += chunk.length;
        } catch (error) {
          chunk.forEach((id) => errors.push({ error: error.message, id }));
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [datasetIds, toOwnerId, fromUserName, ownerType],
    tabId
  );
}

export async function updateDatasetProperties(datasetId, updates) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed properties update report success. See executeInPage.
  const result = await executeInPage(
    async (id, body) => {
      const res = await fetch(`/api/data/v3/datasources/${id}/properties`, {
        body,
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!res.ok) return { error: `HTTP ${res.status}`, ok: false };
      return { ok: true };
    },
    [datasetId, JSON.stringify(updates)]
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to update dataset properties');
}

/**
 * Swap the account(s) a stream pulls from. Re-points one or more of the stream's
 * existing accounts at new ones, leaving every other field of the definition
 * untouched, then PUTs the definition back (the same GET-mutate-PUT contract
 * `setStreamScheduleToManual` uses).
 *
 * A stream definition often carries both a singular `account` object and an
 * `accounts` array. The array is authoritative when populated: an empty `accounts`
 * means the stream uses the singular `account` (so we rewrite `account.id`),
 * otherwise we rewrite the matching entries in `accounts`.
 *
 * `accountChanges` maps an existing accountId to its replacement. We throw if no id
 * matched, since a zero-match PUT would silently report success without changing
 * anything.
 *
 * @param {Object} params
 * @param {string|number} params.streamId - The stream ID
 * @param {Object} params.accountChanges - Map of oldAccountId -> newAccountId
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on failure
 */
export async function updateStreamAccounts({ accountChanges, streamId, tabId }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed account switch report success. See executeInPage.
  const result = await executeInPage(
    async (streamId, changes) => {
      const getResponse = await fetch(`/api/data/v1/streams/${streamId}?fields=all`);
      if (!getResponse.ok) {
        return { error: `Failed to fetch stream ${streamId}. HTTP status: ${getResponse.status}`, ok: false };
      }
      const definition = await getResponse.json();

      // `changes` arrives as string-keyed pairs (JSON object keys are strings),
      // so compare ids loosely against both the numeric and string forms.
      const replacementFor = (id) => {
        if (id == null) return undefined;
        return changes[id] ?? changes[String(id)];
      };
      let replaced = 0;

      if (Array.isArray(definition.accounts) && definition.accounts.length > 0) {
        definition.accounts = definition.accounts.map((entry) => {
          if (!entry || typeof entry !== 'object') return entry;
          const next = replacementFor(entry.accountId ?? entry.id);
          if (next == null) return entry;
          replaced++;
          return 'accountId' in entry ? { ...entry, accountId: next } : { ...entry, id: next };
        });
      } else if (definition.account && typeof definition.account === 'object') {
        const next = replacementFor(definition.account.id);
        if (next != null) {
          definition.account = { ...definition.account, id: next };
          replaced++;
        }
      }

      if (replaced === 0) {
        return { error: 'Could not locate the account on the stream definition to switch.', ok: false };
      }

      const putResponse = await fetch(`/api/data/v1/streams/${streamId}`, {
        body: JSON.stringify(definition),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!putResponse.ok) {
        return { error: `Failed to update stream ${streamId}. HTTP status: ${putResponse.status}`, ok: false };
      }
      return { ok: true };
    },
    [streamId, accountChanges],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to update stream accounts');
}
