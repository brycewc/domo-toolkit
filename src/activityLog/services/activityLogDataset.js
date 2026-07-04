import { executeInPage } from '@/utils/executeInPage';

import { buildWhere } from '../utils/datasetFilterMapper';
import { datasetRowToActivityRecord } from '../utils/datasetRowAdapter';

/**
 * Column order for the DomoStats Activity Log dataset query. The order also
 * defines positional indices used by `datasetRowToActivityRecord` — keep in
 * lockstep.
 */
const ACTIVITY_LOG_DATASET_COLUMNS = [
  'Event_Time',
  'Source_ID',
  'Name',
  'Type',
  'Action',
  'Object_ID',
  'Object_Name',
  'Object_Type',
  'User_ID',
  'Event_ID',
  'Client_ID',
  'IP_Address',
  'Device',
  'Authentication_Method',
  'Browser_Details',
  '_BATCH_ID_',
  '_BATCH_LAST_RUN_'
];

const QUERY_CONTEXT = {
  calendar: 'StandardCalendar',
  features: {
    AllowNullValues: true,
    PerformTimeZoneConversion: true,
    TreatNumbersAsStrings: true
  }
};

const COUNT_QUERY_CONTEXT = {
  calendar: 'StandardCalendar',
  features: {
    AllowNullValues: true,
    PerformTimeZoneConversion: true
  }
};

/**
 * Fetch a page of activity log records from a DomoStats Activity Log dataset.
 * Issues the count query and the page query in parallel, then adapts the
 * positional rows into the same record shape produced by the audit-API path.
 *
 * Returns `{ events, total, limit, offset }` matching the shape returned by
 * `getActivityLogForObject` in services/activityLog.js, so the table component
 * can swap sources without changing how it consumes pages.
 */
export async function getActivityLogFromDataset({
  datasetId,
  filters = {},
  limit = 100,
  offset = 0,
  sortDirection = 'descending',
  tabId
} = {}) {
  if (!datasetId) {
    throw new Error('getActivityLogFromDataset: datasetId is required');
  }

  const where = buildWhere(filters);
  const order = sortDirection === 'ascending' ? 'ASCENDING' : 'DESCENDING';

  const result = await executeInPage(
    async (datasetId, columns, where, queryContext, countContext, limit, offset, order) => {
      const url = `/api/query/v1/execute/${datasetId}`;
      const init = {
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST'
      };

      const pageBody = {
        context: queryContext,
        query: {
          columns: columns.map((c) => ({ column: c, exprType: 'COLUMN' })),
          groupByColumns: [],
          having: null,
          limit: { limit, offset },
          orderByColumns: [
            {
              expression: { column: 'Event_Time', exprType: 'COLUMN' },
              order
            }
          ],
          where
        },
        querySource: 'data_table',
        useCache: true
      };

      const countBody = {
        context: countContext,
        query: {
          columns: [
            {
              arguments: [{ exprType: 'NUMERIC_VALUE', value: 1 }],
              exprType: 'FUNCTION',
              name: 'COUNT'
            }
          ],
          fromQuery: {
            columns: [{ column: 'Event_Time', exprType: 'COLUMN' }],
            groupByColumns: [],
            having: null,
            where
          },
          limit: { limit: 1 }
        },
        querySource: 'judoTable-rowCount'
      };

      // Errors thrown inside an injected MAIN-world function are not propagated
      // back by chrome.scripting (the frame result is serialized as null), which
      // would surface downstream as a cryptic destructure crash. Return failures
      // as a structured { error } object so the real HTTP status survives.
      try {
        const [countResp, pageResp] = await Promise.all([
          fetch(url, { ...init, body: JSON.stringify(countBody) }),
          fetch(url, { ...init, body: JSON.stringify(pageBody) })
        ]);

        if (!countResp.ok) {
          return { error: `Failed to fetch activity log count from dataset. HTTP status: ${countResp.status}` };
        }
        if (!pageResp.ok) {
          return { error: `Failed to fetch activity log events from dataset. HTTP status: ${pageResp.status}` };
        }

        const countData = await countResp.json();
        const pageData = await pageResp.json();

        return {
          rawRows: pageData.rows || [],
          total: parseInt(countData.rows?.[0]?.[0] ?? 0, 10) || 0
        };
      } catch (err) {
        return { error: err?.message || 'Unknown error querying the DomoStats dataset' };
      }
    },
    [datasetId, ACTIVITY_LOG_DATASET_COLUMNS, where, QUERY_CONTEXT, COUNT_QUERY_CONTEXT, limit, offset, order],
    tabId
  );

  if (!result) {
    throw new Error('No response from the DomoStats dataset query.');
  }
  if (result.error) {
    throw new Error(result.error);
  }

  return {
    events: result.rawRows.map((r) => datasetRowToActivityRecord(r)),
    limit,
    offset,
    total: result.total
  };
}
