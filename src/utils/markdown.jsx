/**
 * Inline-markdown helpers for the project's single supported syntax: `**bold**`.
 *
 * Used by status messages, DataList header titles, and DataList subtext so the
 * same lightweight string format flows through every surface that needs to
 * emphasize a value without forcing the caller to assemble JSX. Anything richer
 * (italic, code, links) is intentionally out of scope — if we ever need it,
 * reach for a real markdown library rather than extending this regex.
 */

/**
 * Parse `**bold**` runs to a flat list of strings and `<strong>` elements,
 * suitable for rendering as React children. Non-string input is returned
 * untouched so callers can pass already-resolved JSX through safely.
 *
 * @param {string} text
 * @returns {React.ReactNode}
 */
export function parseMarkdownBold(text) {
  if (typeof text !== 'string') return text;

  const parts = [];
  let lastIndex = 0;
  const regex = /\*\*(.+?)\*\*/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }
    parts.push(<strong key={match.index}>{match[1]}</strong>);
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

/**
 * Strip the `**` markers while preserving the content inside, yielding a flat
 * plain-text string suitable for places that can't render React nodes (e.g.
 * tooltip overlays where the bold styling would be visually redundant).
 *
 * Uses a content-preserving replace (`'$1'`) rather than blanket-deleting `**`
 * so an unmatched `**` left in the source string doesn't produce a dangling
 * asterisk pair in the output.
 *
 * @param {string} text
 * @returns {string}
 */
export function stripMarkdownBold(text) {
  if (typeof text !== 'string') return text;
  return text.replace(/\*\*(.+?)\*\*/g, '$1');
}
