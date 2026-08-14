import { useCallback, useRef, useState } from 'react';

import { useResolveTabId } from '@/hooks/useResolveTabId';

import {
  convertToGraph,
  enrichMetadata,
  findTruncatedNodes,
  getLineage,
  mergeLineageInto,
  toLineageType,
  toMapKey
} from '../services/lineage';

const CONCURRENCY = 5;
const EXPAND_DEPTH = 4;
// The lineage API applies no server-side ceiling and saturates at the real
// graph, so the export asks for the whole pipeline outright instead of crawling
// outward from a shallow load.
const FULL_DEPTH = 100;
const INITIAL_DEPTH = 4;
const PROGRESS_INTERVAL_MS = 250;

export function useLineageCache() {
  const rawCacheRef = useRef({});
  const rootRef = useRef(null);
  const inflightRef = useRef(new Map());

  // Pass null — init seeds the refs via overrides, not state
  const resolveTabId = useResolveTabId(null, null);

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandLoading, setExpandLoading] = useState(new Set());

  const rebuildGraph = useCallback(() => {
    if (!rootRef.current) return null;
    const { entityId, entityType, origin } = rootRef.current;
    const baseUrl = origin || '';
    const newGraph = convertToGraph(rawCacheRef.current, entityType, entityId, baseUrl);
    setGraph(newGraph);
    return newGraph;
  }, []);

  const init = useCallback(
    async (entityType, entityId, initTabId, initInstance, initOrigin) => {
      rootRef.current = { entityId, entityType, instance: initInstance, origin: initOrigin };
      rawCacheRef.current = {};
      inflightRef.current.clear();
      setLoading(true);

      try {
        // Overrides seed the hook's refs for subsequent calls without overrides
        const resolvedTabId = await resolveTabId(initTabId, initInstance);
        const response = await getLineage(entityType, entityId, INITIAL_DEPTH, resolvedTabId);
        if (!response) throw new Error('Empty lineage response');

        rawCacheRef.current = response;
        await enrichMetadata(response, resolvedTabId);
        rebuildGraph();
      } finally {
        setLoading(false);
      }
    },
    [rebuildGraph, resolveTabId]
  );

  const isNeighborCached = useCallback((nodeId, direction) => {
    const [type, ...rest] = nodeId.split(':');
    const id = rest.join(':');
    const key = toMapKey(type, id);
    const entity = rawCacheRef.current[key];
    if (!entity) return false;

    // A response only fills in the side it traversed, and the entities one hop
    // past the requested depth come back with that side empty. An empty list
    // therefore means "not known yet", not "leaf", until a request rooted here
    // says otherwise. Reading it as a leaf is what walled the graph off at the
    // initial depth with no way to expand further.
    const complete = direction === 'upstream' ? entity.parentsComplete : entity.childrenComplete;
    if (complete !== true) return false;

    const neighbors = direction === 'upstream' ? entity.parents || [] : entity.children || [];

    if (neighbors.length === 0) return true;

    return neighbors.every((n) => {
      const neighborKey = toMapKey(n.type, n.id);
      return neighborKey in rawCacheRef.current;
    });
  }, []);

  const fetchAndMerge = useCallback(
    async (entityType, entityId) => {
      const key = toMapKey(entityType, entityId);

      if (inflightRef.current.has(key)) {
        return inflightRef.current.get(key);
      }

      const promise = (async () => {
        const resolvedTabId = await resolveTabId();
        const existingKeys = new Set(Object.keys(rawCacheRef.current));

        const response = await getLineage(entityType, entityId, EXPAND_DEPTH, resolvedTabId);
        if (!response) return;

        // Merge rather than assign: an entity already in the cache carries
        // neighbor lists and enriched metadata that this narrower response would
        // otherwise overwrite with less.
        mergeLineageInto(rawCacheRef.current, response);
        await enrichMetadata(rawCacheRef.current, resolvedTabId, existingKeys);
        rebuildGraph();
      })();

      inflightRef.current.set(key, promise);
      try {
        await promise;
      } finally {
        inflightRef.current.delete(key);
      }
    },
    [rebuildGraph, resolveTabId]
  );

  // Trace the entire lineage in both directions for the export, which needs the
  // full pipeline rather than the depth-limited initial load. One unbounded-depth
  // request pair normally settles it outright; the loop exists because the API
  // could still truncate a traversal, and any entity it truncated has to be
  // re-rooted to see past. Reports each stage through onProgress, since tracing a
  // wide pipeline runs for minutes and the UI has nothing else to go on. Returns
  // the graph plus how many branches were left untraced, so a capped run can say
  // so instead of passing a partial export off as the whole pipeline.
  const fetchEntireLineage = useCallback(
    async (onProgress) => {
      if (!rootRef.current) return { graph: null, untraced: 0 };
      const { entityId, entityType } = rootRef.current;
      const resolvedTabId = await resolveTabId();

      const MAX_NODES = 10000;
      const MAX_ROUNDS = 20;

      const report = throttleProgress(onProgress);
      const requested = new Set();
      let seeds = [{ id: entityId, type: toLineageType(entityType) }];
      let untraced = 0;

      for (let round = 0; round < MAX_ROUNDS && seeds.length > 0; round++) {
        const present = new Set(Object.keys(rawCacheRef.current));

        const queue = [...seeds];
        for (const seed of seeds) requested.add(toMapKey(seed.type, seed.id));

        // A traversal request returns nothing until it returns everything, so
        // this stage can only name what it is doing, not count it.
        report({ phase: 'tracing' }, true);

        const workers = Array.from({ length: CONCURRENCY }, async () => {
          while (queue.length > 0) {
            const seed = queue.shift();
            if (!seed) return;
            const response = await getLineage(seed.type, seed.id, FULL_DEPTH, resolvedTabId).catch(() => null);
            if (response) mergeLineageInto(rawCacheRef.current, response);
          }
        });
        await Promise.allSettled(workers);

        let latest = null;
        await enrichMetadata(rawCacheRef.current, resolvedTabId, present, (done, total) => {
          latest = { done, phase: 'details', total };
          report(latest);
        });
        // Flush: the throttle will usually have swallowed the final batch.
        if (latest) report({ ...latest, done: latest.total }, true);

        // Anything still truncated is a branch the API stopped short of. Skip
        // whatever has already been re-rooted so a failed fetch cannot loop.
        // Work this out before applying either cap, so a run that already has the
        // whole pipeline is not reported as partial.
        seeds = findTruncatedNodes(rawCacheRef.current, entityType, entityId).filter(
          (node) => !requested.has(toMapKey(node.type, node.id))
        );
        if (seeds.length === 0) break;

        const reachedNodeCap = Object.keys(rawCacheRef.current).length >= MAX_NODES;
        const reachedRoundCap = round === MAX_ROUNDS - 1;
        if (reachedNodeCap || reachedRoundCap) {
          untraced = seeds.length;
          console.warn(
            `[Lineage] ${untraced} branches untraced (${reachedNodeCap ? `${MAX_NODES}-node cap` : `${MAX_ROUNDS}-round cap`}); exporting partial lineage`
          );
          break;
        }
      }

      return { graph: rebuildGraph(), untraced };
    },
    [rebuildGraph, resolveTabId]
  );

  const expandFetch = useCallback(
    async (nodeId, entityType, entityId) => {
      setExpandLoading((prev) => {
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });

      try {
        await fetchAndMerge(entityType, entityId);
      } finally {
        setExpandLoading((prev) => {
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
      }
    },
    [fetchAndMerge]
  );

  const prefetch = useCallback(
    async (entityType, entityId) => {
      try {
        await fetchAndMerge(entityType, entityId);
      } catch {
        // Prefetch failures are non-critical
      }
    },
    [fetchAndMerge]
  );

  return {
    expandFetch,
    expandLoading,
    fetchEntireLineage,
    graph,
    init,
    isNeighborCached,
    loading,
    prefetch
  };
}

/**
 * Rate-limit progress reports. Metadata batches land several times a second on a
 * large export, and every report re-renders the graph, so drop the ones that land
 * inside the interval. Pass `force` for stage changes and the final value, which
 * must always get through.
 * @param {Function|null} onProgress - Caller's progress callback
 * @returns {(progress: Object, force?: boolean) => void} Throttled reporter
 */
function throttleProgress(onProgress) {
  if (!onProgress) return () => {};
  let lastReportedAt = 0;
  return (progress, force = false) => {
    const now = Date.now();
    if (!force && now - lastReportedAt < PROGRESS_INTERVAL_MS) return;
    lastReportedAt = now;
    onProgress(progress);
  };
}
