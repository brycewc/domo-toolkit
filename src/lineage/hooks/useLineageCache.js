import { useCallback, useRef, useState } from 'react';

import { useResolveTabId } from '@/hooks/useResolveTabId';

import { convertToGraph, enrichMetadata, getLineage, toMapKey } from '../services/lineage';

const INITIAL_DEPTH = 4;
const EXPAND_DEPTH = 4;

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
    const { entityId, entityType, instance } = rootRef.current;
    const baseUrl = instance ? `https://${instance}.domo.com` : '';
    const newGraph = convertToGraph(rawCacheRef.current, entityType, entityId, baseUrl);
    setGraph(newGraph);
    return newGraph;
  }, []);

  const init = useCallback(
    async (entityType, entityId, initTabId, initInstance) => {
      rootRef.current = { entityId, entityType, instance: initInstance };
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

        Object.assign(rawCacheRef.current, response);
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

  // Crawl the entire lineage in both directions, expanding the frontier
  // (neighbors referenced but not yet fetched) round by round until the graph
  // stops growing. Used by the export feature, which needs the full pipeline
  // rather than the depth-limited initial load. Reports the running node count
  // via onProgress so the UI can show progress on large, multi-minute crawls.
  const fetchEntireLineage = useCallback(
    async (onProgress) => {
      if (!rootRef.current) return null;
      const resolvedTabId = await resolveTabId();

      const CONCURRENCY = 5;
      const MAX_NODES = 10000;
      const MAX_ROUNDS = 100;

      for (let round = 0; round < MAX_ROUNDS; round++) {
        const present = new Set(Object.keys(rawCacheRef.current));

        // Frontier: any referenced neighbor not yet present as a cache entry.
        const frontier = new Map();
        for (const entity of Object.values(rawCacheRef.current)) {
          if (!entity) continue;
          for (const neighbor of [...(entity.parents || []), ...(entity.children || [])]) {
            if (!neighbor) continue;
            const key = toMapKey(neighbor.type, neighbor.id);
            if (!present.has(key)) frontier.set(key, { id: neighbor.id, type: neighbor.type });
          }
        }

        if (frontier.size === 0) break;
        if (present.size >= MAX_NODES) {
          console.warn(`[Lineage] Reached ${MAX_NODES}-node cap; exporting partial lineage`);
          break;
        }

        const targets = [...frontier.values()];
        for (let i = 0; i < targets.length; i += CONCURRENCY) {
          const chunk = targets.slice(i, i + CONCURRENCY);
          const responses = await Promise.all(
            chunk.map(({ id, type }) => getLineage(type, id, EXPAND_DEPTH, resolvedTabId).catch(() => null))
          );
          // Add only new entities: existing ones already carry complete
          // neighbor lists and enriched metadata that a raw refetch would wipe.
          for (const response of responses) {
            if (!response) continue;
            for (const [key, entity] of Object.entries(response)) {
              if (entity && !rawCacheRef.current[key]) rawCacheRef.current[key] = entity;
            }
          }
        }

        await enrichMetadata(rawCacheRef.current, resolvedTabId, present);
        onProgress?.(Object.keys(rawCacheRef.current).length);
      }

      return rebuildGraph();
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
