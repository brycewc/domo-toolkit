// ============================================
// Format Utilities
// ============================================
// Shared formatting functions for time durations and other display values

/**
 * Format seconds to human-readable duration (e.g., "2m 34s", "1h 12m")
 * @param {number|null} seconds - Duration in seconds
 * @returns {string} Formatted duration string or '—' if null/invalid
 */
export function formatDuration(seconds) {
    if (seconds == null || seconds < 0) return '—';
    
    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    }
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.round(seconds % 60);
    
    if (hours > 0) {
        return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
    }
    
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
}
