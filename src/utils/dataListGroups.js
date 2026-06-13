import { DataListItem } from '@/models/DataListItem';

/**
 * Back-fill a grouped DataList with empty placeholders for any canonical
 * category the view didn't build, and return groups in canonical order.
 *
 * Views keep building only their non-empty groups; pass the result here with
 * the ordered canonical set. Any missing id becomes a muted, non-expandable
 * `(0)` group. Items whose id isn't canonical are appended in original order.
 *
 * IMPORTANT: when the view built zero groups (nothing found at all), this
 * returns the empty array unchanged rather than fabricating an all-zero view.
 * The caller's existing empty-state/toast then handles the no-results case, so
 * users see "nothing here" rather than a wall of `(0)` categories. Zero-rows
 * only appear alongside at least one populated category.
 *
 * @param {DataListItem[]} items - Groups the view actually built
 * @param {Array<{id: string, label: string}>} canonicalGroups - Ordered canonical set
 * @returns {DataListItem[]}
 */
export function withCanonicalGroups(items, canonicalGroups) {
  if (!items.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered = canonicalGroups.map(
    (group) => byId.get(group.id) ?? DataListItem.createGroup({ children: [], id: group.id, label: group.label })
  );
  const canonicalIds = new Set(canonicalGroups.map((group) => group.id));
  const extra = items.filter((item) => !canonicalIds.has(item.id));
  return [...ordered, ...extra];
}
