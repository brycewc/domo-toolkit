import { useEffect, useMemo, useRef, useState } from 'react';

import { fetchUserDisplayNames, getCustomAvatarUserIds, getInactiveUserIds } from '@/services/users';

// Both user lookups take their ids in the query string, so a wide graph's owners
// go out in batches rather than one very long URL.
const CHUNK_SIZE = 100;

/**
 * Resolve the owner details a lineage node needs to draw but the lineage payload
 * does not carry: which owners have a real profile picture rather than Domo's
 * placeholder, which accounts have been deleted, and a display name for any owner
 * still missing one. Names normally arrive with the node's metadata, so that last
 * lookup is a fallback for the batch whose name call failed and does nothing in
 * the ordinary case.
 *
 * Every lookup is incremental and additive, mirroring the Activity Log's user
 * column: each id is looked up at most once for the life of the view, so
 * expanding the graph only costs the owners it just revealed. Group owners are
 * skipped, since they have no inactive state and Domo's group placeholder stands
 * in for a missing logo. Ids are keyed as strings throughout, because datasets
 * report their owner id as a string and dataflows as a number.
 *
 * @param {{ nodes: Array }|null} trace - The visible lineage trace
 * @param {Function} resolveTabId - Async resolver for a valid Domo tab id
 * @returns {{ customAvatarIds: Set<string>, inactiveUserIds: Set<string>, ownerNames: Object }}
 */
export function useNodeOwners(trace, resolveTabId) {
  const [customAvatarIds, setCustomAvatarIds] = useState(() => new Set());
  const [inactiveUserIds, setInactiveUserIds] = useState(() => new Set());
  const [ownerNames, setOwnerNames] = useState({});

  const checkedAvatarsRef = useRef(new Set());
  const checkedInactiveRef = useRef(new Set());
  const requestedNamesRef = useRef(new Set());

  // The owners of the nodes on screen, deduped: every user id drives the avatar
  // and inactive checks, and the ones without a name drive the name lookup.
  const { unnamedUserIds, userIds } = useMemo(() => {
    const users = new Set();
    const unnamed = new Set();
    for (const node of trace?.nodes ?? []) {
      const owner = node?.metadata?.owner;
      if (!owner?.id || owner.type === 'GROUP') continue;
      const id = String(owner.id);
      users.add(id);
      if (!owner.name) unnamed.add(id);
    }
    return { unnamedUserIds: [...unnamed], userIds: [...users] };
  }, [trace]);

  useEffect(() => {
    const pending = unnamedUserIds.filter((id) => !requestedNamesRef.current.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => requestedNamesRef.current.add(id));

    resolveTabId()
      .then(async (tabId) => {
        const maps = await inChunks(pending, (chunk) => fetchUserDisplayNames(chunk, tabId));
        return Object.assign({}, ...maps.map((map) => map ?? {}));
      })
      .then((resolved) => {
        if (Object.keys(resolved).length === 0) return;
        setOwnerNames((prev) => ({ ...prev, ...resolved }));
      })
      .catch(() => {});
  }, [resolveTabId, unnamedUserIds]);

  useEffect(() => {
    const pending = userIds.filter((id) => !checkedAvatarsRef.current.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => checkedAvatarsRef.current.add(id));

    resolveTabId()
      .then((tabId) => getCustomAvatarUserIds(pending, tabId))
      .then((ids) => addIds(setCustomAvatarIds, ids))
      .catch(() => {});
  }, [resolveTabId, userIds]);

  useEffect(() => {
    const pending = userIds.filter((id) => !checkedInactiveRef.current.has(id));
    if (pending.length === 0) return;
    pending.forEach((id) => checkedInactiveRef.current.add(id));

    resolveTabId()
      .then((tabId) => inChunks(pending, (chunk) => getInactiveUserIds(chunk, tabId)))
      .then((results) => addIds(setInactiveUserIds, results.flat()))
      .catch(() => {});
  }, [resolveTabId, userIds]);

  return useMemo(() => ({ customAvatarIds, inactiveUserIds, ownerNames }), [customAvatarIds, inactiveUserIds, ownerNames]);
}

/**
 * Fold newly found ids into a Set state, keeping the previous Set when nothing is
 * new so the graph does not re-render for an empty result.
 * @param {Function} setIds - State setter holding a Set of string ids
 * @param {Array<number|string>|undefined} ids - Ids to add
 */
function addIds(setIds, ids) {
  if (!ids?.length) return;
  setIds((prev) => {
    const next = new Set(prev);
    for (const id of ids) next.add(String(id));
    return next.size === prev.size ? prev : next;
  });
}

/**
 * Run a lookup over `ids` in fixed-size chunks, one chunk at a time.
 * @param {Array<string>} ids - Ids to look up
 * @param {Function} lookup - Called with each chunk
 * @returns {Promise<Array>} Each chunk's result, in order
 */
async function inChunks(ids, lookup) {
  const results = [];
  for (let i = 0; i < ids.length; i += CHUNK_SIZE) {
    results.push(await lookup(ids.slice(i, i + CHUNK_SIZE)));
  }
  return results;
}
