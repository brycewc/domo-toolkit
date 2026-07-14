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
 * List every account in the instance for a given connector.
 *
 * Unlike Domo's native dataset account picker (which only shows accounts shared
 * with the current user), this runs the instance-wide account search an
 * `account.admin` can see, filtered to one connector so every returned account can
 * actually run the stream.
 *
 * Filtering is server-side on `dataproviderkey_facet`, keyed by the connector's
 * data provider key (the dataset's `dataProviderType`, e.g. "eloqua"). The key
 * facet is preferred over the name facet because the key is stable, where the
 * display name shifts with localization and renames.
 *
 * Account names default to generic values (every Eloqua account is "Eloqua
 * Account" until someone renames it), so each result also carries the id, owner,
 * dates, connected-dataset count, and validity the picker's detail panel needs to
 * tell them apart. All of it comes off the search doc, so there's no extra request.
 *
 * @param {string} dataProviderKey - The connector key (the dataset's dataProviderType, e.g. 'eloqua')
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{createDate: number|null, datasetCount: number|null, id: number, lastModified: number|null, name: string, owner: string|null, ownerId: string|null, ownerType: string, valid: boolean}>>}
 */
export async function getAccountsForProvider(dataProviderKey, tabId = null) {
  return executeInPage(
    async (dataProviderKey) => {
      const accounts = [];
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
                field: 'dataproviderkey_facet',
                filterType: 'term',
                name: 'Data Provider Type',
                not: false,
                value: dataProviderKey
              }
            ],
            hideSearchObjects: true,
            offset,
            query: '**',
            queryProfile: 'GLOBAL',
            sort: { fieldSorts: [{ field: 'display_name_sort', sortOrder: 'ASC' }] }
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        const results = data.searchResultsMap?.account || [];
        for (const a of results) {
          accounts.push({
            createDate: typeof a.createDate === 'number' ? a.createDate : null,
            datasetCount: typeof a.datasetCount === 'number' ? a.datasetCount : null,
            id: Number(a.databaseId),
            lastModified: typeof a.lastModified === 'number' ? a.lastModified : null,
            name: a.displayName || a.name || a.winnerText || String(a.databaseId),
            // Prefer the owner's full display name. `ownerNamePrimary` /
            // `ownerNameSecondary` are the last/first name split used for sorting,
            // so leading with primary alone would show only the last name; fall
            // back to joining first + last, then the (often empty) `ownedByName`.
            owner:
              a.owners?.[0]?.displayName ||
              [a.ownerNameSecondary, a.ownerNamePrimary].filter(Boolean).join(' ') ||
              a.ownedByName ||
              null,
            ownerId: a.owners?.[0]?.id || a.ownedById || null,
            ownerType: a.owners?.[0]?.type || 'USER',
            valid: a.valid !== false
          });
        }
        if (results.length < count) {
          moreData = false;
        } else {
          offset += count;
        }
      }

      return accounts;
    },
    [dataProviderKey],
    tabId
  );
}

/**
 * Get all accounts owned by a user or group.
 * @param {number} ownerId - The Domo user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Whether ownerId is a user or group
 * @returns {Promise<Array<{id: number, name: string}>>}
 */
export async function getOwnedAccounts(ownerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (ownerId, ownerType) => {
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
                value: ownerType === 'GROUP' ? `${ownerId}:GROUP` : ownerId
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
    [ownerId, ownerType],
    tabId
  );
}

/**
 * Detect the legacy "one account per dataset" structure: a DATA_SOURCE whose
 * account is the singular scalar `metadata.details.accountId` rather than the
 * newer `metadata.parent.details.accounts` array.
 *
 * Mirrors the legacy branch of `getAccountIdsForDomoObject` and must stay in
 * sync with it. Returns false for STREAM objects and for any dataset already on
 * the new multi-account array (even when that array holds a single account).
 *
 * @param {Object|null|undefined} domoObject
 * @returns {boolean}
 */
export function isLegacyAccountStructure(domoObject) {
  if (domoObject?.typeId !== 'DATA_SOURCE') return false;
  const accounts = domoObject.metadata?.parent?.details?.accounts;
  if (Array.isArray(accounts) && accounts.length > 0) return false;
  return domoObject.metadata?.details?.accountId != null;
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
 * Transfer account ownership to a new user or group.
 * @param {number[]} accountIds - Array of account IDs to transfer
 * @param {number} fromOwnerId - The current owner's user or group ID
 * @param {number} toOwnerId - The new owner's user or group ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of both parties
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferAccounts(accountIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  return executeInPage(
    async (accountIds, fromOwnerId, toOwnerId, ownerType) => {
      const errors = [];
      let succeeded = 0;

      for (const id of accountIds) {
        try {
          const grantResp = await fetch(`/api/data/v2/accounts/share/${id}`, {
            body: JSON.stringify({
              accessLevel: 'OWNER',
              id: toOwnerId,
              type: ownerType
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!grantResp.ok) throw new Error(`Grant new owner HTTP ${grantResp.status}`);

          const revokeResp = await fetch(`/api/data/v2/accounts/share/${id}`, {
            body: JSON.stringify({
              accessLevel: 'NONE',
              id: fromOwnerId,
              type: ownerType
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
    [accountIds, fromOwnerId, toOwnerId, ownerType],
    tabId
  );
}
