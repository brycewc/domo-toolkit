import { executeInPage } from '@/utils/executeInPage';

/**
 * Delete a scheduled report.
 * @param {Object} params
 * @param {string|number} params.reportId - The scheduled report (report schedule) ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteScheduledReport({ reportId, tabId = null }) {
  return executeInPage(
    async (reportId) => {
      const response = await fetch(`/api/content/v1/reportschedules/${reportId}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    },
    [reportId],
    tabId
  );
}
