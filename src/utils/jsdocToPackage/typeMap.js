export const PRIMITIVE_TYPES = {
  account: 'ACCOUNT',
  boolean: 'boolean',
  dataset: 'dataset',
  date: 'date',
  datetime: 'dateTime',
  decimal: 'decimal',
  directory: 'DIRECTORY',
  duration: 'duration',
  file: 'FILE',
  group: 'group',
  number: 'number',
  object: 'object',
  person: 'person',
  queue: 'queue',
  text: 'text',
  time: 'time'
};

const TYPE_ALIASES = {
  bool: 'boolean',
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
  const canonical = PRIMITIVE_TYPES[TYPE_ALIASES[baseLower] || baseLower];
  if (canonical) {
    return { isList, isTypedef: false, isUnknown: false, type: canonical };
  }
  return { isList, isTypedef: true, isUnknown: false, type: baseRaw };
}
