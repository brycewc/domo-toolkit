/**
 * Pro-code app (Domo custom app / App Platform / "ryuu" app) column support for
 * Remap Columns and Migrate Content.
 *
 * A pro-code app binds to one or more datasets and references their columns. The
 * binding for a placed app card lives on that card's app instance
 * (`/domoapps/apps/v2/{instanceId}` → `mapping[]`). An instance with no mapping
 * of its own inherits the shared design version's manifest
 * (`/api/apps/v1/designs/{designId}/versions/{version}/assets?path=manifest.json`
 * → `datasetsMapping[]`, base64 under `content`), so that manifest is the base
 * when the instance carries nothing. Each placed card is repaired in isolation
 * like a chart card, and the design is only ever read, never written: Domo's own
 * editor leaves it alone, and rewriting it would repoint every other card built
 * from it.
 *
 * The app's own code references the stable `alias`; only the `columnName`
 * bridge to the real dataset column breaks on a rename, so a column repair
 * rewrites `columnName` and nothing else. Fields mapped to a Beast Mode via
 * `beastModeName` (rather than `columnName`) are out of scope.
 *
 * App cards surface as `domoapp` cards on the dataset → cards endpoint; the card
 * definition / card PUT endpoints 405 for them, which is why they get this
 * dedicated path instead of flowing through the cards group.
 */

import { executeInPage } from '@/utils/executeInPage';

/**
 * Detect aliases in a pro-code app's dataset bindings that would collapse onto the
 * same column after a column rename/migration. The app data layer returns each
 * underlying column only once, so when two aliases in the SAME binding resolve to
 * the same `columnName` only the first survives in every row and the rest silently
 * blank out, breaking those fields with no error.
 *
 * Detection is per binding group, not across them: an app can bind the same
 * dataset under multiple aliases, and each binding is its own `/data/v1/<alias>`
 * query, so two fields collide only when they share a group. Pass one group per
 * binding (each an array of that binding's `fields`); the origin → target
 * `columnMap` is the same map the swap applies. Beast-Mode-mapped fields are
 * excluded (they bind by `beastModeName`, not `columnName`).
 *
 * @param {Array<Array<{alias: string, columnName: string|null, beastModeName: string|null}>>} fieldGroups - One group per dataset binding for the migrated dataset.
 * @param {Record<string, string|null>} [columnMap] - Origin → target column name; null/no-op entries leave the column name unchanged.
 * @returns {Array<{columnName: string, aliases: string[]}>}
 */
export function findAppColumnCollisions(fieldGroups, columnMap) {
  const map = columnMap || {};
  const collisions = [];
  for (const fields of Array.isArray(fieldGroups) ? fieldGroups : []) {
    const byColumn = new Map();
    for (const field of Array.isArray(fields) ? fields : []) {
      if (!field || field.beastModeName != null) continue;
      const from = field.columnName;
      if (typeof from !== 'string') continue;
      // The resulting column is the remapped name when the map renames it, else
      // the field's existing column. Mirrors how swapAppColumns rewrites columnName.
      const to = map[from] != null && map[from] !== from ? map[from] : from;
      if (!byColumn.has(to)) byColumn.set(to, []);
      byColumn.get(to).push(field.alias);
    }
    for (const [columnName, aliases] of byColumn) {
      if (aliases.length > 1) collisions.push({ aliases, columnName });
    }
  }
  return collisions;
}

/**
 * Discover the pro-code app cards that consume this dataset. Splits the
 * downstream-cards list on `type === 'domoapp'`, batch-resolves each app card's
 * instance id, title and fullpage flag, then reads each instance's binding,
 * falling back to the design manifest when the instance carries no mapping.
 *
 * @param {string} datasetId
 * @param {number|null} [tabId]
 * @param {any[]|null} [rawCards] - Pre-fetched dataset → cards list (drill=true). Pass the shared fetch so the endpoint isn't hit twice; omit to fetch here.
 * @returns {Promise<Array<{id: number, instanceId: string, name: string, fullpage: boolean, designId: string|null, fields: Array<{alias: string, columnName: string|null, beastModeName: string|null}>, fieldGroups: Array<Array<{alias: string, columnName: string|null, beastModeName: string|null}>>}>>}
 */
export async function getDownstreamApps(datasetId, tabId = null, rawCards = null) {
  const cards = rawCards || (await fetchDownstreamCardsRaw(datasetId, tabId));
  const matchesDataset = (id) => id != null && String(id) === String(datasetId);
  const appCards = [];
  const seen = new Set();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (card?.type !== 'domoapp') continue;
    if (!matchesDataset(card.datasourceId)) continue;
    const cardId = card.id || card.kpiId || (typeof card.urn === 'string' ? parseInt(card.urn.split(':').pop(), 10) : null);
    if (!Number.isFinite(cardId) || seen.has(cardId)) continue;
    seen.add(cardId);
    appCards.push({ id: cardId, name: card.title || card.name || `App ${cardId}` });
  }
  if (appCards.length === 0) return [];
  return resolveAppInstances(appCards, datasetId, tabId);
}

/**
 * Repair (and optionally repoint) one pro-code app card's dataset binding, using
 * the same save Domo's own app editor performs: create a context seeded with the
 * current binding, PUT the edited mapping onto it, then commit it to the instance.
 * Every entry for the origin dataset is repaired, so an app that binds it under
 * several aliases has all of them moved.
 *
 * The base mapping is the instance's own when it has one and the design
 * manifest's otherwise, since an instance with no mapping inherits the design's.
 * Reading only the instance made those apps look unrelated to the dataset and the
 * repair silently wrote nothing.
 *
 * @param {Object} params
 * @param {{ instanceId: string, fullpage: boolean, name: string }} params.app
 * @param {Record<string, string|null>} [params.columnMap] - Origin → target column name. Null/no-op entries are skipped.
 * @param {string} params.originId - The dataset whose binding entry is rewritten.
 * @param {string} params.targetId - Destination dataset id (equals originId for an in-place remap).
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string, skipped?: boolean, skipReason?: string}>}
 */
export async function swapAppColumns({ app, columnMap, originId, tabId = null, targetId }) {
  const { fullpage, instanceId, name } = app || {};
  if (!instanceId) return { error: 'App card has no instance id', success: false };
  return executeInPage(
    async (instanceId, originId, targetId, columnMap, fullpage, cardTitle) => {
      const signature = (entry) =>
        JSON.stringify([
          String(entry?.dataSetId),
          (Array.isArray(entry?.fields) ? entry.fields : []).map((f) => f?.columnName ?? null)
        ]);
      try {
        const instRes = await fetch(`/domoapps/apps/v2/${instanceId}`, { credentials: 'include' });
        if (!instRes.ok) return { error: `GET app instance HTTP ${instRes.status}`, success: false };
        const instance = await instRes.json();
        const designId = instance?.designId || instance?.context?.designId || null;

        let mapping = Array.isArray(instance?.mapping) ? instance.mapping : [];
        if (mapping.length === 0) {
          mapping = (await readDesignMapping(designId, instance?.designVersion)) || [];
        }
        const seed = JSON.parse(JSON.stringify(mapping));
        const entries = mapping.filter((m) => m && String(m.dataSetId) === String(originId));
        if (entries.length === 0) {
          // The dataset lists this card as downstream, but nothing the app binds
          // reads it. Reporting success here is what made a stale listing look
          // like a completed repoint.
          return {
            error: 'App does not read this DataSet',
            skipped: true,
            skipReason: 'does not read this DataSet',
            success: false
          };
        }

        const map = columnMap || {};
        for (const entry of entries) {
          for (const field of Array.isArray(entry.fields) ? entry.fields : []) {
            // The app code references the stable alias; a Beast-Mode-mapped field
            // has no columnName bridge to repair, so leave it alone.
            if (!field || field.beastModeName != null) continue;
            const from = field.columnName;
            if (typeof from === 'string' && map[from] != null && map[from] !== from) {
              field.columnName = map[from];
            }
          }
          if (targetId && String(targetId) !== String(originId)) {
            entry.dataSetId = targetId;
          }
        }

        const createRes = await fetch('/domoapps/apps/v2/contexts', {
          body: JSON.stringify({
            accountMapping: instance.accountMapping || [],
            actionMapping: instance.actionMapping || [],
            collections: instance.collections || [],
            designId,
            designVersion: instance.designVersion ?? null,
            mapping: seed,
            packageMapping: instance.packageMapping || [],
            workflowMapping: instance.workflowMapping || []
          }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!createRes.ok) {
          const text = await createRes.text().catch(() => '');
          return { error: `POST app context HTTP ${createRes.status}: ${text}`.trim(), success: false };
        }
        // The create answers with [context, []].
        const created = await createRes.json();
        const context = Array.isArray(created) ? created[0] : created;
        if (!context?.id) return { error: 'Created app context has no id', success: false };

        const ctxRes = await fetch(`/domoapps/apps/v2/contexts/${context.id}`, {
          body: JSON.stringify({ ...context, mapping }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!ctxRes.ok) {
          const text = await ctxRes.text().catch(() => '');
          return { error: `PUT app context HTTP ${ctxRes.status}: ${text}`.trim(), success: false };
        }

        const params = new URLSearchParams({ cardTitle: cardTitle || '', fullpage: String(Boolean(fullpage)) });
        const commitRes = await fetch(`/domoapps/apps/v2/${instanceId}?${params.toString()}`, {
          body: JSON.stringify({ contextId: context.id, id: instanceId }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!commitRes.ok) {
          const text = await commitRes.text().catch(() => '');
          return { error: `PUT app instance HTTP ${commitRes.status}: ${text}`.trim(), success: false };
        }

        // The commit answers with the saved instance, so the binding is verified
        // from it rather than trusting the status code.
        const committed = await commitRes.json().catch(() => null);
        let saved = Array.isArray(committed?.mapping) ? committed.mapping : null;
        if (!saved) {
          const verifyRes = await fetch(`/domoapps/apps/v2/${instanceId}`, { credentials: 'include' });
          const fresh = verifyRes.ok ? await verifyRes.json().catch(() => null) : null;
          saved = Array.isArray(fresh?.mapping) ? fresh.mapping : null;
        }
        if (!saved) return { error: 'Could not read back the saved app binding', success: false };
        const savedByAlias = new Map(saved.map((m) => [m?.alias, m]));
        for (const entry of entries) {
          const after = savedByAlias.get(entry.alias);
          if (!after || signature(after) !== signature(entry)) {
            return { error: `App binding "${entry.alias}" did not save`, success: false };
          }
        }

        return { success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
      }

      async function readDesignMapping(designId, designVersion) {
        if (!designId) return null;
        const metaRes = await fetch(`/api/apps/v1/designs/${designId}`, { credentials: 'include' });
        const version = designVersion || (metaRes.ok ? (await metaRes.json())?.latestVersion : null);
        if (!version) return null;
        const res = await fetch(`/api/apps/v1/designs/${designId}/versions/${version}/assets?path=manifest.json`, {
          credentials: 'include'
        });
        if (!res.ok) return null;
        const payload = await res.json();
        // The asset endpoint answers with the manifest base64-encoded under
        // `content`, not as the manifest itself.
        const manifest = payload?.content
          ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.content), (ch) => ch.charCodeAt(0))))
          : payload;
        return Array.isArray(manifest?.datasetsMapping) ? manifest.datasetsMapping : null;
      }
    },
    [instanceId, originId, targetId, columnMap || {}, Boolean(fullpage), name || ''],
    tabId
  );
}

/** Fetch the raw dataset → cards list (drill=true). */
async function fetchDownstreamCardsRaw(datasetId, tabId) {
  return executeInPage(
    async (datasetId) => {
      const response = await fetch(`/api/content/v1/datasources/${datasetId}/cards?drill=true`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error(`Failed to fetch cards for dataset ${datasetId}: HTTP ${response.status}`);
      return (await response.json()) || [];
    },
    [datasetId],
    tabId
  );
}

/**
 * Batch-resolve app cards to their instance ids, titles and fullpage flags, then
 * read each instance to extract the dataset binding. One bridge call: the batch
 * metadata fetch plus the per-instance reads all run in the page so a card list
 * of any size costs a single round trip.
 */
async function resolveAppInstances(appCards, datasetId, tabId) {
  return executeInPage(
    async (appCards, datasetId) => {
      const ids = appCards.map((c) => c.id);
      const metaRes = await fetch(
        `/api/content/v1/cards?urns=${ids.join(',')}&parts=metadata,domoapp&includeFiltered=true`,
        { credentials: 'include' }
      );
      if (!metaRes.ok) throw new Error(`Failed to fetch app card metadata: HTTP ${metaRes.status}`);
      const metaCards = (await metaRes.json()) || [];
      const metaById = new Map();
      for (const m of metaCards) {
        const cid = m.id || (typeof m.urn === 'string' ? m.urn.split(':').pop() : null);
        if (cid != null) metaById.set(String(cid), m);
      }

      // Cards placed from the same design share its manifest, so it is fetched
      // once per design rather than once per card.
      const designMappings = new Map();
      const designMappingFor = async (designId, designVersion) => {
        if (!designId) return [];
        if (designMappings.has(designId)) return designMappings.get(designId);
        let mapping = [];
        try {
          const metaRes = await fetch(`/api/apps/v1/designs/${designId}`, { credentials: 'include' });
          const version = designVersion || (metaRes.ok ? (await metaRes.json())?.latestVersion : null);
          if (version) {
            const res = await fetch(`/api/apps/v1/designs/${designId}/versions/${version}/assets?path=manifest.json`, {
              credentials: 'include'
            });
            if (res.ok) {
              const payload = await res.json();
              // The asset endpoint answers with the manifest base64-encoded under
              // `content`, not as the manifest itself.
              const manifest = payload?.content
                ? JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(payload.content), (ch) => ch.charCodeAt(0))))
                : payload;
              if (Array.isArray(manifest?.datasetsMapping)) mapping = manifest.datasetsMapping;
            }
          }
        } catch {
          mapping = [];
        }
        designMappings.set(designId, mapping);
        return mapping;
      };

      const rows = [];
      for (const card of appCards) {
        const meta = metaById.get(String(card.id));
        const instanceId = meta?.domoapp?.id;
        if (!instanceId) continue;
        let instRes;
        try {
          instRes = await fetch(`/domoapps/apps/v2/${instanceId}`, { credentials: 'include' });
        } catch {
          continue;
        }
        if (!instRes.ok) continue;
        const instance = await instRes.json();
        const designId = instance?.designId || instance?.context?.designId || null;
        // An instance with no mapping of its own runs on the design's, so that
        // manifest is the binding for these cards.
        let mapping = Array.isArray(instance?.mapping) ? instance.mapping : [];
        if (mapping.length === 0) mapping = await designMappingFor(designId, instance?.designVersion);
        // The same dataset can be bound under multiple aliases; collect every
        // matching binding. `fieldGroups` keeps them separate (each is its own
        // query, so collision detection is per group); `fields` is the flattened
        // union, used by the column-reference scan.
        const entries = mapping.filter((m) => m && String(m.dataSetId) === String(datasetId));
        const fieldGroups = entries.map((e) => (Array.isArray(e.fields) ? e.fields : []));
        // `metadata.fullpage` comes back as a string ("true"/"false"), so parse
        // it rather than coercing (Boolean('false') is truthy).
        const fp = meta?.metadata?.fullpage;
        rows.push({
          designId,
          fieldGroups,
          fields: fieldGroups.flat(),
          fullpage: fp === true || fp === 'true',
          id: card.id,
          instanceId,
          name: meta?.title || card.name
        });
      }
      return rows;
    },
    [appCards, datasetId],
    tabId
  );
}
