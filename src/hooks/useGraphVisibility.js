import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

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
  const preserveRef = useRef(false);

  useEffect(() => {
    const fingerprint = getGraphFingerprint(graph, rootNodeId);
    if (!fingerprint) return;

    if (initializedForRef.current === fingerprint) {
      preserveRef.current = false;
      return;
    }

    initializedForRef.current = fingerprint;

    if (preserveRef.current) {
      preserveRef.current = false;
      setExpandedNodes((prev) => {
        const initial = computeInitialExpanded(graph, rootNodeId);
        const merged = new Map(prev);
        for (const [nodeId, exp] of initial) {
          if (!merged.has(nodeId)) {
            merged.set(nodeId, exp);
          }
        }
        initialExpandedRef.current = merged;
        return merged;
      });
    } else {
      const initial = computeInitialExpanded(graph, rootNodeId);
      initialExpandedRef.current = initial;
      setExpandedNodes(initial);
    }
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
        expanded: effectiveExpanded.get(n.id)
      }));

    const visibleEdges = graph.edges.filter(
      (e) => visible.has(e.sourceId) && visible.has(e.targetId)
    );

    return { edges: visibleEdges, nodes: visibleNodes };
  }, [graph, rootNodeId, effectiveExpanded, adjacency]);

  const levelSummary = useMemo(() => {
    if (!visibleTrace) return { downstream: [], upstream: [] };

    const visibleIds = new Set(visibleTrace.nodes.map((n) => n.id));

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
      const dirKey = sign > 0 ? 'down' : 'up';

      // When root is collapsed in this direction there are no visible
      // nodes beyond depth 0. Show a synthetic collapsed level so the
      // LevelBar can restore expansion.
      const rootExp = effectiveExpanded.get(rootNodeId);
      if (rootExp && !rootExp[dirKey]) {
        const adj = sign > 0 ? adjacency.downstream : adjacency.upstream;
        const neighborCount = (adj.get(rootNodeId) || []).length;
        if (neighborCount > 0) {
          levels.push({
            allExpanded: false,
            depth: sign,
            nodeCount: neighborCount
          });
        }
        return levels;
      }

      const depths = [...depthBuckets.keys()]
        .filter((d) => (sign > 0 ? d > 0 : d < 0))
        .sort((a, b) => (sign > 0 ? a - b : b - a));

      for (const depth of depths) {
        const nodesAtDepth = depthBuckets.get(depth) || [];
        const allExpanded = nodesAtDepth.every((n) => {
          const exp = effectiveExpanded.get(n.id);
          return sign > 0 ? exp?.down : exp?.up;
        });

        // Skip levels where expanding would not reveal any new nodes
        if (!allExpanded) {
          const canRevealMore = nodesAtDepth.some((n) => {
            const adj = sign > 0 ? adjacency.downstream : adjacency.upstream;
            const neighbors = adj.get(n.id) || [];
            // Has cached neighbors not yet visible
            if (neighbors.some((id) => !visibleIds.has(id))) return true;
            // Has uncached neighbors (would trigger a fetch)
            const totalCount =
              sign > 0 ? n.downstreamCount : n.upstreamCount;
            return totalCount > neighbors.length;
          });
          if (!canRevealMore) continue;
        }

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
  }, [visibleTrace, effectiveExpanded, adjacency, rootNodeId]);

  const frontierCounts = useMemo(() => {
    if (!visibleTrace || !graph) return { downstream: 0, upstream: 0 };

    const visibleIds = new Set(visibleTrace.nodes.map((n) => n.id));

    const countForDirection = (levels, sign) => {
      if (levels.length === 0) return 0;
      const deepest = levels[levels.length - 1];
      if (deepest.allExpanded) return 0;

      // Synthetic level from collapsed root — nodes are not in visibleTrace
      const dirKey = sign > 0 ? 'down' : 'up';
      const rootExp = effectiveExpanded.get(rootNodeId);
      if (rootExp && !rootExp[dirKey]) {
        const adj = sign > 0 ? adjacency.downstream : adjacency.upstream;
        return (adj.get(rootNodeId) || []).length;
      }

      const nodesAtDepth = visibleTrace.nodes.filter(
        (n) => n.depth === deepest.depth
      );
      return nodesAtDepth.filter((n) => {
        const adj = sign > 0 ? adjacency.downstream : adjacency.upstream;
        const neighbors = adj.get(n.id) || [];
        if (neighbors.some((id) => !visibleIds.has(id))) return true;
        const totalCount = sign > 0 ? n.downstreamCount : n.upstreamCount;
        return totalCount > neighbors.length;
      }).length;
    };

    return {
      downstream: countForDirection(levelSummary.downstream, 1),
      upstream: countForDirection(levelSummary.upstream, -1)
    };
  }, [visibleTrace, graph, levelSummary, adjacency, effectiveExpanded, rootNodeId]);

  const expandNode = useCallback(
    async (nodeId, direction) => {
      const needsFetch = !isNeighborCached(nodeId, direction);
      if (needsFetch) {
        preserveRef.current = true;
        const node = graph?.nodes.find((n) => n.id === nodeId);
        if (node) {
          await expandFetch(nodeId, node.entityType, node.entityId);
        }
      }

      const dirKey = direction === 'upstream' ? 'up' : 'down';
      setExpandedNodes((prev) => {
        const existing = prev.get(nodeId);
        if (existing?.[dirKey]) return prev;
        const next = new Map(prev);
        next.set(nodeId, {
          ...(existing || { down: false, up: false }),
          [dirKey]: true
        });
        return next;
      });
    },
    [graph, isNeighborCached, expandFetch]
  );

  const collapseNode = useCallback(
    (nodeId, direction) => {
      const dirKey = direction === 'upstream' ? 'up' : 'down';

      // Root: progressively collapse children first, then root itself.
      // This keeps L1 visible so the LevelBar and frontier stay functional.
      if (nodeId === rootNodeId) {
        setExpandedNodes((prev) => {
          const adj =
            dirKey === 'down' ? adjacency.downstream : adjacency.upstream;
          const children = adj.get(nodeId) || [];
          const hasExpandedChild = children.some(
            (childId) => prev.get(childId)?.[dirKey]
          );

          if (hasExpandedChild) {
            const next = new Map(prev);
            for (const childId of children) {
              const existing = next.get(childId);
              if (existing?.[dirKey]) {
                next.set(childId, { ...existing, [dirKey]: false });
              }
            }
            return next;
          }

          const existing = prev.get(nodeId);
          if (existing && !existing[dirKey]) return prev;
          const next = new Map(prev);
          next.set(nodeId, {
            ...(existing || { down: false, up: false }),
            [dirKey]: false
          });
          return next;
        });
        return;
      }

      setExpandedNodes((prev) => {
        const existing = prev.get(nodeId);
        if (existing && !existing[dirKey]) return prev;
        const next = new Map(prev);
        next.set(nodeId, {
          ...(existing || { down: false, up: false }),
          [dirKey]: false
        });
        return next;
      });
    },
    [rootNodeId, adjacency]
  );

  const expandLevel = useCallback(
    async (direction, depth) => {
      if (!visibleTrace) return;
      const dirKey = direction === 'upstream' ? 'up' : 'down';

      const nodesAtDepth = visibleTrace.nodes.filter((n) => n.depth === depth);

      // When root is collapsed the level is synthetic and has no visible
      // nodes. Expand root to restore that direction's first level.
      if (nodesAtDepth.length === 0 && rootNodeId) {
        setExpandedNodes((prev) => {
          const existing = prev.get(rootNodeId);
          if (existing?.[dirKey]) return prev;
          const next = new Map(prev);
          next.set(rootNodeId, {
            ...(existing || { down: false, up: false }),
            [dirKey]: true
          });
          return next;
        });
        return;
      }

      const fetchPromises = [];

      for (const node of nodesAtDepth) {
        if (!isNeighborCached(node.id, direction)) {
          fetchPromises.push(
            expandFetch(node.id, node.entityType, node.entityId)
          );
        }
      }

      if (fetchPromises.length > 0) {
        preserveRef.current = true;
        await Promise.all(fetchPromises);
      }

      setExpandedNodes((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const node of nodesAtDepth) {
          const existing = next.get(node.id);
          if (!existing?.[dirKey]) {
            next.set(node.id, {
              ...(existing || { down: false, up: false }),
              [dirKey]: true
            });
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    },
    [visibleTrace, isNeighborCached, expandFetch, rootNodeId]
  );

  const collapseLevel = useCallback(
    (direction, depth) => {
      if (!graph) return;
      const dirKey = direction === 'upstream' ? 'up' : 'down';

      setExpandedNodes((prev) => {
        let changed = false;
        const next = new Map(prev);
        for (const node of graph.nodes) {
          if (
            (direction === 'downstream' && node.depth >= depth) ||
            (direction === 'upstream' && node.depth <= depth)
          ) {
            const existing = next.get(node.id);
            if (existing?.[dirKey]) {
              next.set(node.id, { ...existing, [dirKey]: false });
              changed = true;
            }
          }
        }
        return changed ? next : prev;
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

  const preserveExpansion = useCallback(() => {
    preserveRef.current = true;
  }, []);

  return {
    clearHighlight,
    collapseLevel,
    collapseNode,
    expandLevel,
    expandNode,
    frontierCounts,
    highlightedDepth,
    highlightLevel,
    levelSummary,
    preserveExpansion,
    visibleTrace
  };
}

function computeInitialExpanded(graph, rootNodeId) {
  const initial = new Map();

  for (const node of graph.nodes) {
    if (node.id === rootNodeId) {
      initial.set(node.id, { down: true, up: true });
    } else if (Math.abs(node.depth) === 0) {
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
