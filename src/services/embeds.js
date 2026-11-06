import { executeInPage } from '@/utils/executeInPage';

// The app summary endpoint has no ID filter and ignores unknown criteria, so it
// is narrowed by title and filtered to the app here. Like the page lookup, it
// needs content admin and otherwise falls back to the caller's own embed.
export async function getAppEmbeds({ appId, appName = null, tabId = null }) {
  const embeds = await readEmbedSummaries({
    criteria: appName ? { titleSearchText: appName } : {},
    entityId: String(appId),
    entityType: 'DATA_APP',
    summaryPath: '/api/content/v1/dataapps/embed/summary',
    tabId
  });
  return embeds.filter((embed) => embed.entityId === String(appId));
}

export async function getPageEmbeds({ pageId, tabId = null }) {
  return readEmbedSummaries({
    criteria: { pageIds: [Number(pageId)] },
    entityId: String(pageId),
    entityType: 'PAGE',
    summaryPath: '/api/content/v1/pages/embed/summary',
    tabId
  });
}

// An embed whose sharing is `OFF` has no link, so it is dropped.
async function readEmbedSummaries({ criteria, entityId, entityType, summaryPath, tabId }) {
  const result = await executeInPage(
    async (summaryPath, criteria, entityId, entityType) => {
      const LIMIT = 50;
      const summaries = [];
      let total = Infinity;
      let summaryStatus = 200;
      while (summaries.length < total) {
        const response = await fetch(`${summaryPath}?limit=${LIMIT}&offset=${summaries.length}`, {
          body: JSON.stringify(criteria),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) {
          summaryStatus = response.status;
          break;
        }
        const page = await response.json();
        const rows = page?.summaries || [];
        summaries.push(...rows);
        total = page?.total ?? 0;
        if (rows.length === 0) break;
      }
      if (summaryStatus === 200) return { embeds: summaries, ok: true };
      if (summaryStatus !== 401 && summaryStatus !== 403) return { ok: false, status: summaryStatus };

      const response = await fetch(`/api/content/v1/pages/embed/${entityId}/state`);
      if (response.status === 404) return { embeds: [], ok: true };
      if (!response.ok) return { ok: false, status: response.status };
      const state = await response.json();
      const matches = state && (!state.entityType || state.entityType === entityType);
      return { embeds: matches ? [{ entityId, ...state }] : [], ok: true };
    },
    [summaryPath, criteria, entityId, entityType],
    tabId
  );
  if (!result?.ok) {
    const error = new Error(`Failed to read embeds. HTTP status: ${result?.status}`);
    error.status = result?.status;
    throw error;
  }
  return result.embeds
    .filter((embed) => embed?.url && embed.publicLinkType !== 'OFF' && embed.publicLink !== 'OFF')
    .map((embed) => ({
      entityId: String(embed.entityId ?? embed.pageId ?? embed.entityKey ?? entityId),
      id: String(embed.id ?? embed.gatewayToken ?? embed.url),
      linkOwnerName: embed.linkOwnerName ?? null,
      publicLinkType: embed.publicLinkType ?? embed.publicLink ?? null,
      token: embed.gatewayToken ?? embed.url.split('/').filter(Boolean).pop(),
      url: embed.url
    }));
}
