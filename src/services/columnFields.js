/**
 * Shared registry of column-bearing fields across Domo definition payloads.
 * Both the scanner (`columnReferences.js`) and the rewriter
 * (`columnRewriter.js`) must read from the same registry — anything not
 * listed here is invisible to migration. Widening one consumer without the
 * other creates false negatives (missing rewrites) or false positives
 * (orphaned scan results); keep both consumers in lockstep by editing this
 * file rather than either of them.
 *
 * Four column-ref shapes are recognized:
 *   1. **Backticked refs in expression strings** — formulas,
 *      formattedExpression, SQL clauses. Pattern: `` `Column Name` ``
 *      (see `BACKTICK_REF_RE`).
 *   2. **Plain string values at known column-bearing fields** — `column`,
 *      `columnName`, `field`, `leftColumn`, `rightColumn`, `groupBy`, etc.
 *   3. **Object keys at known column-name-keyed paths** — e.g.
 *      `chartProperties.columnFormats[colName]`.
 *   4. **Magic ETL structured Field nodes** — `{ type: 'Field', name: '<col>',
 *      table }`. The column sits at `name` but nested under `expression` (e.g.
 *      an Order tile's `orderBy[].expression`), so the over-broad bare-`name`
 *      gate skips it; both walkers match `type === 'Field'` explicitly instead.
 *      `type === 'Field'` is unambiguous in Magic ETL expression trees, so this
 *      also covers Field leaves nested inside Operation exprs (Filter, etc.).
 *
 * Magic ETL action variants surface the same column-bearing concept under
 * different keys across action types (Filter, Group By, Join, Pivot,
 * Rename, etc.), which is why the lists are deliberately wide.
 */

/** Field names whose string value is itself a column name. */
export const COLUMN_VALUE_FIELDS = new Set([
  'aggregateColumn',
  'column',
  'columnName',
  'columnNameNew',
  'columnNameOld',
  'existingColumnName',
  'field',
  'fieldName',
  'fromColumn',
  'groupBy',
  'groupByColumn',
  'id', // only when nested under known column-list contexts (see isColumnListParent)
  'inputColumn',
  'inStreamName', // Magic ETL ReplaceString fields[]
  'keyColumn',
  'keyField', // Magic ETL Denormaliser (Pivot) — pivot column
  'leftColumn',
  'leftField', // Magic ETL Filter — filterList[].leftField
  'name', // only when nested under known column-list contexts (see isColumnListParent)
  'newColumnName',
  'outputColumn',
  'pivotColumn',
  'rightColumn',
  'rightField', // Magic ETL Filter — filterList[].rightField (when comparing two columns)
  'sortColumn',
  'source', // Magic ETL GroupBy — fields[].source (the input column being aggregated)
  'sourceColumn',
  'sourceField', // Magic ETL Normalizer (Unpivot) — fields[].sourceField
  'targetColumn',
  'toColumn',
  'valueColumn'
]);

/**
 * Field names whose value is an array of column references — either an array
 * of strings (each a column name) OR an array of `{column}` / `{name}` /
 * `{columnName}` objects.
 */
export const COLUMN_LIST_FIELDS = new Set([
  'aggregationColumns',
  'columns',
  'fields', // Magic ETL — SelectValues, ReplaceString, TextFormatting
  'fixedColumns',
  'group', // Magic ETL Denormaliser (Pivot) — row identifier list, items: {name: "<col>"}
  'groupBy',
  'groupByColumns',
  'groups', // Magic ETL GroupBy — group columns, items: {name: "<col>"}
  'inputColumns',
  'keys1', // Magic ETL MergeJoin
  'keys2', // Magic ETL MergeJoin
  'leftJoinColumns',
  'orderBy',
  'orderByColumns',
  'outputColumns',
  'partitionBy',
  'partitionByColumns',
  'rightJoinColumns',
  'schemaModification1', // Magic ETL MergeJoin — items have `name` (input ref)
  'schemaModification2',
  'selectedColumns',
  'sort',
  'sortColumns',
  'sourceColumns',
  'unpivotColumns'
]);

/** Object keys that are themselves keyed by column name. */
export const COLUMN_KEYED_FIELDS = new Set(['columnFormats']);

/** Field names whose string value is an expression with backticked column refs. */
export const EXPRESSION_FIELDS = new Set([
  'expression',
  'formattedExpression',
  'formula',
  'having',
  'sqlExpression',
  'value', // card columns[].value carries beast-mode expression with backtick refs
  'where'
]);

/**
 * Matches backticked column refs inside expression strings.
 *
 * The `g` flag makes `lastIndex` stateful — callers using `.exec()` in a
 * loop must run it to completion so it resets to 0, or use `.matchAll()`.
 * `.replace()` with this regex is safe (it resets `lastIndex` internally).
 */
export const BACKTICK_REF_RE = /`([^`]+)`/g;

/**
 * Whether the parent key signals "this object is an entry in a column-list" —
 * which is when bare `name`/`id` fields on a child object should be treated
 * as column references. Excludes parents like `additions` (Magic ETL
 * SplitColumnAction) where the child `name` is a NEW output column
 * declaration, not an input ref.
 */
export function isColumnListParent(parentKey) {
  if (parentKey === 'columns') return true;
  if (parentKey === 'fields') return true;
  if (parentKey === 'group' || parentKey === 'groups') return true;
  if (parentKey === 'schemaModification1' || parentKey === 'schemaModification2') return true;
  return false;
}

/**
 * Strip wrapping backticks from a column-name string. Leaves bare names and
 * non-strings unchanged.
 */
export function stripBackticks(s) {
  if (typeof s !== 'string') return s;
  if (s.length >= 2 && s.startsWith('`') && s.endsWith('`')) return s.slice(1, -1);
  return s;
}
