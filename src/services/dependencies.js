import { getDownstreamAlertsForDatasets } from './alerts';
import { getTemplateApprovalCount } from './approvals';
import { getCardsForObject } from './cards';
import { getAppContentSummary } from './customApps';
import { getDatasetDependentCount, getDownstreamViewsForDatasets, searchDatasets } from './datasets';
import { getChildPages, getOnlyHereCardIds } from './pages';

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
  // Kick off the "cards that only live here" lookup in parallel with the
  // sibling-page work below; it feeds the alternate delete's card-count preview.
  // Best-effort: a failed lookup leaves the count unknown rather than blocking.
  const cardIdList = cards.map((c) => c.id).filter((cid) => Number.isFinite(cid));
  const onlyHerePromise =
    cardIdList.length > 0
      ? getOnlyHereCardIds({ cardIds: cardIdList, pageId: id, tabId }).catch(() => null)
      : Promise.resolve([]);
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
      key: 'pageCards',
      label: 'Cards on This Page'
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

    // App-wide page/card totals for the cascade ("Delete App and All Cards"):
    // one admin-summary call covers every page, and its card IDs are reused at
    // delete time so the delete doesn't re-walk each page. It also carries each
    // page's cards, which we nest under the other-pages list below so the user
    // sees exactly what the cascade would remove. Best-effort, so a worksheet
    // whose admin summary isn't available (or any failed call) just omits the
    // counts and nested cards, and the delete falls back to a per-page walk.
    appSummary = await getAppContentSummary({
      appId: parseInt(parentId),
      tabId
    }).catch(() => null);

    if (siblings.length > 0) {
      groups.push({
        blocking: false,
        deleted: false,
        items: siblings.map((p) => {
          const pageCards = appSummary?.cardsByView?.[p.pageId];
          const cardChildren = (pageCards || []).map((c) => ({
            id: c.id,
            label: c.title || `Card ${c.id}`,
            typeId: 'CARD',
            url: `${origin}/kpis/details/${c.id}`
          }));
          // The summary lists a page even when it has no cards, so a known count
          // of zero shows "(0 cards)" to signal the page is empty (and equally
          // safe to delete), while an unknown count (no summary, e.g. a
          // worksheet) shows no count rather than a misleading "(0 cards)".
          const cardCountKnown = pageCards !== undefined;
          const cardCount = cardChildren.length;
          const cardLabel = cardCount === 1 ? 'card' : 'cards';
          return {
            children: cardCount > 0 ? cardChildren : undefined,
            count: cardCountKnown ? cardCount : undefined,
            countLabel: cardCountKnown ? cardLabel : undefined,
            id: p.pageId,
            label: p.pageTitle || `Page ${p.pageId}`,
            typeId
          };
        }),
        label: 'Other Pages in This App'
      });
    }
  }

  const onlyHereCardIds = await onlyHerePromise;
  return { appSummary, groups, onlyHereCardIds };
}

const FETCHERS = {
  DATA_APP_VIEW: fetchAppPageDependencies,
  DATAFLOW_TYPE: async ({ id, instance, metadata }, tabId) => {
    const outputs = metadata?.details?.outputs || [];
    const outputIds = outputs.map((o) => o.dataSourceId).filter(Boolean);
    // Cards and alerts both hang off the output datasets and are both removed
    // when those datasets are deleted, so fetch them together. Downstream views
    // built on the outputs are fetched alongside: Domo blocks deleting a dataset
    // a view sits on, so they must block this delete rather than cascade.
    const [cards, alerts, downstream] = await Promise.all([
      getCardsForObject({
        metadata,
        objectId: id,
        objectType: 'DATAFLOW_TYPE',
        tabId
      }),
      getDownstreamAlertsForDatasets(outputIds, tabId),
      getDownstreamViewsForDatasets(outputIds, tabId)
    ]);
    const origin = `https://${instance}.domo.com`;
    const groups = [
      {
        blocking: false,
        deleted: true,
        items: outputs.map((o) => ({
          id: o.dataSourceId,
          label: o.dataSourceName || o.dataSourceId,
          typeId: 'DATA_SOURCE',
          url: `${origin}/datasources/${o.dataSourceId}/details/overview`
        })),
        label: 'Output DataSets'
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
        label: 'Cards'
      },
      {
        blocking: false,
        deleted: true,
        items: alerts.map((a) => ({
          id: a.id,
          label: a.name || `Alert ${a.id}`,
          typeId: 'ALERT',
          url: `${origin}/alerts/${a.id}`
        })),
        label: 'Alerts'
      }
    ];

    // Downstream views built on the outputs block the delete: Domo rejects
    // deleting a dataset a view sits on, so the whole dataflow delete would fail
    // partway. Outputs whose lineage couldn't be checked block too, so an
    // unverified lookup never lets through a delete that then fails at runtime.
    if (downstream.views.length > 0 || downstream.unverifiedOutputIds.length > 0) {
      const viewItems = downstream.views.map((v) => ({
        id: v.id,
        label: v.name || `DataSet ${v.id}`,
        typeId: 'DATA_SOURCE',
        url: `${origin}/datasources/${v.id}/details/overview`
      }));
      const unverifiedItems = downstream.unverifiedOutputIds.map((oid) => {
        const output = outputs.find((o) => String(o.dataSourceId) === oid);
        return {
          id: oid,
          label: `${output?.dataSourceName || oid} (downstream views could not be verified)`,
          typeId: 'DATA_SOURCE',
          url: `${origin}/datasources/${oid}/details/overview`
        };
      });
      const items = [...viewItems, ...unverifiedItems];
      const reasonParts = [];
      if (viewItems.length > 0) {
        reasonParts.push(
          `${viewItems.length} dataset view${viewItems.length !== 1 ? 's' : ''} ${viewItems.length === 1 ? 'is' : 'are'} built on this dataflow's output datasets`
        );
      }
      if (unverifiedItems.length > 0) {
        reasonParts.push(
          `${unverifiedItems.length} output dataset${unverifiedItems.length !== 1 ? 's' : ''} could not be checked for downstream views`
        );
      }
      groups.push({
        blocking: true,
        blockingReason: `${reasonParts.join(' and ')}. Domo blocks deleting a dataset that a view is built on, so delete or repoint ${items.length === 1 ? 'it' : 'them'} first.`,
        deleted: false,
        items,
        label: 'Downstream DataSet Views'
      });
    }

    return groups;
  },

  PAGE: async ({ id, instance }, tabId) => {
    const origin = `https://${instance}.domo.com`;
    const groups = [];

    const cards = await getCardsForObject({
      objectId: id,
      objectType: 'PAGE',
      tabId
    });
    // Kick off the "cards that only live here" lookup in parallel with the
    // child-page work below; it feeds the alternate delete's card-count preview.
    // Best-effort: a failed lookup leaves the count unknown rather than blocking.
    const cardIdList = cards.map((c) => c.id).filter((cid) => Number.isFinite(cid));
    const onlyHerePromise =
      cardIdList.length > 0
        ? getOnlyHereCardIds({ cardIds: cardIdList, pageId: id, tabId }).catch(() => null)
        : Promise.resolve([]);
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
        key: 'pageCards',
        label: 'Cards on This Page'
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
        label: 'Child Pages'
      });
    }

    const onlyHereCardIds = await onlyHerePromise;
    return { groups, onlyHereCardIds };
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
        label: 'Related DataSet'
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
 *   appSummary: {cardCount: number, cardIds: number[], pageCount: number}|null,
 *   onlyHereCardCount: number|null
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
      onlyHereCardCount: null,
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

  // Fetchers return either a bare groups array or an object carrying extra data
  // the view reads: `appSummary` (app-wide page/card totals for the cascade
  // delete) and `onlyHereCardIds` (cards that live only on this page, for the
  // alternate delete's card-count preview).
  const allGroups = Array.isArray(fetched) ? fetched : fetched.groups;
  const appSummary = Array.isArray(fetched) ? null : (fetched.appSummary ?? null);
  const onlyHereCardIds = Array.isArray(fetched) ? null : (fetched.onlyHereCardIds ?? null);

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
    onlyHereCardCount: onlyHereCardIds == null ? null : onlyHereCardIds.length,
    supported: true,
    totalCount
  };
}
