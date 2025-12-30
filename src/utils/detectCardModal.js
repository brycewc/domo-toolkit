/**
 * Detects if a card modal is open and returns the card ID
 * @returns {string|null} Card ID if modal is open, null otherwise
 */
export function detectCardModal() {
	const detailsEl = document.querySelector('cd-details-title');

	if (!detailsEl) {
		return null;
	}

	try {
		if (window.angular && typeof window.angular.element === 'function') {
			const ngScope = window.angular.element(detailsEl).scope();
			const kpiId = ngScope && ngScope.$ctrl && ngScope.$ctrl.kpiId;
			return kpiId || null;
		}
	} catch (e) {
		// Ignore and return null
	}

	return null;
}
