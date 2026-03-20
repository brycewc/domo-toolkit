// ============================================
// NodeSearch Component
// ============================================
// Search bar for finding and navigating to nodes in the graph
// Searches by dataset name or dataset ID

import { html } from 'htm/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { useReactFlow } from '@xyflow/react';

// ============================================
// NodeSearch Component
// ============================================

export function NodeSearch() {
    const [searchQuery, setSearchQuery] = useState('');
    const [isOpen, setIsOpen] = useState(false);
    const [searchResults, setSearchResults] = useState([]);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);
    const resultsRef = useRef(null);
    
    const { getNodes, setNodes, fitView } = useReactFlow();
    
    // Search logic: filter by name OR datasetId
    const handleSearch = useCallback((query) => {
        setSearchQuery(query);
        
        if (!query || query.trim() === '') {
            setSearchResults([]);
            setIsOpen(false);
            setSelectedIndex(0);
            return;
        }
        
        const lowerQuery = query.toLowerCase();
        const nodes = getNodes();
        
        const results = nodes.filter(node => {
            const name = node.data?.name || '';
            const datasetId = node.data?.datasetId || '';
            
            return name.toLowerCase().includes(lowerQuery) || 
                   datasetId.toLowerCase().includes(lowerQuery);
        });
        
        setSearchResults(results);
        setIsOpen(results.length > 0);
        setSelectedIndex(0);
    }, [getNodes]);
    
    // Handle node selection
    const selectNode = useCallback((node) => {
        if (!node) return;
        
        // Deselect all nodes, then select the target
        setNodes((nodes) =>
            nodes.map((n) => ({
                ...n,
                selected: n.id === node.id
            }))
        );
        
        // Fit view to the selected node with animation
        setTimeout(() => {
            fitView({
                nodes: [{ id: node.id }],
                duration: 500,
                padding: 0.3
            });
        }, 50);
        
        // Clear search and close results
        setSearchQuery('');
        setSearchResults([]);
        setIsOpen(false);
        setSelectedIndex(0);
        
        // Blur the input
        if (inputRef.current) {
            inputRef.current.blur();
        }
    }, [setNodes, fitView]);
    
    // Keyboard navigation
    const handleKeyDown = useCallback((e) => {
        if (!isOpen || searchResults.length === 0) return;
        
        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex((prev) => 
                    prev < searchResults.length - 1 ? prev + 1 : prev
                );
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex((prev) => prev > 0 ? prev - 1 : prev);
                break;
            case 'Enter':
                e.preventDefault();
                if (searchResults[selectedIndex]) {
                    selectNode(searchResults[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setSearchQuery('');
                setSearchResults([]);
                setIsOpen(false);
                setSelectedIndex(0);
                if (inputRef.current) {
                    inputRef.current.blur();
                }
                break;
        }
    }, [isOpen, searchResults, selectedIndex, selectNode]);
    
    // Scroll selected item into view
    useEffect(() => {
        if (resultsRef.current && isOpen) {
            const selectedElement = resultsRef.current.children[selectedIndex];
            if (selectedElement) {
                selectedElement.scrollIntoView({
                    block: 'nearest',
                    behavior: 'smooth'
                });
            }
        }
    }, [selectedIndex, isOpen]);
    
    // Handle click outside to close
    useEffect(() => {
        const handleClickOutside = (e) => {
            if (inputRef.current && !inputRef.current.contains(e.target)) {
                if (resultsRef.current && !resultsRef.current.contains(e.target)) {
                    setIsOpen(false);
                }
            }
        };
        
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);
    
    return html`
        <div className="node-search">
                <input
                    ref=${inputRef}
                    type="text"
                    className="node-search-input"
                    placeholder="Locate a dataset..."
                    value=${searchQuery}
                    onChange=${(e) => handleSearch(e.target.value)}
                    onKeyDown=${handleKeyDown}
                    onFocus=${() => searchQuery && setIsOpen(searchResults.length > 0)}
                />
                
                ${isOpen && html`
                    <div ref=${resultsRef} className="node-search-results">
                        ${searchResults.length === 0 ? html`
                            <div className="node-search-empty">No results found</div>
                        ` : searchResults.map((node, index) => html`
                            <div
                                key=${node.id}
                                className=${`node-search-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick=${() => selectNode(node)}
                                onMouseEnter=${() => setSelectedIndex(index)}
                            >
                                <div className="node-search-item-name">${node.data.name}</div>
                                <!-- <div className="node-search-item-id">${node.data.datasetId}</div> -->
                            </div>
                        `)}
                    </div>
                `}
        </div>
    `;
}
