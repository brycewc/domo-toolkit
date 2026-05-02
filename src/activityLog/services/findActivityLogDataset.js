import { executeInPage } from '@/utils';

const DATASOURCES_PAGE_SIZE = 50;
const STREAMS_BATCH_SIZE = 50;

/**
 * Find the DomoStats Activity Log dataset in the current Domo instance.
 *
 * Two-step lookup:
 *   1. List all `dataProviderType=domostats` datasets and collect their
 *      `streamId`s, paginating via `_metadata.totalCount`.
 *   2. Bulk-fetch streams in batches of 50 and scan each stream's
 *      `configuration` array for `{ name: 'report', value: 'audit' }`.
 *      The matching stream's `dataSource.id` is the Activity Log dataset.
 *
 * DomoStats enforces one dataset per report type per instance, so the search
 * returns at most one match. Returns `null` when no Activity Log dataset is
 * connected (the caller surfaces a help alert in that case).
 *
 * Both calls run via `executeInPage` for cookie-authed access, matching the
 * existing service patterns.
 *
 * @param {Object} params
 * @param {number} params.tabId - Chrome tab ID for the Domo page (auth context)
 * @returns {Promise<string|null>} The dataset UUID, or `null` if not found
 */
export async function findActivityLogDataset({ tabId } = {}) {
  return executeInPage(
    async (datasourcesPageSize, streamsBatchSize) => {
      // --- Step 1: list DomoStats datasets, collecting stream IDs ---
      const streamIds = [];
      let offset = 0;
      while (true) {
        const url =
          `/api/data/v3/datasources?limit=${datasourcesPageSize}` +
          `&offset=${offset}&part=core&dataProviderType=domostats`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(
            `Failed to list DomoStats datasets. HTTP status: ${response.status}`
          );
        }
        const data = await response.json();
        const dataSources = Array.isArray(data?.dataSources) ? data.dataSources : [];
        for (const ds of dataSources) {
          if (ds?.streamId != null) streamIds.push(ds.streamId);
        }
        const totalCount = data?._metadata?.totalCount ?? 0;
        offset += dataSources.length;
        if (dataSources.length === 0 || offset >= totalCount) break;
      }

      if (streamIds.length === 0) return null;

      // --- Step 2: bulk-fetch streams, scan configuration for report=audit ---
      for (let i = 0; i < streamIds.length; i += streamsBatchSize) {
        const batch = streamIds.slice(i, i + streamsBatchSize);
        const url = `/api/data/v1/streams/bulk?streamId=${batch.join(',')}`;
        const response = await fetch(url, { credentials: 'include' });
        if (!response.ok) {
          throw new Error(
            `Failed to fetch stream configurations. HTTP status: ${response.status}`
          );
        }
        const streams = await response.json();
        if (!Array.isArray(streams)) continue;
        for (const stream of streams) {
          const configs = Array.isArray(stream?.configuration) ? stream.configuration : [];
          const matched = configs.some((c) => c?.name === 'report' && c?.value === 'audit');
          if (matched && stream?.dataSource?.id) {
            return stream.dataSource.id;
          }
        }
      }

      return null;
    },
    [DATASOURCES_PAGE_SIZE, STREAMS_BATCH_SIZE],
    tabId
  );
}
