import { getCodeEnginePackageVersion } from '@/services/codeEngine';
import { computeStructuralDiff } from '@/utils/jsdocToPackage/mergeManifest';

/**
 * Compare a function's input/output contract between two Code Engine versions
 * and classify the differences. Inputs and outputs are matched by `name`
 * (which maps to a workflow tile param's `paramName`), so the result describes
 * exactly what a workflow tile would need reconciled after a version bump.
 *
 * @param {Object|null} oldFn - The function manifest at the tile's current version.
 * @param {Object|null} newFn - The function manifest at the target version, or
 *   `null` when the function no longer exists in that version.
 * @returns {{
 *   functionDeleted: boolean,
 *   hasChanges: boolean,
 *   inputs: { added: Object[], removed: Object[], renamed: Object[], typeChanged: Object[] },
 *   outputs: { added: Object[], removed: Object[], renamed: Object[], typeChanged: Object[] }
 * }}
 */
export function classifyContractChanges(oldFn, newFn) {
  if (!newFn) {
    return {
      functionDeleted: true,
      hasChanges: true,
      inputs: emptyClassification(),
      outputs: emptyClassification()
    };
  }

  const inputs = classifyEntries(oldFn?.inputs, newFn?.inputs);
  const outputs = classifyEntries(
    oldFn?.output ? [oldFn.output] : [],
    newFn?.output ? [newFn.output] : []
  );

  const hasChanges = [inputs, outputs].some(
    (c) =>
      c.added.length > 0 ||
      c.removed.length > 0 ||
      c.renamed.length > 0 ||
      c.typeChanged.length > 0
  );

  return { functionDeleted: false, hasChanges, inputs, outputs };
}

/**
 * Fetch a single function's manifest for a specific package version, caching the
 * version's full `functions` array so repeated lookups (and the common case
 * where one action's old version is another's new version) hit only one request.
 *
 * @param {Object} params
 * @param {Map<string, Object[]>} [params.cache] - Cache keyed by `${packageId}@${version}`.
 * @param {string} params.functionName - The function to locate (tile `functionName`).
 * @param {string} params.packageId - Code Engine package UUID.
 * @param {number|null} [params.tabId] - Optional Chrome tab ID.
 * @param {string} params.version - Version string to fetch.
 * @returns {Promise<Object|null>} The function manifest, or `null` if absent.
 */
export async function getFunctionContract({ cache, functionName, packageId, tabId = null, version }) {
  const key = `${packageId}@${version}`;
  let functions = cache?.get(key);
  if (!functions) {
    const info = await getCodeEnginePackageVersion(packageId, version, tabId);
    functions = Array.isArray(info?.functions) ? info.functions : [];
    cache?.set(key, functions);
  }
  return functions.find((fn) => fn.name === functionName) ?? null;
}

function classifyEntries(oldEntries, newEntries) {
  const oldList = Array.isArray(oldEntries) ? oldEntries : [];
  const newList = Array.isArray(newEntries) ? newEntries : [];
  const oldByName = new Map(oldList.map((e) => [e.name, e]));
  const newByName = new Map(newList.map((e) => [e.name, e]));

  const added = [];
  const removed = [];
  const renamed = [];
  const typeChanged = [];

  for (const entry of newList) {
    const prev = oldByName.get(entry.name);
    if (!prev) {
      added.push(entry);
    } else if (!entriesStructurallyEqual(prev, entry)) {
      typeChanged.push({ name: entry.name, new: entry, old: prev });
    }
  }
  for (const entry of oldList) {
    if (!newByName.has(entry.name)) removed.push(entry);
  }

  // Pair a removed entry with an added one as a rename only when the match is
  // mutually unique and structurally identical apart from the name. Anything
  // ambiguous stays in added/removed so the user maps it by hand. A wrong
  // auto-rename silently rewires a binding, which is worse than asking.
  for (const oldEntry of [...removed]) {
    const addMatches = added.filter((a) => entriesStructurallyEqual(a, oldEntry));
    if (addMatches.length !== 1) continue;
    const newEntry = addMatches[0];
    const removeMatches = removed.filter((r) => entriesStructurallyEqual(r, newEntry));
    if (removeMatches.length !== 1) continue;
    renamed.push({ from: oldEntry.name, new: newEntry, old: oldEntry, to: newEntry.name });
    added.splice(added.indexOf(newEntry), 1);
    removed.splice(removed.indexOf(oldEntry), 1);
  }

  return { added, removed, renamed, typeChanged };
}

function emptyClassification() {
  return { added: [], removed: [], renamed: [], typeChanged: [] };
}

function entriesStructurallyEqual(a, b) {
  return computeStructuralDiff(normalizeForCompare(a), normalizeForCompare(b)).length === 0;
}

function normalizeForCompare(entry) {
  return {
    children: entry?.children ?? null,
    entitySubType: entry?.entitySubType ?? null,
    isList: entry?.isList ?? false,
    type: entry?.type ?? null
  };
}
