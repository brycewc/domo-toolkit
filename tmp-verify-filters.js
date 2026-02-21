const result = await state.page.evaluate((cardId) => {
  const hasAngular = typeof angular !== 'undefined' && !!document.querySelector('.ng-scope');

  function collectFilterBuilderFilters() {
    if (!hasAngular) return [];
    const scopes = document.querySelectorAll('.ng-scope');
    for (const scopeEl of scopes) {
      const ctrl = angular.element(scopeEl).scope()?.$ctrl;
      if (Array.isArray(ctrl?.currentFilters) && ctrl.onFiltersChanged) return ctrl.currentFilters;
      if (Array.isArray(ctrl?.filters) && ctrl.onUpdateFilters) return ctrl.filters;
    }
    return [];
  }

  function findKpiModel() {
    if (!hasAngular) return null;
    const scopes = document.querySelectorAll('.ng-scope');
    for (const scopeEl of scopes) {
      const model = angular.element(scopeEl).scope()?.$ctrl?.kpiModel;
      if (model && String(model.getKpiURN?.()) === String(cardId)) return model;
    }
    for (const scopeEl of scopes) {
      const model = angular.element(scopeEl).scope()?.$ctrl?.kpiModel;
      if (model) return model;
    }
    return null;
  }

  let exportBody = null;

  try {
    if (hasAngular) {
      const inj = angular.element(document.querySelector('.ng-scope')).injector();
      const svc = inj.get('cdExportService');
      const stateSvc = inj.get('cdExportStateService');
      const chartViewState = stateSvc.getChartViewState();
      const kpiModel = findKpiModel();

      if (kpiModel && chartViewState) {
        const exportReq = svc.createExportRequestFromState(kpiModel, chartViewState);
        const cardExportReq = svc.convertToCardExportRequest(exportReq);
        exportBody = { ...cardExportReq, showAnnotations: cardExportReq.showAnnotations ?? true, type: 'file', fileName: 'test.xlsx', accept: 'test' };
        if (!exportBody.queryOverrides?.filters?.length) {
          const fbFilters = collectFilterBuilderFilters();
          if (fbFilters.length) {
            exportBody.queryOverrides.filters = fbFilters;
            exportBody.queryOverrides.overrideSlicers = true;
          }
        }
      }
    }
  } catch(e) {
    // continue to fallback
  }

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
      fileName: 'test.xlsx',
      accept: 'test'
    };
  }

  return {
    path: exportBody.queryOverrides?.filters?.length ? 'with-filters' : 'no-filters',
    filterCount: exportBody.queryOverrides?.filters?.length || 0,
    filters: exportBody.queryOverrides?.filters,
    overrideSlicers: exportBody.queryOverrides?.overrideSlicers,
  };
}, '61569176');
console.log(JSON.stringify(result, null, 2));
