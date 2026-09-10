import { colorRulesDuplicator } from './colorRules';
import { userDuplicator } from './user';

// View-facing half of the duplicator registry. Imports may only flow
// Duplicate.jsx -> descriptors, and DuplicateView -> registry -> duplicators ->
// descriptors; a duplicator importing this file or DuplicateView closes a cycle.
// `buildItems` must prefix every row it returns (`card:123`, `rule:2`), since
// DuplicateView holds one selection Set across all of a duplicator's groups.
export const duplicatorsByType = {
  DATA_SOURCE: [colorRulesDuplicator],
  USER: [userDuplicator]
};

/**
 * Resolve one duplicator for an object type. Falls back to the type's first
 * entry so a stored launch record that predates (or lost) its `duplicator` key
 * still opens something sensible rather than bouncing the user out.
 */
export function getDuplicator(typeId, key) {
  const list = duplicatorsByType[typeId];
  if (!list?.length) return null;
  return list.find((d) => d.key === key) ?? list[0];
}
