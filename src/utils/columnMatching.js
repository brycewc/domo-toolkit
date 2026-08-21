// Shared column-name matcher for the Auto Map action in Remap Columns and Migrate
// Content. Kept in one place so both views suggest replacements identically.

// How much of the longer name the shared words must cover when one name's words
// are a subset of the other's, and how much of the shorter name they must cover
// when the two names share only their head word.
const SUBSET_COVERAGE = 0.5;
const SAME_HEAD_COVERAGE = 0.75;

// Best-guess replacement for a column: the candidate whose words line up with it
// closely enough to read as a rename rather than a coincidence. Both names are
// split into word tokens (on spaces, hyphens, underscores, and capital-letter and
// letter/digit boundaries), so `DataLoads_JobCount` becomes `data loads job
// count`, and the comparison runs on whole words. Sharing a word is not enough on
// its own: see matchScore for what qualifies. Returns '' when nothing qualifies,
// or when two different candidates qualify equally well, so the caller can fall
// back to unmapped.
export function suggestReplacement(brokenName, candidates) {
  const broken = describeColumnName(brokenName);
  if (broken.chars === 0) return '';
  let best = '';
  let bestScore = 0;
  let ambiguous = false;
  for (const candidate of candidates || []) {
    const name = candidate?.name;
    if (!name) continue;
    const cand = describeColumnName(name);
    if (cand.chars === 0) continue;
    const score = matchScore(broken, cand);
    if (score <= 0) continue;
    if (score > bestScore) {
      best = name;
      bestScore = score;
      ambiguous = false;
    } else if (score === bestScore && best && name !== best) {
      // A perfect score means the candidate has exactly the broken column's words,
      // so two of them differ only in spelling or case and either will do; prefer
      // the shorter. Below that, a tie is a coin flip between two genuinely
      // different columns, so suggest nothing and let the user pick.
      if (score === 1) {
        if (name.length < best.length) best = name;
      } else {
        ambiguous = true;
      }
    }
  }
  return ambiguous ? '' : best;
}

// Split a column name into its distinct lowercased word tokens and describe the
// pieces matchScore compares: the tokens themselves, their total length, the head
// (last) word, and whether that head is the name's longest word (a head no longer
// than its qualifiers, like the `id` in `account id`, is too generic to match on).
function describeColumnName(name) {
  const all = tokenizeColumnName(name);
  const tokens = [...new Set(all)];
  const head = all[all.length - 1] || '';
  const longest = tokens.reduce((max, token) => Math.max(max, token.length), 0);
  return {
    chars: tokens.reduce((sum, token) => sum + token.length, 0),
    head,
    headIsLongest: head.length === longest,
    tokens,
    tokenSet: new Set(tokens)
  };
}

// Score one candidate against the broken column, 0 when it does not qualify at
// all. Two shapes qualify:
//
// 1. Words were only added or removed, so one name's words are a subset of the
//    other's, and what they share is at least half of the longer name. This is
//    the common rename: a delimiter or case reformat (`Account_ID` ->
//    `account id`), or a qualifier tacked on (`Account Territory` ->
//    `Account Territory Name`).
// 2. Each name has words the other lacks, but they end on the same head word (the
//    last one, which is what the column actually is), that head is the longest
//    word on both sides, and it still covers most of the shorter name. This keeps
//    `ca_parentid` -> `l_utm_campid_parentid`.
//
// Everything else is rejected, which is what stops two unrelated columns from
// pairing up on a shared qualifier: `Account Territory` and `Account ID` differ
// in head word, so the shared `account` no longer maps one to the other, and
// `gross_amount` shares too little of `net_amount` to count as a rename of it.
// Qualifying candidates are ranked by how much of the two names' combined words
// they share, so the closest name wins.
function matchScore(broken, cand) {
  let shared = 0;
  for (const token of broken.tokens) if (cand.tokenSet.has(token)) shared += token.length;
  if (shared === 0) return 0;
  const similarity = shared / (broken.chars + cand.chars - shared);
  if (shared === broken.chars || shared === cand.chars) {
    const coverage = shared / Math.max(broken.chars, cand.chars);
    return coverage >= SUBSET_COVERAGE ? similarity : 0;
  }
  if (broken.head !== cand.head || !broken.headIsLongest || !cand.headIsLongest) return 0;
  const coverage = shared / Math.min(broken.chars, cand.chars);
  return coverage >= SAME_HEAD_COVERAGE ? similarity : 0;
}

// Split a column name into lowercased word tokens, treating spaces, hyphens,
// underscores, and capital-letter and letter/digit boundaries as word breaks. So
// `DataLoads_JobCount` -> ['data', 'loads', 'job', 'count'] and `account id` ->
// ['account', 'id'].
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
