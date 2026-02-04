import { getCurrentUserId } from './users';
import { executeInPage, waitForCards } from '@/utils';

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
        let childPages = [];
        if (pageType === 'PAGE') {
          // Build request body
          const body = {
            orderBy: 'lastModified',
            ascending: true
          };

          body.includeParentPageIdsClause = true;
          body.parentPageIds = [pageId];

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
          childPages = adminSummaryResponse.pageAdminSummaries || [];

          // If includeGrandchildren is true, fetch grandchildren for each child page
          if (includeGrandchildren && childPages.length > 0) {
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
            childPages = [...childPages, ...grandchildPages];
          }
        } else if (pageType === 'DATA_APP_VIEW') {
          const appResponse = await fetch(`/api/content/v1/dataapps/${appId}`, {
            method: 'GET'
          });

          if (!appResponse.ok) {
            throw new Error(
              `Failed to fetch app studio app ${appId} (HTTP ${appResponse.status})`
            );
          }

          const appData = await appResponse.json();
          childPages = appData.views.map((view) => ({
            pageId: view.viewId,
            pageTitle: view.title,
            typeId: 'DATA_APP_VIEW'
          }));
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
    const userId = await getCurrentUserId(tabId);

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
 * @returns {Promise<Object>} Array of page objects with type, id, and name
 * @throws {Error} If the fetch fails
 */
export async function getPagesForCards(cardIds, tabId = null) {
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
        console.log(detailCards);
        // Build flat lists of all pages, app pages, and report pages from all cards
        const allPages = [];
        const allAppPages = [];
        const allWorksheetViews = [];
        const allReportPages = [];

        detailCards.forEach((card) => {
          // Regular pages
          if (Array.isArray(card.adminAllPages)) {
            card.adminAllPages.forEach((page) => {
              if (page && page.pageId) {
                allPages.push({
                  id: page.pageId,
                  name: page.title || `Page ${page.pageId}`
                });
              }
            });
          }
          // App studio pages and worksheet views
          if (Array.isArray(card.adminAllAppPages)) {
            card.adminAllAppPages.forEach((page) => {
              if (page && page.appPageId) {
                if (page.dataAppType === 'worksheet') {
                  allWorksheetViews.push({
                    id: page.appPageId,
                    name:
                      page.appPageTitle || `Worksheet View ${page.appPageId}`,
                    appId: page.appId,
                    appName: page.appTitle || `App ${page.appId}`
                  });
                } else {
                  allAppPages.push({
                    id: page.appPageId,
                    name: page.appPageTitle || `App Page ${page.appPageId}`,
                    appId: page.appId,
                    appName: page.appTitle || `App ${page.appId}`
                  });
                }
              }
            });
          }
          // Report builder pages
          if (Array.isArray(card.adminAllReportPages)) {
            card.adminAllReportPages.forEach((page) => {
              if (page && page.reportPageId) {
                allReportPages.push({
                  id: page.reportPageId,
                  name:
                    page.reportPageTitle || `Report Page ${page.reportPageId}`
                });
              }
            });
          }
        });

        // Deduplicate pages by ID for each type (keep first occurrence's data)
        const deduplicatePages = (pages) => {
          const map = new Map();
          pages.forEach((page) => {
            if (!map.has(page.id)) {
              map.set(page.id, page);
            }
          });
          return Array.from(map.values());
        };

        const pages = deduplicatePages(allPages);
        const appPages = deduplicatePages(allAppPages);
        const worksheetViews = deduplicatePages(allWorksheetViews);
        const reportPages = deduplicatePages(allReportPages);

        // Combine all page types into array of objects
        const pageObjects = [
          ...pages.map(({ id, name }) => ({
            type: 'PAGE',
            id: String(id),
            name
          })),
          ...appPages.map(({ id, name, appId, appName }) => ({
            type: 'DATA_APP_VIEW',
            id: String(id),
            name,
            appId,
            appName
          })),
          ...worksheetViews.map(({ id, name, appId, appName }) => ({
            type: 'WORKSHEET_VIEW',
            id: String(id),
            name,
            appId,
            appName
          })),
          ...reportPages.map(({ id, name }) => ({
            type: 'REPORT_BUILDER_VIEW',
            id: String(id),
            name
          }))
        ];

        return pageObjects;
      },
      [cardIds],
      tabId
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
  currentContext = null,
  skipChildPageCheck = false,
  tabId = null
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

        // Return status information indicating child pages were found
        return {
          success: false,
          hasChildPages: true,
          childPagesCount: childPages.length,
          windowId: currentContext?.tab?.windowId,
          statusTitle: 'Cannot Delete Page',
          statusDescription: `This page has ${childPages.length} child page${childPages.length !== 1 ? 's' : ''}. Please delete or reassign the child pages first.`,
          statusType: 'warning'
        };
      }
    }

    // Wait for cards to be loaded from background process
    const cardsResult = await waitForCards(currentContext);

    if (!cardsResult.success) {
      return {
        success: false,
        statusTitle: 'Error',
        statusDescription: cardsResult.error,
        statusType: 'danger'
      };
    }

    const cards = cardsResult.cards;
    const cardIds = cards.map((card) => card.id);

    // Execute deletion logic in page context to inherit authentication
    const result = await executeInPage(
      async (pageId, pageType, appId, cardIds) => {
        // Delete all cards if there are any
        if (cardIds.length > 0) {
          const cardIdsString = cardIds.join(',');
          const deleteCardsResponse = await fetch(
            `/api/content/v1/cards/bulk?cardIds=${cardIdsString}`,
            {
              method: 'DELETE'
            }
          );

          if (!deleteCardsResponse.ok) {
            throw new Error(
              `Failed to delete cards for page ${pageId}. HTTP status: ${deleteCardsResponse.status}`
            );
          }
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
            cardsDeleted: cardIds.length,
            statusCode: deletePageResponse.status
          };
        }

        return {
          success: true,
          cardsDeleted: cardIds.length
        };
      },
      [pageId, pageType, appId, cardIds],
      tabId
    );

    if (result.success) {
      return {
        success: true,
        cardsDeleted: result.cardsDeleted,
        statusTitle: 'Delete Successful',
        statusDescription: `Page ${pageId} and all ${result.cardsDeleted} card${result.cardsDeleted !== 1 ? 's' : ''} were deleted successfully`,
        statusType: 'success'
      };
    } else {
      return {
        success: false,
        cardsDeleted: result.cardsDeleted,
        statusCode: result.statusCode,
        statusTitle: `Failed to Delete Page`,
        statusDescription: `All ${result.cardsDeleted} card${result.cardsDeleted !== 1 ? 's were' : ' was'} deleted successfully, but page deletion failed.\nHTTP status: ${result.statusCode}`,
        statusType: 'danger'
      };
    }
  } catch (error) {
    const errorMessage = error.message || 'Unknown error occurred';
    let statusTitle, statusDescription;

    if (error.message?.includes('check for child pages')) {
      statusTitle = 'Failed to Check for Child Pages';
      statusDescription = `Error: ${errorMessage}\nDeletion cancelled for safety.`;
    } else if (error.message?.includes('fetch cards')) {
      statusTitle = 'Failed to Fetch Cards';
      statusDescription = `${errorMessage}\nPage and cards will not be deleted.`;
    } else if (error.message?.includes('delete cards')) {
      statusTitle = 'Failed to Delete Cards';
      statusDescription = `${errorMessage}\nPage will not be deleted.`;
    } else {
      statusTitle = 'Delete Failed';
      statusDescription = errorMessage;
    }

    console.error('Error in deletePageAndAllCards:', error);

    return {
      success: false,
      error: errorMessage,
      statusTitle,
      statusDescription,
      statusType: 'danger'
    };
  }
}
