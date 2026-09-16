import { DEPENDENCY_FETCH_CONCURRENCY } from '@/utils/constants';
import { executeInPage } from '@/utils/executeInPage';
import { GOVERNANCE_TOOLKIT_APPLICATION_IDS, GOVERNANCE_TOOLKIT_JOB_PARAM } from '@/utils/governanceToolkitApps';

/**
 * Find the application that holds a job, given only the job ID.
 *
 * Domo exposes no job-by-ID endpoint: `/executor/v1/jobs/{id}`, `/executor/v2/jobs/{id}`
 * and `/executor/v1/applications/jobs/{id}` all 404, leaving
 * `/executor/v1/applications/{appId}/jobs/{jobId}` as the only working shape. So the
 * application has to be found by probing, narrowed first to the toolkit applications the
 * instance actually has. Callers that already know the application (anything reached from
 * a toolkit URL, where the slug maps straight to it) never get here.
 * @param {string} jobId - The job ID
 * @param {boolean} [inPageContext=false] - Whether already in page context (skip executeInPage)
 * @param {number} [tabId] - Optional Chrome tab ID to execute in specific tab
 * @returns {Promise<string>} The application ID
 * @throws {Error} If no application holds the job
 */
export async function getGovernanceToolkitJobApplicationId(jobId, inPageContext = false, tabId = null) {
  const cacheKey = `${tabId ?? 'active'}|${jobId}`;
  const cached = jobApplicationCache.get(cacheKey);
  if (cached) return cached;

  const fetchLogic = async (jobId, candidateIds, concurrency) => {
    let candidates = candidateIds;

    const listResponse = await fetch('/api/executor/v1/applications').catch(() => null);
    if (listResponse?.ok) {
      const body = await listResponse.json().catch(() => null);
      const applications = Array.isArray(body) ? body : (body?.applications ?? []);
      const present = new Set(applications.map((application) => application?.applicationId).filter(Boolean));
      const narrowed = candidateIds.filter((id) => present.has(id));
      // Narrowing only removes guaranteed 404s, so an empty result means the
      // listing is untrustworthy here, not that the job is unreachable.
      if (narrowed.length > 0) candidates = narrowed;
    }

    const controller = new AbortController();
    const failures = [];
    let found = null;
    let next = 0;

    await Promise.all(
      Array.from({ length: Math.min(concurrency, candidates.length) }, async () => {
        while (next < candidates.length && !found) {
          const applicationId = candidates[next++];
          try {
            const response = await fetch(`/api/executor/v1/applications/${applicationId}/jobs/${jobId}`, {
              signal: controller.signal
            });
            if (response.ok) {
              const job = await response.json().catch(() => null);
              found = String(job?.applicationId || applicationId);
              controller.abort();
              return;
            }
            // A job the caller cannot see reads the same as one that isn't there.
            if (response.status !== 403 && response.status !== 404) {
              failures.push(`${applicationId}: HTTP ${response.status}`);
            }
          } catch (error) {
            if (error?.name !== 'AbortError') failures.push(`${applicationId}: ${error.message}`);
          }
        }
      })
    );

    return { applicationId: found, failures };
  };

  const pending = (
    inPageContext
      ? fetchLogic(jobId, GOVERNANCE_TOOLKIT_APPLICATION_IDS, DEPENDENCY_FETCH_CONCURRENCY)
      : executeInPage(fetchLogic, [jobId, GOVERNANCE_TOOLKIT_APPLICATION_IDS, DEPENDENCY_FETCH_CONCURRENCY], tabId)
  ).then((result) => {
    if (!result?.applicationId) {
      const detail = result?.failures?.length
        ? ` Some applications could not be checked: ${result.failures.join('; ')}`
        : '';
      throw new Error(`No Governance Toolkit application holds job ${jobId}.${detail}`);
    }
    return result.applicationId;
  });

  // Cache the in-flight promise so a burst of rows resolving at once shares one
  // fan-out, but drop failures so a transient one isn't remembered as the answer.
  jobApplicationCache.set(cacheKey, pending);
  pending.catch(() => jobApplicationCache.delete(cacheKey));

  return pending;
}

/**
 * Get all Governance Toolkit jobs owned by a user.
 *
 * There is no jobs-by-owner endpoint, so this is a two-level fan-out: every
 * application is listed, each application's jobs are paged, and the jobs are
 * matched on `userId` here. Applications are read concurrently because an
 * instance can hold enough of them that one request at a time is unusably slow.
 *
 * The jobs list only returns every job on an application when the caller holds
 * PIPELINE_EXECUTOR_JOB_ADMIN. Without it Domo silently narrows the response to
 * the jobs the caller personally has READ on, so another user's jobs go missing
 * with no error. That is why the registry entry gates this type on
 * `pipeline.executor.job.admin` rather than the broader authority the transfer
 * itself accepts: only the narrow one makes this listing trustworthy.
 * @param {number} ownerId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{applicationName: string, id: string, name: string, parentId: string}>>} Jobs,
 *   each carrying its application ID as `parentId`
 */
export async function getOwnedGovernanceToolkitJobs(ownerId, tabId = null) {
  return executeInPage(
    async (ownerId, concurrency) => {
      const applicationsResponse = await fetch('/api/executor/v1/applications');
      // An instance without the Governance Toolkit, or a user with no executor
      // access at all, should read as "owns none" rather than painting an error
      // row on every user browsed.
      if (applicationsResponse.status === 403 || applicationsResponse.status === 404) return [];
      if (!applicationsResponse.ok) throw new Error(`HTTP ${applicationsResponse.status}`);

      const body = await applicationsResponse.json();
      const applications = Array.isArray(body) ? body : (body?.applications ?? []);
      if (applications.length === 0) return [];

      const jobPageSize = 500;
      const owned = [];

      const readApplicationJobs = async (application) => {
        const applicationId = application?.applicationId;
        if (!applicationId) return;
        const applicationName = application.name || applicationId;
        let offset = 0;

        // Page guard in case the endpoint ignores offset; 100 pages of 500
        // covers far more jobs than an application realistically holds.
        for (let page = 0; page < 100; page++) {
          const response = await fetch(
            `/api/executor/v2/applications/${applicationId}/jobs?limit=${jobPageSize}&offset=${offset}`
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const collection = await response.json();
          const jobs = Array.isArray(collection?.jobs) ? collection.jobs : [];
          if (jobs.length === 0) return;

          for (const job of jobs) {
            if (job?.jobId == null) continue;
            // The owner id arrives as a number or a string depending on the
            // context snapshot, so both sides are stringified.
            if (String(job.userId) !== String(ownerId)) continue;
            owned.push({
              applicationName,
              id: String(job.jobId),
              name: job.jobName || String(job.jobId),
              parentId: String(job.applicationId || applicationId)
            });
          }

          offset += jobs.length;
          if (jobs.length < jobPageSize) return;
          // Second, independent stop condition so a response without
          // `totalResults` still terminates on the page-size check above.
          if (Number.isFinite(collection?.totalResults) && offset >= collection.totalResults) return;
        }
      };

      let next = 0;
      await Promise.all(
        Array.from({ length: Math.min(concurrency, applications.length) }, async () => {
          while (next < applications.length) await readApplicationJobs(applications[next++]);
        })
      );

      // Applications finish in whatever order they resolve, so sort to keep the
      // rows stable across refreshes.
      return owned.sort((a, b) => a.applicationName.localeCompare(b.applicationName) || a.name.localeCompare(b.name));
    },
    [ownerId, DEPENDENCY_FETCH_CONCURRENCY],
    tabId
  );
}

/**
 * Open a Governance Toolkit job's overview on a tab already sitting on that job's tool.
 *
 * Returns the failure rather than throwing it, against the usual service convention: the
 * only caller is the background's deep-link trigger, which picks a badge and a log line
 * from `reason` and has no user waiting on a rejected promise.
 * @param {{applicationId: string|null, jobId: string, slug: string}} target - The job to open
 * @param {number|null} tabId - Tab to drive
 * @returns {Promise<{ok: boolean, alreadyOpen?: boolean, error?: string, reason?: string}>}
 */
export async function openGovernanceToolkitJob(target, tabId = null) {
  try {
    const result = await executeInPage(
      driveGovernanceToolkitJob,
      [
        {
          applicationId: target.applicationId ?? null,
          jobId: target.jobId,
          overallTimeoutMs: 15000,
          paramName: GOVERNANCE_TOOLKIT_JOB_PARAM,
          slug: target.slug
        }
      ],
      tabId
    );
    return result ?? { error: 'No result from the page', ok: false, reason: 'EXCEPTION' };
  } catch (error) {
    return { error: error.message, ok: false, reason: 'INJECTION_FAILED' };
  }
}

/**
 * Transfer Governance Toolkit job ownership to a new user.
 *
 * Each call is keyed on the job's application, so this takes the full objects
 * rather than bare IDs, the same reason Task Center tasks bring their queue
 * along. The loop is serial: the list is only what the user selected, and every
 * transfer publishes an audit event.
 *
 * The owner update grants the new owner full permissions but never revokes the
 * old one, so the previous owner is left with access to the job.
 *
 * Two rejections are expected in the wild, and neither names its cause in the
 * response, so both are translated from the status: an application with
 * `verifyOwnership` set refuses any transfer whose new owner is not the person
 * running it, and one with `strictValidation` refuses a new owner missing an
 * authority the application requires. A new owner who doesn't exist or isn't
 * active comes back as a 404.
 * @param {Array<{id: string, parentId: string}>} jobs - Jobs with their application IDs
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @param {'USER'|'GROUP'} [ownerType='USER'] - Owner type of the destination
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferGovernanceToolkitJobs(jobs, fromUserId, toUserId, tabId = null, ownerType = 'USER') {
  if (ownerType === 'GROUP') {
    return {
      errors: jobs.map((job) => ({ error: 'Governance Toolkit Jobs cannot be owned by a group', id: job.id })),
      failed: jobs.length,
      succeeded: 0
    };
  }

  const result = await executeInPage(
    async (jobs, toUserId) => {
      const errors = [];
      let succeeded = 0;

      // Domo's `message` is usually just the HTTP reason, while
      // `localizedMessage` carries the reason worth reading; `toe` is the trace
      // id support asks for.
      const readFailure = async (response) => {
        const text = await response.text().catch(() => '');
        let detail = text.trim();
        let toe = '';
        try {
          const parsed = JSON.parse(text);
          detail = parsed?.localizedMessage || parsed?.message || '';
          toe = parsed?.toe || '';
        } catch {
          // Not JSON, so the raw body is the best detail available.
        }
        const cause =
          response.status === 400
            ? 'The application may require the new owner to be the person running the transfer, or the new owner may be missing an authority the application requires.'
            : response.status === 403
              ? 'You need the Governance Toolkit job admin or DataSet admin authority to change a job owner.'
              : response.status === 404
                ? 'Domo could not find the job or the new owner. The new owner must be an existing, active user.'
                : '';
        const parts = [`HTTP ${response.status}`, detail, cause].filter(Boolean);
        return `${parts.join(': ')}${toe ? ` (Domo trace ${toe})` : ''}`;
      };

      for (const job of jobs) {
        if (!job.parentId) {
          errors.push({ error: 'Missing application ID', id: job.id });
          continue;
        }
        try {
          const response = await fetch(`/api/executor/v1/applications/${job.parentId}/jobs/${job.id}/owner`, {
            body: JSON.stringify({ ownerUserId: toUserId }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(await readFailure(response));
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id: job.id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [jobs, parseInt(toUserId)],
    tabId
  );

  return (
    result || {
      errors: jobs.map((job) => ({ error: 'Transfer failed', id: job.id })),
      failed: jobs.length,
      succeeded: 0
    }
  );
}

/**
 * Drive the Governance Toolkit UI to open a job. Runs in the page's MAIN world, so it is
 * stringified: every input arrives through `params` and nothing may close over an import.
 * @param {Object} params - `{ applicationId, jobId, overallTimeoutMs, paramName, slug }`
 * @returns {Promise<{ok: boolean, alreadyOpen?: boolean, error?: string, reason?: string}>}
 */
async function driveGovernanceToolkitJob(params) {
  const { applicationId, jobId, overallTimeoutMs, paramName, slug } = params;
  const deadline = Date.now() + overallTimeoutMs;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const reactKey = (node, prefix) => Object.keys(node).find((key) => key.startsWith(prefix));

  const waitFor = async (predicate, budgetMs, intervalMs = 100) => {
    const stopAt = Math.min(Date.now() + budgetMs, deadline);
    for (;;) {
      const value = predicate();
      if (value) return value;
      if (Date.now() >= stopAt) return null;
      await sleep(intervalMs);
    }
  };

  // The store is never on `window` outside Domo's dev builds, so reach it through
  // the react-redux provider's props.
  const findStore = () => {
    for (const selector of ['[class*="Governance-toolkit-app"]', '[class*="job-search"]', '[class*="existing-job"]']) {
      const anchor = document.querySelector(selector);
      const key = anchor && reactKey(anchor, '__reactFiber$');
      if (!key) continue;
      let fiber = anchor[key];
      for (let depth = 0; fiber && depth < 60; depth++, fiber = fiber.return) {
        const store = fiber.memoizedProps?.value?.store;
        if (typeof store?.dispatch === 'function' && typeof store?.getState === 'function') return store;
      }
    }
    return null;
  };

  const searchInput = () => {
    const element = document.querySelector('[class*="search-box"]');
    if (!element) return null;
    return element.tagName === 'INPUT' ? element : element.querySelector('input');
  };

  const setSearch = (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  };

  const findRow = () => {
    for (const node of document.querySelectorAll('[class*="existing-job"]')) {
      const propsKey = reactKey(node, '__reactProps$');
      const fiberKey = reactKey(node, '__reactFiber$');
      if (!propsKey || !fiberKey) continue;
      let fiber = node[fiberKey];
      for (let depth = 0; fiber && depth < 5; depth++, fiber = fiber.return) {
        if (fiber.memoizedProps?.job?.jobId === jobId) return { node, onClick: node[propsKey].onClick };
      }
    }
    return null;
  };

  const stripParam = () => {
    const url = new URL(location.href);
    if (!url.searchParams.has(paramName)) return;
    url.searchParams.delete(paramName);
    history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };

  // executeInPage raises the suppression counter for the whole injection, but on a
  // cold load apiErrors.js initializes it to 0 after we are already running, so
  // this request has to raise it again to stay out of the API errors panel.
  const fetchUncaptured = async (url) => {
    window.__domoToolkitExtDepth = (window.__domoToolkitExtDepth || 0) + 1;
    try {
      return await fetch(url);
    } finally {
      window.__domoToolkitExtDepth = Math.max(0, (window.__domoToolkitExtDepth || 0) - 1);
    }
  };

  // A tool the instance doesn't have answers 404 on the application rather than
  // 403, so a missing job and a missing tool are only told apart by asking.
  const missingReason = async (appId) => {
    const response = await fetchUncaptured(`/api/executor/v1/applications/${appId}`);
    return response.ok ? 'JOB_NOT_FOUND' : 'NOT_ENTITLED';
  };

  // The toolkit's own boot requests happen inside the injection window, so hand
  // the counter back for the DOM phase or they are suppressed along with ours.
  const releaseErrorCapture = () => {
    window.__domoToolkitExtDepth = Math.max(0, (window.__domoToolkitExtDepth || 0) - 1);
  };
  const resumeErrorCapture = () => {
    window.__domoToolkitExtDepth = (window.__domoToolkitExtDepth || 0) + 1;
  };

  let typedSearch = null;
  const fail = (reason, error) => {
    if (typedSearch) {
      try {
        setSearch(typedSearch, '');
      } catch {
        // Leaving a stale filter behind is not worth failing twice over.
      }
    }
    return { error, ok: false, reason };
  };

  try {
    const readParam = () => new URLSearchParams(location.search).get(paramName);
    if (readParam() !== jobId) return { ok: false, reason: 'PARAM_GONE' };

    const store = await waitFor(findStore, 8000);
    if (!store) return { ok: false, reason: 'NO_STORE' };

    const executor = () => store.getState()?.governanceToolkit?.executorToolkit ?? null;
    const currentAppId = () => store.getState()?.governanceToolkit?.GovernanceToolkit?.currentAppId || null;
    const openJobId = () => (executor()?.view === 'jobOverview' ? (executor()?.job?.jobId ?? null) : null);

    if (openJobId() === jobId) {
      stripParam();
      return { alreadyOpen: true, ok: true };
    }

    // A job overview replaces the list outright, search box included, so a different
    // job being open has to be backed out of first. Going back is Domo's own
    // `setView('main')`, whose reset lives in the reducer; going forward into a job
    // is not, which is why the row's onClick below is not replaced by a dispatch.
    if (executor()?.view === 'jobOverview') {
      store.dispatch({ payload: 'main', type: 'executorToolkit/UPDATE_VIEW' });
    }

    let appId = applicationId;
    if (!appId) {
      const stable = await waitFor(
        () => {
          const first = currentAppId();
          return first ? { first } : null;
        },
        4000,
        100
      );
      if (!stable) return { ok: false, reason: 'NO_APP_ID' };
      await sleep(100);
      appId = currentAppId();
      if (!appId) return { ok: false, reason: 'NO_APP_ID' };
    }

    let jobName = null;
    for (let attempt = 0; attempt < 2 && !jobName; attempt++) {
      const response = await fetchUncaptured(`/api/executor/v1/applications/${appId}/jobs/${jobId}`);
      if (response.ok) {
        const job = await response.json().catch(() => null);
        jobName = job?.jobName || null;
        if (!jobName) return { ok: false, reason: 'JOB_NOT_FOUND' };
        break;
      }
      if (response.status === 403) return { ok: false, reason: 'NOT_ENTITLED' };
      if (response.status !== 404) return { error: `HTTP ${response.status}`, ok: false, reason: 'FETCH_FAILED' };
      // A 404 can mean the tool was mid-switch and `currentAppId` was the outgoing
      // one, so give it a moment to settle and try the new application once.
      if (attempt === 0 && !applicationId) {
        const changed = await waitFor(() => {
          const now = currentAppId();
          return now && now !== appId ? now : null;
        }, 3000);
        if (!changed) return { ok: false, reason: await missingReason(appId) };
        appId = changed;
      } else {
        return { ok: false, reason: await missingReason(appId) };
      }
    }

    releaseErrorCapture();
    try {
      if (!location.pathname.includes(slug)) return fail('NAVIGATED_AWAY');

      // Gate on the tool before touching the search box: the input is a different
      // DOM node after a tool switch, so querying early grabs the outgoing one.
      const onTool = await waitFor(() => currentAppId() === appId, 4000, 50);
      if (!onTool) return fail('WRONG_TOOL');

      const input = await waitFor(searchInput, 8000);
      if (!input) return fail('SEARCH_BOX_TIMEOUT');

      setSearch(input, jobName);
      typedSearch = input;

      const row = await waitFor(findRow, 6000);
      if (!row) return fail('ROW_NOT_FOUND');
      if (typeof row.onClick !== 'function') return fail('CLICK_FAILED', 'Row has no click handler');
      if (!location.pathname.includes(slug)) return fail('NAVIGATED_AWAY');

      try {
        row.onClick();
      } catch {
        row.node.click();
      }

      const opened = await waitFor(() => openJobId() === jobId, 5000, 50);
      if (!opened) return fail('OVERVIEW_TIMEOUT');

      stripParam();
      return { alreadyOpen: false, ok: true };
    } finally {
      resumeErrorCapture();
    }
  } catch (error) {
    return { error: error.message, ok: false, reason: 'EXCEPTION' };
  }
}

/** Job ID to its application, keyed by tab so an ID cannot leak across instances. */
const jobApplicationCache = new Map();
