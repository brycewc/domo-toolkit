import { parseBeastModeLinks, rootCardIdsFor } from '@/utils/beastModeLinks';
import { DEPENDENCY_FETCH_CONCURRENCY, EXPORT_FORMATS } from '@/utils/constants';
import { executeInPage } from '@/utils/executeInPage';

import { extractPageContentIds, getFormsForPage, getQueuesForPage } from './appStudio';
import { getFunctionTemplate } from './functions';

/**
 * Export a card as a file download, using the card's current view state
 * (applied filters, date range, chart overrides, etc.).
 *
 * Runs in the page context so it can access Domo's Angular services
 * (cdExportService / cdExportStateService) that hold the live card state.
 *
 * @param {Object} params
 * @param {string|number} params.cardId - Card URN / ID
 * @param {string} [params.cardTitle] - Card title for the filename
 * @param {'excel'|'csv'|'powerpoint'} [params.format='excel'] - Export format
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<{ success: boolean, fileName: string }>}
 */
export async function exportCard({ cardId, cardTitle, format = 'excel', tabId = null }) {
  const fmt = EXPORT_FORMATS[format];
  if (!fmt) throw new Error(`Unsupported export format: ${format}`);

  const fileName = `${cardTitle || 'export'}.${fmt.extension}`;

  return executeInPage(
    async (cardId, fileName, accept) => {
      let exportBody = null;
      const hasAngular = typeof angular !== 'undefined' && !!document.querySelector('.ng-scope');

      // ── Helper: collect page/card filters from the filter builder ──
      function collectFilterBuilderFilters() {
        if (!hasAngular) return [];
        let raw = [];
        const scopes = document.querySelectorAll('.ng-scope');
        for (const scopeEl of scopes) {
          const ctrl = angular.element(scopeEl).scope()?.$ctrl;
          if (Array.isArray(ctrl?.currentFilters) && ctrl.onFiltersChanged) {
            raw = ctrl.currentFilters;
            break;
          }
          if (Array.isArray(ctrl?.filters) && ctrl.onUpdateFilters) {
            raw = ctrl.filters;
            break;
          }
        }
        if (!raw.length) return [];
        // Deduplicate by column + operand + sorted values
        const seen = new Set();
        return raw.filter((f) => {
          const key = `${f.column}|${f.operand}|${[...(f.values || [])].sort().join(',')}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // ── Helper: find kpiModel from Angular scopes ──
      function findKpiModel() {
        if (!hasAngular) return null;
        const scopes = document.querySelectorAll('.ng-scope');
        for (const scopeEl of scopes) {
          const model = angular.element(scopeEl).scope()?.$ctrl?.kpiModel;
          if (model && String(model.getKpiURN?.()) === String(cardId)) {
            return model;
          }
        }
        for (const scopeEl of scopes) {
          const model = angular.element(scopeEl).scope()?.$ctrl?.kpiModel;
          if (model) return model;
        }
        return null;
      }

      // ── 1. Try the full Angular services path ──
      try {
        if (hasAngular) {
          const inj = angular.element(document.querySelector('.ng-scope')).injector();
          const svc = inj.get('cdExportService');
          const stateSvc = inj.get('cdExportStateService');
          const chartViewState = stateSvc.getChartViewState();
          const kpiModel = findKpiModel();

          if (kpiModel && chartViewState) {
            const exportReq = svc.createExportRequestFromState(kpiModel, chartViewState);
            const cardExportReq = svc.convertToCardExportRequest(exportReq);

            exportBody = {
              ...cardExportReq,
              accept,
              fileName,
              showAnnotations: cardExportReq.showAnnotations ?? true,
              type: 'file'
            };

            // If the services path returned empty filters, supplement
            // with filter builder filters (page-level slicers, etc.)
            if (!exportBody.queryOverrides?.filters?.length) {
              const fbFilters = collectFilterBuilderFilters();
              if (fbFilters.length) {
                exportBody.queryOverrides.filters = fbFilters;
                exportBody.queryOverrides.overrideSlicers = true;
              }
            }
          }
        }
      } catch {
        // Angular services unavailable or incompatible card – continue
      }

      // ── 2. Fallback: build request manually with filter discovery ──
      if (!exportBody) {
        const filters = collectFilterBuilderFilters();

        exportBody = {
          accept,
          chartState: {},
          fileName,
          mobile: false,
          queryOverrides: {
            dataControlContext: { filterGroupIds: [] },
            filters,
            overrideDateRange: false,
            overrideSlicers: filters.length > 0,
            segments: []
          },
          showAnnotations: true,
          type: 'file',
          watermark: true
        };
      }

      // ── 3. POST to the export endpoint ──
      const url = `/api/content/v1/cards/${cardId}/export`;
      const body = 'request=' + encodeURIComponent(JSON.stringify(exportBody));

      const response = await fetch(url, {
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        method: 'POST'
      });

      if (!response.ok) {
        throw new Error(`Export failed – HTTP ${response.status}`);
      }

      // ── 4. Trigger browser download ──
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);

      return { fileName, success: true };
    },
    [String(cardId), fileName, fmt.accept],
    tabId
  );
}

export async function getCardDatasets({ cardId, tabId = null }) {
  try {
    return await executeInPage(
      async (cardId) => {
        const response = await fetch(`/api/content/v1/cards?urns=${cardId}&includeFiltered=true&parts=datasources`);
        if (!response.ok) {
          throw new Error(`Failed to fetch card datasets for ${cardId}. HTTP status: ${response.status}`);
        }
        const cards = await response.json();
        return [].concat(cards).flatMap((c) => c.datasources || []);
      },
      [cardId],
      tabId
    );
  } catch (error) {
    console.error('Error fetching card datasets:', error);
    throw error;
  }
}

export async function getCardDefinition({ cardId, tabId = null }) {
  try {
    return await executeInPage(
      async (cardId) => {
        const response = await fetch('/api/content/v3/cards/kpi/definition', {
          body: JSON.stringify({
            dynamicText: true,
            urn: cardId,
            variables: true
          }),
          headers: {
            'Accept': 'application/json',
            'Content-Type': 'application/json'
          },
          method: 'PUT'
        });
        if (!response.ok) {
          throw new Error(`Failed to fetch card definition for ${cardId}. HTTP status: ${response.status}`);
        }
        return response.json();
      },
      [cardId],
      tabId
    );
  } catch (error) {
    console.error('Error fetching card definition:', error);
    throw error;
  }
}

/**
 * Fetch the current owners of a batch of cards.
 *
 * Cards do not carry owner data in the card-list pipeline, so owners are read
 * separately via the batch `/api/content/v1/cards?urns=...&parts=owners`
 * endpoint (the same endpoint `getCardDatasets` uses with `parts=datasources`).
 * URNs are chunked to keep the query string within a safe length. Each owner is
 * `{ id, type, displayName }` where `type` is `'USER' | 'GROUP'`.
 *
 * @param {Object} params
 * @param {number[]} params.cardIds - Card IDs to read owners for
 * @param {number|null} [params.tabId=null] - Optional Chrome tab ID
 * @returns {Promise<Object<string, Array<{displayName: string, id: string, type: string}>>>}
 *   Map of card ID (string) to its owners. Cards missing from the response are
 *   absent from the map, so the caller can treat them as unreadable.
 * @throws {Error} If a batch request fails
 */
export async function getCardOwners({ cardIds, tabId = null }) {
  const OWNERS_READ_BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < cardIds.length; i += OWNERS_READ_BATCH_SIZE) {
    batches.push(cardIds.slice(i, i + OWNERS_READ_BATCH_SIZE));
  }

  const ownersByCardId = {};
  for (const batch of batches) {
    // Return a structured result rather than throwing inside the page: Chrome
    // swallows a rejected promise from an async injected function (null result,
    // no error), which would make every card look ownerless and block the save.
    const result = await executeInPage(
      async (batch) => {
        const params = new URLSearchParams();
        for (const id of batch) params.append('urns', id);
        params.append('parts', 'owners');
        const response = await fetch(`/api/content/v1/cards?${params.toString()}`);
        if (!response.ok) return { error: `HTTP status: ${response.status}`, ok: false };
        return { cards: await response.json(), ok: true };
      },
      [batch],
      tabId
    );
    if (!result?.ok) throw new Error(result?.error || 'Failed to fetch card owners');
    for (const card of [].concat(result.cards || [])) {
      const rawId = card?.id ?? (typeof card?.urn === 'string' ? card.urn.split(':').pop() : null);
      if (rawId == null) continue;
      ownersByCardId[String(rawId)] = (card.owners || []).map((o) => ({
        displayName: o.displayName || '',
        id: String(o.id),
        type: o.type
      }));
    }
  }
  return ownersByCardId;
}

/**
 * Batch-fetch full card objects by id, chunking URNs to keep the query string
 * within a safe length. A drill id is itself a card id, so drills resolve here too.
 *
 * @param {Object} params
 * @param {Array<string|number>} params.cardIds - Card (or drill) IDs to read
 * @param {string} [params.parts='metadata'] - Comma-separated parts to request
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<Array<Object>>} Card objects with a normalized numeric `id`.
 *   Ids that don't resolve are absent rather than returned empty.
 * @throws {Error} If a batch request fails
 */
export async function getCardsByIds({ cardIds, parts = 'metadata', tabId = null }) {
  const ids = [...new Set((cardIds || []).filter((id) => id != null).map(String))];
  if (ids.length === 0) return [];

  const CARD_READ_BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < ids.length; i += CARD_READ_BATCH_SIZE) {
    batches.push(ids.slice(i, i + CARD_READ_BATCH_SIZE));
  }

  const cards = [];
  for (const batch of batches) {
    // Return a structured result rather than throwing inside the page: Chrome
    // swallows a rejected promise from an async injected function (null result,
    // no error), which would silently read as "this Beast Mode is used nowhere".
    const result = await executeInPage(
      async (batch, parts) => {
        const params = new URLSearchParams();
        for (const id of batch) params.append('urns', id);
        params.append('includeFiltered', 'true');
        if (parts) params.append('parts', parts);
        const response = await fetch(`/api/content/v1/cards?${params.toString()}`);
        if (!response.ok) return { error: `HTTP status: ${response.status}`, ok: false };
        return { cards: await response.json(), ok: true };
      },
      [batch, parts],
      tabId
    );
    if (!result?.ok) throw new Error(result?.error || 'Failed to fetch cards');
    for (const card of [].concat(result.cards || [])) {
      const rawId = card?.id ?? (typeof card?.urn === 'string' ? card.urn.split(':').pop() : null);
      if (rawId == null) continue;
      const numericId = Number(rawId);
      cards.push({ ...card, id: Number.isFinite(numericId) ? numericId : rawId });
    }
  }
  return cards;
}

/**
 * Get all cards for a given object (page, dataset, dataflow, or Beast Mode)
 * @param {Object} params - Parameters for fetching cards
 * @param {string} params.objectId - The object ID (page, dataset, dataflow, or Beast Mode ID)
 * @param {string} params.objectType - The object type ('PAGE', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE', 'BEAST_MODE_FORMULA')
 * @param {Object} [params.metadata] - Object metadata (required for DATAFLOW_TYPE to access outputs;
 *   lets BEAST_MODE_FORMULA read its links without a request)
 * @param {string} [params.parts] - Comma-separated extra parts to request for page-type fetches
 *   (e.g. 'datasources'), so each card comes back with that data attached. Ignored for datasets.
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<Array>} Array of card objects with details
 * @throws {Error} If the fetch fails
 */
export async function getCardsForObject({ metadata, objectId, objectType, parts = null, tabId = null }) {
  if (objectType === 'BEAST_MODE_FORMULA') {
    // Detection stores the whole template response as the object's details, and
    // usage lives in its `links`, so the common path needs no extra request.
    const template = metadata?.details?.links ? metadata.details : await getFunctionTemplate(objectId, tabId);
    const cardIds = rootCardIdsFor(parseBeastModeLinks(template?.links));
    return getCardsByIds({ cardIds, parts: parts || 'metadata', tabId });
  }

  if (objectType === 'DATAFLOW_TYPE') {
    const outputs = metadata?.details?.outputs || [];
    if (outputs.length === 0) return [];

    // Each output is its own page round-trip, so they run together and are
    // deduped afterwards in output order rather than as they arrive.
    const perOutput = new Array(outputs.length);
    let next = 0;
    await Promise.all(
      Array.from({ length: Math.min(DEPENDENCY_FETCH_CONCURRENCY, outputs.length) }, async () => {
        while (next < outputs.length) {
          const index = next++;
          perOutput[index] = await getCardsForObject({
            objectId: outputs[index].dataSourceId,
            objectType: 'DATA_SOURCE',
            tabId
          });
        }
      })
    );

    const allCards = [];
    const seen = new Set();
    for (const dsCards of perOutput) {
      for (const card of dsCards) {
        if (!seen.has(card.id)) {
          seen.add(card.id);
          allCards.push(card);
        }
      }
    }
    return allCards;
  }

  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (objectId, objectType, parts) => {
        switch (objectType) {
          case 'DATA_APP_VIEW':
          case 'PAGE':
          case 'REPORT_BUILDER_VIEW':
          case 'WORKSHEET_VIEW': {
            const url = parts
              ? `/api/content/v3/stacks/${objectId}/cards?parts=${parts}`
              : `/api/content/v3/stacks/${objectId}/cards`;
            const response = await fetch(url);
            if (!response.ok) {
              throw new Error(`Failed to fetch cards for ${objectType} ${objectId}. HTTP status: ${response.status}`);
            }
            const page = await response.json();
            const cards = page.cards || [];
            return cards.filter((c) => Number.isFinite(c.id));
          }

          case 'DATA_SOURCE': {
            const response = await fetch(`/api/content/v1/datasources/${objectId}/cards`);
            if (!response.ok) {
              throw new Error(`Failed to fetch cards for DataSet ${objectId}. HTTP status: ${response.status}`);
            }
            const cards = await response.json();
            if (!cards.length) return [];
            // Normalize cards to have id property
            return cards.map((card) => ({
              ...card,
              id: card.id || card.kpiId || (typeof card.urn === 'string' ? parseInt(card.urn.split(':').pop(), 10) : null)
            }));
          }

          default:
            throw new Error(`Cannot get cards for object type ${objectType}`);
        }
      },
      [objectId, objectType, parts],
      tabId
    );

    return result;
  } catch (error) {
    console.error('Error fetching cards for object:', error);
    throw error;
  }
}

/**
 * Fetch all content (cards, forms, queues) across every view on a parent
 * DATA_APP or WORKSHEET, grouped by view. Both types share the same backend
 * endpoint, so the parent type doesn't need to be passed in.
 *
 * @param {Object} params
 * @param {string} params.parentId - The DATA_APP or WORKSHEET ID
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<{
 *   parentName: string,
 *   viewGroups: Array<{
 *     viewId: string,
 *     viewName: string,
 *     cards: Array,
 *     forms: Array,
 *     queues: Array
 *   }>
 * }>}
 */
export async function getCardsForParent({ parentId, tabId = null }) {
  // 1. Fetch the parent app/worksheet to get its name and view list.
  const parentData = await executeInPage(
    async (parentId) => {
      const response = await fetch(`/api/content/v1/dataapps/${parentId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch parent ${parentId}. HTTP status: ${response.status}`);
      }
      const data = await response.json();
      return {
        name: data.title || data.name || `App ${parentId}`,
        views: (data.views || []).map((v) => ({
          viewId: String(v.viewId),
          viewName: v.title || `View ${v.viewId}`
        }))
      };
    },
    [parentId],
    tabId
  );

  // 2. For each view, fetch details + cards in parallel, then forms/queues
  //    from widget IDs in the layout. Per-view errors are isolated so one
  //    failing view doesn't take down the whole result.
  const viewGroups = await Promise.all(
    parentData.views.map(async ({ viewId, viewName }) => {
      try {
        const [details, cards] = await Promise.all([
          fetchViewDetails(viewId, tabId),
          getCardsForObject({
            objectId: viewId,
            objectType: 'DATA_APP_VIEW',
            tabId
          }).catch(() => [])
        ]);

        const { formWidgetIds, queueWidgetIds } = extractPageContentIds(details);

        const [forms, queues] = await Promise.all([
          formWidgetIds.length > 0 ? getFormsForPage({ formWidgetIds, tabId }).catch(() => []) : Promise.resolve([]),
          queueWidgetIds.length > 0 ? getQueuesForPage({ queueWidgetIds, tabId }).catch(() => []) : Promise.resolve([])
        ]);

        return { cards, forms, queues, viewId, viewName };
      } catch (error) {
        console.warn(`Error fetching content for view ${viewId}:`, error);
        return { cards: [], forms: [], queues: [], viewId, viewName };
      }
    })
  );

  // 3. Drop views that ended up with no content -- keeps the grouped list clean.
  const nonEmpty = viewGroups.filter((vg) => vg.cards.length > 0 || vg.forms.length > 0 || vg.queues.length > 0);

  return { parentName: parentData.name, viewGroups: nonEmpty };
}

export async function getDrillParentCardId(drillViewId, inPageContext = false, tabId = null) {
  const fetchLogic = async (drillViewId) => {
    const response = await fetch(`/api/content/v1/cards/${drillViewId}/urn`);
    if (!response.ok) {
      throw new Error(`Failed to fetch Drill Path ${drillViewId}. HTTP status: ${response.status}`);
    }
    const card = await response.json();
    return card.rootId;
  };

  try {
    // If already in page context, execute directly; otherwise use executeInPage
    const result = inPageContext ? await fetchLogic(drillViewId) : await executeInPage(fetchLogic, [drillViewId], tabId);

    return result;
  } catch (error) {
    console.error('Error fetching drill parent card ID:', error);
    throw error;
  }
}

/**
 * Fetch a text (notebook) card's authored content. The response carries the
 * content in several shapes; `textHtml` is the rendered fragment with dynamic
 * values (summary numbers, variables) already resolved.
 * @param {Object} params
 * @param {string|number} params.cardId - Card ID
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<{textHtml: string, markup: string, tagMarkup: string, dynamicTextItems: string}>}
 */
export async function getNotebookCardText({ cardId, tabId = null }) {
  return executeInPage(
    async (cardId) => {
      const response = await fetch(`/api/content/v1/cards/notebook/${cardId}`);
      if (!response.ok) {
        throw new Error(`Failed to fetch notebook card ${cardId}. HTTP status: ${response.status}`);
      }
      return response.json();
    },
    [cardId],
    tabId
  );
}

/**
 * Get all cards owned by a user or group.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedCards(ownerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, ownerType) => {
      const allCards = [];
      const count = 50;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            combineResults: false,
            count,
            entityList: [['card']],
            filters: [
              {
                facetType: 'user',
                field: 'owned_by_id',
                filterType: 'term',
                name: 'OWNED_BY_ID',
                value: `${ownerId}:${ownerType}`
              }
            ],
            offset,
            query: '*'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.searchObjects && data.searchObjects.length > 0) {
          allCards.push(
            ...data.searchObjects.map((c) => ({
              id: c.databaseId,
              name: c.winnerText || c.databaseId.toString()
            }))
          );
          offset += count;
          if (data.searchObjects.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allCards;
    },
    [ownerId, ownerType],
    tabId
  );
}

/**
 * Get cards for a specific page
 * @param {number} pageId - The page ID
 * @returns {Promise<Array>} Array of card objects
 */
export async function getPageCards(pageId) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (pageId) => {
        const response = await fetch(`/api/content/v1/pages/${pageId}/cards?parts=metadata&showAllCards=true`, {
          headers: {
            Accept: 'application/json'
          }
        });

        if (response.ok) {
          const pageData = await response.json();
          return pageData || [];
        }

        return [];
      },
      [pageId]
    );

    return result;
  } catch (error) {
    console.error(`Failed to fetch cards for page ${pageId}:`, error);
    return [];
  }
}

/**
 * Lock or unlock cards in bulk. Both directions use the same
 * `/api/content/v1/cards/bulk/lock` endpoint: `PUT` (card IDs in the body)
 * locks, `DELETE` (card IDs in the `urns` query) unlocks. A card's ID and URN
 * are equivalent for lockable (top-level) cards, so plain IDs are sent either
 * way. Cards are processed in batches of 50; a failed batch is recorded rather
 * than aborting the rest, so the caller can surface partial results.
 * @param {Object} params
 * @param {number[]} params.cardIds - Card IDs to lock or unlock
 * @param {boolean} params.locked - true to lock, false to unlock
 * @param {number|null} [params.tabId=null] - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function setCardsLocked({ cardIds, locked, tabId = null }) {
  const LOCK_BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < cardIds.length; i += LOCK_BATCH_SIZE) {
    batches.push(cardIds.slice(i, i + LOCK_BATCH_SIZE));
  }

  const errors = [];
  let failed = 0;
  let succeeded = 0;

  for (const batch of batches) {
    try {
      // Return a structured result rather than throwing: Chrome swallows a
      // rejected promise from an async injected function (null result, no
      // error), which would bypass the failed-batch accounting below and make a
      // failed lock/unlock report success. See executeInPage.
      const result = await executeInPage(
        async (batch, locked) => {
          let response;
          if (locked) {
            response = await fetch('/api/content/v1/cards/bulk/lock', {
              body: JSON.stringify(batch),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            });
          } else {
            const params = new URLSearchParams();
            for (const id of batch) params.append('urns', id);
            response = await fetch(`/api/content/v1/cards/bulk/lock?${params.toString()}`, {
              method: 'DELETE'
            });
          }
          if (!response.ok) {
            return { error: `HTTP status: ${response.status}`, ok: false };
          }
          return { ok: true };
        },
        [batch, locked],
        tabId
      );
      if (!result?.ok) {
        failed += batch.length;
        errors.push(...batch.map((id) => ({ error: result?.error || 'HTTP error', id })));
      } else {
        succeeded += batch.length;
      }
    } catch (error) {
      failed += batch.length;
      errors.push(...batch.map((id) => ({ error: error.message, id })));
    }
  }

  return { errors, failed, succeeded };
}

/**
 * Transfer card ownership to a new user or group.
 * @param {number[]} cardIds - Array of card IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferCards(cardIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (cardIds, fromOwnerId, toOwnerId, ownerType) => {
      try {
        // Add new owner
        const addResponse = await fetch('/api/content/v1/cards/owners/add', {
          body: JSON.stringify({
            cardIds,
            cardOwners: [{ id: toOwnerId, type: ownerType }],
            note: '',
            sendEmail: false
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!addResponse.ok) throw new Error(`HTTP ${addResponse.status}`);

        // Remove old owner
        const removeResponse = await fetch('/api/content/v1/cards/owners/remove', {
          body: JSON.stringify({
            cardIds,
            cardOwners: [{ id: fromOwnerId, type: ownerType }]
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!removeResponse.ok) throw new Error(`HTTP ${removeResponse.status}`);

        return { errors: [], failed: 0, succeeded: cardIds.length };
      } catch (error) {
        return {
          errors: cardIds.map((id) => ({ error: error.message, id })),
          failed: cardIds.length,
          succeeded: 0
        };
      }
    },
    [cardIds, fromOwnerId, toOwnerId, ownerType],
    tabId
  );
}

export async function updateCardDefinition({ cardId, definition, tabId = null }) {
  try {
    const datasetId = definition?.columns?.[0]?.sourceId;

    delete definition.id;
    delete definition.urn;
    delete definition.columns;
    delete definition.drillpath;
    delete definition.embedded;
    delete definition.dataSourceWrite;

    definition.dataProvider = {
      dataSourceId: datasetId || null
    };
    definition.variables = true;

    definition.definition.formulas = {
      card: (definition.definition.formulas || []).filter((f) => f.persistedOnDataSource === false),
      dsDeleted: [],
      dsUpdated: []
    };
    definition.definition.annotations = {
      deleted: [],
      modified: [],
      new: []
    };

    // Transform conditionalFormats from array to object with card and datasource arrays
    if (Array.isArray(definition.definition.conditionalFormats)) {
      const cardFormats = [];
      const datasourceFormats = [];

      definition.definition.conditionalFormats.forEach((format) => {
        if (format.dataSourceId) {
          datasourceFormats.push(format);
        } else {
          cardFormats.push(format);
        }
      });

      definition.definition.conditionalFormats = {
        card: cardFormats,
        datasource: datasourceFormats
      };
    }

    // Update the card with the modifications.
    // Return a structured result rather than throwing: Chrome swallows a rejected
    // promise from an async injected function (null result, no error), which would
    // make a failed card update report success. See executeInPage.
    const result = await executeInPage(
      async (cardId, definition) => {
        const response = await fetch(`/api/content/v3/cards/kpi/${cardId}`, {
          body: JSON.stringify(definition),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) {
          // Include the response body so callers can surface why the
          // update was rejected (Domo returns helpful detail in JSON body).
          let bodyText = '';
          try {
            bodyText = await response.text();
          } catch {
            // body unreadable, fall through with empty
          }
          return { error: `Failed to update card ${cardId}. HTTP ${response.status}: ${bodyText}`.trim(), ok: false };
        }
        return { ok: true };
      },
      [cardId, definition],
      tabId
    );
    if (!result?.ok) throw new Error(result?.error || 'Failed to update card definition');
  } catch (error) {
    console.error('Error updating card definition:', error);
    throw error;
  }
}

/**
 * Add and/or remove owners across a batch of cards in two bulk calls.
 *
 * Card ownership is additive: `owners/add` adds each owner to every listed card
 * (idempotent when a card already has it) and `owners/remove` removes each from
 * every listed card. Owners left untouched (neither added nor removed) keep
 * their existing per-card assignment. Both lists are `{ id, type }` objects that
 * mix USER and GROUP freely. Cards are processed in batches; a failed batch is
 * recorded rather than aborting the rest, so the caller can surface partial
 * results, mirroring `setCardsLocked`.
 *
 * @param {Object} params
 * @param {Array<{id: (string|number), type: string}>} [params.addOwners=[]] - Owners to add to every card
 * @param {number[]} params.cardIds - Card IDs to update
 * @param {Array<{id: (string|number), type: string}>} [params.removeOwners=[]] - Owners to remove from every card
 * @param {number|null} [params.tabId=null] - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function updateCardOwners({ addOwners = [], cardIds, removeOwners = [], tabId = null }) {
  if (cardIds.length === 0 || (addOwners.length === 0 && removeOwners.length === 0)) {
    return { errors: [], failed: 0, succeeded: 0 };
  }

  const OWNERS_WRITE_BATCH_SIZE = 100;
  const batches = [];
  for (let i = 0; i < cardIds.length; i += OWNERS_WRITE_BATCH_SIZE) {
    batches.push(cardIds.slice(i, i + OWNERS_WRITE_BATCH_SIZE));
  }

  const errors = [];
  let failed = 0;
  let succeeded = 0;

  for (const batch of batches) {
    try {
      // Return a structured result rather than throwing: Chrome swallows a
      // rejected promise from an async injected function (null result, no
      // error), which would make a failed owner change report success. See
      // executeInPage.
      const result = await executeInPage(
        async (cardIds, addOwners, removeOwners) => {
          if (addOwners.length > 0) {
            const addResponse = await fetch('/api/content/v1/cards/owners/add', {
              body: JSON.stringify({
                cardIds,
                cardOwners: addOwners.map((o) => ({ id: o.id, type: o.type })),
                note: '',
                sendEmail: false
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            });
            if (!addResponse.ok) return { error: `Add owners failed. HTTP ${addResponse.status}`, ok: false };
          }
          if (removeOwners.length > 0) {
            const removeResponse = await fetch('/api/content/v1/cards/owners/remove', {
              body: JSON.stringify({
                cardIds,
                cardOwners: removeOwners.map((o) => ({ id: o.id, type: o.type }))
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            });
            if (!removeResponse.ok) return { error: `Remove owners failed. HTTP ${removeResponse.status}`, ok: false };
          }
          return { ok: true };
        },
        [batch, addOwners, removeOwners],
        tabId
      );
      if (!result?.ok) {
        failed += batch.length;
        errors.push(...batch.map((id) => ({ error: result?.error || 'HTTP error', id })));
      } else {
        succeeded += batch.length;
      }
    } catch (error) {
      failed += batch.length;
      errors.push(...batch.map((id) => ({ error: error.message, id })));
    }
  }

  return { errors, failed, succeeded };
}

/**
 * Fetch the bare stacks details for a view so we can read pageLayoutV4 and
 * derive form/queue widget IDs. Returns null on failure rather than throwing.
 */
async function fetchViewDetails(viewId, tabId) {
  try {
    return await executeInPage(
      async (viewId) => {
        const response = await fetch(`/api/content/v3/stacks/${viewId}`);
        if (!response.ok) return null;
        return response.json();
      },
      [viewId],
      tabId
    );
  } catch {
    return null;
  }
}
