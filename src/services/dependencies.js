import { getCardsForObject } from './cards';
import { getChildPages } from './pages';

/**
 * Per-type dependency fetchers. Each returns an array of group objects, where
 * each group is `{ label, blocking, blockingReason?, items[] }`. Empty groups
 * are filtered out by `getDependenciesForDelete`.
 *
 * `blocking: true` means the user must resolve those dependencies before the
 * delete is allowed (currently: PAGE child pages). `blocking: false` means
 * the dependencies are advisory — shown so the user knows what will break.
 *
 * Items follow the `DataList` shape: `{ id, label, typeId, url? }`.
 */
const FETCHERS = {
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
        items: outputs.map((o) => ({
          id: o.dataSourceId,
          label: o.dataSourceName || o.dataSourceId,
          typeId: 'DATA_SOURCE',
          url: `${origin}/datasources/${o.dataSourceId}/details/overview`
        })),
        label: 'Output datasets (will also be deleted)'
      },
      {
        blocking: false,
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
        items: childPages.map((p) => ({
          id: p.pageId,
          label: p.pageTitle || `Page ${p.pageId}`,
          typeId: 'PAGE',
          url: `${origin}/page/${p.pageId}`
        })),
        label: 'Child pages'
      }
    ];
  }
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
      parentId: object.parentId
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
