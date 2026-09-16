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

/**
 * Get all classic scheduled reports owned by a user.
 *
 * There is no server-side owner filter: `filter=USER|OWNER` always resolves to
 * the caller, so the instance-wide listing is paged and matched on `ownerId`
 * here. `filter=ALL` needs content.admin, and the `OWNER` retry on a 403 still
 * answers correctly, since the client-side match then finds the caller's own
 * schedules and legitimately finds none for anyone else.
 *
 * `orderBy` is required, not cosmetic: the default ordering is unstable between
 * calls, so paging on `skip` without it both repeats and drops schedules.
 *
 * Report Builder deliveries share this listing (`reportView: true`) and move
 * with their report in transferReports, so they are excluded here.
 * @param {number} ownerId - The Domo user ID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedScheduledReports(ownerId, tabId = null) {
  return executeInPage(
    async (ownerId) => {
      const limit = 2000;
      const maxPages = 50;
      const owned = new Map();
      let filter = 'ALL';

      for (let page = 0; page < maxPages; page++) {
        const skip = page * limit;
        const fetchPage = (filter) =>
          fetch(
            `/api/content/v1/reportschedules?filter=${filter}&limit=${limit}&skip=${skip}&orderBy=title&isAscending=true`
          );

        let response = await fetchPage(filter);
        if (response.status === 403 && filter === 'ALL') {
          filter = 'OWNER';
          response = await fetchPage(filter);
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);

        const schedules = await response.json();
        if (!Array.isArray(schedules) || schedules.length === 0) break;

        for (const schedule of schedules) {
          if (schedule?.id == null) continue;
          if (schedule.reportView === true) continue;
          if (schedule.ownerId != ownerId) continue;
          owned.set(String(schedule.id), {
            id: String(schedule.id),
            name: schedule.subject || schedule.title || String(schedule.id)
          });
        }

        if (schedules.length < limit) break;
      }

      return [...owned.values()];
    },
    [ownerId],
    tabId
  );
}

/**
 * Transfer classic scheduled report ownership to a new user.
 *
 * There is no owner endpoint, so each schedule is read and written back whole.
 * The update is a full replace and the read shape is wider than the write shape
 * (`recentHistory`, `cardCount`, `contextId` and friends are read-only), so the
 * body is rebuilt from the accepted fields rather than echoed back.
 *
 * The owner is set in two places because the update's owner branch moves the
 * schedule, its container view, and its notify schedule together, and reads the
 * nested owner to do it.
 * @param {string[]} scheduleIds - Scheduled report IDs to transfer
 * @param {number} fromOwnerId - The current owner's user ID
 * @param {number} toOwnerId - The new owner's user ID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Only USER is supported
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferScheduledReports(scheduleIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  if (ownerType === 'GROUP') {
    return {
      errors: scheduleIds.map((id) => ({ error: 'Scheduled reports cannot be owned by a group', id })),
      failed: scheduleIds.length,
      succeeded: 0
    };
  }

  const result = await executeInPage(
    async (scheduleIds, toOwnerId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of scheduleIds) {
        try {
          const getResponse = await fetch(`/api/content/v1/reportschedules/${id}`);
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const report = await getResponse.json();

          if (report?.reportView === true) {
            throw new Error('Report Builder deliveries transfer with their report');
          }

          // Refuse to write a body rebuilt from a shape we don't recognize: the
          // update is a full replace, so a missing schedule field rewrites when
          // the report sends rather than failing. The server rejects a schedule
          // missing any of these three outright.
          const schedule = report?.schedule;
          if (
            report?.id == null ||
            report.viewId == null ||
            schedule?.hourOfDay == null ||
            schedule.minOfHour == null ||
            schedule.startDate == null
          ) {
            throw new Error('Unexpected scheduled report response; not transferring');
          }

          const response = await fetch(`/api/content/v1/reportschedules/${id}`, {
            body: JSON.stringify({
              active: report.active,
              attachmentInclude: report.attachmentInclude,
              id: report.id,
              owner: report.owner,
              ownerId: toOwnerId,
              schedule: { ...schedule, ownerId: toOwnerId },
              subject: report.subject,
              title: report.title,
              viewId: report.viewId
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [scheduleIds, parseInt(toOwnerId)],
    tabId
  );

  return (
    result || {
      errors: scheduleIds.map((id) => ({ error: 'Transfer failed', id })),
      failed: scheduleIds.length,
      succeeded: 0
    }
  );
}
