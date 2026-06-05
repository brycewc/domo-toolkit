import { useCallback, useEffect, useMemo, useState } from 'react';

/**
 * Run multiple async fetches in parallel and track per-key state.
 *
 * Each spec's fetch resolves independently and updates its key as soon as it
 * completes, so the consumer can show progressive UI ("8/27 loaded") rather
 * than waiting for the slowest fetch.
 *
 * @param {Array<{ key: string, label?: string, fetch: () => Promise<any> }>} specs
 *   Stable identity required — memoize at the call site. Re-running with a
 *   new reference resets all keys to 'loading' and re-fetches.
 * @param {Object} [options]
 * @param {boolean} [options.autoFetch=true] - Fetch on mount and whenever
 *   `specs` reference changes. Pass `false` to defer until `refresh()` is
 *   invoked manually.
 * @returns {{
 *   results: Object<string, { error: string|null, items: any, status: 'loading'|'loaded'|'error' }>,
 *   isFullyLoaded: boolean,
 *   loadingCount: number,
 *   loadedCount: number,
 *   errorCount: number,
 *   refresh: () => void
 * }}
 */
export function useParallelFetches(specs, { autoFetch = true } = {}) {
  const [results, setResults] = useState(() => buildInitial(specs));
  const [refreshNonce, setRefreshNonce] = useState(0);

  const refresh = useCallback(() => setRefreshNonce((n) => n + 1), []);

  useEffect(() => {
    if (!autoFetch && refreshNonce === 0) return;

    let isMounted = true;

    setResults(buildInitial(specs));

    for (const spec of specs) {
      spec
        .fetch()
        .then((items) => {
          if (!isMounted) return;
          if (items == null) {
            // Fetch resolved without data — surface as an error so the
            // consumer's error UI fires (X indicator, expandable disclosure
            // body) instead of leaving the row in an indeterminate "loaded
            // but nothing to show" state. Common with services that respond
            // 200 + null body when a feature is disabled (e.g. Domo's
            // approvals API on instances without ApprovalCenter).
            setResults((prev) => ({
              ...prev,
              [spec.key]: {
                error: 'No data returned',
                items: null,
                status: 'error'
              }
            }));
            return;
          }
          setResults((prev) => ({
            ...prev,
            [spec.key]: { error: null, items, status: 'loaded' }
          }));
        })
        .catch((error) => {
          if (!isMounted) return;
          setResults((prev) => ({
            ...prev,
            [spec.key]: {
              error: error?.message || String(error) || 'Request failed',
              items: null,
              status: 'error'
            }
          }));
        });
    }

    return () => {
      isMounted = false;
    };
  }, [specs, autoFetch, refreshNonce]);

  const counts = useMemo(() => {
    const values = Object.values(results);
    return {
      errorCount: values.filter((r) => r.status === 'error').length,
      loadedCount: values.filter((r) => r.status === 'loaded').length,
      loadingCount: values.filter((r) => r.status === 'loading').length
    };
  }, [results]);

  return {
    errorCount: counts.errorCount,
    isFullyLoaded: counts.loadingCount === 0,
    loadedCount: counts.loadedCount,
    loadingCount: counts.loadingCount,
    refresh,
    results
  };
}

function buildInitial(specs) {
  return Object.fromEntries(specs.map((s) => [s.key, { error: null, items: null, status: 'loading' }]));
}
