// ============================================
// Flow Component
// ============================================
// Main React Flow canvas with Dagre layout, dark mode,
// and node interaction handling

import { html } from 'htm/react';
import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import {
    ReactFlow,
    Background,
    Controls,
    MiniMap,
    Panel,
    useNodesState,
    useEdgesState,
    useReactFlow
} from '@xyflow/react';

import { DatasetNode } from './DatasetNode.js';
import { ExpansionModal } from './ExpansionModal.js';
import { ConfirmationModal } from './ConfirmationModal.js';
import { NodeSearch } from './NodeSearch.js';
import { LevelBar } from './LevelBar.js';
import { GraphState, DIRECTION, LARGE_NEIGHBOR_THRESHOLD, LARGE_EXPAND_WARNING_THRESHOLD } from '../state.js';
import { layoutGraph } from '../utils/layout.js';
import { nodeExists } from '../../data.js';

// ============================================
// Empty State Component
// ============================================

function EmptyState() {
    return html`
        <div className="empty-state">
            <svg className="empty-state-icon" viewBox="0 0 100 100" fill="currentColor">
                <path d="M50 10 L90 30 L90 70 L50 90 L10 70 L10 30 Z" 
                    fill="none" stroke="currentColor" strokeWidth="2"/>
                <circle cx="50" cy="50" r="8" />
                <circle cx="25" cy="35" r="5" />
                <circle cx="75" cy="35" r="5" />
                <circle cx="25" cy="65" r="5" />
                <circle cx="75" cy="65" r="5" />
                <line x1="50" y1="50" x2="25" y2="35" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="50" y1="50" x2="75" y2="35" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="50" y1="50" x2="25" y2="65" stroke="currentColor" strokeWidth="1.5"/>
                <line x1="50" y1="50" x2="75" y2="65" stroke="currentColor" strokeWidth="1.5"/>
            </svg>
            <h2>No Dataset Selected</h2>
            <p>Enter a Dataset ID above to explore its lineage</p>
        </div>
    `;
}

// ============================================
// Flow Canvas Component
// ============================================

function FlowCanvas({ graphState, onToast, onSelectionChange, focusNodeId }) {
    const { fitView, getViewport } = useReactFlow();
    const [nodes, setNodes, onNodesChange] = useNodesState([]);
    const [edges, setEdges, onEdgesChange] = useEdgesState([]);
    
    // Modal state
    const [modalOpen, setModalOpen] = useState(false);
    const [modalDirection, setModalDirection] = useState(null);
    const [modalNeighbors, setModalNeighbors] = useState([]);
    const [modalNodeId, setModalNodeId] = useState(null);
    
    // Confirmation modal state
    const [confirmModalOpen, setConfirmModalOpen] = useState(false);
    const [confirmModalMessage, setConfirmModalMessage] = useState('');
    const [pendingExpandAction, setPendingExpandAction] = useState(null);
    
    // Track selected node
    const [selectedNodeId, setSelectedNodeId] = useState(null);
    
    // Initialize graph state with setters
    const graphStateRef = useRef(null);
    
    useEffect(() => {
        graphStateRef.current = new GraphState(setNodes, setEdges);
        // Expose graphState methods to parent
        if (graphState) {
            graphState.current = graphStateRef.current;
        }
    }, [setNodes, setEdges, graphState]);
    
    // Apply Dagre layout to current graph state
    // If focusNodeIds provided, fit view to those nodes; otherwise fit to all
    const applyLayout = useCallback((focusNodeIds = null) => {
        const gs = graphStateRef.current;
        if (!gs) return;

        const currentNodes = gs.getNodes();
        const currentEdges = gs.getEdges();

        if (currentNodes.length === 0) return;

        const { nodes: layoutedNodes, edges: layoutedEdges } = layoutGraph(
            currentNodes,
            currentEdges,
            { direction: 'LR' }
        );

        // Update the graph state with layouted positions
        gs.nodes = layoutedNodes;
        gs.edges = layoutedEdges;
        gs._updateState();

        // Fit view after layout with small delay
        setTimeout(() => {
            if (focusNodeIds && focusNodeIds.length > 0) {
                // Fit to specific nodes (the newly expanded ones)
                fitView({
                    padding: 0.3,
                    duration: 500,
                    nodes: layoutedNodes.filter(n => focusNodeIds.includes(n.id))
                });
            } else {
                // Fit to all nodes
                fitView({ padding: 0.2, duration: 500 });
            }
        }, 50);
    }, [fitView]);

    // Always fit to root node when focusNodeId changes
    useEffect(() => {
        if (focusNodeId) {
            applyLayout([focusNodeId]);
        }
    }, [focusNodeId, applyLayout]);
    
    // Compute level summaries for LevelBar (recalculate when nodes change)
    const upstreamLevels = useMemo(() => {
        const gs = graphStateRef.current;
        return gs ? gs.getLevelSummary(DIRECTION.UPSTREAM) : [];
    }, [nodes]);
    
    const downstreamLevels = useMemo(() => {
        const gs = graphStateRef.current;
        return gs ? gs.getLevelSummary(DIRECTION.DOWNSTREAM) : [];
    }, [nodes]);
    
    const upstreamFrontierCount = useMemo(() => {
        const gs = graphStateRef.current;
        return gs ? gs.getFrontierExpandCount(DIRECTION.UPSTREAM) : 0;
    }, [nodes]);
    
    const downstreamFrontierCount = useMemo(() => {
        const gs = graphStateRef.current;
        return gs ? gs.getFrontierExpandCount(DIRECTION.DOWNSTREAM) : 0;
    }, [nodes]);
    
    // Create node handlers that will be injected into node data
    const createNodeHandlers = useCallback((nodeId, nodeData) => ({
        onExpand: (direction) => {
            const gs = graphStateRef.current;
            if (!gs) return;
            
            // Check if we need large neighbor UI
            if (gs.needsLargeNeighborUI(nodeId, direction)) {
                const neighbors = gs.getNeighborInfo(nodeId, direction);
                setModalNodeId(nodeId);
                setModalDirection(direction);
                setModalNeighbors(neighbors);
                setModalOpen(true);
            } else {
                // Direct expand
                const newNodes = gs.expandNode(nodeId, direction);
                if (newNodes.length > 0) {
                    // Select the first new node
                    setSelectedNodeId(newNodes[0].id);
                    gs.selectNode(newNodes[0].id);
                    // Apply layout and focus on new nodes
                    const newNodeIds = newNodes.map(n => n.id);
                    setTimeout(() => applyLayout(newNodeIds), 10);
                } else {
                    onToast?.('No neighbors to expand', 'warning');
                }
            }
        },
        onCollapse: (direction) => {
            const gs = graphStateRef.current;
            if (!gs) return;
            gs.collapseFromNode(nodeId, direction);
            setSelectedNodeId(nodeId);
            gs.selectNode(nodeId);
            // setTimeout(() => applyLayout([nodeId]), 10);
        },
        onDismiss: () => {
            const gs = graphStateRef.current;
            if (!gs) return;
            gs.dismissNode(nodeId);
            setSelectedNodeId(null);
        },
        onShowLargeNeighborUI: (direction) => {
            const gs = graphStateRef.current;
            if (!gs) return;
            const neighbors = gs.getNeighborInfo(nodeId, direction);
            setModalNodeId(nodeId);
            setModalDirection(direction);
            setModalNeighbors(neighbors);
            setModalOpen(true);
        },
        onExpandAll: (direction) => {
            const gs = graphStateRef.current;
            if (!gs) return;
            
            const neighbors = gs.getNeighborInfo(nodeId, direction);
            const count = neighbors.length;
            
            // If >= 100, show warning confirmation modal
            if (count >= LARGE_EXPAND_WARNING_THRESHOLD) {
                setPendingExpandAction({ nodeId, direction });
                setConfirmModalMessage(`You are about to expand ${count} datasets. Are you sure?`);
                setConfirmModalOpen(true);
            } else {
                // Expand immediately
                const newNodes = gs.expandNode(nodeId, direction);
                if (newNodes.length > 0) {
                    setSelectedNodeId(newNodes[0].id);
                    gs.selectNode(newNodes[0].id);
                    const newNodeIds = newNodes.map(n => n.id);
                    setTimeout(() => applyLayout(newNodeIds), 10);
                } else {
                    onToast?.('No neighbors to expand', 'warning');
                }
            }
        },
        onNavigateToOriginal: () => {
            const gs = graphStateRef.current;
            if (!gs || !nodeData.originalNodeId) return;
            
            // Pan/zoom to the original node
            setTimeout(() => {
                fitView({
                    padding: 0.3,
                    duration: 500,
                    nodes: [{ id: nodeData.originalNodeId }]
                });
            }, 50);
        }
    }), [applyLayout, onToast, fitView]);
    
    // Inject handlers into nodes
    const nodesWithHandlers = useMemo(() => {
        return nodes.map(node => ({
            ...node,
            data: {
                ...node.data,
                ...createNodeHandlers(node.id, node.data)
            }
        }));
    }, [nodes, createNodeHandlers]);
    
    // Handle node selection
    const onNodeClick = useCallback((event, node) => {
        setSelectedNodeId(node.id);
        graphStateRef.current?.selectNode(node.id);
        
        // Compute path runtime and notify parent
        const gs = graphStateRef.current;
        if (gs && onSelectionChange) {
            const pathRuntime = gs.getPathRuntimeSeconds(node.id);
            onSelectionChange({ nodeId: node.id, pathRuntime });
        }
    }, [onSelectionChange]);
    
    // Handle background click (deselect)
    const onPaneClick = useCallback(() => {
        setSelectedNodeId(null);
        graphStateRef.current?.deselectNode();
        
        // Notify parent of deselection
        if (onSelectionChange) {
            onSelectionChange(null);
        }
    }, [onSelectionChange]);
    
    // Modal handlers
    const handleExpandSelected = useCallback((selectedIds) => {
        const gs = graphStateRef.current;
        if (!gs || !modalNodeId) return;
        
        const newNodes = gs.expandNode(modalNodeId, modalDirection, selectedIds);
        if (newNodes.length > 0) {
            setSelectedNodeId(newNodes[0].id);
            gs.selectNode(newNodes[0].id);
            const newNodeIds = newNodes.map(n => n.id);
            setTimeout(() => applyLayout(newNodeIds), 10);
        }
        setModalOpen(false);
    }, [modalNodeId, modalDirection, applyLayout]);
    
    const handleExpandCount = useCallback((count) => {
        const gs = graphStateRef.current;
        if (!gs || !modalNodeId) return;
        
        // Get first N neighbor IDs
        const neighbors = gs.getNeighborInfo(modalNodeId, modalDirection);
        const idsToExpand = neighbors.slice(0, count).map(n => n.id);
        
        const newNodes = gs.expandNode(modalNodeId, modalDirection, idsToExpand);
        if (newNodes.length > 0) {
            setSelectedNodeId(newNodes[0].id);
            gs.selectNode(newNodes[0].id);
            const newNodeIds = newNodes.map(n => n.id);
            setTimeout(() => applyLayout(newNodeIds), 10);
        }
        setModalOpen(false);
    }, [modalNodeId, modalDirection, applyLayout]);
    
    // Handle level expansion from LevelBar
    const handleExpandLevel = useCallback((direction, depth) => {
        const gs = graphStateRef.current;
        if (!gs) return;
        
        // Determine count for warning
        let totalCount;
        if (depth === null) {
            totalCount = gs.getFrontierExpandCount(direction);
        } else {
            const levels = gs.getLevelSummary(direction);
            const level = levels.find(l => l.depth === depth);
            totalCount = level ? level.potentialChildrenCount : 0;
        }
        
        if (totalCount === 0) {
            onToast?.('No nodes to expand at this level', 'info');
            return;
        }
        
        if (totalCount >= LARGE_EXPAND_WARNING_THRESHOLD) {
            setPendingExpandAction({ type: 'level', direction, depth });
            setConfirmModalMessage(
                `You are about to expand ${totalCount} nodes. Are you sure?`
            );
            setConfirmModalOpen(true);
            return;
        }
        
        let newNodes;
        if (depth === null) {
            newNodes = gs.expandLevel(direction);
        } else {
            newNodes = gs.expandAtLevel(direction, depth);
        }
        
        if (newNodes.length > 0) {
            const newNodeIds = newNodes.map(n => n.id);
            setTimeout(() => applyLayout(newNodeIds), 10);
        }
    }, [applyLayout, onToast]);
    
    // Handle level collapse from LevelBar
    const handleCollapseLevel = useCallback((direction, depth) => {
        const gs = graphStateRef.current;
        if (!gs) return;
        
        const totalCount = gs.getCollapseAtLevelCount(direction, depth);
        
        if (totalCount === 0) {
            onToast?.('No nodes to collapse at this level', 'info');
            return;
        }
        
        if (totalCount >= LARGE_EXPAND_WARNING_THRESHOLD) {
            setPendingExpandAction({ type: 'collapse-level', direction, depth });
            setConfirmModalMessage(
                `You are about to collapse ${totalCount} nodes. Are you sure?`
            );
            setConfirmModalOpen(true);
            return;
        }
        
        const removedCount = gs.collapseAtLevel(direction, depth);
        if (removedCount > 0) {
            setTimeout(() => applyLayout(), 10);
        }
    }, [applyLayout, onToast]);
    
    // Handle hover preview on LevelBar — highlight nodes at a level
    const handleHoverLevel = useCallback((direction, depth) => {
        const gs = graphStateRef.current;
        if (!gs) return;
        gs.highlightLevel(direction, depth);
    }, []);
    
    const handleHoverEnd = useCallback(() => {
        const gs = graphStateRef.current;
        if (!gs) return;
        gs.clearLevelHighlight();
    }, []);
    
    // Handle root pill click — focus view on root node
    const handleRootClick = useCallback(() => {
        const gs = graphStateRef.current;
        if (!gs || !gs.rootNodeId) return;
        
        const rootNodeId = gs.rootNodeId;
        
        // Fit view to the root node with animation
        setTimeout(() => {
            fitView({
                nodes: [{ id: rootNodeId }],
                duration: 500,
                padding: 0.3
            });
        }, 50);
    }, [setNodes, fitView, onSelectionChange]);
    
    // Handle confirmation modal confirm
    const handleConfirmExpand = useCallback(() => {
        const gs = graphStateRef.current;
        if (!gs || !pendingExpandAction) return;
        
        let newNodes;
        if (pendingExpandAction.type === 'level') {
            if (pendingExpandAction.depth === null) {
                newNodes = gs.expandLevel(pendingExpandAction.direction);
            } else {
                newNodes = gs.expandAtLevel(
                    pendingExpandAction.direction, 
                    pendingExpandAction.depth
                );
            }
        } else if (pendingExpandAction.type === 'collapse-level') {
            const { direction, depth } = pendingExpandAction;
            const removedCount = gs.collapseAtLevel(direction, depth);
            if (removedCount > 0) {
                setTimeout(() => applyLayout(), 10);
            }
            setConfirmModalOpen(false);
            setPendingExpandAction(null);
            return;
        } else {
            const { nodeId, direction } = pendingExpandAction;
            newNodes = gs.expandNode(nodeId, direction);
        }
        
        if (newNodes && newNodes.length > 0) {
            setSelectedNodeId(newNodes[0].id);
            gs.selectNode(newNodes[0].id);
            const newNodeIds = newNodes.map(n => n.id);
            setTimeout(() => applyLayout(newNodeIds), 10);
        }
        
        setConfirmModalOpen(false);
        setPendingExpandAction(null);
    }, [pendingExpandAction, applyLayout]);
    
    // Handle confirmation modal close
    const handleConfirmClose = useCallback(() => {
        setConfirmModalOpen(false);
        setPendingExpandAction(null);
    }, []);
    
    // Define node types (must be memoized and outside render)
    const nodeTypes = useMemo(() => ({
        datasetNode: DatasetNode
    }), []);
    
    // Default edge options
    const defaultEdgeOptions = useMemo(() => ({
        type: 'smoothstep',
        animated: false
    }), []);
    
    return html`
        <${ReactFlow}
            nodes=${nodesWithHandlers}
            edges=${edges}
            nodesDraggable=${false}
            onNodesChange=${onNodesChange}
            onEdgesChange=${onEdgesChange}
            onNodeClick=${onNodeClick}
            onPaneClick=${onPaneClick}
            nodeTypes=${nodeTypes}
            defaultEdgeOptions=${defaultEdgeOptions}
            colorMode="dark"
            fitView
            fitViewOptions=${{ padding: 0.2 }}
            minZoom=${0.1}
            maxZoom=${2}
            proOptions=${{ hideAttribution: true }}
            panOnScroll=${true}
            panOnDrag=${[1, 2]}
            selectionOnDrag=${false}
            zoomOnScroll=${false}
            panOnScrollMode="free"
        >
            <${Background} variant="dots" gap=${20} size=${1} />
            <${Controls} showInteractive=${false} position="top-left" />
            <${MiniMap} 
                    position="top-right"
                    nodeColor=${(node) => {
                        if (node.data?.isGhost) return '#9e9e9e';
                        if (node.data?.isRoot) return '#ffd54f';
                        if (node.data?.type?.toUpperCase() === 'DATAFLOW') return '#7e57c2';
                        return '#26a69a';
                    }}
                    pannable=${true}
                    zoomable=${true}
                    maskColor="rgba(173,216,230,0.6)" // Light blue, more opaque for testing
            />
            <${Panel} position="top-right" className="node-search-panel">
                <${NodeSearch} />
            <//>
            
            ${nodes.length > 0 && html`
                <${Panel} position="top-center">
                    <${LevelBar}
                        upstreamLevels=${upstreamLevels}
                        downstreamLevels=${downstreamLevels}
                        upstreamFrontierCount=${upstreamFrontierCount}
                        downstreamFrontierCount=${downstreamFrontierCount}
                        onExpandLevel=${handleExpandLevel}
                        onCollapseLevel=${handleCollapseLevel}
                        onHoverLevel=${handleHoverLevel}
                        onHoverEnd=${handleHoverEnd}
                        onRootClick=${handleRootClick}
                    />
                <//>
            `}
            
            ${nodes.length === 0 && html`<${EmptyState} />`}
        <//>
        
        <${ExpansionModal}
            isOpen=${modalOpen}
            onClose=${() => setModalOpen(false)}
            direction=${modalDirection}
            neighbors=${modalNeighbors}
            onExpandSelected=${handleExpandSelected}
            onExpandCount=${handleExpandCount}
        />
        
        <${ConfirmationModal}
            isOpen=${confirmModalOpen}
            onClose=${handleConfirmClose}
            onConfirm=${handleConfirmExpand}
            message=${confirmModalMessage}
        />
    `;
}

// ============================================
// Flow Wrapper (provides ReactFlow context)
// ============================================

import { ReactFlowProvider } from '@xyflow/react';

export function Flow({ graphState, onToast, onSelectionChange, focusNodeId }) {
    return html`
        <${ReactFlowProvider}>
            <${FlowCanvas}
                graphState=${graphState}
                onToast=${onToast}
                onSelectionChange=${onSelectionChange}
                focusNodeId=${focusNodeId}
            />
        <//>
    `;
}
