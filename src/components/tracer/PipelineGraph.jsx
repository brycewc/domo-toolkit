import dagre from '@dagrejs/dagre';
import {
  IconArrowsSplit,
  IconChartBar,
  IconDatabase,
  IconLoader2
} from '@tabler/icons-react';
import {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Panel,
  Position,
  ReactFlow,
  useEdgesState,
  useNodesState
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useEffect, useMemo } from 'react';

import { LevelBar } from './LevelBar';
import { PipelineNodeToolbar } from './PipelineNodeToolbar';

const NODE_COLORS = {
  CARD: { bg: '#f0fdf4', border: '#22c55e', icon: '#22c55e', text: '#166534' },
  DATA_SOURCE: {
    bg: '#f8fafc',
    border: '#3b82f6',
    icon: '#3b82f6',
    text: '#1e40af'
  },
  DATAFLOW: {
    bg: '#fefce8',
    border: '#eab308',
    icon: '#eab308',
    text: '#854d0e'
  }
};

const NODE_ICONS = {
  CARD: IconChartBar,
  DATA_SOURCE: IconDatabase,
  DATAFLOW: IconArrowsSplit
};

function formatNumber(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PipelineNode({ data, id }) {
  const colors = NODE_COLORS[data.entityType] || NODE_COLORS.DATA_SOURCE;
  const Icon = NODE_ICONS[data.entityType] || IconDatabase;
  const meta = data.metadata;
  const hasName = data.label && data.label !== data.entityId;

  let badge = '';
  if (data.entityType === 'DATA_SOURCE' && meta?.rowCount != null) {
    badge = `${formatNumber(meta.rowCount)} rows`;
  } else if (data.entityType === 'DATAFLOW' && meta?.tileCount != null) {
    badge = `${meta.tileCount} tiles`;
  }

  return (
    <div
      style={{ borderColor: colors.border }}
      className={`min-w-[200px] rounded-lg border-2 bg-white px-3 py-2 shadow-sm ${
        data.selected ? 'ring-2 ring-blue-400' : ''
      } ${data.highlighted ? 'ring-2 ring-yellow-400' : ''}`}
    >
      {data.hasIncoming && (
        <Handle className='h-2 w-2' position={Position.Left} type='target' />
      )}

      <div className='flex items-center gap-2'>
        <Icon className='h-4 w-4 shrink-0' style={{ color: colors.border }} />
        <div className='min-w-0 flex-1'>
          <div
            className='truncate text-sm font-medium'
            style={{ color: colors.text }}
            title={hasName ? `${data.label} (${data.entityId})` : data.entityId}
          >
            {hasName ? data.label : data.entityId}
          </div>
          <div className='truncate text-xs text-slate-400'>
            {hasName ? data.entityId : data.entityType}
          </div>
          {badge && (
            <div className='mt-0.5 text-xs text-slate-500'>{badge}</div>
          )}
        </div>
      </div>

      {data.hasOutgoing && (
        <Handle className='h-2 w-2' position={Position.Right} type='source' />
      )}

      {data.selected && (
        <PipelineNodeToolbar
          data={data}
          expandLoading={data.expandLoading}
          nodeId={id}
          onCollapseNode={data.onCollapseNode}
          onExpandNode={data.onExpandNode}
        />
      )}
    </div>
  );
}

const NODE_WIDTH = 280;
const NODE_HEIGHT = 70;

const nodeTypes = { pipeline: PipelineNode };

const defaultEdgeOptions = {
  animated: false,
  markerEnd: { color: '#94a3b8', type: MarkerType.ArrowClosed },
  style: { stroke: '#94a3b8', strokeWidth: 2 },
  type: 'default'
};

export function PipelineGraph({
  downstreamFrontierCount,
  error,
  expandLoading,
  levelSummary,
  loading,
  onClearHighlight,
  onCollapseLevel,
  onCollapseNode,
  onExpandLevel,
  onExpandNode,
  onHighlightLevel,
  onNodeClick,
  onRootClick,
  selectedNodeId,
  trace,
  upstreamFrontierCount
}) {
  const { initialEdges, initialNodes } = useMemo(() => {
    if (!trace || !Array.isArray(trace.nodes)) {
      return { initialEdges: [], initialNodes: [] };
    }

    const g = new dagre.graphlib.Graph();
    g.setGraph({ marginx: 40, marginy: 40, rankdir: 'LR', ranksep: 80 });
    g.setDefaultEdgeLabel(() => ({}));

    const nodeSet = new Set(trace.nodes.map((n) => n.id));

    for (const pNode of trace.nodes) {
      if (!pNode) continue;
      g.setNode(pNode.id, { height: NODE_HEIGHT, width: NODE_WIDTH });
    }

    const validEdges = (trace.edges || []).filter(
      (e) => nodeSet.has(e.sourceId) && nodeSet.has(e.targetId)
    );
    for (const edge of validEdges) {
      g.setEdge(edge.sourceId, edge.targetId);
    }

    dagre.layout(g);

    const nodesWithIncoming = new Set(validEdges.map((e) => e.targetId));
    const nodesWithOutgoing = new Set(validEdges.map((e) => e.sourceId));

    const nodes = trace.nodes
      .filter((pNode) => pNode && g.node(pNode.id))
      .map((pNode) => {
        const { x, y } = g.node(pNode.id);
        return {
          data: {
            direction: pNode.direction,
            downstreamCount: pNode.downstreamCount,
            entityId: pNode.entityId,
            entityType: pNode.entityType,
            expandLoading,
            expanded: pNode.expanded,
            hasIncoming: nodesWithIncoming.has(pNode.id),
            hasOutgoing: nodesWithOutgoing.has(pNode.id),
            highlighted: pNode.highlighted,
            label: pNode.name,
            metadata: pNode.metadata,
            onCollapseNode,
            onExpandNode,
            selected: selectedNodeId === pNode.id,
            upstreamCount: pNode.upstreamCount
          },
          id: pNode.id,
          position: { x: x - NODE_WIDTH / 2, y: y - NODE_HEIGHT / 2 },
          type: 'pipeline'
        };
      });

    const edges = validEdges.map((e) => ({
      id: `${e.sourceId}->${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      ...defaultEdgeOptions
    }));

    return { initialEdges: edges, initialNodes: nodes };
  }, [trace, selectedNodeId, expandLoading, onExpandNode, onCollapseNode]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

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
    const data = node.data;
    return NODE_COLORS[data.entityType]?.border || '#94a3b8';
  }, []);

  if (loading) {
    return (
      <div className='flex h-full items-center justify-center text-slate-400'>
        <IconLoader2 className='mr-2 h-6 w-6 animate-spin' />
        <span>Loading pipeline trace...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className='flex h-full items-center justify-center text-red-500'>
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!trace || trace.nodes.length === 0) {
    return (
      <div className='flex h-full items-center justify-center text-slate-400'>
        <p>No lineage data available</p>
      </div>
    );
  }

  return (
    <div className='h-full w-full bg-slate-50'>
      <ReactFlow
        fitView
        edges={edges}
        maxZoom={2}
        minZoom={0.1}
        nodes={nodes}
        nodeTypes={nodeTypes}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        onNodesChange={onNodesChange}
      >
        <Background color='#cbd5e1' gap={16} />
        <Controls />
        <MiniMap pannable zoomable nodeColor={miniMapNodeColor} />
        {levelSummary && (
          <Panel position='top-center'>
            <LevelBar
              downstreamLevels={levelSummary.downstream}
              frontierCounts={{
                downstream: downstreamFrontierCount || 0,
                upstream: upstreamFrontierCount || 0
              }}
              upstreamLevels={levelSummary.upstream}
              onClearHighlight={onClearHighlight}
              onCollapseLevel={onCollapseLevel}
              onExpandLevel={onExpandLevel}
              onHighlightLevel={onHighlightLevel}
              onRootClick={onRootClick}
            />
          </Panel>
        )}
      </ReactFlow>
    </div>
  );
}
