/**
 * Pure readers over a Beast Mode's `links` array, with no I/O so both the
 * services and `cards.js` can share them without importing each other.
 *
 * `links` comes straight from the template (`GET .../functions/template/{id}`),
 * which a detected Beast Mode already carries as its details, so reading usage
 * out of it needs no request.
 */

// Shown on a card that only appears because a drill under it uses the Beast
// Mode, both as the row's hover note and as the list's legend.
export const DRILL_ONLY_NOTE = "This card doesn't use the Beast Mode directly; one of its drill views does.";

/**
 * Where a Beast Mode is saved, when that is somewhere other than its dataset.
 *
 * A dataset-saved Beast Mode has its `DATA_SOURCE` link `visible`; one saved to
 * a card or a drill has that link hidden and names its owner with the single
 * `visible` `CARD` link. That owner link is a `dr:<drillId>:<rootId>` URN when
 * the Beast Mode lives on a drill rather than the card itself.
 *
 * The owner link is found by `visible`, never by `active`: a Beast Mode saved to
 * a card that no longer references it in its definition comes back `active:
 * false` while still living on that card.
 *
 * @param {Array<{active: boolean, resource: {id: any, type: string}, visible: boolean}>} links
 * @returns {{id: string, parentId: string|null, typeId: 'CARD'|'DRILL_VIEW'}|null}
 *   null when the Beast Mode is saved to its dataset.
 */
export function beastModeSaveTarget(links) {
  const list = links || [];
  const datasetLink = list.find((l) => l?.resource?.type === 'DATA_SOURCE');
  if (!datasetLink || datasetLink.visible === true) return null;

  const owner = list.find((l) => l?.resource?.type === 'CARD' && l.visible === true);
  if (owner?.resource?.id == null) return null;

  const value = String(owner.resource.id);
  if (!value.startsWith('dr:')) return { id: value, parentId: null, typeId: 'CARD' };
  const [, drillId, rootId] = value.split(':');
  return { id: drillId || value, parentId: rootId || null, typeId: 'DRILL_VIEW' };
}

/**
 * The dataset a Beast Mode's formula reads. Present for a card-level Beast Mode
 * too, where the link is `visible: false` rather than absent.
 * @param {Array<{resource: {id: any, type: string}}>} links
 * @returns {string|null}
 */
export function datasetIdFromBeastModeLinks(links) {
  const link = (links || []).find((l) => l?.resource?.type === 'DATA_SOURCE');
  return link?.resource?.id != null ? String(link.resource.id) : null;
}

/**
 * Group a Beast Mode's card and drill usages so each drill sits under the card
 * it drills from, the way the column-usages modal presents them. A card only
 * present because a drill under it uses the Beast Mode is flagged
 * `usesDirectly: false`, so callers can mute it and drop its link. A drill whose
 * parent is unknown stays a top-level row rather than being dropped.
 *
 * @param {{cards: Array<Object>, drills: Array<Object>}} usage - From `getBeastModeUsage`
 * @returns {{
 *   cards: Array<{drills: Array<Object>, id: string, name: string|null, usesDirectly: boolean}>,
 *   orphanDrills: Array<Object>
 * }} Both lists sorted by name, as are the drills under each card.
 */
export function groupBeastModeUsageByCard({ cards, drills }) {
  const byCardId = new Map();
  for (const card of cards || []) {
    byCardId.set(String(card.id), { drills: [], id: String(card.id), name: card.name, usesDirectly: true });
  }
  const orphanDrills = [];
  for (const drill of drills || []) {
    if (!drill.parentId) {
      orphanDrills.push(drill);
      continue;
    }
    const key = String(drill.parentId);
    if (!byCardId.has(key)) {
      byCardId.set(key, { drills: [], id: key, name: drill.parentName, usesDirectly: false });
    }
    byCardId.get(key).drills.push(drill);
  }

  const byName = (a, b) => (a.name || '').localeCompare(b.name || '');
  return {
    cards: [...byCardId.values()].sort(byName).map((card) => ({ ...card, drills: [...card.drills].sort(byName) })),
    orphanDrills: orphanDrills.sort(byName)
  };
}

/**
 * Split a Beast Mode's `links` into the kinds of use Domo tracks.
 *
 * A link's `active` flag is the usage signal: the search endpoint's
 * `activeLinks` map is just these links filtered to `active` and grouped by
 * resource type, which holds for card, drill, and nesting links alike. `visible`
 * is unrelated to usage; an active card link comes both ways.
 *
 * `DATA_SOURCE` links are excluded: they name the dataset the formula reads, not
 * a consumer, and Domo reports them `active: false` regardless. Counting one as
 * usage would treat every Beast Mode as in use.
 *
 * `FUNCTION_TEMPLATE` links name the Beast Modes that nest THIS one (its parents,
 * not its children), which is the direction a delete breaks. Any other active
 * resource type is returned in `otherLinks` rather than dropped, so a kind of
 * usage this code does not model still counts as use.
 *
 * A drill arrives as a `dr:<drillId>:<rootId>` URN under `CARD`, where the root
 * is the card the drill hangs off; a plain card is a bare id. The root is kept so
 * a drill can be shown under its card rather than as a loose row.
 *
 * @param {Array<{active: boolean, resource: {id: any, type: string}}>} links
 * @returns {{
 *   cardIds: string[],
 *   drillRefs: Array<{id: string, parentId: string|null}>,
 *   nestedByIds: string[],
 *   otherLinks: Array<{count: number, type: string}>
 * }}
 */
export function parseBeastModeLinks(links) {
  const active = {};
  for (const link of links || []) {
    const type = link?.resource?.type;
    if (!link?.active || !type || type === 'DATA_SOURCE') continue;
    (active[type] = active[type] || []).push(String(link.resource.id));
  }

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

  return {
    cardIds,
    drillRefs,
    nestedByIds: active.FUNCTION_TEMPLATE || [],
    otherLinks: Object.entries(active)
      .filter(([type]) => type !== 'CARD' && type !== 'FUNCTION_TEMPLATE')
      .map(([type, ids]) => ({ count: ids.length, type }))
  };
}

/**
 * The real cards behind a Beast Mode's usage: the ones using it directly plus
 * the card each drill hangs off. A drill id resolves through the card endpoint
 * but lives on no page and carries no owners of its own, so every consumer that
 * needs navigable, ownable cards wants this set rather than the raw ids.
 *
 * @param {{cardIds: string[], drillRefs: Array<{parentId: string|null}>}} parsed
 * @returns {string[]} Deduped card ids
 */
export function rootCardIdsFor({ cardIds, drillRefs }) {
  return [...new Set([...(cardIds || []), ...(drillRefs || []).map((d) => d.parentId).filter(Boolean)].map(String))];
}
