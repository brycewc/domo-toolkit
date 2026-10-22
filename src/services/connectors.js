import { executeInPage } from '@/utils/executeInPage';

/**
 * Fetch the latest published version of a connector, formatted as a
 * major[.minor] string (e.g. '1.100' or '1'). Used to annotate a stream's
 * installed transport.version with the current appstore version, so a user can
 * see at a glance whether a connector-backed dataset is running an old build.
 *
 * The connector id from the stream (e.g. 'com.domo.connector.okta') is what the
 * connectors endpoint keys on; the dataProvider key (e.g. 'okta') is a defensive
 * fallback. Installed versions are sometimes major-only, so the latest value is
 * formatted the same way (no phantom '.undefined' minor). Returns null on any
 * failure so the annotation simply does not appear.
 *
 * @param {Object} params
 * @param {string} [params.connectorId] - Connector id, e.g. 'com.domo.connector.okta'
 * @param {string} [params.connectorKey] - Fallback connector key, e.g. 'okta'
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<string|null>} Formatted latest version, or null if unavailable
 */
export async function getLatestConnectorVersion({ connectorId, connectorKey, tabId = null }) {
  return executeInPage(
    async (connectorId, connectorKey) => {
      const fetchLatest = async (id) => {
        if (!id) return null;
        const response = await fetch(`/api/data/v1/connectors/${id}?language=en`);
        if (!response.ok) return null;
        const data = await response.json();
        const version = data?.version;
        if (!version || version.major == null) return null;
        return version.minor != null ? `${version.major}.${version.minor}` : String(version.major);
      };
      try {
        return (await fetchLatest(connectorId)) ?? (await fetchLatest(connectorKey));
      } catch {
        return null;
      }
    },
    [connectorId, connectorKey],
    tabId
  );
}

/**
 * List the streams running a connector. Sibling connectors share a provider key, so each stream is checked too.
 * @param {Object} params
 * @param {string} params.connectionType - The connector's provider key, e.g. 'aws-athena'
 * @param {string} params.connectorId - Connector id, e.g. 'com.domo.connector.amazonathenaV2'
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} One row per stream, with its dataset's owner, account, run state, and schedule
 */
export async function getStreamsForConnector({ connectionType, connectorId, tabId = null }) {
  if (!connectionType || !connectorId) return [];

  return executeInPage(
    async (connectionType, connectorId) => {
      const throwFor = (response, what) => {
        const error = new Error(`Failed to fetch ${what}: HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      };

      const postJson = (url, body) =>
        fetch(url, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, method: 'POST' });
      const inPool = async (items, worker) => {
        const results = new Array(items.length);
        let next = 0;
        const runners = Array.from({ length: Math.min(4, items.length) }, async () => {
          while (next < items.length) {
            const index = next++;
            results[index] = await worker(items[index]);
          }
        });
        await Promise.all(runners);
        return results.flat();
      };

      const pageSize = 100;
      // Plain search plus a core bulk read; the search's augment=true returns streamId directly but runs twice as slow
      const fetchDatasetPage = async (offset) => {
        const search = await postJson('/api/data/ui/v3/datasources/search', {
          combineResults: false,
          count: pageSize,
          entityList: [['dataset']],
          facetValuesToInclude: [],
          filters: [
            {
              field: 'dataproviderkey_facet',
              filterType: 'term',
              name: 'Data Provider Type',
              not: false,
              value: connectionType
            }
          ],
          hideSearchObjects: true,
          offset,
          query: '**',
          queryProfile: 'GLOBAL'
        });
        if (!search.ok) throwFor(search, 'datasets');
        const data = await search.json();
        const ids = (data.dataSources || []).map((dataset) => dataset.id);
        if (ids.length === 0) return { datasets: [], total: data._metaData?.totalCount ?? 0 };

        const bulk = await postJson('/api/data/v3/datasources/bulk?part=core', ids);
        if (!bulk.ok) throwFor(bulk, 'datasets');
        return { datasets: (await bulk.json()).dataSources || [], total: data._metaData?.totalCount ?? 0 };
      };

      const firstPage = await fetchDatasetPage(0);
      const offsets = [];
      for (let offset = pageSize; offset < firstPage.total; offset += pageSize) offsets.push(offset);
      const datasets = [
        ...firstPage.datasets,
        ...(await inPool(offsets, async (offset) => (await fetchDatasetPage(offset)).datasets))
      ];

      const datasetByStreamId = new Map();
      for (const dataset of datasets) {
        if (dataset.streamId != null) datasetByStreamId.set(dataset.streamId, dataset);
      }
      const streamIds = [...datasetByStreamId.keys()];
      const batches = [];
      for (let i = 0; i < streamIds.length; i += 50) batches.push(streamIds.slice(i, i + 50));

      const streams = await inPool(batches, async (batch) => {
        const query = batch.map((id) => `streamId=${id}`).join('&');
        const response = await fetch(`/api/data/v1/streams/bulk?fields=id,transport&${query}`);
        if (response.ok) return response.json();
        // Bulk needs WRITE on every stream in the batch, so a user who can only read one fails the lot
        if (response.status !== 403) throwFor(response, 'streams');
        const singles = [];
        for (const id of batch) {
          const single = await fetch(`/api/data/v1/streams/${id}?fields=id,transport`);
          if (single.ok) singles.push(await single.json());
        }
        return singles;
      });

      const target = connectorId.toLowerCase();
      return streams
        .filter((stream) => stream.transport?.description?.toLowerCase() === target)
        .map((stream) => {
          const dataset = datasetByStreamId.get(stream.id);
          return {
            accountId: dataset.accountId ?? null,
            cardCount: dataset.cardCount ?? null,
            created: dataset.created ?? null,
            datasetId: dataset.id,
            datasetName: dataset.name,
            lastUpdated: dataset.lastUpdated ?? null,
            ownerId: dataset.owner?.id ?? null,
            ownerName: dataset.owner?.name ?? null,
            scheduleActive: dataset.scheduleActive ?? null,
            state: dataset.state ?? null,
            streamId: stream.id,
            validAccount: dataset.validAccount ?? null,
            validConfiguration: dataset.validConfiguration ?? null,
            version: stream.transport.version ?? null
          };
        })
        .sort((a, b) => (a.datasetName || '').localeCompare(b.datasetName || ''));
    },
    [connectionType, connectorId],
    tabId
  );
}
