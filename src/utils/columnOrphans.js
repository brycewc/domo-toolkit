// Shared "is this scanned reference a broken column?" policy for Remap Columns
// and Migrate Content. Kept in one place, alongside the drop policy in
// `columnDrops.js`, so the two views recognize the same broken references: when
// only one of them looked for orphans, a column that Remap Columns offered to
// fix was one Migrate Content silently carried onto the target, where Domo
// rejected the write.

const DOMO_BATCH_COLUMN = /^_BATCH_/;
const DOMO_SYSTEM_COLUMN = /^__.+__$/;
const NUMERIC_ID = /^\d+$/;
const OBJECT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Content bound to exactly one dataset, so every column it names belongs to that
// dataset. A dataflow or a dataset view joins other datasets, so a name missing
// from this one may simply be another input's column rather than a broken
// reference.
const SINGLE_DATASET_TYPES = new Set(['apps', 'beastModes', 'cards']);

/**
 * Whether a name a scan found, and that the dataset's schema doesn't have, is a
 * broken column reference the user can remap or drop, as opposed to something
 * that only looks like one.
 *
 * Callers establish the "not in the schema" half themselves (which schema
 * differs: Remap Columns compares against the dataset in hand, Migrate Content
 * against the target). This applies the two conservative filters on top.
 *
 * @param {string} name - The referenced name, a `byColumn` key from `scanContentForColumns`.
 * @param {Array<{type: string}>} usages - That key's `byColumn` entries.
 * @returns {boolean}
 */
export function isBrokenColumnReference(name, usages) {
  return isPlausibleColumnName(name) && (usages || []).some((usage) => SINGLE_DATASET_TYPES.has(usage?.type));
}

/**
 * Whether a referenced name plausibly was a real, user-facing column, as opposed
 * to a Beast Mode reference id, an object id, or a Domo system column that
 * downstream content references but that never appears in a dataset's schema.
 *
 * @param {string} name
 * @returns {boolean}
 */
export function isPlausibleColumnName(name) {
  if (typeof name !== 'string' || !name.trim()) return false;
  if (name.startsWith('calculation_')) return false;
  if (OBJECT_ID.test(name)) return false;
  if (NUMERIC_ID.test(name)) return false;
  if (DOMO_SYSTEM_COLUMN.test(name)) return false;
  if (DOMO_BATCH_COLUMN.test(name)) return false;
  return true;
}
