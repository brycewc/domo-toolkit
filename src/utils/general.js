export function JsonStringifyOrder(obj, space) {
  const allKeys = new Set();
  JSON.stringify(obj, (key, value) => (allKeys.add(key), value));
  return JSON.stringify(obj, Array.from(allKeys).sort(), space);
}

const DATE_KEYWORDS_LOWER = [
  'date',
  'created',
  'modified',
  'updated',
  'time',
  'timestamp',
  'last'
];
const DATE_KEYWORDS_CASE_SENSITIVE = ['At'];

export function formatEpochTimestamp(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  let ms;
  if (value >= 1e12 && value < 1e14) {
    ms = value;
  } else if (value >= 1e9 && value < 1e11) {
    ms = value * 1000;
  } else {
    return null;
  }

  const date = new Date(ms);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleString();
}

export function isDateFieldName(fieldName) {
  if (typeof fieldName !== 'string') return false;
  if (isUserFieldName(fieldName)) return false;
  const lower = fieldName.toLowerCase();
  return (
    DATE_KEYWORDS_LOWER.some((kw) => lower.includes(kw)) ||
    DATE_KEYWORDS_CASE_SENSITIVE.some((kw) => fieldName.includes(kw))
  );
}

const GROUP_TYPE_DISCRIMINATORS = ['memberType', 'objectType', 'type'];
const GROUP_TYPE_VALUES = new Set(['GROUP', 'Group', 'group']);

export function extractGroupIds(obj) {
  const groupIds = new Set();

  function walk(node) {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }

    if (typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node)) {
      if (isGroupFieldName(key)) {
        collectIds(value);
      }
    }

    const isGroupByType = GROUP_TYPE_DISCRIMINATORS.some((disc) =>
      GROUP_TYPE_VALUES.has(node[disc])
    );
    if (isGroupByType) {
      for (const idField of ['id', 'memberId']) {
        if (idField in node && isValidEntityId(node[idField])) {
          groupIds.add(Number(node[idField]));
        }
      }
    }

    for (const value of Object.values(node)) {
      if (typeof value === 'object' && value !== null) {
        walk(value);
      }
    }
  }

  function collectIds(value) {
    if (value === null || value === undefined) return;

    if (
      (typeof value === 'number' || typeof value === 'string') &&
      isValidEntityId(value)
    ) {
      groupIds.add(Number(value));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectIds(item);
      }
    }
  }

  walk(obj);
  return groupIds;
}

const USER_KEYWORDS_LOWER = [
  'approver',
  'creator',
  'member',
  'observer',
  'owner',
  'responsible',
  'shared',
  'subscriber',
  'user'
];
const USER_KEYWORDS_CASE_SENSITIVE = ['By'];

export function extractUserIds(obj) {
  const userIds = new Set();

  function walk(node) {
    if (node === null || node === undefined) return;

    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }

    if (typeof node !== 'object') return;

    for (const [key, value] of Object.entries(node)) {
      if (isUserFieldName(key)) {
        collectIds(value);
      }
      if (typeof value === 'object' && value !== null) {
        walk(value);
      }
    }
  }

  function collectIds(value) {
    if (value === null || value === undefined) return;

    if (
      (typeof value === 'number' || typeof value === 'string') &&
      isValidEntityId(value)
    ) {
      userIds.add(Number(value));
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        collectIds(item);
      }
      return;
    }

    if (typeof value === 'object') {
      if ('id' in value && isValidEntityId(value.id)) {
        userIds.add(Number(value.id));
      }
    }
  }

  walk(obj);
  return userIds;
}

export function getInitials(displayName) {
  if (!displayName) return '';
  const parts = displayName.trim().split(/\s+/);
  const first = parts[0]?.charAt(0) ?? '';
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

export function isGroupFieldName(fieldName) {
  if (typeof fieldName !== 'string') return false;
  return fieldName.toLowerCase().includes('group');
}

export function isUserFieldName(fieldName) {
  if (typeof fieldName !== 'string') return false;
  const lower = fieldName.toLowerCase();
  return (
    USER_KEYWORDS_LOWER.some((kw) => lower.includes(kw)) ||
    USER_KEYWORDS_CASE_SENSITIVE.some((kw) => fieldName.includes(kw))
  );
}

function isValidEntityId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 9_999_999_999;
}
