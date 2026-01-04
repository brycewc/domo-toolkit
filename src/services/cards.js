export async function getDrillParentCardId(drillViewId, baseUrl) {
	const response = await fetch(
		`${baseUrl}/api/content/v1/cards/${drillViewId}/urn`,
		{
			method: 'GET'
		}
	);
	if (!response.ok) {
		throw new Error(
			`Failed to fetch Drill Path ${drillViewId}. HTTP status: ${response.status}`
		);
	}
	const card = await response.json();
	return card.rootId;
}
