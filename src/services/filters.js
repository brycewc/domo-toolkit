import { executeInPage, executeInAllFrames } from '@/utils';

/**
 * Extract pfilters from URL query string
 * @param {string} url - Full URL to parse
 * @returns {Array} Array of pfilter objects, empty if none found
 */
export function getUrlPfilters(url) {
  try {
    const urlObj = new URL(url);
    const pfiltersParam = urlObj.searchParams.get('pfilters');

    if (!pfiltersParam) {
      return [];
    }

    const decoded = decodeURIComponent(pfiltersParam);
    const filters = JSON.parse(decoded);

    return Array.isArray(filters) ? filters : [];
  } catch (error) {
    console.warn('Failed to parse pfilters from URL:', error);
    return [];
  }
}

/**
 * Transform a raw filter object from API to pfilter format
 * @param {Object} filter - Raw filter object from API
 * @returns {Object|null} Pfilter object or null if invalid
 */
function transformFilterToPfilter(filter) {
  if (!filter.column || !filter.values || filter.values.length === 0) {
    return null;
  }

  const pfilter = {
    column: filter.column
  };

  if (filter.operand) {
    pfilter.operand = filter.operand.toUpperCase();
  } else if (filter.values.length === 1) {
    pfilter.operand = 'EQUALS';
  } else {
    pfilter.operand = 'IN';
  }

  pfilter.values = filter.values;

  if (filter.dataSetId || filter.dataSourceId) {
    pfilter.dataSetId = filter.dataSetId || filter.dataSourceId;
  }

  return pfilter;
}

/**
 * Get filters from Domo's client-side state
 * Domo stores active filters in the page context
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<Array>} Array of filter objects
 */
export async function getClientSideFilters(tabId = null) {
  try {
    const result = await executeInPage(
      () => {
        const filters = [];

        // Method 1: Check for domoFilterService
        if (
          window.domoFilterService &&
          typeof window.domoFilterService.getCurrentFilters === 'function'
        ) {
          const serviceFilters = window.domoFilterService.getCurrentFilters();
          if (Array.isArray(serviceFilters) && serviceFilters.length > 0) {
            return serviceFilters;
          }
        }

        // Method 2: Check domoFilterService.currentFilters directly
        if (
          window.domoFilterService &&
          Array.isArray(window.domoFilterService.currentFilters) &&
          window.domoFilterService.currentFilters.length > 0
        ) {
          return window.domoFilterService.currentFilters;
        }

        // Method 3: Check for global domo object
        if (window.domo) {
          if (window.domo.filterState) {
            return window.domo.filterState;
          }
          if (window.domo.env && window.domo.env.filters) {
            return window.domo.env.filters;
          }
        }

        // Method 4: Look for page filters in Domo's internal state objects
        const domoStateObjects = [
          '__DOMO_PAGE_STATE__',
          '__DOMO__',
          '__DOMO_STATE__',
          '__NUXT__',
          '__INITIAL_STATE__',
          'DOMO_PAGE_DATA',
          'pageData'
        ];
        for (const stateKey of domoStateObjects) {
          if (window[stateKey]) {
            const state = window[stateKey];
            const filterPaths = [
              state.filters,
              state.pageFilters,
              state.data?.filters,
              state.page?.filters,
              state.state?.filters,
              state.analyzer?.filters
            ];
            for (const f of filterPaths) {
              if (Array.isArray(f) && f.length > 0) {
                return f;
              }
            }
          }
        }

        // Method 5: Check for pageFilters global
        if (window.pageFilters && Array.isArray(window.pageFilters)) {
          return window.pageFilters;
        }

        // Method 6: Look for common filter state patterns
        const possibleFilterVars = [
          'currentFilters',
          'activeFilters',
          'appliedFilters',
          'filterState',
          'filters',
          'pageFilterState',
          'domoFilters'
        ];
        for (const varName of possibleFilterVars) {
          if (window[varName] && Array.isArray(window[varName])) {
            return window[varName];
          }
        }

        // Method 7: Check Redux/MobX stores
        const storeKeys = ['__REDUX_STORE__', 'store', '__store'];
        for (const storeKey of storeKeys) {
          if (window[storeKey] && typeof window[storeKey].getState === 'function') {
            try {
              const state = window[storeKey].getState();
              if (state && state.filters) {
                return state.filters;
              }
              if (state && state.page && state.page.filters) {
                return state.page.filters;
              }
            } catch (e) {
              // Store access failed
            }
          }
        }

        // Method 8: Check Apollo Client cache
        if (window.__APOLLO_CLIENT__) {
          try {
            const apolloCache = window.__APOLLO_CLIENT__.cache;
            if (apolloCache && apolloCache.data && apolloCache.data.data) {
              const cacheData = apolloCache.data.data;
              for (const key of Object.keys(cacheData)) {
                if (
                  key.toLowerCase().includes('filter') ||
                  key.toLowerCase().includes('pfilter')
                ) {
                  if (cacheData[key] && Array.isArray(cacheData[key].filters)) {
                    return cacheData[key].filters;
                  }
                }
              }
            }
          } catch (e) {
            // Apollo cache access failed
          }
        }

        // Method 9: Check TanStack Query client
        if (window.DOMO_TANSTACK_QUERY_CLIENT) {
          try {
            const queryCache = window.DOMO_TANSTACK_QUERY_CLIENT.getQueryCache?.();
            if (queryCache) {
              const queries = queryCache.getAll?.() || [];
              for (const query of queries) {
                const queryKey = query.queryKey;
                const data = query.state?.data;
                if (
                  queryKey &&
                  (JSON.stringify(queryKey).toLowerCase().includes('filter') ||
                    JSON.stringify(queryKey).toLowerCase().includes('pfilter'))
                ) {
                  if (data && Array.isArray(data)) {
                    return data;
                  }
                }
              }
            }
          } catch (e) {
            // TanStack Query access failed
          }
        }

        // Method 10: Check window.Domo and window.DOMO
        for (const domoObj of [window.Domo, window.DOMO]) {
          if (domoObj) {
            const paths = [
              domoObj.filters,
              domoObj.pageFilters,
              domoObj.currentFilters,
              domoObj.filterState,
              domoObj.page?.filters,
              domoObj.analyzer?.filters,
              domoObj.state?.filters
            ];
            for (const p of paths) {
              if (Array.isArray(p) && p.length > 0) {
                return p;
              }
            }
          }
        }

        // Method 11: Check sessionStorage and localStorage
        try {
          const storageKeys = ['filters', 'pageFilters', 'domoFilters', 'filterState'];
          for (const key of storageKeys) {
            for (const storage of [sessionStorage, localStorage]) {
              const val = storage.getItem(key);
              if (val) {
                try {
                  const parsed = JSON.parse(val);
                  if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                  }
                } catch (e) {
                  // Not JSON
                }
              }
            }
          }
        } catch (e) {
          // Storage access failed
        }

        // Method 12: Look for filter iframes and extract pfilters from their src
        const allIframes = document.querySelectorAll('iframe');
        allIframes.forEach((iframe) => {
          try {
            const src = iframe.src || iframe.getAttribute('src') || '';
            if (src.includes('pfilters')) {
              const url = new URL(src);
              const pfiltersParam = url.searchParams.get('pfilters');
              if (pfiltersParam) {
                const parsed = JSON.parse(decodeURIComponent(pfiltersParam));
                if (Array.isArray(parsed)) {
                  filters.push(...parsed);
                }
              }
            }
          } catch (e) {
            // Failed to parse iframe pfilters
          }
        });

        if (filters.length > 0) {
          return filters;
        }

        // Method 13: Check data attributes on card containers
        const cardContainers = document.querySelectorAll(
          '[data-pfilters], [data-filters], .card-embed, .domo-card, [data-card-id]'
        );
        cardContainers.forEach((container) => {
          const pfiltersAttr =
            container.getAttribute('data-pfilters') || container.getAttribute('data-filters');
          if (pfiltersAttr) {
            try {
              const parsed = JSON.parse(pfiltersAttr);
              if (Array.isArray(parsed)) {
                filters.push(...parsed);
              }
            } catch (e) {
              // Not valid JSON
            }
          }
        });

        if (filters.length > 0) {
          return filters;
        }

        // Method 14: Look for pfilters in page scripts
        const scripts = document.querySelectorAll('script');
        scripts.forEach((script) => {
          const content = script.textContent || '';
          const pfilterMatch = content.match(/pfilters['":\s]*(\[[\s\S]*?\])/);
          if (pfilterMatch) {
            try {
              const parsed = JSON.parse(pfilterMatch[1]);
              if (Array.isArray(parsed)) {
                filters.push(...parsed);
              }
            } catch (e) {
              // Failed to parse
            }
          }
        });

        return filters;
      },
      [],
      tabId
    );

    return result || [];
  } catch (error) {
    console.warn('Failed to get client-side filters:', error);
    return [];
  }
}

/**
 * Fetch page filter card states from Domo API
 * Must be executed in page context for authentication
 * @param {string} pageId - The page ID
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<Array>} Array of filter objects in pfilter format
 */
export async function getPageFilters(pageId, tabId = null) {
  try {
    // First try to get filters from client-side state (most accurate for current selections)
    const clientFilters = await getClientSideFilters(tabId);
    if (clientFilters.length > 0) {
      const filters = [];
      clientFilters.forEach((filter) => {
        const pfilter = transformFilterToPfilter(filter);
        if (pfilter) {
          filters.push(pfilter);
        }
      });
      // Deduplicate: bare (no dataSetId) filters take precedence
      const bareColumns = new Set();
      filters.forEach((f) => {
        if (!f.dataSetId) bareColumns.add(f.column);
      });
      const uniqueFilters = [];
      const seen = new Set();
      filters.forEach((f) => {
        if (f.dataSetId && bareColumns.has(f.column)) return;
        const key = f.dataSetId ? `${f.column}:${f.dataSetId}` : f.column;
        if (!seen.has(key)) {
          seen.add(key);
          uniqueFilters.push(f);
        }
      });
      return uniqueFilters;
    }

    // No working API fallback - client-side detection is the primary method
    // The old endpoints (/analyzer/load/filter-groups is for PDP, /v2/pages/{id}/filters doesn't exist)
    return [];
  } catch (error) {
    console.warn('Failed to fetch page filters:', error);
    return [];
  }
}

/**
 * Merge filters from multiple sources, deduplicating by column name
 * Later filters take precedence
 * @param  {...Array} filterArrays - Arrays of filter objects to merge
 * @returns {Array} Merged and deduplicated filter array
 */
export function mergeFilters(...filterArrays) {
  const filterMap = new Map();
  // Track columns that have a filter without a dataSetId
  const bareColumns = new Set();

  // First pass: collect all filters, tracking bare (no dataSetId) entries
  const allFilters = [];
  filterArrays.forEach((filters) => {
    if (Array.isArray(filters)) {
      filters.forEach((filter) => {
        if (filter.column) {
          allFilters.push(filter);
          if (!filter.dataSetId) {
            bareColumns.add(filter.column);
          }
        }
      });
    }
  });

  // Second pass: add filters, skipping dataSetId variants when a bare version exists
  allFilters.forEach((filter) => {
    if (filter.dataSetId && bareColumns.has(filter.column)) {
      // A bare version exists for this column — skip the dataSetId variant
      return;
    }
    const key = filter.dataSetId
      ? `${filter.column}:${filter.dataSetId}`
      : filter.column;
    filterMap.set(key, filter);
  });

  return Array.from(filterMap.values());
}

/**
 * Encode filters array for URL query string
 * @param {Array} filters - Array of filter objects
 * @returns {string} URL-encoded JSON string
 */
export function encodeFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0) {
    return '';
  }

  const json = JSON.stringify(filters);
  return encodeURIComponent(json);
}

/**
 * Build a pfilter URL from base URL and filters
 * Works for pages, cards, and any Domo URL that supports pfilters
 * @param {string} baseUrl - Base URL (instance + path)
 * @param {string} objectId - Object ID (page or card ID) - unused but kept for compatibility
 * @param {Array} filters - Array of filter objects
 * @returns {string} Complete URL with pfilters parameter
 */
export function buildPfilterUrl(baseUrl, objectId, filters) {
  try {
    const urlObj = new URL(baseUrl);

    // Remove existing pfilters if present
    urlObj.searchParams.delete('pfilters');

    // Add new pfilters if we have filters
    if (Array.isArray(filters) && filters.length > 0) {
      const encoded = encodeFilters(filters);
      urlObj.searchParams.set('pfilters', decodeURIComponent(encoded));
    }

    return urlObj.toString();
  } catch (error) {
    console.error('Failed to build pfilter URL:', error);
    return baseUrl;
  }
}

/**
 * Get filters from domoFilterService in any frame (including nested iframes)
 * This accesses the embedded app's filter state via domo.onFiltersUpdate()
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<Array>} Array of filter objects
 */
export async function getFiltersFromAllFrames(tabId = null) {
  try {
    const results = await executeInAllFrames(
      () => {
        const frameInfo = {
          url: window.location.href,
          hasDomoFilterService: !!window.domoFilterService,
          hasDomo: !!window.domo,
          filters: []
        };

        // Check for domoFilterService (Domo SDK filter callback storage)
        if (
          window.domoFilterService &&
          typeof window.domoFilterService.getCurrentFilters === 'function'
        ) {
          const filters = window.domoFilterService.getCurrentFilters();
          if (Array.isArray(filters) && filters.length > 0) {
            frameInfo.filters = filters;
            frameInfo.source = 'domoFilterService.getCurrentFilters()';
            return frameInfo;
          }
        }

        // Check domoFilterService.currentFilters directly
        if (
          window.domoFilterService &&
          Array.isArray(window.domoFilterService.currentFilters) &&
          window.domoFilterService.currentFilters.length > 0
        ) {
          frameInfo.filters = window.domoFilterService.currentFilters;
          frameInfo.source = 'domoFilterService.currentFilters';
          return frameInfo;
        }

        // Check for domo SDK environment
        if (window.domo && window.domo.env && window.domo.env.filters) {
          frameInfo.filters = window.domo.env.filters;
          frameInfo.source = 'domo.env.filters';
          return frameInfo;
        }

        return frameInfo;
      },
      [],
      tabId
    );

    // Extract filters from results
    const filters = [];
    const seen = new Set();

    results.forEach((result) => {
      if (result && result.filters && Array.isArray(result.filters)) {
        result.filters.forEach((filter) => {
          if (filter && filter.column) {
            const key = JSON.stringify({ column: filter.column, values: filter.values });
            if (!seen.has(key)) {
              seen.add(key);
              filters.push({
                column: filter.column,
                operand: (filter.operand || filter.operator || 'IN').toUpperCase(),
                values: Array.isArray(filter.values) ? filter.values : [filter.values]
              });
            }
          }
        });
      }
    });

    return filters;
  } catch (error) {
    console.warn('Failed to get filters from all frames:', error);
    return [];
  }
}

/**
 * Get pfilters from iframe src attributes (with optional delay for dynamic updates)
 * @param {number} tabId - Optional Chrome tab ID
 * @param {number} delayMs - Delay before checking (to allow dynamic updates)
 * @returns {Promise<Array>} Array of filter objects
 */
export async function getIframePfilters(tabId = null, delayMs = 500) {
  if (delayMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  try {
    const result = await executeInPage(
      () => {
        const filters = [];
        const seen = new Set();
        const iframes = document.querySelectorAll('iframe');

        iframes.forEach((iframe) => {
          try {
            const src = iframe.src || '';
            if (src.includes('pfilters')) {
              const url = new URL(src);
              const pfiltersParam = url.searchParams.get('pfilters');
              if (pfiltersParam) {
                const decoded = decodeURIComponent(pfiltersParam);
                const parsed = JSON.parse(decoded);
                if (Array.isArray(parsed)) {
                  parsed.forEach((filter) => {
                    const key = JSON.stringify({
                      column: filter.column,
                      values: filter.values
                    });
                    if (!seen.has(key)) {
                      seen.add(key);
                      filters.push(filter);
                    }
                  });
                }
              }
            }
          } catch (e) {
            // Failed to parse
          }
        });

        return filters;
      },
      [],
      tabId
    );

    return result || [];
  } catch (error) {
    console.warn('Failed to get iframe pfilters:', error);
    return [];
  }
}

/**
 * Get filters from AngularJS scope (for pages using Angular filter components)
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<Array>} Array of filter objects in pfilter format
 */
export async function getAngularScopeFilters(tabId = null) {
  try {
    const result = await executeInPage(
      () => {
        const filters = [];

        // Look for Angular filter components
        const filterSelectors = [
          '[filters]',
          '[page-filter-count]',
          'fb-policy-selector',
          '[ng-controller*="filter"]',
          '[ng-controller*="Filter"]',
          '.page-filters',
          '[data-filter]'
        ];

        for (const selector of filterSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            try {
              // Try to get Angular scope
              const angularEl = window.angular?.element?.(el);
              if (angularEl) {
                const scope = angularEl.scope?.() || angularEl.isolateScope?.();
                if (scope) {
                  // Look for filter data in scope
                  const filterSources = [
                    scope.filters,
                    scope.$ctrl?.filters,
                    scope.vm?.filters,
                    scope.pageFilters,
                    scope.$ctrl?.pageFilters,
                    scope.currentFilters,
                    scope.$ctrl?.currentFilters
                  ];

                  for (const source of filterSources) {
                    if (Array.isArray(source) && source.length > 0) {
                      source.forEach((f) => {
                        if (f.column && f.values && f.values.length > 0) {
                          filters.push({
                            column: f.column,
                            operand: (f.operand || f.operator || 'IN').toUpperCase(),
                            values: f.values,
                            dataSetId: f.dataSourceId || f.dataSetId
                          });
                        }
                      });
                      if (filters.length > 0) return filters;
                    }
                  }
                }
              }
            } catch (e) {
              // Scope access failed
            }
          }
        }

        // Try to access filters from global Angular services/factories
        if (window.angular) {
          try {
            const injector = window.angular.element(document.body).injector?.();
            if (injector) {
              // Try to get filter-related services
              const serviceNames = [
                'FilterService',
                'filterService',
                'PageFilterService',
                'pageFilterService',
                'variableControlService'
              ];

              for (const name of serviceNames) {
                try {
                  const service = injector.get(name);
                  if (service) {
                    const filterMethods = [
                      service.getFilters,
                      service.getCurrentFilters,
                      service.getActiveFilters,
                      service.filters
                    ];

                    for (const method of filterMethods) {
                      let filterData;
                      if (typeof method === 'function') {
                        filterData = method.call(service);
                      } else if (Array.isArray(method)) {
                        filterData = method;
                      }

                      if (Array.isArray(filterData) && filterData.length > 0) {
                        filterData.forEach((f) => {
                          if (f.column && f.values && f.values.length > 0) {
                            filters.push({
                              column: f.column,
                              operand: (f.operand || f.operator || 'IN').toUpperCase(),
                              values: f.values,
                              dataSetId: f.dataSourceId || f.dataSetId
                            });
                          }
                        });
                        if (filters.length > 0) return filters;
                      }
                    }
                  }
                } catch (e) {
                  // Service not found
                }
              }
            }
          } catch (e) {
            // Injector access failed
          }
        }

        return filters;
      },
      [],
      tabId
    );

    return result || [];
  } catch (error) {
    console.warn('Failed to get Angular scope filters:', error);
    return [];
  }
}

/**
 * Get variable controls (filter cards) from page cards via API
 * This fetches the current filter selections from Domo's variable controls system
 * @param {string} pageId - The page ID
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<Array>} Array of filter objects in pfilter format
 */
export async function getVariableControlFilters(pageId, tabId = null) {
  try {
    const result = await executeInPage(
      async (pageId) => {
        const filters = [];

        // First, get all cards on the page
        const cardsResponse = await fetch(`/api/content/v1/pages/${pageId}/cards`, {
          credentials: 'include'
        });

        if (!cardsResponse.ok) {
          return [];
        }

        const cards = await cardsResponse.json();
        if (!Array.isArray(cards) || cards.length === 0) {
          return [];
        }

        // Filter to only cards that might have variable controls (filter cards)
        // Filter cards typically have specific types or metadata
        const potentialFilterCards = cards.filter(
          (card) =>
            card.type?.toLowerCase().includes('filter') ||
            card.cardType?.toLowerCase().includes('filter') ||
            card.metadata?.type?.toLowerCase().includes('filter') ||
            card.metadata?.chartType?.toLowerCase().includes('filter') ||
            card.metadata?.variableControl
        );

        // If no obvious filter cards, try all cards (some may have controls)
        const cardsToCheck = potentialFilterCards.length > 0 ? potentialFilterCards : cards;

        // For each card, try to get its variable controls
        const controlPromises = cardsToCheck.map(async (card) => {
          try {
            const controlsResponse = await fetch(
              `/api/content/v1/cards/${card.id}/variable/controls`,
              { credentials: 'include' }
            );

            if (controlsResponse.ok) {
              const controls = await controlsResponse.json();
              if (Array.isArray(controls)) {
                return controls;
              }
            }
          } catch (e) {
            // Card doesn't have variable controls
          }
          return [];
        });

        const allControls = await Promise.all(controlPromises);

        // Flatten and process controls
        allControls.forEach((controls) => {
          controls.forEach((control) => {
            // Only include controls that have values selected
            if (control.column && control.values && control.values.length > 0) {
              filters.push({
                column: control.column,
                operand: (control.operand || 'IN').toUpperCase(),
                values: control.values,
                dataSetId: control.dataSourceId || control.dataSetId
              });
            }
          });
        });

        return filters;
      },
      [pageId],
      tabId
    );

    return result || [];
  } catch (error) {
    console.warn('Failed to get variable control filters:', error);
    return [];
  }
}

/**
 * Get filters from App Studio pages
 * App Studio uses an EventBus pattern and stores filters differently than regular pages
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<Array>} Array of filter objects in pfilter format
 */
export async function getAppStudioFilters(tabId = null) {
  try {
    const result = await executeInPage(
      () => {
        const filters = [];

        // Method 1: Check Apollo Client cache for filter-related data
        if (window.__APOLLO_CLIENT__) {
          try {
            const cache = window.__APOLLO_CLIENT__.cache;
            const cacheData = cache?.extract?.();
            if (cacheData) {
              // Look for variable control or filter entries in cache
              for (const [key, value] of Object.entries(cacheData)) {
                if (!value || typeof value !== 'object') continue;

                // Check for variableControls or filters in the cached data
                const checkObj = (obj, path = '') => {
                  if (!obj || typeof obj !== 'object') return;

                  // Look for variableControls array
                  if (Array.isArray(obj.variableControls)) {
                    obj.variableControls.forEach((vc) => {
                      if (vc.column && vc.values && vc.values.length > 0) {
                        filters.push({
                          column: vc.column,
                          operand: (vc.operand || 'IN').toUpperCase(),
                          values: vc.values,
                          dataSetId: vc.dataSourceId || vc.dataSetId
                        });
                      }
                    });
                  }

                  // Look for activeFilters or filters array
                  if (Array.isArray(obj.activeFilters)) {
                    obj.activeFilters.forEach((f) => {
                      if (f.column && f.values && f.values.length > 0) {
                        filters.push({
                          column: f.column,
                          operand: (f.operand || 'IN').toUpperCase(),
                          values: f.values,
                          dataSetId: f.dataSourceId || f.dataSetId
                        });
                      }
                    });
                  }

                  if (Array.isArray(obj.filters)) {
                    obj.filters.forEach((f) => {
                      if (f.column && f.values && f.values.length > 0) {
                        filters.push({
                          column: f.column,
                          operand: (f.operand || 'IN').toUpperCase(),
                          values: f.values,
                          dataSetId: f.dataSourceId || f.dataSetId
                        });
                      }
                    });
                  }

                  // Look for selected values in variable controls
                  if (obj.selectedValues && Array.isArray(obj.selectedValues) && obj.column) {
                    filters.push({
                      column: obj.column,
                      operand: 'IN',
                      values: obj.selectedValues
                    });
                  }
                };

                checkObj(value, key);
              }
            }
          } catch (e) {
            // Apollo cache access failed
          }
        }

        // Method 2: Check Angular $rootScope for EventBus-stored filters
        if (window.angular) {
          try {
            const injector = window.angular.element(document.body).injector?.();
            if (injector) {
              const $rootScope = injector.get('$rootScope');
              if ($rootScope) {
                // Check for filter-related properties on $rootScope
                const filterProps = [
                  'activeFilters',
                  'cardFilters',
                  'pageFilters',
                  'filterState',
                  'variableControlState'
                ];

                for (const prop of filterProps) {
                  if ($rootScope[prop] && Array.isArray($rootScope[prop])) {
                    $rootScope[prop].forEach((f) => {
                      if (f.column && f.values && f.values.length > 0) {
                        filters.push({
                          column: f.column,
                          operand: (f.operand || 'IN').toUpperCase(),
                          values: f.values
                        });
                      }
                    });
                  }
                }

                // Check $$listeners for filter event handlers that might have state
                if ($rootScope.$$listeners) {
                  const filterEvents = Object.keys($rootScope.$$listeners).filter(
                    (k) =>
                      k.includes('filter') ||
                      k.includes('Filter') ||
                      k.includes('variable') ||
                      k.includes('card:')
                  );
                  if (filterEvents.length > 0) {
                    foundFilters = true;
                  }
                }
              }
            }
          } catch (e) {
            // Angular access failed
          }
        }

        // Method 3: Check for App Studio specific global state
        const appStudioStateKeys = [
          '__APP_STUDIO_STATE__',
          '__APP_STATE__',
          'appStudioState',
          'appState',
          '__CARD_STATE__'
        ];

        for (const key of appStudioStateKeys) {
          if (window[key]) {
            const state = window[key];
            const filterPaths = [
              state.filters,
              state.activeFilters,
              state.cardFilters,
              state.variableControls,
              state.page?.filters,
              state.cards?.filters
            ];

            for (const f of filterPaths) {
              if (Array.isArray(f) && f.length > 0) {
                f.forEach((filter) => {
                  if (filter.column && filter.values && filter.values.length > 0) {
                    filters.push({
                      column: filter.column,
                      operand: (filter.operand || 'IN').toUpperCase(),
                      values: filter.values
                    });
                  }
                });
              }
            }
          }
        }

        // Method 4: Check for filter selections in dropdown/select elements
        const filterDropdowns = document.querySelectorAll(
          '.variable-control select, .filter-control select, [class*="filter"] select'
        );
        filterDropdowns.forEach((dropdown) => {
          try {
            const scope = window.angular?.element?.(dropdown).scope?.();
            if (scope) {
              // Look for selected value and column info in scope
              const columnName = scope.column || scope.columnName || scope.$ctrl?.column;
              const selectedValue = scope.selectedValue || scope.value || scope.$ctrl?.selectedValue;

              if (columnName && selectedValue) {
                filters.push({
                  column: columnName,
                  operand: 'EQUALS',
                  values: [selectedValue]
                });
              }
            }
          } catch (e) {
            // Scope access failed
          }
        });

        // Method 5: Extract from $ctrl.cardFilters (App Studio pattern)
        // App Studio cards use ng-click="$ctrl.clearCardFilters" with filter state on $ctrl
        const filterControlElements = document.querySelectorAll(
          '[ng-click*="filter" i], [ng-click*="Filter"], [ng-if*="filter" i], [ng-if*="Filter"], [ng-if*="hasCardFilters"]'
        );
        filterControlElements.forEach((el) => {
          try {
            const scope = window.angular?.element?.(el).scope?.();
            if (scope?.$ctrl) {
              // Check for cardFilters array
              if (Array.isArray(scope.$ctrl.cardFilters)) {
                scope.$ctrl.cardFilters.forEach((f) => {
                  if (f.column && f.values && f.values.length > 0) {
                    filters.push({
                      column: f.column,
                      operand: (f.operand || f.operator || 'IN').toUpperCase(),
                      values: f.values,
                      dataSetId: f.dataSourceId || f.dataSetId
                    });
                  }
                });
              }
              // Check for filters array
              if (Array.isArray(scope.$ctrl.filters)) {
                scope.$ctrl.filters.forEach((f) => {
                  if (f.column && f.values && f.values.length > 0) {
                    filters.push({
                      column: f.column,
                      operand: (f.operand || f.operator || 'IN').toUpperCase(),
                      values: f.values,
                      dataSetId: f.dataSourceId || f.dataSetId
                    });
                  }
                });
              }
              // Check card.filters if available
              if (scope.$ctrl.card?.filters && Array.isArray(scope.$ctrl.card.filters)) {
                scope.$ctrl.card.filters.forEach((f) => {
                  if (f.column && f.values && f.values.length > 0) {
                    filters.push({
                      column: f.column,
                      operand: (f.operand || f.operator || 'IN').toUpperCase(),
                      values: f.values,
                      dataSetId: f.dataSourceId || f.dataSetId
                    });
                  }
                });
              }
            }
          } catch (e) {
            // Scope access failed
          }
        });

        // Method 6: Scan cd-control-menu and other potential filter-holding elements
        const menuSelectors = [
          '[class*="cd-control-menu"]',
          '[class*="control-menu"]',
          '[class*="Card.module"]',
          '.card-container',
          '[data-card-id]',
          '.domo-card',
          '.app-studio-page',
          '.app-studio-container',
          '[class*="PageCanvas"]',
          '[class*="AppStudio"]'
        ];

        menuSelectors.forEach((selector) => {
          document.querySelectorAll(selector).forEach((el) => {
            try {
              const scope = window.angular?.element?.(el).scope?.();
              if (scope) {
                // Check direct scope and $ctrl
                const targets = [scope, scope.$ctrl].filter(Boolean);
                targets.forEach((t) => {
                  const fSources = [t.cardFilters, t.filters, t.pageFilters, t.pfilters];
                  fSources.forEach((source) => {
                    if (Array.isArray(source) && source.length > 0) {
                      source.forEach((f) => {
                        if (f.column && f.values && f.values.length > 0) {
                          filters.push({
                            column: f.column,
                            operand: (f.operand || f.operator || 'IN').toUpperCase(),
                            values: f.values,
                            dataSetId: f.dataSourceId || f.dataSetId
                          });
                        }
                      });
                    }
                  });
                });
              }
            } catch (e) { }
          });
        });

        // Method 7: Deep search scopes if we still have nothing (last resort)
        if (filters.length === 0 && window.angular) {
          try {
            const allWithScope = document.querySelectorAll('.ng-scope, .ng-isolated-scope');
            allWithScope.forEach(el => {
              const scope = window.angular.element(el).scope?.();
              if (scope?.$ctrl?.cardFilters && Array.isArray(scope.$ctrl.cardFilters)) {
                scope.$ctrl.cardFilters.forEach(f => {
                  if (f.column && f.values) {
                    filters.push({
                      column: f.column,
                      operand: (f.operand || 'IN').toUpperCase(),
                      values: f.values
                    });
                  }
                });
              }
            });
          } catch (e) { }
        }

        // Deduplicate filters
        const seen = new Set();
        return filters.filter((f) => {
          const key = `${f.column}:${JSON.stringify(f.values)}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      },
      [],
      tabId
    );

    return result || [];
  } catch (error) {
    console.warn('Failed to get App Studio filters:', error);
    return [];
  }
}

/**
 * Detect if current page is an App Studio page
 * App Studio pages have specific characteristics that distinguish them
 * @param {number} tabId - Optional Chrome tab ID
 * @returns {Promise<boolean>} True if on an App Studio page
 */
async function isAppStudioPage(tabId = null) {
  try {
    // Check 0: Fast URL check (can be done without executeInPage)
    // We try to get the current URL if not provided
    let currentUrl = '';
    if (tabId) {
      try {
        const tab = await chrome.tabs.get(tabId);
        currentUrl = tab.url || '';
      } catch (e) {
        // Fallback to getting current active tab
      }
    }

    if (!currentUrl) {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        currentUrl = tab?.url || '';
      } catch (e) { }
    }

    if (currentUrl.includes('/app-studio/') || currentUrl.includes('/appstudio/')) {
      return true;
    }

    const result = await executeInPage(
      () => {
        const detection = {
          isAppStudio: false,
          reason: '',
          checks: {}
        };

        // Check 1: URL patterns (inside page just in case)
        const url = window.location.href;
        const urlMatch = url.includes('/app-studio/') || url.includes('/appstudio/');
        detection.checks.urlMatch = urlMatch;
        if (urlMatch) {
          detection.isAppStudio = true;
          detection.reason = 'URL pattern match';
          return detection;
        }

        // Check 2: App Studio specific elements (CSS module classes)
        // Optimized: Only search for specific tags and classes likely to be App Studio roots
        let appStudioElementCount = 0;
        try {
          const markers = [
            '.PageCanvas',
            '[class*="PageCanvas"]',
            '.AppStudio',
            '[class*="AppStudio"]',
            'domo-app-canvas',
            '.app-studio-root',
            '[class*="Card.module_"]' // Still check but maybe limit scope
          ];

          for (const selector of markers) {
            const el = document.querySelector(selector);
            if (el) {
              appStudioElementCount++;
              if (appStudioElementCount >= 2) break;
            }
          }
        } catch (e) {
          // Fallback
        }

        detection.checks.appStudioElementCount = appStudioElementCount;
        if (appStudioElementCount > 0) {
          detection.isAppStudio = true;
          detection.reason = `Found ${appStudioElementCount} App Studio markers`;
          return detection;
        }

        // Check 3: cd-control-menu elements (App Studio has many of these)
        const controlMenus = document.querySelectorAll('[class*="cd-control-menu"]');
        detection.checks.controlMenuCount = controlMenus.length;
        if (controlMenus.length > 5) { // Lowered threshold slightly
          detection.isAppStudio = true;
          detection.reason = `Found ${controlMenus.length} control menus`;
          return detection;
        }

        // Check 4: Angular with $ctrl pattern and specific App Studio markers
        if (window.angular) {
          const hasAppStudioAngular = !!document.querySelector('.app-canvas') ||
            !!document.querySelector('[ng-controller*="AppStudio" i]');
          detection.checks.hasAppStudioAngular = hasAppStudioAngular;

          const filterIndicators = document.querySelectorAll('[class*="filterIndicator"]');
          detection.checks.filterIndicatorCount = filterIndicators.length;

          if (hasAppStudioAngular || filterIndicators.length > 0) {
            detection.isAppStudio = true;
            detection.reason = `App Studio Angular indicators found (hasAppStudioAngular: ${hasAppStudioAngular})`;
            return detection;
          }
        }

        detection.reason = 'No App Studio indicators found';
        return detection;
      },
      [],
      tabId
    );

    // Log detection results for debugging
    if (result && typeof result === 'object') {
      return result.isAppStudio || false;
    }

    return !!result;
  } catch (error) {
    console.warn('[MajorDomo] App Studio detection failed:', error);
    return false;
  }
}

/**
 * Get all filters for a page from multiple detection sources
 * @param {Object} params - Parameters
 * @param {string} params.url - Current page URL
 * @param {string} params.pageId - Page ID
 * @param {number} [params.tabId] - Optional Chrome tab ID
 * @returns {Promise<Object>} Object with urlFilters, pageFilters, and merged filters
 */
export async function getAllFilters({ url, pageId, tabId = null }) {
  // Get URL pfilters (synchronous)
  const urlFilters = getUrlPfilters(url);

  // Get page filter card filters (async) - tries client-side state first
  const pageFilters = await getPageFilters(pageId, tabId);

  // Detect if we're on an App Studio page
  const isAppStudio = await isAppStudioPage(tabId);

  // Try App Studio specific filter detection EARLY for App Studio pages
  let appStudioFilters = [];
  if (pageFilters.length === 0 && isAppStudio) {
    appStudioFilters = await getAppStudioFilters(tabId);
  }

  // Try variable controls API for non-App Studio pages (causes 404 spam on App Studio)
  let variableControlFilters = [];
  if (!isAppStudio && pageId) {
    variableControlFilters = await getVariableControlFilters(pageId, tabId);
  }

  // Try AngularJS scope filters (for pages using Angular filter components)
  let angularFilters = [];
  if (
    pageFilters.length === 0 &&
    appStudioFilters.length === 0 &&
    variableControlFilters.length === 0
  ) {
    angularFilters = await getAngularScopeFilters(tabId);
  }

  // If still no filters on non-App Studio pages, try App Studio detection as fallback
  if (
    !isAppStudio &&
    pageFilters.length === 0 &&
    variableControlFilters.length === 0 &&
    angularFilters.length === 0
  ) {
    appStudioFilters = await getAppStudioFilters(tabId);
  }

  // If we still don't have filters, try other approaches
  let iframeFilters = [];
  let frameFilters = [];

  if (
    pageFilters.length === 0 &&
    appStudioFilters.length === 0 &&
    variableControlFilters.length === 0 &&
    angularFilters.length === 0 &&
    urlFilters.length === 0
  ) {
    // Try getting filters from domoFilterService in any frame (embedded apps)
    frameFilters = await getFiltersFromAllFrames(tabId);

    // If still no filters, check iframe src attributes (with delay)
    if (frameFilters.length === 0) {
      iframeFilters = await getIframePfilters(tabId, 100);
    }
  }

  // Merge all sources (URL > frame > iframe > appStudio > angular > variableControl > page)
  const allFilters = mergeFilters(
    pageFilters,
    variableControlFilters,
    angularFilters,
    appStudioFilters,
    iframeFilters,
    frameFilters,
    urlFilters
  );

  if (allFilters.length > 0) {
    console.log(`[MajorDomo] Captured ${allFilters.length} filter(s):`, allFilters.map(f => f.column).join(', '));
  }

  return {
    urlFilters,
    pageFilters,
    variableControlFilters,
    angularFilters,
    appStudioFilters,
    frameFilters,
    iframeFilters,
    allFilters,
    hasFilters: allFilters.length > 0
  };
}
