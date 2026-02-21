import { executeInPage } from '@/utils';

const EXPORT_FORMATS = {
  excel: {
    extension: 'xlsx',
    accept:
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  },
  csv: {
    extension: 'csv',
    accept: 'text/csv'
  },
  powerpoint: {
    extension: 'pptx',
    accept:
      'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  }
};

/**
 * Export a card as a file download, using the card's current view state
 * (applied filters, date range, chart overrides, etc.).
 *
 * Runs in the page context so it can access Domo's Angular services
 * (cdExportService / cdExportStateService) that hold the live card state.
 *
 * @param {Object} params
 * @param {string|number} params.cardId - Card URN / ID
 * @param {string} [params.cardTitle] - Card title for the filename
 * @param {'excel'|'csv'|'powerpoint'} [params.format='excel'] - Export format
 * @param {number|null} [params.tabId=null] - Target tab
 * @returns {Promise<{ success: boolean, fileName: string }>}
 */
export async function exportCard({
  cardId,
  cardTitle,
  format = 'excel',
  tabId = null
}) {
  const fmt = EXPORT_FORMATS[format];
  if (!fmt) throw new Error(`Unsupported export format: ${format}`);

  const fileName = `${cardTitle || 'export'}.${fmt.extension}`;

  return executeInPage(
    async (cardId, fileName, accept) => {
      let exportBody = null;
      const hasAngular =
        typeof angular !== 'undefined' &&
        !!document.querySelector('.ng-scope');

      // ── Helper: collect page/card filters from the filter builder ──
      function collectFilterBuilderFilters() {
        if (!hasAngular) return [];
        let raw = [];
        const scopes = document.querySelectorAll('.ng-scope');
        for (const scopeEl of scopes) {
          const ctrl = angular.element(scopeEl).scope()?.$ctrl;
          if (Array.isArray(ctrl?.currentFilters) && ctrl.onFiltersChanged) {
            raw = ctrl.currentFilters;
            break;
          }
          if (Array.isArray(ctrl?.filters) && ctrl.onUpdateFilters) {
            raw = ctrl.filters;
            break;
          }
        }
        if (!raw.length) return [];
        // Deduplicate by column + operand + sorted values
        const seen = new Set();
        return raw.filter((f) => {
          const key = `${f.column}|${f.operand}|${[...(f.values || [])].sort().join(',')}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // ── Helper: find kpiModel from Angular scopes ──
      function findKpiModel() {
        if (!hasAngular) return null;
        const scopes = document.querySelectorAll('.ng-scope');
        for (const scopeEl of scopes) {
          const model = angular.element(scopeEl).scope()?.$ctrl?.kpiModel;
          if (model && String(model.getKpiURN?.()) === String(cardId)) {
            return model;
          }
        }
        for (const scopeEl of scopes) {
          const model = angular.element(scopeEl).scope()?.$ctrl?.kpiModel;
          if (model) return model;
        }
        return null;
      }

      // ── 1. Try the full Angular services path ──
      try {
        if (hasAngular) {
          const inj = angular
            .element(document.querySelector('.ng-scope'))
            .injector();
          const svc = inj.get('cdExportService');
          const stateSvc = inj.get('cdExportStateService');
          const chartViewState = stateSvc.getChartViewState();
          const kpiModel = findKpiModel();

          if (kpiModel && chartViewState) {
            const exportReq = svc.createExportRequestFromState(
              kpiModel,
              chartViewState
            );
            const cardExportReq =
              svc.convertToCardExportRequest(exportReq);

            exportBody = {
              ...cardExportReq,
              showAnnotations: cardExportReq.showAnnotations ?? true,
              type: 'file',
              fileName,
              accept
            };

            // If the services path returned empty filters, supplement
            // with filter builder filters (page-level slicers, etc.)
            if (
              !exportBody.queryOverrides?.filters?.length
            ) {
              const fbFilters = collectFilterBuilderFilters();
              if (fbFilters.length) {
                exportBody.queryOverrides.filters = fbFilters;
                exportBody.queryOverrides.overrideSlicers = true;
              }
            }
          }
        }
      } catch {
        // Angular services unavailable or incompatible card – continue
      }

      // ── 2. Fallback: build request manually with filter discovery ──
      if (!exportBody) {
        const filters = collectFilterBuilderFilters();

        exportBody = {
          queryOverrides: {
            filters,
            overrideDateRange: false,
            overrideSlicers: filters.length > 0,
            dataControlContext: { filterGroupIds: [] },
            segments: []
          },
          chartState: {},
          watermark: true,
          mobile: false,
          showAnnotations: true,
          type: 'file',
          fileName,
          accept
        };
      }

      // ── 3. POST to the export endpoint ──
      const url = `/api/content/v1/cards/${cardId}/export`;
      const body =
        'request=' + encodeURIComponent(JSON.stringify(exportBody));

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
      });

      if (!response.ok) {
        throw new Error(`Export failed – HTTP ${response.status}`);
      }

      // ── 4. Trigger browser download ──
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(blobUrl);

      return { success: true, fileName };
    },
    [String(cardId), fileName, fmt.accept],
    tabId
  );
}
