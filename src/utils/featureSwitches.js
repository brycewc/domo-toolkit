/**
 * Central helpers for instance feature-switch gating. The object-type registry
 * is the source of truth: a type opts into gating by setting `featureSwitch`
 * on its DomoObjectType definition, and every consumer routes through
 * `isTypeFeatureEnabled` so gated types are skipped uniformly. All checks fail
 * open while the context's switch list is unknown (still loading, or the page
 * global was unreadable), so a gated feature only disappears once the loaded
 * list confirms its switch is absent.
 */

import { getObjectType } from '@/models/DomoObjectType';

/**
 * @param {string} typeId - DomoObjectType id
 * @returns {string|string[]|null} The requirement, or null for ungated types
 */
export function getTypeFeatureSwitch(typeId) {
  return getObjectType(typeId)?.featureSwitch ?? null;
}

/**
 * Whether a switch requirement (see DomoObjectType `featureSwitch`) is met by
 * the context's loaded list. Fail-open while that list is null.
 * @param {string|string[]|null} requirement - The switch requirement to check
 * @param {Object|null} context - DomoContext (live or serialized)
 * @returns {boolean}
 */
export function isFeatureSwitchEnabled(requirement, context) {
  if (!requirement) return true;
  const switches = context?.featureSwitches;
  // An empty list is a config that never hydrated, not an instance with every switch off.
  if (!switches?.length) return true;
  const entries = Array.isArray(requirement) ? requirement : [requirement];
  return entries.some((entry) => (entry.startsWith('!') ? !switches.includes(entry.slice(1)) : switches.includes(entry)));
}

/**
 * Whether an object type's required feature switch is enabled in the context.
 * @param {string} typeId - DomoObjectType id
 * @param {Object|null} context - DomoContext (live or serialized)
 * @returns {boolean}
 */
export function isTypeFeatureEnabled(typeId, context) {
  return isFeatureSwitchEnabled(getTypeFeatureSwitch(typeId), context);
}
