/**
 * Column rewriter — applies a `columnMap` (origin column name → target
 * column name) to card / dataset-view / dataflow definitions. Mirrors the
 * scanner in `columnReferences.js` field-for-field: the same set of fields
 * we read FROM, we write TO.
 *
 * Three rewrite shapes per the scanner:
 *   1. Backticked refs in expression strings — `` `Old` `` → `` `New` ``
 *   2. Plain string values at known column-bearing fields
 *   3. Object keys at known column-name-keyed paths
 *
 * Mappings with a null/undefined target are explicit "leave unmapped"
 * choices — we skip them. Empty/missing entries in the map are also
 * skipped (untouched columns).
 */

import {
  BACKTICK_REF_RE,
  COLUMN_KEYED_FIELDS,
  COLUMN_LIST_FIELDS,
  COLUMN_VALUE_FIELDS,
  EXPRESSION_FIELDS,
  isColumnListParent,
  stripBackticks
} from './columnFields';
import { isFusionView } from './columnReferences';

/**
 * Remove one or more OUTPUT columns from a template/SQL dataset view definition.
 * Backs the "drop" choice when repairing a view whose source column vanished:
 * instead of repointing the broken reference, the column is cut from the view
 * entirely. `columnsToDrop` are the view's OUTPUT column names (a selectItem's
 * `alias.name` / a ledger entry's `name`), not the source column names.
 *
 * Removes each dropped column from:
 *   - every UNION branch (`SET_OPERATION_LIST.selects[]`) at the SAME position,
 *     so the branches stay position-aligned (a UNION requires equal column
 *     counts across branches);
 *   - every plain projection's `selectItems` (matched by `alias.name`);
 *   - the output ledger `tables[].columns[]` (matched by `name`);
 *   - the `viewTemplate.fromItemInfo[*].columnInfo` palette (matched by key).
 * Both the compiled `select` tree and its `viewTemplate.select` mirror are
 * walked, so the two stay consistent.
 *
 * @param {Object} viewDefinition - The `/schema/indexed` view definition.
 * @param {string[]|Set<string>} columnsToDrop - Output column names to remove.
 * @returns {Object} new view definition (input is not mutated)
 */
export function dropDatasetViewColumns(viewDefinition, columnsToDrop) {
  const drop = columnsToDrop instanceof Set ? columnsToDrop : new Set(columnsToDrop || []);
  if (drop.size === 0) return viewDefinition;
  const next = deepClone(viewDefinition);
  // Pass 1: UNION branches, by position, so all branches stay aligned. Record
  // each branch's selectItems array so pass 2 doesn't also alias-filter it
  // (which would remove the same column twice and unbalance the UNION).
  const branchSelectItems = new WeakSet();
  walkSetOps(next, (setOp) => {
    for (const branch of setOp.selects) {
      if (Array.isArray(branch?.selectItems)) branchSelectItems.add(branch.selectItems);
    }
    const positions = collectDropPositions(setOp.selects, drop);
    if (positions.length > 0) spliceBranchPositions(setOp.selects, positions);
  });
  // Pass 2: plain projections (by alias), the output ledger (by name), and the
  // palette (by key), everywhere except the UNION-branch selectItems.
  walkDropColumns(next, drop, branchSelectItems);
  return next;
}

/**
 * Remove one or more OUTPUT columns from a native data fusion definition (the
 * `/api/query/v1/fusions/{id}` shape, NOT the compiled `/schema/indexed` shape).
 * A fusion declares its output columns in `columnList[]`, each entry carrying a
 * `name` (the output column) and a `fuseMapping` back to a source column, so a
 * drop is just filtering out the entries whose `name` matches. Join predicates
 * (`columnFuse[].predicates`) reference source columns, not outputs, so they are
 * left untouched.
 *
 * @param {Object} fusionDefinition - The native fusion definition.
 * @param {string[]|Set<string>} columnsToDrop - Output column names to remove.
 * @returns {Object} new fusion definition (input is not mutated)
 */
export function dropFusionColumns(fusionDefinition, columnsToDrop) {
  const drop = columnsToDrop instanceof Set ? columnsToDrop : new Set(columnsToDrop || []);
  if (drop.size === 0) return fusionDefinition;
  const next = deepClone(fusionDefinition);
  if (Array.isArray(next.columnList)) {
    next.columnList = next.columnList.filter(
      (col) => !(col && typeof col.name === 'string' && drop.has(stripBackticks(col.name)))
    );
  }
  return next;
}

/**
 * Find every alias that resolves to the origin dataset DIRECTLY within this
 * view. Includes the bare origin dataset id itself so direct
 * `\`<originId>\`.col` refs also count as origin-qualified.
 *
 * Only DIRECT aliases (where `fromItem.name === originId`) qualify. SUB_SELECT
 * aliases (e.g. `base` wrapping a UNION) do NOT. Refs through a SUB_SELECT
 * point at the subquery's OUTPUT column names, determined by the inner branches'
 * `alias.name` rather than by origin's column names. We don't rewrite inner
 * aliases, so we shouldn't rewrite the outer column refs that read from those
 * aliases either. (Type propagation through SUB_SELECTs is handled separately by
 * `propagateColumnInfoTypes`.)
 */
export function findOriginAliases(viewDefinition, originId) {
  const aliases = new Set();
  if (originId) aliases.add(originId);

  const visitFromItem = (fromItem) => {
    if (!fromItem || typeof fromItem !== 'object') return;
    const tableName = stripBackticks(fromItem.name);
    if (tableName === originId) {
      const aliasName = stripBackticks(fromItem?.alias?.name);
      if (aliasName) aliases.add(aliasName);
      aliases.add(tableName);
    }
  };

  const walk = (node) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node.fromItem) visitFromItem(node.fromItem);
    if (Array.isArray(node.joins)) {
      for (const j of node.joins) {
        if (j?.leftItem) visitFromItem(j.leftItem);
      }
    }
    for (const v of Object.values(node)) walk(v);
  };
  walk(viewDefinition);
  return aliases;
}

/**
 * Returns true if the columnMap has at least one effective rename
 * (key !== value && value != null). An empty or all-null map is a no-op.
 */
export function hasEffectiveMapping(columnMap) {
  if (!columnMap) return false;
  for (const [from, to] of Object.entries(columnMap)) {
    if (to != null && to !== from) return true;
  }
  return false;
}

/**
 * Remove every reference to the given columns from a card definition. Backs the
 * "drop column" migration choice, which is offered only when a column is
 * referenced solely by `badge_table` cards/drills — so deleting it from the
 * column-list fields (e.g. `subscriptions.main.columns`, sorts) and any
 * column-keyed maps (formats) cleanly drops it from the table.
 *
 * Mirrors the rename walker's field registry, but DELETES matches instead of
 * renaming: list entries whose column-bearing field names a dropped column are
 * filtered out, and dropped keys are deleted from column-keyed maps.
 * Expression/scalar fields are left alone (a badge_table card holds its columns
 * in list fields, not formulas).
 *
 * @param {Object} cardDefinition
 * @param {string[]|Set<string>} droppedColumns - Origin column names to remove.
 * @returns {Object} new card definition (input is not mutated)
 */
export function removeCardColumns(cardDefinition, droppedColumns) {
  const drop = droppedColumns instanceof Set ? droppedColumns : new Set(droppedColumns || []);
  if (drop.size === 0) return cardDefinition;
  const next = deepClone(cardDefinition);
  walkAndRemoveColumns(next, drop);
  return next;
}

/**
 * Rewrite the column refs in a Beast Mode (function) template. Walks the same
 * field registry as the card/dataflow rewriters, so it covers the template's
 * `expression` (backticked refs) and `columnPositions[].columnName`.
 *
 * @param {Object} beastModeTemplate
 * @param {Record<string, string|null>} columnMap
 * @returns {Object} new template (input is not mutated)
 */
export function rewriteBeastModeColumns(beastModeTemplate, columnMap) {
  const next = deepClone(beastModeTemplate);
  walkAndRewriteColumns(next, columnMap);
  return next;
}

/**
 * @param {Object} cardDefinition
 * @param {Record<string, string|null>} columnMap
 * @returns {Object} new card definition (input is not mutated)
 */
export function rewriteCardColumns(cardDefinition, columnMap, beastModeNumericByLegacyId = {}) {
  const next = deepClone(cardDefinition);
  // Cards are the only content type where a column can be remapped onto a
  // dataset Beast Mode (the migrate view gates that choice to card-only
  // columns), and a card references a Beast Mode differently PER CONTEXT:
  //   - projection / sort / group lists AND the summary number (`big_number`):
  //     by a `formulaId` key, reshaped from `column` (reshapeColumnRefToBeastMode);
  //   - filters and conditional-format conditions: by `column` holding the calc
  //     id, which is just a plain value swap (already correct, no reshape);
  //   - card-level formula expressions: by DOMO_BEAST_MODE(<numeric template id>)
  //     (rewriteExpressionString), with the ref dropped from `columnPositions` and
  //     added to `formulaDependencies` (finalizeBeastModeFormulaRefs).
  // `beastModeNumericByLegacyId` resolves a Beast Mode's legacyId (the map value)
  // to the numeric template id its formula refs use.
  const options = { beastModeNumericByLegacyId, reshapeBeastModeRefs: true };
  walkAndRewriteColumns(next, columnMap, null, options);
  finalizeBeastModeFormulaRefs(next, beastModeNumericByLegacyId);
  return next;
}

/**
 * @param {Object} dataflowDefinition
 * @param {Record<string, string|null>} columnMap
 * @returns {Object} new dataflow definition (input is not mutated)
 */
export function rewriteDataflowColumns(dataflowDefinition, columnMap) {
  const next = deepClone(dataflowDefinition);
  walkAndRewriteColumns(next, columnMap);
  return next;
}

/**
 * Conservative rewriter for dataset views.
 *
 * Dataset views carry an OUTPUT column ledger at `tables[].columns[].name`
 * (output declaration — must NOT be renamed) AND can join multiple input
 * datasets where the same column name might exist on more than one. To
 * avoid renaming column refs that point at OTHER inputs (e.g. the right
 * side of a join condition), the walker is scoped by ORIGIN ALIASES:
 *
 *   - We discover origin's table aliases by walking every `fromItem` /
 *     `joins[].leftItem` whose `name` (after backtick strip) matches the
 *     origin dataset id, and collecting their `alias.name`.
 *   - `columnName` is only rewritten when the parent expression's sibling
 *     `table.name` is one of those origin aliases (or the bare origin id).
 *   - Backticked expressions are split into qualified `\`tbl\`.\`col\``
 *     and unqualified `\`col\`` forms. Qualified refs are only rewritten
 *     when the table token matches an origin alias. Unqualified refs are
 *     rewritten unconditionally (default-table assumption).
 *   - `referencedColumnName` is rewritten directly (unambiguous input ref).
 *
 * If `targetColumnTypes` is supplied (a map of NEW column name → type, from
 * the target dataset's schema), a second pass propagates type changes:
 * declared `type` fields on column-info entries (in `tables[].columns[]` and
 * `viewTemplate.fromItemInfo[].columnInfo[<col>]`) are updated when the
 * column resolves to an origin-qualified remapped input. Without this,
 * Domo's view validator 400s on `column types do not match` whenever the
 * remap crosses a type boundary (LONG → STRING etc).
 *
 * @param {Object} viewDefinition
 * @param {Record<string, string|null>} columnMap
 * @param {string} originId - The origin dataset id (no backticks).
 * @param {Record<string, string>} [targetColumnTypes] - Map of NEW column name → target type.
 * @returns {Object} new view definition (input is not mutated)
 */
export function rewriteDatasetViewColumns(viewDefinition, columnMap, originId, targetColumnTypes = null) {
  // Fusion views store column refs in a different shape; the template walker
  // below can't see them, so delegate.
  if (isFusionView(viewDefinition)) {
    return rewriteFusionViewColumns(viewDefinition, columnMap, originId);
  }
  const next = deepClone(viewDefinition);
  const originAliases = findOriginAliases(next, originId);
  walkDatasetViewConservative(next, columnMap, originAliases);
  if (targetColumnTypes && hasEffectiveMapping(columnMap)) {
    propagateColumnTypes(next, columnMap, originAliases, targetColumnTypes);
    alignUnionBranchCasts(next, originAliases, targetColumnTypes);
    propagateColumnInfoTypes(next, columnMap, targetColumnTypes);
  }
  return next;
}

/**
 * Rewrite origin column refs in a fusion view (`views[].mapping`). Every leaf of
 * the form `{exprType: 'COLUMN', column, table}` whose `table` is the origin
 * dataset gets its `column` remapped per `columnMap`. Recurses the whole `views`
 * tree, so it covers simple passthrough mappings, computed/nested mapping exprs,
 * and `columnFuses[].on` join conditions uniformly. Only the source column ref is
 * changed; output column names (mapping keys, `tables[].columns[].name`) are the
 * view's own and stay put. The dataset-id repoint is handled separately by the
 * caller's JSON sweep.
 *
 * @param {Object} viewDefinition
 * @param {Record<string, string|null>} columnMap
 * @param {string} originId - The origin dataset id (no backticks).
 * @returns {Object} new view definition (input is not mutated)
 */
export function rewriteFusionViewColumns(viewDefinition, columnMap, originId) {
  const next = deepClone(viewDefinition);
  const origin = stripBackticks(originId);
  const rewriteLeaves = (node) => {
    if (Array.isArray(node)) {
      for (const item of node) rewriteLeaves(item);
      return;
    }
    if (!node || typeof node !== 'object') return;
    if (node.exprType === 'COLUMN' && stripBackticks(node.table) === origin && typeof node.column === 'string') {
      const to = columnMap[node.column];
      if (to != null && to !== node.column) node.column = to;
      return;
    }
    for (const v of Object.values(node)) rewriteLeaves(v);
  };
  rewriteLeaves(next.views);
  return next;
}

function alignOneUnion(setOp, originAliases, targetColumnTypes) {
  let originBranchIdx = -1;
  for (let i = 0; i < setOp.selects.length; i++) {
    const fromItem = setOp.selects[i]?.fromItem;
    const fromName = stripBackticks(fromItem?.name);
    if (fromName && originAliases.has(fromName)) {
      originBranchIdx = i;
      break;
    }
  }
  if (originBranchIdx === -1) return;

  const originSelects = setOp.selects[originBranchIdx]?.selectItems || [];
  for (let pos = 0; pos < originSelects.length; pos++) {
    const newType = newTypeForOriginPositionExpression(originSelects[pos]?.expression, originAliases, targetColumnTypes);
    if (!newType) continue;

    for (let bi = 0; bi < setOp.selects.length; bi++) {
      if (bi === originBranchIdx) continue;
      const otherExpr = setOp.selects[bi]?.selectItems?.[pos]?.expression;
      if (!otherExpr) continue;
      updateCastDataType(otherExpr, newType);
    }
  }
}

/**
 * UNION branches must align by type at every column position. Domo inserts
 * explicit CAST/TRY_CAST nodes in non-origin branches when the original
 * column types differed (e.g. CAST C's STRING column to LONG to match
 * origin's LONG column). When the user remaps origin to a column with a
 * different type, those alignment CASTs in the OTHER branches still target
 * the OLD type and the UNION fails type validation.
 *
 * This pass walks SET_OPERATION_LIST nodes, finds the branch that sources
 * from origin, and for each remapped column position updates CAST/TRY_CAST
 * `type.dataType` in non-origin branches to match the new origin type.
 */
function alignUnionBranchCasts(node, originAliases, targetColumnTypes) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) alignUnionBranchCasts(item, originAliases, targetColumnTypes);
    return;
  }
  if (node['@type'] === 'SET_OPERATION_LIST' && Array.isArray(node.selects)) {
    alignOneUnion(node, originAliases, targetColumnTypes);
  }
  for (const v of Object.values(node)) {
    alignUnionBranchCasts(v, originAliases, targetColumnTypes);
  }
}

/**
 * For one UNION (`SET_OPERATION_LIST`), find the positions to drop: any branch
 * whose selectItem at position `i` has an `alias.name` in `drop` marks `i`.
 * Returned descending so the caller can splice without shifting later indices.
 */
function collectDropPositions(selects, drop) {
  const positions = new Set();
  for (const branch of selects) {
    const items = branch?.selectItems;
    if (!Array.isArray(items)) continue;
    for (let i = 0; i < items.length; i++) {
      const alias = stripBackticks(items[i]?.alias?.name);
      if (alias && drop.has(alias)) positions.add(i);
    }
  }
  return [...positions].sort((a, b) => b - a);
}

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Finish converting card-level formula column refs that were remapped onto a
 * dataset Beast Mode. `rewriteExpressionString` already turned the backticked
 * `\`col\`` ref in the formula into a DOMO_BEAST_MODE(<numericId>) call; this
 * walks every card formula and (a) drops the now-stale `columnPositions` entry
 * (its `columnName` was rewritten to the Beast Mode's legacyId, which is no
 * longer a column ref) and (b) records the nested Beast Mode's numeric template
 * id in `formulaDependencies` — the two places Domo tracks a formula's Beast
 * Mode nesting alongside the expression. A no-op when nothing maps to a Beast
 * Mode.
 *
 * @param {Object} cardDefinition - Full card response (formulas at `.definition.formulas`).
 * @param {Record<string, string>} beastModeNumericByLegacyId - legacyId -> numeric template id.
 */
function finalizeBeastModeFormulaRefs(cardDefinition, beastModeNumericByLegacyId) {
  if (!beastModeNumericByLegacyId || Object.keys(beastModeNumericByLegacyId).length === 0) return;
  const formulas = cardDefinition?.definition?.formulas;
  if (!Array.isArray(formulas)) return;
  for (const formula of formulas) {
    if (!formula || !Array.isArray(formula.columnPositions)) continue;
    const nestedNumericIds = new Set();
    formula.columnPositions = formula.columnPositions.filter((cp) => {
      const numericId = beastModeNumericByLegacyId[stripBackticks(cp?.columnName)];
      if (numericId) {
        nestedNumericIds.add(String(numericId));
        return false;
      }
      return true;
    });
    if (nestedNumericIds.size > 0) {
      const deps = new Set((formula.formulaDependencies || []).map((d) => String(d)));
      for (const id of nestedNumericIds) deps.add(id);
      formula.formulaDependencies = [...deps];
    }
  }
}

/**
 * Whether a value is a dataset Beast Mode's legacyId (`calculation_<uuid>`) —
 * the id form a card references a Beast Mode by. Used to detect a column ->
 * Beast Mode remap so the card entry can be reshaped from a `column` ref to a
 * `formulaId` ref. The strict UUID tail avoids misfiring on a physical column
 * that merely happens to start with `calculation_`.
 */
function isBeastModeLegacyId(value) {
  return (
    typeof value === 'string' &&
    /^calculation_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

function isSimpleSqlIdentifier(name) {
  return typeof name === 'string' && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

/**
 * If `expr` is a COLUMN ref to an origin-aliased table whose new (post-rewrite)
 * column name has a known target type, return that type. Otherwise null.
 */
function newTypeForOriginPositionExpression(expr, originAliases, targetColumnTypes) {
  if (!expr || typeof expr !== 'object') return null;
  if (expr['@type'] !== 'COLUMN') return null;
  const tableName = stripBackticks(expr?.table?.name);
  if (!tableName || !originAliases.has(tableName)) return null;
  const colName = stripBackticks(expr.columnName);
  if (!colName) return null;
  return targetColumnTypes[colName] || null;
}

/**
 * Match a SIMPLE column ref. Returns the bare column name when the
 * expression is exactly `\`alias\`.\`col\`` (alias must be in
 * `originAliases`) or `\`col\`` (unqualified; assumed to be the default
 * origin table). Returns null for anything more complex.
 */
function parseSimpleOriginColumnRef(expr, originAliases) {
  let m = /^`([^`]+)`\.`([^`]+)`$/.exec(expr);
  if (m) {
    return originAliases.has(m[1]) ? m[2] : null;
  }
  m = /^`([^`]+)`$/.exec(expr);
  if (m) return m[1];
  return null;
}

/**
 * Update `viewTemplate.fromItemInfo[<table>].columnInfo[<key>].type` for any
 * key that's an origin column being remapped. The columnInfo entry's
 * formattedExpression typically reads `\`<subSelectAlias>\`.\`<key>\`` —
 * which references the SUB_SELECT's output (named after an inner-branch
 * alias). When the key matches an origin column name, the SUB_SELECT's
 * output for that key is sourced from origin's column at that position; if
 * origin's column was remapped to a different type on target, the output
 * type changes too.
 *
 * This is a passthrough heuristic — it only updates types for entries whose
 * key is in `columnMap`. Computed/aliased columns whose keys don't match any
 * origin column name are left alone.
 */
function propagateColumnInfoTypes(viewDefinition, columnMap, targetColumnTypes) {
  const fromItemInfo = viewDefinition?.viewTemplate?.fromItemInfo;
  if (!fromItemInfo || typeof fromItemInfo !== 'object') return;
  for (const tableInfo of Object.values(fromItemInfo)) {
    const colInfo = tableInfo?.columnInfo;
    if (!colInfo || typeof colInfo !== 'object') continue;
    for (const [key, entry] of Object.entries(colInfo)) {
      if (!entry || typeof entry !== 'object') continue;
      const newName = columnMap[key];
      if (newName == null || newName === key) continue;
      const newType = targetColumnTypes[newName];
      if (newType && typeof entry.type === 'string') {
        entry.type = newType;
      }
    }
  }
}

/**
 * Walk the (already column-rewritten) view and update declared `type` fields
 * to match the target schema for any column declaration that resolves to a
 * remapped input column.
 *
 * Two shapes are recognized:
 *   1. Entries with `formattedExpression` + `type` (e.g.
 *      `viewTemplate.fromItemInfo[<table>].columnInfo[<col>]`). The
 *      formattedExpression is parsed for a SIMPLE column ref of the form
 *      `\`alias\`.\`col\`` or `\`col\``; if origin-qualified and the column
 *      is in `targetColumnTypes`, the `type` is updated. Complex expressions
 *      (CASE WHEN, CONCAT, etc.) are skipped — their output type can't be
 *      inferred from a single column ref.
 *   2. Entries with `name` + `type` + `referenceDataSourceId` but no
 *      `formattedExpression` (i.e. `tables[].columns[]` passthroughs). If
 *      `name` is a key in `columnMap` (passthrough of a remapped origin
 *      column), the `type` is updated to match the new column's type.
 */
function propagateColumnTypes(node, columnMap, originAliases, targetColumnTypes) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) propagateColumnTypes(item, columnMap, originAliases, targetColumnTypes);
    return;
  }
  if (typeof node !== 'object') return;

  if (typeof node.type === 'string' && typeof node.formattedExpression === 'string') {
    const refColName = parseSimpleOriginColumnRef(node.formattedExpression, originAliases);
    if (refColName && targetColumnTypes[refColName]) {
      node.type = targetColumnTypes[refColName];
    }
  } else if (
    typeof node.type === 'string' &&
    typeof node.name === 'string' &&
    typeof node.referenceDataSourceId === 'string'
  ) {
    const oldName = node.name;
    const newName = columnMap[oldName];
    if (newName != null && newName !== oldName && targetColumnTypes[newName]) {
      node.type = targetColumnTypes[newName];
    }
  }

  for (const v of Object.values(node)) {
    propagateColumnTypes(v, columnMap, originAliases, targetColumnTypes);
  }
}

/**
 * Reshape a card column reference in place when a physical `column` ref is
 * remapped onto a dataset Beast Mode. A card names a physical column at the
 * `column` key but a dataset Beast Mode at the `formulaId` key; a plain value
 * swap would leave the calc id sitting at `column`, which Domo rejects on save
 * ("column(s) missing from the datasource schema", since it looks for a physical
 * column literally named `calculation_<uuid>`). So delete `column` and write the
 * calc id to `formulaId`, leaving every sibling field (`mapping`, `alias`,
 * `order`, `aggregation`) untouched.
 *
 * Gated on `options.reshapeBeastModeRefs` (card rewriter only) and the `column`
 * field specifically — other column-bearing fields (`columnName`, etc.) belong
 * to dataflow/view shapes that never receive a Beast Mode target. Returns true
 * when it reshaped the entry (so the caller skips the plain assignment).
 *
 * @param {Object} entry - The object owning the column-bearing field.
 * @param {string} fieldName - The field being rewritten.
 * @param {string} originalValue - The pre-rewrite value.
 * @param {string} rewrittenValue - The post-rewrite value.
 * @param {{reshapeBeastModeRefs?: boolean}} options
 * @returns {boolean}
 */
function reshapeColumnRefToBeastMode(entry, fieldName, originalValue, rewrittenValue, options) {
  if (!options?.reshapeBeastModeRefs || fieldName !== 'column') return false;
  if (!isBeastModeLegacyId(rewrittenValue) || isBeastModeLegacyId(originalValue)) return false;
  delete entry.column;
  entry.formulaId = rewrittenValue;
  return true;
}

/**
 * Apply the mapping to a single column-name string. Null target → unchanged.
 *
 * Handles two input forms seen in real Domo payloads:
 *   1. Bare:        "bad_column_match"
 *   2. Backticked:  "`bad_column_match`"  (card formulas[].columnPositions[].columnName)
 *
 * Output form preservation rules:
 *   - If input was backticked → output backticked.
 *   - If `options.forceQuoteSpecialChars` is set AND the new name isn't a
 *     simple identifier (`/^[a-zA-Z_][a-zA-Z0-9_]*$/`) → output backticked.
 *     Used by SQL-context fields in dataset views (`columnName`), where a
 *     bare value containing spaces parses as multiple identifiers and breaks
 *     downstream alias resolution.
 *   - Otherwise → output bare.
 */
function rewriteColumnName(name, columnMap, options = {}) {
  if (typeof name !== 'string') return name;
  const wasBackticked = name.length >= 2 && name.startsWith('`') && name.endsWith('`');
  const bare = wasBackticked ? name.slice(1, -1) : name;
  const next = columnMap[bare];
  if (next == null || next === bare) return name;
  const needsQuoting = options.forceQuoteSpecialChars && !isSimpleSqlIdentifier(next);
  if (wasBackticked || needsQuoting) {
    return `\`${next}\``;
  }
  return next;
}

/**
 * Rewrite backticked column refs inside an expression string.
 *   `` `Old Name` `` → `` `New Name` ``
 * Only applies to entries in `columnMap` with a truthy mapped value.
 *
 * When `beastModeNumericByLegacyId` is supplied (card rewriter) and a column
 * maps onto a dataset Beast Mode, the ref becomes a DOMO_BEAST_MODE(<numeric
 * template id>) call instead of a backticked name — a formula references a Beast
 * Mode that way, not by `\`calculation_<uuid>\``. If the numeric id is unknown,
 * the original ref is left untouched rather than writing a broken token.
 */
function rewriteExpressionString(expr, columnMap, beastModeNumericByLegacyId = null) {
  if (typeof expr !== 'string') return expr;
  return expr.replace(BACKTICK_REF_RE, (match, colName) => {
    const next = columnMap[colName];
    if (next == null || next === colName) return match;
    if (beastModeNumericByLegacyId && isBeastModeLegacyId(next)) {
      const numericId = beastModeNumericByLegacyId[next];
      return numericId ? `DOMO_BEAST_MODE(${numericId})` : match;
    }
    return `\`${next}\``;
  });
}

/**
 * Rewrite backticked refs in an expression string, but only those qualified
 * with an origin alias OR unqualified. Skips refs qualified with non-origin
 * tables (e.g. join inputs that share a column name).
 *
 * Patterns recognized:
 *   1. `` `tableAlias`.`columnName` `` — qualified
 *   2. `` `columnName` `` — unqualified
 */
function rewriteScopedExpressionString(expr, columnMap, originAliases) {
  if (typeof expr !== 'string') return expr;
  // Process qualified refs first to consume them; remaining bare backticked
  // tokens fall through to the unqualified handler.
  return expr.replace(/`([^`]+)`(\.`([^`]+)`)?/g, (match, first, _dot, second) => {
    if (second != null) {
      // Qualified: `first`.`second`
      if (!originAliases.has(first)) return match;
      const next = columnMap[second];
      if (next == null || next === second) return match;
      return `\`${first}\`.\`${next}\``;
    }
    // Unqualified: `first`
    const next = columnMap[first];
    if (next == null || next === first) return match;
    return `\`${next}\``;
  });
}

/**
 * Splice the given positions (must be sorted descending) out of every branch's
 * `selectItems`, keeping all UNION branches the same length.
 */
function spliceBranchPositions(selects, descPositions) {
  for (const branch of selects) {
    if (!Array.isArray(branch?.selectItems)) continue;
    for (const pos of descPositions) {
      if (pos < branch.selectItems.length) branch.selectItems.splice(pos, 1);
    }
  }
}

/**
 * Update the dataType on a top-level CAST / TRY_CAST node. We only touch the
 * outer node; wrapped CASTs inside CASE/IFNULL/etc. are left alone (their
 * presence implies more complex logic the user may need to review manually).
 */
function updateCastDataType(node, newDataType) {
  if (!node || typeof node !== 'object') return;
  if (node['@type'] !== 'CAST' && node['@type'] !== 'TRY_CAST') return;
  if (node.type && typeof node.type === 'object' && typeof node.type.dataType === 'string') {
    node.type.dataType = newDataType;
  }
}

/**
 * Recursive in-place removal of dropped-column references. Mirrors
 * `walkAndRewriteColumns`' field registry: filters column-list entries whose
 * column-bearing field names a dropped column, and deletes dropped keys from
 * column-keyed maps. The caller deep-clones once at the entry point.
 */
function walkAndRemoveColumns(node, drop) {
  if (node == null || typeof node !== 'object') return;

  if (Array.isArray(node)) {
    for (const item of node) walkAndRemoveColumns(item, drop);
    return;
  }

  for (const [key, value] of Object.entries(node)) {
    // 1. Column-keyed objects — delete dropped keys, recurse into the rest.
    if (COLUMN_KEYED_FIELDS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      for (const k of Object.keys(value)) {
        if (drop.has(stripBackticks(k))) delete value[k];
        else walkAndRemoveColumns(value[k], drop);
      }
      continue;
    }

    // 2. Column-list fields — drop entries that reference a dropped column.
    if (COLUMN_LIST_FIELDS.has(key) && Array.isArray(value)) {
      node[key] = value.filter((item) => {
        if (typeof item === 'string') return !drop.has(stripBackticks(item));
        if (item && typeof item === 'object') {
          for (const fieldName of ['column', 'columnName', 'inStreamName', 'name', 'field', 'id']) {
            if (typeof item[fieldName] === 'string') return !drop.has(stripBackticks(item[fieldName]));
          }
        }
        return true;
      });
      for (const item of node[key]) walkAndRemoveColumns(item, drop);
      continue;
    }

    walkAndRemoveColumns(value, drop);
  }
}

/**
 * Recursive in-place rewriter. Mutates `node` so the caller can deep-clone
 * once at the entry point.
 *
 * `options.reshapeBeastModeRefs` (card rewriter only): when a `column` ref is
 * remapped onto a dataset Beast Mode, rewrite the ENTRY so the calc id sits at
 * the `formulaId` key instead of `column` (see `reshapeColumnRefToBeastMode`).
 */
function walkAndRewriteColumns(node, columnMap, parentKey = null, options = {}) {
  if (node == null) return;

  if (Array.isArray(node)) {
    for (const item of node) walkAndRewriteColumns(item, columnMap, parentKey, options);
    return;
  }

  if (typeof node !== 'object') return;

  // Magic ETL structured Field node: { type: 'Field', name: '<col>', table }
  // (see columnFields.js header). The column sits at `name` under `expression`,
  // which the bare-`name` gate in the value-field branch skips, so rewrite it
  // explicitly here. The subsequent key loop's `name` handling is gated out
  // (parent isn't a column-list), so no double rewrite occurs.
  if (node.type === 'Field' && typeof node.name === 'string') {
    node.name = rewriteColumnName(node.name, columnMap);
  }

  for (const [key, value] of Object.entries(node)) {
    // 1. Column-keyed objects — rename keys.
    if (COLUMN_KEYED_FIELDS.has(key) && value && typeof value === 'object' && !Array.isArray(value)) {
      const renamed = {};
      for (const [k, v] of Object.entries(value)) {
        const nextKey = rewriteColumnName(k, columnMap);
        // If two source columns map to the same target, last write wins —
        // the user is responsible for avoiding many-to-one.
        renamed[nextKey] = v;
      }
      // Recurse into values BEFORE assigning, since rewriteColumnName above
      // didn't recurse — values may carry expression strings.
      for (const v of Object.values(renamed)) walkAndRewriteColumns(v, columnMap, key, options);
      node[key] = renamed;
      continue;
    }

    // 2. Column-list fields.
    if (COLUMN_LIST_FIELDS.has(key) && Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        if (typeof item === 'string') {
          value[i] = rewriteColumnName(item, columnMap);
        } else if (item && typeof item === 'object') {
          // Pick the first column-bearing field present on the item.
          for (const fieldName of ['column', 'columnName', 'inStreamName', 'name', 'field', 'id']) {
            if (typeof item[fieldName] === 'string') {
              const rewritten = rewriteColumnName(item[fieldName], columnMap);
              if (!reshapeColumnRefToBeastMode(item, fieldName, item[fieldName], rewritten, options)) {
                item[fieldName] = rewritten;
              }
              break;
            }
          }
          walkAndRewriteColumns(item, columnMap, key, options);
        }
      }
      continue;
    }

    // 3. Plain column-value fields.
    if (COLUMN_VALUE_FIELDS.has(key) && typeof value === 'string') {
      // `name` and `id` are over-broad on their own — only treat as column
      // refs when nested under a known column-list parent.
      if ((key === 'name' || key === 'id') && !isColumnListParent(parentKey)) {
        continue;
      }
      // No Beast Mode reshape here: a card's `column` value field is a filter
      // (`subscriptions.main.filters[].column`), and a filter references a Beast
      // Mode by the SAME `column` key (holding the calc id), not `formulaId`. So
      // a plain value swap is exactly right; reshaping would break the filter.
      // (The formulaId reshape applies only to list entries — case 2 below.)
      node[key] = rewriteColumnName(value, columnMap);
      continue;
    }

    // 4. Expression fields — backticked refs inside. Card-level formulas convert
    // a column -> Beast Mode ref to DOMO_BEAST_MODE(<id>); other content types
    // pass no numeric map, so this stays a plain backtick rename for them.
    if (EXPRESSION_FIELDS.has(key) && typeof value === 'string') {
      const bmNumeric = options.reshapeBeastModeRefs ? options.beastModeNumericByLegacyId : null;
      node[key] = rewriteExpressionString(value, columnMap, bmNumeric);
      continue;
    }

    walkAndRewriteColumns(value, columnMap, key, options);
  }
}

function walkDatasetViewConservative(node, columnMap, originAliases) {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) walkDatasetViewConservative(item, columnMap, originAliases);
    return;
  }
  if (typeof node !== 'object') return;

  // A COLUMN expression has both a `table` ref and a `columnName`. We need
  // to know whether this expression's `table.name` is an origin alias to
  // decide whether to rewrite its `columnName`. Pre-resolve here so the
  // string-handler below can see it without rewalking siblings.
  const siblingTableName = stripBackticks(node?.table?.name);
  const isOriginQualified = typeof siblingTableName === 'string' && originAliases.has(siblingTableName);

  for (const [key, value] of Object.entries(node)) {
    if (typeof value === 'string') {
      if (key === 'columnName') {
        // Only rewrite if the sibling `table.name` is an origin alias.
        // Otherwise this column ref points at a different (non-origin)
        // table — likely a joined input whose column name happens to
        // match. Rewriting it would corrupt the join condition.
        if (isOriginQualified) {
          node[key] = rewriteColumnName(value, columnMap, { forceQuoteSpecialChars: true });
        }
      } else if (key === 'referencedColumnName') {
        node[key] = rewriteColumnName(value, columnMap);
      } else if (value.indexOf('`') !== -1) {
        node[key] = rewriteScopedExpressionString(value, columnMap, originAliases);
      }
      continue;
    }
    walkDatasetViewConservative(value, columnMap, originAliases);
  }
}

/**
 * Second drop pass: remove dropped OUTPUT columns everywhere other than the
 * UNION-branch selectItems already handled by position. Filters plain
 * projections by `alias.name`, the output ledger (`tables[].columns[]`) by
 * `name`, and deletes matching `viewTemplate.fromItemInfo[*].columnInfo` keys.
 * `branchSelectItems` holds the UNION-branch selectItems arrays (by reference)
 * so they are skipped here.
 */
function walkDropColumns(node, drop, branchSelectItems) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkDropColumns(item, drop, branchSelectItems);
    return;
  }
  if (Array.isArray(node.selectItems) && !branchSelectItems.has(node.selectItems)) {
    node.selectItems = node.selectItems.filter((item) => {
      const alias = stripBackticks(item?.alias?.name);
      return !(alias && drop.has(alias));
    });
  }
  if (Array.isArray(node.columns)) {
    node.columns = node.columns.filter(
      (col) => !(col && typeof col === 'object' && typeof col.name === 'string' && drop.has(stripBackticks(col.name)))
    );
  }
  if (node.fromItemInfo && typeof node.fromItemInfo === 'object' && !Array.isArray(node.fromItemInfo)) {
    for (const section of Object.values(node.fromItemInfo)) {
      const colInfo = section?.columnInfo;
      if (!colInfo || typeof colInfo !== 'object') continue;
      for (const key of Object.keys(colInfo)) {
        if (drop.has(stripBackticks(key))) delete colInfo[key];
      }
    }
  }
  for (const value of Object.values(node)) walkDropColumns(value, drop, branchSelectItems);
}

/**
 * Visit every `SET_OPERATION_LIST` (UNION/INTERSECT/EXCEPT) node in the view,
 * invoking `onSetOp` with each so the caller can align its branches.
 */
function walkSetOps(node, onSetOp) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const item of node) walkSetOps(item, onSetOp);
    return;
  }
  if (node['@type'] === 'SET_OPERATION_LIST' && Array.isArray(node.selects)) onSetOp(node);
  for (const value of Object.values(node)) walkSetOps(value, onSetOp);
}
