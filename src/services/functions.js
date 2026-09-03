import { executeInPage } from '@/utils/executeInPage';

/**
 * Bulk-delete function templates (Beast Modes and/or Variables) in a single
 * call. Every Beast Mode and Variable is a function template, so the same bulk
 * endpoint deletes both. The caller owns confirmation; this just fires the
 * delete. Throws on a non-OK response so the caller can fall back to per-id
 * `deleteFunction` retries (matching the delete-unused-beast-modes CLI).
 *
 * @param {Object} params
 * @param {Array<string|number>} params.ids - Template ids to delete.
 * @param {number|null} [params.tabId]
 * @returns {Promise<void>}
 */
export async function bulkDeleteFunctions({ ids, tabId = null }) {
  return executeInPage(
    async (ids) => {
      const response = await fetch('/api/query/v1/functions/bulk/template', {
        body: JSON.stringify({ delete: ids }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        throw new Error(`HTTP ${response.status}: ${text}`.trim());
      }
    },
    [ids],
    tabId
  );
}

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
 * @returns {Promise<Object|null>} The raw `POST /functions/bulk/template`
 *   response, or null when the create answered without a JSON body.
 */
export async function createDatasetFunctions({ functions, tabId = null }) {
  // The bulk endpoint dedupes the create list by each entry's `id`, so every
  // entry needs a DISTINCT id even on create. The usual `0` placeholder is fine
  // for a single create, but two or more entries all carrying `0` make Domo
  // reject the whole batch ("functions to create have duplicate ids ... same
  // key: 0"). Stamp a distinct negative placeholder per entry: negatives can't
  // collide with real (positive) function ids, and the server still assigns and
  // returns the real ids in the response (callers read them back positionally).
  const create = (functions || []).map((fn, i) => ({ ...fn, id: -(i + 1) }));
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // turn Domo's rejection of the batch into silence. See executeInPage.
  const result = await executeInPage(
    async (create) => {
      const response = await fetch('/api/query/v1/functions/bulk/template', {
        body: JSON.stringify({
          create,
          links: {},
          strict: false
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return { error: `HTTP ${response.status}: ${text}`.trim(), ok: false };
      }
      // A create that answers without a JSON body still created the Beast Modes;
      // the caller falls back to reading them back by name.
      return { data: await response.json().catch(() => null), ok: true };
    },
    [create],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'The Beast Modes could not be created');
  return result.data;
}

/**
 * Delete a function template (Beast Mode or Variable).
 * @param {Object} params
 * @param {string} params.functionId - The function template ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 */
export async function deleteFunction({ functionId, tabId = null }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed delete report success. See executeInPage.
  const result = await executeInPage(
    async (functionId) => {
      const response = await fetch(`/api/query/v1/functions/template/${functionId}`, { method: 'DELETE' });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [functionId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to delete');
}

/**
 * Find unused function templates (Beast Modes and Variables) for one or more
 * owners and/or datasets. "Unused" mirrors the delete-unused-beast-modes CLI:
 * the search filters to `notNested` + `inactive` templates, i.e. top-level
 * functions with no active links to any card, view, alert, or other Beast Mode.
 * That server-side definition already excludes anything nested in or referenced
 * by another Beast Mode, so no reference graph is needed here.
 *
 * Because deletion is irreversible, each result is re-checked client-side and
 * any template still reporting active links is skipped (the CLI's guard).
 *
 * Variables are NOT filtered out (the `notvariable` filter is omitted); every
 * result carries its `variable` flag so the caller can group Beast Modes and
 * Variables separately, plus `locked` so locked templates can be presented as
 * an explicit opt-in.
 *
 * @param {Object} params
 * @param {Array<string|number>} [params.datasetIds] - Restrict to these datasets.
 * @param {Array<string|number>} [params.ownerIds] - Restrict to these owners.
 * @param {number|null} [params.tabId]
 * @returns {Promise<Array<{created: number|null, id: any, locked: boolean, name: string, owner: any, variable: boolean}>>}
 */
export async function findUnusedFunctions({ datasetIds = [], ownerIds = [], tabId = null }) {
  return executeInPage(
    async (datasetIds, ownerIds) => {
      // The `inactive` filter should guarantee no active links, but deletion is
      // irreversible, so sum every activeLinks bucket and skip any template that
      // still reports one.
      const activeLinkCount = (fn) =>
        Object.values(fn.activeLinks || {}).reduce((sum, links) => sum + (Array.isArray(links) ? links.length : 0), 0);

      const filters = [{ field: 'notNested' }, { field: 'inactive', value: true }];
      if (ownerIds.length > 0) filters.push({ field: 'owner', idList: ownerIds });
      if (datasetIds.length > 0) filters.push({ field: 'dataset', idList: datasetIds });

      const unused = [];
      const limit = 100;
      let offset = 0;
      let moreData = true;
      while (moreData) {
        const response = await fetch('/api/query/v1/functions/search', {
          body: JSON.stringify({
            filters,
            limit,
            offset,
            // The search returns zero results without a sort.
            sort: { ascending: true, field: 'created' }
          }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const results = data?.results || [];
        for (const fn of results) {
          if (activeLinkCount(fn) > 0) continue;
          unused.push({
            created: typeof fn.created === 'number' ? fn.created : null,
            id: fn.id,
            locked: fn.locked === true,
            name: fn.name || String(fn.id),
            owner: fn.owner ?? null,
            variable: fn.variable === true
          });
        }
        offset += limit;
        moreData = Boolean(data?.hasMore) && results.length > 0;
      }
      return unused;
    },
    [datasetIds, ownerIds],
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
  const templates = await hydrateFunctionTemplates(list, tabId);

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
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), so a failed
  // fetch would arrive as a null template and crash its caller. See executeInPage.
  const result = await executeInPage(
    async (functionId) => {
      const response = await fetch(`/api/query/v1/functions/template/${functionId}?hidden=true`, {
        credentials: 'include'
      });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true, template: await response.json() };
    },
    [functionId],
    tabId
  );
  if (!result?.ok || !result.template) throw new Error(result?.error || 'The Beast Mode definition could not be read');
  return result.template;
}

/**
 * Which of the passed Beast Modes nest another Beast Mode.
 *
 * Domo allows a Beast Mode to nest another but NOT to nest one that itself nests
 * a third: the create comes back `ILLEGAL_DEPTH`. So migrating a nested Beast
 * Mode has to know whether the Beast Mode it will nest on the target is already
 * a parent there, which happens as soon as a dependency reuses a same-named
 * target Beast Mode that has its own nesting.
 *
 * Reads each template's `functionTemplateDependencies` (Domo's authoritative
 * nesting list) rather than inferring from the search response's
 * `FUNCTION_TEMPLATE` links: those name a template's PARENTS, so deriving
 * parenthood from them misses a Beast Mode whose nested child isn't in the same
 * list (a card-level one, or one on another dataset). A template that fails to
 * load counts as not nesting; the migrate error path still reports the rejection.
 *
 * A Variable is listed as a dependency like a nested Beast Mode but does not
 * count toward the depth limit (verified via `functions/validateFunctions`).
 *
 * @param {Array<{id: any}>} beastModes
 * @param {number|null} [tabId]
 * @returns {Promise<Set<string>>} The ids, as strings, that nest at least one other Beast Mode.
 */
export async function getNestingBeastModeIds(beastModes, tabId = null) {
  const nesting = new Set();
  const list = (beastModes || []).filter((bm) => bm?.id != null);
  if (list.length === 0) return nesting;
  const templates = await hydrateFunctionTemplates(list, tabId);
  const depsById = new Map();
  for (const [id, template] of templates) {
    const deps = (template?.functionTemplateDependencies || []).map(String).filter((dep) => dep !== id);
    if (deps.length > 0) depsById.set(id, deps);
  }
  if (depsById.size === 0) return nesting;
  const depTemplates = await hydrateFunctionTemplates(
    [...new Set([...depsById.values()].flat())].map((id) => ({ id })),
    tabId
  );
  for (const [id, deps] of depsById) {
    // A dependency that won't load counts as a Beast Mode: warning about a depth
    // Domo would have allowed costs the user a rename, missing one costs them the
    // Beast Mode.
    if (deps.some((dep) => depTemplates.get(dep)?.variable !== true)) nesting.add(id);
  }
  return nesting;
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
 * Fetch each Beast Mode's full template, keyed by id as a string.
 *
 * Bounded concurrency mirrors the column scan: every fetch goes through
 * `executeInPage` (and so through chrome.scripting), so letting all N run at once
 * stalls the messaging bridge for everything else using it. One that fails to
 * load is left out of the map rather than failing the batch, so callers treat a
 * missing template as "nothing to contribute".
 *
 * @param {Array<{id: any}>} beastModes
 * @param {number|null} tabId
 * @returns {Promise<Map<string, Object>>}
 */
export async function hydrateFunctionTemplates(beastModes, tabId) {
  const templates = new Map();
  const queue = [...beastModes];
  const CONCURRENCY = 5;
  const workers = Array.from({ length: CONCURRENCY }, async () => {
    while (queue.length > 0) {
      const bm = queue.shift();
      if (!bm) return;
      try {
        templates.set(String(bm.id), await getFunctionTemplate(bm.id, tabId));
      } catch {
        // Skip: this Beast Mode contributes nothing. Non-fatal.
      }
    }
  });
  await Promise.allSettled(workers);
  return templates;
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
 * @returns {Promise<void>} Resolves when the batch is written; throws otherwise.
 */
export async function updateDatasetFunctions({ functions, tabId = null }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), so a rejected
  // batch would resolve here and be counted as written. See executeInPage.
  const result = await executeInPage(
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
        return { error: `HTTP ${response.status}: ${text}`.trim(), ok: false };
      }
      return { ok: true };
    },
    [functions],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'The Beast Modes could not be updated');
}
