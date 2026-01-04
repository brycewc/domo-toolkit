/**
 * Get the App ID (parent) for an App Studio Page
 * @param {string} appPageId - The App Studio Page ID
 * @param {string} baseUrl - The base URL
 * @returns {Promise<string>} The App ID
 * @throws {Error} If the parent cannot be fetched
 */
export async function getAppStudioPageParent(appPageId, baseUrl) {
	try {
		// Fetch cards from the app page
		const response = await fetch(
			`${baseUrl}/api/content/v3/stacks/${appPageId}/cards`,
			{
				method: 'GET'
			}
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch App Studio Page ${appPageId}. HTTP status: ${response.status}`
			);
		}

		const page = await response.json();

		if (!Array.isArray(page.cards) || page.cards.length === 0) {
			throw new Error(
				`The App Studio Page ${appPageId} has no Cards. The only way to get App ID (needed to navigate) is through Cards on the App Studio Page.`
			);
		}

		// Get the first card
		const card = page.cards[0];

		// Fetch card details to get the app ID
		const cardResponse = await fetch(
			`${baseUrl}/api/content/v1/cards?urns=${card.id}&parts=adminAllPages`,
			{
				method: 'GET'
			}
		);

		if (!cardResponse.ok) {
			throw new Error(
				`Failed to fetch Card details. HTTP status: ${cardResponse.status}`
			);
		}

		const cards = await cardResponse.json();

		if (!Array.isArray(cards) || cards.length === 0) {
			throw new Error('No card details returned');
		}

		const cardDetails = cards[0];
		const appId = cardDetails.adminAllAppPages.find(
			(appPage) => appPage.appPageId == appPageId
		)?.appId;

		if (!appId) {
			throw new Error(
				`Failed to get App ID from first card on page ${appPageId}.`
			);
		}

		return appId.toString();
	} catch (error) {
		console.error('Error fetching App Studio Page parent:', error);
		throw error;
	}
}
