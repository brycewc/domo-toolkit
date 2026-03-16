import dagre from '@dagrejs/dagre';
import { Spinner } from '@heroui/react';
import { IconArrowFork, IconDatabase } from '@tabler/icons-react';
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

import { getObjectType } from '@/models';

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
  },
  ROOT: {
    bg: '#f0fdf4',
    border: '#22c55e',
    icon: '#22c55e',
    text: '#166534'
  }
};

const NODE_ICONS = {
  DATA_SOURCE: IconDatabase,
  DATAFLOW: IconArrowFork
};

function formatNumber(n) {
  if (n == null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const PipelineNode = memo(function PipelineNode({ data, id }) {
  const ctx = useContext(PipelineGraphContext);
  const colors = data.isRoot
    ? NODE_COLORS.ROOT
    : NODE_COLORS[data.entityType] || NODE_COLORS.DATA_SOURCE;
  const Icon = NODE_ICONS[data.entityType] || IconDatabase;
  const meta = data.metadata;
  const hasName = data.label && data.label !== data.entityId;
  const isSelected = ctx?.selectedNodeId === id;

  const nodeUrl = useMemo(() => {
    if (!ctx?.instance) return null;
    const objectType = getObjectType(data.entityType);
    if (!objectType?.hasUrl()) return null;
    const baseUrl = `https://${ctx.instance}.domo.com`;
    return `${baseUrl}${objectType.urlPath.replace('{id}', data.entityId)}`;
  }, [ctx?.instance, data.entityType, data.entityId]);

  let badge = '';
  if (data.entityType === 'DATA_SOURCE' && meta?.rowCount != null) {
    badge = `${formatNumber(meta.rowCount)} rows`;
  }

  const nameContent = hasName ? data.label : data.entityId;
  const nameTitle = hasName
    ? `${data.label} (${data.entityId})`
    : data.entityId;

  return (
    <div
      style={{ borderColor: colors.border }}
      className={`w-[280px] rounded-lg border-2 bg-background px-3 py-2 shadow-sm ${
        isSelected ? 'ring-2 ring-accent' : ''
      } ${data.highlighted ? 'ring-2 ring-yellow-400' : ''}`}
    >
      {data.hasIncoming && (
        <Handle className='size-2' position={Position.Left} type='target' />
      )}

      <div className='flex items-start gap-2'>
        <Icon
          className={`mt-0.5 size-4 shrink-0 ${data.entityType === 'DATAFLOW' ? 'rotate-180' : ''}`}
          style={{ color: colors.border }}
        />
        <div className='min-w-0 flex-1'>
          {nodeUrl ? (
            <a
              className='line-clamp-3 text-sm font-medium wrap-break-word hover:underline'
              href={nodeUrl}
              rel='noopener noreferrer'
              style={{ color: colors.text }}
              target='_blank'
              title={nameTitle}
              onClick={(e) => e.stopPropagation()}
            >
              {nameContent}
            </a>
          ) : (
            <div
              className='line-clamp-3 text-sm font-medium wrap-break-word'
              style={{ color: colors.text }}
              title={nameTitle}
            >
              {nameContent}
            </div>
          )}
          <div className='truncate text-xs text-muted'>
            {hasName ? data.entityId : data.entityType}
          </div>
          {badge && <div className='mt-0.5 text-xs text-muted'>{badge}</div>}
        </div>
      </div>

      {data.hasOutgoing && (
        <Handle className='size-2' position={Position.Right} type='source' />
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
    node.entityType === 'DATA_SOURCE' && node.metadata?.rowCount != null;

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

export function PipelineGraph({
  error,
  expandLoading,
  frontierCounts,
  instance,
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
  rootNodeId,
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
          isRoot: pNode.id === rootNodeId,
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
    if (node.data.isRoot) return NODE_COLORS.ROOT.border;
    return NODE_COLORS[node.data.entityType]?.border || '#94a3b8';
  }, []);

  const reactFlowRef = useRef(null);
  const hasFittedRef = useRef(false);

  const fitViewOptions = useMemo(
    () => ({
      maxZoom: 1,
      nodes: rootNodeId ? [{ id: rootNodeId }] : undefined,
      padding: 0.3
    }),
    [rootNodeId]
  );

  const handleInit = useCallback((instance) => {
    reactFlowRef.current = instance;
  }, []);

  useEffect(() => {
    hasFittedRef.current = false;
  }, [rootNodeId]);

  useEffect(() => {
    if (nodes.length > 0 && reactFlowRef.current && !hasFittedRef.current) {
      hasFittedRef.current = true;
      requestAnimationFrame(() => {
        reactFlowRef.current.fitView(fitViewOptions);
      });
    }
  }, [nodes, fitViewOptions]);

  const graphContext = useMemo(
    () => ({
      expandLoading,
      instance,
      onCollapseNode,
      onExpandNode,
      selectedNodeId
    }),
    [expandLoading, instance, onCollapseNode, onExpandNode, selectedNodeId]
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
    <PipelineGraphContext.Provider value={graphContext}>
      <div className='bg-content2 h-full w-full'>
        <ReactFlow
          edges={edges}
          maxZoom={2}
          minZoom={0.1}
          nodes={nodes}
          elementsSelectable={interactive}
          nodesConnectable={false}
          nodesDraggable={interactive}
          nodeTypes={nodeTypes}
          onEdgesChange={onEdgesChange}
          onInit={handleInit}
          onNodeClick={handleNodeClick}
          onNodesChange={onNodesChange}
        >
          <Background color='#cbd5e1' gap={16} />
          <Controls onInteractiveChange={setInteractive} />
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

    const worker = new Worker(
      new URL('@/utils/layoutWorker.js', import.meta.url),
      { type: 'module' }
    );

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
