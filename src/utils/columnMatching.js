// Shared column-name matcher for the Auto Map action in Remap Columns and Migrate
// Content. Kept in one place so both views suggest replacements identically.

// Best-guess replacement for a column: the candidate that shares the most with it
// as WHOLE words, rather than raw character runs. Both names are split into word
// tokens (on spaces, hyphens, underscores, and capital-letter and letter/digit
// boundaries), so `DataLoads_JobCount` becomes `data loads job count`. The score
// is the overlap coefficient (shared token characters over the shorter name's
// token characters), tie-broken toward the shorter name. This surfaces real
// renames (e.g. `ca_parentid` -> `l_utm_campid_parentid`, or a delimiter/case
// reformat) while rejecting coincidental fragments: `JobCount` no longer matches
// `account id` on a buried `count`, because `count` and `account` are different
// whole words. Returns '' below 0.5, so the caller can fall back to unmapped.
export function suggestReplacement(brokenName, candidates) {
  const brokenTokens = [...new Set(tokenizeColumnName(brokenName))];
  const brokenChars = brokenTokens.reduce((sum, token) => sum + token.length, 0);
  if (brokenChars === 0) return '';
  let best = '';
  let bestScore = 0;
  for (const candidate of candidates || []) {
    const name = candidate?.name;
    if (!name) continue;
    const candTokens = [...new Set(tokenizeColumnName(name))];
    const candChars = candTokens.reduce((sum, token) => sum + token.length, 0);
    if (candChars === 0) continue;
    const candSet = new Set(candTokens);
    let sharedChars = 0;
    for (const token of brokenTokens) if (candSet.has(token)) sharedChars += token.length;
    const score = sharedChars / Math.min(brokenChars, candChars);
    if (score > bestScore || (score === bestScore && best && name.length < best.length)) {
      best = name;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : '';
}

// Split a column name into lowercased word tokens, treating spaces, hyphens,
// underscores, and capital-letter and letter/digit boundaries as word breaks. So
// `DataLoads_JobCount` -> ['data', 'loads', 'job', 'count'] and `account id` ->
// ['account', 'id']. Lets suggestReplacement match on whole words.
function tokenizeColumnName(name) {
  return String(name || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
}
