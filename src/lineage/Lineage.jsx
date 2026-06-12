import { Button, Dropdown, Label, Spinner, Tooltip } from '@heroui/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useResolveTabId } from '@/hooks/useResolveTabId';
import { useStatusBar } from '@/hooks/useStatusBar';
import { exportToCSV, exportToExcel, exportToJson, generateExportFilename } from '@/utils/exportData';
import IconCsv from '@icons/csv.svg?react';
import IconCurlyBrackets from '@icons/curly-brackets.svg?react';
import IconDatabase from '@icons/database.svg?react';
import IconDataflow from '@icons/dataflow.svg?react';
import IconDownload from '@icons/download.svg?react';
import IconExcel from '@icons/excel.svg?react';
import IconInfoCircle from '@icons/info-circle.svg?react';
import IconSync from '@icons/sync.svg?react';

import { DataflowInspector } from './components/DataflowInspector';
import { DataPreviewPanel } from './components/DataPreviewPanel';
import { LevelToolbar } from './components/LevelToolbar';
import { LineageGraph } from './components/LineageGraph';
import { useGraphVisibility } from './hooks/useGraphVisibility';
import { useLineageCache } from './hooks/useLineageCache';
import { toLineageType, toNodeId } from './services/lineage';
import { buildLineageJson, buildLineageRows, LINEAGE_EXPORT_COLUMNS } from './services/lineageExport';

export function Lineage() {
  const [params, setParams] = useState(null);
  const [error, setError] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [inspectedDataflow, setInspectedDataflow] = useState(null);
  const [previewDataset, setPreviewDataset] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportCount, setExportCount] = useState(0);
  const graphInstanceRef = useRef(null);
  const previewHeightRef = useRef(300);
  const previewCacheRef = useRef(new Map());
  const inspectorCacheRef = useRef(new Map());
  const resolveTabId = useResolveTabId(params?.tabId, params?.instance);
  const { showStatus } = useStatusBar();

  const { expandFetch, expandLoading, fetchEntireLineage, graph, init, isNeighborCached, loading, prefetch } =
    useLineageCache();

  const rootNodeId = useMemo(() => (params ? toNodeId(toLineageType(params.entityType), params.entityId) : null), [params]);

  const {
    clearHighlight,
    collapseLevel,
    collapseNode,
    expandLevel,
    expandNode,
    frontierCounts,
    highlightedDepth,
    highlightLevel,
    levelSummary,
    preserveExpansion,
    visibleTrace
  } = useGraphVisibility({
    expandFetch,
    graph,
    isNeighborCached,
    rootNodeId
  });

  useEffect(() => {
    chrome.storage.session
      .get(['lineageEntityId', 'lineageEntityType', 'lineageInstance', 'lineageObjectName', 'lineageTabId'])
      .then((result) => {
        if (result.lineageEntityId && result.lineageEntityType) {
          setParams({
            entityId: result.lineageEntityId,
            entityType: result.lineageEntityType,
            instance: result.lineageInstance,
            objectName: result.lineageObjectName,
            tabId: result.lineageTabId
          });
        } else {
          setError('No lineage parameters found. Open this from a dataset or dataflow page.');
        }
      });
  }, []);

  useEffect(() => {
    if (!params) return;

    previewHeightRef.current = 300;
    previewCacheRef.current.clear();
    inspectorCacheRef.current.clear();
    init(params.entityType, params.entityId, params.tabId, params.instance).catch((err) => {
      console.error('[Lineage] Failed to fetch trace:', err);
      setError(err.message || 'Failed to load pipeline trace');
    });
  }, [params, init]);

  useEffect(() => {
    if (!params) return;
    const label = params.objectName || `${params.entityType} ${params.entityId}`;
    document.title = `Lineage: ${label} - Domo Toolkit`;
  }, [params]);

  const handleNodeClick = useCallback(
    (clickedEntityType, clickedEntityId, nodeId) => {
      setSelectedNodeId(nodeId);

      const needsUpstream = !isNeighborCached(nodeId, 'upstream');
      const needsDownstream = !isNeighborCached(nodeId, 'downstream');
      if (needsUpstream || needsDownstream) {
        prefetch(clickedEntityType, clickedEntityId);
      }

      if (clickedEntityType === 'DATAFLOW') {
        setInspectedDataflow({ id: clickedEntityId, nodeId });
        setPreviewDataset(null);
      } else if (clickedEntityType === 'DATA_SOURCE') {
        const node = visibleTrace?.nodes.find((n) => n.id === nodeId);
        setPreviewDataset({
          id: clickedEntityId,
          name: node?.name || `Dataset ${clickedEntityId}`
        });
        setInspectedDataflow(null);
      } else {
        setInspectedDataflow(null);
        setPreviewDataset(null);
      }
    },
    [visibleTrace, isNeighborCached, prefetch]
  );

  const handleCloseInspector = useCallback(() => {
    setInspectedDataflow(null);
    setSelectedNodeId(null);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDataset(null);
    setSelectedNodeId(null);
  }, []);

  const handleRefresh = useCallback(() => {
    setError(null);
    setSelectedNodeId(null);
    setInspectedDataflow(null);
    setPreviewDataset(null);
    previewCacheRef.current.clear();
    inspectorCacheRef.current.clear();
    if (params) {
      preserveExpansion();
      init(params.entityType, params.entityId, params.tabId, params.instance).catch((err) => {
        console.error('[Lineage] Failed to refresh:', err);
        setError(err.message || 'Failed to reload pipeline trace');
      });
    }
  }, [params, init, preserveExpansion]);

  const handleExport = useCallback(
    async (format) => {
      if (!graph || isExporting) return;
      setIsExporting(true);
      setExportCount(0);
      try {
        const fullGraph = await fetchEntireLineage(setExportCount);
        const rows = buildLineageRows(fullGraph);
        if (rows.length === 0) {
          showStatus('Nothing to export', 'No lineage objects were found', 'warning');
          return;
        }
        const safeName = (params?.objectName || `${params?.entityType}_${params?.entityId}`).replace(/[^\w.-]+/g, '_');
        const filename = generateExportFilename(`lineage_${safeName}`);
        if (format === 'csv') {
          exportToCSV(rows, LINEAGE_EXPORT_COLUMNS, filename);
        } else if (format === 'xlsx') {
          await exportToExcel(rows, LINEAGE_EXPORT_COLUMNS, filename, 'Lineage');
        } else if (format === 'json') {
          exportToJson(buildLineageJson(fullGraph, rootNodeId), filename);
        }
        showStatus('Lineage exported', `Exported **${rows.length}** objects`, 'success');
      } catch (err) {
        console.error('[Lineage] Export failed:', err);
        showStatus('Export failed', err.message || 'Could not export lineage', 'danger');
      } finally {
        setIsExporting(false);
        setExportCount(0);
      }
    },
    [graph, isExporting, fetchEntireLineage, params, rootNodeId, showStatus]
  );

  const handleRootClick = useCallback(() => {
    if (rootNodeId) {
      setSelectedNodeId(rootNodeId);
      graphInstanceRef.current?.fitView({
        maxZoom: 1.5,
        nodes: [{ id: rootNodeId }],
        padding: 0.3
      });
    }
  }, [rootNodeId]);

  const handleExpandFrontier = useCallback(
    (direction) => {
      if (rootNodeId) expandNode(rootNodeId, direction);
    },
    [rootNodeId, expandNode]
  );

  const mappedEntityType = params ? toLineageType(params.entityType) : null;

  const entityIcon = useMemo(
    () =>
      mappedEntityType === 'DATAFLOW' ? (
        <IconDataflow className='size-4 shrink-0' />
      ) : (
        <IconDatabase className='size-4 shrink-0' />
      ),
    [mappedEntityType]
  );

  if (!params && !loading && error) {
    return (
      <div className='flex h-full items-center justify-center text-muted'>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className='flex h-full w-full flex-col'>
      <div className='border-divider flex shrink-0 items-center justify-between border-b bg-surface px-5 py-5'>
        <div className='flex items-center gap-3'>
          <div className='flex flex-col'>
            <h2 className='text-lg font-semibold'>{params?.objectName || 'Pipeline Lineage'}</h2>
            {params?.entityId && (
              <div className='flex items-center gap-1 text-sm text-muted'>
                {entityIcon} &middot; {params.entityType} &middot; {params.entityId}
              </div>
            )}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          {isExporting && <span className='text-xs text-muted'>Crawling lineage... {exportCount} objects</span>}
          <Dropdown>
            <Tooltip>
              <Button
                isIconOnly
                isDisabled={loading || !graph || graph.nodes.length === 0 || isExporting}
                isPending={isExporting}
                size='sm'
                variant='tertiary'
              >
                {({ isPending }) => (isPending ? <Spinner color='currentColor' size='sm' /> : <IconDownload />)}
              </Button>
              <Tooltip.Content className='max-w-60' placement='bottom'>
                Export full lineage
              </Tooltip.Content>
            </Tooltip>
            <Dropdown.Popover>
              <Dropdown.Menu onAction={(key) => handleExport(key)}>
                <Dropdown.Item id='xlsx' textValue='Export as Excel'>
                  <IconExcel className='size-4 shrink-0' />
                  <Label>Export as Excel</Label>
                </Dropdown.Item>
                <Dropdown.Item id='csv' textValue='Export as CSV'>
                  <IconCsv className='size-4 shrink-0' />
                  <Label>Export as CSV</Label>
                </Dropdown.Item>
                <Dropdown.Item id='json' textValue='Export as JSON'>
                  <IconCurlyBrackets className='size-4 shrink-0' />
                  <Label>Export as JSON</Label>
                </Dropdown.Item>
              </Dropdown.Menu>
            </Dropdown.Popover>
          </Dropdown>
          <Tooltip>
            <Button isIconOnly size='sm' variant='tertiary' onPress={handleRefresh}>
              <IconSync />
            </Button>
            <Tooltip.Content className='max-w-60' placement='bottom'>
              Refresh
            </Tooltip.Content>
          </Tooltip>
        </div>
      </div>

      <div className='relative flex min-h-0 flex-1 overflow-hidden'>
        {levelSummary && !loading && !error && (
          <div className='pointer-events-none absolute inset-x-0 top-0 z-10 flex justify-center pt-2'>
            <div className='pointer-events-auto'>
              <LevelToolbar
                downstreamLevels={levelSummary.downstream}
                frontierCounts={frontierCounts}
                upstreamLevels={levelSummary.upstream}
                onClearHighlight={clearHighlight}
                onCollapseLevel={collapseLevel}
                onExpandFrontier={handleExpandFrontier}
                onExpandLevel={expandLevel}
                onHighlightLevel={highlightLevel}
                onRootClick={handleRootClick}
              />
            </div>
          </div>
        )}
        <div className='pointer-events-none absolute inset-x-0 bottom-2 z-10 flex justify-center'>
          <div className='pointer-events-auto flex w-fit items-center justify-around gap-2 rounded-lg border border-border bg-surface/20 px-2 py-1 text-xs backdrop-blur-sm select-none'>
            <div className='items-center' title='legend'>
              <IconInfoCircle className='size-4' />
            </div>
            <div className='flex items-center gap-1.5 rounded bg-success px-2 py-1 text-white'>
              <span>Root</span>
            </div>
            <div className='flex items-center gap-1.5 rounded bg-accent px-2 py-1 text-white'>
              <IconDatabase className='size-4' />
              <span>DataSet</span>
            </div>
            <div className='flex items-center gap-1.5 rounded bg-warning px-2 py-1 text-white'>
              <IconDataflow className='size-4' />
              <span>DataFlow</span>
            </div>
          </div>
        </div>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {loading ? (
            <div className='flex flex-1 items-center justify-center gap-2'>
              <Spinner size='lg' />
              <span className='text-muted'>Loading lineage...</span>
            </div>
          ) : error ? (
            <div className='flex flex-1 items-center justify-center text-danger'>
              <p>Error: {error}</p>
            </div>
          ) : (
            <LineageGraph
              error={null}
              expandLoading={expandLoading}
              highlightedDepth={highlightedDepth}
              instanceRef={graphInstanceRef}
              loading={false}
              rootNodeId={rootNodeId}
              selectedNodeId={selectedNodeId}
              trace={visibleTrace}
              onCollapseNode={collapseNode}
              onExpandNode={expandNode}
              onNodeClick={handleNodeClick}
            />
          )}
          {previewDataset && (
            <DataPreviewPanel
              cacheRef={previewCacheRef}
              datasetId={previewDataset.id}
              datasetName={previewDataset.name}
              heightRef={previewHeightRef}
              key={previewDataset.id}
              resolveTabId={resolveTabId}
              onClose={handleClosePreview}
            />
          )}
        </div>

        {inspectedDataflow && (
          <div className='h-full w-100 shrink-0'>
            <DataflowInspector
              cacheRef={inspectorCacheRef}
              dataflowId={inspectedDataflow.id}
              resolveTabId={resolveTabId}
              onClose={handleCloseInspector}
            />
          </div>
        )}
      </div>
    </div>
  );
}
