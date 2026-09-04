import { executeInPage } from '@/utils/executeInPage';

/**
 * Get all Report Builder reports owned directly by a user.
 * Reports are user-owned only (`PUT .../owners/{ownerId}` validates the id is a
 * real user), so there is no group equivalent.
 * @param {number} ownerId - The Domo user ID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedReports(ownerId, tabId = null) {
  const reports = await searchReports({ includeOwnerIdClause: true, ownerId: parseInt(ownerId) }, tabId);
  return reports.map((report) => ({
    id: String(report.reportId),
    name: report.title || `Report ${report.reportId}`
  }));
}

/**
 * Resolve the report, report page, and owning App Studio app for any object in
 * the Report Builder family, taking the cheapest route each type allows.
 *
 * A report knows its own page and tags in one call. A report page under a known
 * report does too, via its parent. Everything else has to go through the
 * page-keyed listing, and a scheduled report is only worth resolving at all when
 * it belongs to a report rather than a dashboard or card.
 * @param {Object} params
 * @param {Object} [params.details] - The object's already-fetched details
 * @param {string} params.objectId - The detected object ID
 * @param {string|number|null} [params.parentId] - The object's parent ID, if known
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {string} params.typeId - The detected object type ID
 * @returns {Promise<{dataAppId: string|null, reportId: number|null, reportPageId: number|null}>}
 */
export async function getReportAppContext({ details, objectId, parentId = null, tabId = null, typeId }) {
  const empty = { dataAppId: null, reportId: null, reportPageId: null };

  const fromReport = async (reportId) => {
    const report = await getReportBuilderReport({ reportId, tabId });
    if (!report) return empty;
    return {
      dataAppId: parseDataAppIdFromTags(report.tags),
      reportId: Number(reportId),
      reportPageId: report.pageId ?? null
    };
  };

  if (typeId === 'REPORT_BUILDER') return fromReport(objectId);
  if (typeId === 'REPORT_BUILDER_PAGE' && parentId) return fromReport(parentId);

  let reportPageId = typeId === 'REPORT_BUILDER_PAGE' ? Number(objectId) : null;
  if (typeId === 'REPORT_SCHEDULE') {
    if (details?.reportView !== true) return empty;
    reportPageId = details?.pageId ?? null;
  }
  if (typeId === 'REPORT_BUILDER_VIEW' && reportPageId == null) {
    const view = await getReportView({ reportViewId: objectId, tabId });
    reportPageId = view?.entityId ?? null;
  }
  if (reportPageId == null) return empty;

  const byPageId = await getReportsByPageId({ tabId });
  const match = byPageId[String(reportPageId)];
  if (!match) return { ...empty, reportPageId };
  return {
    dataAppId: parseDataAppIdFromTags(match.tags),
    reportId: match.reportId,
    reportPageId
  };
}

/**
 * Fetch a single Report Builder report, including its `tags` (which carry the
 * owning App Studio app) and its `pageId`.
 * @param {Object} params
 * @param {string|number} params.reportId - The Report Builder report ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>} The report, or null if it can't be read
 */
export async function getReportBuilderReport({ reportId, tabId = null }) {
  return executeInPage(
    async (reportId) => {
      const response = await fetch(`/api/content/v1/reportbuilder/${reportId}?includeViewIds=true`);
      if (!response.ok) return null;
      return response.json();
    },
    [reportId],
    tabId
  );
}

/**
 * Fetch every Report Builder report that has an email delivery, keyed by its
 * report page ID. This is the only call that resolves a report page back to its
 * report without already knowing the report, and it returns the app tags in the
 * same row, so it answers "which app owns this page's report" in one request.
 *
 * Asks for the whole instance and retries scoped to the caller if that is
 * refused, since content.admin is what separates the two and the caller's rights
 * aren't known here. A scoped listing covers only schedules the caller owns or is
 * subscribed to, so a lookup can legitimately miss.
 * @param {Object} params
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object<string, {reportId: number, tags: string[], title: string}>>}
 */
export async function getReportsByPageId({ tabId = null } = {}) {
  const byPageId = await executeInPage(
    async () => {
      const limit = 2000;
      const result = {};

      const fetchPage = (category, skip) =>
        fetch(`/api/content/v1/reportschedules/resources/REPORT?limit=${limit}&skip=${skip}`, {
          body: JSON.stringify({ category }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });

      let category = 'ALL';
      let skip = 0;
      for (;;) {
        let response = await fetchPage(category, skip);
        if (response.status === 403 && category === 'ALL') {
          category = 'USER';
          response = await fetchPage(category, skip);
        }
        if (!response.ok) return result;

        const data = await response.json();
        const resources = data?.resources || [];
        for (const resource of resources) {
          if (resource?.resourceId == null || resource.contextId == null) continue;
          result[String(resource.resourceId)] = {
            reportId: resource.contextId,
            tags: resource.tags || [],
            title: resource.title
          };
        }

        if (resources.length < limit) return result;
        skip += limit;
      }
    },
    [],
    tabId
  );
  return byPageId || {};
}

/**
 * Fetch the Report Builder reports belonging to an App Studio app.
 *
 * The search endpoint is the candidate source because it covers reports with no
 * email delivery (a PDF-only report is absent from the schedule-derived
 * listings). Its tag filter is a substring LIKE, though, so app 123 also matches
 * a report tagged `app-studio:1234` and every candidate has to be confirmed on an
 * exact tag. `ReportSummary` carries no tags, so confirmation comes from the
 * page-keyed listing in one call, and only candidates missing from it (the
 * unscheduled ones) cost a fetch of their own.
 * @param {Object} params
 * @param {string|number} params.dataAppId - The App Studio app (data app) ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{pageId: number, reportId: number, title: string, type: string}>>}
 */
export async function getReportsForApp({ dataAppId, tabId = null }) {
  const appId = String(dataAppId);
  const candidates = await searchReports({ includeTagsClause: true, tags: [tagForDataApp(appId)] }, tabId);
  if (candidates.length === 0) return [];

  const byPageId = await getReportsByPageId({ tabId });
  const tagsByReportId = new Map();
  for (const entry of Object.values(byPageId)) {
    tagsByReportId.set(String(entry.reportId), entry.tags);
  }

  const confirmed = [];
  for (const report of candidates) {
    let tags = tagsByReportId.get(String(report.reportId));
    if (!tags) {
      const full = await getReportBuilderReport({ reportId: report.reportId, tabId });
      tags = full?.tags;
    }
    if (parseDataAppIdFromTags(tags) !== appId) continue;
    confirmed.push({
      pageId: report.pageId,
      reportId: report.reportId,
      title: report.title || `Report ${report.reportId}`,
      type: report.type
    });
  }
  return confirmed;
}

/**
 * Fetch one delivery target (report view). Its `entityId` is the report's page.
 * @param {Object} params
 * @param {string|number} params.reportViewId - The report view / schedule ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object|null>}
 */
export async function getReportView({ reportViewId, tabId = null }) {
  return executeInPage(
    async (reportViewId) => {
      const response = await fetch(`/api/content/v1/reportbuilder/views/${reportViewId}`);
      if (!response.ok) return null;
      return response.json();
    },
    [reportViewId],
    tabId
  );
}

/**
 * Fetch a report's delivery targets (its report views / schedules).
 * @param {Object} params
 * @param {string|number} params.reportId - The Report Builder report ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>}
 */
export async function getSchedulesForReport({ reportId, tabId = null }) {
  const views = await executeInPage(
    async (reportId) => {
      const response = await fetch(`/api/content/v1/reportbuilder/${reportId}/views`);
      if (!response.ok) return [];
      return response.json();
    },
    [reportId],
    tabId
  );
  return views || [];
}

/**
 * Read the owning App Studio app ID out of a report's tags.
 * Matches the full tag rather than a substring, so `app-studio:1234` never
 * answers for app 123, and ignores the user-authored tags alongside it.
 * @param {string[]} tags - The report's `tags` array
 * @returns {string|null} The data app ID, or null when the report carries no app tag
 */
export function parseDataAppIdFromTags(tags) {
  if (!Array.isArray(tags)) return null;
  for (const tag of tags) {
    const match = typeof tag === 'string' ? tag.match(APP_STUDIO_TAG_PATTERN) : null;
    if (match) return match[1];
  }
  return null;
}

/**
 * Transfer report ownership to a new user, including each report's delivery
 * targets. A report's schedules carry their own owner, so moving only the report
 * would leave them behind on the departing user.
 * @param {string[]} reportIds - Report Builder report IDs to transfer
 * @param {number} fromOwnerId - The current owner's user ID
 * @param {number} toOwnerId - The new owner's user ID
 * @param {number|null} [tabId] - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Only USER is supported
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferReports(reportIds, fromOwnerId, toOwnerId, tabId = null, ownerType = 'USER') {
  if (ownerType === 'GROUP') {
    return {
      errors: reportIds.map((id) => ({ error: 'Reports cannot be owned by a group', id })),
      failed: reportIds.length,
      succeeded: 0
    };
  }

  const result = await executeInPage(
    async (reportIds, toOwnerId) => {
      const errors = [];
      let succeeded = 0;

      for (const reportId of reportIds) {
        try {
          const ownerResponse = await fetch(`/api/content/v1/reportbuilder/${reportId}/owners/${toOwnerId}`, {
            method: 'PUT'
          });
          if (!ownerResponse.ok) throw new Error(`HTTP ${ownerResponse.status}`);

          const viewsResponse = await fetch(`/api/content/v1/reportbuilder/${reportId}/views`);
          const views = viewsResponse.ok ? await viewsResponse.json() : [];
          for (const view of views || []) {
            if (view?.reportViewId == null) continue;
            const viewResponse = await fetch(
              `/api/content/v1/reportbuilder/${reportId}/views/${view.reportViewId}/owners/${toOwnerId}`,
              { method: 'PUT' }
            );
            if (!viewResponse.ok) throw new Error(`Delivery ${view.reportViewId}: HTTP ${viewResponse.status}`);
          }

          succeeded += 1;
        } catch (error) {
          errors.push({ error: error.message, id: reportId });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [reportIds, parseInt(toOwnerId)],
    tabId
  );

  return (
    result || { errors: reportIds.map((id) => ({ error: 'Transfer failed', id })), failed: reportIds.length, succeeded: 0 }
  );
}

const APP_STUDIO_TAG_PATTERN = /^app-studio:(\d+)$/;

/**
 * Paginate the Report Builder search endpoint.
 * @param {Object} criteria - A ReportSearchCriteria body
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<Object>>} ReportSummary rows
 */
async function searchReports(criteria, tabId) {
  const reports = await executeInPage(
    async (criteria) => {
      const limit = 100;
      const all = [];
      let skip = 0;

      for (;;) {
        const response = await fetch(`/api/content/v1/reportbuilder/search?limit=${limit}&skip=${skip}`, {
          body: JSON.stringify(criteria),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) return all;

        const data = await response.json();
        const page = data?.reports || [];
        all.push(...page);

        if (page.length < limit) return all;
        skip += limit;
      }
    },
    [criteria],
    tabId
  );
  return reports || [];
}

/**
 * Build the hidden tag DomoWeb stamps on a report to record its App Studio app.
 * @param {string|number} dataAppId - The data app ID
 * @returns {string}
 */
function tagForDataApp(dataAppId) {
  return `app-studio:${dataAppId}`;
}
