/**
 * Map a positional row from the DomoStats Activity Log dataset query response
 * into the same record shape that the audit-API path produces, so the existing
 * column renderers (createTimestampColumn / createUserColumn / createActionColumn
 * / createObjectColumn / createAdditionalCommentColumn in ActivityLogTable.jsx)
 * don't need to know which source produced the row.
 *
 * Column order matches the request body's `columns` array — see
 * `ACTIVITY_LOG_DATASET_COLUMNS` in services/activityLogDataset.js. Indices below
 * track that order; if the column list changes, update both in lockstep.
 */
const FIELD_INDEX = {
  Action: 4,
  Authentication_Method: 13,
  Browser_Details: 14,
  Client_ID: 10,
  Device: 12,
  Event_ID: 9,
  Event_Time: 0,
  IP_Address: 11,
  Name: 2,
  Object_ID: 5,
  Object_Name: 6,
  Object_Type: 7,
  Source_ID: 1,
  Type: 3,
  User_ID: 8
};

export function datasetRowToActivityRecord(row) {
  return {
    actionType: row[FIELD_INDEX.Action] ?? null,
    additionalComment: null,
    authenticationMethod: row[FIELD_INDEX.Authentication_Method] ?? null,
    browserDetails: row[FIELD_INDEX.Browser_Details] ?? null,
    clientId: row[FIELD_INDEX.Client_ID] ?? null,
    device: row[FIELD_INDEX.Device] ?? null,
    eventId: row[FIELD_INDEX.Event_ID] ?? null,
    ipAddress: row[FIELD_INDEX.IP_Address] ?? null,
    objectId: row[FIELD_INDEX.Object_ID] ?? null,
    objectName: row[FIELD_INDEX.Object_Name] ?? null,
    objectType: row[FIELD_INDEX.Object_Type] ?? null,
    time: row[FIELD_INDEX.Event_Time] ?? null,
    userId: row[FIELD_INDEX.Source_ID] ?? row[FIELD_INDEX.User_ID] ?? null,
    userName: row[FIELD_INDEX.Name] ?? null
  };
}
