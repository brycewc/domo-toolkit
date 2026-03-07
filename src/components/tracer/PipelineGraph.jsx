import dagre from '@dagrejs/dagre';
import {
  IconArrowsSplit,
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
import {
  createContext,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react';

import { LevelBar } from './LevelBar';
import { PipelineNodeToolbar } from './PipelineNodeToolbar';

const PipelineGraphContext = createContext(null);

const NODE_COLORS = {
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
  DATA_SOURCE: IconDatabase,
  DATAFLOW: IconArrowsSplit
};

function formatNumber(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PipelineNode = memo(function PipelineNode({ data, id }) {
  const ctx = useContext(PipelineGraphContext);
  const colors = NODE_COLORS[data.entityType] || NODE_COLORS.DATA_SOURCE;
  const Icon = NODE_ICONS[data.entityType] || IconDatabase;
  const meta = data.metadata;
  const hasName = data.label && data.label !== data.entityId;
  const isSelected = ctx?.selectedNodeId === id;

  let badge = '';
  if (data.entityType === 'DATA_SOURCE' && meta?.rowCount != null) {
    badge = `${formatNumber(meta.rowCount)} rows`;
  } else if (data.entityType === 'DATAFLOW' && meta?.tileCount != null) {
    badge = `${meta.tileCount} tiles`;
  }

  return (
    <div
      style={{ borderColor: colors.border }}
      className={`w-[280px] rounded-lg border-2 bg-white px-3 py-2 shadow-sm ${
        isSelected ? 'ring-2 ring-blue-400' : ''
      } ${data.highlighted ? 'ring-2 ring-yellow-400' : ''}`}
    >
      {data.hasIncoming && (
        <Handle className='h-2 w-2' position={Position.Left} type='target' />
      )}

      <div className='flex items-start gap-2'>
        <Icon
          className='mt-0.5 h-4 w-4 shrink-0'
          style={{ color: colors.border }}
        />
        <div className='min-w-0 flex-1'>
          <div
            className='line-clamp-3 text-sm font-medium wrap-break-word'
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

      {isSelected && (
        <PipelineNodeToolbar
          data={data}
          expandLoading={ctx.expandLoading}
          nodeId={id}
          onCollapseNode={ctx.onCollapseNode}
          onExpandNode={ctx.onExpandNode}
        />
      )}
    </div>
  );
});

const NODE_WIDTH = 280;
const CHARS_PER_LINE = 25;

function estimateNodeHeight(node) {
  const name = node.name || node.entityId || '';
  const hasBadge =
    (node.entityType === 'DATA_SOURCE' && node.metadata?.rowCount != null) ||
    (node.entityType === 'DATAFLOW' && node.metadata?.tileCount != null);

  const nameLines = Math.min(
    3,
    Math.max(1, Math.ceil(name.length / CHARS_PER_LINE))
  );

  return 16 + nameLines * 20 + 16 + (hasBadge ? 18 : 0);
}

const nodeTypes = { pipeline: PipelineNode };

const WORKER_THRESHOLD = 30;
const DAGRE_OPTIONS = { marginx: 40, marginy: 40, rankdir: 'LR', ranksep: 80 };

const defaultEdgeOptions = {
  animated: false,
  markerEnd: { color: '#94a3b8', type: MarkerType.ArrowClosed },
  style: { stroke: '#94a3b8', strokeWidth: 2 },
  type: 'default'
};

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
    const validEdges = (trace.edges || []).filter(
      (e) => nodeSet.has(e.sourceId) && nodeSet.has(e.targetId)
    );
    const nodesWithIncoming = new Set(validEdges.map((e) => e.targetId));
    const nodesWithOutgoing = new Set(validEdges.map((e) => e.sourceId));

    if (trace.nodes.length < WORKER_THRESHOLD) {
      const positions = computeLayoutSync(trace.nodes, validEdges);
      setLayout({ nodesWithIncoming, nodesWithOutgoing, positions, validEdges });
      return;
    }

    const workerNodes = trace.nodes
      .filter(Boolean)
      .map((n) => ({
        height: estimateNodeHeight(n),
        id: n.id,
        width: NODE_WIDTH
      }));

    const workerEdges = validEdges.map((e) => ({
      source: e.sourceId,
      target: e.targetId
    }));

    const worker = new Worker(
      new URL('@/utils/layoutWorker.js', import.meta.url),
      { type: 'module' }
    );

    worker.onmessage = ({ data: { positions: rawPositions } }) => {
      const positions = new Map(Object.entries(rawPositions));
      setLayout({ nodesWithIncoming, nodesWithOutgoing, positions, validEdges });
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

export function PipelineGraph({
  error,
  expandLoading,
  frontierCounts,
  levelSummary,
  loading,
  onClearHighlight,
  onCollapseLevel,
  onCollapseNode,
  onExpandFrontier,
  onExpandLevel,
  onExpandNode,
  onHighlightLevel,
  onNodeClick,
  onRootClick,
  selectedNodeId,
  trace
}) {
  const layout = useLayout(trace);

  const { initialEdges, initialNodes } = useMemo(() => {
    if (!layout || !trace) {
      return { initialEdges: [], initialNodes: [] };
    }

    const nodes = trace.nodes
      .filter((pNode) => pNode && layout.positions.has(pNode.id))
      .map((pNode) => ({
        data: {
          direction: pNode.direction,
          downstreamCount: pNode.downstreamCount,
          entityId: pNode.entityId,
          entityType: pNode.entityType,
          expanded: pNode.expanded,
          hasIncoming: layout.nodesWithIncoming.has(pNode.id),
          hasOutgoing: layout.nodesWithOutgoing.has(pNode.id),
          highlighted: pNode.highlighted,
          label: pNode.name,
          metadata: pNode.metadata,
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
  }, [layout, trace]);

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

  const graphContext = useMemo(
    () => ({ expandLoading, onCollapseNode, onExpandNode, selectedNodeId }),
    [expandLoading, onCollapseNode, onExpandNode, selectedNodeId]
  );

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
    <PipelineGraphContext.Provider value={graphContext}>
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
                frontierCounts={frontierCounts}
                upstreamLevels={levelSummary.upstream}
                onClearHighlight={onClearHighlight}
                onCollapseLevel={onCollapseLevel}
                onExpandFrontier={onExpandFrontier}
                onExpandLevel={onExpandLevel}
                onHighlightLevel={onHighlightLevel}
                onRootClick={onRootClick}
              />
            </Panel>
          )}
        </ReactFlow>
      </div>
    </PipelineGraphContext.Provider>
  );
}
