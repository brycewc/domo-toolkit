import { executeInPage } from '@/utils';

/**
 * Get all projects and tasks owned/assigned to a user.
 * @param {number} userId - The Domo user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{projects: Array<{id: number, name: string}>, tasks: Array<{id: number, name: string, projectId: number}>}>}
 */
export async function getOwnedProjectsAndTasks(userId, tabId = null) {
  return executeInPage(
    async (userId) => {
      const allProjects = [];
      const allTasks = [];
      const limit = 100;
      let moreData = true;
      let offset = 0;

      // Get projects owned by user
      while (moreData) {
        const response = await fetch(
          `/api/content/v2/users/${userId}/projects?limit=${limit}&offset=${offset}`
        );
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();

        if (data && data.length > 0) {
          for (const project of data) {
            if (project.assignedTo == userId) {
              allProjects.push({
                id: project.id,
                name: project.name || project.id.toString()
              });
            }
          }
          offset += limit;
          if (data.length < limit) moreData = false;
        } else {
          moreData = false;
        }
      }

      // Get tasks for each project assigned to user
      for (const project of allProjects) {
        try {
          const taskResponse = await fetch(
            `/api/content/v1/projects/${project.id}/tasks?assignedToOwnerId=${userId}`
          );
          if (!taskResponse.ok) continue;
          const tasks = await taskResponse.json();

          if (tasks && tasks.length > 0) {
            allTasks.push(
              ...tasks.map((t) => ({
                id: t.id,
                name: t.taskName || t.id.toString(),
                projectId: project.id
              }))
            );
          }
        } catch {
          // Skip projects where task fetch fails
        }
      }

      return { projects: allProjects, tasks: allTasks };
    },
    [userId],
    tabId
  );
}

/**
 * Transfer projects and tasks to a new user.
 * @param {{projects: Array<{id: number}>, tasks: Array<{id: number}>}} items - Projects and tasks to transfer
 * @param {number} fromUserId - The current owner's user ID
 * @param {number} toUserId - The new owner's user ID
 * @param {number|null} tabId - Optional Chrome tab ID
 * @returns {Promise<{errors: Array, failed: number, succeeded: number}>}
 */
export async function transferProjectsAndTasks(
  items,
  fromUserId,
  toUserId,
  tabId = null
) {
  return executeInPage(
    async (items, fromUserId, toUserId) => {
      const errors = [];
      let succeeded = 0;

      // Transfer tasks
      for (const task of items.tasks || []) {
        try {
          // Fetch full task object
          const getResponse = await fetch(
            `/api/content/v1/tasks/${task.id}`
          );
          if (!getResponse.ok) throw new Error(`HTTP ${getResponse.status}`);
          const taskData = await getResponse.json();

          if (taskData.primaryTaskOwner == fromUserId) {
            taskData.primaryTaskOwner = toUserId;
          }
          taskData.contributors = [
            ...(taskData.contributors || []),
            { assignedBy: fromUserId, assignedTo: toUserId }
          ];
          taskData.owners = [
            ...(taskData.owners || []),
            { assignedBy: fromUserId, assignedTo: toUserId }
          ];

          const response = await fetch(
            `/api/content/v1/tasks/${task.id}`,
            {
              body: JSON.stringify(taskData),
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

      // Transfer projects
      for (const project of items.projects || []) {
        try {
          const response = await fetch(
            `/api/content/v1/projects/${project.id}`,
            {
              body: JSON.stringify({
                creator: toUserId,
                id: project.id
              }),
              headers: { 'Content-Type': 'application/json' },
              method: 'PUT'
            }
          );
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          succeeded++;
        } catch (error) {
          errors.push({ error: error.message, id: project.id });
        }
      }

      return { errors, failed: errors.length, succeeded };
    },
    [items, fromUserId, toUserId],
    tabId
  );
}
