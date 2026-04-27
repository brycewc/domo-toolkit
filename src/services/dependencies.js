import { getCardsForObject } from './cards';
import { getChildPages } from './pages';

/**
 * Per-type dependency fetchers. Each returns an array of group objects:
 * `{ label, blocking, blockingReason?, deleted, items[] }`. Empty groups are
 * filtered out by `getDependenciesForDelete`.
 *
 * - `deleted: true`  — the primary delete also removes these items. Surfaced
 *                      in the view's "Will be deleted" section.
 * - `deleted: false` — these items aren't removed by the primary delete; they
 *                      may be blocking, cascade-only, or just advisory.
 *                      Surfaced in the view's "Other dependencies" section.
 * - `blocking: true` — user must resolve these before the delete is allowed
 *                      (currently: PAGE child pages).
 *
 * Items follow the `DataList` shape: `{ id, label, typeId, url?, unshareable? }`.
 */
/**
 * Shared fetcher for app pages — used by both `DATA_APP_VIEW` and
 * `WORKSHEET_VIEW`. Reports cards on this page (lost in the primary delete)
 * and other pages in the parent app (lost only via the cascade button).
 *
 * Note: `getChildPages` only handles `PAGE` and `DATA_APP_VIEW` page types,
 * so for `WORKSHEET_VIEW` the siblings group will be empty (which is correct —
 * worksheets are typically single-page).
 */
async function fetchAppPageDependencies({ id, instance, parentId, typeId }, tabId) {
  const origin = `https://${instance}.domo.com`;
  const groups = [];

  const cards = await getCardsForObject({
    objectId: id,
    objectType: typeId,
    tabId
  });
  if (cards.length > 0) {
    groups.push({
      blocking: false,
      deleted: true,
      items: cards.map((c) => ({
        id: c.id,
        label: c.title || `Card ${c.id}`,
        typeId: 'CARD',
        url: `${origin}/kpis/details/${c.id}`
      })),
      label: 'Cards on this page'
    });
  }

  if (parentId) {
    const allPages = await getChildPages({
      appId: parseInt(parentId),
      pageId: parseInt(id),
      pageType: typeId,
      tabId
    });
    const siblings = allPages.filter((p) => String(p.pageId) !== String(id));
    if (siblings.length > 0) {
      groups.push({
        blocking: false,
        deleted: false,
        items: siblings.map((p) => ({
          id: p.pageId,
          label: p.pageTitle || `Page ${p.pageId}`,
          typeId
        })),
        label: 'Other pages in this app'
      });
    }
  }

  return groups;
}

const FETCHERS = {
  DATA_APP_VIEW: fetchAppPageDependencies,
  DATAFLOW_TYPE: async ({ id, instance, metadata }, tabId) => {
    const outputs = metadata?.details?.outputs || [];
    const cards = await getCardsForObject({
      metadata,
      objectId: id,
      objectType: 'DATAFLOW_TYPE',
      tabId
    });
    const origin = `https://${instance}.domo.com`;
    return [
      {
        blocking: false,
        deleted: true,
        items: outputs.map((o) => ({
          id: o.dataSourceId,
          label: o.dataSourceName || o.dataSourceId,
          typeId: 'DATA_SOURCE',
          // Output datasets of a dataflow have no account, so they aren't
          // shareable in the toolkit's "share with self" sense.
          unshareable: true,
          url: `${origin}/datasources/${o.dataSourceId}/details/overview`
        })),
        label: 'Output datasets',
        unshareable: true
      },
      {
        blocking: false,
        deleted: false,
        items: cards.map((c) => ({
          id: c.id,
          label: c.title || `Card ${c.id}`,
          typeId: 'CARD',
          url: `${origin}/kpis/details/${c.id}`
        })),
        label: 'Cards using these output datasets'
      }
    ];
  },

  PAGE: async ({ id, instance }, tabId) => {
    const childPages = await getChildPages({
      pageId: parseInt(id),
      pageType: 'PAGE',
      tabId
    });
    const origin = `https://${instance}.domo.com`;
    return [
      {
        blocking: true,
        blockingReason: `This page has ${childPages.length} child page${childPages.length !== 1 ? 's' : ''}. Reassign or delete the child pages first.`,
        deleted: false,
        items: childPages.map((p) => ({
          id: p.pageId,
          label: p.pageTitle || `Page ${p.pageId}`,
          typeId: 'PAGE',
          url: `${origin}/page/${p.pageId}`
        })),
        label: 'Child pages'
      }
    ];
  },
  WORKSHEET_VIEW: fetchAppPageDependencies
};

/**
 * Fetch the dependencies that should be shown to the user before deleting an
 * object. Returns a normalized result the view can render directly.
 *
 * @param {Object} params
 * @param {Object} params.object - The DomoObject (must have `typeId`, `id`, `metadata`)
 * @param {string} params.instance - The Domo instance subdomain (for building URLs)
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{
 *   groups: Array<{label: string, blocking: boolean, blockingReason?: string, items: Array}>,
 *   totalCount: number,
 *   blockingCount: number,
 *   blockingReason: string|null,
 *   supported: boolean
 * }>}
 */
export async function getDependenciesForDelete({
  instance,
  object,
  tabId = null
}) {
  const fetcher = FETCHERS[object.typeId];
  if (!fetcher) {
    return {
      blockingCount: 0,
      blockingReason: null,
      groups: [],
      supported: false,
      totalCount: 0
    };
  }

  const allGroups = await fetcher(
    {
      id: object.id,
      instance,
      metadata: object.metadata,
      parentId: object.parentId,
      typeId: object.typeId
    },
    tabId
  );

  const groups = allGroups.filter((g) => g.items.length > 0);

  let totalCount = 0;
  let blockingCount = 0;
  let blockingReason = null;
  for (const g of groups) {
    totalCount += g.items.length;
    if (g.blocking) {
      blockingCount += g.items.length;
      blockingReason = blockingReason || g.blockingReason || null;
    }
  }

  return {
    blockingCount,
    blockingReason,
    groups,
    supported: true,
    totalCount
  };
}
