import { executeInPage } from '@/utils';

import { getCardsForObject } from './cards';
import { getChildPages } from './pages';

/**
 * Delete an entire App Studio app — all its pages and all cards on those
 * pages. Used by the cascade delete path on a `DATA_APP_VIEW` /
 * `WORKSHEET_VIEW` page.
 *
 * Steps: (1) fetch sibling pages via `getChildPages`, (2) collect the unique
 * card IDs across the current page + siblings, (3) bulk-delete cards,
 * (4) delete the app design.
 *
 * @param {Object} params
 * @param {string|number} params.appId - The parent app ID
 * @param {string|number} params.currentPageId - The page the user is on
 * @param {string} params.currentPageType - 'DATA_APP_VIEW' or 'WORKSHEET_VIEW'
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<{cardCount: number}>} Number of cards deleted
 */
export async function deleteAppAndAllContent({
  appId,
  currentPageId,
  currentPageType,
  tabId = null
}) {
  const pages = await getChildPages({
    appId: parseInt(appId),
    pageId: parseInt(currentPageId),
    pageType: currentPageType,
    tabId
  });

  const allCardIds = new Set();
  const pageIds = [currentPageId, ...pages.map((p) => p.pageId)];
  for (const pageId of pageIds) {
    const cards = await getCardsForObject({
      objectId: pageId,
      objectType: currentPageType,
      tabId
    });
    for (const card of cards) {
      allCardIds.add(card.id);
    }
  }

  const cardCount = allCardIds.size;
  if (cardCount > 0) {
    await executeInPage(
      async (cardIds) => {
        const res = await fetch(`/api/content/v1/cards/bulk?cardIds=${cardIds}`, {
          method: 'DELETE'
        });
        if (!res.ok) {
          throw new Error(`Failed to delete cards. HTTP status: ${res.status}`);
        }
      },
      [[...allCardIds].join(',')],
      tabId
    );
  }

  await executeInPage(
    async (appId) => {
      const res = await fetch(`/api/content/v1/dataapps/${appId}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        throw new Error(`Failed to delete app. HTTP status: ${res.status}`);
      }
    },
    [appId],
    tabId
  );

  return { cardCount };
}

/**
 * Delete a Custom App design.
 * @param {Object} params
 * @param {string} params.designId - The app design ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteCustomApp({ designId, tabId = null }) {
  return executeInPage(
    async (designId) => {
      const response = await fetch(`/api/apps/v1/designs/${designId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [designId],
    tabId
  );
}

/**
 * Fetch details for a Custom App instance. Returns the raw instance record,
 * which includes `designId` pointing at the underlying app design.
 * @param {Object} params
 * @param {string} params.appInstanceId - The app instance ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} The app instance record
 */
export async function getAppInstance({ appInstanceId, tabId = null }) {
  return executeInPage(
    async (appInstanceId) => {
      const response = await fetch(`/api/apps/v1/instances/${appInstanceId}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    },
    [appInstanceId],
    tabId
  );
}

/**
 * Get all custom apps (bricks and pro code apps) owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedCustomApps(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allApps = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch(
          `/api/apps/v1/designs?checkAdminAuthority=true&deleted=false&limit=${limit}&offset=${offset}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          for (const app of data) {
            if (app.owner == userId) {
              allApps.push({
                id: app.id,
                name: app.name || app.id
              });
            }
          }
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allApps;
    },
    [userId],
    tabId
  );
}

/**
 * Share a Custom App design with a user at a given permission level.
 * @param {Object} params
 * @param {string} params.designId - The app design ID
 * @param {number} params.userId - The user ID to grant permission to
 * @param {string} [params.permission='ADMIN'] - Permission level (e.g., 'ADMIN', 'WRITE', 'READ')
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function shareCustomAppDesign({
  designId,
  permission = 'ADMIN',
  tabId = null,
  userId
}) {
  return executeInPage(
    async (designId, permission, userId) => {
      const response = await fetch(
        `/api/apps/v1/designs/${designId}/permissions/${permission}`,
        {
          body: JSON.stringify([userId]),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        }
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [designId, permission, userId],
    tabId
  );
}

/**
 * Transfer custom app ownership to a new user.
 * @param {string[]} appIds - Array of custom app IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferCustomApps(
  appIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (appIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of appIds) {
        try {
          const response = await fetch(
            `/api/apps/v1/designs/${id}/permissions/ADMIN`,
            {
              body: JSON.stringify([toUserId]),
              headers: { 'Content-Type': 'application/json' },
              method: 'POST'
            }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [appIds, fromUserId, toUserId],
    tabId
  );
}
