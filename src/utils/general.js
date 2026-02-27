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
