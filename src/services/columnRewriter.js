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
export function rewriteCardColumns(cardDefinition, columnMap) {
  const next = deepClone(cardDefinition);
  walkAndRewriteColumns(next, columnMap);
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

function deepClone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

/**
 * Find every alias that resolves to the origin dataset DIRECTLY within this
 * view. Includes the bare origin dataset id itself so direct
 * `\`<originId>\`.col` refs also count as origin-qualified.
 *
 * Only DIRECT aliases (where `fromItem.name === originId`) qualify. SUB_SELECT
 * aliases (e.g. `base` wrapping a UNION) do NOT. Refs through a SUB_SELECT
 * point at the subquery's OUTPUT column names — which are determined by the
 * inner branches' `alias.name`, not by origin's column names. We don't
 * rewrite inner aliases, so we shouldn't rewrite the outer column refs that
 * read from those aliases either. (Type propagation through SUB_SELECTs is
 * handled separately by `propagateColumnInfoTypes`.)
 */
function findOriginAliases(viewDefinition, originId) {
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
 */
function rewriteExpressionString(expr, columnMap) {
  if (typeof expr !== 'string') return expr;
  return expr.replace(BACKTICK_REF_RE, (match, colName) => {
    const next = columnMap[colName];
    if (next == null || next === colName) return match;
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
 * Update the dataType on a top-level CAST / TRY_CAST node. We only touch the
 * outer node — wrapped CASTs inside CASE/IFNULL/etc. are left alone (their
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
 */
function walkAndRewriteColumns(node, columnMap, parentKey = null) {
  if (node == null) return;

  if (Array.isArray(node)) {
    for (const item of node) walkAndRewriteColumns(item, columnMap, parentKey);
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
      for (const v of Object.values(renamed)) walkAndRewriteColumns(v, columnMap, key);
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
              item[fieldName] = rewriteColumnName(item[fieldName], columnMap);
              break;
            }
          }
          walkAndRewriteColumns(item, columnMap, key);
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
      node[key] = rewriteColumnName(value, columnMap);
      continue;
    }

    // 4. Expression fields — backticked refs inside.
    if (EXPRESSION_FIELDS.has(key) && typeof value === 'string') {
      node[key] = rewriteExpressionString(value, columnMap);
      continue;
    }

    walkAndRewriteColumns(value, columnMap, key);
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
