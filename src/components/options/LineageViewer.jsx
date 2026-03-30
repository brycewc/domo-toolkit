import { Button, Spinner } from '@heroui/react';
import { IconArrowFork, IconDatabase, IconReload } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useGraphVisibility, useLineageCache, useResolveTabId } from '@/hooks';
import { toLineageType, toNodeId } from '@/services';

import { DataPreviewPanel, ETLInspector, PipelineGraph } from '../tracer';

export function LineageViewer() {
  const [params, setParams] = useState(null);
  const [error, setError] = useState(null);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [inspectedDataflow, setInspectedDataflow] = useState(null);
  const [previewDataset, setPreviewDataset] = useState(null);
  const previewHeightRef = useRef(300);
  const previewCacheRef = useRef(new Map());
  const inspectorCacheRef = useRef(new Map());
  const resolveTabId = useResolveTabId(params?.tabId, params?.instance);

  const {
    expandFetch,
    expandLoading,
    graph,
    init,
    isNeighborCached,
    loading,
    prefetch
  } = useLineageCache();

  const rootNodeId = useMemo(
    () =>
      params
        ? toNodeId(toLineageType(params.entityType), params.entityId)
        : null,
    [params]
  );

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
      .get([
        'lineageEntityId',
        'lineageEntityType',
        'lineageInstance',
        'lineageObjectName',
        'lineageTabId'
      ])
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
          setError(
            'No lineage parameters found. Open this from a dataset or dataflow page.'
          );
        }
      });
  }, []);

  useEffect(() => {
    if (!params) return;

    previewHeightRef.current = 300;
    previewCacheRef.current.clear();
    inspectorCacheRef.current.clear();
    init(params.entityType, params.entityId, params.tabId, params.instance).catch((err) => {
      console.error('[LineageViewer] Failed to fetch trace:', err);
      setError(err.message || 'Failed to load pipeline trace');
    });
  }, [params, init]);

  useEffect(() => {
    if (!params) return;
    const label =
      params.objectName || `${params.entityType} ${params.entityId}`;
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
        console.error('[LineageViewer] Failed to refresh:', err);
        setError(err.message || 'Failed to reload pipeline trace');
      });
    }
  }, [params, init, preserveExpansion]);

  const handleRootClick = useCallback(() => {
    if (rootNodeId) {
      setSelectedNodeId(rootNodeId);
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
        <IconArrowFork className='size-5 shrink-0 rotate-180' stroke={1.5} />
      ) : (
        <IconDatabase className='size-5 shrink-0' stroke={1.5} />
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
      <div className='border-divider flex shrink-0 items-center justify-between border-b px-4 py-3'>
        <div className='flex items-center gap-3'>
          {entityIcon}
          <div className='flex flex-col'>
            <h2 className='text-lg font-semibold'>
              {params?.objectName || 'Pipeline Lineage'}
            </h2>
            {params?.entityId && (
              <span className='text-xs text-muted'>
                {params.entityType} &middot; {params.entityId}
              </span>
            )}
          </div>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            isIconOnly
            size='sm'
            variant='tertiary'
            onPress={handleRefresh}
          >
            <IconReload className='size-4' stroke={1.5} />
          </Button>
        </div>
      </div>

      <div className='flex min-h-0 flex-1 overflow-hidden'>
        <div className='flex min-h-0 min-w-0 flex-1 flex-col'>
          {loading ? (
            <div className='flex flex-1 items-center justify-center gap-2'>
              <Spinner size='lg' />
              <span className='text-muted'>Loading pipeline trace...</span>
            </div>
          ) : error ? (
            <div className='flex flex-1 items-center justify-center text-danger'>
              <p>Error: {error}</p>
            </div>
          ) : (
            <PipelineGraph
              error={null}
              expandLoading={expandLoading}
              frontierCounts={frontierCounts}
              highlightedDepth={highlightedDepth}
              instance={params?.instance}
              levelSummary={levelSummary}
              loading={false}
              rootNodeId={rootNodeId}
              selectedNodeId={selectedNodeId}
              trace={visibleTrace}
              onClearHighlight={clearHighlight}
              onCollapseLevel={collapseLevel}
              onCollapseNode={collapseNode}
              onExpandFrontier={handleExpandFrontier}
              onExpandLevel={expandLevel}
              onExpandNode={expandNode}
              onHighlightLevel={highlightLevel}
              onNodeClick={handleNodeClick}
              onRootClick={handleRootClick}
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
          <div className='w-[400px] shrink-0'>
            <ETLInspector
              cacheRef={inspectorCacheRef}
              dataflowId={inspectedDataflow.id}
              instance={params?.instance}
              resolveTabId={resolveTabId}
              onClose={handleCloseInspector}
            />
          </div>
        )}
      </div>
    </div>
  );
}
