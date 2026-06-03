/**
 * SQL dataflow column scanner + rewriter (Redshift / MySQL).
 *
 * Magic ETL dataflows keep column references in structured tile fields, read
 * and rewritten via the `columnFields.js` registry. SQL dataflows instead bury
 * their column references inside raw SQL strings (`GenerateTableAction.
 * selectStatement`, `PublishToVault.query`, `SqlAction.statements[]`), so the
 * structured walker is blind to them. This module fills that gap.
 *
 * The two engines are different dialects:
 *   - Redshift quotes identifiers with double quotes:  `"Owner_User_ID"`
 *   - MySQL   quotes identifiers with backticks:        `` `Name` ``
 * Both allow BARE identifiers when the name has no spaces/special chars
 * (`a.ID`, `FROM datasets a`), and a single MySQL statement freely mixes the
 * two forms. The tokenizer therefore treats an identifier as either a
 * dialect-quoted token or a bare word, and normalizes to the unquoted name.
 *
 * Scoping to the ORIGIN dataset is the whole game. A `LoadFromVault` action
 * maps the origin `dataSourceId` to a SQL table alias (`targetTableName`, e.g.
 * `datasets`). Inside a statement, `FROM \`datasets\` a` then binds the short
 * alias `a` to origin. We only touch column refs that resolve to origin (via
 * an origin-bound alias, the origin table name directly, or - in a statement
 * whose sole source is origin - unqualified refs). Refs that point at other
 * inputs or at intermediate tables are left alone.
 *
 * AS-preservation keeps the rewrite LOCAL. `SELECT a.\`Name\`` produces a
 * downstream output column literally named `Name`; renaming the source to
 * `a.\`Title\`` would silently rename that output. Rewriting it to
 * `a.\`Title\` AS \`Name\`` preserves the output contract, so only the
 * statements that read directly from origin need changing, never the whole
 * lineage. Anything we cannot rewrite safely (origin `SELECT *`, a subquery
 * over origin, an unaliased expression we would rename) is reported as
 * needing manual review instead of being corrupted.
 */

/**
 * Extract the set of origin column names referenced by an SQL dataflow's
 * statements. Over-reporting is acceptable (the user can leave a column
 * unmapped); the bigger risk is a false negative, which is exactly the bug
 * this fixes. `unsafe` is true when at least one statement references origin
 * in a shape we cannot fully analyze (origin `SELECT *`, subquery over origin).
 *
 * @param {Object} definition - Hydrated dataflow definition.
 * @param {string} originId - The migration origin dataset id.
 * @returns {{ refs: Set<string>, unsafe: boolean }}
 */
export function extractDataflowSqlColumnRefs(definition, originId) {
  const engine = getDataflowEngine(definition);
  const dialect = DIALECTS[engine];
  const refs = new Set();
  if (!dialect) return { refs, unsafe: engine === 'unknown' };
  const originAliases = collectOriginAliases(definition, originId);
  if (originAliases.size === 0) return { refs, unsafe: false };
  let unsafe = false;
  eachSqlField(definition, (sql) => {
    const info = findStatementRefs(sql, originAliases, dialect);
    for (const ref of info.colRefs) refs.add(ref.name);
    if (info.unsafe) unsafe = true;
  });
  return { refs, unsafe };
}

/**
 * Classify a dataflow definition's engine. Magic ETL keeps its structured
 * path; redshift/mysql route through this module; unknown non-Magic engines
 * are surfaced for manual review rather than rewritten.
 *
 * @param {Object} definition
 * @returns {'magic' | 'mysql' | 'redshift' | 'unknown'}
 */
export function getDataflowEngine(definition) {
  const type = typeof definition?.databaseType === 'string' ? definition.databaseType.toUpperCase() : '';
  if (type === 'MAGIC' || definition?.magic === true) return 'magic';
  if (type === 'MYSQL') return 'mysql';
  if (type === 'REDSHIFT') return 'redshift';
  return 'unknown';
}

/**
 * Rewrite mapped origin column names inside an SQL dataflow's statements,
 * scoped to the origin alias and preserving output names via `AS`. Returns a
 * new definition (input is not mutated), whether anything changed, and the
 * list of statements that need manual review (left verbatim).
 *
 * @param {Object} definition - Hydrated dataflow definition.
 * @param {Record<string, string|null>} columnMap - origin name -> target name.
 * @param {string} originId - The migration origin dataset id.
 * @returns {{ changed: boolean, definition: Object, unhandled: Array<{actionId: any, field: string, index?: number}> }}
 */
export function rewriteDataflowSqlColumns(definition, columnMap, originId) {
  const engine = getDataflowEngine(definition);
  const dialect = DIALECTS[engine];
  if (!dialect) return { changed: false, definition, unhandled: [] };
  const next = JSON.parse(JSON.stringify(definition));
  const originAliases = collectOriginAliases(next, originId);
  const unhandled = [];
  let changed = false;
  if (originAliases.size === 0) return { changed, definition: next, unhandled };
  eachSqlField(next, (sql, setValue, meta) => {
    const result = rewriteStatement(sql, columnMap, originAliases, dialect);
    if (result.unhandled) {
      unhandled.push(meta);
      return;
    }
    if (result.sql !== sql) {
      setValue(result.sql);
      changed = true;
    }
  });
  return { changed, definition: next, unhandled };
}

const DIALECTS = {
  mysql: { backslashEscape: true, hashComment: true, idQuote: '`' },
  redshift: { backslashEscape: false, hashComment: false, idQuote: '"' }
};

/** Reserved words that are never column names and delimit clauses. */
const KEYWORDS = new Set([
  'ALL', 'AND', 'AS', 'ASC', 'BETWEEN', 'BY', 'CASE', 'CAST', 'CREATE', 'CROSS', 'CURRENT', 'DELETE', 'DESC',
  'DISTINCT', 'ELSE', 'END', 'EXCEPT', 'EXISTS', 'FALSE', 'FIRST', 'FOLLOWING', 'FROM', 'FULL', 'GROUP', 'HAVING',
  'IF', 'ILIKE', 'IN', 'INDEX', 'INNER', 'INSERT', 'INTERSECT', 'INTO', 'IS', 'JOIN', 'LAST', 'LEFT', 'LIKE',
  'LIMIT', 'MINUS', 'NOT', 'NULL', 'NULLS', 'OFFSET', 'ON', 'OR', 'ORDER', 'OUTER', 'OVER', 'PARTITION',
  'PRECEDING', 'RANGE', 'RIGHT', 'ROW', 'ROWS', 'SELECT', 'SET', 'TABLE', 'THEN', 'TRUE', 'UNBOUNDED', 'UNION',
  'UPDATE', 'USING', 'VALUES', 'VIEW', 'WHEN', 'WHERE', 'WITH'
]);

/** Top-level set operators that separate a compound query into branches. */
const SET_OPERATORS = new Set(['EXCEPT', 'INTERSECT', 'MINUS', 'UNION']);

/**
 * Analyze a single query branch (a slice of significant tokens between set
 * operators) for origin column references and select-item structure.
 */
function analyzeBranch(sig, bs, be, originAliases) {
  const colRefs = [];
  const selectItems = [];
  const excluded = new Set();
  let unsafe = false;

  // Resolve sources: the table after each FROM / JOIN, plus its alias. Build
  // the set of qualifiers (short alias or table name) that resolve to origin.
  const sources = [];
  const originQualifiers = new Set(originAliases);
  let subquery = false;
  for (let i = bs; i < be; i++) {
    const t = sig[i];
    if (t.depth !== 0 || t.type !== 'id' || t.quoted) continue;
    const upper = t.value.toUpperCase();
    if (upper !== 'FROM' && upper !== 'JOIN') continue;
    const tableTok = sig[i + 1];
    if (tableTok && tableTok.type === 'punct' && tableTok.value === '(') {
      subquery = true;
      continue;
    }
    if (!tableTok || tableTok.type !== 'id') continue;
    excluded.add(i + 1);
    const tableName = tableTok.value.toLowerCase();
    sources.push(tableName);
    let k = i + 2;
    if (sig[k] && sig[k].type === 'id' && !sig[k].quoted && sig[k].value.toUpperCase() === 'AS') k++;
    let aliasTok = null;
    if (sig[k] && sig[k].type === 'id' && !(sig[k].type === 'id' && !sig[k].quoted && KEYWORDS.has(sig[k].value.toUpperCase()))) {
      aliasTok = sig[k];
      excluded.add(k);
    }
    if (originAliases.has(tableName)) {
      if (aliasTok) originQualifiers.add(aliasTok.value.toLowerCase());
    }
  }
  const touchesOrigin = sources.some((s) => originAliases.has(s));
  const singleSourceOrigin = sources.length === 1 && originAliases.has(sources[0]) && !subquery;

  // Locate the SELECT...FROM region (top level) for select-item analysis.
  let selectIdx = -1;
  let fromIdx = -1;
  for (let i = bs; i < be; i++) {
    const t = sig[i];
    if (t.depth !== 0 || t.type !== 'id' || t.quoted) continue;
    const upper = t.value.toUpperCase();
    if (upper === 'SELECT' && selectIdx === -1) selectIdx = i;
    else if (upper === 'FROM' && selectIdx !== -1 && fromIdx === -1) fromIdx = i;
  }

  // Pass 1: qualified refs `Q . C` (or `Q . *`) anywhere in the branch.
  for (let i = bs; i < be; i++) {
    const q = sig[i];
    const dot = sig[i + 1];
    const c = sig[i + 2];
    if (q.type !== 'id' || !dot || dot.type !== 'punct' || dot.value !== '.') continue;
    const isOriginQualified = originQualifiers.has(q.value.toLowerCase());
    if (c && c.type === 'punct' && c.value === '*') {
      if (isOriginQualified) unsafe = true;
      continue;
    }
    if (!c || c.type !== 'id') continue;
    excluded.add(i); // the qualifier token is not itself a column
    if (isOriginQualified) colRefs.push({ end: c.end, name: c.value, start: c.start });
  }

  // Pass 2: index-style `originTable ( col, ... )` (e.g. CREATE INDEX).
  for (let i = bs; i < be; i++) {
    const t = sig[i];
    if (t.type !== 'id' || !originAliases.has(t.value.toLowerCase())) continue;
    if (sig[i - 1] && sig[i - 1].type === 'punct' && sig[i - 1].value === '.') continue;
    const open = sig[i + 1];
    if (!open || open.type !== 'punct' || open.value !== '(') continue;
    const openDepth = open.depth;
    for (let j = i + 2; j < be; j++) {
      const inner = sig[j];
      if (inner.type === 'punct' && inner.value === ')' && inner.depth === openDepth) break;
      if (inner.type === 'id' && inner.depth === openDepth + 1 && !KEYWORDS.has(inner.value.toUpperCase())) {
        colRefs.push({ end: inner.end, name: inner.value, start: inner.start });
      }
    }
  }

  // Select-item structure (for AS-preservation) and origin SELECT * detection.
  if (selectIdx !== -1) {
    const end = fromIdx === -1 ? be : fromIdx;
    let itemStart = selectIdx + 1;
    for (let i = selectIdx + 1; i <= end; i++) {
      const atEnd = i === end;
      const t = sig[i];
      if (atEnd || (t.depth === 0 && t.type === 'punct' && t.value === ',')) {
        if (i > itemStart) selectItems.push(selectItemInfo(sig, itemStart, i));
        itemStart = i + 1;
        continue;
      }
      if (t.depth === 0 && t.type === 'punct' && t.value === '*' && touchesOrigin) unsafe = true;
    }
  }

  // Pass 3: unqualified refs, only when the sole source is origin.
  if (singleSourceOrigin) {
    for (let i = bs; i < be; i++) {
      const t = sig[i];
      if (t.type !== 'id' || excluded.has(i)) continue;
      if (!t.quoted && KEYWORDS.has(t.value.toUpperCase())) continue;
      const prev = sig[i - 1];
      const nextTok = sig[i + 1];
      if (prev && prev.type === 'punct' && prev.value === '.') continue; // the C of a Q.C
      if (nextTok && nextTok.type === 'punct' && nextTok.value === '.') continue; // a qualifier
      if (nextTok && nextTok.type === 'punct' && nextTok.value === '(') continue; // a function call
      if (prev && prev.type === 'id' && !prev.quoted && prev.value.toUpperCase() === 'AS') continue; // an output alias
      colRefs.push({ end: t.end, name: t.value, start: t.start });
    }
  }

  if (subquery && (touchesOrigin || colRefs.length > 0)) unsafe = true;

  return { colRefs, selectItems, unsafe };
}

/** Apply replacement/insertion edits to a string, right-to-left. */
function applyEdits(sql, edits) {
  const ordered = [...edits].sort((a, b) => b.start - a.start || b.end - a.end);
  let out = sql;
  for (const e of ordered) out = out.slice(0, e.start) + e.text + out.slice(e.end);
  return out;
}

/** Origin's SQL table aliases: every LoadFromVault.targetTableName for origin. */
function collectOriginAliases(definition, originId) {
  const set = new Set();
  const actions = Array.isArray(definition?.actions) ? definition.actions : [];
  for (const action of actions) {
    if (action && action.type === 'LoadFromVault' && action.dataSourceId === originId && typeof action.targetTableName === 'string') {
      set.add(action.targetTableName.toLowerCase());
    }
  }
  return set;
}

/**
 * Invoke `cb(value, setValue, meta)` for every SQL string on every action:
 * `selectStatement`, `query`, and each entry of `statements[]`.
 */
function eachSqlField(definition, cb) {
  const actions = Array.isArray(definition?.actions) ? definition.actions : [];
  for (const action of actions) {
    if (!action || typeof action !== 'object') continue;
    if (typeof action.selectStatement === 'string') {
      cb(action.selectStatement, (v) => {
 action.selectStatement = v;
}, { actionId: action.id, field: 'selectStatement' });
    }
    if (typeof action.query === 'string') {
      cb(action.query, (v) => {
 action.query = v;
}, { actionId: action.id, field: 'query' });
    }
    if (Array.isArray(action.statements)) {
      for (let i = 0; i < action.statements.length; i++) {
        if (typeof action.statements[i] !== 'string') continue;
        const index = i;
        cb(action.statements[index], (v) => {
 action.statements[index] = v;
}, { actionId: action.id, field: 'statements', index });
      }
    }
  }
}

/**
 * Structural analysis of one SQL statement: the origin column-ref token spans,
 * the top-level select items, and whether any origin reference is in a shape
 * we cannot safely rewrite.
 */
function findStatementRefs(sql, originAliases, dialect) {
  if (typeof sql !== 'string' || sql.length === 0) return { colRefs: [], selectItems: [], unsafe: false };
  const sig = significantTokens(tokenizeSql(sql, dialect));
  const branches = unionBranchRanges(sig);
  const colRefs = [];
  const selectItems = [];
  let unsafe = false;
  for (const [bs, be] of branches) {
    const branch = analyzeBranch(sig, bs, be, originAliases);
    for (const ref of branch.colRefs) colRefs.push(ref);
    for (const item of branch.selectItems) selectItems.push(item);
    if (branch.unsafe) unsafe = true;
  }
  // Origin referenced as a table inside a subquery (depth >= 1) is beyond the
  // top-level analysis above; flag for manual review rather than risk a partial
  // rewrite. A nested QUALIFIED ref (`originTable`.`col`) is still handled, so
  // only flag when the origin table token is not used as a qualifier.
  if (!unsafe) {
    for (let i = 0; i < sig.length; i++) {
      const t = sig[i];
      if (t.type !== 'id' || t.depth < 1 || !originAliases.has(t.value.toLowerCase())) continue;
      const nextTok = sig[i + 1];
      if (nextTok && nextTok.type === 'punct' && nextTok.value === '.') continue;
      unsafe = true;
      break;
    }
  }
  return { colRefs, selectItems, unsafe };
}

/** Quote an identifier in the dialect style, doubling any embedded quote char. */
function quoteIdent(name, dialect) {
  const q = dialect.idQuote;
  return q + String(name).split(q).join(q + q) + q;
}

/**
 * Rewrite mapped origin column refs in one statement. Returns the new SQL, or
 * `unhandled: true` (statement left verbatim) when it cannot be rewritten
 * safely.
 */
function rewriteStatement(sql, columnMap, originAliases, dialect) {
  const info = findStatementRefs(sql, originAliases, dialect);
  const isEffective = (name) => {
    const to = columnMap?.[name];
    return to != null && to !== name;
  };
  // `unsafe` only ever gets set when origin is involved (origin SELECT *, a
  // subquery over origin, etc.), so any unsafe statement is one we touch the
  // input of but cannot rewrite by hand-off: flag it for manual review.
  if (info.unsafe) return { sql, unhandled: true };

  const edits = [];
  for (const ref of info.colRefs) {
    if (isEffective(ref.name)) edits.push({ end: ref.end, start: ref.start, text: quoteIdent(columnMap[ref.name], dialect) });
  }

  for (const item of info.selectItems) {
    const rewrittenHere = info.colRefs.some((ref) => isEffective(ref.name) && ref.start >= item.start && ref.end <= item.exprEnd);
    if (!rewrittenHere || item.hasAlias) continue;
    if (item.simpleRefName != null && isEffective(item.simpleRefName)) {
      edits.push({ end: item.exprEnd, start: item.exprEnd, text: ` AS ${quoteIdent(item.simpleRefName, dialect)}` });
    } else if (item.simpleRefName == null) {
      // An unaliased expression whose output name we would silently change.
      return { sql, unhandled: true };
    }
  }

  if (edits.length === 0) return { sql, unhandled: false };
  return { sql: applyEdits(sql, edits), unhandled: false };
}

/**
 * Inspect one select item's token span. Returns whether it carries an explicit
 * `AS` alias, the bare column name when the item is a single column ref
 * (`Q.C` or `C`, the name we must preserve as the output), and the end offset
 * of the core expression (before any alias) for `AS` insertion.
 */
function selectItemInfo(sig, itemStart, itemEnd) {
  const base = sig[itemStart].depth;
  let asIdx = -1;
  for (let i = itemStart; i < itemEnd; i++) {
    const t = sig[i];
    if (t.depth === base && t.type === 'id' && !t.quoted && t.value.toUpperCase() === 'AS') {
      asIdx = i;
      break;
    }
  }
  const exprEndIdx = asIdx === -1 ? itemEnd : asIdx;
  const exprLen = exprEndIdx - itemStart;
  let simpleRefName = null;
  if (exprLen === 1 && sig[itemStart].type === 'id' && !(!sig[itemStart].quoted && KEYWORDS.has(sig[itemStart].value.toUpperCase()))) {
    simpleRefName = sig[itemStart].value;
  } else if (
    exprLen === 3 &&
    sig[itemStart].type === 'id' &&
    sig[itemStart + 1].type === 'punct' &&
    sig[itemStart + 1].value === '.' &&
    sig[itemStart + 2].type === 'id'
  ) {
    simpleRefName = sig[itemStart + 2].value;
  }
  return {
    exprEnd: sig[exprEndIdx - 1].end,
    hasAlias: asIdx !== -1,
    simpleRefName,
    start: sig[itemStart].start
  };
}

/** Drop whitespace/comment tokens and tag each survivor with its paren depth. */
function significantTokens(tokens) {
  const sig = [];
  let depth = 0;
  for (const t of tokens) {
    if (t.type === 'ws' || t.type === 'comment') continue;
    if (t.type === 'punct' && t.value === '(') {
      t.depth = depth;
      depth++;
    } else if (t.type === 'punct' && t.value === ')') {
      depth = Math.max(0, depth - 1);
      t.depth = depth;
    } else {
      t.depth = depth;
    }
    sig.push(t);
  }
  return sig;
}

/**
 * Tokenize SQL into positioned tokens. Identifiers (quoted or bare) carry an
 * unquoted `value`; strings and comments are opaque skips so their contents
 * are never mistaken for column refs.
 */
function tokenizeSql(sql, dialect) {
  const q = dialect.idQuote;
  const tokens = [];
  const n = sql.length;
  let i = 0;
  const isWordStart = (c) => /[A-Za-z_]/.test(c);
  const isWordChar = (c) => /[A-Za-z0-9_$]/.test(c);
  while (i < n) {
    const c = sql[i];
    if (/\s/.test(c)) {
      const s = i;
      while (i < n && /\s/.test(sql[i])) i++;
      tokens.push({ end: i, start: s, type: 'ws' });
    } else if (c === '-' && sql[i + 1] === '-') {
      const s = i;
      while (i < n && sql[i] !== '\n') i++;
      tokens.push({ end: i, start: s, type: 'comment' });
    } else if (c === '#' && dialect.hashComment) {
      const s = i;
      while (i < n && sql[i] !== '\n') i++;
      tokens.push({ end: i, start: s, type: 'comment' });
    } else if (c === '/' && sql[i + 1] === '*') {
      const s = i;
      i += 2;
      while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) i++;
      i = Math.min(n, i + 2);
      tokens.push({ end: i, start: s, type: 'comment' });
    } else if (c === "'" || (c === '"' && q !== '"')) {
      const s = i;
      i++;
      while (i < n) {
        if (sql[i] === c) {
          if (sql[i + 1] === c) {
 i += 2; continue;
}
          i++;
          break;
        }
        if (sql[i] === '\\' && dialect.backslashEscape) {
 i += 2; continue;
}
        i++;
      }
      tokens.push({ end: i, start: s, type: 'string' });
    } else if (c === q) {
      const s = i;
      i++;
      let value = '';
      while (i < n) {
        if (sql[i] === q) {
          if (sql[i + 1] === q) {
 value += q; i += 2; continue;
}
          i++;
          break;
        }
        value += sql[i];
        i++;
      }
      tokens.push({ end: i, quoted: true, start: s, type: 'id', value });
    } else if (isWordStart(c)) {
      const s = i;
      while (i < n && isWordChar(sql[i])) i++;
      tokens.push({ end: i, quoted: false, start: s, type: 'id', value: sql.slice(s, i) });
    } else if (/[0-9]/.test(c)) {
      const s = i;
      while (i < n && /[0-9.]/.test(sql[i])) i++;
      tokens.push({ end: i, start: s, type: 'num' });
    } else {
      tokens.push({ end: i + 1, start: i, type: 'punct', value: c });
      i++;
    }
  }
  return tokens;
}

/** Split significant tokens into top-level set-operation branches. */
function unionBranchRanges(sig) {
  const branches = [];
  let start = 0;
  for (let i = 0; i < sig.length; i++) {
    const t = sig[i];
    if (t.depth === 0 && t.type === 'id' && !t.quoted && SET_OPERATORS.has(t.value.toUpperCase())) {
      branches.push([start, i]);
      let j = i + 1;
      if (sig[j] && sig[j].type === 'id' && !sig[j].quoted && sig[j].value.toUpperCase() === 'ALL') j++;
      start = j;
      i = j - 1;
    }
  }
  branches.push([start, sig.length]);
  return branches;
}
