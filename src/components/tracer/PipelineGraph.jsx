import { useMemo, useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  MarkerType,
  Handle,
  Position
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  IconDatabase,
  IconArrowsSplit,
  IconChartBar,
  IconLoader2
} from '@tabler/icons-react';

const NODE_COLORS = {
  DATA_SOURCE: { bg: '#dbeafe', border: '#3b82f6', text: '#1e40af' },
  DATAFLOW: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
  CARD: { bg: '#d1fae5', border: '#10b981', text: '#065f46' }
};

const NODE_ICONS = {
  DATA_SOURCE: IconDatabase,
  DATAFLOW: IconArrowsSplit,
  CARD: IconChartBar
};

function formatNumber(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function PipelineNode({ data }) {
  const colors = NODE_COLORS[data.entityType] || NODE_COLORS.DATA_SOURCE;
  const Icon = NODE_ICONS[data.entityType] || IconDatabase;
  const meta = data.metadata;

  let badge = '';
  if (data.entityType === 'DATA_SOURCE' && meta?.rowCount != null) {
    badge = `${formatNumber(meta.rowCount)} rows`;
  } else if (data.entityType === 'DATAFLOW' && meta?.tileCount != null) {
    badge = `${meta.tileCount} tiles`;
  }

  return (
    <div
      className={`px-3 py-2 rounded-lg border-2 bg-white shadow-sm min-w-[200px] ${
        data.selected ? 'ring-2 ring-blue-400' : ''
      } ${data.highlighted ? 'ring-2 ring-yellow-400' : ''}`}
      style={{ borderColor: colors.border }}
    >
      {data.hasIncoming && (
        <Handle type="target" position={Position.Left} className="w-2 h-2" />
      )}
      
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 shrink-0" style={{ color: colors.border }} />
        <div className="flex-1 min-w-0">
          <div
            className="font-medium text-sm truncate"
            style={{ color: colors.text }}
            title={data.label}
          >
            {data.label}
          </div>
          {badge && (
            <div className="text-xs text-slate-500 mt-0.5">{badge}</div>
          )}
        </div>
      </div>
      
      {data.hasOutgoing && (
        <Handle type="source" position={Position.Right} className="w-2 h-2" />
      )}
    </div>
  );
}

const nodeTypes = { pipeline: PipelineNode };

const defaultEdgeOptions = {
  type: 'default',
  animated: false,
  style: { stroke: '#94a3b8', strokeWidth: 2 },
  markerEnd: { type: MarkerType.ArrowClosed, color: '#94a3b8' }
};

/**
 * React Flow graph visualization for pipeline lineage
 * @param {Object} props
 * @param {Object} props.trace - Pipeline trace with nodes and edges
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 * @param {string} props.selectedNodeId - Currently selected node ID
 * @param {Function} props.onNodeClick - Node click handler (entityType, entityId, nodeId)
 */
export function PipelineGraph({
  trace,
  loading,
  error,
  selectedNodeId,
  onNodeClick
}) {
  const { initialNodes, initialEdges } = useMemo(() => {
    if (!trace) return { initialNodes: [], initialEdges: [] };

    const depthGroups = new Map();
    for (const node of trace.nodes) {
      const group = depthGroups.get(node.depth) || [];
      group.push(node);
      depthGroups.set(node.depth, group);
    }

    const sortedDepths = Array.from(depthGroups.keys()).sort((a, b) => a - b);

    const nodes = [];
    for (const depth of sortedDepths) {
      const group = depthGroups.get(depth);
      const depthIndex = sortedDepths.indexOf(depth);
      const x = depthIndex * 300;

      group.forEach((pNode, i) => {
        const y = i * 100;
        const isSelected = selectedNodeId === pNode.id;

        nodes.push({
          id: pNode.id,
          type: 'pipeline',
          position: { x, y },
          data: {
            label: pNode.name,
            entityType: pNode.entityType,
            entityId: pNode.entityId,
            selected: isSelected,
            metadata: pNode.metadata
          }
        });
      });
    }

    const edges = trace.edges.map((e) => ({
      id: `${e.sourceId}->${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      ...defaultEdgeOptions
    }));

    const nodesWithIncoming = new Set(edges.map((e) => e.target));
    const nodesWithOutgoing = new Set(edges.map((e) => e.source));
    for (const node of nodes) {
      node.data.hasIncoming = nodesWithIncoming.has(node.id);
      node.data.hasOutgoing = nodesWithOutgoing.has(node.id);
    }

    return { initialNodes: nodes, initialEdges: edges };
  }, [trace, selectedNodeId]);

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
      <div className="flex items-center justify-center h-full text-slate-400">
        <IconLoader2 className="w-6 h-6 animate-spin mr-2" />
        <span>Loading pipeline trace...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full text-red-500">
        <p>Error: {error}</p>
      </div>
    );
  }

  if (!trace || trace.nodes.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <p>No lineage data available</p>
      </div>
    );
  }

  return (
    <div className="h-full w-full bg-slate-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background color="#cbd5e1" gap={16} />
        <Controls />
        <MiniMap nodeColor={miniMapNodeColor} zoomable pannable />
      </ReactFlow>
    </div>
  );
}
