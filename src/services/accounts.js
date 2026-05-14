import { executeInPage } from '@/utils/executeInPage';

/**
 * Pull the account IDs associated with a DATA_SOURCE or STREAM DomoObject.
 *
 * Domo's stream definition recently grew an `accounts` array (each entry
 * shaped `{ accountId, metadata, streamId }`) to support multi-account
 * pulls per dataset. Most datasets haven't been migrated yet, so we prefer
 * the new `accounts` array when populated and fall back to the legacy
 * singular `accountId` on the datasource response otherwise.
 *
 * Resolution order for DATA_SOURCE:
 *   1. `metadata.parent.details.accounts[].accountId` (new, multi-account)
 *   2. `metadata.details.accountId` (legacy, single-account)
 *
 * For STREAM we read `metadata.details.accounts` directly.
 *
 * Returns an empty array when no accounts are wired up yet (e.g. the
 * stream parent enrichment hasn't completed, or the dataset is a
 * DataFlow output with no stream).
 *
 * @param {Object|null|undefined} domoObject
 * @returns {number[]}
 */
export function getAccountIdsForDomoObject(domoObject) {
  if (!domoObject?.typeId) return [];
  if (domoObject.typeId === 'STREAM') {
    const accounts = domoObject.metadata?.details?.accounts;
    if (!Array.isArray(accounts)) return [];
    return accounts.map((a) => a?.accountId).filter((id) => id != null);
  }
  if (domoObject.typeId === 'DATA_SOURCE') {
    const accounts = domoObject.metadata?.parent?.details?.accounts;
    if (Array.isArray(accounts) && accounts.length > 0) {
      return accounts.map((a) => a?.accountId).filter((id) => id != null);
    }
    const legacyId = domoObject.metadata?.details?.accountId;
    if (legacyId != null) return [legacyId];
  }
  return [];
}

/**
 * Get all accounts owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedAccounts(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allAccounts = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            combineResults: false,
            count,
            entityList: [['account']],
            facetValuesToInclude: [],
            filters: [
              {
                field: 'owned_by_id',
                filterType: 'term',
                name: 'Owned by',
                not: false,
                value: userId
              }
            ],
            hideSearchObjects: true,
            offset,
            query: '**',
            queryProfile: 'GLOBAL'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const accounts = data.searchResultsMap?.account || [];
        if (accounts.length > 0) {
          allAccounts.push(
            ...accounts.map((a) => ({
              id: a.databaseId,
              name: a.winnerText || a.databaseId.toString()
            }))
          );
          offset += count;
          if (accounts.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allAccounts;
    },
    [userId],
    tabId
  );
}

/**
 * Share an account with a user at a given access level.
 * @param {Object} params
 * @param {number} params.accountId - The account ID
 * @param {number} params.userId - The user ID to grant access to
 * @param {string} [params.accessLevel='CAN_VIEW'] - Domo access level
 *   (e.g., 'CAN_VIEW', 'CAN_USE', 'OWNER')
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function shareAccount({ accessLevel = 'CAN_VIEW', accountId, tabId = null, userId }) {
  return executeInPage(
    async (accountId, userId, accessLevel) => {
      const response = await fetch(`/api/data/v2/accounts/share/${accountId}`, {
        body: JSON.stringify({ accessLevel, id: userId, type: 'USER' }),
        headers: { 'Content-Type': 'application/json' },
        method: 'PUT'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [accountId, userId, accessLevel],
    tabId
  );
}

/**
 * Transfer account ownership to a new user.
 * @param {number[]} accountIds - Array of account IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAccounts(accountIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (accountIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of accountIds) {
        try {
          const grantResp = await fetch(`/api/data/v2/accounts/share/${id}`, {
            body: JSON.stringify({
              accessLevel: 'OWNER',
              id: toUserId,
              type: 'USER'
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!grantResp.ok) throw new Error(`Grant new owner HTTP ${grantResp.status}`);

          const revokeResp = await fetch(`/api/data/v2/accounts/share/${id}`, {
            body: JSON.stringify({
              accessLevel: 'NONE',
              id: fromUserId,
              type: 'USER'
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!revokeResp.ok) {
            throw new Error(
              `Revoke previous owner HTTP ${revokeResp.status} (new owner was added; previous owner still has access)`
            );
          }

          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [accountIds, fromUserId, toUserId],
    tabId
  );
}
