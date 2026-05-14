const SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'but',
  'by',
  'for',
  'from',
  'in',
  'nor',
  'of',
  'on',
  'or',
  'the',
  'to',
  'with'
]);

const ACRONYMS = new Set([
  'API',
  'CSS',
  'CSV',
  'HTML',
  'ID',
  'IP',
  'JSON',
  'PDF',
  'SQL',
  'UI',
  'URL',
  'UUID',
  'UX',
  'XML'
]);

const COMPOUND_OVERRIDES = {
  appdb: 'AppDB',
  dataapp: 'DataApp',
  dataflow: 'DataFlow',
  dataset: 'DataSet',
  datasource: 'DataSource'
};

export function deriveDisplayName(functionName) {
  if (!functionName) return '';
  const spaced = functionName.replace(/([a-z\d])([A-Z])/g, '$1 $2').replace(/_+/g, ' ');
  const words = spaced.split(/\s+/).filter(Boolean);
  if (words.length === 0) return functionName;
  return words
    .map((word, index) => formatWord(word, index === 0 || index === words.length - 1))
    .join(' ');
}

function formatWord(word, isFirstOrLast) {
  const lower = word.toLowerCase();
  const upper = word.toUpperCase();
  if (ACRONYMS.has(upper)) return upper;
  if (COMPOUND_OVERRIDES[lower]) return COMPOUND_OVERRIDES[lower];
  if (!isFirstOrLast && SMALL_WORDS.has(lower)) return lower;
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
