import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

function computeInitialExpanded(graph, rootNodeId) {
  const initial = new Map();

  for (const node of graph.nodes) {
    if (node.id === rootNodeId) {
      initial.set(node.id, { down: true, up: true });
    } else if (Math.abs(node.depth) <= 2) {
      const dir = node.direction;
      initial.set(node.id, {
        down: dir === 'root' || dir === 'downstream',
        up: dir === 'root' || dir === 'upstream'
      });
    }
  }

  return initial;
}

function getGraphFingerprint(graph, rootNodeId) {
  if (!graph || !rootNodeId) return null;
  return `${rootNodeId}:${graph.nodes.length}:${graph.edges.length}`;
}

export function useGraphVisibility({
  expandFetch,
  graph,
  isNeighborCached,
  rootNodeId
}) {
  const [expandedNodes, setExpandedNodes] = useState(new Map());
  const [highlightedDepth, setHighlightedDepth] = useState(null);
  const initializedForRef = useRef(null);
  const initialExpandedRef = useRef(null);

  useEffect(() => {
    const fingerprint = getGraphFingerprint(graph, rootNodeId);
    if (!fingerprint || initializedForRef.current === fingerprint) return;

    initializedForRef.current = fingerprint;
    const initial = computeInitialExpanded(graph, rootNodeId);
    initialExpandedRef.current = initial;
    setExpandedNodes(initial);
  }, [graph, rootNodeId]);

  const effectiveExpanded = useMemo(() => {
    if (!graph || !rootNodeId) return expandedNodes;

    if (expandedNodes.size === 0 && initialExpandedRef.current) {
      return initialExpandedRef.current;
    }

    return expandedNodes;
  }, [expandedNodes, graph, rootNodeId]);

  const adjacency = useMemo(() => {
    if (!graph) return { downstream: new Map(), upstream: new Map() };

    const downstream = new Map();
    const upstream = new Map();

    for (const edge of graph.edges) {
      if (!downstream.has(edge.sourceId)) {
        downstream.set(edge.sourceId, []);
      }
      downstream.get(edge.sourceId).push(edge.targetId);

      if (!upstream.has(edge.targetId)) {
        upstream.set(edge.targetId, []);
      }
      upstream.get(edge.targetId).push(edge.sourceId);
    }

    return { downstream, upstream };
  }, [graph]);

  const visibleTrace = useMemo(() => {
    if (!graph || !rootNodeId) return { edges: [], nodes: [] };

    const visible = new Set();
    const queue = [rootNodeId];
    visible.add(rootNodeId);

    while (queue.length > 0) {
      const current = queue.shift();
      const expansion = effectiveExpanded.get(current);
      if (!expansion) continue;

      if (expansion.down) {
        for (const neighbor of adjacency.downstream.get(current) || []) {
          if (!visible.has(neighbor)) {
            visible.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      if (expansion.up) {
        for (const neighbor of adjacency.upstream.get(current) || []) {
          if (!visible.has(neighbor)) {
            visible.add(neighbor);
            queue.push(neighbor);
          }
        }
      }
    }

    const visibleNodes = graph.nodes
      .filter((n) => visible.has(n.id))
      .map((n) => ({
        ...n,
        expanded: effectiveExpanded.get(n.id),
        highlighted: highlightedDepth !== null && n.depth === highlightedDepth
      }));

    const visibleEdges = graph.edges.filter(
      (e) => visible.has(e.sourceId) && visible.has(e.targetId)
    );

    return { edges: visibleEdges, nodes: visibleNodes };
  }, [graph, rootNodeId, effectiveExpanded, adjacency, highlightedDepth]);

  const levelSummary = useMemo(() => {
    if (!visibleTrace) return { downstream: [], upstream: [] };

    const depthBuckets = new Map();
    for (const node of visibleTrace.nodes) {
      if (node.depth === 0) continue;
      if (!depthBuckets.has(node.depth)) {
        depthBuckets.set(node.depth, []);
      }
      depthBuckets.get(node.depth).push(node);
    }

    const buildLevels = (sign) => {
      const levels = [];
      const depths = [...depthBuckets.keys()]
        .filter((d) => (sign > 0 ? d > 0 : d < 0))
        .sort((a, b) => (sign > 0 ? a - b : b - a));

      for (const depth of depths) {
        const nodesAtDepth = depthBuckets.get(depth) || [];
        const allExpanded = nodesAtDepth.every((n) => {
          const exp = effectiveExpanded.get(n.id);
          return sign > 0 ? exp?.down : exp?.up;
        });
        levels.push({
          allExpanded,
          depth,
          nodeCount: nodesAtDepth.length
        });
      }

      return levels;
    };

    return {
      downstream: buildLevels(1),
      upstream: buildLevels(-1)
    };
  }, [visibleTrace, effectiveExpanded]);

  const frontierCounts = useMemo(() => {
    if (!visibleTrace || !graph) return { downstream: 0, upstream: 0 };

    let upCount = 0;
    let downCount = 0;

    for (const node of visibleTrace.nodes) {
      const exp = effectiveExpanded.get(node.id);
      if (node.upstreamCount > 0 && !exp?.up && node.direction !== 'downstream') {
        upCount++;
      }
      if (node.downstreamCount > 0 && !exp?.down && node.direction !== 'upstream') {
        downCount++;
      }
    }

    return { downstream: downCount, upstream: upCount };
  }, [visibleTrace, effectiveExpanded, graph]);

  const expandNode = useCallback(
    async (nodeId, direction) => {
      const needsFetch = !isNeighborCached(nodeId, direction);
      if (needsFetch) {
        const node = graph?.nodes.find((n) => n.id === nodeId);
        if (node) {
          await expandFetch(nodeId, node.entityType, node.entityId);
        }
      }

      setExpandedNodes((prev) => {
        const next = new Map(prev);
        const existing = next.get(nodeId) || { down: false, up: false };
        next.set(nodeId, {
          ...existing,
          [direction === 'upstream' ? 'up' : 'down']: true
        });
        return next;
      });
    },
    [graph, isNeighborCached, expandFetch]
  );

  const collapseNode = useCallback(
    (nodeId, direction) => {
      setExpandedNodes((prev) => {
        const next = new Map(prev);
        const existing = next.get(nodeId) || { down: false, up: false };
        next.set(nodeId, {
          ...existing,
          [direction === 'upstream' ? 'up' : 'down']: false
        });
        return next;
      });
    },
    []
  );

  const expandLevel = useCallback(
    async (direction, depth) => {
      if (!visibleTrace) return;

      const nodesAtDepth = visibleTrace.nodes.filter((n) => n.depth === depth);
      const fetchPromises = [];

      for (const node of nodesAtDepth) {
        if (!isNeighborCached(node.id, direction)) {
          fetchPromises.push(
            expandFetch(node.id, node.entityType, node.entityId)
          );
        }
      }

      if (fetchPromises.length > 0) {
        await Promise.all(fetchPromises);
      }

      setExpandedNodes((prev) => {
        const next = new Map(prev);
        for (const node of nodesAtDepth) {
          const existing = next.get(node.id) || { down: false, up: false };
          next.set(node.id, {
            ...existing,
            [direction === 'upstream' ? 'up' : 'down']: true
          });
        }
        return next;
      });
    },
    [visibleTrace, isNeighborCached, expandFetch]
  );

  const collapseLevel = useCallback(
    (direction, depth) => {
      if (!graph) return;

      setExpandedNodes((prev) => {
        const next = new Map(prev);
        for (const node of graph.nodes) {
          if (
            (direction === 'downstream' && node.depth >= depth) ||
            (direction === 'upstream' && node.depth <= depth)
          ) {
            const existing = next.get(node.id) || { down: false, up: false };
            next.set(node.id, {
              ...existing,
              [direction === 'upstream' ? 'up' : 'down']: false
            });
          }
        }
        return next;
      });
    },
    [graph]
  );

  const highlightLevel = useCallback((depth) => {
    setHighlightedDepth(depth);
  }, []);

  const clearHighlight = useCallback(() => {
    setHighlightedDepth(null);
  }, []);

  return {
    clearHighlight,
    collapseLevel,
    collapseNode,
    expandLevel,
    expandNode,
    frontierCounts,
    highlightLevel,
    levelSummary,
    visibleTrace
  };
}
