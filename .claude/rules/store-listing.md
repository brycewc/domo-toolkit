---
paths:
  - 'store-listing/STORE_LISTING.txt'
---

# Store Listing Character Limit

`store-listing/STORE_LISTING.txt` is the extension's store description. The **Edge Add-ons store caps the description at 10,000 characters**, which is the binding limit (the Chrome Web Store allows more). Any edit to this file must leave it under that cap.

## The rule

- After **every** edit to this file, run `wc -c store-listing/STORE_LISTING.txt` and confirm the result is **under 10,000**.
- Treat 10,000 as a hard ceiling on the `wc -c` number, and aim to land at **9,950 or below** so later additions have headroom. Do not edit right up to 9,999.
- `wc -c` counts the file's trailing newline, and the store counts whatever text is pasted in, so using the `wc -c` value as the ceiling is the safe call. Do not try to reclaim that one byte.

## When the file is over (or an edit would push it over)

Trim **connective prose, not features**. The complete feature list is the value of the listing, so keep every action, view, supported object type, and privacy bullet. Cut:

- Filler phrases that add no information: "with one click", "at once", "instantly", trailing "(Pfilters)"-style parentheticals, redundant examples in a list.
- "Why" / "how" clauses that the feature name already implies.
- Detail in the SETTINGS section that just restates a feature described in full above.

When rewording, re-check `wc -c` afterward: a synonym swap often nets zero or even **adds** characters, so deletion (removing words) is more reliable than rephrasing.

## Prose style

CLAUDE.md's no-em-dash rule applies here as everywhere: no `—` or `–`. Verify with `grep -n '—\|–' store-listing/STORE_LISTING.txt` (expect zero matches) since this is long-form prose where they creep in easily.
