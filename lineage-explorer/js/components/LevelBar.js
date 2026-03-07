// ============================================
// LevelBar Component
// ============================================
// Displays a breadcrumb-style level bar showing the depth hierarchy
// of the graph with expand controls and hover preview

import { html } from 'htm/react';
import { memo, useCallback } from 'react';
import { DIRECTION } from '../state.js';

// ============================================
// Sub-Components
// ============================================

function LevelPill({ level, direction, isRoot, onExpand, onCollapse, onHover, onHoverEnd, onRootClick }) {
    const handleMouseEnter = useCallback(() => {
        onHover?.(direction, level.depth);
    }, [direction, level.depth, onHover]);
    
    const handleMouseLeave = useCallback(() => {
        onHoverEnd?.();
    }, [onHoverEnd]);
    
    const handleClick = useCallback(() => {
        if (isRoot) {
            // Root pill: focus view on root node
            onRootClick?.();
        } else if (level.allExpanded && !isRoot) {
            // Fully expanded: collapse this level and beyond
            onCollapse?.(direction, level.depth);
        } else if (level.potentialChildrenCount > 0) {
            // Has expandable children: expand them
            onExpand?.(direction, level.depth);
        }
    }, [direction, level.depth, level.allExpanded, level.potentialChildrenCount, isRoot, onExpand, onCollapse, onRootClick]);
    
    const pillClass = [
        'level-pill',
        level.allExpanded && 'fully-expanded',
        level.allExpanded && !isRoot && 'collapsible',
        level.potentialChildrenCount > 0 && 'has-expandable',
        isRoot && 'root-pill'
    ].filter(Boolean).join(' ');
    
    const label = isRoot 
        ? 'Root' 
        : `L${level.depth}`;
    
    // Determine tooltip based on state
    let tooltip;
    if (isRoot) {
        tooltip = 'Fit view to root dataset';
    } else if (level.allExpanded) {
        tooltip = `Collapse all ${level.revealedChildrenCount} datasets at this level`;
    } else if (level.potentialChildrenCount > 0) {
        tooltip = `Expand ${level.potentialChildrenCount} more datasets (${level.revealedChildrenCount} already expanded)`;
    } else {
        tooltip = `${level.revealedChildrenCount} datasets at this level.`;
    }
    
    return html`
        <button 
            className=${pillClass}
            onClick=${handleClick}
            onMouseEnter=${handleMouseEnter}
            onMouseLeave=${handleMouseLeave}
            disabled=${!isRoot && level.potentialChildrenCount === 0 && !level.allExpanded}
            title=${tooltip}
        >
            <span className="level-label">${label}</span>
            ${!isRoot && level.potentialChildrenCount > 0 && html`
                <span className="level-expandable">+${level.potentialChildrenCount}</span>
            `}
            ${!isRoot && html`
                <span className="level-count">${level.revealedChildrenCount}</span>
            `}
            ${!isRoot && level.allExpanded && html`
                <span className="level-collapsible">−</span>
            `}
        </button>
    `;
}

function FrontierPill({ direction, count, onExpand }) {
    const handleClick = useCallback(() => {
        if (count > 0) {
            onExpand?.(direction, null); // null depth = frontier
        }
    }, [direction, count, onExpand]);
    
    const tooltip = count === 0
        ? `No datasets to expand ${direction === DIRECTION.UPSTREAM ? 'upstream' : 'downstream'}`
        : `Expand ${count} datasets ${direction === DIRECTION.UPSTREAM ? 'upstream' : 'downstream'}`;
    
    return html`
        <button 
            className="level-pill frontier-pill"
            onClick=${handleClick}
            disabled=${count === 0}
            title=${tooltip}
        >
            <span className="frontier-icon">+</span>
            <span className="level-expandable">${count}</span>
        </button>
    `;
}

// ============================================
// Main LevelBar Component
// ============================================

function LevelBarComponent({ 
    upstreamLevels,      // from getLevelSummary(UPSTREAM)
    downstreamLevels,    // from getLevelSummary(DOWNSTREAM)
    upstreamFrontierCount,
    downstreamFrontierCount,
    onExpandLevel,       // (direction, depth) => void — depth=null means frontier
    onCollapseLevel,     // (direction, depth) => void
    onHoverLevel,        // (direction, depth) => void
    onHoverEnd,          // () => void
    onRootClick          // () => void — focus view on root node
}) {
    const hasContent = (upstreamLevels?.length > 0) || (downstreamLevels?.length > 0);
    if (!hasContent) return null;
    
    // Find root level (depth 0) — it appears in both, so extract it
    const rootLevel = upstreamLevels?.find(l => l.depth === 0) 
        || downstreamLevels?.find(l => l.depth === 0);
    
    // Upstream levels (excluding root), reversed so deeper is on the left
    const upLevels = (upstreamLevels || [])
        .filter(l => l.depth > 0)
        .sort((a, b) => b.depth - a.depth); // deepest first (leftmost)
    
    // Downstream levels (excluding root)
    const downLevels = (downstreamLevels || [])
        .filter(l => l.depth > 0)
        .sort((a, b) => a.depth - b.depth); // shallowest first (closest to root)
    
    return html`
        <div className="level-bar">
            <div className="level-bar-section upstream">
                <${FrontierPill} 
                    direction=${DIRECTION.UPSTREAM}
                    count=${upstreamFrontierCount}
                    onExpand=${onExpandLevel}
                />
                ${upLevels.map(level => html`
                    <span key=${'conn-up-' + level.depth} className="level-connector">—</span>
                    <${LevelPill}
                        key=${'up-' + level.depth}
                        level=${level}
                        direction=${DIRECTION.UPSTREAM}
                        onExpand=${onExpandLevel}
                        onCollapse=${onCollapseLevel}
                        onHover=${onHoverLevel}
                        onHoverEnd=${onHoverEnd}
                    />
                `)}
            </div>
            
            ${(upLevels.length > 0 || upstreamFrontierCount > 0) && html`
                <span className="level-connector">—</span>
            `}
            
            ${rootLevel && html`
                <${LevelPill}
                    level=${rootLevel}
                    direction=${null}
                    isRoot=${true}
                    onHover=${onHoverLevel}
                    onHoverEnd=${onHoverEnd}
                    onRootClick=${onRootClick}
                />
            `}
            
            ${(downLevels.length > 0 || downstreamFrontierCount > 0) && html`
                <span className="level-connector">—</span>
            `}
            
            <div className="level-bar-section downstream">
                ${downLevels.map(level => html`
                    <${LevelPill}
                        key=${'down-' + level.depth}
                        level=${level}
                        direction=${DIRECTION.DOWNSTREAM}
                        onExpand=${onExpandLevel}
                        onCollapse=${onCollapseLevel}
                        onHover=${onHoverLevel}
                        onHoverEnd=${onHoverEnd}
                    />
                    <span key=${'conn-down-' + level.depth} className="level-connector">—</span>
                `)}
                <${FrontierPill} 
                    direction=${DIRECTION.DOWNSTREAM}
                    count=${downstreamFrontierCount}
                    onExpand=${onExpandLevel}
                />
            </div>
        </div>
    `;
}

export const LevelBar = memo(LevelBarComponent);
