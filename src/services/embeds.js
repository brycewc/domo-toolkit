import { DEPENDENCY_FETCH_CONCURRENCY } from '@/utils/constants';
import { executeInPage } from '@/utils/executeInPage';

const CARD_ID_CHUNK_SIZE = 500;

const EMBED_LINK_TYPE_CHIPS = {
  PRIVATE: { color: 'accent', label: 'Private' },
  SEARCHABLE: { color: 'success', label: 'Public' }
};

// The summary endpoints need content admin. With `fallbackToOwnEmbed`, a caller
// without it gets their own embed of each object instead of an error.

// The app summary endpoint has no ID filter and ignores unknown criteria, so it
// is narrowed by title and filtered to the app here.
export async function getAppEmbeds({ appId, appName = null, fallbackToOwnEmbed = false, tabId = null }) {
  const embeds = await readEmbedSummaries({
    criteria: appName ? { titleSearchText: appName } : {},
    entityId: String(appId),
    entityType: 'DATA_APP',
    fallbackToOwnEmbed,
    summaryPath: '/api/content/v1/dataapps/embed/summary',
    tabId
  });
  return embeds.filter((embed) => embed.entityId === String(appId));
}

export async function getCardEmbeds({ cardIds, fallbackToOwnEmbed = false, tabId = null }) {
  if (cardIds.length === 0) return [];
  const result = await executeInPage(
    async (cardIds, chunkSize, concurrency, fallbackToOwnEmbed) => {
      const LIMIT = 50;
      const summaries = [];
      let summaryStatus = 200;
      for (let start = 0; start < cardIds.length && summaryStatus === 200; start += chunkSize) {
        const chunk = cardIds.slice(start, start + chunkSize).map(Number);
        let read = 0;
        let total = Infinity;
        while (read < total) {
          const response = await fetch(`/api/content/v1/cards/kpi/embed/summary?limit=${LIMIT}&offset=${read}`, {
            body: JSON.stringify({ cardIds: chunk }),
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
          read += rows.length;
          total = page?.total ?? 0;
          if (rows.length === 0) break;
        }
      }
      if (summaryStatus === 200) return { embeds: summaries, ok: true };
      if (!fallbackToOwnEmbed || (summaryStatus !== 401 && summaryStatus !== 403)) {
        return { ok: false, status: summaryStatus };
      }

      const embeds = [];
      let failedStatus = null;
      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, cardIds.length) }, async () => {
          while (next < cardIds.length && failedStatus === null) {
            const cardId = cardIds[next++];
            const response = await fetch(`/api/content/v1/cards/kpi/embed/${cardId}/state`);
            if (response.status === 404) continue;
            if (!response.ok) {
              failedStatus = response.status;
              return;
            }
            const state = await response.json();
            if (state) embeds.push({ cardId, ...state });
          }
        })
      );
      return failedStatus === null ? { embeds, ok: true } : { ok: false, status: failedStatus };
    },
    [cardIds.map(String), CARD_ID_CHUNK_SIZE, DEPENDENCY_FETCH_CONCURRENCY, fallbackToOwnEmbed],
    tabId
  );
  if (!result?.ok) throw embedReadError('card embeds', result?.status);
  return result.embeds
    .filter((embed) => embed?.url && embed.publicLinkType !== 'OFF')
    .map((embed) => ({
      cardId: String(embed.cardId ?? cardIds[0]),
      id: embed.gatewayToken ?? embed.url.split('/').filter(Boolean).pop(),
      linkOwnerName: embed.linkOwnerName ?? null,
      publicLinkType: embed.publicLinkType ?? null,
      url: embed.url
    }));
}

export async function getPageEmbeds({ fallbackToOwnEmbed = false, pageId, tabId = null }) {
  return readEmbedSummaries({
    criteria: { pageIds: [Number(pageId)] },
    entityId: String(pageId),
    entityType: 'PAGE',
    fallbackToOwnEmbed,
    summaryPath: '/api/content/v1/pages/embed/summary',
    tabId
  });
}

export function toEmbedRow(embed, note = null) {
  const type = embed.publicLinkType;
  const chip = type
    ? (EMBED_LINK_TYPE_CHIPS[type] ?? {
        color: 'default',
        label: type.charAt(0) + type.slice(1).toLowerCase().replace(/_/g, ' ')
      })
    : null;
  return {
    annotation: [note, embed.linkOwnerName ? `Created by ${embed.linkOwnerName}` : null].filter(Boolean).join(' ') || null,
    chip,
    id: embed.id,
    label: embed.id,
    typeId: 'PUBLIC_URL',
    url: embed.url
  };
}

function embedReadError(what, status) {
  const error = new Error(`Failed to read ${what}. HTTP status: ${status}`);
  error.status = status;
  return error;
}

// An embed whose sharing is `OFF` has no link, so it is dropped.
async function readEmbedSummaries({ criteria, entityId, entityType, fallbackToOwnEmbed, summaryPath, tabId }) {
  const result = await executeInPage(
    async (summaryPath, criteria, entityId, entityType, fallbackToOwnEmbed) => {
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
      if (!fallbackToOwnEmbed || (summaryStatus !== 401 && summaryStatus !== 403)) {
        return { ok: false, status: summaryStatus };
      }

      const response = await fetch(`/api/content/v1/pages/embed/${entityId}/state`);
      if (response.status === 404) return { embeds: [], ok: true };
      if (!response.ok) return { ok: false, status: response.status };
      const state = await response.json();
      const matches = state && (!state.entityType || state.entityType === entityType);
      return { embeds: matches ? [{ entityId, ...state }] : [], ok: true };
    },
    [summaryPath, criteria, entityId, entityType, fallbackToOwnEmbed],
    tabId
  );
  if (!result?.ok) throw embedReadError('embeds', result?.status);
  return result.embeds
    .filter((embed) => embed?.url && embed.publicLinkType !== 'OFF' && embed.publicLink !== 'OFF')
    .map((embed) => ({
      entityId: String(embed.entityId ?? embed.pageId ?? embed.entityKey ?? entityId),
      id: embed.gatewayToken ?? embed.url.split('/').filter(Boolean).pop(),
      linkOwnerName: embed.linkOwnerName ?? null,
      publicLinkType: embed.publicLinkType ?? embed.publicLink ?? null,
      url: embed.url
    }));
}
