export const PRIMITIVE_TYPES = new Set([
  'account',
  'boolean',
  'dataset',
  'date',
  'datetime',
  'decimal',
  'duration',
  'file',
  'fileset',
  'group',
  'number',
  'object',
  'person',
  'text',
  'time'
]);

const TYPE_ALIASES = {
  bool: 'boolean',
  datetime: 'dateTime',
  string: 'text'
};

export function mapJSDocType(rawType) {
  if (!rawType || typeof rawType !== 'string') {
    return { isList: false, isTypedef: false, isUnknown: true, type: 'text' };
  }
  const trimmed = rawType.trim();
  const isList = trimmed.endsWith('[]');
  const baseRaw = (isList ? trimmed.slice(0, -2) : trimmed).trim();
  const baseLower = baseRaw.toLowerCase();
  if (PRIMITIVE_TYPES.has(baseLower)) {
    return {
      isList,
      isTypedef: false,
      isUnknown: false,
      type: TYPE_ALIASES[baseLower] || baseLower
    };
  }
  return { isList, isTypedef: true, isUnknown: false, type: baseRaw };
}
