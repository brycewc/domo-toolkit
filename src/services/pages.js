import { executeInPage } from '@/utils';

/**
 * Get the App ID (parent) for an App Studio Page
 * @param {string} appPageId - The App Studio Page ID
 * @returns {Promise<string>} The App ID
 * @throws {Error} If the parent cannot be fetched
 */
export async function getAppStudioPageParent(appPageId) {
  try {
    // Execute fetch in page context to use authenticated session and automatic URL resolution
    const result = await executeInPage(
      async (appPageId) => {
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
          throw new Error(
            `No page data returned for App Studio Page ${appPageId}`
          );
        }

        const appId = data.pages[0].dataAppId;

        if (!appId) {
          throw new Error(
            `No dataAppId found for App Studio Page ${appPageId}`
          );
        }

        return appId.toString();
      },
      [appPageId]
    );

    return result;
  } catch (error) {
    console.error('Error fetching App Studio Page parent:', error);
    throw error;
  }
}

/**
 * Get child pages for a given page or app studio app
 * @param {Object} params - Parameters for fetching child pages
 * @param {number} params.pageId - The parent page ID
 * @param {number} [params.appId] - The app ID (for app studio pages)
 * @param {string} params.pageType - The page type ('PAGE' or 'DATA_APP_VIEW')
 * @returns {Promise<Array>} Array of page objects
 * @throws {Error} If the fetch fails
 */
export async function getChildPages({ pageId, appId, pageType }) {
  try {
    // Execute fetch in page context to use authenticated session
    const result = await executeInPage(
      async (pageId, appId, pageType) => {
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
          body.parentPageIds = [pageId];
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
        console.log('Admin summary response:', adminSummaryResponse);
        console.log('Request body was:', body);
        return adminSummaryResponse.pageAdminSummaries || [];
      },
      [pageId, appId, pageType]
    );

    return result;
  } catch (error) {
    console.error('Error fetching child pages:', error);
    throw error;
  }
}
