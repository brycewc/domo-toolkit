// ============================================
// Dagre Layout Utilities
// ============================================
// Provides automatic graph layout using Dagre algorithm

import dagre from '@dagrejs/dagre';

// ============================================
// Constants
// ============================================
const NODE_WIDTH = 260;
const NODE_HEIGHT = 200;
const NODE_SEPARATION = 30;
const RANK_SEPARATION = 150;

// ============================================
// Layout Function
// ============================================

/**
 * Apply Dagre layout to nodes and edges
 * @param {Object[]} nodes - React Flow nodes
 * @param {Object[]} edges - React Flow edges
 * @param {Object} options - Layout options
 * @returns {Object} - { nodes, edges } with updated positions
 */
export function getLayoutedElements(nodes, edges, options = {}) {
    const {
        direction = 'LR',  // LR = left-to-right (horizontal), TB = top-to-bottom
        nodeWidth = NODE_WIDTH,
        nodeHeight = NODE_HEIGHT,
        nodeSeparation = NODE_SEPARATION,
        rankSeparation = RANK_SEPARATION
    } = options;
    
    if (nodes.length === 0) {
        return { nodes, edges };
    }
    
    const isHorizontal = direction === 'LR' || direction === 'RL';
    
    // Create a new Dagre graph
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setDefaultEdgeLabel(() => ({}));
    
    // Configure the layout
    dagreGraph.setGraph({
        rankdir: direction,
        nodesep: nodeSeparation,
        ranksep: rankSeparation,
        marginx: 50,
        marginy: 50
    });
    
    // Add nodes to the graph
    nodes.forEach((node) => {
        dagreGraph.setNode(node.id, { 
            width: nodeWidth, 
            height: nodeHeight 
        });
    });
    
    // Add edges to the graph
    edges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });
    
    // Run the layout algorithm
    dagre.layout(dagreGraph);
    
    // Update node positions
    const layoutedNodes = nodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        
        return {
            ...node,
            // Center the node on the calculated position
            position: {
                x: nodeWithPosition.x - nodeWidth / 2,
                y: nodeWithPosition.y - nodeHeight / 2
            },
            // Update handle positions based on direction
            targetPosition: isHorizontal ? 'left' : 'top',
            sourcePosition: isHorizontal ? 'right' : 'bottom'
        };
    });
    
    return { nodes: layoutedNodes, edges };
}

/**
 * Apply layout and return positioned nodes/edges
 * Also calculates viewport bounds for fitView
 */
export function layoutGraph(nodes, edges, options = {}) {
    const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
        nodes,
        edges,
        options
    );
    
    // Calculate bounds for fitView
    if (layoutedNodes.length > 0) {
        const xs = layoutedNodes.map(n => n.position.x);
        const ys = layoutedNodes.map(n => n.position.y);
        
        const bounds = {
            minX: Math.min(...xs),
            maxX: Math.max(...xs) + NODE_WIDTH,
            minY: Math.min(...ys),
            maxY: Math.max(...ys) + NODE_HEIGHT
        };
        
        return { nodes: layoutedNodes, edges: layoutedEdges, bounds };
    }
    
    return { nodes: layoutedNodes, edges: layoutedEdges, bounds: null };
}
