export function applyJSDocRewrites(source, rewrites) {
  if (!rewrites || rewrites.length === 0) return source;
  const sorted = [...rewrites].sort((a, b) => b.start - a.start);
  let result = source;
  for (const r of sorted) {
    if (r.start < 0 || r.end > result.length) continue;
    if (result.slice(r.start, r.end) !== r.oldText) continue;
    result = result.slice(0, r.start) + r.newText + result.slice(r.end);
  }
  return result;
}
