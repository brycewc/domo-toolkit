// ============================================
// App Component
// ============================================
// Main application shell with menu bar and flow canvas

import { html } from 'htm/react';
import { useState, useCallback, useRef, useEffect } from 'react';
import { Flow } from './Flow.js';
import { initializeData, nodeExists, getNodeMeta } from '../../data.js';
import { layoutGraph } from '../utils/layout.js';
import { formatDuration } from '../utils/format.js';

// ============================================
// Toast Component
// ============================================

function Toast({ message, type, onClose }) {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);
    
    return html`
        <div className=${'toast ' + type}>
            ${message}
        </div>
    `;
}

function ToastContainer({ toasts, removeToast }) {
    return html`
        <div className="toast-container">
            ${toasts.map(toast => html`
                <${Toast} 
                    key=${toast.id}
                    message=${toast.message}
                    type=${toast.type}
                    onClose=${() => removeToast(toast.id)}
                />
            `)}
        </div>
    `;
}

// ============================================
// App Icon
// ============================================

function AppIcon() {
    return html`
        <svg className="app-icon" viewBox="0 0 32 32" fill="currentColor">
            <!-- Main node (center) -->
            <circle cx="16" cy="16" r="4" fill="currentColor"/>
            
            <!-- Upstream nodes (left) -->
            <circle cx="6" cy="10" r="2.5" fill="currentColor" opacity="0.7"/>
            <circle cx="6" cy="22" r="2.5" fill="currentColor" opacity="0.7"/>
            
            <!-- Downstream nodes (right) -->
            <circle cx="26" cy="10" r="2.5" fill="currentColor" opacity="0.7"/>
            <circle cx="26" cy="22" r="2.5" fill="currentColor" opacity="0.7"/>
            
            <!-- Edges -->
            <line x1="8.5" y1="10" x2="12" y2="14" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
            <line x1="8.5" y1="22" x2="12" y2="18" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
            <line x1="20" y1="14" x2="23.5" y2="10" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
            <line x1="20" y1="18" x2="23.5" y2="22" stroke="currentColor" strokeWidth="1.5" opacity="0.5"/>
        </svg>
    `;
}

// ============================================
// Runtime Badge Component
// ============================================

function RuntimeBadge({ pathRuntime }) {
    if (pathRuntime == null) return null;
    
    return html`
        <div className="runtime-badge">
            <span className="runtime-badge-label">Estimated</span>
            <span className="runtime-badge-value">${formatDuration(pathRuntime)}</span>
            <span className="runtime-badge-label">runtime from selected dataset to root dataset</span>
        </div>
    `;
}

// ============================================
// Menu Bar Component
// ============================================

function MenuBar({ 
    datasetId, 
    onDatasetIdChange, 
    onRenderRoot, 
    onClearCanvas,
    isLoading,
    hasNodes,
    pathRuntime
}) {
    const handleSubmit = useCallback((e) => {
        e.preventDefault();
        onRenderRoot();
    }, [onRenderRoot]);
    
    const handleKeyDown = useCallback((e) => {
        if (e.key === 'Enter') {
            onRenderRoot();
        }
    }, [onRenderRoot]);
    
    return html`
        <div className="menu-bar">
            <div className="app-branding">
                <h1 className="app-title">Lineage Explorer</h1>
            </div>
            
            <div className="menu-divider"></div>
            
            <form className="input-group" onSubmit=${handleSubmit}>
                <input 
                    id="dataset-id"
                    type="text"
                    className="dataset-input"
                    placeholder="Enter a Dataset ID"
                    value=${datasetId}
                    onChange=${e => onDatasetIdChange(e.target.value)}
                    onKeyDown=${handleKeyDown}
                    disabled=${isLoading}
                />
                <button 
                    type="submit"
                    className="btn btn-primary"
                    disabled=${isLoading || !datasetId.trim()}
                >
                    ${isLoading ? 'Loading...' : 'Explore Lineage'}
                </button>
            </form>
            
            <${RuntimeBadge} pathRuntime=${pathRuntime} />
            
            <div className="menu-spacer"></div>
            
            <button 
                className="btn btn-secondary"
                onClick=${onClearCanvas}
                disabled=${!hasNodes}
            >
                Clear Canvas
            </button>
        </div>
    `;
}

// ============================================
// Loading Overlay
// ============================================

function LoadingOverlay({ message }) {
    return html`
        <div className="loading-overlay">
            <div style=${{ textAlign: 'center' }}>
                <div className="loading-spinner"></div>
                <p style=${{ marginTop: '16px', color: 'var(--text-secondary)' }}>
                    ${message || 'Loading...'}
                </p>
            </div>
        </div>
    `;
}

// ============================================
// Main App Component
// ============================================

export function App() {
    // Data loading state
    const [dataReady, setDataReady] = useState(false);
    const [loadingMessage, setLoadingMessage] = useState('Loading lineage data...');
    const [isWaitingForData, setIsWaitingForData] = useState(false);
    const dataFetchRef = useRef(null);

    // UI state
    const [datasetId, setDatasetId] = useState('');
    const [hasNodes, setHasNodes] = useState(false);
    const [pathRuntime, setPathRuntime] = useState(null);
    const [focusNodeId, setFocusNodeId] = useState(null); // Track root node for fit

    // Toast state
    const [toasts, setToasts] = useState([]);
    const toastIdRef = useRef(0);

    // Graph state ref (will be populated by Flow component)
    const graphStateRef = useRef(null);

    // Toast helpers
    const addToast = useCallback((message, type = 'info') => {
        const id = ++toastIdRef.current;
        setToasts(prev => [...prev, { id, message, type }]);
    }, []);

    const removeToast = useCallback((id) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    }, []);

    // Initialize data on mount
    useEffect(() => {
        let mounted = true;

        // Prevent default Domo refresh on dataset update
        const unsubscribe = domo.onDataUpdated((alias) => {
            console.log(`Dataset ${alias} was updated. Refresh for newest data.`);
            // Do Nothing
        });

        // Kick off data fetch in the background — do not block the UI
        dataFetchRef.current = initializeData();
        dataFetchRef.current
            .then(() => {
                if (mounted) setDataReady(true);
            })
            .catch((err) => {
                console.error('Background data fetch failed:', err);
                // Leave dataReady=false so handleRenderRoot can surface the error on submit
            });

        return () => { 
            mounted = false; 
            unsubscribe(); // Clean up listener
        };
    }, [addToast]);

    // Handle render root
    const handleRenderRoot = useCallback(async () => {
        const trimmedId = datasetId.trim();

        if (!trimmedId) {
            addToast('Please enter a Dataset ID', 'warning');
            return;
        }

        // If data hasn't finished loading yet, show blocking overlay and wait
        if (!dataReady) {
            setIsWaitingForData(true);
            try {
                await dataFetchRef.current;
                setDataReady(true);
            } catch (err) {
                console.error('Failed to load data:', err);
                addToast('Failed to load data. Please refresh.', 'error');
                setIsWaitingForData(false);
                return;
            } finally {
                setIsWaitingForData(false);
            }
        }

        if (!nodeExists(trimmedId)) {
            addToast(`Dataset "${trimmedId}" not found`, 'error');
            return;
        }

        const gs = graphStateRef.current;
        if (!gs) {
            addToast('Graph not ready. Please try again.', 'error');
            return;
        }

        const rootNode = gs.initRoot(trimmedId);
        if (rootNode) {
            setHasNodes(true);
            setFocusNodeId(rootNode.id); // Set focus to new root node
            const meta = getNodeMeta(trimmedId);
            addToast(`Loaded: ${meta?.name || trimmedId}`, 'success');
        }
    }, [dataReady, datasetId, addToast]);

    // Handle clear canvas
    const handleClearCanvas = useCallback(() => {
        const gs = graphStateRef.current;
        if (gs) {
            gs.clear();
            setHasNodes(false);
            setFocusNodeId(null); // Clear focus node on canvas clear
            addToast('Canvas cleared', 'info');
        }
    }, [addToast]);

    // Track if flow has nodes
    const handleNodesChange = useCallback((nodeCount) => {
        setHasNodes(nodeCount > 0);
    }, []);

    // Handle selection changes and path runtime updates
    const handleSelectionChange = useCallback((selection) => {
        if (selection && selection.pathRuntime != null) {
            setPathRuntime(selection.pathRuntime);
        } else {
            setPathRuntime(null);
        }
    }, []);

    return html`
        <div className="app-container">
            <${MenuBar}
                datasetId=${datasetId}
                onDatasetIdChange=${setDatasetId}
                onRenderRoot=${handleRenderRoot}
                onClearCanvas=${handleClearCanvas}
                isLoading=${isWaitingForData}
                hasNodes=${hasNodes}
                pathRuntime=${pathRuntime}
            />

            <div className="canvas-container">
                ${isWaitingForData && html`<${LoadingOverlay} message=${loadingMessage} />`}
                <${Flow}
                    graphState=${graphStateRef}
                    onToast=${addToast}
                    onSelectionChange=${handleSelectionChange}
                    focusNodeId=${focusNodeId}
                />
            </div>

            <${ToastContainer} toasts=${toasts} removeToast=${removeToast} />
        </div>
    `;
}
