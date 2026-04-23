import { executeInPage } from '@/utils';

/**
 * Upload a Blob as a Domo data file. Returns the data-file ID for use with
 * email/message attachments.
 *
 * Endpoint: POST /api/data/v1/data-files?name=&public=false
 * Body: raw binary (the Blob), not multipart.
 *
 * @param {Blob} blob - The file contents
 * @param {string} filename - Filename including extension (e.g. 'report.xlsx')
 * @param {string} mimeType - Content-Type header value
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<number>} The created data-file ID
 */
export async function uploadDataFile(blob, filename, mimeType, tabId = null) {
  // chrome.scripting.executeScript args are structured-cloned through a JSON-ish
  // channel that drops Blob. Serialize to a plain number array and reconstruct
  // in the page context.
  const bytes = Array.from(new Uint8Array(await blob.arrayBuffer()));

  return executeInPage(
    async (bytes, filename, mimeType) => {
      const body = new Blob([new Uint8Array(bytes)], { type: mimeType });
      const url = `/api/data/v1/data-files?name=${encodeURIComponent(filename)}&public=false`;
      const response = await fetch(url, {
        body,
        headers: { 'Content-Type': mimeType },
        method: 'POST'
      });
      if (!response.ok) {
        throw new Error(`Upload failed: HTTP ${response.status}`);
      }
      const data = await response.json();
      return data.dataFileId;
    },
    [bytes, filename, mimeType],
    tabId
  );
}
