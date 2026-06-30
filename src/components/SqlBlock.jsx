import Prism from 'prismjs';
import { useMemo } from 'react';
import 'prismjs/components/prism-sql';

import '@/assets/sql-theme.css';

// Strip a leading `CREATE TABLE <name> AS ` so the body reads like Domo's editor
// (the output table name is shown as the transform's title instead). Only matches
// CREATE TABLE ... AS, so MySQL CREATE INDEX and bare SELECTs pass through.
const CREATE_TABLE_PREFIX = /^\s*CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"]?[^\s`"(]+[`"]?\s+AS\s+/i;

// SQL word-operators (AND/OR/NOT/LIKE/IS/IN/BETWEEN/...) are highlighted as
// keywords by CodeMirror (and thus Domo's editor), but Prism's stock grammar
// classifies them as `operator`. Reclassify them as keywords here; symbol
// operators (=, <, >) stay `operator` and uncolored, matching Domo. Prism
// evaluates `keyword` before `operator`, so the words resolve as keywords.
// This base also serves MySQL/Magic ETL dialects (backtick identifiers, quoted
// strings) directly.
const MYSQL_SQL = {
  ...Prism.languages.sql,
  keyword: [/\b(?:AND|BETWEEN|DIV|EXISTS|ILIKE|IN|IS|LIKE|NOT|OR|REGEXP|RLIKE|SOUNDS|XOR)\b/i, Prism.languages.sql.keyword]
};

// Redshift/Postgres quote identifiers with double quotes and strings with single
// quotes. Prism's stock grammar colors double-quoted text as a string, so for
// Redshift we narrow `string` to single quotes and treat `"..."` (and `` `..` ``)
// as identifiers, matching Domo's pgsql highlighting.
const REDSHIFT_SQL = {
  ...MYSQL_SQL,
  identifier: [
    { greedy: true, lookbehind: true, pattern: /(^|[^@\\])"(?:[^"\\\r\n]|\\.|"")*"/ },
    { greedy: true, lookbehind: true, pattern: /(^|[^@\\])`(?:[^`\\\r\n]|\\.|``)*`/ }
  ],
  string: { greedy: true, lookbehind: true, pattern: /(^|[^@\\])'(?:[^'\\\r\n]|\\.|'')*'/ }
};

/**
 * Render a single SQL statement with Domo-matching syntax highlighting.
 * Preserves the author's original whitespace, wraps long lines, shows a
 * line-number gutter like Domo's editor, and merges the active search query as
 * inline highlight marks alongside the syntax colors.
 * @param {Object} props
 * @param {string} [props.dialect] - Dataflow engine ('mysql' | 'redshift' | 'magic' | 'unknown')
 * @param {string} [props.query] - Active search query to highlight within the SQL
 * @param {string} props.sql - The SQL statement to render
 */
export function SqlBlock({ dialect, query, sql }) {
  const lines = useMemo(() => {
    const text = typeof sql === 'string' ? sql : '';
    const body = text.replace(CREATE_TABLE_PREFIX, '');
    const grammar = dialect === 'redshift' ? REDSHIFT_SQL : MYSQL_SQL;
    return splitIntoLines(flattenTokens(Prism.tokenize(body, grammar), ''));
  }, [dialect, sql]);

  // Gutter wide enough for the largest line number, like Domo's right-aligned gutter.
  const gutterWidth = lines.length < 100 ? 'w-7' : lines.length < 1000 ? 'w-9' : 'w-12';

  return (
    <div className='sql-block border-divider overflow-hidden rounded border bg-surface font-mono text-xs'>
      {lines.map((segments, i) => {
        // Keep a space before ${rowPad}: a class glued to an interpolation isn't
        // detected by Tailwind's source scanner, so its rule never gets generated.
        const rowPad = `${i === 0 ? 'pt-1.5 ' : ''}${i === lines.length - 1 ? 'pb-1.5' : ''}`;
        return (
          // No items-start: let the gutter cell stretch so its background fills
          // every wrapped row, with the number sitting at the top on its own.
          <div className='flex' key={i}>
            <span className={`${gutterWidth} shrink-0 bg-surface-secondary pr-1 pl-2 text-right text-muted tabular-nums select-none ${rowPad}`}>
              {i + 1}
            </span>
            <span className={`min-w-0 flex-1 wrap-break-word whitespace-pre-wrap pr-2 pl-1.5 ${rowPad}`}>
              {segments.map((segment, j) =>
                segment.className ? (
                  <span className={segment.className} key={j}>
                    {highlightText(segment.text, query, `${i}-${j}`)}
                  </span>
                ) : (
                  <span key={j}>{highlightText(segment.text, query, `${i}-${j}`)}</span>
                )
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function flattenTokens(tokens, inherited) {
  const out = [];
  for (const token of Array.isArray(tokens) ? tokens : [tokens]) {
    if (typeof token === 'string') {
      out.push({ className: inherited, text: token });
      continue;
    }
    const alias = Array.isArray(token.alias) ? token.alias.join(' ') : token.alias || '';
    const className = `${inherited ? `${inherited} ` : ''}token ${token.type}${alias ? ` ${alias}` : ''}`;
    if (typeof token.content === 'string') {
      out.push({ className, text: token.content });
    } else {
      out.push(...flattenTokens(token.content, className));
    }
  }
  return out;
}

function highlightText(text, query, keyBase) {
  if (!query) return text;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts = [];
  let from = 0;
  let idx = lower.indexOf(q);
  let n = 0;
  while (idx !== -1) {
    if (idx > from) parts.push(text.slice(from, idx));
    parts.push(
      <mark className='rounded bg-yellow-200 px-0.5' key={`${keyBase}-m${n}`}>
        {text.slice(idx, idx + q.length)}
      </mark>
    );
    n += 1;
    from = idx + q.length;
    idx = lower.indexOf(q, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts.length > 0 ? parts : text;
}

function splitIntoLines(segments) {
  const lines = [[]];
  for (const segment of segments) {
    const parts = segment.text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) lines.push([]);
      if (part !== '') lines[lines.length - 1].push({ className: segment.className, text: part });
    });
  }
  return lines;
}
