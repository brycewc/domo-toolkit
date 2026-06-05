// Matches a trailing `module.exports = { ... };` block (optionally followed by
// whitespace) at the end of the source. The export object is a flat list of
// identifiers, so a non-greedy `[^}]*` is sufficient and avoids over-matching.
const TRAILING_EXPORTS = /\s*module\.exports\s*=\s*\{[^}]*\}\s*;?\s*$/;

/**
 * Append Domo's `module.exports` registration block to Code Engine source.
 *
 * The Code Engine IDE hides this block: it strips a trailing
 * `module.exports = {...}` when loading a version into the editor and
 * regenerates it from the parsed function list on save. The runtime relies on
 * the block to expose functions, so a version saved without it reports every
 * function as "not found in package" when a Workflow calls it. Because we read
 * the live editor (which has the block stripped) and POST it verbatim, the
 * block was being dropped. This restores it, matching what a manual save emits.
 *
 * Any existing trailing block is removed first so repeated syncs never stack
 * duplicates. Names are emitted in declaration order with no interior spaces,
 * matching Domo's exact formatting.
 *
 * @param {string} code - Package source as read from the editor (no export block)
 * @param {string[]} functionNames - Top-level function names in declaration order
 * @returns {string} Source with a freshly generated trailing module.exports block
 */
export function appendModuleExports(code, functionNames) {
  if (typeof code !== 'string') return code;
  if (!Array.isArray(functionNames) || functionNames.length === 0) return code;
  const base = code.replace(TRAILING_EXPORTS, '').replace(/\s+$/, '');
  return `${base}\n\nmodule.exports = {${functionNames.join(',')}};`;
}
