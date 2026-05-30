import { getTemplateApprovalCount } from './approvals';
import { getCardsForObject } from './cards';
import { getAppContentSummary } from './customApps';
import { getDatasetDependentCount, searchDatasets } from './datasets';
import { getChildPages } from './pages';

/**
 * Per-type dependency fetchers. Each returns an array of group objects:
 * `{ label, blocking, blockingReason?, deleted, items[] }`. Empty groups are
 * filtered out by `getDependenciesForDelete` unless they carry a `count`.
 *
 * - `deleted: true`: the primary delete also removes these items. Surfaced in
 *   the view's "Will be deleted" section.
 * - `deleted: false`: these items aren't removed by the primary delete; they
 *   may be blocking, cascade-only, or just advisory. Surfaced in the view's
 *   "Other dependencies" section.
 * - `blocking: true`: user must resolve these before the delete is allowed
 *   (currently: PAGE child pages).
 *
 * Items follow the `DataList` shape: `{ id, label, typeId, url?, unshareable? }`,
 * plus an optional `count` + `countLabel` that render a "(N label)" badge on the
 * item's row (e.g. a related dataset showing its downstream dependency count).
 *
 * Optional group fields the view honors:
 * - `key`: stable handle a cascade button uses to find its group (e.g.
 *   `relatedDataset`) so it can read that group's item(s).
 * - `count` + `countLabel` + `summaryTypeId`: render a count-only summary row
 *   (e.g. "Approvals (12 requests)") with no enumerated items, instead of a list.
 * - `flat`: render the group's item(s) as leaf rows directly, with no disclosure
 *   wrapper. Use for a 1:1 related object that needs no grouping header.
 */
/**
 * Shared fetcher for app pages, used by both `DATA_APP_VIEW` and
 * `WORKSHEET_VIEW`. Reports cards on this page (lost in the primary delete)
 * and other pages in the parent app (lost only via the cascade button).
 *
 * Note: `getChildPages` only handles `PAGE` and `DATA_APP_VIEW` page types,
 * so for `WORKSHEET_VIEW` the siblings group will be empty (which is correct,
 * since worksheets are typically single-page).
 */
async function fetchAppPageDependencies({ id, instance, parentId, typeId }, tabId) {
  const origin = `https://${instance}.domo.com`;
  const groups = [];
  let appSummary = null;

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

    // App-wide page/card totals for the cascade ("Delete App and All Cards"):
    // one admin-summary call covers every page, and its card IDs are reused at
    // delete time so the delete doesn't re-walk each page. Best-effort, so a
    // worksheet whose admin summary isn't available (or any failed call) just
    // omits the counts and the delete falls back to a per-page walk.
    appSummary = await getAppContentSummary({
      appId: parseInt(parentId),
      tabId
    }).catch(() => null);
  }

  return { appSummary, groups };
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
        label: 'Output datasets'
      },
      {
        blocking: false,
        deleted: true,
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
    const origin = `https://${instance}.domo.com`;
    const groups = [];

    const cards = await getCardsForObject({
      objectId: id,
      objectType: 'PAGE',
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

    const childPages = await getChildPages({
      pageId: parseInt(id),
      pageType: 'PAGE',
      tabId
    });
    if (childPages.length > 0) {
      groups.push({
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
      });
    }

    return groups;
  },
  TEMPLATE: async ({ id, instance, metadata }, tabId) => {
    const origin = `https://${instance}.domo.com`;
    // datasetId is eagerly enriched onto the current object at detection time
    // (background.js), so it's present here without an extra fetch.
    const datasetId = metadata?.details?.datasetId || null;

    const [datasetInfo, dependentCount, approvalCount] = await Promise.all([
      datasetId ? searchDatasets(datasetId, tabId) : Promise.resolve(null),
      datasetId ? getDatasetDependentCount({ datasetId, tabId }).catch(() => 0) : Promise.resolve(0),
      getTemplateApprovalCount(id, tabId).catch(() => null)
    ]);

    const groups = [];

    // Related dataset: listed inline (1:1 with the template), never blocks the
    // plain template delete. Its downstream dependent count shows on the row as
    // a "(N dependencies)" badge and drives the combined-delete block.
    if (datasetId) {
      groups.push({
        blocking: false,
        deleted: false,
        flat: true, // 1:1 with the template, so render inline, not under a disclosure
        items: [
          {
            count: dependentCount,
            countLabel: dependentCount === 1 ? 'dependency' : 'dependencies',
            id: datasetId,
            label: datasetInfo?.datasets?.[0]?.name || `DataSet ${datasetId}`,
            typeId: 'DATA_SOURCE',
            url: `${origin}/datasources/${datasetId}/details/overview`
          }
        ],
        key: 'relatedDataset',
        label: 'Related dataset'
      });
    }

    // Approvals: count-only summary row, never enumerated.
    if (approvalCount > 0) {
      groups.push({
        blocking: false,
        count: approvalCount,
        countLabel: approvalCount === 1 ? 'request' : 'requests',
        deleted: false,
        items: [],
        key: 'approvals',
        label: 'Approvals',
        summaryTypeId: 'APPROVAL'
      });
    }

    return groups;
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
 *   supported: boolean,
 *   appSummary: {cardCount: number, cardIds: number[], pageCount: number}|null
 * }>}
 */
export async function getDependenciesForDelete({ instance, object, tabId = null }) {
  const fetcher = FETCHERS[object.typeId];
  if (!fetcher) {
    return {
      appSummary: null,
      blockingCount: 0,
      blockingReason: null,
      groups: [],
      supported: false,
      totalCount: 0
    };
  }

  const fetched = await fetcher(
    {
      id: object.id,
      instance,
      metadata: object.metadata,
      parentId: object.parentId,
      typeId: object.typeId
    },
    tabId
  );

  // Fetchers return either a bare groups array or `{ groups, appSummary }` when
  // they carry extra data the cascade delete reads (app-wide page/card totals).
  const allGroups = Array.isArray(fetched) ? fetched : fetched.groups;
  const appSummary = Array.isArray(fetched) ? null : (fetched.appSummary ?? null);

  const groups = allGroups.filter((g) => g.items.length > 0 || (g.count ?? 0) > 0);

  let totalCount = 0;
  let blockingCount = 0;
  let blockingReason = null;
  for (const g of groups) {
    totalCount += g.items.length || (g.count ?? 0);
    if (g.blocking) {
      blockingCount += g.items.length;
      blockingReason = blockingReason || g.blockingReason || null;
    }
  }

  return {
    appSummary,
    blockingCount,
    blockingReason,
    groups,
    supported: true,
    totalCount
  };
}
