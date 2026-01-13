import { executeInPage } from '@/utils';

export async function getDrillParentCardId(drillViewId) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (drillViewId) => {
        const response = await fetch(
          `/api/content/v1/cards/${drillViewId}/urn`,
          {
            method: 'GET'
          }
        );
        if (!response.ok) {
          throw new Error(
            `Failed to fetch Drill Path ${drillViewId}. HTTP status: ${response.status}`
          );
        }
        const card = await response.json();
        return card.rootId;
      },
      [drillViewId]
    );

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
