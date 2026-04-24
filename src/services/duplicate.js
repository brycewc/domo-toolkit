/**
 * Orchestrator for duplicating Domo objects. Initially supports USER; extensible
 * to other types by adding more functions here and wiring them in DuplicateView.
 *
 * Low-level API calls live in their domain services (users.js, groups.js, etc.).
 * This file composes them into the full multi-step flow and reports progress to
 * the UI via an optional `onStepProgress` callback.
 */

import { getUserAccessibleCards } from './cards';
import { addUsersToGroups, fetchGroupDisplayNames } from './groups';
import { getUserAccessiblePages } from './pages';
import { shareContent } from './share';
import {
  bulkUpdateUsers,
  createUser,
  getFullUserDetails,
  getUserGroups,
  setUserAttributes
} from './users';

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

/**
 * Duplicate a Domo user — copies role, profile, locale, group memberships, and
 * accessible card/page shares onto a newly-created user. Recoverable step
 * failures are accumulated in `errors[]` rather than thrown; only source-fetch
 * and user-creation failures abort the flow.
 *
 * @param {Object} params
 * @param {number|string} params.sourceUserId
 * @param {string} params.newDisplayName
 * @param {string} params.newEmail
 * @param {number|null} [params.tabId]
 * @param {(stepKey: string, status: 'running'|'done'|'error', result?: Object) => void} [params.onStepProgress]
 * @returns {Promise<{
 *   success: boolean,
 *   newUser: {id: number, displayName: string, email: string}|null,
 *   copied: {fields: string[], locale: string|null, groups: number, cards: number, pages: number},
 *   errors: Array<{step: string, message: string}>
 * }>}
 */
export async function duplicateUser({
  newDisplayName,
  newEmail,
  onStepProgress = () => {},
  sourceUserId,
  tabId = null
}) {
  const errors = [];
  const copied = {
    cards: 0,
    fields: [],
    groups: 0,
    locale: null,
    pages: 0
  };
  const report = (step, status, result) => {
    try {
      onStepProgress(step, status, result);
    } catch {
      // UI callback errors must never bubble up into the flow
    }
  };

  // --- 1. Fetch source (abort on failure — nothing to clone without it) ---
  const source = await getFullUserDetails(sourceUserId, tabId);
  if (!source?.id) {
    return {
      copied,
      errors: [
        {
          message: `Source user ${sourceUserId} not found`,
          step: 'fetchSource'
        }
      ],
      newUser: null,
      success: false
    };
  }

  // --- 2. Create new user (abort on failure — nothing to populate) ---
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
      copied,
      errors: [
        {
          message: 'Failed to create new user — role may be invalid or email already in use',
          step: 'createUser'
        }
      ],
      newUser: null,
      success: false
    };
  }
  const newUserId = created.id;
  report('createUser', 'done', { id: newUserId });

  // --- 3. Copy profile fields ---
  report('copyProfile', 'running');
  try {
    const profileFields = {};
    for (const key of USER_PROFILE_FIELDS) {
      const value = source[key];
      if (value !== undefined && value !== null && value !== '') {
        profileFields[key] = value;
      }
    }
    const keys = Object.keys(profileFields);
    if (keys.length > 0) {
      const ok = await bulkUpdateUsers(
        [
          {
            displayName: newDisplayName,
            id: String(newUserId),
            ...profileFields
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
    if (source.locale) {
      const ok = await setUserAttributes(
        newUserId,
        [{ key: 'locale', values: [source.locale] }],
        tabId
      );
      if (!ok) throw new Error('Locale patch returned a non-OK status');
      copied.locale = source.locale;
    }
    report('copyLocale', 'done', { locale: copied.locale });
  } catch (err) {
    errors.push({ message: err.message, step: 'copyLocale' });
    report('copyLocale', 'error');
  }

  // --- 5. Add to groups ---
  report('addGroups', 'running');
  try {
    const groupIds = await getUserGroups(sourceUserId, tabId);
    if (groupIds.length > 0) {
      const accessPayload = groupIds.map((groupId) => ({
        addMembers: [{ id: String(newUserId), type: 'USER' }],
        groupId
      }));
      const ok = await addUsersToGroups(accessPayload, tabId);
      if (!ok) throw new Error('Group access update returned a non-OK status');
      copied.groups = groupIds.length;
    }
    report('addGroups', 'done', { count: copied.groups });
  } catch (err) {
    errors.push({ message: err.message, step: 'addGroups' });
    report('addGroups', 'error');
  }

  // --- 6. Share accessible cards ---
  report('shareCards', 'running');
  try {
    const cardIds = await getUserAccessibleCards(sourceUserId, tabId);
    for (let i = 0; i < cardIds.length; i += SHARE_BATCH_SIZE) {
      const batch = cardIds.slice(i, i + SHARE_BATCH_SIZE);
      const ok = await shareContent(
        {
          recipients: [{ id: String(newUserId), type: 'user' }],
          resources: batch.map((id) => ({ id, type: 'badge' }))
        },
        tabId
      );
      if (!ok) throw new Error(`Share failed at batch starting ${i}`);
    }
    copied.cards = cardIds.length;
    report('shareCards', 'done', { count: cardIds.length });
  } catch (err) {
    errors.push({ message: err.message, step: 'shareCards' });
    report('shareCards', 'error');
  }

  // --- 7. Share accessible pages ---
  report('sharePages', 'running');
  try {
    const pageIds = await getUserAccessiblePages(sourceUserId, tabId);
    for (let i = 0; i < pageIds.length; i += SHARE_BATCH_SIZE) {
      const batch = pageIds.slice(i, i + SHARE_BATCH_SIZE);
      const ok = await shareContent(
        {
          recipients: [{ id: String(newUserId), type: 'user' }],
          resources: batch.map((id) => ({ id, type: 'page' }))
        },
        tabId
      );
      if (!ok) throw new Error(`Share failed at batch starting ${i}`);
    }
    copied.pages = pageIds.length;
    report('sharePages', 'done', { count: pageIds.length });
  } catch (err) {
    errors.push({ message: err.message, step: 'sharePages' });
    report('sharePages', 'error');
  }

  return {
    copied,
    errors,
    newUser: {
      displayName: newDisplayName,
      email: newEmail,
      id: newUserId
    },
    success: errors.length === 0
  };
}

/**
 * Gather everything the DuplicateView preview panel needs to display — source
 * user, profile fields with values, locale, groups (with names), and counts for
 * accessible cards and pages.
 *
 * @param {Object} params
 * @param {number|string} params.sourceUserId
 * @param {number|null} [params.tabId]
 * @returns {Promise<{
 *   source: {id: number, displayName: string, roleId: number, email: string},
 *   profileFields: Array<{key: string, value: any}>,
 *   locale: string|null,
 *   groups: Array<{groupId: string, groupName: string}>,
 *   cardCount: number,
 *   pageCount: number
 * }>}
 */
export async function fetchDuplicationPreview({ sourceUserId, tabId = null }) {
  const [source, groupIds, cardIds, pageIds] = await Promise.all([
    getFullUserDetails(sourceUserId, tabId),
    getUserGroups(sourceUserId, tabId),
    getUserAccessibleCards(sourceUserId, tabId),
    getUserAccessiblePages(sourceUserId, tabId)
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

  const groupNameMap =
    groupIds.length > 0
      ? ((await fetchGroupDisplayNames(groupIds, tabId)) ?? {})
      : {};
  const groups = groupIds.map((id) => ({
    groupId: id,
    groupName: groupNameMap[id] || `Group ${id}`
  }));

  return {
    cardCount: cardIds.length,
    groups,
    locale: source.locale || null,
    pageCount: pageIds.length,
    profileFields,
    source: {
      displayName: source.displayName,
      email: source.email || source.detail?.email || '',
      id: source.id,
      roleId: source.roleId ?? source.role ?? null
    }
  };
}
