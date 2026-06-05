/**
 * Translate Activity Log UI filters into a Domo dataset-query `where` tree.
 *
 * Filter shape (all optional):
 *   {
 *     objectIds:      string[]   → IN over Object_ID
 *     objectTypes:    string[]   → IN over Object_Type
 *     actions:        string[]   → IN over Action
 *     userIds:        string[]   → IN over User_ID
 *     excludeUserIds: string[]   → NOT IN over User_ID
 *     dateRange:      { start: epochMs, end: epochMs } → BETWEEN over Event_Time
 *   }
 *
 * Multiple filters compose as a left-folded AND tree, matching the Domo
 * query-engine wire format. Returns `null` when no filters are provided.
 *
 * The `BETWEEN` expression takes string-typed bounds in `'YYYY-MM-DD HH:mm:ss'`
 * format (space-separated, NOT ISO 'T'). The dataset query language has a
 * dedicated single-node BETWEEN — do NOT decompose into paired `>=` AND `<=`.
 */

const expr = {
  and: (left, right) => ({ exprType: 'AND', leftExpr: left, rightExpr: right }),
  between: (column, start, end) => ({
    betweenEnd: expr.string(end),
    betweenStart: expr.string(start),
    exprType: 'BETWEEN',
    leftExpr: expr.column(column)
  }),
  column: (name) => ({ column: name, exprType: 'COLUMN' }),
  in: (column, values, not = false) => ({
    exprType: 'IN',
    leftExpr: expr.column(column),
    not,
    selectSet: values.map((v) => expr.string(String(v)))
  }),
  string: (value) => ({ exprType: 'STRING_VALUE', value })
};

export function buildWhere({ actions, dateRange, excludeUserIds, objectIds, objectTypes, userIds } = {}) {
  const predicates = [];
  if (objectIds?.length > 0) predicates.push(expr.in('Object_ID', objectIds));
  if (objectTypes?.length > 0) predicates.push(expr.in('Object_Type', objectTypes));
  if (actions?.length > 0) predicates.push(expr.in('Action', actions));
  // Filter on User_ID (the canonical user), not Source_ID (the actor, which can
  // be a SYSTEM/ETL source). User_ID matches the autocomplete's IDs and the
  // audit-API path's userId; for user-initiated events the two columns are equal.
  if (userIds?.length > 0) predicates.push(expr.in('User_ID', userIds));
  if (excludeUserIds?.length > 0) predicates.push(expr.in('User_ID', excludeUserIds, true));
  if (dateRange?.start && dateRange?.end) {
    predicates.push(expr.between('Event_Time', formatEventTimeBound(dateRange.start), formatEventTimeBound(dateRange.end)));
  }

  if (predicates.length === 0) return null;
  return predicates.reduce((acc, p) => expr.and(acc, p));
}

/**
 * Format an epoch-ms timestamp as `'YYYY-MM-DD HH:mm:ss'` in local time —
 * the format Domo's dataset BETWEEN expression expects.
 */
export function formatEventTimeBound(epochMs) {
  const d = new Date(epochMs);
  const pad = (n) => String(n).padStart(2, '0');
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}
