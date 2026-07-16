import { useEffect, useState } from 'react';

import { getLatestConnectorVersion } from '@/services/connectors';

/**
 * For a stream's details object, resolve the latest published version of its
 * connector so the JSON view can annotate the installed transport.version.
 * Returns null (no annotation) when the source is not a connector-backed stream
 * or the lookup fails. Reads the connector id from transport.description, with
 * the dataProvider key as a defensive fallback.
 *
 * @param {Object} src - The active JSON source (a stream's details when on the Stream tab)
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {string|null} Formatted latest connector version, or null
 */
export function useConnectorVersion(src, tabId = null) {
  const [latestVersion, setLatestVersion] = useState(null);

  useEffect(() => {
    const connectorId = src?.transport?.description;
    if (!connectorId || src?.transport?.version == null) {
      setLatestVersion(null);
      return;
    }

    getLatestConnectorVersion({ connectorId, connectorKey: src?.dataProvider?.key, tabId })
      .then((version) => setLatestVersion(version ?? null))
      .catch(() => setLatestVersion(null));
  }, [src, tabId]);

  return latestVersion;
}
