import { useCallback, useRef, useState } from 'react';

import {
  convertToGraph,
  enrichMetadata,
  getLineage,
  toMapKey
} from '@/services';

const INITIAL_DEPTH = 4;
const EXPAND_DEPTH = 4;

export function useLineageCache() {
  const rawCacheRef = useRef({});
  const rootRef = useRef(null);
  const tabIdRef = useRef(null);

  const [graph, setGraph] = useState(null);
  const [loading, setLoading] = useState(false);
  const [expandLoading, setExpandLoading] = useState(new Set());

  const rebuildGraph = useCallback(() => {
    if (!rootRef.current) return null;
    const { entityId, entityType } = rootRef.current;
    const newGraph = convertToGraph(rawCacheRef.current, entityType, entityId);
    setGraph(newGraph);
    return newGraph;
  }, []);

  const init = useCallback(async (entityType, entityId, tabId) => {
    rootRef.current = { entityId, entityType };
    tabIdRef.current = tabId;
    rawCacheRef.current = {};
    setLoading(true);

    try {
      const response = await getLineage(entityType, entityId, INITIAL_DEPTH, tabId);
      if (!response) throw new Error('Empty lineage response');

      rawCacheRef.current = response;
      await enrichMetadata(response, tabId);
      rebuildGraph();
    } finally {
      setLoading(false);
    }
  }, [rebuildGraph]);

  const isNeighborCached = useCallback((nodeId, direction) => {
    const [type, ...rest] = nodeId.split(':');
    const id = rest.join(':');
    const key = toMapKey(type, id);
    const entity = rawCacheRef.current[key];
    if (!entity) return false;

    const neighbors = direction === 'upstream'
      ? (entity.parents || [])
      : (entity.children || []);

    if (neighbors.length === 0) return true;

    return neighbors.every((n) => {
      const neighborKey = toMapKey(n.type, n.id);
      return neighborKey in rawCacheRef.current;
    });
  }, []);

  const fetchAndMerge = useCallback(async (entityType, entityId) => {
    const tabId = tabIdRef.current;
    const existingKeys = new Set(Object.keys(rawCacheRef.current));

    const response = await getLineage(entityType, entityId, EXPAND_DEPTH, tabId);
    if (!response) return;

    Object.assign(rawCacheRef.current, response);
    await enrichMetadata(rawCacheRef.current, tabId, existingKeys);
    rebuildGraph();
  }, [rebuildGraph]);

  const expandFetch = useCallback(async (nodeId, entityType, entityId) => {
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
  }, [fetchAndMerge]);

  return {
    expandFetch,
    expandLoading,
    graph,
    init,
    isNeighborCached,
    loading
  };
}
