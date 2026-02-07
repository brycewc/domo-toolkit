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
