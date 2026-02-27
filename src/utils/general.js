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

export function isDateFieldName(fieldName) {
  if (typeof fieldName !== 'string') return false;
  const lower = fieldName.toLowerCase();
  return (
    DATE_KEYWORDS_LOWER.some((kw) => lower.includes(kw)) ||
    DATE_KEYWORDS_CASE_SENSITIVE.some((kw) => fieldName.includes(kw))
  );
}

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

export function isUserFieldName(fieldName) {
  if (typeof fieldName !== 'string') return false;
  const lower = fieldName.toLowerCase();
  return (
    USER_KEYWORDS_LOWER.some((kw) => lower.includes(kw)) ||
    USER_KEYWORDS_CASE_SENSITIVE.some((kw) => fieldName.includes(kw))
  );
}

function isValidUserId(value) {
  const num = Number(value);
  return Number.isInteger(num) && num >= 1 && num <= 999999999;
}

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
      isValidUserId(value)
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
      if ('id' in value && isValidUserId(value.id)) {
        userIds.add(Number(value.id));
      }
    }
  }

  walk(obj);
  return userIds;
}
