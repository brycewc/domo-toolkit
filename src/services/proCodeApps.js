/**
 * Pro-code app (Domo custom app / App Platform / "ryuu" app) column support for
 * Remap Columns and Migrate Content.
 *
 * A pro-code app binds to one or more datasets and references their columns. The
 * live binding each placed app card uses lives on that card's instance context
 * (`/domoapps/apps/v2/{instanceId}` → `context.mapping[]`), separate from the
 * shared design version's manifest
 * (`/api/apps/v1/designs/{designId}/versions/{version}/assets?path=manifest.json`
 * → `datasetsMapping[]`). Each placed card is repaired in isolation like a chart
 * card by rewriting its instance binding.
 *
 * The design itself is repaired too, but only when its own binding still points
 * at the same source dataset as the card (design === source === card): that is
 * the one case where the card has not diverged from its design, so repointing the
 * shared design is safe and keeps the editor preview and any future cards built
 * from it in sync. When the card has diverged (its instance points somewhere the
 * design's manifest does not), the design is left untouched, since mutating it
 * would silently repoint every other card built from that design.
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
 * Detect aliases in a pro-code app's dataset binding that would collapse onto the
 * same column after a column rename/migration. The app data layer returns each
 * underlying column only once, so when two aliases resolve to the same
 * `columnName` only the first survives in every row and the rest silently blank
 * out, breaking those fields with no error. Given the binding's `fields` and the
 * origin → target `columnMap` (same map the swap applies), returns one group per
 * resulting column that 2+ aliases would share. Beast-Mode-mapped fields are
 * excluded (they bind by `beastModeName`, not `columnName`).
 *
 * @param {Array<{alias: string, columnName: string|null, beastModeName: string|null}>} fields
 * @param {Record<string, string|null>} [columnMap] - Origin → target column name; null/no-op entries leave the column name unchanged.
 * @returns {Array<{columnName: string, aliases: string[]}>}
 */
export function findAppColumnCollisions(fields, columnMap) {
  const map = columnMap || {};
  const byColumn = new Map();
  for (const field of Array.isArray(fields) ? fields : []) {
    if (!field || field.beastModeName != null) continue;
    const from = field.columnName;
    if (typeof from !== 'string') continue;
    // The resulting column is the remapped name when the map renames it, else the
    // field's existing column. This mirrors how swapAppColumns rewrites columnName.
    const to = map[from] != null && map[from] !== from ? map[from] : from;
    if (!byColumn.has(to)) byColumn.set(to, []);
    byColumn.get(to).push(field.alias);
  }
  const collisions = [];
  for (const [columnName, aliases] of byColumn) {
    if (aliases.length > 1) collisions.push({ aliases, columnName });
  }
  return collisions;
}

/**
 * Discover the pro-code app cards that consume this dataset. Splits the
 * downstream-cards list on `type === 'domoapp'`, batch-resolves each app card's
 * instance id / title / fullpage flag, then reads each instance's live context
 * to pull the dataset binding (`mapping[]` entry for this dataset).
 *
 * @param {string} datasetId
 * @param {number|null} [tabId]
 * @param {any[]|null} [rawCards] - Pre-fetched dataset → cards list (drill=true). Pass the shared fetch so the endpoint isn't hit twice; omit to fetch here.
 * @returns {Promise<Array<{id: number, instanceId: string, contextId: string, name: string, fullpage: boolean, designId: string|null, fields: Array<{alias: string, columnName: string|null, beastModeName: string|null}>}>>}
 */
export async function getDownstreamApps(datasetId, tabId = null, rawCards = null) {
  const cards = rawCards || (await fetchDownstreamCardsRaw(datasetId, tabId));
  const matchesDataset = (id) => id != null && String(id) === String(datasetId);
  const appCards = [];
  const seen = new Set();
  for (const card of Array.isArray(cards) ? cards : []) {
    if (card?.type !== 'domoapp') continue;
    if (!matchesDataset(card.datasourceId)) continue;
    const cardId =
      card.id || card.kpiId || (typeof card.urn === 'string' ? parseInt(card.urn.split(':').pop(), 10) : null);
    if (!Number.isFinite(cardId) || seen.has(cardId)) continue;
    seen.add(cardId);
    appCards.push({ id: cardId, name: card.title || card.name || `App ${cardId}` });
  }
  if (appCards.length === 0) return [];
  return resolveAppInstances(appCards, datasetId, tabId);
}

/**
 * Repair (and optionally repoint) one pro-code app card's dataset binding.
 * Reads the live instance context, rewrites the mapping entry's
 * `fields[].columnName` per `columnMap` (skipping Beast Mode fields), repoints
 * the entry's `dataSetId` when migrating (origin !== target), and saves with the
 * editor's two-PUT sequence: PUT the full context back in place, then PUT the
 * instance to re-bind the (same) context to the card.
 *
 * After the instance is saved, the shared design's manifest is repaired the same
 * way, but ONLY when the design's own binding still points at `originId` (i.e.
 * design === source === card). In that aligned case the design's
 * `datasetsMapping` entry gets the same `columnName` rewrites and `dataSetId`
 * repoint and is written back via the design asset endpoint, so the editor
 * preview and future cards match. When the design's binding has diverged from the
 * card, the design is left untouched. The design write is best-effort: a failure
 * is reported in `designError` but does not fail the (already-saved) instance
 * repair.
 *
 * @param {Object} params
 * @param {{ instanceId: string, contextId: string, fullpage: boolean, name: string }} params.app
 * @param {Record<string, string|null>} [params.columnMap] - Origin → target column name. Null/no-op entries are skipped.
 * @param {string} params.originId - The dataset whose binding entry is rewritten.
 * @param {string} params.targetId - Destination dataset id (equals originId for an in-place remap).
 * @param {number|null} [params.tabId]
 * @returns {Promise<{success: boolean, error?: string, designUpdated?: boolean, designError?: string}>}
 */
export async function swapAppColumns({ app, columnMap, originId, tabId = null, targetId }) {
  const { fullpage, instanceId, name } = app || {};
  if (!instanceId) return { error: 'App card has no instance id', success: false };
  return executeInPage(
    async (instanceId, originId, targetId, columnMap, fullpage, cardTitle) => {
      try {
        const getRes = await fetch(`/domoapps/apps/v2/${instanceId}`, { credentials: 'include' });
        if (!getRes.ok) return { error: `GET app instance HTTP ${getRes.status}`, success: false };
        const instance = await getRes.json();
        const context = instance?.context;
        if (!context || !context.id) return { error: 'App instance has no context', success: false };

        const mapping = Array.isArray(context.mapping) ? context.mapping : [];
        const entry = mapping.find((m) => m && String(m.dataSetId) === String(originId));
        // Nothing on this app references the origin dataset — nothing to repair.
        if (!entry) return { success: true };

        const map = columnMap || {};
        for (const field of Array.isArray(entry.fields) ? entry.fields : []) {
          // The app code references the stable alias; a Beast-Mode-mapped field
          // has no columnName bridge to repair, so leave it alone.
          if (!field || field.beastModeName != null) continue;
          const from = field.columnName;
          if (typeof from === 'string' && map[from] != null && map[from] !== from) {
            field.columnName = map[from];
          }
        }
        // Repoint the binding to the target dataset when migrating. A no-op for an
        // in-place remap (origin === target).
        if (targetId && String(targetId) !== String(originId)) {
          entry.dataSetId = targetId;
        }

        const contextId = context.id;
        const ctxRes = await fetch(`/domoapps/apps/v2/contexts/${contextId}`, {
          body: JSON.stringify(context),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!ctxRes.ok) {
          const text = await ctxRes.text().catch(() => '');
          return { error: `PUT app context HTTP ${ctxRes.status}: ${text}`.trim(), success: false };
        }

        const params = new URLSearchParams({ cardTitle: cardTitle || '', fullpage: String(Boolean(fullpage)) });
        const instRes = await fetch(`/domoapps/apps/v2/${instanceId}?${params.toString()}`, {
          body: JSON.stringify({ contextId, id: instanceId }),
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!instRes.ok) {
          const text = await instRes.text().catch(() => '');
          return { error: `PUT app instance HTTP ${instRes.status}: ${text}`.trim(), success: false };
        }

        // The instance is repaired. Now repoint the shared design too, but only
        // when its own binding still points at the source dataset (design ===
        // source === card). When the card has diverged from its design, leave the
        // design alone so we never repoint every other card built from it. This
        // is best-effort: a failure here is reported but does not fail the
        // already-saved instance repair.
        let designUpdated = false;
        let designError = null;
        const designId = context.designId;
        if (designId) {
          try {
            const metaRes = await fetch(`/api/apps/v1/designs/${designId}`, { credentials: 'include' });
            const version = metaRes.ok ? (await metaRes.json())?.latestVersion : null;
            if (version) {
              const assetUrl = `/api/apps/v1/designs/${designId}/versions/${version}/assets?path=manifest.json`;
              const manRes = await fetch(assetUrl, { credentials: 'include' });
              if (manRes.ok) {
                const manifest = await manRes.json();
                const designMapping = Array.isArray(manifest.datasetsMapping) ? manifest.datasetsMapping : [];
                // Update the design only when it binds the same source dataset as
                // the card. A missing entry means the design has diverged — skip it.
                const designEntry = designMapping.find((m) => m && String(m.dataSetId) === String(originId));
                if (designEntry) {
                  let changed = false;
                  for (const field of Array.isArray(designEntry.fields) ? designEntry.fields : []) {
                    if (!field || field.beastModeName != null) continue;
                    const from = field.columnName;
                    if (typeof from === 'string' && map[from] != null && map[from] !== from) {
                      field.columnName = map[from];
                      changed = true;
                    }
                  }
                  if (targetId && String(targetId) !== String(originId)) {
                    designEntry.dataSetId = targetId;
                    changed = true;
                  }
                  if (changed) {
                    const wRes = await fetch(assetUrl, {
                      body: JSON.stringify(manifest),
                      credentials: 'include',
                      headers: { 'Content-Type': 'application/json' },
                      method: 'POST'
                    });
                    if (wRes.ok) {
                      designUpdated = true;
                    } else {
                      const t = await wRes.text().catch(() => '');
                      designError = `POST design manifest HTTP ${wRes.status}: ${t}`.trim();
                    }
                  }
                }
              }
            }
          } catch (err) {
            designError = err?.message || String(err);
          }
        }

        return { designError, designUpdated, success: true };
      } catch (err) {
        return { error: err?.message || String(err), success: false };
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
 * Batch-resolve app cards to their instance ids / titles / fullpage flags, then
 * read each instance's live context to extract the dataset binding. One bridge
 * call: the batch metadata fetch plus the per-instance context reads all run in
 * the page so a card list of any size costs a single round trip.
 */
async function resolveAppInstances(appCards, datasetId, tabId) {
  return executeInPage(
    async (appCards, datasetId) => {
      const ids = appCards.map((c) => c.id);
      const metaRes = await fetch(
        `/api/content/v1/cards?urns=${ids.join(',')}&parts=metadata,domoapp,datasources&includeFiltered=true`,
        { credentials: 'include' }
      );
      if (!metaRes.ok) throw new Error(`Failed to fetch app card metadata: HTTP ${metaRes.status}`);
      const metaCards = (await metaRes.json()) || [];
      const metaById = new Map();
      for (const m of metaCards) {
        const cid = m.id || (typeof m.urn === 'string' ? m.urn.split(':').pop() : null);
        if (cid != null) metaById.set(String(cid), m);
      }

      const rows = [];
      for (const card of appCards) {
        const meta = metaById.get(String(card.id));
        const instanceId = meta?.domoapp?.id;
        if (!instanceId) continue;
        let ctxRes;
        try {
          ctxRes = await fetch(`/domoapps/apps/v2/${instanceId}`, { credentials: 'include' });
        } catch {
          continue;
        }
        if (!ctxRes.ok) continue;
        const instance = await ctxRes.json();
        const context = instance?.context;
        if (!context) continue;
        const mapping = Array.isArray(context.mapping) ? context.mapping : [];
        const entry = mapping.find((m) => m && String(m.dataSetId) === String(datasetId));
        // `metadata.fullpage` comes back as a string ("true"/"false"), so parse
        // it rather than coercing (Boolean('false') is truthy).
        const fp = meta?.metadata?.fullpage;
        rows.push({
          contextId: context.id,
          designId: context.designId || null,
          fields: Array.isArray(entry?.fields) ? entry.fields : [],
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
