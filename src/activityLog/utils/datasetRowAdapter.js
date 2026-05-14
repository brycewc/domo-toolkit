/**
 * Map a positional row from the DomoStats Activity Log dataset query response
 * into a record shape consumed by the activity log table. Mostly mirrors the
 * audit-API record shape (time/userId/actionType/object*) so shared columns
 * Just Work, with two intentional divergences:
 *
 *   - The dataset has Source_ID / Name / Type identifying the actor (which
 *     can be a USER, SYSTEM job, ETL, etc.) — surfaced as sourceId/sourceName/
 *     sourceType so the table can render a "Source" column similar to "Object".
 *   - User_ID is a separate underlying user reference that may or may not be
 *     populated. We use it as `userId`, leave `userName` null, and let the
 *     table look up display names via `fetchUserDisplayNames`.
 *
 * The dataset has no equivalent of the API's `additionalComment` / Description,
 * so we set it to null — the table swaps Description out for the Source column
 * when source==='dataset' so the slot isn't wasted.
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
    sourceId: row[FIELD_INDEX.Source_ID] ?? null,
    sourceName: row[FIELD_INDEX.Name] ?? null,
    sourceType: row[FIELD_INDEX.Type] ?? null,
    time: row[FIELD_INDEX.Event_Time] ?? null,
    userId: row[FIELD_INDEX.User_ID] ?? null,
    userName: null
  };
}
