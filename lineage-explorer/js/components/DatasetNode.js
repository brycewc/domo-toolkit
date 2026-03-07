// ============================================
// DatasetNode Component
// ============================================
// Minimalist custom React Flow node for displaying dataset information
// with external links to Domo and trigger details

import { html } from 'htm/react';
import { memo, useCallback, useState } from 'react';
import { Handle, Position, NodeToolbar } from '@xyflow/react';
import { DIRECTION } from '../state.js';
import { formatDuration } from '../utils/format.js';

// ============================================
// Helper Functions
// ============================================

/**
 * Format CRON expression to human-readable string using cronstrue
 */
function formatCron(cronExpression) {
    if (!cronExpression) return 'Scheduled';
    
    try {
        // cronstrue is loaded globally via CDN
        return window.cronstrue.toString(cronExpression, { 
            use24HourTimeFormat: false,
            verbose: false
        });
    } catch (e) {
        console.warn('Failed to parse CRON expression:', cronExpression, e);
        return cronExpression; // Fallback to raw CRON
    }
}

/**
 * Get the appropriate external link URL for a dataset
 */
function getDatasetUrl(datasetId) {
    return `https://domo.domo.com/datasources/${datasetId}/details/overview`;
}

/**
 * Get the appropriate external link URL for the source (dataflow or connector)
 */
function getSourceUrl(type, typeId, datasetId) {
    if (type?.toUpperCase() === 'DATAFLOW' && typeId) {
        return `https://domo.domo.com/datacenter/dataflows/${typeId}/details#datasets`;
    }
    return getDatasetUrl(datasetId);
}

// ============================================
// Icons (inline SVG) - Minimalist style
// ============================================

const ExternalLinkIcon = () => html`
    <svg className="external-link-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9"/>
    </svg>
`;

const ClockIcon = () => html`
    <svg className="meta-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <circle cx="8" cy="8" r="6"/>
        <path d="M8 5v3l2 2"/>
    </svg>
`;

const TriggerIcon = () => html`
    <svg className="meta-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M9 2L4 9h4l-1 5 5-7H8l1-5z"/>
    </svg>
`;

const ExpandUpIcon = () => html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 19l-7-7 7-7M4 12h16"/>
    </svg>
`;

const ExpandDownIcon = () => html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M13 5l7 7-7 7M20 12H4"/>
    </svg>
`;

const CollapseIcon = () => html`
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
`;

const ChevronDownIcon = ({ flipped }) => html`
    <svg className=${'chevron-icon' + (flipped ? ' flipped' : '')} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 6l4 4 4-4"/>
    </svg>
`;

// ============================================
// Trigger Display Components
// ============================================

function TriggerItem({ trigger }) {
    if (trigger.type === 'SCHEDULE') {
        return html`
            <div className="trigger-item">
                <span className="trigger-type-label trigger-badge-schedule">Scheduled</span>
                <span className="trigger-detail">${formatCron(trigger.cron)}</span>
            </div>
        `;
    }
    
    if (trigger.type === 'DATASET_UPDATED') {
        const datasets = trigger.datasets || [];
        return html`
            <div className="trigger-item">
                <span className="trigger-type-label trigger-badge-dataset">On Dataset Update</span>
                <span className="trigger-detail">
                    ${datasets.length > 0 
                        ? datasets.slice(0, 2).join(', ') + (datasets.length > 2 ? ` +${datasets.length - 2} more` : '')
                        : 'Dependent datasets'}
                </span>
            </div>
        `;
    }
    
    return null;
}

function TriggersSection({ triggerDetails, triggerSummary }) {
    const [expanded, setExpanded] = useState(false);
    
    // Handle manual trigger (no details)
    if (triggerSummary === 'MANUAL' || !triggerDetails || triggerDetails.length === 0) {
        return html`
            <div className="node-triggers">
                <div className="triggers-list">
                    <div className="trigger-item">
                        <span className="trigger-type-label trigger-badge-manual">Manual</span>
                    </div>
                </div>
            </div>
        `;
    }
    
    const visibleTriggers = expanded ? triggerDetails : triggerDetails.slice(0, 2);
    const hasMore = triggerDetails.length > 2;
    
    return html`
        <div className="node-triggers">
            <div className="triggers-list">
                ${visibleTriggers.map((trigger, i) => html`
                    <${TriggerItem} key=${i} trigger=${trigger} />
                `)}
            </div>
            ${hasMore && html`
                <button 
                    className="triggers-expand-btn"
                    onClick=${(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                >
                    ${expanded ? 'Show less' : `+${triggerDetails.length - 2} more`}
                    <${ChevronDownIcon} flipped=${expanded} />
                </button>
            `}
        </div>
    `;
}

// ============================================
// DatasetNode Component
// ============================================

function DatasetNodeComponent({ data, selected }) {
    const {
        datasetId,
        name,
        type,
        subType,
        typeId,
        typeName,
        runtimeSeconds,
        triggerSummary,
        triggerDetails,
        direction,
        isRoot,
        highlighted,
        levelHighlighted,
        upstreamCount,
        downstreamCount,
        expanded,
        isGhost,
        originalNodeId,
        onExpand,
        onCollapse,
        onDismiss,
        onShowLargeNeighborUI,
        onExpandAll,
        onNavigateToOriginal
    } = data;
    
    // Determine which expand buttons to show based on direction
    const showExpandUp = isRoot || direction === DIRECTION.UPSTREAM;
    const showExpandDown = isRoot || direction === DIRECTION.DOWNSTREAM;
    
    const canExpandUp = upstreamCount > 0 && !expanded.up;
    const canExpandDown = downstreamCount > 0 && !expanded.down;
    
    // Build class names
    const nodeClasses = [
        'dataset-node',
        selected && 'selected',
        highlighted && 'highlighted',
        levelHighlighted && 'level-highlighted',
        isRoot && 'root-node',
        isGhost && 'ghost-node'
    ].filter(Boolean).join(' ');
    
    // Handle select expand clicks (opens modal)
    const handleSelectExpandUp = useCallback(() => {
        if (onShowLargeNeighborUI) {
            onShowLargeNeighborUI(DIRECTION.UPSTREAM);
        }
    }, [onShowLargeNeighborUI]);
    
    const handleSelectExpandDown = useCallback(() => {
        if (onShowLargeNeighborUI) {
            onShowLargeNeighborUI(DIRECTION.DOWNSTREAM);
        }
    }, [onShowLargeNeighborUI]);
    
    // Handle expand all clicks (expands all with warning if needed)
    const handleExpandAllUp = useCallback(() => {
        if (onExpandAll) {
            onExpandAll(DIRECTION.UPSTREAM);
        }
    }, [onExpandAll]);
    
    const handleExpandAllDown = useCallback(() => {
        if (onExpandAll) {
            onExpandAll(DIRECTION.DOWNSTREAM);
        }
    }, [onExpandAll]);
    
    const handleCollapse = useCallback(() => {
        if (onCollapse) {
            onCollapse();
        }
    }, [onCollapse]);
    
    const handleCollapseUp = useCallback(() => {
        if (onCollapse) {
            onCollapse(DIRECTION.UPSTREAM);
        }
    }, [onCollapse]);
    
    const handleCollapseDown = useCallback(() => {
        if (onCollapse) {
            onCollapse(DIRECTION.DOWNSTREAM);
        }
    }, [onCollapse]);
    
    const handleDismiss = useCallback((e) => {
        e.stopPropagation();
        if (onDismiss) {
            onDismiss();
        }
    }, [onDismiss]);
    
    // External link handlers
    const handleDatasetClick = useCallback((e) => {
        e.stopPropagation();
        // window.open(getDatasetUrl(datasetId), '_blank');
        domo.navigate(getDatasetUrl(datasetId), true);
    }, [datasetId]);
    
    const handleSourceClick = useCallback((e) => {
        e.stopPropagation();
        // window.open(getSourceUrl(type, typeId, datasetId), '_blank');
        domo.navigate(getSourceUrl(type, typeId, datasetId), true);
    }, [type, typeId, datasetId]);
    
    // Determine source link text based on type and subType
    const isDataflow = type?.toUpperCase() === 'DATAFLOW';
    const typeLabel = isDataflow ? 'dataflow' : 'connector';
    const sourceLinkText = subType 
        ? `${subType} ${typeLabel}` 
        : `${typeLabel}`;
    
    // Determine header class based on type
    const headerClass = isDataflow ? 'node-name-row dataflow' : 'node-name-row connector';
    
    // Determine if collapse buttons should be enabled (for root node)
    const canCollapseUp = expanded.up;
    const canCollapseDown = expanded.down;
    
    // Handle navigate to original (for ghost nodes)
    const handleNavigateToOriginal = useCallback((e) => {
        e.stopPropagation();
        if (onNavigateToOriginal) {
            onNavigateToOriginal();
        }
    }, [onNavigateToOriginal]);

    return html`
        <div className=${nodeClasses}>
            <!-- Dismiss badge (shown when selected) -->
            ${selected && html`
                <button className="node-dismiss-badge" onClick=${handleDismiss} title="Dismiss node">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                </button>
            `}
            
            <!-- Connection handles -->
            <${Handle} 
                type="target" 
                position=${Position.Left} 
                className="react-flow__handle-left"
            />
            <${Handle} 
                type="source" 
                position=${Position.Right} 
                className="react-flow__handle-right"
            />
            
            <!-- Node Toolbar (appears when selected, hidden for ghost nodes) -->
            ${!isGhost && html`
                <${NodeToolbar} isVisible=${selected} position=${Position.Top}>
                    <div className="node-toolbar">
                    ${showExpandUp && html`
                        <button 
                            className="toolbar-btn expand-all"
                            onClick=${handleExpandAllUp}
                            disabled=${!canExpandUp}
                            title=${canExpandUp ? `Expand all ${upstreamCount} upstream datasets` : 'No upstream datasets'}
                        >
                            <${ExpandUpIcon} />
                            <span>All (${upstreamCount})</span>
                        </button>
                        <button 
                            className="toolbar-btn select-expand"
                            onClick=${handleSelectExpandUp}
                            disabled=${!canExpandUp}
                            title=${canExpandUp ? 'Select datasets to expand upstream' : 'No upstream datasets'}
                        >
                            <${ExpandUpIcon} />
                            <span>Select</span>
                        </button>
                    `}
                    
                    <!-- Root node: show two directional collapse buttons -->
                    ${isRoot && html`
                        ${showExpandUp && html`
                            <button 
                                className="toolbar-btn collapse"
                                onClick=${handleCollapseUp}
                                disabled=${!canCollapseUp}
                                title=${canCollapseUp ? 'Collapse upstream nodes' : 'No upstream nodes to collapse'}
                            >
                                <${ExpandUpIcon} />
                                <span>Collapse</span>
                            </button>
                        `}
                        ${(showExpandUp && showExpandDown) && html`
                            <div className="toolbar-divider"></div>
                        `}
                        ${showExpandDown && html`
                            <button 
                                className="toolbar-btn collapse"
                                onClick=${handleCollapseDown}
                                disabled=${!canCollapseDown}
                                title=${canCollapseDown ? 'Collapse downstream nodes' : 'No downstream nodes to collapse'}
                            >
                            <span>Collapse</span>
                            <${ExpandDownIcon} />
                            </button>
                        `}
                    `}
                    
                    <!-- Non-root node: show single collapse button -->
                    ${!isRoot && html`
                        ${(showExpandUp || showExpandDown) && html`
                            <div className="toolbar-divider"></div>
                        `}
                        <button 
                            className="toolbar-btn collapse"
                            onClick=${handleCollapse}
                            disabled=${direction === DIRECTION.UPSTREAM ? !canCollapseUp : !canCollapseDown}
                            title=${direction === DIRECTION.UPSTREAM 
                                ? (canCollapseUp ? 'Collapse upstream nodes' : 'No upstream nodes to collapse')
                                : (canCollapseDown ? 'Collapse downstream nodes' : 'No downstream nodes to collapse')
                            }
                        >
                            ${direction === DIRECTION.UPSTREAM ? html`<${ExpandUpIcon} /> <span>Collapse</span>` : html`<span>Collapse</span> <${ExpandDownIcon} />`}
                            
                        </button>
                        ${(showExpandUp || showExpandDown) && html`
                            <div className="toolbar-divider"></div>
                        `}
                    `}
                    
                    ${showExpandDown && html`
                        <button 
                            className="toolbar-btn select-expand"
                            onClick=${handleSelectExpandDown}
                            disabled=${!canExpandDown}
                            title=${canExpandDown ? 'Select datasets to expand downstream' : 'No downstream datasets'}
                        >
                            <span>Select</span>
                            <${ExpandDownIcon} />
                        </button>
                        <button 
                            className="toolbar-btn expand-all"
                            onClick=${handleExpandAllDown}
                            disabled=${!canExpandDown}
                            title=${canExpandDown ? `Expand all ${downstreamCount} downstream datasets` : 'No downstream datasets'}
                        >
                            <span>All (${downstreamCount})</span>
                            <${ExpandDownIcon} />
                        </button>
                    `}
                </div>
            </>
            `}
            
            <!-- Primary: Dataset Name with Link (Colored Header) -->
            <div className=${headerClass}>
                <span className="node-name">${name}</span>
                <button 
                    className="node-link-btn"
                    onClick=${handleDatasetClick}
                    title="Open dataset in Domo"
                >
                    <${ExternalLinkIcon} />
                </button>
            </div>
            
            <!-- Source Link (hidden for ghost nodes) -->
            ${!isGhost && html`
                <div className="node-source-row">
                    <span className="source-link-text">${sourceLinkText}</span>
                    <button 
                        className="node-link-btn"
                        onClick=${handleSourceClick}
                        title="Open source in Domo"
                    >
                        <${ExternalLinkIcon} />
                    </button>
                </div>
            `}
            
            <!-- Runtime -->
            <div className="node-runtime-row">
                <${ClockIcon} />
                <span className="runtime-label">Runtime:</span>
                <span className="runtime-value">${formatDuration(runtimeSeconds)}</span>
            </div>
            
            <!-- Circular Reference Banner (for ghost nodes) -->
            ${isGhost && html`
                <div className="ghost-banner">
                    <span className="ghost-icon">↻</span>
                    <span className="ghost-label">Circular Reference</span>
                    <button 
                        className="ghost-navigate-btn"
                        onClick=${handleNavigateToOriginal}
                        title="Navigate to the original node"
                    >
                        Go to original →
                    </button>
                </div>
            `}
            
            <!-- Triggers Section (hidden for ghost nodes) -->
            ${!isGhost && html`
                <${TriggersSection} 
                    triggerDetails=${triggerDetails} 
                    triggerSummary=${triggerSummary} 
                />
            `}
        </div>
    `;
}

// Memoize to prevent unnecessary re-renders
export const DatasetNode = memo(DatasetNodeComponent);
