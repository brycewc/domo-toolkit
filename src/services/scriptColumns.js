/**
 * Magic ETL script-tile column detector.
 *
 * Python Script (`PythonEngineAction`) and R Script (`REngineAction`) tiles run
 * freeform code whose body lives in `statements[]` (an array of source lines).
 * Column names appear inside that code as ordinary identifiers or quoted strings
 * (e.g. `df['Old Name']`), NOT as the backticked refs Domo uses in structured
 * fields and formulas. There is no safe, general way to rename an identifier
 * inside arbitrary code: a local variable, a substring, or a comment could share
 * the column's name and get clobbered. So, like an SQL `SELECT *`, script tiles
 * are never auto-rewritten — they're surfaced for manual review when they
 * reference a column the migration is remapping.
 *
 * This module only DETECTS those references. The structured column rewriter
 * (`columnRewriter.js`) still remaps the tile's declared input/output schema
 * fields (which keep the tile wired into the flow); only the script body is
 * left for the user to update by hand.
 */

/** Magic ETL action types whose body is freeform script, not structured fields. */
export const SCRIPT_ACTION_TYPES = new Set(['PythonEngineAction', 'REngineAction']);

/**
 * Find the Magic ETL script tiles whose code references any of the given column
 * names. Used two ways: at scan time with the dataflow's used columns (to warn
 * before migrating), and at rewrite time with the remapped origin columns (to
 * flag the dataflow for manual review). A name matches only on a whole-token
 * boundary, so `id` doesn't match inside `idx` or `valid`.
 *
 * @param {Object} definition - Hydrated Magic ETL dataflow definition.
 * @param {Iterable<string>} columnNames - Column names to look for.
 * @returns {Array<{actionId: any, columns: string[], type: string}>}
 */
export function findScriptColumnConflicts(definition, columnNames) {
  const names = (columnNames instanceof Set ? [...columnNames] : Array.from(columnNames || [])).filter(
    (n) => typeof n === 'string' && n.length > 0
  );
  if (names.length === 0) return [];
  const actions = Array.isArray(definition?.actions) ? definition.actions : [];
  const conflicts = [];
  for (const action of actions) {
    if (!action || !SCRIPT_ACTION_TYPES.has(action.type)) continue;
    const statements = Array.isArray(action.statements) ? action.statements : [];
    const text = statements.filter((s) => typeof s === 'string').join('\n');
    if (!text) continue;
    const matched = names.filter((name) => statementMentionsColumn(text, name));
    if (matched.length > 0) conflicts.push({ actionId: action.id ?? null, columns: matched, type: action.type });
  }
  return conflicts;
}

/**
 * Whether `colName` appears in `text` as a whole token — bounded on both sides
 * by a non-identifier character (or the string edge). Case-sensitive, since Domo
 * column names are. Uses `indexOf` (not a RegExp) so names with regex-special
 * characters match literally.
 */
function statementMentionsColumn(text, colName) {
  const isWordChar = (ch) => /[A-Za-z0-9_]/.test(ch);
  let from = 0;
  for (;;) {
    const idx = text.indexOf(colName, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : text[idx - 1];
    const after = idx + colName.length >= text.length ? '' : text[idx + colName.length];
    if ((before === '' || !isWordChar(before)) && (after === '' || !isWordChar(after))) return true;
    from = idx + 1;
  }
}
