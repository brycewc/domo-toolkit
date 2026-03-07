// ============================================
// ExpansionModal Component
// ============================================
// Modal for selecting which neighbors to expand when
// the neighbor count exceeds the threshold (>10)

import { html } from 'htm/react';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { DIRECTION } from '../state.js';

// ============================================
// Icons
// ============================================

const CloseIcon = () => html`
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
`;

// ============================================
// ExpansionModal Component
// ============================================

export function ExpansionModal({ 
    isOpen, 
    onClose, 
    direction, 
    neighbors,  // Array of { id, name }
    onExpandSelected  // Called with array of selected IDs
}) {
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedIds, setSelectedIds] = useState(new Set());
    
    // Reset modal state whenever it opens or neighbors change
    useEffect(() => {
        if (isOpen) {
            setSearchTerm('');
            setSelectedIds(new Set());
        }
    }, [isOpen, neighbors]);
    
    const directionLabel = direction === DIRECTION.UPSTREAM ? 'Upstream' : 'Downstream';
    
    // Filter neighbors by search term and sort alphabetically
    const filteredNeighbors = useMemo(() => {
        const sorted = [...neighbors].sort((a, b) => a.name.localeCompare(b.name));
        if (!searchTerm.trim()) return sorted;
        const term = searchTerm.toLowerCase();
        return sorted.filter(n => 
            n.name.toLowerCase().includes(term) || 
            n.id.toLowerCase().includes(term)
        );
    }, [neighbors, searchTerm]);
    
    // Toggle selection
    const toggleSelection = useCallback((id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);
    
    // Select all visible
    const selectAll = useCallback(() => {
        setSelectedIds(new Set(filteredNeighbors.map(n => n.id)));
    }, [filteredNeighbors]);
    
    // Clear selection
    const clearSelection = useCallback(() => {
        setSelectedIds(new Set());
    }, []);
    
    // Handle expand selected
    const handleExpandSelected = useCallback(() => {
        if (selectedIds.size > 0 && onExpandSelected) {
            onExpandSelected([...selectedIds]);
            onClose();
        }
    }, [selectedIds, onExpandSelected, onClose]);
    
    // Reset state when closing
    const handleClose = useCallback(() => {
        setSearchTerm('');
        setSelectedIds(new Set());
        onClose();
    }, [onClose]);
    
    if (!isOpen) return null;
    
    return html`
        <div className="expansion-modal-overlay" onClick=${handleClose}>
            <div className="expansion-modal" onClick=${e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Expand ${directionLabel}</h3>
                    <button className="modal-close" onClick=${handleClose}>
                        <${CloseIcon} />
                    </button>
                </div>
                
                <div className="modal-body">
                    
                    <div className="option-section">
                        <div className="search-bar">
                            <input 
                                type="text"
                                className="search-input"
                                placeholder="Type to filter by name or ID..."
                                value=${searchTerm}
                                onChange=${e => setSearchTerm(e.target.value)}
                            />
                            <div className="search-actions">
                                <button 
                                    className="btn btn-secondary btn-small"
                                    onClick=${selectAll}
                                >
                                    Select All
                                </button>
                                <button 
                                    className="btn btn-secondary btn-small"
                                    onClick=${clearSelection}
                                >
                                    Clear
                                </button>
                            </div>
                        </div>
                        
                        <div className="dataset-list">
                            ${filteredNeighbors.map(neighbor => html`
                                <div 
                                    key=${neighbor.id}
                                    className=${'dataset-list-item' + (selectedIds.has(neighbor.id) ? ' selected' : '')}
                                    onClick=${() => toggleSelection(neighbor.id)}
                                >
                                    <input 
                                        type="checkbox" 
                                        checked=${selectedIds.has(neighbor.id)}
                                        readOnly
                                    />
                                    <span className="dataset-name">${neighbor.name}</span>
                                </div>
                            `)}
                            ${filteredNeighbors.length === 0 && html`
                                <div className="dataset-list-empty">
                                    No matches found
                                </div>
                            `}
                        </div>
                    </div>
                </div>
                
                <div className="modal-footer">
                    <div className="selection-info">
                        ${selectedIds.size > 0 
                            ? html`<span><strong>${selectedIds.size}</strong> datasets selected</span>`
                            : html`<span className="text-muted">No datasets selected</span>`
                        }
                    </div>
                    <button 
                        className="btn btn-primary btn-large"
                        onClick=${handleExpandSelected}
                        disabled=${selectedIds.size === 0}
                    >
                        Expand ${selectedIds.size} Selected
                    </button>
                </div>
            </div>
        </div>
    `;
}
