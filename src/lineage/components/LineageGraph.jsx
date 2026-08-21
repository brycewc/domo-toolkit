import dagre from '@dagrejs/dagre';
import { Avatar, Spinner, Surface } from '@heroui/react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { createContext, memo, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { InactiveUserOverlay } from '@/components/InactiveUserOverlay';
import { ObjectTypeIcon } from '@/components/ObjectTypeIcon';
import { useTheme } from '@/hooks/useTheme';
import { getInitials } from '@/utils/general';
import IconDatabase from '@icons/database.svg?react';

import { LineageNodeToolbar } from './LineageNodeToolbar';

const DATABASE_TYPE_LABELS = {
  ADRENALINE: 'Adrenaline',
  MAGIC: 'Magic ETL',
  MYSQL: 'MySQL',
  REDSHIFT: 'Redshift'
};

const LineageGraphContext = createContext(null);

function formatDatabaseType(databaseType) {
  if (!databaseType || typeof databaseType !== 'string') return '';
  return DATABASE_TYPE_LABELS[databaseType.toUpperCase()] || databaseType;
}

function formatNumber(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const LineageNode = memo(function LineageNode({ data, id }) {
  const ctx = useContext(LineageGraphContext);
  const meta = data.metadata;
  const hasName = data.label && data.label !== data.entityId;
  const isSelected = ctx?.selectedNodeId === id;
  const nodeUrl = data.object?.url || null;

  let badge = '';
  if (data.entityType === 'DATA_SOURCE') {
    const parts = [];
    if (meta?.rowCount != null) parts.push(`${formatNumber(meta.rowCount)} rows`);
    if (meta?.columnCount != null) parts.push(`${formatNumber(meta.columnCount)} columns`);
    badge = parts.join(' | ');
  }

  const databaseTypeLabel = data.entityType === 'DATAFLOW' ? formatDatabaseType(meta?.databaseType) : '';

  const dataflowBadge = useMemo(() => {
    if (data.entityType !== 'DATAFLOW' || !meta?.lastExecution?.endTime) return null;
    const formatted = new Date(meta.lastExecution.endTime).toLocaleDateString(undefined, {
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      month: 'short'
    });
    return `Last run ${formatted}`;
  }, [data.entityType, meta]);

  const nameContent = hasName ? data.label : data.entityId;
  const nameTitle = hasName ? data.label : `ID: ${data.entityId}`;

  // The type only earns a line when there is no name to identify the node by.
  const metaLine = [hasName ? null : data.entityType, databaseTypeLabel].filter(Boolean).join(' | ');

  const owner = useOwnerDetails(meta?.owner, ctx);

  const stripe = data.isRoot ? 'bg-success' : data.entityType === 'DATAFLOW' ? 'bg-warning' : 'bg-accent';

  return (
    <Surface
      className={`flex w-75 overflow-hidden rounded-2xl shadow-md ${
        data.isRoot ? 'inset-ring-4 inset-ring-success' : ''
      } ${isSelected ? 'ring-2 ring-accent' : ''} ${
        ctx?.highlightedDepth !== null && data.depth === ctx?.highlightedDepth ? 'ring-2 ring-accent' : ''
      }`}
    >
      {data.hasIncoming && <Handle className='size-2' position={Position.Left} type='target' />}

      <div className={`flex w-8 shrink-0 items-center justify-center border-none ${stripe}`}>
        {data.object?.typeId ? (
          <ObjectTypeIcon className='size-5 text-white' typeId={data.object.typeId} />
        ) : (
          <IconDatabase className='size-5 text-white' />
        )}
      </div>

      <div className='flex min-h-20 min-w-0 flex-1 flex-col items-start justify-between gap-2 px-3 py-1.5'>
        {nodeUrl ? (
          <a
            className='line-clamp-3 text-sm font-medium wrap-break-word hover:underline'
            href={nodeUrl}
            rel='noopener noreferrer'
            target='_blank'
            title={nameTitle}
            onClick={(e) => e.stopPropagation()}
          >
            {nameContent}
          </a>
        ) : (
          <div className='line-clamp-3 text-sm font-medium wrap-break-word' title={nameTitle}>
            {nameContent}
          </div>
        )}
        <div className='flex min-w-0 flex-col items-start gap-1'>
          {owner && (
            <div className='flex min-w-0 items-center gap-1.5' title={`Owner: ${owner.name}`}>
              {/* HeroUI's smallest avatar is 32px, which dwarfs a node's 12px
                  detail text, so the size comes from the utility classes here
                  (which win over the component layer) rather than a size prop. */}
              <Avatar className='size-4 shrink-0'>
                {owner.avatarUrl && <Avatar.Image src={owner.avatarUrl} />}
                <Avatar.Fallback className='text-[0.5rem]'>{getInitials(owner.name)}</Avatar.Fallback>
                {owner.isInactive && <InactiveUserOverlay />}
              </Avatar>
              {owner.url ? (
                <a
                  className='truncate text-xs text-muted hover:underline'
                  href={owner.url}
                  rel='noopener noreferrer'
                  target='_blank'
                  onClick={(e) => e.stopPropagation()}
                >
                  {owner.name}
                </a>
              ) : (
                <span className='truncate text-xs text-muted'>{owner.name}</span>
              )}
            </div>
          )}
          {(metaLine || badge || dataflowBadge) && (
            <div className='truncate font-mono text-xs text-muted'>
              {metaLine}
              {badge && <div className='text-xs text-muted'>{badge}</div>}
              {dataflowBadge && <div className='text-xs text-muted'>{dataflowBadge}</div>}
            </div>
          )}
        </div>
      </div>

      {data.hasOutgoing && <Handle className='size-2' position={Position.Right} type='source' />}

      {isSelected && (
        <LineageNodeToolbar
          data={data}
          expandLoading={ctx.expandLoading}
          nodeId={id}
          onCollapseNode={ctx.onCollapseNode}
          onExpandNode={ctx.onExpandNode}
        />
      )}
    </Surface>
  );
});

const NODE_WIDTH = 280;

// Nodes size themselves to their content, so this only has to keep the layout's
// vertical gaps honest: a name (up to three lines), the detail lines, and the
// owner row.
function estimateNodeHeight() {
  return 110;
}

const nodeTypes = { pipeline: LineageNode };

const WORKER_THRESHOLD = 30;
const DAGRE_OPTIONS = {
  marginx: 40,
  marginy: 40,
  rankdir: 'LR',
  ranksep: 80
};

const defaultEdgeOptions = {
  animated: false,
  markerEnd: { color: 'var(--color-muted)', type: MarkerType.ArrowClosed },
  style: { stroke: 'var(--color-muted)', strokeWidth: 2 },
  type: 'default'
};

export function LineageGraph({
  customAvatarIds,
  domoOrigin,
  error,
  expandLoading,
  highlightedDepth,
  inactiveUserIds,
  instanceRef,
  loading,
  onCollapseNode,
  onExpandNode,
  onNodeClick,
  ownerNames,
  rootNodeId,
  selectedNodeId,
  trace
}) {
  const theme = useTheme();
  const layout = useLayout(trace);

  const { initialEdges, initialNodes } = useMemo(() => {
    if (!layout || !trace) {
      return { initialEdges: [], initialNodes: [] };
    }

    const nodes = trace.nodes
      .filter((pNode) => pNode && layout.positions.has(pNode.id))
      .map((pNode) => ({
        data: {
          depth: pNode.depth,
          direction: pNode.direction,
          downstreamComplete: pNode.downstreamComplete,
          downstreamCount: pNode.downstreamCount,
          entityId: pNode.entityId,
          entityType: pNode.entityType,
          expanded: pNode.expanded,
          hasIncoming: layout.nodesWithIncoming.has(pNode.id),
          hasOutgoing: layout.nodesWithOutgoing.has(pNode.id),
          isRoot: pNode.id === rootNodeId,
          label: pNode.name,
          metadata: pNode.metadata,
          object: pNode.object,
          upstreamComplete: pNode.upstreamComplete,
          upstreamCount: pNode.upstreamCount
        },
        id: pNode.id,
        position: layout.positions.get(pNode.id),
        type: 'pipeline'
      }));

    const edges = layout.validEdges.map((e) => ({
      id: `${e.sourceId}->${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      ...defaultEdgeOptions
    }));

    return { initialEdges: edges, initialNodes: nodes };
  }, [layout, trace, rootNodeId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [interactive, setInteractive] = useState(false);

  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes, setNodes]);

  useEffect(() => {
    setEdges(initialEdges);
  }, [initialEdges, setEdges]);

  const handleNodeClick = useCallback(
    (_event, node) => {
      const data = node.data;
      onNodeClick(data.entityType, data.entityId, node.id);
    },
    [onNodeClick]
  );

  const miniMapNodeColor = useCallback((node) => {
    if (node.data.isRoot) return 'var(--color-success)';
    if (node.data.entityType === 'DATAFLOW') return 'var(--color-warning)';
    if (node.data.entityType === 'DATA_SOURCE') return 'var(--color-accent)';
    return 'var(--color-muted)';
  }, []);

  const reactFlowRef = useRef(null);
  // Wraps ReactFlow so we can read the pane's pixel size when computing how far
  // to zoom to fit newly expanded nodes.
  const paneRef = useRef(null);
  // Node ids from the previous layout, used to detect which nodes an expansion
  // added so we can frame just those.
  const prevNodeIdsRef = useRef(null);
  // The root we have already framed.  A brand-new trace (or a new root) frames
  // the root once; later layout changes are treated as expand/collapse.
  const framedRootRef = useRef(null);

  const fitViewOptions = useMemo(
    () => ({
      maxZoom: 1,
      nodes: rootNodeId ? [{ id: rootNodeId }] : undefined,
      padding: 0.3
    }),
    [rootNodeId]
  );

  const handleInit = useCallback(
    (instance) => {
      reactFlowRef.current = instance;
      if (instanceRef) instanceRef.current = instance;
    },
    [instanceRef]
  );

  // Re-frame whenever the layout produces new positions.  Keyed on initialNodes
  // so user drag/selection changes (which only touch `nodes`) do not re-frame.
  //
  // - Initial load or a new root: frame the root.
  // - Expansion (nodes added): fit to just the newly added nodes so the whole
  //   new frontier comes into view, capped at the current zoom so we never zoom
  //   in past where the user was.  Expanding a frontier from the level toolbar
  //   adds nodes without selecting any, so framing the additions (rather than a
  //   node) is what keeps the view on what the user just revealed.
  // - Collapse, or any change that adds nothing: leave the viewport untouched.
  useEffect(() => {
    if (initialNodes.length === 0 || !reactFlowRef.current) return;
    const instance = reactFlowRef.current;
    const currentIds = initialNodes.map((n) => n.id);
    const prevIds = prevNodeIdsRef.current;
    prevNodeIdsRef.current = currentIds;

    const isNewRoot = framedRootRef.current !== rootNodeId;
    framedRootRef.current = rootNodeId;

    if (isNewRoot || !prevIds) {
      requestAnimationFrame(() => instance.fitView(fitViewOptions));
      return;
    }

    const prevSet = new Set(prevIds);
    const addedNodes = initialNodes.filter((n) => !prevSet.has(n.id) && n.position);
    if (addedNodes.length === 0) return;

    // Animate to the newly added nodes so the user can follow what was just
    // revealed.  We drive this with setCenter on the additions' center (rather
    // than fitView, which would need React Flow to have already measured the new
    // nodes), computing a zoom that fits the whole new frontier but never zooms
    // in past where the user already was.
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (const n of addedNodes) {
      left = Math.min(left, n.position.x);
      right = Math.max(right, n.position.x + NODE_WIDTH);
      top = Math.min(top, n.position.y);
      bottom = Math.max(bottom, n.position.y + (n.position.height ?? 90));
    }
    const centerX = (left + right) / 2;
    const centerY = (top + bottom) / 2;

    let zoom = instance.getZoom();
    const pane = paneRef.current;
    if (pane && pane.clientWidth > 0 && pane.clientHeight > 0) {
      const fitZoom = 0.85 * Math.min(pane.clientWidth / (right - left), pane.clientHeight / (bottom - top));
      zoom = Math.min(zoom, fitZoom);
    }

    requestAnimationFrame(() => instance.setCenter(centerX, centerY, { duration: 400, zoom }));
  }, [fitViewOptions, initialNodes, rootNodeId]);

  // The owner lookups ride the context rather than each node's data: they land
  // after the graph is already on screen, and rebuilding the node array would
  // throw away any node the user has dragged or selected.
  const graphContext = useMemo(
    () => ({
      customAvatarIds,
      domoOrigin,
      expandLoading,
      highlightedDepth,
      inactiveUserIds,
      onCollapseNode,
      onExpandNode,
      ownerNames,
      selectedNodeId
    }),
    [
      customAvatarIds,
      domoOrigin,
      expandLoading,
      highlightedDepth,
      inactiveUserIds,
      onCollapseNode,
      onExpandNode,
      ownerNames,
      selectedNodeId
    ]
  );

  if (loading) {
    return (
      <div className='flex h-full items-center justify-center gap-2 text-muted'>
        <Spinner size='md' />
        <span>Loading pipeline trace...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex h-full items-center justify-center text-danger'>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!trace || trace.nodes.length === 0) {
    return (
      <div className='flex h-full items-center justify-center text-muted'>
        <p>No lineage data available</p>
      </div>
    );
  }

  return (
    <LineageGraphContext.Provider value={graphContext}>
      <div className='h-full w-full' ref={paneRef}>
        <ReactFlow
          colorMode={theme}
          edges={edges}
          elementsSelectable={interactive}
          maxZoom={2}
          minZoom={0.1}
          nodes={nodes}
          nodesConnectable={false}
          nodesDraggable={interactive}
          nodeTypes={nodeTypes}
          onEdgesChange={onEdgesChange}
          onInit={handleInit}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
        >
          <Background gap={32} lineWidth={1.5} variant='cross' />
          <Controls onInteractiveChange={setInteractive} />
          <MiniMap pannable zoomable nodeColor={miniMapNodeColor} />
        </ReactFlow>
      </div>
    </LineageGraphContext.Provider>
  );
}

function computeLayoutSync(traceNodes, validEdges) {
  const g = new dagre.graphlib.Graph();
  g.setGraph(DAGRE_OPTIONS);
  g.setDefaultEdgeLabel(() => ({}));

  for (const pNode of traceNodes) {
    if (!pNode) continue;
    g.setNode(pNode.id, {
      height: estimateNodeHeight(pNode),
      width: NODE_WIDTH
    });
  }

  for (const edge of validEdges) {
    g.setEdge(edge.sourceId, edge.targetId);
  }

  dagre.layout(g);

  const positions = new Map();
  for (const pNode of traceNodes) {
    if (!pNode) continue;
    const info = g.node(pNode.id);
    if (info) {
      positions.set(pNode.id, {
        height: info.height,
        x: info.x - NODE_WIDTH / 2,
        y: info.y - info.height / 2
      });
    }
  }

  return positions;
}

function useLayout(trace) {
  const [layout, setLayout] = useState(null);
  const workerRef = useRef(null);

  useEffect(() => {
    if (!trace || !Array.isArray(trace.nodes)) {
      setLayout(null);
      return;
    }

    const nodeSet = new Set(trace.nodes.map((n) => n.id));
    const validEdges = (trace.edges || []).filter((e) => nodeSet.has(e.sourceId) && nodeSet.has(e.targetId));
    const nodesWithIncoming = new Set(validEdges.map((e) => e.targetId));
    const nodesWithOutgoing = new Set(validEdges.map((e) => e.sourceId));

    if (trace.nodes.length < WORKER_THRESHOLD) {
      const positions = computeLayoutSync(trace.nodes, validEdges);
      setLayout({
        nodesWithIncoming,
        nodesWithOutgoing,
        positions,
        validEdges
      });
      return;
    }

    const workerNodes = trace.nodes.filter(Boolean).map((n) => ({
      height: estimateNodeHeight(n),
      id: n.id,
      width: NODE_WIDTH
    }));

    const workerEdges = validEdges.map((e) => ({
      source: e.sourceId,
      target: e.targetId
    }));

    const worker = new Worker(new URL('../services/layoutWorker.js', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = ({ data: { positions: rawPositions } }) => {
      const positions = new Map(Object.entries(rawPositions));
      setLayout({
        nodesWithIncoming,
        nodesWithOutgoing,
        positions,
        validEdges
      });
      worker.terminate();
    };

    worker.postMessage({
      edges: workerEdges,
      nodes: workerNodes,
      options: DAGRE_OPTIONS
    });

    workerRef.current = worker;

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  }, [trace]);

  return layout;
}

/**
 * Everything a node needs to draw its owner, or null when there is nothing worth
 * showing. A dataflow arrives with only an owner id, so the row stays hidden
 * until the resolved name lands rather than flashing a bare id at the user.
 * @param {{ id: number|string, name: string|null, type: string }|null|undefined} owner - The node's owner, as enriched onto its metadata
 * @param {Object|null} ctx - The graph context, holding the resolved owner lookups
 * @returns {{ avatarUrl: string|null, isInactive: boolean, name: string, url: string|null }|null}
 */
function useOwnerDetails(owner, ctx) {
  const { customAvatarIds, domoOrigin, inactiveUserIds, ownerNames } = ctx ?? {};

  return useMemo(() => {
    const id = owner?.id != null ? String(owner.id) : null;
    if (!id) return null;

    const name = owner.name || ownerNames?.[id];
    if (!name) return null;

    const isGroup = owner.type === 'GROUP';
    // Domo serves one identical grey placeholder to every user without a photo,
    // so only a real picture is worth rendering and everyone else falls back to
    // initials. A group always shows Domo's own avatar, which is a group glyph
    // when the group has no logo of its own.
    const hasPicture = isGroup || Boolean(customAvatarIds?.has(id));

    return {
      avatarUrl:
        domoOrigin && hasPicture ? `${domoOrigin}/api/content/v1/avatar/${isGroup ? 'GROUP' : 'USER'}/${id}?size=100` : null,
      isInactive: !isGroup && Boolean(inactiveUserIds?.has(id)),
      name,
      url: domoOrigin
        ? `${domoOrigin}${isGroup ? `/admin/groups/${id}?tab=people` : `/admin/people/${id}?tab=profile`}`
        : null
    };
  }, [customAvatarIds, domoOrigin, inactiveUserIds, owner, ownerNames]);
}
