import { refineTypeFromMetadata } from '@/models/DomoObjectType';
import { parseBeastModeLinks, rootCardIdsFor } from '@/utils/beastModeLinks';
import { executeInPage } from '@/utils/executeInPage';

import { getCardsByIds } from './cards';
import { getFunctionTemplate, hydrateFunctionTemplates } from './functions';

/**
 * Fetch the cards a Beast Mode is actually used on: the ones using it directly
 * plus the card each drill hangs off. Feeds Get Cards, Get Card Pages, and the
 * card owner/lock views, all of which need navigable cards rather than raw ids.
 *
 * @param {Object} params
 * @param {string|number} params.id - The Beast Mode (function template) ID
 * @param {Object} [params.metadata] - The detected object's metadata, so an
 *   already-enriched Beast Mode reads its links without a request
 * @param {number|null} [params.tabId]
 * @returns {Promise<Array<Object>>} Full card objects
 */
export async function getBeastModeCards({ id, metadata, tabId = null }) {
  const links = await resolveBeastModeLinks({ id, metadata, tabId });
  return getCardsByIds({ cardIds: rootCardIdsFor(parseBeastModeLinks(links)), tabId });
}

/**
 * The Beast Modes on either side of this one's nesting: `nestedBy` are its
 * parents (read from its active `FUNCTION_TEMPLATE` links) and `nests` are its
 * children (read from `functionTemplateDependencies`, Domo's authoritative
 * nesting list). Domo caps nesting at one level, so in practice only one side is
 * ever populated.
 *
 * Each entry carries the type it should render as: a nested Variable is still a
 * function template, but it is not a Beast Mode.
 *
 * @param {Object} params
 * @param {string|number} params.id - The Beast Mode (function template) ID
 * @param {Object} [params.metadata] - The detected object's metadata
 * @param {number|null} [params.tabId]
 * @returns {Promise<{
 *   nestedBy: Array<{id: string, name: string|null, typeId: string}>,
 *   nests: Array<{id: string, name: string|null, typeId: string}>
 * }>}
 */
export async function getBeastModeRelatives({ id, metadata, tabId = null }) {
  const template = metadata?.details?.links ? metadata.details : await getFunctionTemplate(id, tabId);
  const { nestedByIds } = parseBeastModeLinks(template?.links);
  const nestsIds = [...new Set((template?.functionTemplateDependencies || []).map(String))].filter(
    (dep) => dep !== String(id)
  );

  const templates = await hydrateFunctionTemplates(
    [...new Set([...nestedByIds, ...nestsIds])].map((templateId) => ({ id: templateId })),
    tabId
  );
  // One that won't load keeps its id and still shows, rather than vanishing.
  const toNamed = (templateId) => ({
    id: templateId,
    name: templates.get(templateId)?.name || null,
    typeId: refineTypeFromMetadata('BEAST_MODE_FORMULA', { details: templates.get(templateId) })
  });

  return { nestedBy: nestedByIds.map(toNamed), nests: nestsIds.map(toNamed) };
}

/**
 * Read one Beast Mode's usage out of its own `links` array: the cards and drills
 * that use it, and the Beast Modes that nest it. Used before deleting a Beast
 * Mode, since Domo deletes one that is still in use without complaint, silently
 * breaking every card that references it. See `parseBeastModeLinks` for what
 * counts as usage.
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
  const { cardIds, drillRefs, nestedByIds, otherLinks } = parseBeastModeLinks(links);

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
 * `getBeastModeUsage` for a detected Beast Mode, resolving its links from the
 * object's own metadata where possible.
 *
 * @param {Object} params
 * @param {string|number} params.id - The Beast Mode (function template) ID
 * @param {Object} [params.metadata] - The detected object's metadata
 * @param {number|null} [params.tabId]
 * @returns {Promise<Object>} Same shape as `getBeastModeUsage`
 */
export async function getBeastModeUsageForObject({ id, metadata, tabId = null }) {
  const links = await resolveBeastModeLinks({ id, metadata, tabId });
  return getBeastModeUsage({ links, tabId });
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
 * Batch-resolve card (and drill) ids to their titles, keyed by stringified id.
 * A failed lookup yields no names rather than failing the caller, since an
 * unnamed usage still has to be reported.
 */
async function fetchCardTitles(cardIds, tabId) {
  if (!cardIds.length) return new Map();
  const cards = await getCardsByIds({ cardIds, tabId }).catch(() => []);
  const map = new Map();
  for (const card of cards) {
    const title = (card.title || '').trim();
    if (card.id != null && title) map.set(String(card.id), title);
  }
  return map;
}

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

/**
 * Fetch the raw Beast Mode search results for a dataset (id, name, dataType,
 * activeLinks, links), paging through all results. Variables are excluded --
 * they are a separate type. Kept separate from `getDatasetFunctions` because
 * that helper collapses drills into the card list, discarding the category
 * split this feature needs.
 */
async function resolveBeastModeLinks({ id, metadata, tabId }) {
  // Detection stores the whole template response as the object's details, so the
  // common path needs no request; the fetch covers one that was never enriched.
  if (metadata?.details?.links) return metadata.details.links;
  const template = await getFunctionTemplate(id, tabId);
  return template?.links || [];
}
