import { executeInPage } from '@/utils';

/**
 * Get the App ID (parent) for an App Studio Page
 * @param {string} appPageId - The App Studio Page ID
 * @param {boolean} [inPageContext=false] - Whether already in page context (skip executeInPage)
 * @returns {Promise<string>} The App ID
 * @throws {Error} If the parent cannot be fetched
 */
export async function getAppStudioPageParent(appPageId, inPageContext = false) {
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
      : await executeInPage(fetchLogic, [appPageId]);

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
  appId,
  pageType,
  includeGrandchildren = false
}) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (pageId, appId, pageType, includeGrandchildren) => {
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
      [pageId, appId, pageType, includeGrandchildren]
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
export async function sharePagesWithSelf(pageIds) {
  try {
    // Execute fetch in page context to use authenticated session
    await executeInPage(
      async (pageIds) => {
        let userId = window.bootstrap.currentUser.USER_ID || null;
        if (!userId) {
          userId = await fetch(`${location.origin}/api/sessions/v1/me`).then(
            async (res) => {
              if (res.ok) {
                const user = await res.json();
                return user.userId || null;
              }
            }
          );
        }

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
      [pageIds]
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
                allPageIds.push(String(page.id));
              }
            });
          }
          // App studio pages
          if (Array.isArray(card.adminAllAppPages)) {
            card.adminAllAppPages.forEach((page) => {
              if (page && page.id) {
                allAppPageIds.push(String(page.id));
              }
            });
          }
          // Report builder pages
          if (Array.isArray(card.adminAllReportPages)) {
            card.adminAllReportPages.forEach((page) => {
              if (page && page.id) {
                allReportPageIds.push(String(page.id));
              }
            });
          }
        });

        // Deduplicate page IDs for each type
        const uniquePageIds = [...new Set(allPageIds)];
        const uniqueAppPageIds = [...new Set(allAppPageIds)];
        const uniqueReportPageIds = [...new Set(allReportPageIds)];

        // Combine all page IDs and object types (parallel arrays)
        const pageIds = [];
        const objectTypes = [];

        if (uniquePageIds.length) {
          pageIds.push(...uniquePageIds);
          objectTypes.push(...Array(uniquePageIds.length).fill('PAGE'));
        }
        if (uniqueAppPageIds.length) {
          pageIds.push(...uniqueAppPageIds);
          objectTypes.push(
            ...Array(uniqueAppPageIds.length).fill('DATA_APP_VIEW')
          );
        }
        if (uniqueReportPageIds.length) {
          pageIds.push(...uniqueReportPageIds);
          objectTypes.push(
            ...Array(uniqueReportPageIds.length).fill('REPORT_BUILDER_PAGE')
          );
        }

        if (!pageIds.length) {
          throw new Error('Cards are not used on any pages.');
        }

        return {
          pageIds,
          objectTypes
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
