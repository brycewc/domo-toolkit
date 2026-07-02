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

// Domo entity types that carry a meaningful `entitySubType` (e.g. an ACCOUNT's
// data-provider/credential flavor such as `json5`). Primitives like text/number
// have no subtype, so a subtype written on them is a mistake worth warning about.
export const SUBTYPE_ELIGIBLE_TYPES = new Set([
  'ACCOUNT',
  'DIRECTORY',
  'FILE',
  'dataset',
  'group',
  'person',
  'queue'
]);

export function mapJSDocType(rawType) {
  if (!rawType || typeof rawType !== 'string') {
    return { entitySubType: null, isList: false, isTypedef: false, isUnknown: true, type: 'text' };
  }
  const trimmed = rawType.trim();
  const isList = trimmed.endsWith('[]');
  const withoutList = (isList ? trimmed.slice(0, -2) : trimmed).trim();
  // Optional entity subtype after a colon: `{account:json5}` -> base `account`,
  // subtype `json5`. Only the first colon splits; the rest is the subtype name.
  const colonIdx = withoutList.indexOf(':');
  const baseRaw = (colonIdx === -1 ? withoutList : withoutList.slice(0, colonIdx)).trim();
  const entitySubType = colonIdx === -1 ? null : withoutList.slice(colonIdx + 1).trim() || null;
  const baseLower = baseRaw.toLowerCase();
  const canonical = PRIMITIVE_TYPES[TYPE_ALIASES[baseLower] || baseLower];
  if (canonical) {
    return { entitySubType, isList, isTypedef: false, isUnknown: false, type: canonical };
  }
  return { entitySubType, isList, isTypedef: true, isUnknown: false, type: baseRaw };
}
