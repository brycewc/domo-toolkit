import { executeInPage } from '@/utils/executeInPage';

/**
 * Create Beast Mode templates in bulk on a target dataset.
 *
 * Each entry must be a fully-formed function template (clone an origin
 * template via `getFunctionTemplate`, rewrite its `expression` +
 * `columnPositions[].columnName`, and point its `DATA_SOURCE` link at the
 * target dataset). Returns the raw bulk response so the caller can read back
 * each created template's new `id`/`legacyId` and build the origin → target id
 * remap that repoints card references.
 *
 * @param {Object} params
 * @param {Array<Object>} params.functions - Create entries (see endpoint shape).
 * @param {number|null} [params.tabId]
 * @returns {Promise<Object>} The raw `POST /functions/bulk/template` response.
 */
export async function createDatasetFunctions({ functions, tabId = null }) {
  return executeInPage(
    async (functions) => {
      const response = await fetch('/api/query/v1/functions/bulk/template', {
        body: JSON.stringify({
          copyDependencies: true,
          create: functions,
          links: {},
          replaceLinks: true,
          strict: false
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text}`.trim());
      }
      return response.json();
    },
    [functions],
    tabId
  );
}

/**
 * Delete a function template (Beast Mode or Variable).
 * @param {Object} params
 * @param {string} params.functionId - The function template ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 */
export async function deleteFunction({ functionId, tabId = null }) {
  return executeInPage(
    async (functionId) => {
      const response = await fetch(`/api/query/v1/functions/template/${functionId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [functionId],
    tabId
  );
}

/**
 * Get the Beast Modes saved to a dataset.
 *
 * Excludes Variables (`variable: true`) — those are a separate type. The
 * search response carries `activeLinks.CARD` (the cards actively using each
 * Beast Mode), which drives the migration dependency lock. It does NOT include
 * the expression; hydrate that per-template via `getFunctionTemplate` when
 * scanning column refs or cloning for create.
 *
 * @param {string} datasetId
 * @param {number|null} [tabId]
 * @returns {Promise<Array<{activeCardIds: string[], dataType: string|null, id: any, legacyId: string|null, name: string}>>}
 */
export async function getDatasetFunctions(datasetId, tabId = null) {
  return executeInPage(
    async (datasetId) => {
      const all = [];
      const limit = 100;
      let offset = 0;
      let moreData = true;
      while (moreData) {
        const response = await fetch('/api/query/v1/functions/search', {
          body: JSON.stringify({
            filters: [{ field: 'dataset', idList: [datasetId] }],
            limit,
            offset,
            sort: { ascending: true, field: 'name' }
          }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const results = data?.results || [];
        for (const f of results) {
          if (f?.variable === true) continue;
          all.push({
            activeCardIds: (f?.activeLinks?.CARD || []).map((id) => String(id)),
            dataType: f.dataType || null,
            id: f.id,
            legacyId: f.legacyId || null,
            name: f.name || String(f.id)
          });
        }
        offset += limit;
        moreData = Boolean(data?.hasMore) && results.length > 0;
      }
      return all;
    },
    [datasetId],
    tabId
  );
}

/**
 * Fetch a single function template in full (includes `expression`,
 * `columnPositions`, `links`, `dataType`, etc.) — the fields needed to scan
 * its column refs and to clone it onto a target dataset.
 *
 * @param {string|number} functionId
 * @param {number|null} [tabId]
 * @returns {Promise<Object>}
 */
export async function getFunctionTemplate(functionId, tabId = null) {
  return executeInPage(
    async (functionId) => {
      const response = await fetch(`/api/query/v1/functions/template/${functionId}?hidden=true`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    [functionId],
    tabId
  );
}

/**
 * Get all beast mode formulas and variables owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{global: boolean, id: string, name: string}>>}
 */
export async function getOwnedFunctions(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allFunctions = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/query/v1/functions/search', {
          body: JSON.stringify({
            filters: [{ field: 'owner', idList: [userId] }],
            limit,
            offset,
            sort: { ascending: true, field: 'name' }
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.results && data.results.length > 0) {
          allFunctions.push(
            ...data.results.map((f) => ({
              global: f.global,
              id: f.id,
              name: f.name || f.id
            }))
          );
          offset += limit;
          moreData = data.hasMore;
        } else {
          moreData = false;
        }
      }

      return allFunctions;
    },
    [userId],
    tabId
  );
}

/**
 * Transfer function (beast mode/variable) ownership to a new user.
 * Handles link sanitization for functions with dead references.
 * @param {string[]} functionIds - Array of function IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferFunctions(functionIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (functionIds, fromUserId, toUserId) => {
      const errors = [];
      const updates = [];
      const chunkSize = 100;
      let succeeded = 0;

      for (const id of functionIds) {
        try {
          const response = await fetch(`/api/query/v1/functions/template/${id}?hidden=true`);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const func = await response.json();

          updates.push({
            id,
            links: func.links || [],
            owner: toUserId
          });
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      // Transfer in batches
      const bulkUrl = '/api/query/v1/functions/bulk/template';
      for (let i = 0; i < updates.length; i += chunkSize) {
        const chunk = updates.slice(i, i + chunkSize);
        try {
          const response = await fetch(bulkUrl, {
            body: JSON.stringify({ update: chunk }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded += chunk.length;
        } catch (error) {
          chunk.forEach((f) => errors.push({ error: error.message, id: f.id }));
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [functionIds, fromUserId, toUserId],
    tabId
  );
}

/**
 * Update Beast Mode templates in bulk (the "overwrite existing" disposition).
 *
 * Each entry must be a full template with the fields to change already
 * applied (typically a target template whose `expression` +
 * `columnPositions[].columnName` were rewritten via the column remap).
 *
 * @param {Object} params
 * @param {Array<Object>} params.functions - Update entries.
 * @param {number|null} [params.tabId]
 * @returns {Promise<Object>} The raw `POST /functions/bulk/template` response.
 */
export async function updateDatasetFunctions({ functions, tabId = null }) {
  return executeInPage(
    async (functions) => {
      const response = await fetch('/api/query/v1/functions/bulk/template', {
        body: JSON.stringify({
          copyDependencies: true,
          links: {},
          replaceLinks: true,
          strict: false,
          update: functions
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text}`.trim());
      }
      return response.json();
    },
    [functions],
    tabId
  );
}
