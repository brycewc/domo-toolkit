import { executeInPage } from '@/utils';

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
              }
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
              name: q.title || q.uuid
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
        const response = await fetch(
          `/api/queues/v1/tasks/list?limit=${limit}&offset=${offset}`,
          {
            body: JSON.stringify({
              assignedTo: [userId],
              status: ['OPEN']
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST'
          }
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          allTasks.push(
            ...data.map((t) => ({
              id: t.id,
              name: t.name || t.id,
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
 * Transfer Task Center queue ownership to a new user.
 * @param {string[]} queueIds - Array of queue IDs to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferTaskCenterQueues(
  queueIds,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (queueIds, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      for (const id of queueIds) {
        try {
          const response = await fetch(
            `/api/queues/v1/${id}/owner/${toUserId}`,
            {
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            }
          );
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
export async function transferTaskCenterTasks(
  tasks,
  fromUserId,
  toUserId,
  tabId = null
) {
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
          const response = await fetch(
            `/api/queues/v1/${task.queueId}/tasks/${task.id}/assign`,
            {
              body: JSON.stringify({
                taskIds: [task.id],
                type: 'USER',
                userId: toUserId
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            }
          );
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
