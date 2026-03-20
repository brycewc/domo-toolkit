import { executeInPage, EXPORT_FORMATS } from '@/utils';

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
export async function exportCard({
  cardId,
  cardTitle,
  format = 'excel',
  tabId = null
}) {
  const fmt = EXPORT_FORMATS[format];
  if (!fmt) throw new Error(`Unsupported export format: ${format}`);

  const fileName = `${cardTitle || 'export'}.${fmt.extension}`;

  return executeInPage(
    async (cardId, fileName, accept) => {
      let exportBody = null;
      const hasAngular =
        typeof angular !== 'undefined' && !!document.querySelector('.ng-scope');

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
          const inj = angular
            .element(document.querySelector('.ng-scope'))
            .injector();
          const svc = inj.get('cdExportService');
          const stateSvc = inj.get('cdExportStateService');
          const chartViewState = stateSvc.getChartViewState();
          const kpiModel = findKpiModel();

          if (kpiModel && chartViewState) {
            const exportReq = svc.createExportRequestFromState(
              kpiModel,
              chartViewState
            );
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
        const response = await fetch(
          `/api/content/v1/cards?urns=${cardId}&includeFiltered=true&parts=datasources`
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch card datasets for ${cardId}. HTTP status: ${response.status}`
          );
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
          throw new Error(
            `Failed to fetch card definition for ${cardId}. HTTP status: ${response.status}`
          );
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
 * Get all cards for a given object (page, dataset, or dataflow)
 * @param {Object} params - Parameters for fetching cards
 * @param {string} params.objectId - The object ID (page, dataset, or dataflow ID)
 * @param {string} params.objectType - The object type ('PAGE', 'DATA_APP_VIEW', 'DATA_SOURCE', 'DATAFLOW_TYPE')
 * @param {Object} [params.metadata] - Object metadata (required for DATAFLOW_TYPE to access outputs)
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<Array>} Array of card objects with details
 * @throws {Error} If the fetch fails
 */
export async function getCardsForObject({
  metadata,
  objectId,
  objectType,
  tabId = null
}) {
  if (objectType === 'DATAFLOW_TYPE') {
    const outputs = metadata?.details?.outputs || [];
    if (outputs.length === 0) return [];

    const allCards = [];
    const seen = new Set();
    for (const output of outputs) {
      const dsCards = await getCardsForObject({
        objectId: output.dataSourceId,
        objectType: 'DATA_SOURCE',
        tabId
      });
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
      async (objectId, objectType) => {
        switch (objectType) {
          case 'DATA_APP_VIEW':
          case 'PAGE':
          case 'REPORT_BUILDER_VIEW':
          case 'WORKSHEET_VIEW': {
            const response = await fetch(
              `/api/content/v3/stacks/${objectId}/cards`
            );
            if (!response.ok) {
              throw new Error(
                `Failed to fetch cards for ${objectType} ${objectId}. HTTP status: ${response.status}`
              );
            }
            const page = await response.json();
            const cards = page.cards || [];
            return cards.filter((c) => Number.isFinite(c.id));
          }

          case 'DATA_SOURCE': {
            const response = await fetch(
              `/api/content/v1/datasources/${objectId}/cards`
            );
            if (!response.ok) {
              throw new Error(
                `Failed to fetch cards for DataSet ${objectId}. HTTP status: ${response.status}`
              );
            }
            const cards = await response.json();
            if (!cards.length) return [];
            // Normalize cards to have id property
            return cards.map((card) => ({
              ...card,
              id:
                card.id ||
                card.kpiId ||
                (typeof card.urn === 'string'
                  ? parseInt(card.urn.split(':').pop(), 10)
                  : null)
            }));
          }

          default:
            throw new Error(`Cannot get cards for object type ${objectType}`);
        }
      },
      [objectId, objectType],
      tabId
    );

    return result;
  } catch (error) {
    console.error('Error fetching cards for object:', error);
    throw error;
  }
}

export async function getDrillParentCardId(
  drillViewId,
  inPageContext = false,
  tabId = null
) {
  const fetchLogic = async (drillViewId) => {
    const response = await fetch(`/api/content/v1/cards/${drillViewId}/urn`);
    if (!response.ok) {
      throw new Error(
        `Failed to fetch Drill Path ${drillViewId}. HTTP status: ${response.status}`
      );
    }
    const card = await response.json();
    return card.rootId;
  };

  try {
    // If already in page context, execute directly; otherwise use executeInPage
    const result = inPageContext
      ? await fetchLogic(drillViewId)
      : await executeInPage(fetchLogic, [drillViewId], tabId);

    return result;
  } catch (error) {
    console.error('Error fetching drill parent card ID:', error);
    throw error;
  }
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
        const response = await fetch(
          `/api/content/v1/pages/${pageId}/cards?parts=metadata&showAllCards=true`,
          {
            headers: {
              Accept: 'application/json'
            }
          }
        );

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

export async function lockCards({ cardIds, tabId = null }) {
  const LOCK_BATCH_SIZE = 50;
  const batches = [];
  for (let i = 0; i < cardIds.length; i += LOCK_BATCH_SIZE) {
    batches.push(cardIds.slice(i, i + LOCK_BATCH_SIZE));
  }

  for (const batch of batches) {
    await executeInPage(
      async (cardIds) => {
        const response = await fetch('/api/content/v1/cards/bulk/lock', {
          body: JSON.stringify(cardIds),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) {
          throw new Error(
            `Failed to lock cards. HTTP status: ${response.status}`
          );
        }
      },
      [batch],
      tabId
    );
  }
}

export async function removeCardFromPage({ cardId, pageId, tabId = null }) {
  try {
    const result = await executeInPage(
      async (pageId, cardId) => {
        const response = await fetch(
          `/kpis/${cardId}/remove?pageid=${pageId}`,
          {
            method: 'POST'
          }
        );
        if (!response.ok) {
          throw new Error(
            `Failed to remove card ${cardId} from page ${pageId}. HTTP status: ${response.status}`
          );
        }
        return response.json();
      },
      [pageId, cardId],
      tabId
    );

    return result;
  } catch (error) {
    console.error('Error removing card from page:', error);
    throw error;
  }
}

export async function updateCardDefinition({
  cardId,
  definition,
  tabId = null
}) {
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
      card: (definition.definition.formulas || []).filter(
        (f) => f.persistedOnDataSource === false
      ),
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

    // Update the card with the modifications
    const result = await executeInPage(
      async (cardId, definition) => {
        const response = await fetch(`/api/content/v3/cards/kpi/${cardId}`, {
          body: JSON.stringify(definition),
          headers: { 'Content-Type': 'application/json' },
          method: 'PUT'
        });
        if (!response.ok) {
          throw new Error(
            `Failed to update card ${cardId}. HTTP status: ${response.status}`
          );
        }
        return response.json();
      },
      [cardId, definition],
      tabId
    );
    return result;
  } catch (error) {
    console.error('Error updating card definition:', error);
    throw error;
  }
}
