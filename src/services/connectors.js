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
