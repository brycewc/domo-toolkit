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
          create: functions,
          links: {},
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
 * Build the nested-reference graph among a dataset's Beast Modes: which Beast
 * Mode references which other Beast Mode. A nested Beast Mode references the
 * ones it nests by their numeric template id (`DOMO_BEAST_MODE(<id>)` in the
 * expression, listed in `functionTemplateDependencies`), NOT by the
 * `calculation_<uuid>` legacyId (that token is only how cards reference Beast
 * Modes). So migrating a Beast Mode requires migrating every Beast Mode it
 * nests, or its formula breaks on the target. This surfaces that relationship
 * at selection time so dependencies can be required up front.
 *
 * Takes the already-loaded `getDatasetFunctions` list (reusing its ids) and
 * hydrates each one's template via `getFunctionTemplate` with a bounded worker
 * pool (each call goes through `executeInPage`, so unbounded fan-out would
 * saturate the messaging bridge). A template that fails to fetch is skipped (no
 * out-edges) rather than failing the whole graph.
 *
 * Edges are restricted to Beast Modes in the passed list, so a dependency on a
 * Beast Mode that lives on another dataset is ignored for free (its id isn't in
 * the local set).
 *
 * @param {Array<{id: any, name: string}>} beastModes
 * @param {number|null} [tabId]
 * @returns {Promise<Map<string, Set<string>>>} Beast Mode id -> set of the ids
 *   it nests (both within this dataset), as strings.
 */
export async function getBeastModeReferenceGraph(beastModes, tabId = null) {
  const graph = new Map();
  const list = (beastModes || []).filter((bm) => bm?.id != null);
  if (list.length === 0) return graph;
  const localIds = new Set(list.map((bm) => String(bm.id)));

  // Hydrate every Beast Mode's template, then read its dependencies. Bounded
  // concurrency mirrors the column scan: executeInPage runs through
  // chrome.scripting, so letting all N fetch at once stalls the bridge.
  const templates = new Map();
  const queue = [...list];
  const CONCURRENCY = 5;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const bm = queue.shift();
      if (!bm) return;
      try {
        templates.set(String(bm.id), await getFunctionTemplate(bm.id, tabId));
      } catch {
        // Skip: this Beast Mode contributes no out-edges. Non-fatal.
      }
    }
  });
  await Promise.allSettled(workers);

  for (const source of list) {
    const sourceId = String(source.id);
    const template = templates.get(sourceId);
    if (!template) continue;
    const refs = new Set();
    for (const dep of template.functionTemplateDependencies || []) {
      const depId = String(dep);
      if (depId !== sourceId && localIds.has(depId)) refs.add(depId);
    }
    graph.set(sourceId, refs);
  }
  return graph;
}

/**
 * Get the CARD-LEVEL Beast Modes associated with a dataset's cards (the inverse
 * of `getDatasetFunctions`). These live on a card rather than being saved to the
 * dataset, identified by a `DATA_SOURCE` link with `visible: false`. Used to
 * detect name collisions with the target dataset's Beast Modes: Domo rejects
 * saving a card whose card-level Beast Mode shares a name with a dataset-saved
 * Beast Mode on the same dataset, so a migrating card carrying such a name has
 * to be resolved first. `activeCardIds` ties each one to the card(s) it's on.
 *
 * @param {string} datasetId
 * @param {number|null} [tabId]
 * @returns {Promise<Array<{activeCardIds: string[], id: any, legacyId: string|null, name: string}>>}
 */
export async function getCardBeastModes(datasetId, tabId = null) {
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
          // Card-level Beast Modes: a DATA_SOURCE link that is NOT visible (the
          // visible link is the card). Dataset-saved ones (DATA_SOURCE visible)
          // are handled by getDatasetFunctions.
          const dataSourceLink = (f?.links || []).find((l) => l?.resource?.type === 'DATA_SOURCE');
          if (dataSourceLink && dataSourceLink.visible === true) continue;
          all.push({
            activeCardIds: (f?.activeLinks?.CARD || []).map((id) => {
              const s = String(id);
              return s.startsWith('dr:') ? s.split(':')[1] || s : s;
            }),
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
 * Get the Beast Modes SAVED TO a dataset (dataset-level Beast Modes).
 *
 * Excludes Variables (`variable: true`) — those are a separate type — and
 * card-level Beast Modes. The search by dataset returns both dataset-saved and
 * card-level Beast Modes; they're distinguished by the `DATA_SOURCE` link's
 * `visible` flag (`true` = saved to the dataset, `false` = lives on a card).
 * Card-level Beast Modes travel inside their card's definition, so they must
 * NOT be migrated as standalone dataset Beast Modes (creating one as a dataset
 * Beast Mode fails, and it cascades the rest of the bulk create).
 *
 * The search response carries `activeLinks.CARD` (the cards actively using each
 * Beast Mode), which drives the migration dependency lock; drill links arrive
 * as `dr:<drillId>:<rootId>` URNs and are normalized here to the bare drill card
 * id so they line up with the rest of the app's card ids. It does NOT include
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
          // Keep only Beast Modes saved to the dataset: their DATA_SOURCE link is
          // visible. Card-level Beast Modes (DATA_SOURCE link hidden) travel with
          // their card and aren't migrated standalone.
          const dataSourceLink = (f?.links || []).find((l) => l?.resource?.type === 'DATA_SOURCE');
          if (!dataSourceLink || dataSourceLink.visible !== true) continue;
          all.push({
            // A drill's link comes back as a `dr:<drillId>:<rootId>` URN, not a
            // bare card id. Normalize to the drillId (middle segment) so these
            // match the bare drill card ids the rest of the app uses; bare card
            // ids pass through unchanged.
            activeCardIds: (f?.activeLinks?.CARD || []).map((id) => {
              const s = String(id);
              return s.startsWith('dr:') ? s.split(':')[1] || s : s;
            }),
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
 * @returns {Promise<Array<Object>>} The raw function search results, each as returned by the API
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
          allFunctions.push(...data.results);
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
 * The full function objects returned by getOwnedFunctions already carry
 * everything the bulk update needs, so each is sent back with only its owner
 * overridden, no per-function template lookup required.
 * @param {Object[]} functions - Full function objects (from getOwnedFunctions) to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferFunctions(functions, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (functions, toUserId) => {
      const errors = [];
      const chunkSize = 100;
      let succeeded = 0;

      const updates = functions.map((func) => ({ ...func, owner: toUserId }));

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
    [functions, toUserId],
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
          links: {},
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
