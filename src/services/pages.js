import { executeInPage } from '@/utils';

/**
 * Get the App ID (parent) for an App Studio Page
 * @param {string} appPageId - The App Studio Page ID
 * @param {boolean} [inPageContext=false] - Whether already in page context (skip executeInPage)
 * @param {number} [tabId] - Optional Chrome tab ID to execute in specific tab
 * @returns {Promise<string>} The App ID
 * @throws {Error} If the parent cannot be fetched
 */
export async function getAppStudioPageParent(
  appPageId,
  inPageContext = false,
  tabId = null
) {
  console.log(inPageContext, 'inPageContext');
  const fetchLogic = async (appPageId) => {
    // Use the page summary endpoint to get the parent App ID
    const response = await fetch(
      `/api/content/v1/pages/summary?limit=1&skip=0`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          pageId: appPageId
        })
      }
    );

    if (!response.ok) {
      throw new Error(
        `Failed to fetch App Studio Page ${appPageId}. HTTP status: ${response.status}`
      );
    }

    const data = await response.json();

    if (!data.pages || data.pages.length === 0) {
      throw new Error(`No page data returned for App Studio Page ${appPageId}`);
    }

    const appId = data.pages[0].dataAppId;

    if (!appId) {
      throw new Error(`No dataAppId found for App Studio Page ${appPageId}`);
    }

    return appId.toString();
  };

  try {
    // If already in page context, execute directly; otherwise use executeInPage
    const result = inPageContext
      ? await fetchLogic(appPageId)
      : await executeInPage(fetchLogic, [appPageId], tabId);

    return result;
  } catch (error) {
    console.error('Error fetching App Studio Page parent:', error);
    throw error;
  }
}

/**
 * Get child pages for a given page or app studio app
 * @param {Object} params - Parameters for fetching child pages
 * @param {number|number[]} params.pageId - The parent page ID or array of page IDs
 * @param {number} [params.appId] - The app ID (for app studio pages)
 * @param {string} params.pageType - The page type ('PAGE' or 'DATA_APP_VIEW')
 * @param {boolean} [params.includeGrandchildren=false] - Whether to fetch grandchildren pages
 * @returns {Promise<Array>} Array of page objects (includes both children and grandchildren if requested)
 * @throws {Error} If the fetch fails
 */
export async function getChildPages({
  pageId,
  pageType,
  appId,
  includeGrandchildren = false,
  tabId = null
}) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (pageId, pageType, appId, includeGrandchildren) => {
        // Normalize pageId to array
        const pageIds = Array.isArray(pageId) ? pageId : [pageId];

        // Build request body
        const body = {
          orderBy: 'lastModified',
          ascending: true
        };

        if (pageType === 'DATA_APP_VIEW') {
          body.includeDataAppIdsClause = true;
          body.includeDataAppViews = true;
          body.dataAppIds = [appId];
        } else {
          body.includeParentPageIdsClause = true;
          body.parentPageIds = pageIds;
        }

        // Make API call to fetch pages with relative URL
        const response = await fetch(
          `/api/content/v1/pages/adminsummary?limit=100&skip=0`,
          {
            method: 'POST',
            body: JSON.stringify(body),
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            },
            credentials: 'include'
          }
        );

        if (!response.ok) {
          throw new Error(`Failed to fetch pages (HTTP ${response.status})`);
        }

        const adminSummaryResponse = await response.json();
        const childPages = adminSummaryResponse.pageAdminSummaries || [];

        // If includeGrandchildren is true, fetch grandchildren for each child page
        if (
          includeGrandchildren &&
          childPages.length > 0 &&
          pageType === 'PAGE'
        ) {
          const grandchildPageIds = childPages.map((page) => page.pageId);

          const grandchildrenBody = {
            orderBy: 'lastModified',
            ascending: true,
            includeParentPageIdsClause: true,
            parentPageIds: grandchildPageIds
          };

          const grandchildrenResponse = await fetch(
            `/api/content/v1/pages/adminsummary?limit=100&skip=0`,
            {
              method: 'POST',
              body: JSON.stringify(grandchildrenBody),
              headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
              },
              credentials: 'include'
            }
          );

          if (!grandchildrenResponse.ok) {
            console.warn(
              `Failed to fetch grandchildren pages (HTTP ${grandchildrenResponse.status})`
            );
            return childPages;
          }

          const grandchildrenData = await grandchildrenResponse.json();
          const grandchildPages = grandchildrenData.pageAdminSummaries || [];

          // Return both children and grandchildren
          return [...childPages, ...grandchildPages];
        }

        return childPages;
      },
      [pageId, pageType, appId, includeGrandchildren],
      tabId
    );

    return result;
  } catch (error) {
    console.error('Error fetching child pages:', error);
    throw error;
  }
}

/**
 * Share pages with self
 * @param {Array} pageIds - IDs of the pages to share
 * @returns {Promise<void>} Resolves when sharing is complete
 * @throws {Error} If the fetch fails
 */
export async function sharePagesWithSelf({ pageIds, tabId }) {
  try {
    // Get current user ID
    const userId = await executeInPage(getCurrentUserId, [], tabId);

    // Execute fetch in page context to use authenticated session
    executeInPage(
      async (pageIds, userId) => {
        // Build request body
        const body = {
          resources: pageIds.map((id) => ({ type: 'page', id })),
          recipients: [
            {
              type: 'user',
              id: userId
            }
          ]
        };

        // Make API call to fetch pages with relative URL
        const response = await fetch(`/api/content/v1/share?sendEmail=false`, {
          method: 'POST',
          body: JSON.stringify(body),
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          credentials: 'include'
        });

        if (!response.ok) {
          throw new Error(`Failed to share pages (HTTP ${response.status})`);
        }
      },
      [pageIds, userId]
    );
  } catch (error) {
    console.error('Error sharing pages:', error);
    throw error;
  }
}

/**
 * Get all pages that cards appear on (including regular pages, app studio pages, and report builder pages)
 * @param {Array<number>} cardIds - Array of card IDs
 * @returns {Promise<Object>} Object with pageIds array and objectTypes array (parallel arrays)
 * @throws {Error} If the fetch fails
 */
export async function getPagesForCards(cardIds) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (cardIds) => {
        // Fetch cards with adminAllPages to get all pages they appear on
        const response = await fetch(
          `/api/content/v1/cards?urns=${cardIds.join(',')}&parts=adminAllPages`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch cards. HTTP status: ${response.status}`
          );
        }

        const detailCards = await response.json();

        if (!detailCards.length) {
          throw new Error('No cards found.');
        }

        // Build flat lists of all pages, app pages, and report pages from all cards
        const allPageIds = [];
        const allAppPageIds = [];
        const allReportPageIds = [];

        detailCards.forEach((card) => {
          // Regular pages
          if (Array.isArray(card.adminAllPages)) {
            card.adminAllPages.forEach((page) => {
              if (page && page.id) {
                allPageIds.push(page.id);
              }
            });
          }
          // App studio pages
          if (Array.isArray(card.adminAllAppPages)) {
            card.adminAllAppPages.forEach((page) => {
              if (page && page.id) {
                allAppPageIds.push(page.id);
              }
            });
          }
          // Report builder pages
          if (Array.isArray(card.adminAllReportPages)) {
            card.adminAllReportPages.forEach((page) => {
              if (page && page.id) {
                allReportPageIds.push(page.id);
              }
            });
          }
        });

        // Deduplicate page IDs for each type
        const pageIds = [...new Set(allPageIds)];
        const appPageIds = [...new Set(allAppPageIds)];
        const reportPageIds = [...new Set(allReportPageIds)];

        // Combine all page types into array of objects
        const pageObjects = [
          ...pageIds.map((id) => ({
            type: 'PAGE',
            id: String(id)
          })),
          ...appPageIds.map((id) => ({
            type: 'DATA_APP_VIEW',
            id: String(id)
          })),
          ...reportPageIds.map((id) => ({
            type: 'REPORT_BUILDER_VIEW',
            id: String(id)
          }))
        ];

        return {
          pageObjects
        };
      },
      [cardIds]
    );

    return result;
  } catch (error) {
    console.error('Error fetching pages for cards:', error);
    throw error;
  }
}

export async function deletePageAndAllCards({
  pageId,
  pageType,
  appId = null,
  setStatus,
  currentContext = null,
  skipChildPageCheck = false
}) {
  try {
    // Check for child pages if this is a regular PAGE (not DATA_APP_VIEW) and we haven't already checked
    if (pageType === 'PAGE' && !skipChildPageCheck) {
      const childPages = await getChildPages({
        pageId,
        pageType,
        appId,
        includeGrandchildren: true
      });

      if (childPages.length > 0) {
        // Store child pages data for sidepanel to read
        await chrome.storage.local.set({
          sidepanelDataList: {
            type: 'childPagesWarning',
            pageId,
            appId,
            pageType,
            childPages,
            currentContext: currentContext?.toJSON?.() || currentContext,
            tabId: currentContext?.tabId || null,
            timestamp: Date.now()
          }
        });

        // Return flag indicating child pages were found
        return {
          hasChildPages: true,
          childPagesCount: childPages.length,
          windowId: currentContext?.tab?.windowId
        };
      }
    }

    // Execute deletion logic in page context to inherit authentication
    const result = await executeInPage(
      async (pageId, pageType, appId) => {
        // Fetch all cards on the page
        const cardsResponse = await fetch(
          `/api/content/v3/stacks/${pageId}/cards`,
          {
            method: 'GET',
            credentials: 'include'
          }
        );

        if (!cardsResponse.ok) {
          throw new Error(
            `Failed to fetch cards for page ${pageId}. HTTP status: ${cardsResponse.status}`
          );
        }

        const page = await cardsResponse.json();
        const cardIds = page.cards.map((card) => card.id).join(',');

        // Delete all cards
        const deleteCardsResponse = await fetch(
          `/api/content/v1/cards/bulk?cardIds=${cardIds}`,
          {
            method: 'DELETE'
          }
        );

        if (!deleteCardsResponse.ok) {
          throw new Error(
            `Failed to delete cards for page ${pageId}. HTTP status: ${deleteCardsResponse.status}`
          );
        }

        // Delete the page
        const pageDeleteUrl =
          pageType === 'PAGE'
            ? `/api/content/v1/pages/${pageId}`
            : `/api/content/v1/dataapps/${appId}/views/${pageId}`;

        const deletePageResponse = await fetch(pageDeleteUrl, {
          method: 'DELETE'
        });

        if (!deletePageResponse.ok) {
          return {
            success: false,
            cardsDeleted: page.cards.length,
            statusCode: deletePageResponse.status
          };
        }

        return {
          success: true,
          cardsDeleted: page.cards.length
        };
      },
      [pageId, pageType, appId],
      tabId
    );

    if (result.success) {
      setStatus?.(
        `Page ${pageId} and all ${result.cardsDeleted} Cards were deleted successfully`,
        '',
        'success'
      );
      return { success: true };
    } else {
      setStatus?.(
        `Failed to delete page ${pageId}.`,
        `All ${result.cardsDeleted} cards were deleted successfully.\nHTTP status: ${result.statusCode}`,
        'danger'
      );
      return { success: false };
    }
  } catch (error) {
    const errorMessage = error.message || 'Unknown error occurred';

    if (error.message?.includes('check for child pages')) {
      setStatus?.(
        `Failed to check for child pages.`,
        `Error: ${errorMessage}\nDeletion cancelled for safety.`,
        'danger'
      );
    } else if (error.message?.includes('fetch cards')) {
      setStatus?.(
        `Failed to fetch cards for page ${pageId}. Page and cards will not be deleted.`,
        errorMessage,
        'danger'
      );
    } else if (error.message?.includes('delete cards')) {
      setStatus?.(
        `Failed to delete cards for page ${pageId}. Page will not be deleted.`,
        errorMessage,
        'danger'
      );
    } else {
      setStatus?.(
        `An error occurred while deleting page ${pageId}.`,
        errorMessage,
        'danger'
      );
    }

    console.error('Error in deletePageAndAllCards:', error);
  }
}
