/**
 * Get the App ID (parent) for an App Studio Page
 * @param {string} appPageId - The App Studio Page ID
 * @param {string} baseUrl - The base URL
 * @returns {Promise<string>} The App ID
 * @throws {Error} If the parent cannot be fetched
 */
export async function getAppStudioPageParent(appPageId, baseUrl) {
	try {
		// Use the page summary endpoint to get the parent App ID
		const response = await fetch(
			`${baseUrl}/api/content/v1/pages/summary?limit=1&skip=0`,
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				credentials: 'include',
				body: JSON.stringify({
					pageId: appPageId
				})
			}
		);

		if (!response.ok) {
			throw new Error(
				`Failed to fetch App Studio Page ${appPageId}. HTTP status: ${response.status}`
			);
		}

		const data = await response.json();

		if (!data.pages || data.pages.length === 0) {
			throw new Error(`No page data returned for App Studio Page ${appPageId}`);
		}

		const appId = data.pages[0].dataAppId;

		if (!appId) {
			throw new Error(`No dataAppId found for App Studio Page ${appPageId}`);
		}

		return appId.toString();
	} catch (error) {
		console.error('Error fetching App Studio Page parent:', error);
		throw error;
	}
}
