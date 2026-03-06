import { executeInPage } from '@/utils';

/**
 * Get activity log events from the Domo Audit API
 * @param {Object} params
 * @param {number} [params.limit=50] - Number of events to fetch (max 1000)
 * @param {number} [params.offset=0] - Offset for pagination
 * @param {string} [params.objectType] - Filter by object type (e.g., 'DATASET', 'CARD', 'PAGE')
 * @param {string} [params.objectId] - Filter by specific object ID
 * @param {string} [params.eventType] - Filter by event type
 * @param {string} [params.user] - Filter by user ID
 * @param {number} params.tabId - The tab ID where the Domo page is open (for credentials)
 * @returns {Promise<{events: Array, total: number, limit: number, offset: number}>}
 */
export async function getActivityLogForObject({
  eventType,
  limit = 50,
  objectId,
  objectType,
  offset = 0,
  tabId,
  user
} = {}) {
  const serializableArgs = [
    limit ?? 50,
    offset ?? 0,
    objectType ?? null,
    objectId ?? null,
    eventType ?? null,
    user ?? null,
    new Date('2008-01-01').getTime(),
    Date.now()
  ];

  return executeInPage(
    async (limit, offset, objectType, objectId, eventType, user, start, end) => {
      const queryParams = new URLSearchParams();
      queryParams.append('limit', limit.toString());
      queryParams.append('offset', offset.toString());

      if (objectType) queryParams.append('objectType', objectType);
      if (objectId) queryParams.append('objectId', objectId);
      if (eventType) queryParams.append('eventType', eventType);
      if (user) queryParams.append('user', user);
      if (start) queryParams.append('start', start);
      if (end) queryParams.append('end', end);

      const [countResponse, eventsResponse] = await Promise.all([
        fetch(`/api/audit/v1/user-audits/count?${queryParams.toString()}`, {
          credentials: 'include',
          method: 'GET'
        }),
        fetch(`/api/audit/v1/user-audits?${queryParams.toString()}`, {
          credentials: 'include',
          method: 'GET'
        })
      ]);

      if (!countResponse.ok) {
        throw new Error(
          `Failed to fetch activity log count. HTTP status: ${countResponse.status}`
        );
      }
      if (!eventsResponse.ok) {
        throw new Error(
          `Failed to fetch activity log events. HTTP status: ${eventsResponse.status}`
        );
      }

      const countData = await countResponse.json();
      const data = await eventsResponse.json();

      return {
        events: Array.isArray(data) ? data : [],
        limit,
        offset,
        total: countData?.count ?? 0
      };
    },
    serializableArgs,
    tabId
  );
}

/**
 * Get the list of possible event types for a given object type
 * @param {string} objectType - The object type ID (e.g., 'DATASET', 'CARD', 'PAGE')
 * @param {number} tabId - The tab ID where the Domo page is open (for credentials)
 * @returns {Promise<Array<{type: string, translation: string}>>}
 */
export async function getEventTypesForObjectType(objectType, tabId) {
  return executeInPage(
    async (objectType) => {
      const response = await fetch(
        `/api/audit/v1/user-audits/objectTypes/${encodeURIComponent(objectType)}/eventTypes`,
        { credentials: 'include', method: 'GET' }
      );
      if (!response.ok) {
        throw new Error(
          `Failed to fetch event types. HTTP status: ${response.status}`
        );
      }
      return response.json();
    },
    [objectType],
    tabId
  );
}
