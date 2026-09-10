import { fetchObjectDetailsInPage, getObjectType } from '@/models/DomoObjectType';
import { DEPENDENCY_FETCH_CONCURRENCY } from '@/utils/constants';
import { executeInPage } from '@/utils/executeInPage';

/**
 * Resolve a mixed bag of object references to a display name and a link, using
 * each type's own registry config rather than a per-type service function. Built
 * for dependency listings, where one object can point at half a dozen unrelated
 * types and every one of them needs a row.
 *
 * A lookup that fails leaves that key out of the map, so a caller falls back to
 * its own `Type 12345` label instead of showing a blank row.
 * @param {Object} params
 * @param {string} params.baseUrl - The instance base URL, for building links
 * @param {Array<{id: string, parentId?: string, typeId: string}>} params.refs - References to resolve
 * @param {number} [params.tabId] - Tab to run the lookups in
 * @returns {Promise<Map<string, {name: string|null, url: string|null}>>} Keyed by `summaryKey`
 */
export async function resolveObjectSummaries({ baseUrl, refs, tabId = null }) {
  const targets = uniqueTargets(refs);
  const summaries = new Map();
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(DEPENDENCY_FETCH_CONCURRENCY, targets.length) }, async () => {
      while (next < targets.length) {
        const target = targets[next++];
        const summary = await resolveSummary({ baseUrl, tabId, target });
        if (summary.name || summary.url) summaries.set(target.key, summary);
      }
    })
  );
  return summaries;
}

/**
 * The map key for one reference. Exported so a caller reads back what it asked
 * for without duplicating the format.
 * @param {{id: string, typeId: string}} ref
 * @returns {string}
 */
export function summaryKey({ id, typeId }) {
  return `${typeId}:${id}`;
}

async function readName({ baseUrl, objectType, ref, tabId }) {
  if (!objectType.hasApiConfig()) return null;
  const requiresParent = !!objectType.requiresParentForApi();
  if (requiresParent && !ref.parentId) return null;
  const params = {
    apiConfig: objectType.api,
    baseUrl,
    objectId: ref.id,
    parentId: ref.parentId ?? null,
    requiresParent,
    throwOnError: false,
    typeId: objectType.id
  };
  try {
    const metadata = await executeInPage(fetchObjectDetailsInPage, [params], tabId);
    return metadata?.name ?? null;
  } catch (error) {
    console.warn(`[objectSummaries] Could not read ${objectType.id} ${ref.id}:`, error);
    return null;
  }
}

async function readUrl({ baseUrl, objectType, ref }) {
  if (!baseUrl || !objectType.hasUrl()) return null;
  if (objectType.requiresParentForUrl() && !ref.parentId) return null;
  try {
    // No tabId: a missing parent should yield no link rather than a lookup of
    // its own, since the reference already carries the parent when it has one.
    const url = await objectType.buildObjectUrl(baseUrl, ref.id, ref.parentId ?? null);
    // A type whose path interpolates metadata we never fetched leaves its
    // placeholder behind, which is a broken link rather than a usable one.
    return url.includes('{') ? null : url;
  } catch {
    return null;
  }
}

async function resolveSummary({ baseUrl, tabId, target }) {
  const { objectType, ref } = target;
  const [name, url] = await Promise.all([
    readName({ baseUrl, objectType, ref, tabId }),
    readUrl({ baseUrl, objectType, ref })
  ]);
  return { name, url };
}

function uniqueTargets(refs) {
  const targets = new Map();
  for (const ref of refs || []) {
    if (!ref?.id || !ref?.typeId) continue;
    const key = summaryKey(ref);
    if (targets.has(key)) continue;
    const objectType = getObjectType(ref.typeId);
    if (!objectType) continue;
    targets.set(key, { key, objectType, ref });
  }
  return [...targets.values()];
}
