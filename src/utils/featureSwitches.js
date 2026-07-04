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
 * The feature switch (if any) a given object type requires.
 * @param {string} typeId - DomoObjectType id
 * @returns {string|null} The required switch name, or null for ungated types
 */
export function getTypeFeatureSwitch(typeId) {
  return getObjectType(typeId)?.featureSwitch ?? null;
}

/**
 * Whether a feature switch is enabled per the context's loaded switch list.
 * Fail-open: ungated (no switch name) and not-yet-loaded (null list) both
 * return true; otherwise membership in the list decides.
 * @param {string|null} switchName - The feature switch name to check
 * @param {Object|null} context - DomoContext (live or serialized)
 * @returns {boolean}
 */
export function isFeatureSwitchEnabled(switchName, context) {
  if (!switchName) return true;
  const switches = context?.featureSwitches;
  if (!switches) return true;
  return switches.includes(switchName);
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
