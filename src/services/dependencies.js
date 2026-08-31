import { DRILL_ONLY_NOTE, groupBeastModeUsageByCard } from '@/utils/beastModeLinks';

import { getDownstreamAlertsForDatasets } from './alerts';
import { getAppInstanceCollections, getCollectionConnectedApps } from './appDb';
import { getTemplateApprovalCount } from './approvals';
import { getBeastModeUsageForObject } from './beastModes';
import { getCardsForObject } from './cards';
import { getAppContentSummary } from './customApps';
import {
  getDatasetDependentCount,
  getDatasetDetailsForList,
  getDatasetImpactCounts,
  getDownstreamViewsForDatasets,
  getOtherDependentCountsForDatasets,
  isTransformDataset,
  searchDatasets
} from './datasets';
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
 *   (PAGE child pages, a dataflow output's downstream views, anything using a
 *   Beast Mode).
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
 * - `annotation`: a note about the group, shown under its header.
 * - `deletableIds` + `unselectableReasons`: the subset of the group's item ids a
 *   cascade delete may remove, and why each of the rest can't be. Paired with a
 *   `selectionGroupKey` on the delete config, these become checkboxes: only
 *   `deletableIds` can be checked, and the others carry their reason on the
 *   checkbox itself. Omit both for a group with no picker.
 */
/**
 * Render a Beast Mode's grouped usage as dependency items. A card that uses the
 * Beast Mode itself links and reads normally; one that is only here because a
 * drill under it uses it is muted, carries the drill-only note, and is not a
 * link, so "used on the card too" and "used only on its drill" stay
 * distinguishable.
 *
 * @param {{cards: Array<Object>, drills: Array<Object>}} usage
 * @param {string} origin
 * @returns {Array<Object>} Dependency items, cards first then orphaned drills.
 */
function buildBeastModeCardItems(usage, origin) {
  const drillItem = (drill, parentId) => ({
    id: drill.id,
    label: drill.name || `Drill ${drill.id}`,
    parentId,
    typeId: 'DRILL_VIEW',
    url: parentId ? `${origin}/analyzer?cardid=${parentId}&drillviewid=${drill.id}` : null
  });

  const { cards, orphanDrills } = groupBeastModeUsageByCard(usage);
  const items = cards.map((card) => ({
    annotation: card.usesDirectly ? null : DRILL_ONLY_NOTE,
    children: card.drills.length > 0 ? card.drills.map((drill) => drillItem(drill, card.id)) : undefined,
    id: card.id,
    label: card.name || `Card ${card.id}`,
    muted: !card.usesDirectly,
    typeId: 'CARD',
    url: card.usesDirectly ? `${origin}/kpis/details/${card.id}` : null
  }));
  return [...items, ...orphanDrills.map((drill) => drillItem(drill, drill.parentId))];
}

/**
 * Build the `count` + `countLabel` pair that renders an "(N label)" badge on a
 * dependency row. A null or undefined count (a lookup that failed) yields no
 * badge at all, so an unknown number never reads as a safe zero.
 * @param {number|null|undefined} count - The number to show
 * @param {string} singular - Label for a count of exactly 1
 * @param {string} plural - Label for every other count
 * @returns {{count?: number, countLabel?: string}}
 */
function countBadge(count, singular, plural) {
  if (count == null) return {};
  return { count, countLabel: count === 1 ? singular : plural };
}

/**
 * Shared fetcher for app pages, used by both `DATA_APP_VIEW` and
 * `WORKSHEET_VIEW`. Reports cards on this page (lost in the primary delete)
 * and other pages in the parent app (lost only via the cascade button).
 *
 * Note: `getChildPages` only handles `PAGE` and `DATA_APP_VIEW` page types,
 * so for `WORKSHEET_VIEW` the siblings group will be empty (which is correct,
 * since worksheets are typically single-page).
 */
async function fetchAppPageDependencies({ id, origin, parentId, typeId }, tabId) {
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

/**
 * Why a connector input dataset can't be deleted alongside its dataflow, or null
 * when it can. A dataset we couldn't check comes first, since its counts aren't
 * trustworthy enough to report.
 * @param {{cards: number, dataflows: number, unverified: boolean, views: number}} [dependents]
 * @returns {string|null}
 */
function inputExclusionReason(dependents) {
  if (!dependents || dependents.unverified) return 'Its other uses could not be checked.';
  const parts = [];
  if (dependents.cards > 0) parts.push(`${dependents.cards} card${dependents.cards !== 1 ? 's' : ''}`);
  if (dependents.dataflows > 0) parts.push(`${dependents.dataflows} dataflow${dependents.dataflows !== 1 ? 's' : ''}`);
  if (dependents.views > 0) parts.push(`${dependents.views} dataset view${dependents.views !== 1 ? 's' : ''}`);
  if (parts.length > 0) return `Also used by ${parts.join(', ')}.`;
  return null;
}

/**
 * Sum one dataset's other-dependent counts, or null when the lookup failed.
 * @param {{cards: number, dataflows: number, unverified: boolean, views: number}} [dependents]
 * @returns {number|null}
 */
function otherDependentTotal(dependents) {
  if (!dependents || dependents.unverified) return null;
  return dependents.cards + dependents.dataflows + dependents.views;
}

const FETCHERS = {
  // Domo deletes a still-referenced Beast Mode without complaint and the cards
  // pointing at it break silently, so here every kind of use blocks.
  BEAST_MODE_FORMULA: async ({ id, metadata, origin }, tabId) => {
    const usage = await getBeastModeUsageForObject({ id, metadata, tabId });

    const groups = [];
    const reasonParts = [];
    if (usage.cards.length > 0) reasonParts.push(`${usage.cards.length} card${usage.cards.length !== 1 ? 's' : ''}`);
    if (usage.drills.length > 0) reasonParts.push(`${usage.drills.length} drill${usage.drills.length !== 1 ? 's' : ''}`);
    if (usage.nestedBy.length > 0) {
      reasonParts.push(`${usage.nestedBy.length} Beast Mode${usage.nestedBy.length !== 1 ? 's' : ''} it is nested in`);
    }
    for (const other of usage.otherLinks) {
      reasonParts.push(
        `${other.count} ${other.type.toLowerCase().replace(/_/g, ' ')} reference${other.count !== 1 ? 's' : ''}`
      );
    }
    // A drill's card is listed to hold it, so say so when one is listed for no
    // other reason; the rows themselves repeat it as a hover note.
    const hasDrillOnlyCards = usage.drills.some(
      (d) => d.parentId && !usage.cards.some((c) => String(c.id) === String(d.parentId))
    );
    // Only the first blocking group's reason reaches the banner, so every group
    // carries the same combined one and the message covers all of them.
    const blockingReason =
      reasonParts.length > 0
        ? `This Beast Mode is still used by ${reasonParts.join(', ')}. Remove the remaining uses before deleting.${
            hasDrillOnlyCards ? ' A card shown greyed out does not use it itself; a drill under it does.' : ''
          }`
        : null;

    // Drills nest under the card they belong to rather than forming a list of
    // their own, matching the column-usages modal. The group counts cards and
    // drills separately, since its rows are cards but some are there only to
    // hold a drill.
    if (usage.cards.length > 0 || usage.drills.length > 0) {
      const drillWord = `drill${usage.drills.length !== 1 ? 's' : ''}`;
      const usesCards = usage.cards.length > 0;
      groups.push({
        blocking: true,
        blockingReason,
        // Cards alone count as rows; drills ride along as "+ N drills" so both
        // tallies show. With no card using it directly, the drills are the count.
        count: usesCards ? usage.cards.length : usage.drills.length,
        countLabel: !usesCards ? drillWord : usage.drills.length > 0 ? `+ ${usage.drills.length} ${drillWord}` : null,
        deleted: false,
        items: buildBeastModeCardItems(usage, origin),
        key: 'beastModeCards',
        label: usage.drills.length > 0 ? 'Cards and Drills Using This Beast Mode' : 'Cards Using This Beast Mode'
      });
    }
    if (usage.nestedBy.length > 0) {
      groups.push({
        blocking: true,
        blockingReason,
        deleted: false,
        items: usage.nestedBy.map((bm) => ({
          id: bm.id,
          label: bm.name || `Beast Mode ${bm.id}`,
          typeId: 'BEAST_MODE_FORMULA',
          url: `${origin}/datacenter/beastmode?id=${bm.id}`
        })),
        key: 'nestingBeastModes',
        label: 'Nested in Other Beast Modes'
      });
    }
    // A kind of use this code doesn't model: countable but not nameable, so it
    // shows as a count-only row and still blocks.
    for (const other of usage.otherLinks) {
      groups.push({
        blocking: true,
        blockingReason,
        count: other.count,
        countLabel: other.count === 1 ? 'reference' : 'references',
        deleted: false,
        items: [],
        label: `Other Usage (${other.type})`,
        summaryTypeId: null
      });
    }

    return groups;
  },
  DATA_APP_VIEW: fetchAppPageDependencies,
  DATAFLOW_TYPE: async ({ id, metadata, origin }, tabId) => {
    const outputs = metadata?.details?.outputs || [];
    const outputIds = outputs.map((o) => o.dataSourceId).filter(Boolean);
    // Input datasets, deduped and with anything that is also an output dropped:
    // a dataflow that appends to itself lists the same dataset on both sides, and
    // the outputs group already covers it. Only the alternate delete removes
    // these, so they are advisory for the primary one.
    const seenInputIds = new Set(outputIds.map(String));
    const inputs = (metadata?.details?.inputs || []).filter((i) => {
      const inputId = i.dataSourceId ? String(i.dataSourceId) : null;
      if (!inputId || seenInputIds.has(inputId)) return false;
      seenInputIds.add(inputId);
      return true;
    });
    // Cards and alerts both hang off the output datasets and are both removed
    // when those datasets are deleted, so fetch them together. Downstream views
    // built on the outputs are fetched alongside: Domo blocks deleting a dataset
    // a view sits on, so they must block this delete rather than cascade. The
    // output impact counts ride along, since all of that goes when the output
    // does. Best-effort: a failed lookup leaves those counts unknown rather than
    // blocking the delete.
    const [cards, alerts, downstream, outputImpacts, inputDetails] = await Promise.all([
      getCardsForObject({
        metadata,
        objectId: id,
        objectType: 'DATAFLOW_TYPE',
        tabId
      }),
      getDownstreamAlertsForDatasets(outputIds, tabId),
      getDownstreamViewsForDatasets(outputIds, tabId),
      getDatasetImpactCounts({ datasetIds: outputIds.map(String), tabId }).catch(() => ({})),
      inputs.length > 0 ? getDatasetDetailsForList({ datasets: inputs, tabId }).catch(() => []) : Promise.resolve([])
    ]);

    // Only connector-backed inputs are listed. A dataflow output, view, or fusion
    // could never be deleted from here (Domo has no fallback, so the dataflow or
    // view that produces it just breaks), and skipping them means no dependency
    // lookup runs for them either. An input whose details didn't come back is
    // left out too, since an unclassifiable dataset is not a known-safe one.
    const detailsById = {};
    for (const ds of inputDetails) detailsById[String(ds.id)] = ds;
    const connectorInputs = inputs.filter((i) => {
      const details = detailsById[String(i.dataSourceId)];
      return details && !isTransformDataset(details);
    });
    const inputDependents =
      connectorInputs.length > 0
        ? await getOtherDependentCountsForDatasets({
            datasetIds: connectorInputs.map((i) => String(i.dataSourceId)),
            excludeDataflowId: id,
            tabId
          }).catch(() => ({}))
        : {};
    const groups = [
      {
        blocking: false,
        deleted: true,
        // Each output carries its total downstream impact, so how far the delete
        // reaches is visible without opening anything.
        items: outputs.map((o) => ({
          ...countBadge(outputImpacts[String(o.dataSourceId)], 'dependency', 'dependencies'),
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

    // Inputs: kept by the primary delete, and by the alternate one unless the
    // user checks them. `deletableIds` is the subset the alternate delete may
    // offer; every other row carries the reason it is off limits.
    if (connectorInputs.length > 0) {
      const deletableIds = [];
      const unselectableReasons = {};
      const inputItems = connectorInputs.map((i) => {
        const id = String(i.dataSourceId);
        const dependents = inputDependents[id];
        const reason = inputExclusionReason(dependents);
        if (reason) unselectableReasons[id] = reason;
        else deletableIds.push(id);
        return {
          ...countBadge(otherDependentTotal(dependents), 'other dependency', 'other dependencies'),
          id: i.dataSourceId,
          label: i.dataSourceName || i.dataSourceId,
          typeId: 'DATA_SOURCE',
          url: `${origin}/datasources/${i.dataSourceId}/details/overview`
        };
      });
      groups.push({
        annotation: 'Only the alternate delete removes these, and only the ones you check.',
        blocking: false,
        deletableIds,
        deleted: false,
        items: inputItems,
        key: 'dataflowInputs',
        label: 'Connector Input DataSets',
        unselectableReasons
      });
    }

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
  MAGNUM_COLLECTION: async ({ id, metadata, origin, parentId }, tabId) => {
    // The parent datastore ID is enriched onto the collection as parentId, and
    // doubles as the connected app's instance ID. The synced dataset's ID is
    // enriched onto the collection details, so no extra fetch is needed for it.
    if (!parentId) return [];
    const datasetId = metadata?.details?.datasourceId || null;
    const [collections, connectedApps, datasetInfo, datasetDependents] = await Promise.all([
      getAppInstanceCollections({ appInstanceId: parentId, tabId }),
      // Best-effort: a collection no app uses returns none, and a failed lookup
      // just omits the group rather than blocking the delete.
      getCollectionConnectedApps({ collectionId: id, tabId }).catch(() => []),
      datasetId ? searchDatasets(datasetId, tabId).catch(() => null) : Promise.resolve(null),
      datasetId ? getDatasetDependentCount({ datasetId, tabId }).catch(() => 0) : Promise.resolve(0)
    ]);
    const groups = [];
    // The synced dataset isn't deleted with the collection, so it's advisory. Its
    // downstream dependent count shows on the row as a "(N dependencies)" badge.
    if (datasetId) {
      groups.push({
        blocking: false,
        deleted: false,
        flat: true,
        items: [
          {
            count: datasetDependents,
            countLabel: datasetDependents === 1 ? 'dependency' : 'dependencies',
            id: datasetId,
            label: datasetInfo?.datasets?.[0]?.name || `DataSet ${datasetId}`,
            typeId: 'DATA_SOURCE',
            url: `${origin}/datasources/${datasetId}/details/overview`
          }
        ],
        key: 'syncedDataset',
        label: 'Synced DataSet'
      });
    }
    // The connected apps aren't deleted, but deleting the collection (or the
    // whole datastore) breaks them, so surface them as advisory.
    if (connectedApps.length > 0) {
      groups.push({
        blocking: false,
        deleted: false,
        items: connectedApps.map((app) => ({
          id: app.cardId,
          label: app.title,
          typeId: 'CARD',
          url: `${origin}/kpis/details/${app.cardId}`
        })),
        key: 'connectedApps',
        label: connectedApps.length === 1 ? 'Connected App' : 'Connected Apps'
      });
    }
    // Other collections in the datastore aren't touched by the primary "Delete
    // Collection", so they're advisory (deleted: false); only the datastore
    // cascade removes them. The cascade button reads this group's count via its key.
    const siblings = collections.filter((c) => String(c.id) !== String(id));
    if (siblings.length > 0) {
      groups.push({
        blocking: false,
        deleted: false,
        items: siblings.map((c) => ({
          id: c.id,
          label: c.name || c.id,
          typeId: 'MAGNUM_COLLECTION',
          url: `${origin}/appDb/${c.id}/permissions`
        })),
        key: 'siblingCollections',
        label: 'Other Collections in This Datastore'
      });
    }
    return groups;
  },

  PAGE: async ({ id, origin }, tabId) => {
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
  TEMPLATE: async ({ id, metadata, origin }, tabId) => {
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
 * @param {string} params.origin - The instance origin (for building URLs)
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
export async function getDependenciesForDelete({ object, origin, tabId = null }) {
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
      metadata: object.metadata,
      origin,
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
      // Counted the same way as totalCount above: a count-only group would
      // otherwise set a blocking reason while leaving blockingCount at 0, which
      // the view reads as not blocked.
      blockingCount += g.items.length || (g.count ?? 0);
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
