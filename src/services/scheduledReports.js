import { executeInPage } from '@/utils/executeInPage';

/**
 * Delete a scheduled report.
 * @param {Object} params
 * @param {string|number} params.reportId - The scheduled report (report schedule) ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>} Resolves on success, throws on HTTP failure
 */
export async function deleteScheduledReport({ reportId, tabId = null }) {
  // Return a structured result rather than throwing: Chrome swallows a rejected
  // promise from an async injected function (null result, no error), which would
  // make a failed delete report success. See executeInPage.
  const result = await executeInPage(
    async (reportId) => {
      const response = await fetch(`/api/content/v1/reportschedules/${reportId}`, {
        method: 'DELETE'
      });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [reportId],
    tabId
  );
  if (!result?.ok) throw new Error(result?.error || 'Failed to delete scheduled report');
}
