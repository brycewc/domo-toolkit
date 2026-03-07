// ============================================
// ConfirmationModal Component
// ============================================
// Simple modal for confirming actions with a message

import { html } from 'htm/react';

// ============================================
// Icons
// ============================================

const CloseIcon = () => html`
    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M18 6L6 18M6 6l12 12"/>
    </svg>
`;

// ============================================
// ConfirmationModal Component
// ============================================

export function ConfirmationModal({ 
    isOpen, 
    onClose, 
    onConfirm,
    message,
    cancelLabel = 'Cancel',
    confirmLabel = 'Continue'
}) {
    if (!isOpen) return null;
    
    return html`
        <div className="expansion-modal-overlay" onClick=${onClose}>
            <div className="confirmation-modal" onClick=${e => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">Confirm Action</h3>
                    <button className="modal-close" onClick=${onClose}>
                        <${CloseIcon} />
                    </button>
                </div>
                
                <div className="modal-body">
                    <p className="confirmation-message">${message}</p>
                </div>
                
                <div className="modal-footer">
                    <button 
                        className="btn btn-secondary btn-large"
                        onClick=${onClose}
                    >
                        ${cancelLabel}
                    </button>
                    <button 
                        className="btn btn-primary btn-large"
                        onClick=${onConfirm}
                    >
                        ${confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    `;
}
