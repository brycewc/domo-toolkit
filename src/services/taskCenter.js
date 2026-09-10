import { executeInPage } from '@/utils/executeInPage';

/**
 * Get all Task Center queues owned by a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string}>>}
 */
export async function getOwnedTaskCenterQueues(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allQueues = [];
      const count = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        const response = await fetch('/api/search/v1/query', {
          body: JSON.stringify({
            count,
            entityList: [['queue']],
            filters: [
              {
                facetType: 'user',
                field: 'owned_by_id',
                filterType: 'term',
                value: `${userId}:USER`
              },
              { field: 'active', filterType: 'term', value: 'true' }
            ],
            offset,
            query: '*'
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data.searchObjects && data.searchObjects.length > 0) {
          allQueues.push(
            ...data.searchObjects.map((q) => ({
              id: q.uuid,
              name: q.winnerText || q.uuid
            }))
          );
          offset += count;
          if (data.searchObjects.length < count) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allQueues;
    },
    [userId],
    tabId
  );
}

/**
 * Get all Task Center tasks assigned to a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, name: string, queueId: string}>>}
 */
export async function getOwnedTaskCenterTasks(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allTasks = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      while (moreData) {
        // `render=true` is what returns `displayEntity`, which holds the only
        // name a task has; the response omits it entirely otherwise.
        const url = `/api/queues/v1/tasks/list?limit=${limit}&offset=${offset}&render=true`;
        const response = await fetch(url, {
          body: JSON.stringify({
            assignedTo: [userId],
            status: ['OPEN']
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST'
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allTasks.push(
            ...data.map((t) => ({
              id: t.id,
              // A task carries no `name` field of its own, so the display name
              // comes off its rendered display entity, the same field the
              // single-task view reads.
              name: t.displayEntity?.name || t.id,
              queueId: t.queueId
            }))
          );
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      return allTasks;
    },
    [userId],
    tabId
  );
}

/**
 * Get a Task Center queue's name.
 * @param {string} queueId - The queue ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<string|null>} The name, or null when it can't be read
 */
export async function getTaskCenterQueueName(queueId, tabId = null) {
  return executeInPage(
    async (queueId) => {
      const response = await fetch(`/api/queues/v1/${queueId}`);
      if (!response.ok) return null;
      const queue = await response.json();
      return queue?.name ?? null;
    },
    [queueId],
    tabId
  );
}

/**
 * Read a Task Center queue's grantees, flattened into one list. The API keys
 * them by recipient kind (`{ USER: [...] }`, plus `GROUP` when groups are
 * granted), and the key is the authoritative kind, so it is what lands in
 * `type`. Every other field an entry carries (such as `name`) is preserved, so
 * a grantee this toolkit isn't changing survives the write intact.
 * @param {Object} params
 * @param {string} params.queueId - The queue ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Array<{id: string, permissions: string[], type: string}>>}
 */
export async function getTaskCenterQueuePermissions({ queueId, tabId = null }) {
  const result = await executeInPage(
    async (queueId) => {
      const response = await fetch(`/api/queues/v1/${queueId}/permissions`);
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { data: await response.json(), ok: true };
    },
    [queueId],
    tabId
  );

  if (!result?.ok) throw new Error(result?.error || "Failed to read the queue's permissions");
  // The write this feeds replaces the whole list, so an unusable body must not
  // read as "no grantees": that would send one entry and revoke everyone.
  if (!result.data || typeof result.data !== 'object' || Array.isArray(result.data)) {
    throw new Error("Could not read the queue's permissions");
  }
  return ['GROUP', 'USER'].flatMap((type) =>
    (result.data?.[type] ?? []).map((entry) => ({
      ...entry,
      id: String(entry.id),
      permissions: entry.permissions ?? [],
      type
    }))
  );
}

/**
 * Replace a Task Center queue's whole grantee list. Anyone left out loses
 * access, so every grantee to keep must be sent; use `shareTaskCenterQueue` to
 * change one user without disturbing the rest.
 * @param {Object} params
 * @param {Array<{id: string, permissions: string[], type: string}>} params.entries
 * @param {string} params.queueId - The queue ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<void>}
 */
export async function setTaskCenterQueuePermissions({ entries, queueId, tabId = null }) {
  const result = await executeInPage(
    async (entries, queueId) => {
      const response = await fetch(`/api/queues/v1/${queueId}/permissions`, {
        body: JSON.stringify(entries),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) return { error: `HTTP ${response.status}`, ok: false };
      return { ok: true };
    },
    [entries, queueId],
    tabId
  );

  if (!result?.ok) throw new Error(result?.error || "Failed to update the queue's permissions");
}

/**
 * Grant a user permissions on a Task Center queue, on top of whatever they
 * already have. A task carries no permissions of its own, so this is also how
 * access to a task is granted.
 * @param {Object} params
 * @param {string[]} [params.permissions] - Defaults to the full admin bundle
 * @param {string} params.queueId - The queue ID
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {number} params.userId - The recipient user ID
 * @returns {Promise<{previousPermissions: string[]}>} What the user held before,
 *   so a caller can put the queue back the way it found it
 */
export async function shareTaskCenterQueue({ permissions = QUEUE_ADMIN_PERMISSIONS, queueId, tabId = null, userId }) {
  if (!queueId) throw new Error('Queue ID is required to share a Task Center queue');
  if (!userId) throw new Error('User ID is required to share a Task Center queue');
  return writeQueueUserPermissions({ merge: true, permissions, queueId, tabId, userId });
}

/**
 * Transfer Task Center queue ownership to a new user.
 * @param {string[]} queueIds - Array of queue IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferTaskCenterQueues(queueIds, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (queueIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of queueIds) {
        try {
          const response = await fetch(`/api/queues/v1/${id}/owner/${toUserId}`, {
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
    [queueIds, fromUserId, toUserId],
    tabId
  );
}

/**
 * Transfer Task Center tasks to a new user.
 * @param {Array<{id: string, queueId: string}>} tasks - Array of tasks with their queue IDs
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferTaskCenterTasks(tasks, fromUserId, toUserId, tabId = null) {
  return executeInPage(
    async (tasks, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const task of tasks) {
        if (!task.queueId) {
          errors.push({ error: 'Missing queueId', id: task.id });
          continue;
        }
        try {
          const response = await fetch(`/api/queues/v1/${task.queueId}/tasks/${task.id}/assign`, {
            body: JSON.stringify({
              taskIds: [task.id],
              type: 'USER',
              userId: toUserId
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'PUT'
          });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id: task.id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [tasks, fromUserId, toUserId],
    tabId
  );
}

/**
 * Void a Task Center task, the platform's equivalent of deleting one: the task
 * stays in its queue with a VOIDED status and can no longer be completed.
 *
 * A void rejected for permission is retried once with Void Tasks temporarily
 * granted on the queue, then the grant is reverted, so the caller sees an
 * ordinary void and the queue is left as it was found.
 *
 * @param {Object} params
 * @param {string|null} [params.queueId] - The task's queue ID; looked up when omitted
 * @param {number|null} [params.tabId] - Optional Chrome tab ID
 * @param {string} params.taskId - The task ID
 * @param {number|null} [params.userId] - Enables the permission retry when set
 * @returns {Promise<{alreadyVoided: boolean, permissionRevertError: string|null, status: string, task: Object}>}
 */
export async function voidTaskCenterTask({ queueId = null, tabId = null, taskId, userId = null }) {
  let result = await voidTaskInPage({ queueId, tabId, taskId });
  let permissionRevertError = null;

  if (!result?.ok && result?.forbidden && userId) {
    const resolvedQueueId = result.queueId || queueId;
    let previousPermissions;
    try {
      ({ previousPermissions } = await shareTaskCenterQueue({
        permissions: QUEUE_VOID_TASK_PERMISSIONS,
        queueId: resolvedQueueId,
        tabId,
        userId
      }));
    } catch {
      // Granting needs the same authority the void was refused for, so there is
      // nothing further to try and the original refusal is the useful message.
      throw new Error(result.error);
    }
    try {
      result = await voidTaskInPage({ queueId: resolvedQueueId, tabId, taskId });
    } finally {
      permissionRevertError = await writeQueueUserPermissions({
        permissions: previousPermissions,
        queueId: resolvedQueueId,
        tabId,
        userId
      }).then(
        () => null,
        (error) => error.message
      );
    }
  }

  if (!result?.ok) throw new Error(result?.error || 'Failed to void task');
  return {
    alreadyVoided: !!result.alreadyVoided,
    permissionRevertError,
    status: result.status,
    task: result.task
  };
}

const QUEUE_ADMIN_PERMISSIONS = [
  'ADMIN',
  'SHARE',
  'DELETE',
  'WRITE',
  'READ',
  'READ_CONTENT',
  'CREATE_CONTENT',
  'UPDATE_CONTENT',
  'DELETE_CONTENT'
];

const QUEUE_VOID_TASK_PERMISSIONS = ['READ', 'READ_CONTENT', 'DELETE_CONTENT'];

/**
 * One void attempt. Returns the queue it resolved so a retry can reuse it, and
 * flags a permission refusal so the caller can act on it rather than only
 * report it.
 * @returns {Promise<Object>} `{ ok, queueId, ... }`, never throws for an API failure
 */
async function voidTaskInPage({ queueId, tabId, taskId }) {
  return executeInPage(
    async (queueId, taskId) => {
      // The workflow user-task-response page carries no queue ID, so resolve it
      // from the task itself before the void, which needs it in the path.
      if (!queueId) {
        const lookup = await fetch(`/api/queues/v2/tasks/lookup?taskId=${encodeURIComponent(taskId)}`);
        if (!lookup.ok) return { error: `Could not find the task's queue (HTTP ${lookup.status})`, ok: false };
        queueId = (await lookup.json())?.queueId;
        if (!queueId) return { error: "Could not find the task's queue", ok: false };
      }

      // The endpoint declares `consumes = application/json`, so the header is
      // required even though it takes no body; without it Spring reads the
      // request as octet-stream and rejects it.
      const response = await fetch(`/api/queues/v1/${queueId}/tasks/${encodeURIComponent(taskId)}/void`, {
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      });
      if (!response.ok) {
        const body = await response.text().catch(() => '');
        let detail = '';
        try {
          detail = JSON.parse(body)?.message || '';
        } catch {
          // A non-JSON error body leaves the HTTP status as the only detail.
        }
        if (response.status === 403) {
          return {
            error: 'You need admin or Void Tasks permission on this queue to void the task',
            forbidden: true,
            ok: false,
            queueId
          };
        }
        // Something else may have voided it first (cancelling the run that
        // created it makes Domo void it), and a task that is already voided is
        // the outcome asked for, so confirm the status rather than trust the
        // rejection message.
        const current = await fetch(`/api/queues/v1/${queueId}/tasks/${encodeURIComponent(taskId)}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
        if (current?.status === 'VOIDED') {
          return { alreadyVoided: true, ok: true, queueId, status: 'VOIDED', task: current };
        }
        return { error: detail || `HTTP ${response.status}`, ok: false, queueId };
      }

      const task = await response.json();
      return { alreadyVoided: false, ok: true, queueId, status: task?.status ?? null, task };
    },
    [queueId, taskId],
    tabId
  );
}

/**
 * Set one user's permissions on a queue, leaving every other grantee's alone.
 * Read-modify-write, because the POST replaces the whole grantee list.
 * @param {Object} params
 * @param {boolean} [params.merge] - Add to what the user holds instead of replacing it
 * @param {string[]} params.permissions
 * @param {string} params.queueId
 * @param {number|null} params.tabId
 * @param {number} params.userId
 * @returns {Promise<{previousPermissions: string[]}>}
 */
async function writeQueueUserPermissions({ merge = false, permissions, queueId, tabId, userId }) {
  const entries = await getTaskCenterQueuePermissions({ queueId, tabId });
  const isRecipient = (entry) => entry.type === 'USER' && String(entry.id) === String(userId);
  const existing = entries.find(isRecipient);
  const previousPermissions = existing?.permissions ?? [];
  const next = entries.filter((entry) => !isRecipient(entry));
  const granted = merge ? [...new Set([...previousPermissions, ...permissions])] : permissions;
  // Omission is the revocation, since the write replaces the list. Reverting a
  // user who held nothing therefore means leaving them out, not sending them an
  // empty entry that would linger in the queue's sharing dialog.
  if (granted.length) {
    next.push({ ...existing, id: String(userId), permissions: granted, type: 'USER' });
  }

  await setTaskCenterQueuePermissions({ entries: next, queueId, tabId });
  return { previousPermissions };
}
