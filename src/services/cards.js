import { executeInPage } from '@/utils';

export async function getDrillParentCardId(
  drillViewId,
  inPageContext = false,
  tabId = null
) {
  const fetchLogic = async (drillViewId) => {
    const response = await fetch(`/api/content/v1/cards/${drillViewId}/urn`, {
      method: 'GET'
    });
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
            method: 'GET',
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

/**
 * Get all cards for a given object (page or dataset)
 * @param {Object} params - Parameters for fetching cards
 * @param {string} params.objectId - The object ID (page or dataset ID)
 * @param {string} params.objectType - The object type ('PAGE', 'DATA_APP_VIEW', 'DATA_SOURCE')
 * @returns {Promise<Array>} Array of card objects with details
 * @throws {Error} If the fetch fails
 */
export async function getCardsForObject({
  objectId,
  objectType,
  tabId = null
}) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (objectId, objectType) => {
        switch (objectType) {
          case 'PAGE':
          case 'DATA_APP_VIEW':
          case 'REPORT_BUILDER_VIEW':
          case 'WORKSHEET_VIEW': {
            const response = await fetch(
              `/api/content/v3/stacks/${objectId}/cards`,
              {
                method: 'GET'
              }
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
              `/api/content/v1/datasources/${objectId}/cards`,
              {
                method: 'GET'
              }
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

export async function removeCardFromPage({ pageId, cardId, tabId = null }) {
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

export async function getCardDefinition({ cardId, tabId = null }) {
  try {
    return await executeInPage(
      async (cardId) => {
        const response = await fetch('/api/content/v3/cards/kpi/definition', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify({
            dynamicText: true,
            variables: true,
            urn: cardId
          })
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
      dsUpdated: [],
      dsDeleted: [],
      card: []
    };
    definition.definition.annotations = {
      new: [],
      modified: [],
      deleted: []
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
          method: 'PUT',
          body: JSON.stringify(definition),
          headers: { 'Content-Type': 'application/json' }
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
