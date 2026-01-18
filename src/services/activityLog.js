import { executeInPage } from '@/utils';

/**
 * Get all activity log object types for a given object type
 * Some object types map to multiple activity log types
 * @param {string} objectType - The object type ID
 * @returns {string[]} Array of activity log type strings
 */
function getActivityLogTypes(objectType) {
  switch (objectType) {
    case 'BEAST_MODE_FORMULA':
      return ['BEAST_MODE_FORMULA', 'VARIABLE'];
    case 'DATA_SOURCE':
      return [
        'DATA_SOURCE',
        'DATASET',
        'VIEW',
        'VIEW_ADVANCED_EDITOR',
        'DUPLICATED_DATA_SOURCE'
      ];
    case 'APP':
      return ['APP', 'RYUU_APP'];
    case 'CODEENGINE_PACKAGE':
      return ['CODEENGINE_PACKAGE', 'FUNCTION'];
    case 'GOAL':
      return ['GOAL', 'OBJECTIVE'];
    default:
      return [objectType];
  }
}

/**
 * Get activity log events from the Domo Audit API
 * @param {Object} params - Parameters for fetching activity log events
 * @param {number} [params.limit=50] - Number of events to fetch (max 1000)
 * @param {number} [params.offset=0] - Offset for pagination
 * @param {string} [params.objectType] - Filter by object type (e.g., 'DATASET', 'CARD', 'PAGE')
 * @param {string} [params.objectId] - Filter by specific object ID
 * @param {string} [params.eventType] - Filter by event type (e.g., 'CREATE', 'UP', 'DELETE')
 * @param {string} [params.userId] - Filter by user ID who performed the event
 * @param {number} [params.start] - Start timestamp in epoch milliseconds (defaults to 1 year ago)
 * @param {number} [params.end] - End timestamp in epoch milliseconds (defaults to now)
 * @param {number} params.tabId - The tab ID where the Domo page is open (for credentials)
 * @returns {Promise<Object>} Object containing events array and pagination info
 * @throws {Error} If the fetch fails
 *
 * Example response:
 * {
 *   events: [
 *     {
 *       id: "123",
 *       timestamp: "2025-01-15T10:30:00Z",
 *       userId: "456",
 *       userName: "John Doe",
 *       userEmail: "john.doe@example.com",
 *       eventType: "UPDATE",
 *       objectType: "DATASET",
 *       objectId: "789",
 *       objectName: "Sales Data",
 *       details: { ... },
 *       ipAddress: "192.168.1.1"
 *     }
 *   ],
 *   total: 1234,
 *   limit: 50,
 *   offset: 0
 * }
 */
export async function getActivityLogEvents({
  limit = 50,
  offset = 0,
  objectType,
  objectId,
  eventType,
  userId,
  start,
  end,
  tabId
} = {}) {
  try {
    // Default start to 1 year ago, end to now (in epoch milliseconds)
    const now = Date.now();
    const oneYearAgo = now - 365 * 24 * 60 * 60 * 1000;
    const startTimestamp = start ?? oneYearAgo;
    const endTimestamp = end ?? now;

    // Ensure all arguments are serializable (convert undefined to null)
    const serializableArgs = [
      limit,
      offset,
      objectType ?? null,
      objectId ?? null,
      eventType ?? null,
      userId ?? null,
      startTimestamp,
      endTimestamp
    ];
    // Execute fetch in the context of the specified tab to use authenticated session
    const result = await executeInPage(
      async (
        limit,
        offset,
        objectType,
        objectId,
        eventType,
        userId,
        start,
        end
      ) => {
        // Build query parameters
        const queryParams = new URLSearchParams();
        queryParams.append('limit', limit.toString());
        queryParams.append('offset', offset.toString());

        if (objectType) queryParams.append('objectType', objectType);
        if (objectId) queryParams.append('objectId', objectId);
        if (eventType) queryParams.append('eventType', eventType);
        if (userId) queryParams.append('userId', userId);
        if (start) queryParams.append('start', start);
        if (end) queryParams.append('end', end);

        // First, get the total count
        const countResponse = await fetch(
          `/api/audit/v1/user-audits/count?${queryParams.toString()}`,
          {
            method: 'GET',
            credentials: 'include'
          }
        );

        if (!countResponse.ok) {
          throw new Error(
            `Failed to fetch activity log count. HTTP status: ${countResponse.status}`
          );
        }

        const countData = await countResponse.json();
        const total = countData?.count ?? 0;

        // Fetch activity log events from Domo Audit API
        const response = await fetch(
          `/api/audit/v1/user-audits?${queryParams.toString()}`,
          {
            method: 'GET',
            credentials: 'include'
          }
        );

        if (!response.ok) {
          throw new Error(
            `Failed to fetch activity log events. HTTP status: ${response.status}`
          );
        }

        const data = await response.json();

        // API returns array directly, not an object with events property
        const events = Array.isArray(data) ? data : [];

        return {
          events: events,
          total: total || 0,
          limit: limit,
          offset: offset
        };
      },
      serializableArgs,
      tabId
    );

    return result;
  } catch (error) {
    console.error('Error fetching activity log events:', error);
    throw error;
  }
}

/**
 * Get activity log events for the current object
 * @param {Object} params - Parameters for fetching activity log events
 * @param {string} params.objectType - The object type ID
 * @param {string} params.objectId - The object ID
 * @param {number} [params.limit=50] - Number of events to fetch
 * @param {number} [params.offset=0] - Offset for pagination
 * @param {number} params.tabId - The tab ID where the Domo page is open
 * @returns {Promise<Object>} Object containing events array and pagination info
 */
export async function getActivityLogForObject({
  objectType,
  objectId,
  limit = 50,
  offset = 0,
  tabId
}) {
  // Default start to 2008-01-01, end to now (in epoch milliseconds)
  const start = new Date('2008-01-01').getTime();
  const end = Date.now();

  // Map object types to activity log types (some types have multiple mappings)
  const activityLogTypes = getActivityLogTypes(objectType);

  // For objects with multiple type mappings, we need to fetch for each type
  // and combine results. For now, we'll use the first type.
  const primaryType = activityLogTypes[0];

  return await getActivityLogEvents({
    objectType: primaryType,
    objectId,
    limit,
    offset,
    start,
    end,
    tabId
  });
}
