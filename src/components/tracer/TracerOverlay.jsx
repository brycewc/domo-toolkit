import { useState, useEffect, useCallback } from 'react';
import { IconX } from '@tabler/icons-react';
import { Button } from '@heroui/react';
import { tracePipeline } from '@/services';
import { PipelineGraph } from './PipelineGraph';
import { ETLInspector } from './ETLInspector';
import { DataPreviewPanel } from './DataPreviewPanel';

/**
 * Full-page overlay for ETL Pipeline Tracer
 * @param {Object} props
 * @param {string} props.entityType - Initial entity type (DATA_SOURCE or DATAFLOW)
 * @param {string} props.entityId - Initial entity ID
 * @param {number} [props.tabId] - Chrome tab ID for executeInPage
 * @param {Function} props.onClose - Close handler
 */
export function TracerOverlay({ entityType, entityId, tabId, onClose }) {
  const [trace, setTrace] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [depth, setDepth] = useState(2);
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [inspectedDataflow, setInspectedDataflow] = useState(null);
  const [previewDataset, setPreviewDataset] = useState(null);

  useEffect(() => {
    async function fetchTrace() {
      setLoading(true);
      setError(null);
      try {
        const result = await tracePipeline(entityType, entityId, depth, tabId);
        setTrace(result);
      } catch (err) {
        console.error('[TracerOverlay] Failed to fetch trace:', err);
        setError(err.message || 'Failed to load pipeline trace');
      } finally {
        setLoading(false);
      }
    }

    fetchTrace();
  }, [entityType, entityId, depth, tabId]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const handleNodeClick = useCallback((clickedEntityType, clickedEntityId, nodeId) => {
    setSelectedNodeId(nodeId);

    if (clickedEntityType === 'DATAFLOW') {
      setInspectedDataflow({ id: clickedEntityId, nodeId });
      setPreviewDataset(null);
    }
    else if (clickedEntityType === 'DATA_SOURCE') {
      const node = trace?.nodes.find((n) => n.id === nodeId);
      setPreviewDataset({
        id: clickedEntityId,
        name: node?.name || `Dataset ${clickedEntityId}`
      });
      setInspectedDataflow(null);
    }
    else {
      setInspectedDataflow(null);
      setPreviewDataset(null);
    }
  }, [trace]);

  const handleCloseInspector = useCallback(() => {
    setInspectedDataflow(null);
    setSelectedNodeId(null);
  }, []);

  const handleClosePreview = useCallback(() => {
    setPreviewDataset(null);
    setSelectedNodeId(null);
  }, []);

  return (
    <div
      className="fixed inset-0 z-[10000] bg-black/50 flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg shadow-2xl w-[95vw] h-[95vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800">
              Pipeline Tracer
            </h2>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <label htmlFor="depth-select" className="font-medium">
                Depth:
              </label>
              <select
                id="depth-select"
                value={depth}
                onChange={(e) => setDepth(Number(e.target.value))}
                className="px-2 py-1 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-300"
              >
                <option value={1}>1 level</option>
                <option value={2}>2 levels</option>
                <option value={3}>3 levels</option>
                <option value={4}>4 levels</option>
                <option value={5}>5 levels</option>
              </select>
            </div>
          </div>
          <Button
            auto
            light
            icon={<IconX className="w-5 h-5" />}
            onClick={onClose}
            aria-label="Close overlay"
          />
        </div>

        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex flex-col">
            <PipelineGraph
              trace={trace}
              loading={loading}
              error={error}
              selectedNodeId={selectedNodeId}
              onNodeClick={handleNodeClick}
              tabId={tabId}
            />
            {previewDataset && (
              <DataPreviewPanel
                datasetId={previewDataset.id}
                datasetName={previewDataset.name}
                tabId={tabId}
                onClose={handleClosePreview}
              />
            )}
          </div>

          {inspectedDataflow && (
            <div className="w-[400px] shrink-0">
              <ETLInspector
                dataflowId={inspectedDataflow.id}
                tabId={tabId}
                onClose={handleCloseInspector}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
