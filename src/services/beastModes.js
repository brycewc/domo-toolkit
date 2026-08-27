import { executeInPage } from '@/utils/executeInPage';

import { hydrateFunctionTemplates } from './functions';

/**
 * Read one Beast Mode's usage out of its own `links` array: the cards and drills
 * that use it, and the Beast Modes that nest it. Used before deleting a Beast
 * Mode, since Domo deletes one that is still in use without complaint, silently
 * breaking every card that references it.
 *
 * `links` comes straight from the template (`GET .../functions/template/{id}`),
 * which the detected object already carries, so no lookup is needed to find the
 * usage itself. A link's `active` flag is the usage signal: the search endpoint's
 * `activeLinks` map is just these links filtered to `active` and grouped by
 * resource type, which holds for card, drill, and nesting links alike. `visible`
 * is unrelated to usage; an active card link comes both ways.
 *
 * `DATA_SOURCE` links are excluded: they name the dataset the formula reads, not
 * a consumer, and Domo reports them `active: false` regardless. Counting one as
 * usage would block every Beast Mode's delete outright.
 *
 * `FUNCTION_TEMPLATE` links name the Beast Modes that nest THIS one (its parents,
 * not its children), which is the direction a delete breaks. Any other active
 * resource type is returned in `otherLinks` rather than dropped, so a kind of
 * usage this code does not model still counts as use.
 *
 * @param {Object} params
 * @param {Array<{active: boolean, resource: {id: any, type: string}, visible: boolean}>} params.links
 * @param {number|null} [params.tabId]
 * @returns {Promise<{
 *   cards: Array<{id: string, name: string|null}>,
 *   drills: Array<{id: string, name: string|null, parentId: string|null, parentName: string|null}>,
 *   nestedBy: Array<{id: string, name: string|null}>,
 *   otherLinks: Array<{count: number, type: string}>
 * }>}
 */
export async function getBeastModeUsage({ links, tabId = null }) {
  const active = {};
  for (const link of links || []) {
    const type = link?.resource?.type;
    if (!link?.active || !type || type === 'DATA_SOURCE') continue;
    (active[type] = active[type] || []).push(String(link.resource.id));
  }

  // A drill arrives as a `dr:<drillId>:<rootId>` URN under CARD, where the root
  // is the card the drill hangs off; a plain card is a bare id. The root is kept
  // so a drill can be shown under its card rather than as a loose row, and both
  // ids resolve through the card lookup since a drill id is itself a card id.
  const cardIds = [];
  const drillRefs = [];
  for (const value of active.CARD || []) {
    if (!value.startsWith('dr:')) {
      cardIds.push(value);
      continue;
    }
    const [, drillId, rootId] = value.split(':');
    drillRefs.push({ id: drillId || value, parentId: rootId || null });
  }
  const nestedByIds = active.FUNCTION_TEMPLATE || [];
  const otherLinks = Object.entries(active)
    .filter(([type]) => type !== 'CARD' && type !== 'FUNCTION_TEMPLATE')
    .map(([type, ids]) => ({ count: ids.length, type }));

  // A drill's parent card is looked up alongside the rest, since a card whose
  // drill uses the Beast Mode is often not a consumer itself and so has no name
  // of its own here. A parent Beast Mode's name needs its own template read, and
  // a widely reused one can have many parents, so those go through the pooled
  // hydrate; one that won't load keeps its id and still counts as usage.
  const lookupIds = [...new Set([...cardIds, ...drillRefs.flatMap((d) => [d.id, d.parentId].filter(Boolean))])];
  const [cardTitleById, parentTemplates] = await Promise.all([
    fetchCardTitles(lookupIds, tabId),
    hydrateFunctionTemplates(
      nestedByIds.map((id) => ({ id })),
      tabId
    )
  ]);
  const toNamed = (id) => ({ id, name: cardTitleById.get(id) || null });

  return {
    cards: cardIds.map(toNamed),
    drills: drillRefs.map((d) => ({
      id: d.id,
      name: cardTitleById.get(d.id) || null,
      parentId: d.parentId,
      parentName: d.parentId ? cardTitleById.get(d.parentId) || null : null
    })),
    nestedBy: nestedByIds.map((id) => ({ id, name: parentTemplates.get(id)?.name || null })),
    otherLinks
  };
}

/**
 * Get every Beast Mode tied to a dataset, with its usage split into the three
 * kinds of consumers Domo tracks: cards, drills, and other Beast Modes.
 *
 * The search response carries `activeLinks` keyed by resource type. Cards and
 * drills both arrive under `CARD` -- a drill as a `dr:<drillId>:<rootId>` URN, a
 * card as a bare id -- so they are split here by that prefix. Other Beast Modes
 * that reference this one arrive under `FUNCTION_TEMPLATE`. Beast Modes saved
 * only to a card (not persisted on the dataset) still link to the dataset, so
 * they come back from this search too; they are flagged via `savedOnDataset`,
 * read from whether their dataset link is `visible`.
 *
 * Child ids are resolved to display names where possible: card and drill titles
 * via a single batched card lookup, other-Beast-Mode names from this dataset's
 * own list. Anything unresolved (e.g. a cross-dataset reference) falls back to
 * its id.
 *
 * @param {string} datasetId
 * @param {number|null} [tabId]
 * @returns {Promise<Array<{
 *   cards: Array<{id: string, name: string}>,
 *   dataType: string|null,
 *   drills: Array<{id: string, name: string}>,
 *   id: any,
 *   name: string,
 *   otherBeastModes: Array<{id: string, name: string}>,
 *   savedOnDataset: boolean,
 *   usageCount: number
 * }>>}
 */
export async function getDatasetBeastModesWithUsage(datasetId, tabId = null) {
  const raw = await fetchDatasetFunctionsRaw(datasetId, tabId);

  // Split each function's activeLinks into the three usage categories.
  const beastModes = raw.map((f) => {
    const cardIds = [];
    const drillIds = [];
    for (const link of f.activeLinks?.CARD || []) {
      const s = String(link);
      if (s.startsWith('dr:')) drillIds.push(s.split(':')[1] || s);
      else cardIds.push(s);
    }
    const otherBeastModeIds = (f.activeLinks?.FUNCTION_TEMPLATE || []).map((id) => String(id));
    const savedOnDataset = (f.links || []).some(
      (l) => l.resource?.type === 'DATA_SOURCE' && String(l.resource?.id) === String(datasetId) && l.visible
    );
    return {
      cardIds,
      dataType: f.dataType || null,
      drillIds,
      id: f.id,
      name: f.name || String(f.id),
      otherBeastModeIds,
      savedOnDataset
    };
  });

  // Resolve display names. Card and drill ids share the card-title endpoint;
  // other-Beast-Mode ids resolve from this dataset's own list first.
  const bmNameById = new Map(beastModes.map((bm) => [String(bm.id), bm.name]));
  const allCardIds = [...new Set(beastModes.flatMap((bm) => [...bm.cardIds, ...bm.drillIds]))];
  const cardTitleById = await fetchCardTitles(allCardIds, tabId);

  const toNamed = (id, lookup) => ({ id: String(id), name: lookup.get(String(id)) || String(id) });

  return beastModes.map((bm) => {
    const cards = bm.cardIds.map((id) => toNamed(id, cardTitleById));
    const drills = bm.drillIds.map((id) => toNamed(id, cardTitleById));
    const otherBeastModes = bm.otherBeastModeIds.map((id) => toNamed(id, bmNameById));
    return {
      cards,
      dataType: bm.dataType,
      drills,
      id: bm.id,
      name: bm.name,
      otherBeastModes,
      savedOnDataset: bm.savedOnDataset,
      usageCount: cards.length + drills.length + otherBeastModes.length
    };
  });
}

/**
 * Batch-resolve card (and drill) ids to their titles. Drill ids are themselves
 * card ids, so both resolve through the same endpoint. Returns a Map keyed by
 * stringified id; ids that can't be resolved are simply absent.
 */
async function fetchCardTitles(cardIds, tabId) {
  if (!cardIds.length) return new Map();
  const obj = await executeInPage(
    async (cardIds) => {
      const map = {};
      const chunkSize = 100;
      for (let i = 0; i < cardIds.length; i += chunkSize) {
        const chunk = cardIds.slice(i, i + chunkSize);
        const response = await fetch(`/api/content/v1/cards?urns=${chunk.join(',')}&parts=metadata&includeFiltered=true`);
        if (!response.ok) continue;
        const cards = await response.json();
        for (const c of [].concat(cards)) {
          const id = c.id ?? c.urn;
          const title = (c.title || '').trim();
          if (id != null && title) map[String(id)] = title;
        }
      }
      return map;
    },
    [cardIds],
    tabId
  );
  return new Map(Object.entries(obj || {}));
}

/**
 * Fetch the raw Beast Mode search results for a dataset (id, name, dataType,
 * activeLinks, links), paging through all results. Variables are excluded --
 * they are a separate type. Kept separate from `getDatasetFunctions` because
 * that helper collapses drills into the card list, discarding the category
 * split this feature needs.
 */
async function fetchDatasetFunctionsRaw(datasetId, tabId) {
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
            activeLinks: f.activeLinks || {},
            dataType: f.dataType || null,
            id: f.id,
            links: f.links || [],
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
