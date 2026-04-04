import dagre from '@dagrejs/dagre';
import { Spinner, Surface } from '@heroui/react';
import {
  IconArrowFork,
  IconDatabase,
  IconInfoCircle
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

import { useTheme } from '@/hooks';

import { PipelineNodeToolbar } from './PipelineNodeToolbar';

const PipelineGraphContext = createContext(null);

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
  const Icon = NODE_ICONS[data.entityType] || IconDatabase;
  const meta = data.metadata;
  const hasName = data.label && data.label !== data.entityId;
  const isSelected = ctx?.selectedNodeId === id;

  const nodeUrl = useMemo(() => {
    if (!ctx?.instance) return null;
    const base = `https://${ctx.instance}.domo.com`;
    if (data.entityType === 'DATA_SOURCE')
      return `${base}/datasources/${data.entityId}/details/overview`;
    if (data.entityType === 'DATAFLOW')
      return `${base}/datacenter/dataflows/${data.entityId}/details`;
    return null;
  }, [ctx?.instance, data.entityType, data.entityId]);

  let badge = '';
  if (data.entityType === 'DATA_SOURCE') {
    const parts = [];
    if (meta?.rowCount != null)
      parts.push(`${formatNumber(meta.rowCount)} rows`);
    if (meta?.columnCount != null)
      parts.push(`${formatNumber(meta.columnCount)} columns`);
    badge = parts.join(' | ');
  }

  const dataflowBadge = useMemo(() => {
    if (data.entityType !== 'DATAFLOW' || !meta?.lastExecution?.endTime)
      return null;
    const formatted = new Date(meta.lastExecution.endTime).toLocaleDateString(
      undefined,
      {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'short'
      }
    );
    return `Last run ${formatted}`;
  }, [data.entityType, meta]);

  const nameContent = hasName ? data.label : data.entityId;
  const nameTitle = hasName
    ? `${data.label} (ID: ${data.entityId})`
    : `ID: ${data.entityId}`;

  const stripe = data.isRoot
    ? 'bg-success'
    : data.entityType === 'DATAFLOW'
      ? 'bg-warning'
      : 'bg-accent';

  return (
    <Surface
      className={`flex w-75 overflow-hidden rounded-2xl shadow-md ${
        data.isRoot ? 'inset-ring-4 inset-ring-success' : ''
      } ${isSelected ? 'ring-2 ring-accent' : ''} ${
        ctx?.highlightedDepth !== null && data.depth === ctx?.highlightedDepth
          ? 'ring-2 ring-accent'
          : ''
      }`}
    >
      {data.hasIncoming && (
        <Handle className='size-2' position={Position.Left} type='target' />
      )}

      <div
        className={`flex w-8 shrink-0 items-center justify-center border-none ${stripe}`}
      >
        <Icon
          className={`size-5 text-white ${data.entityType === 'DATAFLOW' ? 'rotate-180' : ''}`}
        />
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
          <div
            className='line-clamp-3 text-sm font-medium wrap-break-word'
            title={nameTitle}
          >
            {nameContent}
          </div>
        )}
        <div className='truncate font-mono text-xs text-muted'>
          {hasName ? data.entityId : data.entityType}
          {badge && <div className='text-xs text-muted'>{badge}</div>}
          {dataflowBadge && (
            <div className='text-xs text-muted'>{dataflowBadge}</div>
          )}
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
    </Surface>
  );
});

const NODE_WIDTH = 280;

function estimateNodeHeight() {
  return 90;
}

const nodeTypes = { pipeline: PipelineNode };

const WORKER_THRESHOLD = 30;
const DAGRE_OPTIONS = { marginx: 40, marginy: 40, rankdir: 'LR', ranksep: 80 };

const defaultEdgeOptions = {
  animated: false,
  markerEnd: { color: 'var(--color-muted)', type: MarkerType.ArrowClosed },
  style: { stroke: 'var(--color-muted)', strokeWidth: 2 },
  type: 'default'
};

export function PipelineGraph({
  error,
  expandLoading,
  highlightedDepth,
  instance,
  instanceRef,
  loading,
  onCollapseNode,
  onExpandNode,
  onNodeClick,
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
          downstreamCount: pNode.downstreamCount,
          entityId: pNode.entityId,
          entityType: pNode.entityType,
          expanded: pNode.expanded,
          hasIncoming: layout.nodesWithIncoming.has(pNode.id),
          hasOutgoing: layout.nodesWithOutgoing.has(pNode.id),
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
    if (node.data.isRoot) return 'var(--color-success)';
    if (node.data.entityType === 'DATAFLOW') return 'var(--color-warning)';
    if (node.data.entityType === 'DATA_SOURCE') return 'var(--color-accent)';
    return 'var(--color-muted)';
  }, []);

  const reactFlowRef = useRef(null);

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

  // Re-fit whenever the layout produces new positions (collapse, expand,
  // or initial load).  Keyed on initialNodes so user drag/selection
  // changes (which only touch `nodes`) do not trigger a re-fit.
  useEffect(() => {
    if (initialNodes.length > 0 && reactFlowRef.current) {
      requestAnimationFrame(() => {
        reactFlowRef.current.fitView(fitViewOptions);
      });
    }
  }, [initialNodes, fitViewOptions]);

  const graphContext = useMemo(
    () => ({
      expandLoading,
      highlightedDepth,
      instance,
      onCollapseNode,
      onExpandNode,
      selectedNodeId
    }),
    [
      expandLoading,
      highlightedDepth,
      instance,
      onCollapseNode,
      onExpandNode,
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
    <PipelineGraphContext.Provider value={graphContext}>
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
        <Panel position='bottom-center'>
          <div className='flex w-50 items-center justify-around gap-2 rounded-lg bg-transparent px-2 py-1 text-xs backdrop-blur-sm select-none'>
            <div className='items-center' title='legend'>
              <IconInfoCircle className='size-4' />
            </div>
            <div className='flex items-center gap-1.5 rounded bg-success px-2 py-1 text-white'>
              <span>Root</span>
            </div>
            <div className='flex items-center gap-1.5 rounded bg-accent px-2 py-1 text-white'>
              <IconDatabase className='size-4' />
              <span>DataSet</span>
            </div>
            <div className='flex items-center gap-1.5 rounded bg-warning px-2 py-1 text-white'>
              <IconArrowFork className='size-4 rotate-180' />
              <span>DataFlow</span>
            </div>
          </div>
        </Panel>
        <MiniMap pannable zoomable nodeColor={miniMapNodeColor} />
      </ReactFlow>
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
