/**
 * Orchestrator for duplicating Domo objects. Initially supports USER; extensible
 * to other types by adding more functions here and wiring them in DuplicateView.
 *
 * Low-level API calls live in their domain services (users.js, groups.js, etc.).
 * This file composes them into the full multi-step flow and reports progress to
 * the UI via an optional `onStepProgress` callback.
 */

import { addUsersToGroups } from './groups';
import { shareContent } from './share';
import { getIndividualSharesForUser } from './userIndividualShares';
import { bulkUpdateUsers, createUser, getFullUserDetails, getUserGroups, setUserAttributes } from './users';

const USER_PROFILE_FIELDS = [
  'department',
  'employeeId',
  'employeeLocation',
  'employeeNumber',
  'hireDate',
  'phoneNumber',
  'reportsTo',
  'timeZone',
  'title'
];

const SHARE_BATCH_SIZE = 100;

// Only these group types accept manual member additions via the groups/access
// endpoint. Dynamic groups are managed by rules; system groups are managed by
// Domo itself; adding to either would either fail silently or be reverted on
// the next group re-evaluation.
const ASSIGNABLE_GROUP_TYPES = new Set(['adHoc', 'closed', 'open']);

/**
 * Add a source user's additive access to an existing user. Re-uses the source
 * user's group memberships and individually-shared cards/pages/apps (supplied
 * pre-filtered from the preview) and grants them to `targetUser`. Nothing that
 * would overwrite the target's own identity is touched: role, profile fields,
 * and locale are intentionally not applied. Every operation is a pure add, so
 * re-granting access the target already has is a safe no-op.
 *
 * @param {Object} params
 * @param {{id: number|string, displayName?: string}} params.targetUser - The existing user receiving access
 * @param {Array<{id: number, name: string}>} [params.cards] - Selected cards to share
 * @param {Array<{id: number, title: string}>} [params.pages] - Selected pages to share
 * @param {Array<{id: number, name: string}>} [params.customApps] - Selected custom apps (audit-only, sharing TBD)
 * @param {Array<{groupId: string|number, groupName: string}>} [params.groups] - Group memberships (from preview)
 * @param {number|null} [params.tabId]
 * @param {(stepKey: string, status: 'running'|'done'|'error', result?: Object) => void} [params.onStepProgress]
 */
export async function addAccessToExistingUser({
  cards = [],
  customApps = [],
  groups = [],
  onStepProgress = () => {},
  pages = [],
  tabId = null,
  targetUser
}) {
  if (!targetUser?.id) {
    return {
      appResults: { attempted: customApps, errors: [] },
      cardResults: { attempted: cards, errors: [] },
      copied: { cards: 0, customApps: 0, fields: [], groups: [], locale: null, pages: 0 },
      created: false,
      errors: [{ message: 'No target user supplied', step: 'target' }],
      newUser: null,
      pageResults: { attempted: pages, errors: [] },
      success: false
    };
  }

  const grants = await applyUserGrants({
    cards,
    customApps,
    groups,
    onStepProgress,
    pages,
    tabId,
    userId: targetUser.id
  });

  return {
    appResults: grants.appResults,
    cardResults: grants.cardResults,
    copied: grants.copied,
    created: false,
    errors: grants.errors,
    newUser: {
      displayName: targetUser.displayName ?? '',
      id: targetUser.id
    },
    pageResults: grants.pageResults,
    success:
      grants.errors.length === 0 && grants.cardResults.errors.length === 0 && grants.pageResults.errors.length === 0
  };
}

/**
 * Duplicate a Domo user. Copies role, profile fields, locale, group memberships,
 * and re-shares the source user's individually-shared cards, pages, and custom
 * apps onto a newly-created user. The caller supplies pre-filtered selection
 * lists; the executor does not refetch.
 *
 * Recoverable step failures are accumulated in `errors[]` rather than thrown;
 * only source-fetch and user-creation failures abort the flow.
 *
 * @param {Object} params
 * @param {number|string} params.sourceUserId
 * @param {string} params.newDisplayName
 * @param {string} params.newEmail
 * @param {Array<{id: number, name: string}>} [params.cards] - Selected cards to share
 * @param {Array<{id: number, title: string}>} [params.pages] - Selected pages to share
 * @param {Array<{id: number, name: string}>} [params.customApps] - Selected custom apps (audit-only, sharing TBD)
 * @param {Array<{groupId: string|number, groupName: string}>} [params.groups] - Group memberships (from preview)
 * @param {Array<{key: string, value: any}>} [params.profileFields] - Profile fields to copy (from preview)
 * @param {string|null} [params.locale] - Source user locale (from preview)
 * @param {number|null} [params.tabId]
 * @param {(stepKey: string, status: 'running'|'done'|'error', result?: Object) => void} [params.onStepProgress]
 */
export async function duplicateUser({
  cards = [],
  customApps = [],
  groups = [],
  locale = null,
  newDisplayName,
  newEmail,
  onStepProgress = () => {},
  pages = [],
  profileFields = [],
  sourceUserId,
  tabId = null
}) {
  const errors = [];
  const copied = {
    fields: [],
    locale: null
  };
  const report = (step, status, result) => {
    try {
      onStepProgress(step, status, result);
    } catch {
      // UI callback errors must never bubble up into the flow
    }
  };

  // --- 1. Fetch source (abort on failure, nothing to clone without it) ---
  const source = await getFullUserDetails(sourceUserId, tabId);
  if (!source?.id) {
    return {
      appResults: { attempted: customApps, errors: [] },
      cardResults: { attempted: cards, errors: [] },
      copied: { cards: 0, customApps: 0, fields: [], groups: [], locale: null, pages: 0 },
      created: true,
      errors: [
        {
          message: `Source user ${sourceUserId} not found`,
          step: 'fetchSource'
        }
      ],
      newUser: null,
      pageResults: { attempted: pages, errors: [] },
      success: false
    };
  }

  // --- 2. Create new user (abort on failure, nothing to populate) ---
  report('createUser', 'running');
  const roleId = source.roleId ?? source.role ?? 2;
  const created = await createUser(
    {
      displayName: newDisplayName,
      email: newEmail,
      roleId,
      sendInvite: true
    },
    tabId
  );
  if (!created?.id) {
    report('createUser', 'error');
    return {
      appResults: { attempted: customApps, errors: [] },
      cardResults: { attempted: cards, errors: [] },
      copied: { cards: 0, customApps: 0, fields: [], groups: [], locale: null, pages: 0 },
      created: true,
      errors: [
        {
          message: 'Failed to create new user, role may be invalid or email already in use',
          step: 'createUser'
        }
      ],
      newUser: null,
      pageResults: { attempted: pages, errors: [] },
      success: false
    };
  }
  const newUserId = created.id;
  report('createUser', 'done', { id: newUserId });

  // --- 3. Copy profile fields ---
  report('copyProfile', 'running');
  try {
    const payloadFields = {};
    for (const { key, value } of profileFields) {
      if (USER_PROFILE_FIELDS.includes(key) && value !== undefined && value !== null && value !== '') {
        payloadFields[key] = value;
      }
    }
    const keys = Object.keys(payloadFields);
    if (keys.length > 0) {
      const ok = await bulkUpdateUsers(
        [
          {
            displayName: newDisplayName,
            id: String(newUserId),
            ...payloadFields
          }
        ],
        tabId
      );
      if (!ok) throw new Error('Bulk user update returned a non-OK status');
      copied.fields = keys;
    }
    report('copyProfile', 'done', { count: copied.fields.length });
  } catch (err) {
    errors.push({ message: err.message, step: 'copyProfile' });
    report('copyProfile', 'error');
  }

  // --- 4. Copy locale ---
  report('copyLocale', 'running');
  try {
    if (locale) {
      const ok = await setUserAttributes(newUserId, [{ key: 'locale', values: [locale] }], tabId);
      if (!ok) throw new Error('Locale patch returned a non-OK status');
      copied.locale = locale;
    }
    report('copyLocale', 'done', { locale: copied.locale });
  } catch (err) {
    errors.push({ message: err.message, step: 'copyLocale' });
    report('copyLocale', 'error');
  }

  // --- 5-8. Additive grants (groups, cards, pages, apps) ---
  const grants = await applyUserGrants({
    cards,
    customApps,
    groups,
    onStepProgress,
    pages,
    tabId,
    userId: newUserId
  });
  errors.push(...grants.errors);

  return {
    appResults: grants.appResults,
    cardResults: grants.cardResults,
    copied: { ...grants.copied, fields: copied.fields, locale: copied.locale },
    created: true,
    errors,
    newUser: {
      displayName: newDisplayName,
      email: newEmail,
      id: newUserId
    },
    pageResults: grants.pageResults,
    success:
      errors.length === 0 && grants.cardResults.errors.length === 0 && grants.pageResults.errors.length === 0
  };
}

/**
 * Gather everything the DuplicateView preview panel needs to display:
 * source user, profile fields with values, locale, groups (with names), and
 * the source user's individually-shared cards, pages, and custom apps.
 *
 * @param {Object} params
 * @param {number|string} params.sourceUserId
 * @param {number|null} [params.tabId]
 */
export async function fetchDuplicationPreview({ sourceUserId, tabId = null }) {
  const [source, userGroupsRich, shares] = await Promise.all([
    getFullUserDetails(sourceUserId, tabId),
    getUserGroups(sourceUserId, tabId),
    getIndividualSharesForUser(sourceUserId, tabId)
  ]);

  if (!source?.id) {
    throw new Error(`Source user ${sourceUserId} not found`);
  }

  const profileFields = [];
  for (const key of USER_PROFILE_FIELDS) {
    const value = source[key];
    if (value !== undefined && value !== null && value !== '') {
      profileFields.push({ key, value });
    }
  }

  const groups = toAssignableGroups(userGroupsRich);

  return {
    cards: shares.cards,
    customApps: shares.customApps,
    groups,
    locale: source.locale || null,
    pages: shares.pages,
    profileFields,
    source: {
      displayName: source.displayName,
      email: source.email || source.detail?.email || '',
      id: source.id,
      roleId: source.roleId ?? source.role ?? null
    }
  };
}

/**
 * Run the additive-grant steps (groups, cards, pages, apps) against a single
 * user id, reporting each step via `onStepProgress`. Shared by both the
 * new-user duplication flow and the existing-user access-grant flow. Every
 * operation is additive, so re-granting access the user already has is a no-op.
 *
 * @param {Object} params
 * @param {number|string} params.userId - The user receiving the grants
 * @param {Array<{groupId: string|number, groupName: string}>} [params.groups] - Groups to add (explicit selection; empty adds none)
 * @param {Array<{id: number, name: string}>} [params.cards]
 * @param {Array<{id: number, title: string}>} [params.pages]
 * @param {Array<{id: number, name: string}>} [params.customApps]
 * @param {number|null} [params.tabId]
 * @param {Function} [params.onStepProgress]
 * @returns {Promise<{appResults: Object, cardResults: Object, copied: Object, errors: Array, pageResults: Object}>}
 */
async function applyUserGrants({
  cards = [],
  customApps = [],
  groups = [],
  onStepProgress = () => {},
  pages = [],
  tabId = null,
  userId
}) {
  const errors = [];
  const cardResults = { attempted: cards, errors: [] };
  const pageResults = { attempted: pages, errors: [] };
  const appResults = { attempted: customApps, errors: [] };
  const copied = {
    cards: 0,
    customApps: 0,
    groups: [],
    pages: 0
  };
  const report = (step, status, result) => {
    try {
      onStepProgress(step, status, result);
    } catch {
      // UI callback errors must never bubble up into the flow
    }
  };

  // --- Add to groups (explicit selection; an empty list adds none) ---
  report('addGroups', 'running');
  try {
    if (groups.length > 0) {
      const accessPayload = groups.map((g) => ({
        addMembers: [{ id: String(userId), type: 'USER' }],
        groupId: g.groupId
      }));
      const ok = await addUsersToGroups(accessPayload, tabId);
      if (!ok) throw new Error('Group access update returned a non-OK status');
      copied.groups = groups;
    }
    report('addGroups', 'done', { count: copied.groups.length });
  } catch (err) {
    errors.push({ message: err.message, step: 'addGroups' });
    report('addGroups', 'error');
  }

  // --- Share individually-shared cards ---
  report('shareCards', 'running');
  try {
    await shareBatched({
      attemptedRecords: cardResults,
      items: cards,
      newUserId: userId,
      resourceType: 'badge',
      tabId
    });
    copied.cards = cards.length - cardResults.errors.length;
    report('shareCards', 'done', { count: copied.cards });
  } catch (err) {
    errors.push({ message: err.message, step: 'shareCards' });
    report('shareCards', 'error');
  }

  // --- Share individually-shared pages ---
  report('sharePages', 'running');
  try {
    await shareBatched({
      attemptedRecords: pageResults,
      items: pages,
      newUserId: userId,
      resourceType: 'page',
      tabId
    });
    copied.pages = pages.length - pageResults.errors.length;
    report('sharePages', 'done', { count: copied.pages });
  } catch (err) {
    errors.push({ message: err.message, step: 'sharePages' });
    report('sharePages', 'error');
  }

  // --- Custom apps (audit-only for now) ---
  report('shareApps', 'running');
  if (customApps.length > 0) {
    appResults.errors.push({
      error: 'Custom app sharing is not yet implemented, please share manually',
      id: 'all'
    });
  }
  copied.customApps = 0;
  report('shareApps', 'done', { count: 0, skipped: customApps.length });

  return { appResults, cardResults, copied, errors, pageResults };
}

async function shareBatched({ attemptedRecords, items, newUserId, resourceType, tabId }) {
  for (let i = 0; i < items.length; i += SHARE_BATCH_SIZE) {
    const batch = items.slice(i, i + SHARE_BATCH_SIZE);
    const ok = await shareContent(
      {
        recipients: [{ id: String(newUserId), type: 'user' }],
        resources: batch.map((item) => ({ id: String(item.id), type: resourceType }))
      },
      tabId
    );
    if (!ok) {
      for (const item of batch) {
        attemptedRecords.errors.push({
          error: `Share batch starting at index ${i} failed`,
          id: item.id
        });
      }
    }
  }
}

function toAssignableGroups(richGroups) {
  if (!richGroups?.length) return [];
  return richGroups
    .filter((g) => ASSIGNABLE_GROUP_TYPES.has(g.groupType))
    .map((g) => ({ groupId: g.groupId, groupName: g.name }));
}
