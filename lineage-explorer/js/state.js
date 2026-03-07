// ============================================
// Graph State Management
// ============================================
// Manages React Flow nodes/edges state, branch path tracking,
// and actions for expansion, collapse, and highlighting.

import {
    getNodeMeta,
    getNodeEdges,
    getUpstreamNeighbors,
    getDownstreamNeighbors,
    nodeExists,
    getNodeTriggerDetails
} from '../data.js';

// ============================================
// Constants
// ============================================
export const DIRECTION = {
    ROOT: 'root',
    UPSTREAM: 'upstream',
    DOWNSTREAM: 'downstream'
};

export const LARGE_NEIGHBOR_THRESHOLD = 10;
export const LARGE_EXPAND_WARNING_THRESHOLD = 100;

// ============================================
// Node ID Generation
// ============================================
// We use unique IDs per node instance to allow duplicates
let nodeIdCounter = 0;

function generateNodeId(datasetId) {
    return `${datasetId}__${++nodeIdCounter}`;
}

function getDatasetIdFromNodeId(nodeId) {
    return nodeId.split('__')[0];
}

// ============================================
// Node/Edge Creation Helpers
// ============================================

/**
 * Create a React Flow node object
 */
export function createNode({
    datasetId,
    direction,
    branchPath,
    position = { x: 0, y: 0 },
    isRoot = false,
    parentNodeId = null,
    depth = 0
}) {
    const meta = getNodeMeta(datasetId);
    const edges = getNodeEdges(datasetId);
    const triggerDetails = getNodeTriggerDetails(datasetId);
    const nodeId = generateNodeId(datasetId);
    
    return {
        id: nodeId,
        type: 'datasetNode',
        position,
        data: {
            datasetId,
            name: meta?.name || 'Unknown Dataset',
            type: meta?.type || 'unknown',
            subType: meta?.subType || '',
            typeId: meta?.typeId || null,
            typeName: meta?.typeName || '',
            runtimeSeconds: meta?.runtimeSeconds ?? null,
            triggerSummary: meta?.triggerSummary || 'MANUAL',
            triggerDetails: triggerDetails || [],
            lastRunTs: meta?.lastRunTs || null,
            direction,
            isRoot,
            depth,
            branchPath: [...branchPath, nodeId],
            parentNodeId,
            upstreamCount: edges.up.length,
            downstreamCount: edges.down.length,
            highlighted: false,
            levelHighlighted: false,
            expanded: {
                up: false,
                down: false
            }
        },
        sourcePosition: 'right',
        targetPosition: 'left'
    };
}

/**
 * Create a React Flow edge object
 */
export function createEdge(sourceNodeId, targetNodeId, highlighted = false) {
    return {
        id: `edge__${sourceNodeId}__${targetNodeId}`,
        source: sourceNodeId,
        target: targetNodeId,
        type: 'smoothstep',
        animated: false,
        className: highlighted ? 'highlighted' : '',
        data: { highlighted }
    };
}

/**
 * Create a ghost/phantom node for circular dependencies
 * Ghost nodes are visually distinct, non-expandable references to existing nodes
 */
export function createGhostNode({
    datasetId,
    direction,
    branchPath,
    position = { x: 0, y: 0 },
    parentNodeId = null,
    originalNodeId = null,
    depth = 0
}) {
    const meta = getNodeMeta(datasetId);
    const triggerDetails = getNodeTriggerDetails(datasetId);
    const nodeId = generateNodeId(datasetId);
    
    return {
        id: nodeId,
        type: 'datasetNode',
        position,
        data: {
            datasetId,
            name: meta?.name || 'Unknown Dataset',
            type: meta?.type || 'unknown',
            subType: meta?.subType || '',
            typeId: meta?.typeId || null,
            typeName: meta?.typeName || '',
            runtimeSeconds: meta?.runtimeSeconds ?? null,
            triggerSummary: meta?.triggerSummary || 'MANUAL',
            triggerDetails: triggerDetails || [],
            lastRunTs: meta?.lastRunTs || null,
            direction,
            isRoot: false,
            depth,
            branchPath: [...branchPath, nodeId],
            parentNodeId,
            upstreamCount: 0,  // Ghost nodes don't expand
            downstreamCount: 0,
            highlighted: false,
            levelHighlighted: false,
            isGhost: true,
            originalNodeId,
            expanded: {
                up: false,
                down: false
            }
        },
        sourcePosition: 'right',
        targetPosition: 'left'
    };
}

// ============================================
// Graph State Class
// ============================================

export class GraphState {
    constructor(setNodes, setEdges) {
        this.setNodes = setNodes;
        this.setEdges = setEdges;
        this.nodes = [];
        this.edges = [];
        this.rootNodeId = null;
        this.rootDatasetId = null;
        this.selectedNodeId = null;
        this.highlightedPath = [];
    }
    
    // ----------------------------------------
    // Getters
    // ----------------------------------------
    
    getNodes() {
        return this.nodes;
    }
    
    getEdges() {
        return this.edges;
    }
    
    getNodeById(nodeId) {
        return this.nodes.find(n => n.id === nodeId);
    }
    
    getNodesByDatasetId(datasetId) {
        return this.nodes.filter(n => n.data.datasetId === datasetId);
    }
    
    getRootNode() {
        return this.rootNodeId ? this.getNodeById(this.rootNodeId) : null;
    }
    
    // ----------------------------------------
    // State Updates
    // ----------------------------------------
    
    _updateState() {
        this.setNodes([...this.nodes]);
        this.setEdges([...this.edges]);
    }
    
    // ----------------------------------------
    // Initialize Root Node
    // ----------------------------------------
    
    initRoot(datasetId) {
        if (!nodeExists(datasetId)) {
            console.warn(`Dataset ${datasetId} not found in data`);
            return null;
        }
        
        // Clear existing state
        this.clear();
        
        // Create root node with selected state
        const rootNode = createNode({
            datasetId,
            direction: DIRECTION.ROOT,
            branchPath: [],
            position: { x: 0, y: 0 },
            isRoot: true,
            parentNodeId: null,
            depth: 0
        });
        
        // Set selected on the node for React Flow
        rootNode.selected = true;
        
        this.nodes = [rootNode];
        this.edges = [];
        this.rootNodeId = rootNode.id;
        this.rootDatasetId = datasetId;
        
        // Use selectNode to properly set selection state and highlight
        this.selectNode(rootNode.id);
        
        return rootNode;
    }
    
    // ----------------------------------------
    // Expand Node
    // ----------------------------------------
    
    /**
     * Expand a node in the specified direction
     * @param {string} nodeId - The node to expand from
     * @param {string} direction - 'upstream' or 'downstream'
     * @param {string[]} specificNeighborIds - If provided, only expand these specific neighbors
     * @param {boolean} skipUpdate - If true, skip calling _updateState (for batch operations)
     * @returns {Object[]} - Array of newly created nodes
     */
    expandNode(nodeId, direction, specificNeighborIds = null, skipUpdate = false) {
        const node = this.getNodeById(nodeId);
        if (!node) {
            console.warn(`Node ${nodeId} not found`);
            return [];
        }
        
        const datasetId = node.data.datasetId;
        const neighbors = direction === DIRECTION.UPSTREAM
            ? getUpstreamNeighbors(datasetId)
            : getDownstreamNeighbors(datasetId);
        
        if (neighbors.length === 0) {
            console.log(`No ${direction} neighbors for ${datasetId}`);
            return [];
        }
        
        // Filter to specific neighbors if provided
        const neighborsToExpand = specificNeighborIds
            ? neighbors.filter(id => specificNeighborIds.includes(id))
            : neighbors;
        
        if (neighborsToExpand.length === 0) {
            return [];
        }
        
        // Create new nodes for each neighbor
        const newNodes = [];
        const newEdges = [];
        
        // Get dataset IDs in the current branch path to detect cycles
        const branchDatasetIds = node.data.branchPath.map(pathNodeId => {
            const pathNode = this.getNodeById(pathNodeId);
            return pathNode?.data?.datasetId;
        }).filter(Boolean);
        
        // Calculate positions (will be recalculated by Dagre, but set initial)
        const baseX = node.position.x + (direction === DIRECTION.UPSTREAM ? -300 : 300);
        const startY = node.position.y - ((neighborsToExpand.length - 1) * 80) / 2;
        const parentDepth = node.data.depth;
        
        neighborsToExpand.forEach((neighborId, index) => {
            // Detect circular dependency: does this neighbor already exist in the branch path?
            const isCircular = branchDatasetIds.includes(neighborId);
            
            let newNode;
            let originalNodeId = null;
            
            if (isCircular) {
                // Find the original node in the branch path
                const originalNode = node.data.branchPath
                    .map(id => this.getNodeById(id))
                    .find(n => n?.data?.datasetId === neighborId);
                
                originalNodeId = originalNode?.id || null;
                
                // Create a ghost node instead of a regular node
                newNode = createGhostNode({
                    datasetId: neighborId,
                    direction,
                    branchPath: node.data.branchPath,
                    position: { x: baseX, y: startY + index * 80 },
                    parentNodeId: nodeId,
                    originalNodeId,
                    depth: parentDepth + 1
                });
            } else {
                // Regular node creation
                newNode = createNode({
                    datasetId: neighborId,
                    direction,
                    branchPath: node.data.branchPath,
                    position: { x: baseX, y: startY + index * 80 },
                    isRoot: false,
                    parentNodeId: nodeId,
                    depth: parentDepth + 1
                });
            }
            
            newNodes.push(newNode);
            
            // Create edge - direction determines source/target
            if (direction === DIRECTION.UPSTREAM) {
                // Upstream: new node -> current node
                newEdges.push(createEdge(newNode.id, nodeId));
            } else {
                // Downstream: current node -> new node
                newEdges.push(createEdge(nodeId, newNode.id));
            }
        });
        
        // Mark node as expanded in this direction
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex >= 0) {
            this.nodes[nodeIndex] = {
                ...this.nodes[nodeIndex],
                data: {
                    ...this.nodes[nodeIndex].data,
                    expanded: {
                        ...this.nodes[nodeIndex].data.expanded,
                        [direction === DIRECTION.UPSTREAM ? 'up' : 'down']: true
                    }
                }
            };
        }
        
        this.nodes = [...this.nodes, ...newNodes];
        this.edges = [...this.edges, ...newEdges];
        
        if (!skipUpdate) {
            this._updateState();
        }
        
        return newNodes;
    }
    
    /**
     * Expand missing neighbors of a node (for re-expansion / partial expansion completion)
     * @param {string} nodeId - The node to expand from
     * @param {string} direction - 'upstream' or 'downstream'
     * @param {boolean} skipUpdate - If true, skip calling _updateState (for batch operations)
     * @returns {Object[]} - Array of newly created nodes
     */
    expandMissingNeighbors(nodeId, direction, skipUpdate = false) {
        const node = this.getNodeById(nodeId);
        if (!node) return [];
        
        const datasetId = node.data.datasetId;
        const allNeighborIds = direction === DIRECTION.UPSTREAM
            ? getUpstreamNeighbors(datasetId)
            : getDownstreamNeighbors(datasetId);
        
        if (allNeighborIds.length === 0) return [];
        
        // Find existing children of this node in the given direction
        const existingChildDatasetIds = new Set();
        this.nodes.forEach(n => {
            if (n.data.parentNodeId === nodeId && n.data.direction === direction) {
                existingChildDatasetIds.add(n.data.datasetId);
            }
        });
        
        // Filter to missing neighbors only
        const missingNeighborIds = allNeighborIds.filter(id => !existingChildDatasetIds.has(id));
        
        if (missingNeighborIds.length === 0) return [];
        
        // Expand the missing neighbors
        return this.expandNode(nodeId, direction, missingNeighborIds, skipUpdate);
    }
    
    // ----------------------------------------
    // Collapse From Node
    // ----------------------------------------
    
    /**
     * Collapse all nodes downstream (in the lineage direction) from a node
     * Keeps the clicked node but removes all its descendants
     * @param {string} nodeId - The node ID to collapse from
     * @param {string|null} direction - Optional direction (DIRECTION.UPSTREAM or DIRECTION.DOWNSTREAM)
     *                                  Only used for root node to collapse a specific direction
     */
    collapseFromNode(nodeId, direction = null) {
        const node = this.getNodeById(nodeId);
        if (!node) return;
        
        // If it's the root, handle directional or full collapse
        if (node.data.isRoot) {
            // If direction is specified, collapse only that direction
            if (direction === DIRECTION.UPSTREAM || direction === DIRECTION.DOWNSTREAM) {
                // Remove nodes in the specified direction
                this.nodes = this.nodes.filter(n => 
                    n.data.isRoot || n.data.direction !== direction
                );
                
                // Remove edges connected to removed nodes
                const remainingNodeIds = new Set(this.nodes.map(n => n.id));
                this.edges = this.edges.filter(e => 
                    remainingNodeIds.has(e.source) && remainingNodeIds.has(e.target)
                );
                
                // Reset only the specified direction's expanded state
                const rootIndex = this.nodes.findIndex(n => n.id === nodeId);
                if (rootIndex >= 0) {
                    const expandKey = direction === DIRECTION.UPSTREAM ? 'up' : 'down';
                    this.nodes[rootIndex] = {
                        ...this.nodes[rootIndex],
                        data: {
                            ...this.nodes[rootIndex].data,
                            expanded: {
                                ...this.nodes[rootIndex].data.expanded,
                                [expandKey]: false
                            }
                        }
                    };
                }
            } else {
                // No direction specified: collapse everything (original behavior)
                // Keep only the root node
                this.nodes = this.nodes.filter(n => n.data.isRoot);
                // Clear all edges
                this.edges = [];
                
                // Reset root node's expanded state
                const rootIndex = this.nodes.findIndex(n => n.id === nodeId);
                if (rootIndex >= 0) {
                    this.nodes[rootIndex] = {
                        ...this.nodes[rootIndex],
                        data: {
                            ...this.nodes[rootIndex].data,
                            expanded: {
                                up: false,
                                down: false
                            }
                        }
                    };
                }
            }
            
            // Refresh selection and highlighting
            this.selectNode(nodeId);
            this._updateState();
            return;
        }
        
        // Collect all descendant nodes to remove (excluding the clicked node itself)
        const nodesToRemove = new Set();
        
        // Start with immediate children of the clicked node
        const initialChildren = this.nodes.filter(n => n.data.parentNodeId === nodeId);
        const queue = initialChildren.map(child => child.id);
        
        while (queue.length > 0) {
            const currentId = queue.shift();
            nodesToRemove.add(currentId);
            
            // Find all children (nodes where this is the parent)
            const children = this.nodes.filter(n => n.data.parentNodeId === currentId);
            children.forEach(child => queue.push(child.id));
        }
        
        // Remove descendant nodes and their edges
        this.nodes = this.nodes.filter(n => !nodesToRemove.has(n.id));
        this.edges = this.edges.filter(e => 
            !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
        );
        
        // Update the clicked node's expanded state
        const nodeIndex = this.nodes.findIndex(n => n.id === nodeId);
        if (nodeIndex >= 0) {
            const direction = node.data.direction;
            this.nodes[nodeIndex] = {
                ...this.nodes[nodeIndex],
                data: {
                    ...this.nodes[nodeIndex].data,
                    expanded: {
                        ...this.nodes[nodeIndex].data.expanded,
                        [direction === DIRECTION.UPSTREAM ? 'up' : 'down']: false
                    }
                }
            };
        }
        
        // Clear selection if selected node was removed
        if (nodesToRemove.has(this.selectedNodeId)) {
            this.selectedNodeId = null;
            this.clearHighlight();
        }
        
        this._updateState();
    }
    
    // ----------------------------------------
    // Dismiss Node (Remove node and all descendants)
    // ----------------------------------------
    
    /**
     * Dismiss a node and all its descendants
     * Similar to collapseFromNode but also removes the node itself
     * After dismissal, selection is cleared
     */
    dismissNode(nodeId) {
        const node = this.getNodeById(nodeId);
        if (!node) return;
        
        // If it's the root, behave like collapseFromNode (collapse all, keep root)
        if (node.data.isRoot) {
            // Keep only the root node
            this.nodes = this.nodes.filter(n => n.data.isRoot);
            // Clear all edges
            this.edges = [];
            
            // Reset root node's expanded state
            const rootIndex = this.nodes.findIndex(n => n.id === nodeId);
            if (rootIndex >= 0) {
                this.nodes[rootIndex] = {
                    ...this.nodes[rootIndex],
                    data: {
                        ...this.nodes[rootIndex].data,
                        expanded: {
                            up: false,
                            down: false
                        }
                    }
                };
            }
            
            // Clear selection
            this.deselectNode();
            this._updateState();
            return;
        }
        
        // For non-root nodes: collect this node + all descendants
        const nodesToRemove = new Set([nodeId]);
        
        // BFS to find all descendants
        const queue = [nodeId];
        while (queue.length > 0) {
            const currentId = queue.shift();
            const children = this.nodes.filter(n => n.data.parentNodeId === currentId);
            children.forEach(child => {
                nodesToRemove.add(child.id);
                queue.push(child.id);
            });
        }
        
        // Get parent info before removing nodes
        const parentNodeId = node.data.parentNodeId;
        const dismissedDirection = node.data.direction;
        
        // Remove nodes and their edges
        this.nodes = this.nodes.filter(n => !nodesToRemove.has(n.id));
        this.edges = this.edges.filter(e => 
            !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
        );
        
        // Update parent's expanded state if all children in this direction are gone
        if (parentNodeId) {
            const parentNode = this.getNodeById(parentNodeId);
            if (parentNode) {
                // Check if parent has any remaining children in the dismissed direction
                const remainingSiblings = this.nodes.filter(n => 
                    n.data.parentNodeId === parentNodeId && 
                    n.data.direction === dismissedDirection
                );
                
                // If no siblings remain, reset parent's expanded flag for this direction
                if (remainingSiblings.length === 0) {
                    const parentIndex = this.nodes.findIndex(n => n.id === parentNodeId);
                    if (parentIndex >= 0) {
                        this.nodes[parentIndex] = {
                            ...this.nodes[parentIndex],
                            data: {
                                ...this.nodes[parentIndex].data,
                                expanded: {
                                    ...this.nodes[parentIndex].data.expanded,
                                    [dismissedDirection === DIRECTION.UPSTREAM ? 'up' : 'down']: false
                                }
                            }
                        };
                    }
                }
            }
        }
        
        // Clear selection
        this.deselectNode();
        this._updateState();
    }
    
    // ----------------------------------------
    // Clear All
    // ----------------------------------------
    
    clear() {
        this.nodes = [];
        this.edges = [];
        this.rootNodeId = null;
        this.rootDatasetId = null;
        this.selectedNodeId = null;
        this.highlightedPath = [];
        
        this._updateState();
    }
    
    // ----------------------------------------
    // Selection & Highlighting
    // ----------------------------------------
    
    selectNode(nodeId) {
        this.selectedNodeId = nodeId;
        
        // Update React Flow's selected property on all nodes
        this.nodes = this.nodes.map(n => ({
            ...n,
            selected: n.id === nodeId
        }));
        
        this.highlightPathToRoot(nodeId);
    }
    
    deselectNode() {
        this.selectedNodeId = null;
        
        // Clear selection on all nodes
        this.nodes = this.nodes.map(n => ({
            ...n,
            selected: false
        }));
        
        this.clearHighlight();
    }
    
    /**
     * Highlight the path from a node back to the root
     */
    highlightPathToRoot(nodeId) {
        const node = this.getNodeById(nodeId);
        if (!node) return;
        
        // Get the branch path (list of node IDs from root to this node)
        const pathNodeIds = new Set(node.data.branchPath);
        this.highlightedPath = [...pathNodeIds];
        
        // Update nodes with highlight state
        this.nodes = this.nodes.map(n => ({
            ...n,
            data: {
                ...n.data,
                highlighted: pathNodeIds.has(n.id)
            }
        }));
        
        // Update edges with highlight state
        this.edges = this.edges.map(e => {
            const isHighlighted = pathNodeIds.has(e.source) && pathNodeIds.has(e.target);
            return {
                ...e,
                className: isHighlighted ? 'highlighted' : '',
                data: { ...e.data, highlighted: isHighlighted }
            };
        });
        
        this._updateState();
    }
    
    clearHighlight() {
        this.highlightedPath = [];
        
        this.nodes = this.nodes.map(n => ({
            ...n,
            data: { ...n.data, highlighted: false }
        }));
        
        this.edges = this.edges.map(e => ({
            ...e,
            className: '',
            data: { ...e.data, highlighted: false }
        }));
        
        this._updateState();
    }
    
    /**
     * Get the total runtime in seconds from a node to the root
     * Sums the runtime of all nodes in the branch path (including the node itself and root)
     * Treats null/undefined runtime values as 0
     */
    getPathRuntimeSeconds(nodeId) {
        const node = this.getNodeById(nodeId);
        if (!node) return null;
        
        let totalRuntime = 0;
        
        // Iterate through all nodes in the branch path
        for (const pathNodeId of node.data.branchPath) {
            const pathNode = this.getNodeById(pathNodeId);
            const runtime = pathNode?.data?.runtimeSeconds;
            
            // Add runtime if available, treat null/undefined as 0
            if (runtime != null && runtime >= 0) {
                totalRuntime += runtime;
            }
        }
        
        return totalRuntime;
    }
    
    // ----------------------------------------
    // Neighbor Info (for expansion UI)
    // ----------------------------------------
    
    /**
     * Get neighbor info for expansion UI
     * Returns list of { id, name } for neighbors in a direction
     */
    getNeighborInfo(nodeId, direction) {
        const node = this.getNodeById(nodeId);
        if (!node) return [];
        
        const datasetId = node.data.datasetId;
        const neighborIds = direction === DIRECTION.UPSTREAM
            ? getUpstreamNeighbors(datasetId)
            : getDownstreamNeighbors(datasetId);
        
        return neighborIds.map(id => {
            const meta = getNodeMeta(id);
            return {
                id,
                name: meta?.name || id
            };
        });
    }
    
    /**
     * Check if a node can expand in a direction
     */
    canExpand(nodeId, direction) {
        const node = this.getNodeById(nodeId);
        if (!node) return false;
        
        // Already expanded in this direction?
        const expandKey = direction === DIRECTION.UPSTREAM ? 'up' : 'down';
        if (node.data.expanded[expandKey]) return false;
        
        // Check neighbor count
        const count = direction === DIRECTION.UPSTREAM
            ? node.data.upstreamCount
            : node.data.downstreamCount;
        
        return count > 0;
    }
    
    /**
     * Check if expansion should show large neighbor UI
     */
    needsLargeNeighborUI(nodeId, direction) {
        const node = this.getNodeById(nodeId);
        if (!node) return false;
        
        const count = direction === DIRECTION.UPSTREAM
            ? node.data.upstreamCount
            : node.data.downstreamCount;
        
        return count > LARGE_NEIGHBOR_THRESHOLD;
    }
    
    // ----------------------------------------
    // Level-Based Operations
    // ----------------------------------------
    
    /**
     * Get a summary of all levels in a given direction.
     * Returns an array of { depth, revealedChildrenCount, potentialChildrenCount, allExpanded }
     * ordered by depth ascending.
     * 
     * NEW SEMANTICS:
     * - revealedChildrenCount at depth D = count of visible nodes AT depth D
     * - potentialChildrenCount at depth D = count of hidden nodes AT depth D
     *   (computed from parent nodes at depth D-1 that have unexpanded/partial neighbors)
     */
    getLevelSummary(direction) {
        const relevantNodes = this.nodes.filter(n => {
            // Include ghost nodes for counting purposes
            if (n.data.isRoot) return direction !== null; // root counts for both
            return n.data.direction === direction;
        });
        
        // Group by depth
        const depthMap = new Map();
        
        // First pass: count visible nodes at each depth
        relevantNodes.forEach(n => {
            const depth = n.data.depth;
            if (!depthMap.has(depth)) {
                depthMap.set(depth, { 
                    depth, 
                    revealedChildrenCount: 0, 
                    potentialChildrenCount: 0,
                    allExpanded: true 
                });
            }
            const entry = depthMap.get(depth);
            entry.revealedChildrenCount += 1;
        });
        
        // Second pass: compute potential (hidden) children for each depth
        depthMap.forEach((entry, depth) => {
            if (depth === 0) {
                // Root level: always fully visible, no hidden nodes
                entry.potentialChildrenCount = 0;
                entry.allExpanded = true;
                return;
            }
            
            // Find parent nodes at depth-1
            const parentDepth = depth - 1;
            const parents = relevantNodes.filter(n => n.data.depth === parentDepth);
            
            let totalHidden = 0;
            for (const parent of parents) {
                const neighborCount = direction === DIRECTION.UPSTREAM 
                    ? parent.data.upstreamCount 
                    : parent.data.downstreamCount;
                
                if (neighborCount === 0) continue;
                
                // Count actual visible children of this parent at depth D
                const visibleChildren = relevantNodes.filter(n => 
                    n.data.depth === depth && n.data.parentNodeId === parent.id
                ).length;
                
                // Hidden count = total neighbors - visible children
                const hiddenForThisParent = neighborCount - visibleChildren;
                totalHidden += hiddenForThisParent;
            }
            
            entry.potentialChildrenCount = totalHidden;
            entry.allExpanded = (totalHidden === 0);
        });
        
        // Sort by depth and return as array
        return Array.from(depthMap.values()).sort((a, b) => a.depth - b.depth);
    }
    
    /**
     * Get all node IDs at a specific depth and direction
     * Useful for highlighting
     */
    getNodesAtLevel(direction, depth) {
        return this.nodes.filter(n => {
            // Include ghost nodes for highlighting purposes
            if (depth === 0) return n.data.isRoot;
            return n.data.direction === direction && n.data.depth === depth;
        });
    }
    
    /**
     * Expand all expandable nodes at a specific depth and direction.
     * NEW SEMANTICS: To reveal hidden nodes at depth D, we expand parent nodes at depth D-1.
     * This includes both fully-unexpanded parents and partially-expanded parents (re-expansion).
     */
    expandAtLevel(direction, depth) {
        if (depth === 0) {
            // No-op: root is always visible
            return [];
        }
        
        // Find parent nodes at depth D-1
        const parentDepth = depth - 1;
        const parents = this.nodes.filter(n => {
            if (n.data.isGhost) return false;
            if (parentDepth === 0) return n.data.isRoot;
            return n.data.direction === direction && n.data.depth === parentDepth;
        });
        
        const allNewNodes = [];
        for (const parent of parents) {
            // Expand missing neighbors (handles both unexpanded and partially-expanded parents)
            const newNodes = this.expandMissingNeighbors(parent.id, direction, true);
            allNewNodes.push(...newNodes);
        }
        
        this._updateState();
        return allNewNodes;
    }
    
    /**
     * Expand all frontier (leaf) nodes in a given direction.
     * NEW SEMANTICS: Frontier = only the deepest visible level's unexpanded nodes.
     * This prevents overlap with level pill potentialChildrenCount.
     * @param {string} direction - 'upstream' or 'downstream'
     * @returns {Object[]} - All newly created nodes
     */
    expandLevel(direction) {
        const expandKey = direction === DIRECTION.UPSTREAM ? 'up' : 'down';
        
        // Find max depth among visible nodes in this direction (including ghost nodes)
        const relevantNodes = this.nodes.filter(n => {
            return n.data.isRoot || n.data.direction === direction;
        });
        
        if (relevantNodes.length === 0) return [];
        
        const maxDepth = Math.max(...relevantNodes.map(n => n.data.depth));
        
        // Find frontier nodes: unexpanded nodes at the deepest level only
        const frontierNodes = this.nodes.filter(n => {
            // Must not be a ghost node (ghost nodes can't be expanded)
            if (n.data.isGhost) return false;
            // Must be at max depth
            if (n.data.depth !== maxDepth) return false;
            // Must not already be expanded in this direction
            if (n.data.expanded[expandKey]) return false;
            // Must have neighbors in this direction
            const count = direction === DIRECTION.UPSTREAM
                ? n.data.upstreamCount
                : n.data.downstreamCount;
            if (count === 0) return false;
            // Must be a root or already in this direction
            return n.data.isRoot || n.data.direction === direction;
        });
        
        if (frontierNodes.length === 0) return [];
        
        // Expand each frontier node (without updating state each time)
        const allNewNodes = [];
        for (const frontierNode of frontierNodes) {
            const newNodes = this.expandNode(frontierNode.id, direction, null, true);
            allNewNodes.push(...newNodes);
        }
        
        // Single state update after all expansions
        this._updateState();
        
        return allNewNodes;
    }
    
    /**
     * Get total count of neighbors that would be expanded at the next level.
     * NEW SEMANTICS: Only counts the deepest visible level's unexpanded nodes.
     * This prevents overlap with level pill potentialChildrenCount.
     * Useful for showing count on the button and triggering warnings.
     */
    getFrontierExpandCount(direction) {
        const expandKey = direction === DIRECTION.UPSTREAM ? 'up' : 'down';
        
        // Find max depth among visible nodes in this direction (including ghost nodes)
        const relevantNodes = this.nodes.filter(n => {
            return n.data.isRoot || n.data.direction === direction;
        });
        
        if (relevantNodes.length === 0) return 0;
        
        const maxDepth = Math.max(...relevantNodes.map(n => n.data.depth));
        
        // Only count unexpanded nodes at the deepest level
        let total = 0;
        this.nodes.forEach(n => {
            if (n.data.isGhost) return; // Ghost nodes can't be expanded
            // Must be at max depth
            if (n.data.depth !== maxDepth) return;
            if (n.data.expanded[expandKey]) return;
            const count = direction === DIRECTION.UPSTREAM
                ? n.data.upstreamCount
                : n.data.downstreamCount;
            if (count === 0) return;
            if (n.data.isRoot || n.data.direction === direction) {
                total += count;
            }
        });
        
        return total;
    }
    
    /**
     * Collapse all nodes at a specific depth and everything beyond in a given direction.
     * This removes nodes at depth >= targetDepth and resets expanded flags on parents.
     * @param {string} direction - 'upstream' or 'downstream'
     * @param {number} depth - The depth level to collapse (and everything beyond)
     * @returns {number} - Count of nodes removed
     */
    collapseAtLevel(direction, depth) {
        const expandKey = direction === DIRECTION.UPSTREAM ? 'up' : 'down';
        
        // Collect all nodes at this depth or deeper in this direction
        const nodesToRemove = new Set();
        this.nodes.forEach(n => {
            // Skip root node (never remove it)
            if (n.data.isRoot) return;
            // Include nodes matching direction and depth >= target
            if (n.data.direction === direction && n.data.depth >= depth) {
                nodesToRemove.add(n.id);
            }
        });
        
        const removedCount = nodesToRemove.size;
        if (removedCount === 0) return 0;
        
        // Remove nodes and their connected edges
        this.nodes = this.nodes.filter(n => !nodesToRemove.has(n.id));
        this.edges = this.edges.filter(e => 
            !nodesToRemove.has(e.source) && !nodesToRemove.has(e.target)
        );
        
        // Reset expanded flags on parent nodes (depth - 1)
        if (depth === 1) {
            // Special case: collapsing L1 means resetting root's expanded flag
            const rootIndex = this.nodes.findIndex(n => n.data.isRoot);
            if (rootIndex >= 0) {
                this.nodes[rootIndex] = {
                    ...this.nodes[rootIndex],
                    data: {
                        ...this.nodes[rootIndex].data,
                        expanded: {
                            ...this.nodes[rootIndex].data.expanded,
                            [expandKey]: false
                        }
                    }
                };
            }
        } else {
            // Reset expanded flag on all nodes at depth - 1 in this direction
            this.nodes = this.nodes.map(n => {
                if (n.data.direction === direction && n.data.depth === depth - 1) {
                    return {
                        ...n,
                        data: {
                            ...n.data,
                            expanded: {
                                ...n.data.expanded,
                                [expandKey]: false
                            }
                        }
                    };
                }
                return n;
            });
        }
        
        // Clear selection if selected node was removed
        if (nodesToRemove.has(this.selectedNodeId)) {
            this.selectedNodeId = null;
            this.clearHighlight();
        }
        
        this._updateState();
        return removedCount;
    }
    
    /**
     * Get count of nodes that would be removed by collapseAtLevel.
     * Used for confirmation warnings before collapsing large levels.
     * @param {string} direction - 'upstream' or 'downstream'
     * @param {number} depth - The depth level to check
     * @returns {number} - Count of nodes that would be removed
     */
    getCollapseAtLevelCount(direction, depth) {
        let count = 0;
        this.nodes.forEach(n => {
            if (n.data.isRoot) return;
            if (n.data.direction === direction && n.data.depth >= depth) {
                count++;
            }
        });
        return count;
    }
    
    /**
     * Temporarily highlight nodes at a specific level (for hover preview).
     * Sets a 'levelHighlighted' flag on matching nodes.
     */
    highlightLevel(direction, depth) {
        const targetNodes = this.getNodesAtLevel(direction, depth);
        const targetIds = new Set(targetNodes.map(n => n.id));
        
        this.nodes = this.nodes.map(n => ({
            ...n,
            data: {
                ...n.data,
                levelHighlighted: targetIds.has(n.id)
            }
        }));
        
        this._updateState();
    }
    
    /**
     * Clear level highlighting
     */
    clearLevelHighlight() {
        this.nodes = this.nodes.map(n => ({
            ...n,
            data: {
                ...n.data,
                levelHighlighted: false
            }
        }));
        
        this._updateState();
    }
}
