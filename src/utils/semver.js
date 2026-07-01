/**
 * Compare two semver strings. Returns negative if a < b, positive if a > b, 0 if equal.
 * Missing segments are treated as 0, so `'1.2'` sorts as `'1.2.0'`.
 * @param {string} a - First version (e.g. `'1.0.3'`).
 * @param {string} b - Second version (e.g. `'1.0.4'`).
 * @returns {number} Negative if a < b, positive if a > b, 0 if equal.
 */
export function compareSemver(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) {
      return (pa[i] || 0) - (pb[i] || 0);
    }
  }
  return 0;
}
